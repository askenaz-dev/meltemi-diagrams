// The page's side of the identity data (`cloud-accounts`, "The identity data through the Worker"):
// the person's sign-ins and devices as the identity service holds them, read and changed through the
// page's own origin (`/api/account/identity…`), which calls the identity service on the person's
// behalf. The page never talks to the identity service itself. No DOM and no globals: a fake
// `fetch` drives all of it in a test.

import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import { call, type Outcome, type Reader } from "./tokens.js";

/** One way the person signs in. */
export interface SigninView {
  readonly provider: string;
  readonly email: string;
  readonly emailVerified: boolean;
  /** The provider's handle (the GitHub login); empty for Google. */
  readonly handle: string;
  readonly linkedAt: string;
}

/** One device where the person is signed in. */
export interface DeviceView {
  readonly sid: string;
  /** A coarse label in English, such as `Edge on Windows`. */
  readonly label: string;
  readonly createdAt: string;
  readonly lastSeen: string;
  /** The session of this page. */
  readonly current: boolean;
}

/** What the identity service holds about the person, as the panel shows it. */
export interface IdentityView {
  readonly signins: readonly SigninView[];
  readonly devices: readonly DeviceView[];
  /** Whether a sign-in may be unlinked: not while there is only one provider. */
  readonly canUnlink: boolean;
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface IdentityApi {
  read(): Promise<Outcome<IdentityView>>;
  unlink(provider: string): Promise<Outcome<IdentityView>>;
  revokeOthers(): Promise<Outcome<IdentityView>>;
  revokeOne(sid: string): Promise<Outcome<IdentityView>>;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function signinOf(value: unknown): SigninView | undefined {
  if (!isObject(value) || typeof value["provider"] !== "string") return undefined;
  return {
    provider: value["provider"],
    email: text(value["email"]),
    emailVerified: value["emailVerified"] === true,
    handle: text(value["handle"]),
    linkedAt: text(value["linkedAt"]),
  };
}

function deviceOf(value: unknown): DeviceView | undefined {
  if (!isObject(value) || typeof value["sid"] !== "string" || value["sid"] === "") return undefined;
  return {
    sid: value["sid"],
    label: text(value["label"]),
    createdAt: text(value["createdAt"]),
    lastSeen: text(value["lastSeen"]),
    current: value["current"] === true,
  };
}

/**
 * `{ identities, sessions, canUnlink }` as the Worker passes it on; a row it cannot read is left
 * out, and an answer without its two lists is no answer.
 */
export const readIdentity: Reader<IdentityView> = (answer) => {
  const body = parseObject(answer.text);
  const identities = body?.["identities"];
  const sessions = body?.["sessions"];
  if (!body || !Array.isArray(identities) || !Array.isArray(sessions)) return undefined;
  return {
    value: {
      signins: identities.flatMap((row) => signinOf(row) ?? []),
      devices: sessions.flatMap((row) => deviceOf(row) ?? []),
      canUnlink: body["canUnlink"] === true,
    },
  };
};

/** The calls of the page to `/api/account/identity…`, relative to the page and with its cookie. */
export function identityApi(fetchFn: Fetch, location: Pick<Location, "href">): IdentityApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  const post = (path: string, body: unknown) =>
    call(
      fetchFn,
      inPage(page, path),
      {
        method: "POST",
        headers: { ...accept, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      readIdentity,
    );
  return {
    read: () =>
      call(fetchFn, inPage(page, "api/account/identity"), { headers: accept }, readIdentity),
    unlink: (provider) => post("api/account/identity/unlink", { provider }),
    revokeOthers: () => post("api/account/identity/sessions/revoke-others", {}),
    revokeOne: (sid) => post(`api/account/identity/sessions/${encodeURIComponent(sid)}/revoke`, {}),
  };
}
