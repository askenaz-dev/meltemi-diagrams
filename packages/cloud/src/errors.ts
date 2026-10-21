/**
 * The stable codes of the service's errors and the status each answers with. `docs/cloud.md`
 * lists them; a new code is added here first.
 */
export const ERROR_STATUS = {
  /** An unknown route. */
  "not-found": 404,
  "project.not-found": 404,
  /** A body that is not what the route reads. */
  "request.invalid": 400,
  "auth.required": 401,
  "token.invalid": 401,
  "signature.invalid": 401,
  /** A cookie-authenticated change from a page that is not this service's. */
  "request.forbidden": 403,
  "quota.tokens": 413,
  "cli.invalid": 400,
  "cli.rate": 429,
  /** A path that breaks the path rule (`cleanPath` of `@meltemi/diagrams-project`). */
  "path.invalid": 400,
  /** A binary hash the project never uploaded (`project_blobs`). */
  "blob.unknown": 400,
  /** A document change of a shape the room does not keep. */
  "doc.invalid": 400,
  /** A document, or a text file of it, over its limit. */
  "doc.too-large": 413,
  /** More files than a project may hold. */
  "quota.files": 413,
  /** The account already holds as many projects as it may (`CLOUD_LIMITS.projects`). */
  "quota.projects": 413,
  /** A write that would take the account over `CLOUD_LIMITS.storageBytes`. */
  "quota.storage": 413,
  /** An image or a font over `CLOUD_LIMITS.binaryBytes`. */
  "quota.binary": 413,
  /** An upload that is not a PNG, JPEG, GIF, WebP, SVG, woff2, ttf or otf, whatever its `Content-Type` says. */
  "binary.invalid": 400,
  /** A project that already holds `CLOUD_LIMITS.versions` versions, after the policy has thinned what it may. */
  "quota.versions": 413,
  /** More than `CLOUD_LIMITS.versionsPerMinute` versions made for one project within a minute. */
  "versions.rate": 429,
  /** A version number the project does not hold (never made, or thinned). */
  "version.not-found": 404,
  /** A thumbnail over `CLOUD_LIMITS.thumbnailBytes`. */
  "thumbnail.too-large": 413,
  /** A thumbnail that is not `image/svg+xml`, or whose body is not a well-formed SVG. */
  "thumbnail.invalid": 400,
  /** A second thumbnail for one project within `CLOUD_LIMITS.thumbnailSeconds`. */
  "thumbnail.rate": 429,
  /** A push whose `ifRevision` is not the room's current revision; the body carries `revision`. */
  "revision.mismatch": 409,
  /** A change by someone who may only read the project, or sharing and publishing by someone who is not its owner. */
  "access.denied": 403,
  /** An invitation link that is unknown, already used or older than thirty days. */
  "invite.invalid": 404,
  /** A project that already holds `MAX_MEMBERS` members and pending invitations together. */
  "quota.members": 413,
  /** A handle that is not `[a-z0-9-]{3,30}`. */
  "handle.invalid": 400,
  /** A handle another account holds. */
  "handle.taken": 409,
  /** A change of handle while a publication is addressed by the current one. */
  "handle.locked": 409,
  /** A publication by a person who has not chosen a handle yet. */
  "handle.required": 409,
  /** A slug that is not `[a-z0-9-]{1,60}`, or an `html` that is not text. */
  "publish.invalid": 400,
  /** HTML over `CLOUD_LIMITS.publishBytes`. */
  "publish.too-large": 413,
  /** More than `CLOUD_LIMITS.publishesPerHour` publish requests for one project within the hour. */
  "publish.rate": 429,
  /** A slug under the person's handle that another of their projects publishes. */
  "publish.taken": 409,
  /** A room message over `CLOUD_LIMITS.message`. */
  "message.too-large": 413,
  /** The room already holds `CLOUD_LIMITS.clients` clients. */
  "room.full": 409,
  /** A client sent more than 100 awareness messages in a second (`4429` on the socket). */
  "awareness.rate": 429,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * An error a route throws on purpose: it is answered as JSON with its code and status. `details`
 * are extra fields of the JSON body that are the caller's to act on and never a secret (a stale
 * push is answered with the room's current `revision`).
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
}

const MESSAGES: Record<ErrorCode, string> = {
  "not-found": "There is nothing at this address.",
  "project.not-found": "There is no such project.",
  "request.invalid": "The request cannot be used.",
  "auth.required": "Sign in to do this.",
  "token.invalid": "The token is not valid.",
  "signature.invalid": "The signature is not valid.",
  "request.forbidden": "This request did not come from a page of this service.",
  "quota.tokens": "There are already 20 API tokens; revoke one first.",
  "cli.invalid": "The request cannot be used.",
  "cli.rate": "Too many attempts; wait a minute.",
  "path.invalid": "A file path is not valid.",
  "blob.unknown": "The project holds no image or font with that hash.",
  "doc.invalid": "The change is not one the project can keep.",
  "doc.too-large": "The project, or one of its files, is over the size limit.",
  "quota.files": "The project already holds as many files as it may.",
  "quota.projects": "There are already as many projects as an account may hold; delete one first.",
  "quota.storage": "This would take the account over its storage limit.",
  "quota.binary": "The image or font is over the size limit.",
  "binary.invalid": "The file is not a PNG, JPEG, GIF, WebP, SVG, woff2, ttf or otf image or font.",
  "quota.versions": "The project already holds as many versions as it may.",
  "versions.rate": "Too many versions in a minute; wait a little.",
  "version.not-found": "There is no such version.",
  "thumbnail.too-large": "The thumbnail is over the size limit.",
  "thumbnail.invalid": "The thumbnail is not an SVG image.",
  "thumbnail.rate": "A thumbnail was saved for this project a moment ago; wait a little.",
  "revision.mismatch": "The project changed since that revision.",
  "access.denied": "You may only read this project.",
  "invite.invalid": "The invitation is not valid: it does not exist, was used or has expired.",
  "quota.members": "The project already has as many members and invitations as it may.",
  "handle.invalid": "A handle has 3 to 30 lowercase letters, digits or hyphens.",
  "handle.taken": "Another account already has that handle.",
  "handle.locked": "The handle cannot change while a publication is addressed by it.",
  "handle.required": "Choose a handle before publishing.",
  "publish.invalid":
    "A publication needs a slug of 1 to 60 lowercase letters, digits or hyphens, and HTML.",
  "publish.too-large": "The page is over the size limit.",
  "publish.rate": "Too many publications for this project in an hour; wait a little.",
  "publish.taken": "Another of your projects already publishes under that name.",
  "message.too-large": "The message is over the size limit.",
  "room.full": "The project is open on as many devices as it may be.",
  "awareness.rate": "Too many presence updates in a second.",
  internal: "Something went wrong.",
};

/** An `ApiError` with the code's standard message, or a message of its own. */
export function fail(
  code: ErrorCode,
  message?: string,
  details?: Readonly<Record<string, unknown>>,
): ApiError {
  return new ApiError(code, message ?? MESSAGES[code], details);
}

/** The JSON answer of an error. The message carries no token, cookie, secret or stack. */
export function errorResponse(error: ApiError): Response {
  const body = { ...error.details, code: error.code, message: error.message };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
