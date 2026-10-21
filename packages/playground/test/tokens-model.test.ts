import { describe, expect, it } from "vitest";
import {
  tokenApi,
  type ApiToken,
  type NewToken,
  type Outcome,
  type TokenApi,
  type TokenWords,
} from "../src/cloud/tokens.js";
import { TokensModel, type TokensState } from "../src/cloud/tokens-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch, jsonResponse } from "./support/fake-fetch.js";

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code?: string, message?: string): Outcome<never> => ({
  ok: false,
  failure: {
    kind: "refused",
    status,
    ...(code === undefined ? {} : { code }),
    ...(message === undefined ? {} : { message }),
  },
});
const unreachable: Outcome<never> = { ok: false, failure: { kind: "unreachable", status: 0 } };

const token = (id: string, name = id): ApiToken => ({
  id,
  name,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: null,
});
const made = (id: string, name: string): NewToken => ({ id, name, token: `mdg_SECRET-${id}` });

/** An outcome the test settles itself, to hold a call in the air. */
function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

type Pending<T> = Outcome<T> | Promise<Outcome<T>>;

/** A `TokenApi` that answers from queues, in order, and refuses a call nobody expected. */
function scripted(script: {
  list?: Pending<ApiToken[]>[];
  create?: Pending<NewToken>[];
  revoke?: Pending<null>[];
}) {
  const queues = {
    list: [...(script.list ?? [])],
    create: [...(script.create ?? [])],
    revoke: [...(script.revoke ?? [])],
  };
  const calls: string[] = [];
  const next = <T>(kind: keyof typeof queues, label: string): Promise<Outcome<T>> => {
    calls.push(label);
    const outcome = queues[kind].shift() as Pending<T> | undefined;
    if (outcome === undefined) throw new Error(`Nobody expected ${label}`);
    return Promise.resolve(outcome);
  };
  const api: TokenApi = {
    list: () => next("list", "list"),
    create: (name) => next("create", `create ${name}`),
    revoke: (id) => next("revoke", `revoke ${id}`),
  };
  return { api, calls };
}

function modelOver(api: TokenApi, words: () => TokenWords = () => en.tokens) {
  const states: TokensState[] = [];
  const model = new TokensModel(api, words, (state) => states.push(state));
  return { model, states };
}

