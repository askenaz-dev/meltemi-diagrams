import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudClient,
  MAX_PUSH_BYTES,
  sha256Hex,
  type CloudClientOptions,
  type Fetch,
} from "../src/cloud-client.js";
import { CloudError } from "../src/cloud-errors.js";
import { CloudStub, projectId } from "./cloud-stub.js";

const stub = new CloudStub();
beforeAll(async () => {
  await stub.start();
});
afterAll(async () => {
  await stub.stop();
});

/** A client for the stub, with a token the stub knows unless another is given. */
function client(options: Partial<CloudClientOptions> = {}, token = stub.mint().token) {
  return new CloudClient({ host: stub.url, token, ...options });
}

/** The error an action throws, or fails. */
async function failure(action: () => Promise<unknown>): Promise<CloudError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("expected a CloudError");
}

/** A `fetch` that records the address and headers of every call and answers as told. */
function recorder(answer: () => Response = () => Response.json({ user: null })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return answer();
  };
  return { calls, fetcher };
}

describe("where a token goes", () => {
  it("is sent to the host with every request and in the Authorization header only", async () => {
    const { token } = stub.mint();
    const before = stub.requests.length;
    const api = client({ userAgent: "meltemi-diagrams/9.9.9" }, token);
    await api.session();
    await api.projects();
    const made = stub.requests.slice(before);
    expect(made.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /api/session",
      "GET /api/projects",
    ]);
    for (const request of made) {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      expect(request.headers["user-agent"]).toBe("meltemi-diagrams/9.9.9");
      expect(request.query).toBe("");
      expect(request.path).not.toContain(token);
    }
  });

  it("sends no token with the exchange of a code, even to a client that holds one", async () => {
    const before = stub.requests.length;
    const api = client();
    const error = await failure(() => api.exchangeCode("a-code-that-is-unknown", "s".repeat(32)));
    expect(error.code).toBe("cli.invalid");
    const [request] = stub.requests.slice(before);
    expect(request!.path).toBe("/cli-auth/token");
    expect(request!.headers.authorization).toBeUndefined();
  });

  it("never goes to another origin, whatever an id or a path says", async () => {
    const { calls, fetcher } = recorder(() => Response.json({ projects: [] }));
    const api = new CloudClient({
      host: "https://diagrams.meltemi.dev",
      token: "mdg_faketoken",
      fetch: fetcher,
    });
    await api.projects();
    const id = projectId();
    // The answers are not what these calls want; where they went is what matters.
    const ignore = () => undefined;
    await api.unpublish(id, "//evil.example").catch(ignore);
    await api.blob(id, "../../y").catch(ignore);
    await api.deleteToken("//evil.example").catch(ignore);
    await api.putBinary(id, "assets/a b/c.png", new Uint8Array(1)).catch(ignore);
    for (const { url } of calls) expect(new URL(url).origin).toBe("https://diagrams.meltemi.dev");
    expect(calls.slice(1).map((c) => c.url)).toEqual([
      `https://diagrams.meltemi.dev/api/projects/${id}/publish/%2F%2Fevil.example`,
      `https://diagrams.meltemi.dev/api/projects/${id}/blobs/..%2F..%2Fy`,
      "https://diagrams.meltemi.dev/api/tokens/%2F%2Fevil.example",
      `https://diagrams.meltemi.dev/api/projects/${id}/binaries/assets/a%20b/c.png`,
    ]);
    expect(
      calls.every(
        (c) => new Headers(c.init.headers).get("authorization") === "Bearer mdg_faketoken",
      ),
    ).toBe(true);
  });

  it("refuses an id that cannot be a project's and a segment that is a dot, without a request", async () => {
    const { calls, fetcher } = recorder();
    const api = new CloudClient({
      host: "https://diagrams.meltemi.dev",
      token: "mdg_faketoken",
      fetch: fetcher,
    });
    for (const id of ["//evil.example/x", "..", "../..", "a/b", "", "p", "K4C2W7X5Q3Y6M2N5R7D4"]) {
      expect((await failure(() => api.getProject(id))).code, id).toBe("project.not-found");
      expect((await failure(() => api.files(id))).code, id).toBe("project.not-found");
      expect((await failure(() => api.publication(id))).code, id).toBe("project.not-found");
    }
    const id = projectId();
    for (const dots of [".", ".."]) {
      expect((await failure(() => api.unpublish(id, dots))).code).toBe("cloud.bad-request");
      expect((await failure(() => api.deleteToken(dots))).code).toBe("cloud.bad-request");
      expect((await failure(() => api.blob(id, dots))).code).toBe("cloud.bad-request");
    }
    expect(calls).toEqual([]);
  });

  it("does not follow a redirect with the token, and the other host sees nothing", async () => {
    let seen = 0;
    const other: Server = createServer((_request, response) => {
      seen++;
      response.end("{}");
    });
    await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
    const address = other.address();
    const otherPort = typeof address === "object" && address ? address.port : 0;
    try {
      stub.fail("GET /api/session", {
        status: 302,
        headers: { Location: `http://127.0.0.1:${otherPort}/steal` },
      });
      const error = await failure(() => client().session());
      expect(error.code).toBe("cloud.redirect");
      expect(error.status).toBe(302);
      expect(seen).toBe(0);
      // A redirect to anywhere is refused, for the calls that carry no token as well.
      stub.fail("POST /cli-auth/token", { status: 307, headers: { Location: stub.url } });
      expect((await failure(() => client().exchangeCode("c", "s".repeat(32)))).code).toBe(
        "cloud.redirect",
      );
    } finally {
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });
});

