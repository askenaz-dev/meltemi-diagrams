// The Connected apps section's calls, words and model (`account-panel`, "Connected apps section"),
// with a fake `fetch`: what the page asks the service, what it reads back and what it says.

import { describe, expect, it } from "vitest";
import {
  AppsModel,
  appsApi,
  endpointOf,
  hostText,
  scopeTexts,
  type AppsState,
} from "../src/cloud/account-panel-apps.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch, jsonResponse } from "./support/fake-fetch.js";

const PAGE = { href: "https://diagrams.meltemi.dev/?project=p1#file=a.meltemi" };

const CODEX = {
  id: "g1AAAAAAAAAAAAAA",
  client: { name: "Codex", uri: "http://127.0.0.1:1455" },
  scopes: ["projects:read", "projects:write", "sharing", "live", "publish", "offline_access"],
  createdAt: "2026-11-01T10:00:00.000Z",
  lastUsedAt: "2026-11-02T08:30:00.000Z",
};

describe("the calls", () => {
  it("list the apps from the page's own origin, and leave out a grant without an id", async () => {
    const fake = fakeFetch(() =>
      jsonResponse({ grants: [CODEX, { client: { name: "no id" } }, "junk"] }),
    );
    const listed = await appsApi(fake.fetch, PAGE).list();
    expect(fake.calls.map((c) => [c.url, c.init.method ?? "GET"])).toEqual([
      ["https://diagrams.meltemi.dev/api/account/apps", "GET"],
    ]);
    expect(listed).toEqual({
      ok: true,
      value: [
        {
          id: CODEX.id,
          name: "Codex",
          uri: "http://127.0.0.1:1455",
          scopes: CODEX.scopes,
          createdAt: CODEX.createdAt,
          lastUsedAt: CODEX.lastUsedAt,
        },
      ],
    });
  });

  it("revoke one by its id, encoded", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await appsApi(fake.fetch, PAGE).revoke("a/b")).toEqual({ ok: true, value: null });
    expect(fake.calls[0]?.url).toBe("https://diagrams.meltemi.dev/api/account/apps/a%2Fb");
    expect(fake.calls[0]?.init.method).toBe("DELETE");
  });

  it("read an answer of another shape as unexpected", async () => {
    const fake = fakeFetch(() => jsonResponse({ apps: [] }));
    expect(await appsApi(fake.fetch, PAGE).list()).toEqual({
      ok: false,
      failure: { kind: "unexpected", status: 200 },
    });
  });
});

describe("the words", () => {
  it("say what an app may do, reading and writing together as one", () => {
    const words = en.accountPanel.apps;
    expect(scopeTexts(CODEX.scopes, words)).toEqual([
      "Read and write your projects",
      "Share your projects",
      "Run live sessions",
      "Publish catalogs",
      "Stay connected",
    ]);
    expect(scopeTexts(["projects:read"], words)).toEqual(["Read your projects"]);
    expect(scopeTexts(["publish", "projects:write"], es.accountPanel.apps)).toEqual([
      "Cambiar tus proyectos",
      "Publicar catálogos",
    ]);
  });

  it("name an app on this computer as such, and another by its host", () => {
    const words = en.accountPanel.apps;
    for (const uri of ["http://127.0.0.1:1455", "http://localhost:9000", "http://[::1]:80"]) {
      expect(hostText(uri, words), uri).toBe("an app on this computer");
    }
    expect(hostText("https://chatgpt.com/oauth/client.json", words)).toBe("chatgpt.com");
    expect(hostText("not an address", words)).toBe("not an address");
    expect(hostText("http://127.0.0.1:1455", es.accountPanel.apps)).toBe(
      "una aplicación de este equipo",
    );
  });

  it("give the endpoint at the page's origin", () => {
    expect(endpointOf({ origin: "https://diagrams.meltemi.dev" })).toBe(
      "https://diagrams.meltemi.dev/mcp",
    );
  });
});

describe("the model", () => {
  const model = (answers: Response[]) => {
    const fake = fakeFetch(() => answers.shift() ?? jsonResponse({}, 500));
    const states: AppsState[] = [];
    const made = new AppsModel(
      appsApi(fake.fetch, PAGE),
      () => en.accountPanel,
      (state) => states.push(state),
    );
    return { made, states, fake };
  };

  it("reads the list, revokes an app and says so, the list no longer holding it", async () => {
    const { made, states } = model([
      jsonResponse({ grants: [CODEX] }),
      new Response(null, { status: 204 }),
    ]);
    await made.load();
    expect(states[0]).toMatchObject({ list: "loading", status: en.accountPanel.apps.loading });
    expect(made.state).toMatchObject({ list: "ready", status: "", problem: "" });
    expect(made.state.apps.map((app) => app.name)).toEqual(["Codex"]);
    expect(await made.revoke(made.state.apps[0]!)).toBe(true);
    expect(made.state).toMatchObject({ apps: [], busy: false, status: "Codex was revoked." });
  });

  it("takes an app already gone (404) for what was asked, and keeps one a failure left", async () => {
    const { made } = model([
      jsonResponse({ grants: [CODEX, { ...CODEX, id: "g2", client: { name: "Claude" } }] }),
      jsonResponse({ code: "not-found", message: "There is no such connected app." }, 404),
      jsonResponse({ code: "internal", message: "Something went wrong." }, 500),
    ]);
    await made.load();
    expect(await made.revoke(made.state.apps[0]!)).toBe(true);
    expect(made.state.status).toBe(en.accountPanel.apps.alreadyGone);
    expect(await made.revoke(made.state.apps[0]!)).toBe(false);
    expect(made.state.apps.map((app) => app.name)).toEqual(["Claude"]);
    expect(made.state.problem).toBe("Something went wrong. (internal)");
  });

  it("says the list could not be read, and that a session ended", async () => {
    const failing = model([jsonResponse({}, 502)]);
    await failing.made.load();
    expect(failing.made.state).toMatchObject({ list: "failed" });
    const ended = model([jsonResponse({ code: "auth.required", message: "Sign in." }, 401)]);
    await ended.made.load();
    expect(ended.made.state.problem).toBe(en.accountPanel.apps.signedOut);
  });
});