describe("TokensModel", () => {
  it("starts with nothing known and nothing said", () => {
    const { api } = scripted({});
    const { model, states } = modelOver(api);
    expect(model.state).toEqual({
      list: "loading",
      tokens: [],
      busy: false,
      revealed: undefined,
      status: "",
      problem: "",
    });
    expect(states).toEqual([]);
  });

  describe("load", () => {
    it("reads the list, saying it is loading meanwhile", async () => {
      const { api, calls } = scripted({ list: [ok([token("t1", "laptop"), token("t2", "CI")])] });
      const { model, states } = modelOver(api);
      await model.load();
      expect(calls).toEqual(["list"]);
      expect(states.map((state) => [state.list, state.status])).toEqual([
        ["loading", "Loading your tokens…"],
        ["ready", ""],
      ]);
      expect(model.state).toMatchObject({
        list: "ready",
        tokens: [token("t1", "laptop"), token("t2", "CI")],
        busy: false,
        problem: "",
      });
      expect(model.state).toBe(states[states.length - 1]);
    });

    it("says why it could not, and tries again when asked", async () => {
      const { api } = scripted({ list: [unreachable, ok([token("t1")])] });
      const { model } = modelOver(api);
      await model.load();
      expect(model.state).toMatchObject({
        list: "failed",
        tokens: [],
        status: "",
        problem: en.tokens.unreachable,
      });
      await model.load();
      expect(model.state).toMatchObject({ list: "ready", tokens: [token("t1")], problem: "" });
    });

    it("tells a person who has signed out to sign in again", async () => {
      const { api } = scripted({ list: [refused(401, "auth.required", "Sign in.")] });
      const { model } = modelOver(api);
      await model.load();
      expect(model.state).toMatchObject({ list: "failed", problem: en.tokens.signedOut });
    });
  });

  describe("create", () => {
    it("makes a token with the trimmed name, shows it, and reads the list again", async () => {
      const { api, calls } = scripted({
        list: [ok([token("t1", "CI")]), ok([token("t2", "laptop"), token("t1", "CI")])],
        create: [ok(made("t2", "laptop"))],
      });
      const { model, states } = modelOver(api);
      await model.load();
      states.length = 0;

      expect(await model.create("  laptop  ")).toBe(true);
      expect(calls).toEqual(["list", "create laptop", "list"]);
      // First the call is on its way, then the token is shown, then the list catches up.
      expect(states.map((s) => [s.busy, s.revealed?.id, s.status])).toEqual([
        [true, undefined, "Creating the token…"],
        [true, "t2", "Created the token laptop."],
        [false, "t2", "Created the token laptop."],
      ]);
      expect(model.state).toMatchObject({
        busy: false,
        list: "ready",
        revealed: { id: "t2", name: "laptop", token: "mdg_SECRET-t2" },
        tokens: [token("t2", "laptop"), token("t1", "CI")],
        problem: "",
      });
    });

    it("shows the token before it reads the list again, so that nothing can lose it", async () => {
      const reading = deferred<Outcome<ApiToken[]>>();
      const { api } = scripted({
        list: [reading.promise],
        create: [ok(made("t2", "laptop"))],
      });
      const { model } = modelOver(api);
      const creation = model.create("laptop");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(model.state.revealed?.token).toBe("mdg_SECRET-t2");
      expect(model.state.busy).toBe(true);
      reading.settle(ok([token("t2", "laptop")]));
      expect(await creation).toBe(true);
      expect(model.state.busy).toBe(false);
    });

    it("refuses a name before it reaches the service, in the page's words", async () => {
      const { api, calls } = scripted({});
      const { model } = modelOver(api);
      const cases: [string, string][] = [
        ["", "Give the token a name."],
        ["   ", "Give the token a name."],
        ["x".repeat(61), "The name takes at most 60 characters."],
        ["a\tb", "The name cannot hold control characters."],
      ];
      for (const [typed, problem] of cases) {
        expect(await model.create(typed), JSON.stringify(typed)).toBe(false);
        expect(model.state).toMatchObject({
          busy: false,
          problem,
          status: "",
          revealed: undefined,
        });
      }
      expect(calls).toEqual([]);
    });

    it("sends nothing while another call is on its way", async () => {
      const first = deferred<Outcome<NewToken>>();
      const { api, calls } = scripted({
        create: [first.promise],
        list: [ok([token("t1", "one")])],
      });
      const { model } = modelOver(api);
      const creation = model.create("one");
      expect(model.state.busy).toBe(true);
      expect(await model.create("two")).toBe(false);
      expect(await model.revoke(token("t9"))).toBe(false);
      expect(calls).toEqual(["create one"]);
      first.settle(ok(made("t1", "one")));
      expect(await creation).toBe(true);
      expect(calls).toEqual(["create one", "list"]);
    });

    it("says why the service refused, and shows no token", async () => {
      const { api } = scripted({
        create: [
          refused(413, "quota.tokens", "You hold the most tokens."),
          unreachable,
          refused(403, "request.forbidden", "Not from this page."),
        ],
      });
      const { model } = modelOver(api);

      expect(await model.create("one")).toBe(false);
      expect(model.state).toMatchObject({
        busy: false,
        revealed: undefined,
        status: "",
        problem:
          "An account holds at most 20 tokens. Revoke one you no longer use, then create this one.",
      });
      expect(await model.create("one")).toBe(false);
      expect(model.state.problem).toBe(en.tokens.unreachable);
      expect(await model.create("one")).toBe(false);
      expect(model.state.problem).toBe("Not from this page. (request.forbidden)");
      expect(model.state.busy).toBe(false);
    });

    it("keeps the token it made when the list cannot be read afterwards", async () => {
      const { api } = scripted({
        list: [ok([token("t1")]), unreachable],
        create: [ok(made("t2", "laptop"))],
      });
      const { model } = modelOver(api);
      await model.load();
      expect(await model.create("laptop")).toBe(true);
      expect(model.state).toMatchObject({
        busy: false,
        list: "ready",
        tokens: [token("t1")],
        revealed: { token: "mdg_SECRET-t2" },
        problem: en.tokens.unreachable,
      });
    });

    it("forgets the token it showed when it makes the next one", async () => {
      const { api } = scripted({
        list: [ok([]), ok([])],
        create: [ok(made("t1", "one")), ok(made("t2", "two"))],
      });
      const { model } = modelOver(api);
      await model.create("one");
      await model.create("two");
      expect(model.state.revealed?.id).toBe("t2");
      expect(JSON.stringify(model.state)).not.toContain("mdg_SECRET-t1");
    });
  });

  describe("revoke", () => {
    const held = [token("t1", "laptop"), token("t2", "CI")];

    it("revokes the token and takes it from the list", async () => {
      const { api, calls } = scripted({ list: [ok(held)], revoke: [ok(null)] });
      const { model } = modelOver(api);
      await model.load();
      expect(await model.revoke(held[0]!)).toBe(true);
      expect(calls).toEqual(["list", "revoke t1"]);
      expect(model.state).toMatchObject({
        busy: false,
        tokens: [token("t2", "CI")],
        status: "Revoked the token laptop.",
        problem: "",
      });
    });

    it("takes a token that was already revoked elsewhere for revoked", async () => {
      const { api } = scripted({
        list: [ok(held)],
        revoke: [refused(404, "not-found", "There is no such token.")],
      });
      const { model } = modelOver(api);
      await model.load();
      expect(await model.revoke(held[0]!)).toBe(true);
      expect(model.state).toMatchObject({
        busy: false,
        tokens: [token("t2", "CI")],
        status: "That token was already revoked.",
        problem: "",
      });
    });

    it("keeps the token and says why when the service refuses or cannot be reached", async () => {
      const { api } = scripted({
        list: [ok(held)],
        revoke: [refused(500), unreachable, refused(401, "auth.required", "Sign in.")],
      });
      const { model } = modelOver(api);
      await model.load();
      expect(await model.revoke(held[0]!)).toBe(false);
      expect(model.state).toMatchObject({
        busy: false,
        tokens: held,
        problem: "The service answered with status 500.",
      });
      expect(await model.revoke(held[0]!)).toBe(false);
      expect(model.state).toMatchObject({ tokens: held, problem: en.tokens.unreachable });
      expect(await model.revoke(held[0]!)).toBe(false);
      expect(model.state).toMatchObject({ tokens: held, problem: en.tokens.signedOut });
      expect(model.state.busy).toBe(false);
    });

    it("drops the new token's field when that token is revoked, and keeps it for another", async () => {
      const { api } = scripted({
        list: [ok([]), ok([token("t1", "one")])],
        create: [ok(made("t1", "one"))],
        revoke: [ok(null), ok(null)],
      });
      const { model } = modelOver(api);
      await model.load();
      await model.create("one");
      expect(model.state.revealed?.id).toBe("t1");
      // Another token is revoked: the new one stays.
      await model.revoke(token("t9", "other"));
      expect(model.state.revealed?.id).toBe("t1");
      // The new one is revoked: it cannot be copied any more.
      await model.revoke(token("t1", "one"));
      expect(model.state.revealed).toBeUndefined();
      expect(JSON.stringify(model.state)).not.toContain("mdg_SECRET");
    });
  });

  describe("forget", () => {
    it("drops the token that was shown, and tells the dialog once", async () => {
      const { api } = scripted({
        list: [ok([token("t1", "one")])],
        create: [ok(made("t1", "one"))],
      });
      const { model, states } = modelOver(api);
      await model.create("one");
      expect(model.state.revealed).toBeDefined();
      states.length = 0;
      model.forget();
      expect(model.state.revealed).toBeUndefined();
      expect(states).toHaveLength(1);
      expect(JSON.stringify(model.state)).not.toContain("mdg_SECRET");
      // Nothing left to forget: nothing to tell.
      model.forget();
      expect(states).toHaveLength(1);
    });
  });

  it("speaks the language the page has when it speaks, not the one it had when it began", async () => {
    let words: TokenWords = en.tokens;
    const { api } = scripted({ list: [unreachable] });
    const { model } = modelOver(api, () => words);
    expect(await model.create("")).toBe(false);
    expect(model.state.problem).toBe("Give the token a name.");
    words = es.tokens;
    expect(await model.create("")).toBe(false);
    expect(model.state.problem).toBe("Escribe un nombre para el token.");
    await model.load();
    expect(model.state.problem).toBe(es.tokens.unreachable);
  });
});