describe("plain http", () => {
  it("is refused for a host that is not this machine, before any request is made", () => {
    const { calls, fetcher } = recorder();
    for (const host of [
      "http://diagrams.example",
      "http://10.0.0.5:8788",
      "http://127.0.0.2:8788",
    ]) {
      for (const token of ["mdg_faketoken", undefined]) {
        let caught: unknown;
        try {
          new CloudClient({ host, token, fetch: fetcher });
        } catch (error) {
          caught = error;
        }
        expect(caught, host).toBeInstanceOf(CloudError);
        expect((caught as CloudError).code).toBe("cloud.insecure-host");
        expect((caught as CloudError).message).toContain(host);
        expect((caught as CloudError).exitCode).toBe(1);
      }
    }
    expect(calls).toEqual([]);
  });

  it("is allowed to 127.0.0.1, localhost and [::1], and https: to anywhere", async () => {
    const { calls, fetcher } = recorder();
    for (const host of [
      "http://127.0.0.1:8788",
      "http://localhost:8788",
      "http://[::1]:8788",
      "https://diagrams.example",
    ]) {
      await new CloudClient({ host, token: "mdg_faketoken", fetch: fetcher })
        .session()
        .catch(() => undefined);
    }
    expect(calls.map((c) => new URL(c.url).origin)).toEqual([
      "http://127.0.0.1:8788",
      "http://localhost:8788",
      "http://[::1]:8788",
      "https://diagrams.example",
    ]);
  });

  it("is refused when the host is not an address at all", () => {
    for (const host of ["", "diagrams.example", "https://a.example/app", "ftp://a.example"]) {
      expect(() => new CloudClient({ host })).toThrowError(CloudError);
      try {
        new CloudClient({ host });
      } catch (error) {
        expect((error as CloudError).code).toBe("cloud.host-invalid");
      }
    }
  });
});

