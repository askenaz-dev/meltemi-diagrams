import { describe, expect, it, vi } from "vitest";
import { harness, jsonOf } from "./support/index.js";

describe("one Worker, one origin", () => {
  it("serves the page's assets for a path it does not answer itself", async () => {
    const h = await harness();
    const response = await h.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("playground");
    expect(h.assets.calls).toEqual(["/"]);
  });

  it("lets no other site frame the page, and keeps what the assets answered", async () => {
    const h = await harness();
    h.assets.files.set("/playground.js", { body: "export {};", type: "text/javascript" });
    for (const path of ["/", "/playground.js"]) {
      const response = await h.request(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("Content-Security-Policy"), path).toBe("frame-ancestors 'self'");
      expect(response.headers.get("X-Content-Type-Options"), path).toBe("nosniff");
    }
    const script = await h.request("/playground.js");
    expect(script.headers.get("Content-Type")).toBe("text/javascript");
    expect(await script.text()).toBe("export {};");
  });

  it("gives the same headers to a file that is not there and to a redirect of the assets", async () => {
    const h = await harness();
    const missing = await h.request("/missing.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");

    h.deps.assets.fetch = async () =>
      new Response(null, { status: 307, headers: { Location: "/docs/" } });
    const redirect = await h.request("/docs");
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("Location")).toBe("/docs/");
    expect(redirect.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("answers the API itself, never from the assets", async () => {
    const h = await harness();
    h.assets.files.set("/api/session", { body: "{}", type: "application/json" });
    const response = await h.request("/api/session");
    expect(await jsonOf(response)).toMatchObject({ user: null });
    expect(h.assets.calls).toEqual([]);
  });

  it("answers an unknown API route with the JSON of a stable code", async () => {
    const h = await harness();
    const response = await h.request("/api/nothing");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({
      code: "not-found",
      message: "There is nothing at this address.",
    });
    expect(h.assets.calls).toEqual([]);
  });

  it.each(["/_identity/other", "/cli-auth/other", "/p/a/b", "/rooms/x", "/rooms"])(
    "answers an unmatched %s with a JSON 404, not an asset",
    async (path) => {
      const h = await harness();
      const response = await h.request(path);
      expect(response.status).toBe(404);
      expect((await jsonOf<{ code: string }>(response)).code).toMatch(/not-found/);
      expect(h.assets.calls).toEqual([]);
    },
  );

  it("answers a known path with another method as an unknown route", async () => {
    const h = await harness();
    expect((await h.request("/api/session", { method: "POST" })).status).toBe(404);
    expect((await h.request("/api/tokens", { method: "PUT" })).status).toBe(404);
  });

  it("serves no asset and no API for another host, such as the publish host", async () => {
    const h = await harness();
    h.assets.files.set("/playground.js", { body: "alert(1)", type: "text/javascript" });
    for (const path of ["/playground.js", "/", "/api/session"]) {
      const response = await h.request(`https://meltemi.page${path}`);
      expect(response.status, path).toBe(404);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("not-found");
    }
    expect(h.assets.calls).toEqual([]);
  });

  it("takes the request's own origin as its origin in development", async () => {
    const h = await harness({ env: { DEV: "true" } });
    const response = await h.request("http://localhost:8788/api/session");
    expect(response.status).toBe(200);
    // Its own origin is the request's, so in development no host is another: a local request, on
    // whatever port, always passes (and outside development a host that is not ORIGIN's does not).
    expect((await h.request("http://localhost:9999/")).status).toBe(200);
  });

  it("answers an unexpected failure with a 500 that holds no detail", async () => {
    const h = await harness();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.deps.assets.fetch = async () => {
      throw new Error("secret detail that must not be shown");
    };
    const response = await h.request("/");
    logged.mockRestore();
    expect(response.status).toBe(500);
    expect(await jsonOf(response)).toEqual({ code: "internal", message: "Something went wrong." });
  });

  it("refuses to run with a configuration it cannot use, without naming a secret", async () => {
    const h = await harness({ env: { ORIGIN: "not an address" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await h.request("https://diagrams.meltemi.dev/api/session");
    logged.mockRestore();
    expect(response.status).toBe(500);
    expect((await jsonOf<{ code: string }>(response)).code).toBe("internal");
  });
});

describe("a project's link", () => {
  const ID = "01h2x5z8kq3m7n9p2r4t";

  it("redirects to the page with the project and keeps the query", async () => {
    const h = await harness();
    const response = await h.request(`/p/${ID}?invite=t`);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/?project=${ID}&invite=t`);
  });

  it("redirects without a query to just the project", async () => {
    const h = await harness();
    const response = await h.request(`/p/${ID}`);
    expect(response.headers.get("Location")).toBe(`/?project=${ID}`);
  });

  it("does not let a query repeat the project", async () => {
    const h = await harness();
    const response = await h.request(`/p/${ID}?project=other&x=1`);
    expect(response.headers.get("Location")).toBe(`/?project=${ID}&x=1`);
  });

  it.each([
    "not-an-id",
    "",
    "ABCDEFGHIJKLMNOPQRST",
    "0123456789012345678",
    "012345678901234567890",
    "a%2Fb",
  ])("answers 404 project.not-found, with no redirect, for %j", async (id) => {
    const h = await harness();
    const response = await h.request(`/p/${id}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
    expect((await jsonOf<{ code: string }>(response)).code).toBe("project.not-found");
  });

  it("reserves /rooms/*: it is a 404 until the projects change defines the route", async () => {
    const h = await harness();
    expect((await h.request("/rooms/abc")).status).toBe(404);
  });
});
