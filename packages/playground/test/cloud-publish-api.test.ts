import { describe, expect, it, vi } from "vitest";
import { TRANSFER_TIMEOUT_MS } from "../src/cloud/client.js";
import { publicationUrl, publishApi } from "../src/cloud/publish-api.js";
import { fakeFetch, jsonResponse, textResponse } from "./support/fake-fetch.js";

const PAGE = "https://diagrams.example/?project=abcdefghij0123456789#p=zzz";
const ID = "abcdefghij0123456789";
const BASE = `https://diagrams.example/api/projects/${ID}/publish`;
const URL_OF = "https://meltemi.page/ana/purchase/";

const publication = (patch: Record<string, unknown> = {}) => ({
  slug: "purchase",
  url: URL_OF,
  published_at: "2026-10-14T10:00:00.000Z",
  bytes: 123_456,
  ...patch,
});

describe("what a project has published", () => {
  it("reads the handle, the publications with their addresses and the takedowns", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        handle: "ana",
        publications: [publication()],
        takedowns: [{ slug: "old", at: "2026-10-13T09:00:00.000Z", reason: "Spam" }],
      }),
    );
    const answer = await publishApi(fetch, { href: PAGE }).info(ID);
    expect(answer).toEqual({
      ok: true,
      value: {
        handle: "ana",
        publications: [
          {
            slug: "purchase",
            url: URL_OF,
            publishedAt: "2026-10-14T10:00:00.000Z",
            bytes: 123_456,
          },
        ],
        takedowns: [{ slug: "old", at: "2026-10-13T09:00:00.000Z", reason: "Spam" }],
      },
    });
    expect(calls[0]!.url).toBe(BASE);
    expect(calls[0]!.init.credentials).toBe("same-origin");
  });

  it("reads a person with no handle and nothing published", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ handle: null, publications: [], takedowns: [] }),
    );
    expect(await publishApi(fetch, { href: PAGE }).info(ID)).toEqual({
      ok: true,
      value: { handle: null, publications: [], takedowns: [] },
    });
  });

  it("keeps a takedown with no reason as one, and drops a row that is not one", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        handle: "ana",
        publications: [publication(), { url: URL_OF }, null, publication({ slug: "" })],
        takedowns: [
          { slug: "a", at: "2026-10-13T09:00:00.000Z" },
          { slug: "b", at: "2026-10-13T09:00:00.000Z", reason: "   " },
          { at: "x" },
        ],
      }),
    );
    const answer = await publishApi(fetch, { href: PAGE }).info(ID);
    expect(answer.ok && answer.value.publications.map((p) => p.slug)).toEqual(["purchase"]);
    expect(answer.ok && answer.value.takedowns.map((t) => [t.slug, t.reason])).toEqual([
      ["a", null],
      ["b", null],
    ]);
  });

  it("is unexpected for an answer that is not an object", async () => {
    const { fetch } = fakeFetch(() => textResponse("<html>", 200, "text/html"));
    expect(await publishApi(fetch, { href: PAGE }).info(ID)).toEqual({
      ok: false,
      failure: { kind: "unexpected", status: 200 },
    });
  });

  it("is refused for anyone who is not the owner", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "access.denied", message: "You may only read this project." }, 403),
    );
    const answer = await publishApi(fetch, { href: PAGE }).info(ID);
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.failure).toMatchObject({ status: 403, code: "access.denied" });
  });
});

describe("a publication's address", () => {
  it("is a web address the page links to: https, or http on the page's own origin", () => {
    expect(publicationUrl(URL_OF, PAGE)).toBe(URL_OF);
    // The development host serves publications under `/_published/` on the page's own origin.
    const local = "http://localhost:8787/?project=abcdefghij0123456789";
    expect(publicationUrl("http://localhost:8787/_published/ana/p/", local)).toBe(
      "http://localhost:8787/_published/ana/p/",
    );
    expect(publicationUrl("http://localhost:8787/_published/ana/p/", PAGE)).toBeUndefined();
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "http://elsewhere.example/ana/p/",
      "https://user:pass@meltemi.page/ana/p/",
      "//meltemi.page/ana/p/",
      "/ana/p/",
      "",
      null,
      5,
    ]) {
      expect(publicationUrl(bad, PAGE)).toBeUndefined();
    }
  });

  it("leaves a publication without a link when the service gave one the page would not follow", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        handle: "ana",
        publications: [publication({ url: "javascript:alert(1)" })],
        takedowns: [],
      }),
    );
    const answer = await publishApi(fetch, { href: PAGE }).info(ID);
    expect(answer.ok && answer.value.publications[0]?.url).toBeUndefined();
  });
});

