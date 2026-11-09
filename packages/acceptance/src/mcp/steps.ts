// The steps of the MCP acceptance suite: the criteria of the MCP specification's section 13 that a
// script can prove (2 to 6, 10 to 23 and 24 to 29), in the order they build on each other, against a
// host and two test accounts (change `agent-mcp`, design decision 7). Each step creates what it needs
// under a name that starts with `mcp-acceptance-`; the cleanup deletes it, and nothing that grants
// access (a token, an invitation's or a live session's link, a code) is ever written to the log.
//
// The criteria, in the specification's words, are listed with the procedure that covers the rest
// (1, 7, 8, 9 and the voice half of 16) in docs/quality/mcp-acceptance.md.

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { readPng, writePng } from "../png.js";
import { Agent, refusalOf } from "./agent.js";
import { storyAuthoringJourney } from "./stories.js";
import { Skip, type Capabilities, type Step } from "./harness.js";
import { ask, rpc, type Fetch, type Target } from "./host.js";
import { FIXTURE_CLIENT_PREFIX, type OAuthFixtures } from "./oauth-fixture-format.js";

/** The prefix of every project, publication, handle and invitation the suite makes. */
export const PREFIX = "mcp-acceptance-";

/** The tools the specification's `mcp-server` names, every one of which the endpoint must list. */
export const CATALOGUE_NAMES: readonly string[] = [
  "whoami",
  "list_projects",
  "create_project",
  "get_project",
  "rename_project",
  "read_files",
  "write_files",
  "validate",
  "upload_image",
  "list_versions",
  "create_version",
  "restore_version",
  "open_url",
  "preview",
  "inspect_story",
  "get_sharing",
  "set_link_access",
  "invite",
  "list_invitations",
  "revoke_invitation",
  "set_member_role",
  "remove_member",
  "get_live",
  "start_live",
  "end_live",
  "list_publications",
  "publish",
  "unpublish",
];

/** The scopes an API token opens the endpoint with. */
const EVERY_SCOPE = ["projects:read", "projects:write", "sharing", "live", "publish"];
const CONNECT = "connect: the first account, the catalogue and what earlier runs left";
const CONNECT_SECOND = "connect: the second account";

const FLOW =
  'language "0.2"\n\ndiagram checkout: flow {\n  cart["Cart"]\n  pay["Pay"]\n  cart -> pay\n}\n';
const SEQUENCE =
  'language "0.2"\n\ndiagram signin: sequence {\n  actor person "Person"\n  participant app "App"\n\n  person -> app: "Sign in"\n  app --> person: "Welcome"\n}\n';
const EXTRA =
  'language "0.2"\n\ndiagram returns: flow {\n  request["Return requested"]\n  refund["Refund"]\n  request -> refund\n}\n';
const BROKEN = "diagram broken: flow {\n  a ->\n}\n";
const IMAGE_PATH = "assets/mcp-acceptance.png";
const BRAND = `language "0.2"\n\ndiagram brand: free {\n  image logo "${IMAGE_PATH}" { description "A test image" }\n\n  placement {\n    place logo at (120, 80)\n  }\n}\n`;

/** A flow sheet with one more step after the last, for a change that adds elements. */
function withShipping(text: string): string {
  return text.replace(/\n}\n$/, '\n  ship["Ship"]\n  pay -> ship\n}\n');
}

/** What the steps share. */
export interface SuiteState {
  readonly target: Target;
  readonly capabilities: Capabilities;
  readonly runId: string;
  readonly fetcher: Fetch;
  readonly tokens: { readonly first?: string; readonly second?: string };
  /** Made by the privileged setup process with the official provider, not browser consent. */
  readonly oauthFixtures?: OAuthFixtures;
  /** Records the public registration for the separate privileged cleanup process. */
  readonly recordOAuthClient?: (client: {
    clientId: string;
    clientName: string;
  }) => void | Promise<void>;
  /** A file of the Worker's log to scan as well (criterion 29), when the run is given one. */
  readonly serverLog?: string;
  /**
   * With `--local`: the addresses of the two `mdg mcp` processes the agents connect to, and the file
   * of their standard error, scanned like the Worker's log.
   */
  readonly local?: { readonly first: string; readonly second?: string; readonly log: string };
  first?: Agent;
  second?: Agent;
  firstAccount?: { sub: string; email: string; handle: string | null };
  secondAccount?: { sub: string; email: string };
  server?: { name: string; version: string };
  protocolVersion?: string;
  /** The authorization server's metadata, when the host has one. */
  oauth?: {
    registration?: string;
    authorization?: string;
    token?: string;
    clientId?: string;
  };
  /** The project of criteria 2 to 16 and 26, never shared. */
  main?: { id: string; url: string };
  /** The project of criteria 17 to 25: shared, then withdrawn. */
  shared?: { id: string };
  /** Every project the run made, for the cleanup. */
  readonly created: string[];
  /** Every publication the run made, by project and slug. */
  readonly publications: { project: string; slug: string }[];
  /** The projects whose live session the run started. */
  readonly live: string[];
  /** The invitation of criterion 18. */
  invitation?: { id: string; token: string };
  /** A preview the first account drew, which the second asks for too (criterion 26). */
  drawn?: Record<string, unknown>;
}

/** A new run's state. */
export function newState(init: {
  target: Target;
  capabilities: Capabilities;
  tokens: SuiteState["tokens"];
  oauthFixtures?: OAuthFixtures;
  recordOAuthClient?: SuiteState["recordOAuthClient"];
  fetcher?: Fetch;
  serverLog?: string;
  runId?: string;
  local?: SuiteState["local"];
}): SuiteState {
  return {
    target: init.target,
    capabilities: init.capabilities,
    tokens: init.tokens,
    ...(init.oauthFixtures ? { oauthFixtures: init.oauthFixtures } : {}),
    ...(init.recordOAuthClient ? { recordOAuthClient: init.recordOAuthClient } : {}),
    fetcher: init.fetcher ?? fetch,
    ...(init.serverLog ? { serverLog: init.serverLog } : {}),
    ...(init.local ? { local: init.local } : {}),
    runId:
      init.runId ?? `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toLowerCase(),
    created: [],
    publications: [],
    live: [],
  };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const count = (value: unknown): number => (typeof value === "number" ? value : Number.NaN);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function first(state: SuiteState): Agent {
  if (!state.first) throw new Error("the first account is not connected");
  return state.first;
}
function second(state: SuiteState): Agent {
  if (!state.second) throw new Error("the second account is not connected");
  return state.second;
}
function mainId(state: SuiteState): string {
  if (!state.main) throw new Error("the main project was not made");
  return state.main.id;
}
function sharedId(state: SuiteState): string {
  if (!state.shared) throw new Error("the shared project was not made");
  return state.shared.id;
}

/** An HTTP request to the host as the first account (`token`), the second or nobody. */
function http(
  state: SuiteState,
  path: string,
  init: RequestInit & { as?: "first" | "second" } = {},
) {
  const { as, ...rest } = init;
  const token =
    as === "first" ? state.tokens.first : as === "second" ? state.tokens.second : undefined;
  return ask(state.target, path, { ...rest, ...(token ? { token } : {}) }, state.fetcher);
}

/** A project the run makes: created through the tool, recorded for the cleanup at once. */
async function createProject(
  state: SuiteState,
  label: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const project = await first(state).ok("create_project", {
    name: `${PREFIX}${state.runId}-${label}`,
    ...extra,
  });
  const id = text(project["id"]);
  assert.ok(id, "create_project answered no id");
  if (!state.created.includes(id)) state.created.push(id);
  return project;
}

/** The project's current revision. */
async function revisionOf(agent: Agent, project: string): Promise<number> {
  return count((await agent.ok("get_project", { project }))["revision"]);
}

/** The project's text files, by path. */
async function filesOf(agent: Agent, project: string) {
  const read = await agent.ok("read_files", { project });
  return {
    revision: count(read["revision"]),
    files: (read["files"] ?? {}) as Record<string, string>,
    binaries: (read["binaries"] ?? {}) as Record<string, string>,
  };
}

/** The project's link (`/p/<id>`), which the link level opens or not. */
const projectLink = (state: SuiteState, project: string) =>
  `${state.target.origin}/p/${encodeURIComponent(project)}`;

/** Whether an anonymous reader gets the project's files over HTTP. */
async function anonymousFiles(state: SuiteState, project: string) {
  return http(state, `/api/projects/${encodeURIComponent(project)}/files`);
}

/** Waits until `check` holds, a few times a second apart, for what another isolate answers. */
async function eventually(check: () => Promise<boolean>, tries = 5): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    await new Promise((done) => setTimeout(done, 1000));
  }
  return false;
}

/** A refusal that says nothing more than its code and message (`project.not-found`). */
async function notFound(agent: Agent, name: string, args: Record<string, unknown>) {
  const refusal = await agent.refused(name, args, "project.not-found");
  assert.deepEqual(
    Object.keys(refusal.fields),
    [],
    `${name}'s project.not-found carries no other field`,
  );
}