describe("errors", () => {
  it("carry the service's code and status, and refusing the token is exit code 3", async () => {
    const error = await failure(() => client({}, "mdg_unknowntoken0123").session());
    expect(error.code).toBe("token.invalid");
    expect(error.status).toBe(401);
    expect(error.exitCode).toBe(3);
    expect(error.message).toBe("That token is not valid.");
    const missing = await failure(() => client().getProject(projectId()));
    expect(missing.code).toBe("project.not-found");
    expect(missing.status).toBe(404);
    expect(missing.exitCode).toBe(1);
  });

  it("show a token the service echoed as mdg_…, and the one in use whatever it looks like", async () => {
    stub.fail("GET /api/session", {
      status: 400,
      body: { code: "request.invalid", message: "Bad token mdg_AbC123-_xyz in the request." },
    });
    expect((await failure(() => client().session())).message).toBe(
      "Bad token mdg_… in the request.",
    );
    stub.fail("GET /api/session", {
      status: 400,
      body: { code: "request.invalid", message: "Bad token plain-secret-value in the request." },
    });
    const error = await failure(() => client({}, "plain-secret-value").session());
    expect(error.message).not.toContain("plain-secret-value");
    expect(error.message).toContain("mdg_…");
  });

  it("never show the one-time code of an exchange", async () => {
    stub.fail("POST /cli-auth/token", {
      status: 400,
      body: { code: "cli.invalid", message: "The code one-time-secret-code-123 is used." },
    });
    const error = await failure(() =>
      client().exchangeCode("one-time-secret-code-123", "s".repeat(32)),
    );
    expect(error.code).toBe("cli.invalid");
    expect(error.message).not.toContain("one-time-secret-code-123");
  });

  it("carry the revision of a stale push and the wait of a rate limit", async () => {
    const project = stub.addProject({ revision: 41, files: { "a.meltemi": "x" } });
    const stale = await failure(() => client().pushFiles(project.id, { files: {}, ifRevision: 7 }));
    expect(stale.code).toBe("revision.mismatch");
    expect(stale.status).toBe(409);
    expect(stale.revision).toBe(41);
    stub.fail("POST /cli-auth/token", {
      status: 429,
      body: { code: "cli.rate", message: "Too many." },
      headers: { "Retry-After": "60" },
    });
    const limited = await failure(() => client().exchangeCode("c", "s".repeat(32)));
    expect(limited.code).toBe("cli.rate");
    expect(limited.retryAfter).toBe(60);
  });

  it("are the service's code only when it is one: anything else is a bad answer", async () => {
    stub.fail("GET /api/projects", { status: 502, body: "<html>Bad gateway</html>" });
    const html = await failure(() => client().projects());
    expect(html.code).toBe("cloud.bad-response");
    expect(html.status).toBe(502);
    stub.fail("GET /api/projects", { status: 500, body: { code: "Not A Code!", message: "x" } });
    expect((await failure(() => client().projects())).code).toBe("cloud.bad-response");
    stub.fail("GET /api/projects", { status: 200, body: "<html>an HTML page</html>" });
    expect((await failure(() => client().projects())).code).toBe("cloud.bad-response");
    stub.fail("GET /api/projects", { status: 200, body: { projects: "no" } });
    expect((await failure(() => client().projects())).code).toBe("cloud.bad-response");
  });

  it("say so when the host cannot be reached and when it does not answer in time", async () => {
    const closed = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        const port = typeof address === "object" && address ? address.port : 0;
        probe.close(() => resolve(port));
      });
    });
    const refused = await failure(() =>
      new CloudClient({ host: `http://127.0.0.1:${closed}`, token: "mdg_faketoken" }).session(),
    );
    expect(refused.code).toBe("cloud.unreachable");
    expect(refused.message).toContain(`127.0.0.1:${closed}`);

    const hang = new Promise<void>(() => undefined);
    const slow = new CloudClient({
      host: "https://diagrams.example",
      token: "mdg_faketoken",
      timeoutMs: 40,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          void hang;
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    });
    const timedOut = await failure(() => slow.session());
    expect(timedOut.code).toBe("cloud.timeout");
  });

  it("time out against a real server that never answers", async () => {
    const silent: Server = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const address = silent.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const error = await failure(() =>
        new CloudClient({
          host: `http://127.0.0.1:${port}`,
          token: "mdg_faketoken",
          timeoutMs: 60,
        }).session(),
      );
      expect(error.code).toBe("cloud.timeout");
    } finally {
      silent.closeAllConnections();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
    }
  });

  it("stop reading an answer that is too large, declared or not", async () => {
    const declared = recorder(
      () =>
        new Response("x".repeat(10), { headers: { "content-length": String(50 * 1024 * 1024) } }),
    );
    const big = new CloudClient({
      host: "https://a.example",
      token: "mdg_faketoken",
      fetch: declared.fetcher,
    });
    expect((await failure(() => big.session())).code).toBe("cloud.response-too-large");

    const chunked = recorder(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(256 * 1024));
            },
          }),
        ),
    );
    const endless = new CloudClient({
      host: "https://a.example",
      token: "mdg_faketoken",
      fetch: chunked.fetcher,
    });
    expect((await failure(() => endless.session())).code).toBe("cloud.response-too-large");
  });
});

describe("without a token", () => {
  it("every call that needs one fails as not signed in (exit code 3), and sends nothing", async () => {
    const { calls, fetcher } = recorder();
    const api = new CloudClient({ host: "https://diagrams.example", fetch: fetcher });
    const id = projectId();
    for (const call of [
      () => api.session(),
      () => api.projects(),
      () => api.getProject(id),
      () => api.files(id),
      () => api.pushFiles(id, {}),
      () => api.blobExists(id, "0".repeat(64)),
      () => api.putBinary(id, "a.png", new Uint8Array(1)),
      () => api.blob(id, "0".repeat(64)),
      () => api.versions(id),
      () => api.readVersion(id, 1),
      () => api.publication(id),
      () => api.publish(id, { slug: "a", html: "x" }),
      () => api.unpublish(id, "a"),
      () => api.setHandle("ana"),
      () => api.deleteToken("1"),
      () => api.usage(),
      () => api.createProject({ name: "x" }),
    ]) {
      const error = await failure(call);
      expect(error.code).toBe("cloud.not-signed-in");
      expect(error.exitCode).toBe(3);
    }
    expect(calls).toEqual([]);
  });

  it("treats an empty token as none", async () => {
    const api = new CloudClient({ host: "https://diagrams.example", token: "" });
    expect((await failure(() => api.session())).code).toBe("cloud.not-signed-in");
  });
});

