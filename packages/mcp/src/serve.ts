// How a tool is served (`mcp-server`, "Results and errors"; `mcp-local-server`): ONE wrapper around
// every tool of either server, so that each one has its arguments read and its refusal answered the
// same way, and its call logged with its name, its duration and its error code only. What differs
// between the servers comes in as hooks: the Worker counts each call and checks its scope before the
// arguments are read, and turns its own errors into refusals; the local server checks every result
// against the tool's output schema.
//
// The arguments are checked by the tool's schema here rather than by the SDK: the SDK answers a
// call its schema refuses with an error result that is a sentence, and the service's refusals are
// `{ code, message, … }` with a stable code. The schema the client is shown in `tools/list` is the
// same one, so nothing a client reads differs from what is enforced.

import {
  McpServer,
  type CallToolResult,
  type ContentBlock,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import type * as z from "zod";

/** The scopes of the endpoint: what kinds of tool a token may call. */
export const SCOPES = ["projects:read", "projects:write", "sharing", "live", "publish"] as const;

export type Scope = (typeof SCOPES)[number];

/** A tool as both servers list it: its name and words, its scope, its schemas and its hints. */
export interface ToolDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly scope: Scope;
  readonly input: I;
  readonly output: O;
  readonly annotations: Omit<ToolAnnotations, "title">;
  /** A preview is also counted in the previews' window of the endpoint. */
  readonly preview?: boolean;
}

/** Declares a tool; the types of its handlers follow its schemas. */
export function define<I extends z.ZodType, O extends z.ZodType>(
  definition: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return definition;
}

/** What a tool answers: its structured result, and the content items that go before its JSON. */
export interface ToolAnswer<T> {
  readonly structured: T;
  readonly content?: readonly ContentBlock[];
}

/** What answers a tool's calls, typed by its definition. */
export type Handler<D extends ToolDefinition> = (
  args: z.output<D["input"]>,
) => Promise<ToolAnswer<z.output<D["output"]>>>;

/** Any handler, for a table of them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a table holds handlers of every shape.
export type AnyHandler = Handler<any>;

/** Handlers for a set of definitions keyed by name, every one present. */
export type HandlersOf<T extends Readonly<Record<string, ToolDefinition>>> = {
  readonly [K in keyof T]: Handler<T[K]>;
};

/**
 * A refusal: the stable code, a sentence and what else the agent is told (the current revision, the
 * diagnostics, the limit). Thrown by a handler or a hook, it is answered as an `isError` result.
 */
export class Refusal extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

/** The sentence of an unexpected failure, the service's own. */
export const INTERNAL_MESSAGE = "Something went wrong.";

/**
 * A refusal as a tool result: `isError`, and `{ code, message, … }` as structured content and as
 * text. `project.not-found` says nothing more, whatever the refusal carried.
 */
export function errorResult(refusal: {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}): CallToolResult {
  const body: Record<string, unknown> =
    refusal.code === "project.not-found"
      ? { code: refusal.code, message: refusal.message }
      : { ...refusal.details, code: refusal.code, message: refusal.message };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

/** What the lenient schema hands the wrapper: the checked arguments, or why they are not. */
type Checked<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: string };

/** The reasons of a schema's refusal: the fields and what was expected, never a value. */
function reasons(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
}

/**
 * The tool's schema for the SDK: its JSON Schema is the tool's own, and its validation never fails,
 * handing the outcome to the wrapper, which refuses arguments of another shape as `request.invalid`.
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
        return { value: { ok: false, why: reasons(parsed.error) } };
      },
      jsonSchema: standard.jsonSchema,
    },
  } as StandardSchemaWithJSON<z.input<T>, Checked<z.output<T>>>;
}

/** What each server adds to the wrapper. */
export interface ServeHooks {
  /** Before the arguments are read: the endpoint counts the call and checks the scope. */
  readonly beforeCheck?: (definition: ToolDefinition) => Promise<void> | void;
  /** After the arguments are read, before the handler: the endpoint counts a preview. */
  readonly beforeRun?: (definition: ToolDefinition) => Promise<void> | void;
  /** Turns a server's own error into a refusal; undefined for an unexpected one. */
  readonly refusal?: (error: unknown) => Refusal | undefined;
  /** Where the call's line goes; `console.log` by default. */
  readonly log?: (line: string) => void;
  /** What an unexpected failure leaves; its message on `console.error` by default. */
  readonly unexpected?: (error: unknown) => void;
  /** Checks every result against the tool's output schema: one that does not fit is `internal`. */
  readonly checkOutput?: boolean;
}

function defaultUnexpected(error: unknown): void {
  // The message of an error never holds a secret or a person's data: log it and say nothing more.
  console.error("mcp: unexpected error:", error instanceof Error ? error.message : "unknown");
}

/** Runs a call of a tool, as every call runs: its arguments read, refused or answered, logged. */
async function call(
  definition: ToolDefinition,
  handler: AnyHandler,
  checked: Checked<unknown>,
  hooks: ServeHooks,
): Promise<CallToolResult> {
  const started = Date.now();
  let code = "ok";
  try {
    await hooks.beforeCheck?.(definition);
    if (!checked.ok) {
      throw new Refusal(
        "request.invalid",
        `The arguments of ${definition.name} do not fit its schema: ${checked.why}.`,
      );
    }
    await hooks.beforeRun?.(definition);
    const answer = await handler(checked.value);
    let structured = answer.structured as Record<string, unknown>;
    if (hooks.checkOutput) {
      const parsed = definition.output.safeParse(structured);
      if (!parsed.success) {
        throw new Error(
          `${definition.name} answered a result its schema refuses: ${reasons(parsed.error)}`,
        );
      }
      structured = parsed.data as Record<string, unknown>;
    }
    return {
      content: [...(answer.content ?? []), { type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  } catch (error) {
    const refusal = error instanceof Refusal ? error : hooks.refusal?.(error);
    if (refusal) {
      code = refusal.code;
      return errorResult(refusal);
    }
    code = "internal";
    (hooks.unexpected ?? defaultUnexpected)(error);
    return errorResult({ code: "internal", message: INTERNAL_MESSAGE });
  } finally {
    // What a call leaves in the log: the tool, how long it took and how it ended. Never its arguments.
    (hooks.log ?? console.log)(`mcp: ${definition.name} ${Date.now() - started} ms ${code}`);
  }
}

/** Registers every tool of `catalogue` on `server`, each answered by its handler. */
export function registerTools(
  server: McpServer,
  catalogue: readonly ToolDefinition[],
  handlers: Readonly<Record<string, AnyHandler>>,
  hooks: ServeHooks = {},
): void {
  for (const definition of catalogue) {
    const handler = handlers[definition.name];
    if (!handler) throw new Error(`the tool ${definition.name} has no handler`);
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: lenient(definition.input),
        outputSchema: definition.output,
        annotations: { title: definition.title, ...definition.annotations },
      },
      (checked: Checked<unknown>) => call(definition, handler, checked, hooks),
    );
  }
}

/** The server's name, title and version in `initialize`. */
export interface ServerInfo {
  readonly name: string;
  readonly title: string;
  readonly version: string;
}

/** A server with every tool of `catalogue`, as each request of either server gets one. */
export function buildServer(
  info: ServerInfo,
  instructions: string,
  catalogue: readonly ToolDefinition[],
  handlers: Readonly<Record<string, AnyHandler>>,
  hooks: ServeHooks = {},
): McpServer {
  const server = new McpServer(info, { instructions });
  registerTools(server, catalogue, handlers, hooks);
  return server;
}