/** An image of the suite's own: 24 by 16 pixels, the family's blue. */
function testImage(): Uint8Array {
  const width = 24;
  const height = 16;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set([37, 99, 235, 255], i * 4);
  return writePng({ width, height, pixels });
}

/** A project id that no project has: twenty characters of its alphabet. */
function guessedId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  return [...randomBytes(20)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

/** The invitation's token, from its link (`…?invite=<token>`). */
function inviteToken(link: string): string {
  const token = new URL(link).searchParams.get("invite") ?? "";
  assert.ok(token, "the invitation's link carries its token");
  return token;
}

/** Ensures the first account has a handle, which publishing needs; answers it. */
async function ensureHandle(state: SuiteState, log: (line: string) => void): Promise<string> {
  const account = state.firstAccount;
  if (account?.handle) return account.handle;
  const handle = `${PREFIX}${randomBytes(3).toString("hex")}`;
  const set = await http(state, "/api/account", {
    as: "first",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  assert.equal(set.status, 200, `PATCH /api/account answered ${set.status}`);
  log(`the first test account had no handle; it now has ${handle}, which stays`);
  if (account) account.handle = handle;
  return handle;
}

// ---------------------------------------------------------------------------------------------
// Without a token: what anybody sees.

const discovery: Step<SuiteState> = {
  name: "27 discovery: the metadata documents name the endpoint and S256",
  criterion: 27,
  needs: ["endpoint"],
  async run({ state, log }) {
    const resource = await http(state, "/.well-known/oauth-protected-resource");
    if (resource.status === 404) {
      state.capabilities.oauth = false;
      throw new Skip(
        "the host publishes no protected resource metadata yet (the authorization server is the change's second stage)",
      );
    }
    assert.equal(
      resource.status,
      200,
      `the protected resource metadata answered ${resource.status}`,
    );
    const document = resource.json();
    assert.equal(document["resource"], state.target.endpoint, "the resource is the endpoint");
    const servers = (document["authorization_servers"] ?? []) as string[];
    assert.ok(servers.includes(state.target.origin), "the authorization server is the origin");
    assert.deepEqual(document["bearer_methods_supported"], ["header"], "bearer in the header only");
    const scopes = (document["scopes_supported"] ?? []) as string[];
    for (const scope of EVERY_SCOPE) assert.ok(scopes.includes(scope), `scope ${scope} listed`);

    const server = await http(state, "/.well-known/oauth-authorization-server");
    assert.equal(server.status, 200, `the authorization server metadata answered ${server.status}`);
    const metadata = server.json();
    assert.deepEqual(metadata["code_challenge_methods_supported"], ["S256"], "S256 only");
    const grants = (metadata["grant_types_supported"] ?? []) as string[];
    assert.ok(grants.includes("authorization_code"), "authorization_code is offered");
    assert.ok(grants.includes("refresh_token"), "refresh_token is offered");
    assert.ok(!grants.includes("client_credentials"), "client_credentials is not offered");
    const methods = (metadata["token_endpoint_auth_methods_supported"] ?? []) as string[];
    assert.ok(methods.includes("none"), "public clients (none) are accepted");
    assert.equal(metadata["client_id_metadata_document_supported"], true, "CIMD is supported");
    state.oauth = {
      registration: text(metadata["registration_endpoint"]) || undefined,
      authorization: text(metadata["authorization_endpoint"]) || undefined,
      token: text(metadata["token_endpoint"]) || undefined,
    };
    assert.ok(state.oauth.registration, "a registration endpoint is named");
    state.capabilities.oauth = true;
    log("both documents read: resource, server, S256, the grants and registration");
  },
};

const challenge: Step<SuiteState> = {
  name: "27 initialize and tools/list without a token: 401 with the challenge",
  criterion: 27,
  needs: ["endpoint"],
  async run({ state, log }) {
    const path = new URL(state.target.endpoint).pathname;
    for (const method of ["initialize", "tools/list"]) {
      const answer = await http(
        state,
        path,
        rpc(
          method,
          method === "initialize"
            ? {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "mcp-acceptance", version: "1.0.0" },
              }
            : {},
        ),
      );
      assert.equal(answer.status, 401, `${method} without a token answered ${answer.status}`);
      const header = answer.headers.get("WWW-Authenticate") ?? "";
      assert.match(header, /^Bearer\b/, `${method}'s 401 carries WWW-Authenticate: Bearer`);
      if (state.capabilities.oauth) {
        assert.ok(
          header.includes(
            `resource_metadata="${state.target.origin}/.well-known/oauth-protected-resource"`,
          ),
          `${method}'s challenge names the protected resource metadata`,
        );
      }
      assert.ok(!/"tools"\s*:/.test(answer.text), `${method} answered no tools`);
    }
    log(
      state.capabilities.oauth
        ? "both refused 401; the challenge names the metadata"
        : "both refused 401 with the challenge (no authorization server to name yet)",
    );
  },
};

const foreignTokens: Step<SuiteState> = {
  name: "27 a token the service did not issue: 401",
  criterion: 27,
  needs: ["endpoint"],
  async run({ state, log }) {
    const path = new URL(state.target.endpoint).pathname;
    // A string that is no token, and a JWT-shaped one of nobody's (the identity service's shape).
    const header = Buffer.from('{"alg":"ES256","typ":"JWT"}').toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: `${PREFIX}nobody`, aud: state.target.endpoint, exp: 4102444800 }),
    ).toString("base64url");
    for (const [label, token] of [
      ["a malformed token", "not-a-token"],
      ["a JWT the service did not sign", `${header}.${payload}.${"A".repeat(86)}`],
    ] as const) {
      const answer = await ask(state.target, path, { ...rpc("tools/list"), token }, state.fetcher);
      assert.equal(answer.status, 401, `${label} answered ${answer.status}`);
      assert.match(
        answer.headers.get("WWW-Authenticate") ?? "",
        /^Bearer\b/,
        `${label}: challenge`,
      );
    }
    log("a malformed token and a foreign JWT both refused 401");
  },
};

/** A loopback redirect address, as Codex registers (`http://127.0.0.1/callback`). */
const REDIRECT = "http://127.0.0.1:33418/callback";

/** An S256 challenge of a fresh verifier. */
function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