describe("the API", () => {
  it("answers who a token is for, and which token it is", async () => {
    stub.account.handle = "ana";
    const { token, id, name } = stub.mint("ci");
    const session = await client({}, token).session();
    expect(session).toEqual({
      user: { sub: "u_7d3f", name: "Ana", picture: "", handle: "ana" },
      token: { id, name },
    });
    stub.account.handle = null;
    expect((await client({}, token).session()).user.handle).toBeNull();
  });

  it("treats the anonymous answer to a token as refusing it", async () => {
    const { fetcher } = recorder(() => Response.json({ user: null, signIn: "https://x" }));
    const api = new CloudClient({
      host: "https://a.example",
      token: "mdg_faketoken",
      fetch: fetcher,
    });
    const error = await failure(() => api.session());
    expect(error.code).toBe("token.invalid");
    expect(error.exitCode).toBe(3);
  });

  it("lists, reads and creates projects", async () => {
    const api = client();
    const made = await api.createProject({
      name: "  Purchase ",
      files: { "project.json": "{}", "diagrams/a.meltemi": "diagram a: flow {}" },
    });
    expect(made).toMatchObject({ name: "Purchase", role: "owner", thumbnail: null });
    expect(made.id).toMatch(/^[0-9a-z]{20}$/);
    expect((await api.getProject(made.id)).name).toBe("Purchase");
    expect((await api.projects()).map((p) => p.id)).toContain(made.id);
    expect((await failure(() => api.createProject({ name: " " }))).code).toBe("request.invalid");
    const created = stub.to("/api/projects", "POST").at(-2)!;
    expect(JSON.parse(created.body.toString())).toEqual({
      name: "  Purchase ",
      files: { "project.json": "{}", "diagrams/a.meltemi": "diagram a: flow {}" },
    });
  });

  it("reads the files and pushes texts, binaries by hash and deletions in one transaction", async () => {
    const api = client();
    const logo = Buffer.from("logo bytes");
    const project = stub.addProject({
      revision: 5,
      files: { "project.json": "{}", "old.meltemi": "old" },
      binaries: { "assets/logo.png": logo },
    });
    const read = await api.files(project.id);
    expect(read).toEqual({
      revision: 5,
      files: { "project.json": "{}", "old.meltemi": "old" },
      binaries: { "assets/logo.png": sha256Hex(logo) },
      collisions: [],
    });
    const revision = await api.pushFiles(project.id, {
      files: { "new.meltemi": "new", "old.meltemi": null },
      binaries: { "assets/logo.png": null },
      ifRevision: read.revision,
    });
    expect(revision).toBe(6);
    const [push] = stub.to(`/api/projects/${project.id}/files`, "PUT").slice(-1);
    expect(JSON.parse(push!.body.toString())).toEqual({
      files: { "new.meltemi": "new", "old.meltemi": null },
      binaries: { "assets/logo.png": null },
      ifRevision: 5,
    });
    expect(push!.headers["content-type"]).toBe("application/json");
    expect([...project.files.keys()].sort()).toEqual(["new.meltemi", "project.json"]);
    // The same push again changes nothing, and is at the new revision.
    expect(
      await api.pushFiles(project.id, { files: { "new.meltemi": "new" }, ifRevision: 6 }),
    ).toBe(6);
  });

  it("keeps a file named __proto__ a file", async () => {
    const project = stub.addProject({ files: {} });
    project.files.set("__proto__", "x");
    const read = await client().files(project.id);
    expect(Object.keys(read.files)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(read.files)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("asks whether a blob is there, uploads one and reads it back checked against its hash", async () => {
    const api = client();
    const project = stub.addProject({ files: {} });
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const hash = sha256Hex(bytes);
    expect(await api.blobExists(project.id, hash)).toBe(false);
    expect(await api.putBinary(project.id, "assets/my logo (1).png", bytes)).toBe(hash);
    expect(await api.blobExists(project.id, hash)).toBe(true);
    const upload = stub.to(/\/binaries\//, "PUT").at(-1)!;
    expect(upload.path).toBe(`/api/projects/${project.id}/binaries/assets/my%20logo%20(1).png`);
    expect(upload.headers["content-type"]).toBe("application/octet-stream");
    expect([...upload.body]).toEqual([...bytes]);
    expect(project.binaries.get("assets/my logo (1).png")).toBe(hash);
    expect([...(await api.blob(project.id, hash))]).toEqual([...bytes]);

    // Bytes that are not what their name says are not accepted, unless asked.
    const wrong = "a".repeat(64);
    project.blobs.set(wrong, Buffer.from("not that"));
    expect((await failure(() => api.blob(project.id, wrong))).code).toBe("cloud.bad-response");
    expect([...(await api.blob(project.id, wrong, { verify: false }))]).toEqual([
      ...Buffer.from("not that"),
    ]);
    expect((await failure(() => api.blob(project.id, "b".repeat(64)))).code).toBe("not-found");
  });

  it("refuses locally what the service would refuse, without a request", async () => {
    const api = client();
    const before = stub.requests.length;
    expect(
      (await failure(() => api.putBinary("p", "a.png", new Uint8Array(10 * 1024 * 1024 + 1)))).code,
    ).toBe("quota.binary");
    expect((await failure(() => api.putBinary("p", "../a.png", new Uint8Array(1)))).code).toBe(
      "path.invalid",
    );
    expect((await failure(() => api.putBinary("p", ".git/x.png", new Uint8Array(1)))).code).toBe(
      "path.invalid",
    );
    expect((await failure(() => api.readVersion("p", 0))).code).toBe("version.not-found");
    expect((await failure(() => api.readVersion("p", 1.5))).code).toBe("version.not-found");
    const huge = "x".repeat(MAX_PUSH_BYTES);
    expect((await failure(() => api.pushFiles("p", { files: { "a.meltemi": huge } }))).code).toBe(
      "doc.too-large",
    );
    expect(stub.requests.length).toBe(before);
  });

  it("lists versions and reads one with its files", async () => {
    const api = client();
    const project = stub.addProject({
      files: { "a.meltemi": "one" },
      binaries: { "i.png": "img" },
    });
    stub.addVersion(project, "first");
    project.files.set("a.meltemi", "two");
    stub.addVersion(project, "", true);
    const versions = await api.versions(project.id);
    expect(versions.map((v) => [v.number, v.label, v.auto])).toEqual([
      [2, "", true],
      [1, "first", false],
    ]);
    const one = await api.readVersion(project.id, 1);
    expect(one.files).toEqual({ "a.meltemi": "one" });
    expect(one.binaries).toEqual({ "i.png": sha256Hex("img") });
    expect(one.label).toBe("first");
    const missing = await failure(() => api.readVersion(project.id, 99));
    expect(missing.code).toBe("version.not-found");
    expect(missing.status).toBe(404);
  });

  it("reads the publications, publishes and unpublishes", async () => {
    const api = client();
    const project = stub.addProject({ files: {} });
    stub.account.handle = null;
    expect(await api.publication(project.id)).toEqual({
      handle: null,
      publications: [],
      takedowns: [],
    });
    const needsHandle = await failure(() =>
      api.publish(project.id, { slug: "shop", html: "<html>" }),
    );
    expect(needsHandle.code).toBe("handle.required");
    expect(needsHandle.status).toBe(409);
    stub.account.handle = "ana";
    const published = await api.publish(project.id, { slug: "shop", html: "<html>" });
    expect(published).toMatchObject({ handle: "ana", slug: "shop", bytes: 6 });
    expect(published.url).toBe(`${stub.url}/_published/ana/shop/`);
    expect((await api.publication(project.id)).publications.map((p) => p.slug)).toEqual(["shop"]);
    expect(
      (await failure(() => api.publish(project.id, { slug: "Bad Slug", html: "x" }))).code,
    ).toBe("publish.invalid");
    await api.unpublish(project.id, "shop");
    expect((await failure(() => api.unpublish(project.id, "shop"))).code).toBe("not-found");
    stub.account.handle = null;
  });

  it("learns that a token cannot choose a handle: the service says request.forbidden", async () => {
    const error = await failure(() => client().setHandle("ana"));
    expect(error.code).toBe("request.forbidden");
    expect(error.status).toBe(403);
    expect(JSON.parse(stub.to("/api/account", "PATCH").at(-1)!.body.toString())).toEqual({
      handle: "ana",
    });
  });

  it("revokes a token, the one in use included, and then it is refused", async () => {
    const { token, id } = stub.mint("old");
    const api = client({}, token);
    await api.deleteToken(id);
    expect((await failure(() => api.session())).code).toBe("token.invalid");
    const { token: other } = stub.mint("other");
    expect((await failure(() => client({}, other).deleteToken("nope"))).code).toBe("not-found");
    expect((await client({}, other).usage()).limits["projects"]).toBe(100);
  });
});
