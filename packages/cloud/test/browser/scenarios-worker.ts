/**
 * What only the real runtime can prove of the Worker and its rooms, asked as a program (the command
 * line, a script) asks it, from Node: the door of the socket route with the browser's own refusals,
 * the room's rules over a crafted update, and the Worker's limits, rates and refusals in workerd.
 * The page cannot make these requests (it never sends a bad path or a foreign origin), so they are
 * made here, against the same Worker the page runs on.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import * as Y from "yjs";
import type { Scenario } from "./scenario.js";
import { PNG, makeProject, readRoom, roomStats, sha256 } from "./cloud.js";
import { KIND, RoomClient } from "./room-socket.js";
import { assertError } from "./support.js";

/** What the door of the socket route answered an upgrade: the status, and the body of a refusal. */
async function upgrade(
  origin: string,
  path: string,
  headers: Record<string, string>,
  method = "GET",
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${origin}${path}`,
      {
        method,
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
          ...headers,
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    // A switch to the socket protocol is an upgrade the suite does not follow: it is the answer.
    request.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode ?? 101, body: "" });
    });
    request.on("error", reject);
    request.setTimeout(15_000, () => request.destroy(new Error("The upgrade got no answer.")));
    request.end();
  });
}

export const workerScenarios: Scenario[] = [
  {
    name: "the room's door, as a program meets it: foreign origin, anonymous, another person's project, no upgrade and the internal routes refused; an owner's hello whatever headers it sends; a bad path, an unknown hash and a 21st client refused",
    signedIn: "u-ana-door",
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Door", { template: "flow" });
      const bob = await t.person("u-bob-door");
      const path = `/rooms/${project.id}`;

      // Refused before anything reaches the room, each with the Worker's own answer.
      const anonymous = await upgrade(origin, path, { Origin: origin });
      assert.equal(anonymous.status, 401);
      assert.equal(JSON.parse(anonymous.body).code, "auth.required");
      const foreign = await upgrade(origin, path, {
        ...t.me.cookie,
        Origin: "https://evil.example",
      });
      assert.equal(foreign.status, 403);
      assert.equal(JSON.parse(foreign.body).code, "request.forbidden");
      const strangers = await upgrade(origin, path, { ...bob.cookie, Origin: origin });
      assert.equal(strangers.status, 404, "another person's project is not there for them");
      assert.equal(JSON.parse(strangers.body).code, "project.not-found");
      // Not an upgrade at all, and the room's internal routes, are the Worker's JSON 404.
      assertError(await t.me.api("GET", path), 404, "not-found");
      const held = await readRoom(t.me, project.id);
      for (const internal of ["destroy", "stats", "disconnect", "files", "connect"]) {
        const answer = await t.me.api("POST", `${path}/${internal}`);
        assert.equal(answer.status, 404, internal);
      }
      const again = await readRoom(t.me, project.id);
      assert.equal(again.revision, held.revision, "the room kept its document and revision");
      assert.deepEqual(again.files, held.files);

      // The owner gets through, and the hello is what the Worker resolved, not what the client claims.
      const owner = new RoomClient(origin, project.id, t.me, {
        "X-Meltemi-Role": "viewer",
        "X-Meltemi-Sub": "u-bob-door",
        "X-Meltemi-Name": "Mallory",
      });
      await owner.until("the hello", () => owner.frames.some((frame) => frame.kind === KIND.hello));
      const hello = owner.json(KIND.hello);
      assert.equal(hello["role"], "owner");
      assert.equal(typeof hello["revision"], "number");
      assert.deepEqual(hello["collisions"], []);
      assert.equal((hello["you"] as { name?: string }).name, "Ana", "the name the session holds");

      // The room answers a sync with what the client lacks: the project, which it reads as a document.
      const doc = new Y.Doc();
      owner.send(KIND.sync, Y.encodeStateVector(doc));
      await owner.until("the update", () =>
        owner.frames.some((frame) => frame.kind === KIND.update),
      );
      Y.applyUpdate(doc, owner.frames.find((frame) => frame.kind === KIND.update)!.payload);
      const paths = doc.getMap<string>("paths");
      assert.deepEqual([...paths.values()].sort(), ["diagrams/overview.meltemi", "project.json"]);

      // A bad path is rolled back: the client is told, its socket closes with 4400, nothing changes.
      const [id] = [...paths.keys()];
      assert.ok(id);
      const changes: Uint8Array[] = [];
      doc.on("update", (update: Uint8Array) => changes.push(update));
      doc.transact(() => paths.set(id, "../secrets.meltemi"));
      owner.send(KIND.update, changes.pop()!);
      await owner.until("the bad path to be refused", () => owner.closed !== undefined);
      assert.deepEqual(owner.json(KIND.error), { code: "path.invalid" });
      assert.equal(owner.closed?.code, 4400);
      assert.deepEqual((await readRoom(t.me, project.id)).files, held.files);

      // A hash the project never uploaded: rolled back too.
      const second = new RoomClient(origin, project.id, t.me);
      await second.until("the hello", () =>
        second.frames.some((frame) => frame.kind === KIND.hello),
      );
      const fresh = new Y.Doc();
      second.send(KIND.sync, Y.encodeStateVector(fresh));
      await second.until("the update", () =>
        second.frames.some((frame) => frame.kind === KIND.update),
      );
      Y.applyUpdate(fresh, second.frames.find((frame) => frame.kind === KIND.update)!.payload);
      const forged: Uint8Array[] = [];
      fresh.on("update", (update: Uint8Array) => forged.push(update));
      fresh.transact(() => {
        fresh.getMap<string>("paths").set("zzzzzzzzzzzzzzzz", "assets/forged.png");
        fresh.getMap<string>("binaries").set("zzzzzzzzzzzzzzzz", "ab".repeat(32));
      });
      second.send(KIND.update, forged.pop()!);
      await second.until("the unknown hash to be refused", () => second.closed !== undefined);
      assert.deepEqual(second.json(KIND.error), { code: "blob.unknown" });
      assert.equal(second.closed?.code, 4400);
      const after = await readRoom(t.me, project.id);
      assert.deepEqual(after.files, held.files);
      assert.deepEqual(after.binaries, {});

      // Twenty clients fit; the 21st is told room.full and never gets a hello. (It is closed with
      // 4409 as well, but a close the room sends before the upgrade is answered reaches a client
      // only after many seconds on this laptop's runtime, so the suite does not wait for it.)
      const clients: RoomClient[] = [];
      for (let number = 0; number < 20; number++) {
        const client = new RoomClient(origin, project.id, t.me);
        await client.until("a hello", () =>
          client.frames.some((frame) => frame.kind === KIND.hello),
        );
        clients.push(client);
      }
      const extra = new RoomClient(origin, project.id, t.me);
      await extra.until("the 21st client to be told", () =>
        extra.frames.some((frame) => frame.kind === KIND.error),
      );
      assert.deepEqual(extra.json(KIND.error), { code: "room.full" });
      assert.ok(!extra.frames.some((frame) => frame.kind === KIND.hello));
      assert.ok(!extra.frames.some((frame) => frame.kind === KIND.update));
      assert.equal((await roomStats(t.me, project.id)).clients, 20);
      for (const client of [...clients, extra]) client.close();
    },
  },

  {
    name: "the Worker's refusals in the real runtime: a bad path on create and on push, a binary that is not what it claims or is too large, another project's blob, a thumbnail too often, too large or not an SVG, seven versions in a minute",
    signedIn: "u-ana-refusals",
    async run(t) {
      const { origin } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const other = await makeProject(t.me, "Other", { template: "flow" });
      const listed = async () =>
        ((await t.me.api("GET", "/api/projects")).json()["projects"] as unknown[]).length;
      const count = await listed();

      // A path the rule refuses: nothing is created, nothing is applied.
      assertError(
        await t.me.api("POST", "/api/projects", { name: "Bad", files: { "../x.meltemi": "x" } }),
        400,
        "path.invalid",
      );
      assert.equal(await listed(), count);
      const held = await readRoom(t.me, flow.id);
      for (const bad of ["..\\x.meltemi", ".git/hooks/post-checkout", "a:b.meltemi"]) {
        assertError(
          await t.me.api("PUT", `/api/projects/${flow.id}/files`, { files: { [bad]: "x" } }),
          400,
          "path.invalid",
        );
      }
      assert.equal((await readRoom(t.me, flow.id)).revision, held.revision);

      // Images and fonts: the bytes decide, not the type the request claims, and size has a limit.
      const upload = (id: string, name: string, body: Uint8Array | string, type: string) =>
        t.me.api("PUT", `/api/projects/${id}/binaries/${name}`, body, { "Content-Type": type });
      assertError(
        await upload(flow.id, "page.png", "<!doctype html><title>x</title>", "image/png"),
        400,
        "binary.invalid",
      );
      assertError(
        await upload(
          flow.id,
          "big.png",
          Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]),
          "image/png",
        ),
        413,
        "quota.binary",
      );
      assertError(await upload(flow.id, "..%2Fx.png", PNG, "image/png"), 400, "path.invalid");
      const stored = await upload(flow.id, "assets/logo.png", PNG, "text/html");
      assert.equal(stored.status, 200, stored.text);
      assert.equal(stored.json()["hash"], sha256(PNG));
      assert.deepEqual((await readRoom(t.me, flow.id)).binaries, {
        "assets/logo.png": sha256(PNG),
      });

      // The hash of another project's image is not there for this one (the address is scoped).
      const foreign = await fetch(`${origin}/api/projects/${other.id}/blobs/${sha256(PNG)}`, {
        headers: t.me.cookie,
      });
      assert.equal(foreign.status, 404);
      assert.equal(
        (
          await fetch(`${origin}/api/projects/${flow.id}/blobs/${sha256(PNG)}`, {
            headers: t.me.cookie,
          })
        ).status,
        200,
      );

      // Thumbnails: not an SVG, too large, then one, then another too soon.
      const picture =
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>';
      const thumbnail = (body: string, type = "image/svg+xml") =>
        t.me.api("PUT", `/api/projects/${other.id}/thumbnail`, body, { "Content-Type": type });
      assertError(await thumbnail(picture, "image/png"), 400, "thumbnail.invalid");
      assertError(
        await thumbnail(`<svg xmlns="http://www.w3.org/2000/svg">${"a".repeat(300 * 1024)}</svg>`),
        413,
        "thumbnail.too-large",
      );
      assertError(await thumbnail("<svg><unclosed></svg>"), 400, "thumbnail.invalid");
      assert.equal((await thumbnail(picture)).status, 204);
      const soon = await thumbnail(picture);
      assertError(soon, 429, "thumbnail.rate");
      assert.ok(Number(soon.headers.get("retry-after")) > 0, "the answer says when to come back");

      // Six versions in a minute; the seventh is refused and records nothing.
      for (let number = 1; number <= 6; number++) {
        const made = await t.me.api("POST", `/api/projects/${flow.id}/versions`, {
          label: `v${number}`,
        });
        assert.equal(made.status, 201, `${number}: ${made.text}`);
      }
      assertError(
        await t.me.api("POST", `/api/projects/${flow.id}/versions`, { label: "v7" }),
        429,
        "versions.rate",
      );
      const versions = (await t.me.api("GET", `/api/projects/${flow.id}/versions`)).json()[
        "versions"
      ] as { label: string }[];
      assert.deepEqual(versions.map((version) => version.label).sort(), [
        "v1",
        "v2",
        "v3",
        "v4",
        "v5",
        "v6",
      ]);
      assertError(
        await t.me.api("GET", `/api/projects/${flow.id}/versions/99`),
        404,
        "version.not-found",
      );
    },
  },
];
