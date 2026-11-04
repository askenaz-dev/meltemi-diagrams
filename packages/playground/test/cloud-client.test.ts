import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudApi, hasCode, projectOf, TRANSFER_TIMEOUT_MS } from "../src/cloud/client.js";
import { REQUEST_TIMEOUT_MS } from "../src/cloud/http.js";
import {
  fakeFetch,
  hangsUntilAborted,
  jsonResponse,
  textResponse,
  unreadableResponse,
} from "./support/fake-fetch.js";

const PAGE = "https://diagrams.example/?project=abcdefghij0123456789#p=zzz";
const ID = "abcdefghij0123456789";

const row = (patch: Record<string, unknown> = {}) => ({
  id: ID,
  name: "Purchase",
  description: "",
  updated_at: "2026-10-14T10:00:00.000Z",
  thumbnail: `/api/projects/${ID}/thumbnail`,
  role: "owner",
  ...patch,
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the projects the service lists", () => {
  it("reads each project with its thumbnail on the page's origin", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ projects: [row()] }));
    const answer = await cloudApi(fetch, { href: PAGE }).list();
    expect(answer).toEqual({
      ok: true,
      value: [
        {
          id: ID,
          name: "Purchase",
          description: "",
          updatedAt: "2026-10-14T10:00:00.000Z",
          thumbnail: `https://diagrams.example/api/projects/${ID}/thumbnail`,
          role: "owner",
        },
      ],
    });
    // The page's own address, without its query or fragment, is the base: the API is at its root.
    expect(calls[0]!.url).toBe("https://diagrams.example/api/projects");
    expect(calls[0]!.init.headers).toEqual({ Accept: "application/json" });
    expect(calls[0]!.init.credentials).toBe("same-origin");
    expect(calls[0]!.init.cache).toBe("no-store");
  });

  it("leaves out a thumbnail of another origin, one that is not an address, and null", () => {
    for (const thumbnail of ["https://evil.example/t.svg", "http://[bad", null, 5, ""]) {
      expect(projectOf(row({ thumbnail }), PAGE)?.thumbnail).toBeUndefined();
    }
    expect(projectOf(row({ thumbnail: "https://diagrams.example/t.svg" }), PAGE)?.thumbnail).toBe(
      "https://diagrams.example/t.svg",
    );
  });

  it("drops a row without an id or a name and keeps the rest", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        projects: [
          row(),
          { name: "no id" },
          row({ id: "", name: "empty id" }),
          null,
          3,
          row({ name: 7 }),
        ],
      }),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).list();
    expect(answer.ok && answer.value.map((p) => p.name)).toEqual(["Purchase"]);
  });

  it("reads a time that is a number of milliseconds, and defaults the role and the description", () => {
    const project = projectOf({ id: ID, name: "N", updated_at: 1_760_000_000_000 }, PAGE);
    expect(project?.updatedAt).toBe(new Date(1_760_000_000_000).toISOString());
    expect(project?.role).toBe("owner");
    expect(project?.description).toBe("");
    expect(projectOf({ id: ID, name: "N", updated_at: "x".repeat(3) }, PAGE)?.updatedAt).toBe(
      "xxx",
    );
    expect(projectOf({ id: ID, name: "N" }, PAGE)?.updatedAt).toBe("");
  });

  it("is unexpected when the answer is not a list", async () => {
    for (const body of [{ projects: "no" }, {}, [], "text"]) {
      const { fetch } = fakeFetch(() => jsonResponse(body));
      expect(await cloudApi(fetch, { href: PAGE }).list()).toEqual({
        ok: false,
        failure: { kind: "unexpected", status: 200 },
      });
    }
  });
});

