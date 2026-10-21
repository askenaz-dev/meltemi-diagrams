/**
 * The failures of the cloud commands (`cli-cloud`): one typed error for the service's answers, for
 * what the command line refuses before it asks, and for the credentials file. The `code` is the
 * stable name (the service's own for an answer, `cloud.*`, `credentials.*` and `login.*` for the
 * command line's); the `message` is English, never holds a token, and is what an unknown code is
 * printed with. `describeCloudError` (`cloud-command.ts`) turns the known codes into the
 * interface language.
 */

/** Exit codes of the cloud commands: 0 done, 1 failed, 2 usage error, 3 sign in. */
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
/** Not signed in, or the service refused the token: run `mdg login`. */
export const EXIT_AUTH = 3;

/** Codes that mean the person has to sign in: the service's two and the command line's own. */
const AUTH_CODES: ReadonlySet<string> = new Set([
  "token.invalid",
  "auth.required",
  "cloud.not-signed-in",
]);

export interface CloudErrorOptions {
  /** The HTTP status of the service's answer; 0 when there was none or the refusal is local. */
  readonly status?: number;
  /** What the code carries: the room's `revision` of a `revision.mismatch`, a host, a path. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Seconds the service asked to wait (`Retry-After`). */
  readonly retryAfter?: number;
  /** Overrides the exit code the code implies (3 for the sign-in codes, else 1). */
  readonly exitCode?: number;
}

export class CloudError extends Error {
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryAfter: number | undefined;
  readonly exitCode: number;

  constructor(
    readonly code: string,
    message: string,
    options: CloudErrorOptions = {},
  ) {
    super(message);
    this.name = "CloudError";
    this.status = options.status ?? 0;
    this.details = options.details ?? {};
    this.retryAfter = options.retryAfter;
    this.exitCode = options.exitCode ?? (AUTH_CODES.has(code) ? EXIT_AUTH : EXIT_FAILED);
  }

  /** The room's revision a `revision.mismatch` carries, when it is a number. */
  get revision(): number | undefined {
    const revision = this.details["revision"];
    return typeof revision === "number" ? revision : undefined;
  }
}

/** Whether an error is a `CloudError`, with the code given when there is one. */
export function isCloudError(error: unknown, code?: string): error is CloudError {
  return error instanceof CloudError && (code === undefined || error.code === code);
}