const wrongResource: Step<SuiteState> = {
  name: "27 a wrong resource is refused before consent, and no code is issued",
  criterion: 27,
  needs: ["oauth"],
  after: ["27 discovery: the metadata documents name the endpoint and S256"],
  async run({ state, log }) {
    const oauth = state.oauth!;
    const clientName = state.oauthFixtures
      ? `${FIXTURE_CLIENT_PREFIX}${state.runId}-registration`
      : `${PREFIX}${state.runId}`;
    if (state.oauthFixtures && !state.recordOAuthClient)
      throw new Error("the public client's fixture cleanup journal is unavailable");
    const registered = await ask(
      state.target,
      oauth.registration!,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName,
          redirect_uris: [REDIRECT],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      },
      state.fetcher,
    );
    if (registered.status === 429) {
      if (state.oauthFixtures)
        throw new Error("the host's registration limit (ten an hour per address) is reached");
      throw new Skip("the host's registration limit (ten an hour per address) is reached");
    }
    assert.ok(
      registered.status === 200 || registered.status === 201,
      `registration answered ${registered.status}`,
    );
    const clientId = text(registered.json()["client_id"]);
    assert.ok(clientId, "registration answered a client_id");
    await state.recordOAuthClient?.({ clientId, clientName });
    oauth.clientId = clientId;
    log(
      state.oauthFixtures
        ? "a public client registered and recorded for the isolated fixture cleanup"
        : "a public client registered (its registration stays: no endpoint removes one)",
    );

    const authorize = (resource: string) => {
      const { challenge } = pkce();
      const url = new URL(oauth.authorization ?? `${state.target.origin}/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        scope: "projects:read",
        state: `${PREFIX}${state.runId}`,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource,
      }).toString();
      return ask(state.target, url.href, {}, state.fetcher);
    };
    const wrong = await authorize("https://other.example/mcp");
    const location = wrong.headers.get("Location") ?? "";
    const toClient = location.startsWith(REDIRECT);
    assert.ok(
      (wrong.status >= 400 && wrong.status < 500) ||
        (wrong.status >= 300 && wrong.status < 400 && toClient && /[?&]error=/.test(location)),
      `a wrong resource answered ${wrong.status} without an error for the client`,
    );
    assert.ok(!/[?&]code=/.test(location), "no code is issued for a wrong resource");
    assert.ok(!/consent|approve/i.test(wrong.status === 200 ? wrong.text : ""), "no consent page");

    // The same request for the endpoint goes on (to sign-in, since nobody is signed in): the refusal
    // above was the resource's.
    const right = await authorize(state.target.endpoint);
    const next = right.headers.get("Location") ?? "";
    assert.ok(
      right.status === 200 ||
        (right.status >= 300 && right.status < 400 && !next.startsWith(REDIRECT)),
      `the endpoint's own resource answered ${right.status}`,
    );
    log(`a wrong resource refused (${wrong.status}); the endpoint's goes on (${right.status})`);
  },
};

const inventedGrants: Step<SuiteState> = {
  name: "28 a code or a refresh token the server never issued is refused",
  criterion: 28,
  needs: ["oauth"],
  after: ["27 a wrong resource is refused before consent, and no code is issued"],
  async run({ state, log }) {
    const oauth = state.oauth!;
    const tokenEndpoint = oauth.token ?? `${state.target.origin}/oauth/token`;
    const exchange = (fields: Record<string, string>) =>
      ask(
        state.target,
        tokenEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: oauth.clientId!, ...fields }).toString(),
        },
        state.fetcher,
      );
    const { verifier } = pkce();
    for (const [label, fields] of [
      [
        "an invented code",
        {
          grant_type: "authorization_code",
          code: randomBytes(24).toString("base64url"),
          redirect_uri: REDIRECT,
          code_verifier: verifier,
        },
      ],
      [
        "an invented refresh token",
        { grant_type: "refresh_token", refresh_token: randomBytes(24).toString("base64url") },
      ],
    ] as const) {
      const answer = await exchange(fields);
      assert.ok(answer.status >= 400 && answer.status < 500, `${label} answered ${answer.status}`);
      let error = "";
      try {
        error = text(answer.json()["error"]);
      } catch {
        // The status says it.
      }
      assert.ok(!/access_token/.test(answer.text), `${label} answered no access token`);
      log(`${label} refused ${answer.status}${error ? ` ${error}` : ""}`);
    }
  },
};

const grantedTokens: Step<SuiteState> = {
  name: "27 an expired token, another resource's and a narrower scope are refused",
  criterion: 27,
  needs: ["grant"],
  after: [CONNECT_SECOND],
  async run({ state, log, secret }) {
    const fixtures = state.oauthFixtures!;
    for (const fixture of [fixtures.fixtures.expired, fixtures.fixtures.wrongResource]) {
      secret(fixture.accessToken);
      await refusedOAuthAccess(state, fixture.accessToken);
    }
    const narrow = fixtures.fixtures.narrow;
    secret(narrow.accessToken);
    const agent = await Agent.connect(state.target, narrow.accessToken);
    try {
      const me = await agent.ok("whoami");
      assert.equal(me["sub"], fixtures.firstSub, "the narrow fixture is the dedicated account");
      assert.deepEqual(me["scopes"], ["projects:read"], "only read was granted");
      await agent.ok("list_projects");
      const written = await agent.call("create_project", {
        name: `${PREFIX}${state.runId}-scope-refusal`,
      });
      // An unexpected successful write is still ours to clean up before failing the assertion.
      const id = text(written.structuredContent?.["id"]);
      if (!written.isError && id && !state.created.includes(id)) state.created.push(id);
      assert.equal(written.isError, true, "the narrow token cannot create a project");
      const refusal = refusalOf(written);
      assert.equal(refusal.code, "scope.insufficient");
      assert.equal(refusal.fields["scope"], "projects:write");
    } finally {
      await agent.close();
    }
    log(
      "preprovisioned official-provider fixtures: expired and wrong-resource access refused; read-only access reads and its write is refused",
    );
  },
};

/** The real protected endpoint must refuse a credential before any tool is reached. */
async function refusedOAuthAccess(state: SuiteState, token: string): Promise<void> {
  const answer = await ask(state.target, "/mcp", { ...rpc("tools/list"), token }, state.fetcher);
  assert.equal(answer.status, 401, "the OAuth access credential is refused");
  assert.match(answer.headers.get("WWW-Authenticate") ?? "", /^Bearer\b/, "a bearer challenge");
}

/** Token responses are parsed and registered as secrets before any assertion can include them. */
async function oauthRequest(
  state: SuiteState,
  fields: Record<string, string>,
  secret: (value: string) => void,
) {
  const answer = await ask(
    state.target,
    "/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    },
    state.fetcher,
  );
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = answer.json();
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
      body = parsed as Record<string, unknown>;
  } catch {
    // An unreadable response fails the status/shape checks below without echoing its body.
  }
  for (const key of ["access_token", "refresh_token", "code"]) {
    const value = body[key];
    if (typeof value === "string") secret(value);
  }
  return { answer, body };
}

function refreshedPair(body: Record<string, unknown>) {
  const accessToken = text(body["access_token"]);
  const refreshToken = text(body["refresh_token"]);
  assert.ok(accessToken.length >= 16 && accessToken.length <= 4096, "an access token was issued");
  assert.ok(refreshToken.length >= 16 && refreshToken.length <= 4096, "a refresh token was issued");
  assert.match(text(body["token_type"]), /^Bearer$/i, "bearer token type");
  return { accessToken, refreshToken };
}

const refreshAndRevoke: Step<SuiteState> = {
  name: "28 a refresh token rotates once and a revoked grant is refused",
  criterion: 28,
  needs: ["grant"],
  after: [CONNECT_SECOND],
  async run({ state, log, secret }) {
    const fixtures = state.oauthFixtures!;
    const normal = fixtures.fixtures.normal;
    secret(normal.accessToken);
    secret(normal.refreshToken);
    const usable = async (accessToken: string) => {
      const agent = await Agent.connect(state.target, accessToken);
      try {
        const me = await agent.ok("whoami");
        assert.equal(
          me["sub"],
          fixtures.firstSub,
          "the refreshed fixture is the dedicated account",
        );
      } finally {
        await agent.close();
      }
    };
    await usable(normal.accessToken);
    const refresh = (refreshToken: string) =>
      oauthRequest(
        state,
        {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: normal.clientId,
        },
        secret,
      );
    const first = await refresh(normal.refreshToken);
    assert.equal(first.answer.status, 200, "the first refresh succeeds");
    const one = refreshedPair(first.body);
    assert.notEqual(one.refreshToken, normal.refreshToken, "the refresh credential rotates");
    assert.notEqual(one.accessToken, normal.accessToken, "the access credential rotates");
    // The provider deliberately permits the previous refresh credential until its successor is
    // used. Consume that successor before checking that the original is no longer accepted.
    const second = await refresh(one.refreshToken);
    assert.equal(second.answer.status, 200, "the replacement refresh succeeds");
    const two = refreshedPair(second.body);
    assert.notEqual(two.refreshToken, one.refreshToken, "the second refresh rotates again");
    const stale = await refresh(normal.refreshToken);
    assert.equal(stale.answer.status, 400, "a consumed ancestor cannot refresh again");
    assert.equal(stale.body["error"], "invalid_grant");
    await usable(two.accessToken);
    const revoked = await oauthRequest(
      state,
      {
        client_id: normal.clientId,
        token: two.refreshToken,
        token_type_hint: "refresh_token",
      },
      secret,
    );
    assert.equal(revoked.answer.status, 200, "RFC7009 revokes the fixture grant");
    await refusedOAuthAccess(state, two.accessToken);
    await refusedOAuthAccess(state, normal.accessToken);
    const ended = await refresh(two.refreshToken);
    assert.equal(ended.answer.status, 400, "the revoked grant cannot refresh");
    assert.equal(ended.body["error"], "invalid_grant");
    log(
      "preprovisioned official-provider fixture: two rotations honor the previous-token grace, an old refresh is refused, and RFC7009 revocation ends access and refresh",
    );
  },
};