describe("making and changing projects", () => {
  it("creates one from a template as JSON with a POST", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(row({ name: "Mine" }), 201));
    const answer = await cloudApi(fetch, { href: PAGE }).create({ name: "Mine", template: "flow" });
    expect(answer.ok && answer.value.name).toBe("Mine");
    expect(calls[0]!.url).toBe("https://diagrams.example/api/projects");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ name: "Mine", template: "flow" });
  });

  it("creates one from files", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(row(), 201));
    await cloudApi(fetch, { href: PAGE }).create({
      name: "x",
      files: { "diagrams/a.meltemi": "a" },
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      name: "x",
      files: { "diagrams/a.meltemi": "a" },
    });
  });

  it("reads, renames, duplicates and deletes by id", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.init.method === "DELETE"
        ? new Response(null, { status: 204 })
        : jsonResponse(row(), 200),
    );
    const api = cloudApi(fetch, { href: PAGE });
    expect((await api.get(ID)).ok).toBe(true);
    expect((await api.update(ID, { name: "New", description: "d" })).ok).toBe(true);
    expect((await api.duplicate(ID)).ok).toBe(true);
    expect(await api.remove(ID)).toEqual({ ok: true, value: null });
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${new URL(c.url).pathname}`)).toEqual([
      `GET /api/projects/${ID}`,
      `PATCH /api/projects/${ID}`,
      `POST /api/projects/${ID}/duplicate`,
      `DELETE /api/projects/${ID}`,
    ]);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ name: "New", description: "d" });
    expect(calls[2]!.init.body).toBeUndefined();
  });

  it("encodes an id that is not safe in an address", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse(row()));
    await cloudApi(fetch, { href: PAGE }).get("a/b?c#d");
    expect(calls[0]!.url).toBe("https://diagrams.example/api/projects/a%2Fb%3Fc%23d");
  });
});

describe("refusals", () => {
  it("gives the service's code and message with the status", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "quota.projects", message: "You have 100 projects." }, 413),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).create({ name: "x", template: "flow" });
    expect(answer).toEqual({
      ok: false,
      failure: {
        kind: "refused",
        status: 413,
        code: "quota.projects",
        message: "You have 100 projects.",
      },
    });
    if (!answer.ok) {
      expect(hasCode(answer.failure, "quota.projects")).toBe(true);
      expect(hasCode(answer.failure, "quota.storage")).toBe(false);
    }
  });

  it("gives every code of the contract", async () => {
    const codes: [number, string][] = [
      [400, "path.invalid"],
      [400, "blob.unknown"],
      [400, "doc.invalid"],
      [400, "binary.invalid"],
      [404, "project.not-found"],
      [404, "version.not-found"],
      [413, "quota.storage"],
      [413, "quota.files"],
      [413, "quota.binary"],
      [413, "quota.versions"],
      [413, "doc.too-large"],
      [429, "versions.rate"],
      [429, "thumbnail.rate"],
    ];
    for (const [status, code] of codes) {
      const { fetch } = fakeFetch(() => jsonResponse({ code, message: "m" }, status));
      const answer = await cloudApi(fetch, { href: PAGE }).get(ID);
      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.failure).toMatchObject({ kind: "refused", status, code });
    }
  });

  it("gives the status alone when the body is not a code and a message", async () => {
    for (const response of [
      () => textResponse("<html>Bad gateway</html>", 502, "text/html"),
      () => jsonResponse({ unrelated: true }, 500),
      () => jsonResponse([1, 2], 500),
      () => new Response(null, { status: 401 }),
    ]) {
      const { fetch } = fakeFetch(response);
      const answer = await cloudApi(fetch, { href: PAGE }).list();
      expect(answer.ok).toBe(false);
      if (!answer.ok) {
        expect(answer.failure.kind).toBe("refused");
        expect(answer.failure.code).toBeUndefined();
        expect(answer.failure.message).toBeUndefined();
      }
    }
  });

  it("cuts a long code and a long message", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "c".repeat(200), message: "m".repeat(900) }, 400),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).list();
    if (answer.ok) throw new Error("expected a refusal");
    expect(answer.failure.code).toHaveLength(80);
    expect(answer.failure.message).toHaveLength(300);
  });
});

describe("nothing throws", () => {
  it("says the service is unreachable when fetch fails, throws at once, or the body breaks", async () => {
    const failures = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => {
        throw new Error("boom");
      },
      () => unreadableResponse(),
    ];
    for (const failure of failures) {
      const { fetch } = fakeFetch(failure);
      const api = cloudApi(fetch, { href: PAGE });
      for (const outcome of [
        await api.list(),
        await api.create({ name: "x" }),
        await api.get(ID),
        await api.remove(ID),
        await api.files(ID),
        await api.blob(ID, "h"),
        await api.usage(),
      ]) {
        expect(outcome).toEqual({ ok: false, failure: { kind: "unreachable", status: 0 } });
      }
    }
  });

  it("gives up on a call that does not answer, after the time the page allows", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch((call) => hangsUntilAborted(call.init.signal) as never);
    const pending = cloudApi(fetch, { href: PAGE }).list();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, failure: { kind: "unreachable", status: 0 } });
  });

  it("is unexpected when a good status brings a body that is not what the contract says", async () => {
    const api = (body: () => Response) => cloudApi(fakeFetch(body).fetch, { href: PAGE });
    for (const make of [
      () => textResponse("not json"),
      () => jsonResponse({ id: ID }),
      () => jsonResponse(null),
    ]) {
      expect(await api(make).get(ID)).toEqual({
        ok: false,
        failure: { kind: "unexpected", status: 200 },
      });
    }
  });
});

describe("the files of a project", () => {
  it("reads the revision, the texts, the hashes and the collisions", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        revision: 7,
        files: { "diagrams/a.meltemi": "x", bad: 3 },
        binaries: { "logo.png": "a".repeat(64) },
        collisions: [{ path: "a" }],
      }),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).files(ID);
    expect(answer).toEqual({
      ok: true,
      value: {
        revision: 7,
        files: { "diagrams/a.meltemi": "x" },
        binaries: { "logo.png": "a".repeat(64) },
        collisions: [{ path: "a" }],
      },
    });
    expect(new URL(calls[0]!.url).pathname).toBe(`/api/projects/${ID}/files`);
  });

  it("is unexpected without a revision or without the two maps", async () => {
    for (const body of [
      { files: {}, binaries: {} },
      { revision: 1, files: {} },
      { revision: "1" },
    ]) {
      const { fetch } = fakeFetch(() => jsonResponse(body));
      const answer = await cloudApi(fetch, { href: PAGE }).files(ID);
      expect(answer.ok).toBe(false);
    }
  });
});

describe("images and fonts", () => {
  it("uploads bytes to the path, each segment encoded, and reads the hash", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ hash: "ab".repeat(32) }));
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const answer = await cloudApi(fetch, { href: PAGE }).uploadBinary(
      ID,
      "assets/my logo#1.png",
      bytes,
    );
    expect(answer).toEqual({ ok: true, value: { hash: "ab".repeat(32) } });
    expect(calls[0]!.url).toBe(
      `https://diagrams.example/api/projects/${ID}/binaries/assets/my%20logo%231.png`,
    );
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.init.body).toBe(bytes);
    expect(calls[0]!.init.headers).toMatchObject({ "Content-Type": "application/octet-stream" });
  });

  it("waits longer for an upload than for a plain call", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch((call) => hangsUntilAborted(call.init.signal) as never);
    const pending = cloudApi(fetch, { href: PAGE }).uploadBinary(ID, "a.png", new Uint8Array(1));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1000);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS);
    expect((await pending).ok).toBe(false);
  });

  it("refuses an upload the service refuses, with its code", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "binary.invalid", message: "No." }, 400),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).uploadBinary(
      ID,
      "a.png",
      new Uint8Array(1),
    );
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(hasCode(answer.failure, "binary.invalid")).toBe(true);
  });

  it("deletes the entry of a path", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await cloudApi(fetch, { href: PAGE }).deleteBinary(ID, "fonts/a b.woff2")).toEqual({
      ok: true,
      value: null,
    });
    expect(calls[0]!.url).toBe(
      `https://diagrams.example/api/projects/${ID}/binaries/fonts/a%20b.woff2`,
    );
    expect(calls[0]!.init.method).toBe("DELETE");
  });

  it("reads a blob as bytes, and lets the browser keep it", async () => {
    const { fetch, calls } = fakeFetch(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).blob(ID, "ab".repeat(32));
    expect(answer).toEqual({ ok: true, value: new Uint8Array([1, 2, 3]) });
    expect(calls[0]!.url).toBe(
      `https://diagrams.example/api/projects/${ID}/blobs/${"ab".repeat(32)}`,
    );
    expect(calls[0]!.init.cache).toBe("default");
  });

  it("gives the refusal for a blob that is not there", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({ code: "project.not-found", message: "No." }, 404),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).blob(ID, "00");
    expect(answer.ok).toBe(false);
    if (!answer.ok)
      expect(answer.failure).toMatchObject({ status: 404, code: "project.not-found" });
  });
});

