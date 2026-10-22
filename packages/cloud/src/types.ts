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
  /**
   * The identity service, and nothing else: its key set, its session check and, for the account
   * panel, its account API.
   */
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
      /**
       * The session token the principal was verified from. Only the account routes read it, to
       * present it to the identity service on the person's behalf (`routes/account.ts`).
       */
      readonly token: string;
    }
  | {
      readonly via: "token";
      readonly sub: string;
      readonly tokenId: string;
      readonly tokenName: string;
    };