// ---------------------------------------------------------------------------------------------
// The first account.

/** A project of an earlier run left behind is swept when it is older than this. */
const STALE_MS = 60 * 60 * 1000;

const connect: Step<SuiteState> = {
  name: CONNECT,
  criterion: null,
  needs: ["token"],
  async run({ state, log }) {
    state.first = await Agent.connect(state.target, state.tokens.first!, state.local?.first);
    state.server = state.first.server();
    state.protocolVersion = state.first.protocolVersion();
    assert.equal(
      state.server?.name,
      "meltemi-diagrams",
      "the server names itself meltemi-diagrams",
    );
    const { tools } = await state.first.client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of CATALOGUE_NAMES) assert.ok(names.includes(name), `tools/list has ${name}`);
    for (const tool of tools) {
      const described = tool as {
        title?: string;
        description?: string;
        inputSchema?: unknown;
        outputSchema?: unknown;
        annotations?: { title?: string };
      };
      assert.ok(described.title || described.annotations?.title, `${tool.name} has a title`);
      assert.ok(described.description, `${tool.name} has a description`);
      assert.ok(described.inputSchema && described.outputSchema, `${tool.name} has both schemas`);
      assert.ok(described.annotations, `${tool.name} has annotations`);
    }
    const me = await state.first.ok("whoami");
    state.firstAccount = {
      sub: text(me["sub"]),
      email: text(me["email"]),
      handle: text(me["handle"]) || null,
    };
    if (state.oauthFixtures)
      assert.equal(
        state.firstAccount.sub,
        state.oauthFixtures.firstSub,
        "the first token matches the fixture account",
      );
    assert.deepEqual(
      [...((me["scopes"] ?? []) as string[])].sort(),
      [...EVERY_SCOPE].sort(),
      "an API token has every scope",
    );
    log(
      `connected to ${state.server?.name} ${state.server?.version} over ${state.protocolVersion}; ${tools.length} tools`,
    );

    // What an earlier run left (one killed before its cleanup): its projects, by their names.
    const listed = await http(state, "/api/projects", { as: "first" });
    assert.equal(listed.status, 200, `GET /api/projects answered ${listed.status}`);
    const projects = (listed.json()["projects"] ?? []) as {
      id: string;
      name: string;
      role: string;
      updated_at: string;
    }[];
    const stale = projects.filter(
      (project) =>
        project.role === "owner" &&
        project.name.startsWith(PREFIX) &&
        Date.now() - Date.parse(project.updated_at) > STALE_MS,
    );
    for (const project of stale) {
      await http(state, `/api/projects/${encodeURIComponent(project.id)}`, {
        as: "first",
        method: "DELETE",
      });
    }
    if (stale.length > 0) log(`deleted ${stale.length} project(s) an earlier run left`);
  },
};

const connectSecond: Step<SuiteState> = {
  name: CONNECT_SECOND,
  criterion: null,
  needs: ["token", "token2"],
  after: [CONNECT],
  async run({ state, log }) {
    state.second = await Agent.connect(state.target, state.tokens.second!, state.local?.second);
    const me = await state.second.ok("whoami");
    state.secondAccount = { sub: text(me["sub"]), email: text(me["email"]) };
    if (state.oauthFixtures)
      assert.equal(
        state.secondAccount.sub,
        state.oauthFixtures.secondSub,
        "the second token matches the fixture account",
      );
    assert.notEqual(
      state.secondAccount.sub,
      state.firstAccount?.sub,
      "MELTEMI_TOKEN and MELTEMI_TOKEN_2 are tokens of two different accounts",
    );
    assert.ok(state.secondAccount.email, "the second account has an email to be invited by");
    log("the second account is another account");
  },
};

const MAIN = "2 a project created in the account answers its address";

const created: Step<SuiteState> = {
  name: MAIN,
  criterion: 2,
  needs: ["token"],
  after: [CONNECT],
  async run({ state, log }) {
    const project = await createProject(state, "main", {
      description: "Made by the MCP acceptance suite; deleted when the run ends.",
      idempotencyKey: `${PREFIX}${state.runId}-main`,
    });
    const id = text(project["id"]);
    const url = text(project["url"]);
    assert.equal(
      url,
      `${state.target.origin}/?project=${id}`,
      "the url opens the project in the app",
    );
    assert.equal(project["role"], "owner", "the account owns it");
    const listed = (await first(state).ok("list_projects"))["projects"] as { id: string }[];
    assert.equal(listed.filter((p) => p.id === id).length, 1, "list_projects lists it once");
    const page = await http(state, url);
    assert.equal(page.status, 200, `the project's address answered ${page.status}`);
    state.main = { id, url };
    log("created, listed once, and its address serves the app");
  },
};

const TWO = "3 two diagrams in the project, listed, read and drawn apart";

const twoDiagrams: Step<SuiteState> = {
  name: TWO,
  criterion: 3,
  after: [MAIN],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const revision = await revisionOf(agent, project);
    const written = await agent.ok("write_files", {
      project,
      files: { "flow.meltemi": FLOW, "sequence.meltemi": SEQUENCE },
      ifRevision: revision,
    });
    assert.equal(count(written["revision"]), revision + 1, "one change");
    const got = await agent.ok("get_project", { project });
    const paths = (got["files"] ?? []) as string[];
    assert.ok(paths.includes("flow.meltemi") && paths.includes("sequence.meltemi"), "both listed");
    const { files } = await filesOf(agent, project);
    assert.equal(files["flow.meltemi"], FLOW, "the flow reads back as written");
    assert.equal(files["sequence.meltemi"], SEQUENCE, "the sequence reads back as written");

    const flow = await agent.call("preview", { project, path: "flow.meltemi", format: "svg" });
    const sequence = await agent.call("preview", {
      project,
      path: "sequence.meltemi",
      format: "svg",
    });
    for (const [label, result] of [
      ["flow", flow],
      ["sequence", sequence],
    ] as const) {
      assert.ok(!result.isError, `the ${label}'s preview: ${refusalOf(result).code}`);
      assert.match(result.content[0]?.text ?? "", /^<svg\b/, `the ${label} is drawn as SVG`);
    }
    assert.notEqual(flow.content[0]?.text, sequence.content[0]?.text, "two different pictures");
    assert.equal(count(flow.structuredContent?.["relations"]), 1, "the flow's one relation");
    assert.equal(count(flow.structuredContent?.["elements"]), 2, "the flow's two elements");
    assert.ok(count(sequence.structuredContent?.["elements"]) >= 2, "the sequence's participants");
    state.drawn = { project, path: "flow.meltemi", format: "svg" };

    const png = await agent.call("preview", { project, path: "flow.meltemi", width: 640 });
    assert.ok(!png.isError, `the flow's PNG: ${refusalOf(png).code}`);
    const image = png.content.find((item) => item.type === "image");
    assert.equal(image?.mimeType, "image/png", "an image/png item");
    const decoded = readPng(Buffer.from(image?.data ?? "", "base64"));
    assert.equal(decoded.width, 640, "the PNG is 640 pixels wide");
    log(
      `two diagrams written at revision ${revision + 1}, read back and drawn apart; a PNG of 640`,
    );
  },
};