describe("choosing a handle", () => {
  it("patches the account with the handle and reads it back", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ handle: "ana" }));
    expect(await publishApi(fetch, { href: PAGE }).setHandle("ana")).toEqual({
      ok: true,
      value: { handle: "ana" },
    });
    expect(calls[0]!.url).toBe("https://diagrams.example/api/account");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(calls[0]!.init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ handle: "ana" });
  });

  it("is refused as invalid, taken or locked, each with its code", async () => {
    for (const [status, code] of [
      [400, "handle.invalid"],
      [409, "handle.taken"],
      [409, "handle.locked"],
    ] as const) {
      const { fetch } = fakeFetch(() => jsonResponse({ code, message: "No." }, status));
      expect(await publishApi(fetch, { href: PAGE }).setHandle("ana")).toEqual({
        ok: false,
        failure: { kind: "refused", status, code, message: "No." },
      });
    }
  });
});

describe("publishing and unpublishing", () => {
  it("puts the slug and the HTML and reads the address the service gives", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        url: URL_OF,
        handle: "ana",
        slug: "purchase",
        bytes: 15,
        published_at: "2026-10-14T10:00:00.000Z",
      }),
    );
    const answer = await publishApi(fetch, { href: PAGE }).publish(
      ID,
      "purchase",
      "<!doctype html>",
    );
    expect(answer).toEqual({
      ok: true,
      value: {
        url: URL_OF,
        handle: "ana",
        slug: "purchase",
        bytes: 15,
        publishedAt: "2026-10-14T10:00:00.000Z",
      },
    });
    expect(calls[0]!.url).toBe(BASE);
    expect(calls[0]!.init.method).toBe("PUT");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      slug: "purchase",
      html: "<!doctype html>",
    });
  });

  it("is unexpected when the answer's address is one the page will not link to", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ url: "javascript:1", handle: "ana", slug: "purchase" }),
    );
    expect(await publishApi(fetch, { href: PAGE }).publish(ID, "purchase", "<p>")).toEqual({
      ok: false,
      failure: { kind: "unexpected", status: 200 },
    });
  });

  it("waits as long as a transfer, for the page may be large", async () => {
    const timers = vi.spyOn(globalThis, "setTimeout");
    const { fetch } = fakeFetch(() => jsonResponse({ url: URL_OF, handle: "ana", slug: "p" }));
    const api = publishApi(fetch, { href: PAGE });
    expect((await api.publish(ID, "p", "<p>")).ok).toBe(true);
    expect(timers.mock.calls.map((call) => call[1])).toContain(TRANSFER_TIMEOUT_MS);
    timers.mockClear();
    await api.info(ID);
    expect(timers.mock.calls.map((call) => call[1])).not.toContain(TRANSFER_TIMEOUT_MS);
    timers.mockRestore();
  });

  it("is refused for a page over the limit, too many publications, an invalid page and a non-owner", async () => {
    for (const [status, code] of [
      [413, "publish.too-large"],
      [429, "publish.rate"],
      [400, "publish.invalid"],
      [403, "access.denied"],
      [409, "handle.required"],
    ] as const) {
      const { fetch } = fakeFetch(() => jsonResponse({ code, message: "No." }, status));
      expect(await publishApi(fetch, { href: PAGE }).publish(ID, "p", "<p>")).toEqual({
        ok: false,
        failure: { kind: "refused", status, code, message: "No." },
      });
    }
  });

  it("deletes a publication by its slug", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await publishApi(fetch, { href: PAGE }).unpublish(ID, "my page/1")).toEqual({
      ok: true,
      value: null,
    });
    expect(calls[0]!.url).toBe(`${BASE}/my%20page%2F1`);
    expect(calls[0]!.init.method).toBe("DELETE");
  });
});
