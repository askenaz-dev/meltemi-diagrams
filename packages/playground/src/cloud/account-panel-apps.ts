// What the account panel's Connected apps section knows and does, without a DOM (`account-panel`,
// "Connected apps section"): the calls (`GET` and `DELETE /api/account/apps`), the shapes it accepts
// back, the scopes and hosts put in words, and the list with what is going on and what went wrong.
// The section draws it (`account-panel-apps-section.ts`); a test drives it with a fake `fetch`.

import type { AccountWords } from "./account-panel-model.js";
import { inPage, isObject, parseObject, type Fetch } from "./http.js";
import { call, type ApiFailure, type Outcome, type Reader } from "./tokens.js";

/** A connected app as the service lists it: a grant the person approved on the consent page. */
export interface ConnectedApp {
  readonly id: string;
  /** The client's name, as it registered (unverified unless its id is a metadata document). */
  readonly name: string;
  /** The address the client is known by: its metadata document's, or where its access goes. */
  readonly uri: string;
  readonly scopes: readonly string[];
  readonly createdAt: string;
  /** Null while the app has never reached the endpoint. */
  readonly lastUsedAt: string | null;
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface AppsApi {
  list(): Promise<Outcome<ConnectedApp[]>>;
  revoke(id: string): Promise<Outcome<null>>;
}

function appOf(value: unknown): ConnectedApp | undefined {
  if (!isObject(value) || typeof value["id"] !== "string" || value["id"] === "") return undefined;
  const client = isObject(value["client"]) ? value["client"] : {};
  const name = typeof client["name"] === "string" ? client["name"].trim() : "";
  const uri = typeof client["uri"] === "string" ? client["uri"] : "";
  const scopes = Array.isArray(value["scopes"])
    ? value["scopes"].filter((scope): scope is string => typeof scope === "string")
    : [];
  return {
    id: value["id"],
    name: name === "" ? value["id"] : name,
    uri,
    scopes,
    createdAt: typeof value["createdAt"] === "string" ? value["createdAt"] : "",
    lastUsedAt: typeof value["lastUsedAt"] === "string" ? value["lastUsedAt"] : null,
  };
}

/** `{ grants: [{ id, client: { name, uri }, scopes, createdAt, lastUsedAt }] }`; a grant without an id is left out. */
const readList: Reader<ConnectedApp[]> = (answer) => {
  const grants = parseObject(answer.text)?.["grants"];
  if (!Array.isArray(grants)) return undefined;
  return { value: grants.flatMap((grant) => appOf(grant) ?? []) };
};

/** The calls of the page to `/api/account/apps`, relative to the page and with its cookie. */
export function appsApi(fetchFn: Fetch, location: Pick<Location, "href">): AppsApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  return {
    list: () => call(fetchFn, inPage(page, "api/account/apps"), { headers: accept }, readList),
    revoke: (id) =>
      call(
        fetchFn,
        inPage(page, `api/account/apps/${encodeURIComponent(id)}`),
        { method: "DELETE", headers: accept },
        () => ({ value: null }),
      ),
  };
}

// Words -------------------------------------------------------------------------------------------

/** The section's words in a language. */
export type AppsWords = AccountWords["apps"];

/** The hosts a program on this computer listens on. */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;

/** Where an app is known: its host, or "an app on this computer" for a loopback address. */
export function hostText(uri: string, words: AppsWords): string {
  let host: string;
  try {
    host = new URL(uri).hostname;
  } catch {
    return uri;
  }
  if (host === "") return uri;
  return LOOPBACK.test(host) ? words.thisComputer : host;
}

/** What an app may do, in words, in the server's order: reading and writing together are one phrase. */
export function scopeTexts(scopes: readonly string[], words: AppsWords): string[] {
  const held = new Set(scopes);
  const texts: string[] = [];
  if (held.has("projects:read") && held.has("projects:write")) {
    texts.push(words.readWrite);
    held.delete("projects:read");
    held.delete("projects:write");
  }
  for (const scope of [
    "projects:read",
    "projects:write",
    "sharing",
    "live",
    "publish",
    "offline_access",
  ]) {
    if (held.has(scope)) texts.push(words.scopes[scope] ?? scope);
  }
  return texts;
}

/** The address of the MCP endpoint, at the page's own origin. */
export function endpointOf(location: Pick<Location, "origin">): string {
  return `${location.origin}/mcp`;
}

/** A failure in words: the service unreachable, the session ended, or the service's own message. */
export function explainApps(
  failure: ApiFailure,
  words: AppsWords,
  panel: Pick<AccountWords, "unreachable" | "failed" | "failedStatus">,
): string {
  if (failure.kind === "unreachable") return panel.unreachable;
  if (failure.kind === "unexpected") return words.failed;
  if (failure.code === "auth.required" || failure.status === 401) return words.signedOut;
  if (failure.message !== undefined && failure.code !== undefined) {
    return panel.failed(failure.message, failure.code);
  }
  return panel.failedStatus(failure.status);
}

// The model -----------------------------------------------------------------------------------------

export interface AppsState {
  /** Whether the list has been read: it is empty and unknown until `ready`. */
  readonly list: "loading" | "ready" | "failed";
  /** The apps, the latest approved first, as the service lists them. */
  readonly apps: readonly ConnectedApp[];
  /** A revocation is on its way: the buttons wait. */
  readonly busy: boolean;
  /** Something that is going on or went well, in words. */
  readonly status: string;
  /** Something that went wrong, in words; empty when nothing did. */
  readonly problem: string;
}

export class AppsModel {
  private current: AppsState = { list: "loading", apps: [], busy: false, status: "", problem: "" };

  constructor(
    private readonly api: AppsApi,
    private readonly words: () => AccountWords,
    private readonly changed: (state: AppsState) => void,
  ) {}

  get state(): AppsState {
    return this.current;
  }

  private update(patch: Partial<AppsState>): void {
    this.current = { ...this.current, ...patch };
    this.changed(this.current);
  }

  /** Reads the list of apps. */
  async load(): Promise<void> {
    const words = this.words();
    this.update({ list: "loading", status: words.apps.loading, problem: "" });
    const listed = await this.api.list();
    if (listed.ok) {
      this.update({ list: "ready", apps: listed.value, status: "" });
    } else {
      const now = this.words();
      this.update({
        list: "failed",
        status: "",
        problem: explainApps(listed.failure, now.apps, now),
      });
    }
  }

  /** Revokes an app. True when it is gone: revoked now, or already revoked elsewhere. */
  async revoke(app: ConnectedApp): Promise<boolean> {
    if (this.current.busy) return false;
    this.update({ busy: true, status: "", problem: "" });
    const revoked = await this.api.revoke(app.id);
    const words = this.words();
    // A 404 means the grant is not there (revoked from another tab, or replaced): what was asked.
    if (!revoked.ok && revoked.failure.status !== 404) {
      this.update({ busy: false, problem: explainApps(revoked.failure, words.apps, words) });
      return false;
    }
    this.update({
      busy: false,
      apps: this.current.apps.filter((held) => held.id !== app.id),
      status: revoked.ok ? words.apps.revoked(app.name) : words.apps.alreadyGone,
    });
    return true;
  }
}