const stories: Step<SuiteState> = {
  name: "3 a story is authored, timed, inspected and preserved through concurrent edits",
  criterion: 3,
  after: [MAIN],
  async run({ state, log }) {
    const project = await createProject(state, "stories");
    await storyAuthoringJourney(first(state), text(project["id"]));
    log(
      "story created, timed and reordered; conflict preserved human source; scene boundaries previewed; only the authored story and its export deleted",
    );
  },
};

const retried: Step<SuiteState> = {
  name: "5 a retried creation or write with the same key makes one",
  criterion: 5,
  needs: ["token"],
  after: [MAIN],
  async run({ state, log }) {
    const agent = first(state);
    const key = `${PREFIX}${state.runId}-retry`;
    const once = await createProject(state, "retry", { idempotencyKey: key });
    const twice = await createProject(state, "retry", { idempotencyKey: key });
    assert.equal(twice["id"], once["id"], "the retry answers the same project");
    const name = `${PREFIX}${state.runId}-retry`;
    const listed = (await agent.ok("list_projects"))["projects"] as { name: string }[];
    assert.equal(listed.filter((p) => p.name === name).length, 1, "one project of that name");

    const project = text(once["id"]);
    const write = {
      project,
      files: { "returns.meltemi": EXTRA },
      ifRevision: 0,
      idempotencyKey: `${key}-write`,
    };
    const a = await agent.ok("write_files", write);
    const b = await agent.ok("write_files", write);
    assert.equal(b["revision"], a["revision"], "the retried write answers the same revision");
    assert.equal(await revisionOf(agent, project), 1, "the project changed once");
    log("a creation and a write, each sent twice with its key: one project, one change");
  },
};

const independent: Step<SuiteState> = {
  name: "4 a second project leaves the first's content and sharing as they were",
  criterion: 4,
  after: [TWO],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const before = await filesOf(agent, project);
    const sharingBefore = await agent.ok("get_sharing", { project });
    const other = await createProject(state, "second", {
      files: { "flow.meltemi": EXTRA },
      idempotencyKey: `${PREFIX}${state.runId}-second`,
    });
    const otherId = text(other["id"]);
    await agent.ok("write_files", {
      project: otherId,
      files: { "flow.meltemi": FLOW, "notes.meltemi": EXTRA },
      ifRevision: await revisionOf(agent, otherId),
    });
    await agent.ok("set_link_access", { project: otherId, level: "view" });
    const after = await filesOf(agent, project);
    assert.equal(after.revision, before.revision, "the first project's revision is unchanged");
    assert.deepEqual(after.files, before.files, "the first project's files are unchanged");
    assert.deepEqual(
      await agent.ok("get_sharing", { project }),
      sharingBefore,
      "the first project's sharing is unchanged",
    );
    assert.equal(sharingBefore["linkAccess"], "private", "the first project stays private");
    log("a second project written and shared; the first is as it was");
  },
};

const toolsAlone: Step<SuiteState> = {
  name: "6 a project made, checked, drawn and opened with the tools alone",
  criterion: 6,
  needs: ["token"],
  after: [CONNECT],
  async run({ state, log }) {
    const agent = first(state);
    const callsBefore = agent.calls;
    const project = await createProject(state, "template", {
      template: "flow",
      idempotencyKey: `${PREFIX}${state.runId}-template`,
    });
    const id = text(project["id"]);
    const got = await agent.ok("get_project", { project: id });
    const sheet = ((got["files"] ?? []) as string[]).find((path) => path.endsWith(".meltemi"));
    assert.ok(sheet, "the template gives a .meltemi file");
    const checked = await agent.ok("validate", { project: id });
    assert.equal(count(checked["errors"]), 0, "the project validates without an error");
    const drawn = await agent.call("preview", { project: id, path: sheet });
    assert.ok(!drawn.isError, `its preview: ${refusalOf(drawn).code}`);
    assert.ok(
      drawn.content.some((item) => item.type === "image"),
      "a picture",
    );
    const opened = await agent.ok("open_url", { project: id });
    assert.equal(text(opened["url"]), text(project["url"]), "open_url answers its address");
    log(`${agent.calls - callsBefore} tool calls, no folder, no pasted code, no setting by hand`);
  },
};

const PERSON = "10 a person's change is in the next read";

const personChange: Step<SuiteState> = {
  name: PERSON,
  criterion: 10,
  after: [TWO],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const { revision, files } = await filesOf(agent, project);
    const changed = files["flow.meltemi"]!.replace('pay["Pay"]', 'pay["Pay by card"]');
    // The person's change comes through another door than the agent's: the HTTP push, as the
    // command line and a page's fallback send it.
    const pushed = await http(state, `/api/projects/${encodeURIComponent(project)}/files`, {
      as: "first",
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "flow.meltemi": changed }, ifRevision: revision }),
    });
    assert.equal(pushed.status, 200, `the person's push answered ${pushed.status}`);
    const read = await filesOf(agent, project);
    assert.equal(read.revision, revision + 1, "the read is at the person's revision");
    assert.equal(read.files["flow.meltemi"], changed, "the read holds the person's text");
    log(`a person changed a label at revision ${revision + 1}; read_files has it`);
  },
};

const STALE = "11 a write on an old revision is refused and the person's change stays";

const staleWrite: Step<SuiteState> = {
  name: STALE,
  criterion: 11,
  after: [PERSON],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const now = await filesOf(agent, project);
    const refusal = await agent.refused(
      "write_files",
      { project, files: { "flow.meltemi": FLOW }, ifRevision: now.revision - 1 },
      "revision.mismatch",
    );
    assert.equal(count(refusal.fields["revision"]), now.revision, "it names the current revision");
    const after = await filesOf(agent, project);
    assert.equal(after.revision, now.revision, "nothing was written");
    assert.equal(after.files["flow.meltemi"], now.files["flow.meltemi"], "the person's text stays");
    log(`refused revision.mismatch naming ${now.revision}; the person's text is intact`);
  },
};

const RETRY = "12 a retried write adds its elements once";

const retriedWrite: Step<SuiteState> = {
  name: RETRY,
  criterion: 12,
  after: [STALE],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const now = await filesOf(agent, project);
    const write = {
      project,
      files: { "flow.meltemi": withShipping(now.files["flow.meltemi"]!) },
      ifRevision: now.revision,
      idempotencyKey: `${PREFIX}${state.runId}-ship`,
    };
    const a = await agent.ok("write_files", write);
    const b = await agent.ok("write_files", write);
    assert.equal(b["revision"], a["revision"], "the retry answers the same revision");
    assert.equal(await revisionOf(agent, project), now.revision + 1, "one change");
    const after = await filesOf(agent, project);
    assert.equal(after.files["flow.meltemi"]!.split('ship["Ship"]').length - 1, 1, "one ship");
    const report = await agent.ok("preview", { project, path: "flow.meltemi", format: "svg" });
    assert.equal(count(report["elements"]), 3, "three elements drawn, not four");
    assert.equal(count(report["relations"]), 2, "two relations drawn, not three");
    log("the same write sent twice: one change, one new element and one new relation");
  },
};

const INVALID = "13 an invalid change is refused whole";

const invalidChange: Step<SuiteState> = {
  name: INVALID,
  criterion: 13,
  after: [RETRY],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const now = await filesOf(agent, project);
    const refusal = await agent.refused(
      "write_files",
      {
        project,
        files: {
          "flow.meltemi": now.files["flow.meltemi"]!.replace("Cart", "Basket"),
          "broken.meltemi": BROKEN,
        },
        ifRevision: now.revision,
      },
      "diagram.invalid",
    );
    const diagnostics = (refusal.fields["diagnostics"] ?? []) as {
      path: string;
      severity: string;
      line: number;
    }[];
    assert.ok(
      diagnostics.some(
        (d) => d.path === "broken.meltemi" && d.severity === "error" && d.line === 2,
      ),
      "the error is named with its file and line",
    );
    const after = await filesOf(agent, project);
    assert.equal(after.revision, now.revision, "the revision is unchanged");
    assert.equal(
      after.files["flow.meltemi"],
      now.files["flow.meltemi"],
      "the valid half is not written",
    );
    assert.ok(!("broken.meltemi" in after.files), "the invalid file is not written");
    log("refused diagram.invalid at broken.meltemi line 2; nothing of the push was written");
  },
};

