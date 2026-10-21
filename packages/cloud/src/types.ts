import type { SessionVerifier } from "@meltemi/identity";
import type { RoomsApi } from "./rooms.js";
import type { CloudStore, UserProfile } from "./store/types.js";

/** What the handlers need besides the request: everything with a side effect is injected. */
export interface Deps {
  readonly store: CloudStore;
  /** The projects' rooms: the Durable Objects in the Worker, an in-memory room in the tests. */
  readonly rooms: RoomsApi;
  /** The reference verifier of the family's session (`@meltemi/identity`). */
  readonly verifier: SessionVerifier;
  /** The playground's built site. */
  readonly assets: { fetch(request: Request): Promise<Response> };
  now(): Date;
  randomBytes(length: number): Uint8Array;
  /** The identity service's key set and session check, and nothing else. */
  readonly fetch: typeof fetch;
}

/** Who is asking: a person with a session cookie, or a bearer API token. */
export type Principal =
  | {
      readonly via: "cookie";
      readonly sub: string;
      readonly sid: string;
      /** The profile the session token carried. */
      readonly profile: UserProfile;
    }
  | {
      readonly via: "token";
      readonly sub: string;
      readonly tokenId: string;
      readonly tokenName: string;
    };
