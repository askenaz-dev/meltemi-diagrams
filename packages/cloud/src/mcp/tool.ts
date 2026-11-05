// How a tool of the MCP endpoint is answered (`mcp-server`, "Results and errors" and "Limits of the
// endpoint"). The definitions (names, words, schemas, hints) and the wrapper every call goes through
// are `@meltemi/diagrams-mcp`'s, shared with the command line's local server; the endpoint adds what
// is its own as the wrapper's hooks: each call is counted in the account's window and has its scope
// checked before its arguments are read, a preview is counted in the previews' window, and the
// Worker's errors (`ApiError`, and a refusal an idempotency key kept) become refusals with their
// codes, a quota naming its limit.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import {
  Refusal,
  type ServeHooks,
  type ToolAnswer,
  type ToolDefinition,
} from "@meltemi/diagrams-mcp";
import type * as z from "zod";
import type { OpCtx } from "../context.js";
import { ApiError, fail, type ErrorCode } from "../errors.js";
import { MAX_MEMBERS } from "../store/types.js";
import { requireScope, type Caller } from "./caller.js";

/** Calls an account may make in a minute (`tools/call`), before `rate.limited`. */
export const CALLS_PER_MINUTE = 300;
/** Previews an account may ask for in a minute, before `rate.limited`. */
export const PREVIEWS_PER_MINUTE = 30;

/** What every tool is given: the operation's context (with the caller's principal) and the caller. */
export interface McpSession {
  readonly op: OpCtx;
  readonly caller: Caller;
}

/** A tool of the catalogue and how the Worker answers it. */
export interface Implementation<D extends ToolDefinition = ToolDefinition> {
  readonly definition: D;
  run(session: McpSession, args: z.output<D["input"]>): Promise<ToolAnswer<z.output<D["output"]>>>;
}

/** Any implementation, for the catalogue. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the catalogue holds tools of every shape.
export type AnyImplementation = Implementation<any>;

/** Attaches the Worker's answer to a tool's definition; the types of `run` follow its schemas. */
export function implement<D extends ToolDefinition>(
  definition: D,
  run: Implementation<D>["run"],
): Implementation<D> {
  return { definition, run };
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

/** A Worker's error as a refusal: its code, its sentence and its details, a quota with its limit. */
export function refusalOf(error: ApiError): Refusal {
  const limit = QUOTA_LIMITS[error.code];
  return new Refusal(error.code, error.message, {
    ...error.details,
    ...(limit !== undefined ? { limit } : {}),
  });
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

/** A refusal kept by an idempotency key and answered again, from its JSON body. */
export function keptRefusal(body: unknown): Refusal {
  const kept = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const code = typeof kept["code"] === "string" ? kept["code"] : "internal";
  const message = typeof kept["message"] === "string" ? kept["message"] : "Something went wrong.";
  const { code: _code, message: _message, ...details } = kept;
  // The body was written from one of the service's own errors (`idempotency.ts`): its code is one.
  return refusalOf(new ApiError(code as ErrorCode, message, details));
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

/** The wrapper's hooks for one request's caller. */
export function endpointHooks(session: McpSession): ServeHooks {
  return {
    beforeCheck: async (definition) => {
      await count(session, "call", CALLS_PER_MINUTE);
      requireScope(session.caller, definition.scope);
    },
    beforeRun: async (definition) => {
      if (definition.preview) await count(session, "preview", PREVIEWS_PER_MINUTE);
    },
    refusal: (error) => {
      if (error instanceof KeptRefusal) return keptRefusal(error.body);
      if (error instanceof ApiError) return refusalOf(error);
      return undefined;
    },
  };
}