const IMAGE = "14 an uploaded image is in the project, the board's bytes and the preview";

const image: Step<SuiteState> = {
  name: IMAGE,
  criterion: 14,
  after: [INVALID],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const bytes = testImage();
    const uploaded = await agent.ok("upload_image", {
      project,
      path: IMAGE_PATH,
      data: Buffer.from(bytes).toString("base64"),
    });
    const hash = text(uploaded["hash"]);
    assert.equal(hash, sha256(bytes), "the hash is the file's SHA-256");
    await agent.ok("write_files", {
      project,
      files: { "brand.meltemi": BRAND },
      ifRevision: await revisionOf(agent, project),
    });
    const read = await filesOf(agent, project);
    assert.equal(read.binaries[IMAGE_PATH], hash, "read_files lists the image by its hash");
    // What the board reads: the bytes by their hash.
    const blob = await http(state, `/api/projects/${encodeURIComponent(project)}/blobs/${hash}`, {
      as: "first",
    });
    assert.equal(blob.status, 200, `the board's read of the image answered ${blob.status}`);
    const svg = await agent.call("preview", { project, path: "brand.meltemi", format: "svg" });
    assert.ok(!svg.isError, `the preview: ${refusalOf(svg).code}`);
    assert.match(svg.content[0]?.text ?? "", /<image\b[^>]*data:image\/png;base64,/, "embedded");
    const report = svg.structuredContent ?? {};
    const codes = ((report["diagnostics"] ?? []) as { code: string }[]).map((d) => d.code);
    assert.ok(!codes.includes("layout.image-unavailable"), "the image is drawn, not a placeholder");
    assert.deepEqual(report["estimatedFonts"], [], "every font drawn is one the server holds");
    const png = await agent.call("preview", { project, path: "brand.meltemi", width: 320 });
    assert.ok(!png.isError, `the PNG: ${refusalOf(png).code}`);
    log("uploaded, listed by its hash, served to the board and drawn in both formats");
  },
};

const RENDER = "15 a failed preview keeps the save, and only the preview is asked again";

const failedRender: Step<SuiteState> = {
  name: RENDER,
  criterion: 15,
  after: [IMAGE],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    const now = await filesOf(agent, project);
    const saved = await agent.ok("write_files", {
      project,
      files: { "flow.meltemi": now.files["flow.meltemi"]!.replace('"Ship"', '"Ship today"') },
      ifRevision: now.revision,
    });
    const revision = count(saved["revision"]);
    assert.equal(revision, now.revision + 1, "the save answers its revision");
    await agent.refused("preview", {
      project,
      path: "flow.meltemi",
      diagram: `${PREFIX}missing`,
      format: "svg",
    });
    assert.equal(await revisionOf(agent, project), revision, "the failed preview changed nothing");
    const read = await filesOf(agent, project);
    assert.ok(read.files["flow.meltemi"]!.includes("Ship today"), "the save stands");
    const again = await agent.ok("preview", { project, path: "flow.meltemi", format: "svg" });
    assert.equal(count(again["revision"]), revision, "the preview asked again draws the save");
    log(
      `saved at ${revision}; a preview refused; the preview alone, asked again, drew ${revision}`,
    );
  },
};

const ADDED = "16 an added diagram answers the address that opens it";

const added: Step<SuiteState> = {
  name: ADDED,
  criterion: 16,
  after: [RENDER],
  async run({ state, log }) {
    const agent = first(state);
    const project = mainId(state);
    await agent.ok("write_files", {
      project,
      files: { "returns.meltemi": EXTRA },
      ifRevision: await revisionOf(agent, project),
    });
    const paths = ((await agent.ok("get_project", { project }))["files"] ?? []) as string[];
    assert.ok(paths.includes("returns.meltemi"), "the new diagram is listed");
    const url = text((await agent.ok("open_url", { project }))["url"]);
    assert.equal(url, state.main!.url, "open_url answers the project's address");
    const page = await http(state, url);
    assert.equal(page.status, 200, `the address answered ${page.status}`);
    log("the address opens the project with its new diagram (focusing it is the voice half)");
  },
};

const foreign: Step<SuiteState> = {
  name: "26 another account gets nothing of a project it was not given",
  criterion: 26,
  needs: ["token", "token2"],
  after: [ADDED, CONNECT_SECOND],
  async run({ state, log }) {
    const owner = first(state);
    const stranger = second(state);
    const project = mainId(state);
    // A picture the owner drew is in the renderer's cache: the stranger asks for the same one.
    await owner.ok("preview", state.drawn!);
    for (const [name, args] of [
      ["get_project", { project }],
      ["read_files", { project }],
      ["validate", { project }],
      ["preview", state.drawn!],
      ["open_url", { project }],
      ["list_versions", { project }],
      ["get_sharing", { project }],
      ["get_live", { project }],
      ["list_publications", { project }],
      ["write_files", { project, files: { "x.meltemi": FLOW }, ifRevision: 0 }],
      ["create_version", { project }],
    ] as const) {
      await notFound(stranger, name, args);
    }
    const guessed = guessedId();
    for (const name of ["get_project", "read_files"])
      await notFound(stranger, name, { project: guessed });
    const listed = (await stranger.ok("list_projects"))["projects"] as { id: string }[];
    assert.ok(!listed.some((p) => p.id === project), "the stranger's list does not hold it");
    const files = await http(state, `/api/projects/${encodeURIComponent(project)}/files`, {
      as: "second",
    });
    assert.equal(files.status, 404, `the stranger's HTTP read answered ${files.status}`);
    const anonymous = await anonymousFiles(state, project);
    assert.equal(anonymous.status, 404, `an anonymous read answered ${anonymous.status}`);
    log("eleven tools, a guessed id, a cached preview and HTTP: project.not-found, nothing more");
  },
};

const SHARED = "23 create, draw and share in one go, without the server asking";

const oneGo: Step<SuiteState> = {
  name: SHARED,
  criterion: 23,
  needs: ["token"],
  after: [CONNECT],
  async run({ state, log }) {
    const agent = first(state);
    const callsBefore = agent.calls;
    const project = await createProject(state, "shared", {
      idempotencyKey: `${PREFIX}${state.runId}-shared`,
    });
    const id = text(project["id"]);
    await agent.ok("write_files", {
      project: id,
      files: { "flow.meltemi": FLOW, "sequence.meltemi": SEQUENCE },
      ifRevision: 0,
      idempotencyKey: `${PREFIX}${state.runId}-shared-write`,
    });
    const shared = await agent.ok("set_link_access", { project: id, level: "view" });
    assert.equal(shared["linkAccess"], "view", "the link reads");
    assert.equal(text(shared["link"]), projectLink(state, id), "the answer is the project's link");
    state.shared = { id };
    // Every call was answered at once: none was refused, and the client, which declares no
    // elicitation, was never asked to confirm (a request it cannot answer would have failed a call).
    log(`${agent.calls - callsBefore} calls, each answered at once: created, two diagrams, shared`);
  },
};