describe("versions, thumbnails and usage", () => {
  it("lists versions with the paths each changed", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        versions: [
          {
            number: 3,
            label: "before review",
            auto: 0,
            created_at: "2026-10-14T10:00:00.000Z",
            created_by: "u-ana",
            changed: ["a.meltemi", 4],
          },
          {
            number: 2,
            label: null,
            auto: true,
            created_at: "2026-10-13T10:00:00.000Z",
            changed: [],
          },
          { label: "no number" },
        ],
      }),
    );
    const answer = await cloudApi(fetch, { href: PAGE }).versions(ID);
    expect(answer).toEqual({
      ok: true,
      value: [
        {
          number: 3,
          label: "before review",
          auto: false,
          createdAt: "2026-10-14T10:00:00.000Z",
          createdBy: "u-ana",
          changed: ["a.meltemi"],
        },
        {
          number: 2,
          label: null,
          auto: true,
          createdAt: "2026-10-13T10:00:00.000Z",
          createdBy: "",
          changed: [],
        },
      ],
    });
  });

  it("names a version with a label and restores one by number", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.url.endsWith("/restore")
        ? new Response(null, { status: 204 })
        : jsonResponse(
            {
              number: 4,
              label: "named",
              auto: false,
              created_at: "t",
              created_by: "u",
              changed: [],
            },
            201,
          ),
    );
    const api = cloudApi(fetch, { href: PAGE });
    const made = await api.createVersion(ID, "named");
    expect(made.ok && made.value.number).toBe(4);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ label: "named" });
    await api.createVersion(ID);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({});
    expect(await api.restoreVersion(ID, 3)).toEqual({ ok: true, value: null });
    expect(new URL(calls[2]!.url).pathname).toBe(`/api/projects/${ID}/versions/3/restore`);
    expect(calls[2]!.init.method).toBe("POST");
  });

  it("puts the thumbnail as SVG", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    await cloudApi(fetch, { href: PAGE }).putThumbnail(ID, "<svg/>");
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.init.body).toBe("<svg/>");
    expect(calls[0]!.init.headers).toMatchObject({ "Content-Type": "image/svg+xml" });
    expect(new URL(calls[0]!.url).pathname).toBe(`/api/projects/${ID}/thumbnail`);
  });

  it("reads what the account holds and may hold", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        projects: 3,
        storageBytes: 1024,
        limits: { projects: 100, storageBytes: 209715200, junk: "x" },
      }),
    );
    expect(await cloudApi(fetch, { href: PAGE }).usage()).toEqual({
      ok: true,
      value: {
        projects: 3,
        storageBytes: 1024,
        limits: { projects: 100, storageBytes: 209715200 },
      },
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/account/usage");
  });
});
