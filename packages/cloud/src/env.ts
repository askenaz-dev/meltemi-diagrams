import type { RoomNamespaceLike } from "./room-client.js";

/**
 * The minimal D1 surface the service uses. A D1 binding satisfies it, and so does the
 * `node:sqlite` adapter of the tests, so the same SQL runs in both.
 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  /** What D1 answers for a write: `meta.changes` is the number of rows the statement changed. */
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
  /** Runs the statements in order in one transaction. */
  batch(statements: D1PreparedLike[]): Promise<unknown[]>;
}

/** What the service reads of an R2 object it fetched (`size`, and the bytes as a stream). */
export interface R2ObjectLike {
  readonly size: number;
  /** When the object was last written: a put of the same key again renews it. */
  readonly uploaded?: Date;
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  /** The bytes, streamed: a download is never held whole in the Worker. */
  readonly body: ReadableStream<Uint8Array>;
}

/** An object of a listing: its key and when it was written. */
export interface R2ListedLike {
  readonly key: string;
  readonly uploaded: Date;
}

/** A page of a listing, in key order; `cursor` names the next page when `truncated`. */
export interface R2ListPageLike {
  readonly objects: readonly R2ListedLike[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

/**
 * The minimal R2 surface the service uses (`blobs/<sha-256>` and `thumbs/<project id>.svg`). An R2
 * bucket binding satisfies it, and so does the in-memory bucket of the tests. A key that is not
 * there is `null` for `get` and `head`; `delete` of a key that is not there is not an error. `list`
 * is for the weekly collection alone, which looks for objects that no row names.
 */
export interface R2Like {
  put(key: string, value: Uint8Array | string): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<R2ListPageLike>;
}

/**
 * What `wrangler.jsonc` (vars), `.dev.vars` (development values) and the secrets give the service.
 * `DEV` and `IDENTITY_JWKS` come only from `.dev.vars`, never from `wrangler.jsonc`. In production
 * `IDENTITY_EVENTS_SECRET`, `FORMS_SECRET` and `ADMIN_SUBS` arrive as Secrets Store bindings named
 * `<NAME>_STORE` (the family's Terraform declares the store and its values), which `secrets.ts`
 * reads into `<NAME>` at the Worker's entry, so nothing below the entry sees a binding.
 */
export interface Env {
  /** The address of the service, `https://diagrams.meltemi.dev`; in development the request's own origin is used. */
  readonly ORIGIN: string;
  /** The identity service, `https://id.meltemi.dev` (the session token's `iss`). */
  readonly IDENTITY_ISSUER: string;
  /** Where the identity service publishes its public keys. */
  readonly IDENTITY_JWKS_URL: string;
  /** The key that signs the deletion events of this product: the identity service's `EVENTS_SECRET_DIAGRAMS`. */
  readonly IDENTITY_EVENTS_SECRET: string;
  /** Signs the `csrf` token of the approval page and keys the hash of an IP in the rate limit. */
  readonly FORMS_SECRET: string;
  /**
   * The host that serves publications (`meltemi.page`, a bare host name): a registrable domain of its
   * own, never one under the family's cookie domain. Unset until the delivery change registers it:
   * publishing then works in development only (`/_published/` on the Worker's own origin).
   */
  readonly PUBLISH_HOST?: string;
  /** The `sub`s of the administrators of the service, comma separated; unset means nobody. */
  readonly ADMIN_SUBS?: string;
  /** `"true"` only in `.dev.vars`. */
  readonly DEV?: string;
  /** An inline JWKS for development and tests; honoured only when `DEV` is `"true"`. */
  readonly IDENTITY_JWKS?: string;

  readonly DB: D1Like;
  /** The playground's built site (Workers Static Assets binding). */
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  /** The Durable Object namespace of `ProjectRoom`: one room per project id. */
  readonly ROOMS: RoomNamespaceLike;
  /** The R2 bucket of blobs (`blobs/<sha-256>`) and thumbnails (`thumbs/<project id>.svg`). */
  readonly BLOBS: R2Like;
}