const readLink: Step<SuiteState> = {
  name: "17 a read link opened from an independent session",
  criterion: 17,
  after: [SHARED],
  async run({ state, log }) {
    const project = sharedId(state);
    const link = await http(state, projectLink(state, project));
    assert.equal(link.status, 302, `the link answered ${link.status}`);
    assert.equal(link.headers.get("Location"), `/?project=${project}`, "it opens the app on it");
    const page = await http(state, `/?project=${project}`);
    assert.equal(page.status, 200, `the app answered ${page.status}`);
    const files = await anonymousFiles(state, project);
    assert.equal(files.status, 200, `an anonymous read answered ${files.status}`);
    const held = Object.keys((files.json()["files"] ?? {}) as Record<string, string>);
    assert.ok(held.includes("flow.meltemi") && held.includes("sequence.meltemi"), "both read");
    const push = await http(state, `/api/projects/${encodeURIComponent(project)}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "x.meltemi": FLOW } }),
    });
    assert.ok([401, 403].includes(push.status), `an anonymous push answered ${push.status}`);
    if (state.local) {
      // Through the local server the run asks nothing of the endpoint: its door is another run's.
      log("anonymously: the link opens the app, the files read and a push is refused");
      return;
    }
    const tools = await http(state, new URL(state.target.endpoint).pathname, rpc("tools/list"));
    assert.equal(tools.status, 401, `an anonymous MCP client answered ${tools.status}`);
    log("anonymously: the link opens the app, the files read, a push and the tools are refused");
  },
};

const INVITED = "18 an invitation says what was made, and that no email was sent";

const invitation: Step<SuiteState> = {
  name: INVITED,
  criterion: 18,
  after: [SHARED],
  async run({ state, secret, log }) {
    const agent = first(state);
    const project = sharedId(state);
    const email = `${PREFIX}${state.runId}@example.com`;
    const result = await agent.call("invite", { project, email, role: "editor" });
    assert.ok(!result.isError, `invite: ${refusalOf(result).code}`);
    const answer = result.structuredContent ?? {};
    const link = text(answer["link"]);
    secret(link);
    const token = inviteToken(link);
    secret(token);
    assert.equal(answer["emailSent"], false, "emailSent is false");
    const made = (answer["invitation"] ?? {}) as Record<string, unknown>;
    assert.equal(made["email"], email, "for the address asked");
    assert.equal(made["role"], "editor", "with the role asked");
    assert.ok(
      result.content.some(
        (item) => item.type === "text" && /"emailSent":\s*false/.test(item.text ?? ""),
      ),
      "the text the client shows says no email was sent",
    );
    const listed = (await agent.ok("list_invitations", { project }))["invitations"] as {
      id: string;
    }[];
    assert.ok(
      listed.some((i) => i.id === made["id"]),
      "list_invitations lists it",
    );
    state.invitation = { id: text(made["id"]), token };
    log("an editor's invitation made and listed; its answer says emailSent false");
  },
};

const WITHDRAWN = "19 the link withdrawn and the invitation revoked, checked";

const withdrawn: Step<SuiteState> = {
  name: WITHDRAWN,
  criterion: 19,
  after: [INVITED, "17 a read link opened from an independent session"],
  async run({ state, log }) {
    const agent = first(state);
    const project = sharedId(state);
    const closed = await agent.ok("set_link_access", { project, level: "private" });
    assert.equal(closed["linkAccess"], "private", "the link is private");
    const files = await anonymousFiles(state, project);
    assert.equal(files.status, 404, `an anonymous read answered ${files.status} once private`);
    await agent.ok("revoke_invitation", { project, invitation: state.invitation!.id });
    const listed = (await agent.ok("list_invitations", { project }))["invitations"] as {
      id: string;
    }[];
    assert.ok(!listed.some((i) => i.id === state.invitation!.id), "the invitation is gone");
    // The revoked link opens nothing, for whoever holds it.
    const accept = await http(state, `/api/invitations/${state.invitation!.token}/accept`, {
      as: state.tokens.second ? "second" : "first",
      method: "POST",
    });
    assert.equal(accept.status, 404, `the revoked invitation's link answered ${accept.status}`);
    const sharing = await agent.ok("get_sharing", { project });
    assert.deepEqual(sharing["invitations"] ?? [], [], "no invitation is pending");
    log("private: anonymous readers refused; the invitation revoked and its link dead");
  },
};

const VIEWER = "24 a viewer cannot edit, create in or share the project";

const viewer: Step<SuiteState> = {
  name: VIEWER,
  criterion: 24,
  needs: ["token", "token2"],
  after: [WITHDRAWN, CONNECT_SECOND],
  async run({ state, secret, log }) {
    const owner = first(state);
    const member = second(state);
    const project = sharedId(state);
    const invited = await owner.call("invite", {
      project,
      email: state.secondAccount!.email,
      role: "viewer",
    });
    assert.ok(!invited.isError, `invite: ${refusalOf(invited).code}`);
    const link = text(invited.structuredContent?.["link"]);
    secret(link);
    const token = inviteToken(link);
    secret(token);
    const accepted = await http(state, `/api/invitations/${token}/accept`, {
      as: "second",
      method: "POST",
    });
    assert.equal(
      accepted.status,
      200,
      `the second account's acceptance answered ${accepted.status}`,
    );
    assert.equal(accepted.json()["role"], "viewer", "the second account is a viewer");
    const before = await revisionOf(member, project);
    await member.ok("read_files", { project });
    const listed = (await member.ok("list_projects"))["projects"] as { id: string; role: string }[];
    assert.equal(listed.find((p) => p.id === project)?.role, "viewer", "listed as a viewer");
    for (const [name, args] of [
      ["write_files", { project, files: { "x.meltemi": FLOW }, ifRevision: before }],
      [
        "upload_image",
        { project, path: "assets/x.png", data: Buffer.from(testImage()).toString("base64") },
      ],
      ["create_version", { project, label: "viewer" }],
      ["rename_project", { project, name: `${PREFIX}renamed` }],
      ["set_link_access", { project, level: "view" }],
      ["invite", { project, email: `${PREFIX}viewer@example.com`, role: "viewer" }],
      ["start_live", { project }],
    ] as const) {
      await member.refused(name, args, "access.denied");
    }
    assert.equal(await revisionOf(owner, project), before, "nothing changed");
    const sharing = await owner.ok("get_sharing", { project });
    assert.equal(sharing["linkAccess"], "private", "the link level is the owner's");
    log("the viewer reads; seven writes, creations and sharing calls refused access.denied");
  },
};

const EDITOR = "25 an editor with every scope gets no owner's power";

const editor: Step<SuiteState> = {
  name: EDITOR,
  criterion: 25,
  after: [VIEWER],
  async run({ state, log }) {
    const owner = first(state);
    const member = second(state);
    const project = sharedId(state);
    const sub = state.secondAccount!.sub;
    const changed = await owner.ok("set_member_role", { project, member: sub, role: "editor" });
    assert.equal(changed["role"], "editor", "the member is an editor");
    const me = await member.ok("whoami");
    assert.deepEqual(
      [...((me["scopes"] ?? []) as string[])].sort(),
      [...EVERY_SCOPE].sort(),
      "the editor's connection holds every scope",
    );
    const written = await member.ok("write_files", {
      project,
      files: { "editor.meltemi": EXTRA },
      ifRevision: await revisionOf(member, project),
    });
    assert.ok(count(written["revision"]) > 0, "the editor writes");
    for (const [name, args] of [
      ["set_link_access", { project, level: "edit" }],
      ["invite", { project, email: `${PREFIX}editor@example.com`, role: "editor" }],
      ["set_member_role", { project, member: sub, role: "editor" }],
      ["remove_member", { project, member: sub }],
      ["rename_project", { project, name: `${PREFIX}renamed` }],
      ["start_live", { project }],
      ["publish", { project, slug: `${PREFIX}editor` }],
    ] as const) {
      await member.refused(name, args, "access.denied");
    }
    const sharing = await owner.ok("get_sharing", { project });
    assert.equal(sharing["linkAccess"], "private", "the link level is unchanged");
    log("the editor writes; seven of the owner's calls refused access.denied");
  },
};

const member: Step<SuiteState> = {
  name: "19 a member removed while the link still reads, then the link withdrawn",
  criterion: 19,
  after: [EDITOR],
  async run({ state, log }) {
    const owner = first(state);
    const other = second(state);
    const project = sharedId(state);
    const sub = state.secondAccount!.sub;
    await owner.ok("set_link_access", { project, level: "view" });
    await owner.ok("remove_member", { project, member: sub });
    const sharing = await owner.ok("get_sharing", { project });
    const members = (sharing["members"] ?? []) as { sub: string }[];
    assert.ok(!members.some((m) => m.sub === sub), "the member is gone");
    // Another way in is still open: the link reads, so the account reads, as a viewer only.
    const role = (await other.ok("get_project", { project }))["role"];
    assert.equal(role, "viewer", "through the link, the former member is a viewer");
    await other.refused(
      "write_files",
      { project, files: { "x.meltemi": FLOW }, ifRevision: await revisionOf(other, project) },
      "access.denied",
    );
    await owner.ok("set_link_access", { project, level: "private" });
    await notFound(other, "read_files", { project });
    log("removed: the link still let it read as a viewer, and once private nothing at all");
  },
};

const live: Step<SuiteState> = {
  name: "20 a live session started and ended, with its term and scope",
  criterion: 20,
  after: [SHARED],
  async run({ state, secret, log }) {
    const agent = first(state);
    const project = sharedId(state);
    const started = await agent.call("start_live", { project, guestsEdit: false });
    assert.ok(!started.isError, `start_live: ${refusalOf(started).code}`);
    state.live.push(project);
    const session = started.structuredContent ?? {};
    const link = text(session["link"]);
    secret(link);
    const token = new URL(link).searchParams.get("live");
    if (token) secret(token);
    assert.equal(session["guestsEdit"], false, "guests look and do not edit");
    const hours =
      (Date.parse(text(session["until"])) - Date.parse(text(session["startedAt"]))) / 3.6e6;
    assert.ok(hours > 23.9 && hours <= 24.1, "the session lasts 24 hours");
    const got = (await agent.ok("get_live", { project }))["live"] as Record<string, unknown> | null;
    assert.equal(got?.["id"], session["id"], "get_live answers the session");
    assert.equal(got?.["until"], session["until"], "with its term");
    const again = await agent.call("start_live", { project, guestsEdit: false });
    assert.equal(again.structuredContent?.["id"], session["id"], "starting again answers the same");
    await agent.ok("end_live", { project });
    const ended = await agent.ok("get_live", { project });
    assert.equal(ended["live"], null, "get_live answers null once ended");
    state.live.splice(state.live.indexOf(project), 1);
    log("started for 24 hours, looking only; answered again; ended");
  },
};

const PUBLISHED = "21 a catalog published and read back";

const published: Step<SuiteState> = {
  name: PUBLISHED,
  criterion: 21,
  after: [SHARED],
  async run({ state, log }) {
    const agent = first(state);
    const project = sharedId(state);
    await ensureHandle(state, log);
    const slug = `${PREFIX}${state.runId}`;
    const result = await agent.ok("publish", { project, slug });
    state.publications.push({ project, slug });
    const url = text(result["url"]);
    assert.ok(url.endsWith(`/${slug}/`), "the address ends with the slug");
    assert.ok(count(result["entries"]) >= 2, "the catalog holds both diagrams");
    const page = await http(state, url);
    assert.equal(page.status, 200, `the published page answered ${page.status}`);
    assert.match(page.text, /^<!doctype html>/i, "an HTML page");
    const listed = (await agent.ok("list_publications", { project }))["publications"] as {
      slug: string;
    }[];
    assert.ok(
      listed.some((p) => p.slug === slug),
      "list_publications lists it",
    );
    log(`published with ${count(result["entries"])} entries; read back anonymously`);
  },
};

const republished: Step<SuiteState> = {
  name: "22 a publication updated and withdrawn, the others untouched",
  criterion: 22,
  after: [PUBLISHED, MAIN],
  async run({ state, log }) {
    const agent = first(state);
    const project = sharedId(state);
    const before = await filesOf(agent, mainId(state));
    const slug = `${PREFIX}${state.runId}`;
    const other = `${slug}-b`;
    const b = await agent.ok("publish", { project, slug: other });
    state.publications.push({ project, slug: other });
    const updated = await agent.ok("publish", { project, slug });
    const url = text(updated["url"]);
    assert.equal((await http(state, url)).status, 200, "the updated page serves");
    await agent.ok("unpublish", { project, slug });
    state.publications.splice(
      state.publications.findIndex((p) => p.slug === slug),
      1,
    );
    assert.ok(
      await eventually(async () => (await http(state, url)).status === 404),
      "the withdrawn page answers 404",
    );
    assert.equal((await http(state, text(b["url"]))).status, 200, "the other page still serves");
    const listed = (await agent.ok("list_publications", { project }))["publications"] as {
      slug: string;
    }[];
    assert.ok(
      listed.some((p) => p.slug === other) && !listed.some((p) => p.slug === slug),
      "listed",
    );
    const after = await filesOf(agent, mainId(state));
    assert.equal(after.revision, before.revision, "another project is untouched");
    log("updated in place, withdrawn (404), the other publication and project untouched");
  },
};

const CLEANUP = "cleanup: nothing the run made remains";

const cleanup: Step<SuiteState> = {
  name: CLEANUP,
  criterion: null,
  needs: ["token"],
  async run({ state, log }) {
    const agent = state.first;
    for (const project of [...state.live]) {
      await agent?.call("end_live", { project }).catch(() => undefined);
    }
    for (const { project, slug } of [...state.publications]) {
      await agent?.call("unpublish", { project, slug }).catch(() => undefined);
    }
    const left: string[] = [];
    for (const project of state.created) {
      const deleted = await http(state, `/api/projects/${encodeURIComponent(project)}`, {
        as: "first",
        method: "DELETE",
      });
      if (deleted.status !== 204 && deleted.status !== 404)
        left.push(`${project} (${deleted.status})`);
    }
    const listed = await http(state, "/api/projects", { as: "first" });
    assert.equal(listed.status, 200, `GET /api/projects answered ${listed.status}`);
    const remaining = ((listed.json()["projects"] ?? []) as { id: string; name: string }[]).filter(
      (project) =>
        state.created.includes(project.id) || project.name.startsWith(`${PREFIX}${state.runId}`),
    );
    assert.deepEqual(left, [], "every project the run made was deleted");
    assert.deepEqual(
      remaining.map((p) => p.id),
      [],
      "no project of the run is listed",
    );
    await state.first?.close();
    await state.second?.close();
    log(`deleted ${state.created.length} project(s); none of the run's is listed`);
  },
};

const secrets: Step<SuiteState> = {
  name: "29 nothing that grants access is in the run's log",
  criterion: 29,
  async run({ log, state, leaks, holdsSecret }) {
    // The run's own log is scanned line by line as it is written: a step whose line held a secret
    // has already failed, naming itself, and is named here again.
    const held = leaks();
    assert.ok(
      held.length === 0,
      `the log of ${held.join(", ")} held what grants access (redacted)`,
    );
    log("the run's log holds no token, bearer credential, invitation or live link, or code");
    if (state.local) {
      // The local servers' standard error: one line a call, none holding what grants access.
      const local = readFileSync(state.local.log, "utf8").split(/\r?\n/);
      const held = local.filter((line) => holdsSecret(line)).length;
      assert.equal(held, 0, `${held} line(s) of mdg mcp's log hold what grants access`);
      log(
        `the local servers' lines (${local.length} in their log) hold no token, access link or code`,
      );
    }
    if (!state.serverLog) {
      log("the Worker's log is not read here (MELTEMI_SERVER_LOG is not set)");
      return;
    }
    // The Worker's own lines must hold nothing. The platform's request lines (wrangler's
    // `[wrangler:info] POST /path 200 OK`, as Cloudflare's invocation logs record addresses) are
    // counted apart and reported: an address that carries an invitation's token is the API's
    // shape, not something the Worker printed.
    const lines = readFileSync(state.serverLog, "utf8").split(/\r?\n/);
    const request = /^\S*\[wrangler:(?:info|warn)\]\s+[A-Z]+\s+\//;
    const worker = lines.filter((line) => !request.test(line) && holdsSecret(line)).length;
    const platform = lines.filter((line) => request.test(line) && holdsSecret(line)).length;
    if (platform > 0) {
      log(
        `finding: ${platform} request line(s) of the platform's log carry an access token in their address (not printed)`,
      );
    }
    assert.equal(worker, 0, `${worker} line(s) the Worker printed hold what grants access`);
    log(`the Worker's own lines (${lines.length} in the log) hold no token, access link or code`);
  },
};

/** Every step, in the order the run takes them. */
export const STEPS: readonly Step<SuiteState>[] = [
  discovery,
  challenge,
  foreignTokens,
  wrongResource,
  inventedGrants,
  connect,
  connectSecond,
  grantedTokens,
  refreshAndRevoke,
  created,
  twoDiagrams,
  stories,
  retried,
  independent,
  toolsAlone,
  personChange,
  staleWrite,
  retriedWrite,
  invalidChange,
  image,
  failedRender,
  added,
  foreign,
  oneGo,
  readLink,
  invitation,
  withdrawn,
  viewer,
  editor,
  member,
  live,
  published,
  republished,
  cleanup,
  secrets,
];