/** The service as the Worker answers, in memory: tokens, the quota and the codes of its refusals. */
function service(options: { held?: number; signedIn?: boolean } = {}) {
  const rows: { id: string; name: string; created_at: string; last_used_at: string | null }[] = [];
  let counter = 0;
  const add = (name: string) => {
    counter++;
    const row = {
      id: `t${counter}`,
      name,
      created_at: "2026-10-01T10:00:00.000Z",
      last_used_at: null,
    };
    rows.push(row);
    return row;
  };
  for (let i = 0; i < (options.held ?? 0); i++) add(`token ${i + 1}`);
  const requests: string[] = [];
  const { fetch } = fakeFetch(({ url, init }) => {
    const { pathname } = new URL(url);
    const method = init.method ?? "GET";
    requests.push(`${method} ${pathname}`);
    if (options.signedIn === false) {
      return jsonResponse({ code: "auth.required", message: "Sign in to use API tokens." }, 401);
    }
    if (pathname === "/api/tokens" && method === "GET") {
      return jsonResponse({ tokens: [...rows].reverse() });
    }
    if (pathname === "/api/tokens" && method === "POST") {
      const { name } = JSON.parse(String(init.body)) as { name: string };
      if (rows.length >= 20) {
        return jsonResponse({ code: "quota.tokens", message: "You hold the most tokens." }, 413);
      }
      const row = add(name);
      return jsonResponse({ id: row.id, name, token: `mdg_SECRET-${row.id}` }, 201);
    }
    const route = /^\/api\/tokens\/(.+)$/.exec(pathname);
    if (route && method === "DELETE") {
      const index = rows.findIndex((row) => row.id === decodeURIComponent(route[1]!));
      if (index < 0)
        return jsonResponse({ code: "not-found", message: "There is no such token." }, 404);
      rows.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    return jsonResponse({ code: "not-found", message: "Not found." }, 404);
  });
  return { fetch, requests, rows };
}

describe("the tokens model over the page's own calls", () => {
  const PAGE = { href: "https://diagrams.meltemi.dev/?project=abc#share=Z" };

  it("lists, creates and revokes through the same requests the Worker answers", async () => {
    const server = service();
    const { model } = modelOver(tokenApi(server.fetch, PAGE));
    await model.load();
    expect(model.state).toMatchObject({ list: "ready", tokens: [] });

    expect(await model.create("laptop")).toBe(true);
    expect(model.state.revealed).toEqual({ id: "t1", name: "laptop", token: "mdg_SECRET-t1" });
    expect(await model.create("ci")).toBe(true);
    expect(model.state.revealed?.id).toBe("t2");
    expect(model.state.tokens.map((held) => held.name)).toEqual(["ci", "laptop"]);

    expect(await model.revoke(model.state.tokens[1]!)).toBe(true);
    expect(model.state.tokens.map((held) => held.name)).toEqual(["ci"]);
    expect(server.rows.map((row) => row.name)).toEqual(["ci"]);
    expect(server.requests).toEqual([
      "GET /api/tokens",
      "POST /api/tokens",
      "GET /api/tokens",
      "POST /api/tokens",
      "GET /api/tokens",
      "DELETE /api/tokens/t1",
    ]);
  });

  it("stops at the quota with the page's words, in both languages, after one request", async () => {
    for (const [words, text] of [
      [
        en.tokens,
        "An account holds at most 20 tokens. Revoke one you no longer use, then create this one.",
      ],
      [
        es.tokens,
        "Una cuenta admite como máximo 20 tokens. Revoca alguno que ya no uses y crea este.",
      ],
    ] as const) {
      const server = service({ held: 20 });
      const { model } = modelOver(tokenApi(server.fetch, PAGE), () => words);
      await model.load();
      expect(model.state.tokens).toHaveLength(20);
      expect(await model.create("one more")).toBe(false);
      expect(model.state).toMatchObject({ problem: text, revealed: undefined, busy: false });
      expect(server.requests).toEqual(["GET /api/tokens", "POST /api/tokens"]);
      // Revoking one makes room.
      expect(await model.revoke(model.state.tokens[0]!)).toBe(true);
      expect(await model.create("one more")).toBe(true);
    }
  });

  it("asks a person whose session ended to sign in again, whatever they try", async () => {
    const server = service({ signedIn: false });
    const { model } = modelOver(tokenApi(server.fetch, PAGE));
    await model.load();
    expect(model.state).toMatchObject({ list: "failed", problem: en.tokens.signedOut });
    expect(await model.create("laptop")).toBe(false);
    expect(model.state.problem).toBe(en.tokens.signedOut);
    expect(await model.revoke(token("t1"))).toBe(false);
    expect(model.state.problem).toBe(en.tokens.signedOut);
  });

  it("takes a token revoked in another tab for revoked", async () => {
    const server = service({ held: 2 });
    const { model } = modelOver(tokenApi(server.fetch, PAGE));
    await model.load();
    const [first] = model.state.tokens;
    server.rows.splice(0, server.rows.length);
    expect(await model.revoke(first!)).toBe(true);
    expect(model.state.status).toBe("That token was already revoked.");
  });
});
