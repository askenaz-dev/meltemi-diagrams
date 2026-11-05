// How a tool of the MCP endpoint is made (`mcp-server`, "Results and errors" and "Limits of the
// endpoint"): ONE wrapper around every tool, so that each one is counted, has its scope checked, its
// arguments read and its refusal answered the same way, and its call logged with its name, its
// duration and its error code only.
//
// The arguments are checked by the tool's schema here rather than by the SDK: the SDK answers a
// call its schema refuses with an error result that is a sentence, and the service's refusals are
// `{ code, message, … }` with a stable code. The schema the client is shown in `tools/list` is the
// same one, so nothing a client reads differs from what is enforced.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type {
  CallToolResult,
  ContentBlock,
  McpServer,
  StandardSchemaWithJSON,
  ToolAnnotations,
} from "@modelcontextprotocol/server";
import type * as z from "zod";
import type { OpCtx } from "../context.js";
import { ApiError, fail, type ErrorCode } from "../errors.js";
import { MAX_MEMBERS } from "../store/types.js";
import { requireScope, type Caller, type Scope } from "./caller.js";

/** Calls an account may make in a minute (`tools/call`), before `rate.limited`. */
export const CALLS_PER_MINUTE = 300;
/** Previews an account may ask for in a minute, before `rate.limited`. */
export const PREVIEWS_PER_MINUTE = 30;

/** What every tool is given: the operation's context (with the caller's principal) and the caller. */
export interface McpSession {
  readonly op: OpCtx;
  readonly caller: Caller;
}

/** What a tool answers: its structured result, and the content items that go before its JSON. */
export interface ToolAnswer<T> {
  readonly structured: T;
  readonly content?: readonly ContentBlock[];
}

/** A tool: its name and words, its scope, its schemas, its hints and what it does. */
export interface ToolSpec<I extends z.ZodType, O extends z.ZodType> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly scope: Scope;
  readonly input: I;
  readonly output: O;
  readonly annotations: Omit<ToolAnnotations, "title">;
  /** A preview is also counted in the previews' window. */
  readonly preview?: boolean;
  run(session: McpSession, args: z.output<I>): Promise<ToolAnswer<z.output<O>>>;
}

/** Any tool, for the catalogue. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the catalogue holds tools of every shape.
export type AnyTool = ToolSpec<any, any>;

/** Declares a tool; the types of `run` follow its schemas. */
export function tool<I extends z.ZodType, O extends z.ZodType>(
  spec: ToolSpec<I, O>,
): ToolSpec<I, O> {
  return spec;
}

/** What the lenient schema hands the tool: the checked arguments, or why they are not. */
type Checked<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: string };

/**
 * The tool's schema for the SDK: its JSON Schema is the tool's own, and its validation never fails,
 * handing the outcome to the wrapper, which refuses arguments of another shape as `request.invalid`.
 * The reasons name the fields and what was expected, never a value.
 */
function lenient<T extends z.ZodType>(
  schema: T,
): StandardSchemaWithJSON<z.input<T>, Checked<z.output<T>>> {
  const standard = schema["~standard"] as unknown as StandardSchemaWithJSON["~standard"];
  return {
    "~standard": {
      version: 1,
      vendor: "meltemi",
      validate: (value: unknown) => {
        const parsed = schema.safeParse(value ?? {});
        if (parsed.success) return { value: { ok: true, value: parsed.data } };
        const why = parsed.error.issues
          .slice(0, 5)
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
          )
          .join("; ");
        return { value: { ok: false, why } };
      },
      jsonSchema: standard.jsonSchema,
    },
  } as StandardSchemaWithJSON<z.input<T>, Checked<z.output<T>>>;
}

/** The limit a quota names, so that an agent can tell the person what the bound is. */
const QUOTA_LIMITS: Partial<Record<ErrorCode, number>> = {
  "quota.projects": CLOUD_LIMITS.projects,
  "quota.files": CLOUD_LIMITS.files,
  "quota.storage": CLOUD_LIMITS.storageBytes,
  "quota.binary": CLOUD_LIMITS.binaryBytes,
  "quota.versions": CLOUD_LIMITS.versions,
  "quota.members": MAX_MEMBERS,
};

/**
 * A refusal as a tool result: `isError`, and `{ code, message, … }` as structured content and as
 * text. `project.not-found` says nothing more, whatever the error carried; a quota names its limit.
 */
export function errorResult(error: ApiError): CallToolResult {
  const body: Record<string, unknown> =
    error.code === "project.not-found"
      ? { code: error.code, message: error.message }
      : {
          ...error.details,
          ...(QUOTA_LIMITS[error.code] !== undefined ? { limit: QUOTA_LIMITS[error.code] } : {}),
          code: error.code,
          message: error.message,
        };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

/** A refusal kept by an idempotency key and answered again: its status and its JSON body. */
export function keptRefusal(body: unknown): CallToolResult {
  const kept = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const code = typeof kept["code"] === "string" ? kept["code"] : "internal";
  const message = typeof kept["message"] === "string" ? kept["message"] : "Something went wrong.";
  const { code: _code, message: _message, ...details } = kept;
  // The body was written from one of the service's own errors (`idempotency.ts`): its code is one.
  return errorResult(new ApiError(code as ErrorCode, message, details));
}

/**
 * Counts one call of `kind` in the account's window of this minute, and refuses the one over
 * `limit`: `rate.limited` with the seconds until the next minute (`retryAfter`).
 */
async function count(session: McpSession, kind: "call" | "preview", limit: number): Promise<void> {
  const { deps } = session.op;
  const at = deps.now();
  const calls = await deps.store.countCall(
    session.caller.principal.sub,
    kind,
    at.toISOString().slice(0, 16),
  );
  if (calls > limit) {
    const retryAfter = Math.max(1, 60 - at.getUTCSeconds());
    throw fail(
      "rate.limited",
      kind === "preview"
        ? `An account asks for at most ${PREVIEWS_PER_MINUTE} previews a minute; wait a little.`
        : `An account makes at most ${CALLS_PER_MINUTE} calls a minute; wait a little.`,
      { retryAfter },
    );
  }
}

/** Runs a call of a tool, as every call runs: counted, its scope checked, its arguments read, logged. */
async function call<I extends z.ZodType, O extends z.ZodType>(
  session: McpSession,
  spec: ToolSpec<I, O>,
  checked: Checked<z.output<I>>,
): Promise<CallToolResult> {
  const started = Date.now();
  let code = "ok";
  try {
    await count(session, "call", CALLS_PER_MINUTE);
    requireScope(session.caller, spec.scope);
    if (!checked.ok) {
      throw fail(
        "request.invalid",
        `The arguments of ${spec.name} do not fit its schema: ${checked.why}.`,
      );
    }
    if (spec.preview) await count(session, "preview", PREVIEWS_PER_MINUTE);
    const answer = await spec.run(session, checked.value);
    const structured = answer.structured as Record<string, unknown>;
    return {
      content: [...(answer.content ?? []), { type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  } catch (error) {
    if (error instanceof KeptRefusal) {
      code = error.code;
      return keptRefusal(error.body);
    }
    if (error instanceof ApiError) {
      code = error.code;
      return errorResult(error);
    }
    code = "internal";
    // The message of an error never holds a secret or a person's data: log it and say nothing more.
    console.error("mcp: unexpected error:", error instanceof Error ? error.message : "unknown");
    return errorResult(fail("internal"));
  } finally {
    // What a call leaves in the log: the tool, how long it took and how it ended. Never its arguments.
    console.log(`mcp: ${spec.name} ${Date.now() - started} ms ${code}`);
  }
}

/**
 * A refusal an idempotency key kept, thrown by a tool so that the wrapper answers it as it was
 * answered the first time.
 */
export class KeptRefusal extends Error {
  constructor(
    readonly code: string,
    readonly body: unknown,
  ) {
    super(code);
  }
}

/** Registers a tool on a server, for one request's caller. */
export function register(server: McpServer, session: McpSession, spec: AnyTool): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: lenient(spec.input),
      outputSchema: spec.output,
      annotations: { title: spec.title, ...spec.annotations },
    },
    (checked: Checked<unknown>) => call(session, spec, checked),
  );
}
