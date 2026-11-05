// Idempotent creation and pushes (`cloud-projects`, "Idempotent creation and pushes"): the
// `Idempotency-Key` of `POST /api/projects` and `PUT /api/projects/:id/files`, through the Worker with
// the in-memory store and rooms.

import { describe, expect, it } from "vitest";
import { jsonOf } from "./support/index.js";
import { DAY, HOUR, JSON_TYPE, codeOf, projects } from "./support/projects.js";

const SUB = "u-ana";

describe("an idempotent creation", () => {
  it("is answered again for the same key and body, with Idempotent-Replayed, and makes one project", async () => {
    const p = await projects();
    const body = JSON.stringify({ name: "Checkout" });
    const first = await p.send(SUB, "POST", "/api/projects", body, {
      ...JSON_TYPE,
      "Idempotency-Key": "k1",
    });
    const second = await p.send(SUB, "POST", "/api/projects", body, {
      ...JSON_TYPE,
      "Idempotency-Key": "k1",
    });

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
    expect(await p.h.store.listProjects(SUB)).toHaveLength(1);
  });

  it("refuses the same key with another body, 409 idempotency.mismatch, and creates nothing", async () => {
    const p = await projects();
    const headers = { ...JSON_TYPE, "Idempotency-Key": "k1" };
    await p.send(SUB, "POST", "/api/projects", JSON.stringify({ name: "Checkout" }), headers);
    const other = await p.send(
      SUB,
      "POST",
      "/api/projects",
      JSON.stringify({ name: "Billing" }),
      headers,
    );

    expect([other.status, await codeOf(other)]).toEqual([409, "idempotency.mismatch"]);
    expect((await p.h.store.listProjects(SUB)).map((project) => project.name)).toEqual([
      "Checkout",
    ]);
  });

  it("is per account: another person's same key makes their own project", async () => {
    const p = await projects();
    const headers = { ...JSON_TYPE, "Idempotency-Key": "k1" };
    const body = JSON.stringify({ name: "Checkout" });
    await p.send(SUB, "POST", "/api/projects", body, headers);
    const bob = await p.send("u-bob", "POST", "/api/projects", body, headers);
    expect(bob.status).toBe(201);
    expect(bob.headers.get("Idempotent-Replayed")).toBeNull();
    expect(await p.h.store.listProjects("u-bob")).toHaveLength(1);
  });

  it.each([
    ["65 characters", "k".repeat(65)],
    ["a space", "k 1"],
    ["a control character", "k\u00011"],
    ["a character beyond ASCII", "clé"],
  ])("refuses a key with %s, 400 request.invalid, and creates nothing", async (_label, key) => {
    const p = await projects();
    // A header cannot carry every character: those a Request refuses never reach the Worker.
    let response: Response;
    try {
      response = await p.send(SUB, "POST", "/api/projects", JSON.stringify({ name: "Checkout" }), {
        ...JSON_TYPE,
        "Idempotency-Key": key,
      });
    } catch {
      return;
    }
    expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    expect(await p.h.store.listProjects(SUB)).toHaveLength(0);
  });

  it("keeps a refusal of the request itself, and answers it again", async () => {
    const p = await projects();
    const headers = { ...JSON_TYPE, "Idempotency-Key": "k1" };
    const body = JSON.stringify({ name: "" });
    const first = await p.send(SUB, "POST", "/api/projects", body, headers);
    const second = await p.send(SUB, "POST", "/api/projects", body, headers);
    expect([first.status, second.status]).toEqual([400, 400]);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
  });

  it("forgets a key after a day, so that the same key makes a new project", async () => {
    const p = await projects();
    const headers = { ...JSON_TYPE, "Idempotency-Key": "k1" };
    const body = JSON.stringify({ name: "Checkout" });
    await p.send(SUB, "POST", "/api/projects", body, headers);
    p.h.clock.advance(DAY - HOUR);
    expect(
      (await p.send(SUB, "POST", "/api/projects", body, headers)).headers.get(
        "Idempotent-Replayed",
      ),
    ).toBe("true");
    p.h.clock.advance(HOUR + 1);
    const later = await p.send(SUB, "POST", "/api/projects", body, headers);
    expect(later.status).toBe(201);
    expect(later.headers.get("Idempotent-Replayed")).toBeNull();
    expect(await p.h.store.listProjects(SUB)).toHaveLength(2);
  });

  it("lets go of the key when the service fails, so that a retry runs again", async () => {
    const p = await projects();
    const headers = { ...JSON_TYPE, "Idempotency-Key": "k1" };
    // The template's files are not served: an internal error, which is not the request's to repeat.
    p.h.assets.files.delete("/templates.json");
    const body = JSON.stringify({ name: "Checkout", template: "flow" });
    const failed = await p.send(SUB, "POST", "/api/projects", body, headers);
    expect(failed.status).toBe(500);
    const { serveTemplates } = await import("./support/templates.js");
    serveTemplates(p.h);
    const retried = await p.send(SUB, "POST", "/api/projects", body, headers);
    expect(retried.status).toBe(201);
    expect(retried.headers.get("Idempotent-Replayed")).toBeNull();
  });
});

describe("an idempotent push", () => {
  it("is applied once: both answers carry the same revision, the second replayed", async () => {
    const p = await projects();
    const id = await p.create(SUB);
    const push = JSON.stringify({ files: { "a.meltemi": "one\n" }, ifRevision: 0 });
    const headers = { ...JSON_TYPE, "Idempotency-Key": "push-1" };
    const first = await p.send(SUB, "PUT", `/api/projects/${id}/files`, push, headers);
    const second = await p.send(SUB, "PUT", `/api/projects/${id}/files`, push, headers);

    expect([first.status, second.status]).toEqual([200, 200]);
    const revision = (await jsonOf<{ revision: number }>(first)).revision;
    expect(await jsonOf(second)).toEqual({ revision });
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await p.h.rooms.read(id)).revision).toBe(revision);
  });

  it("refuses another push under the key, 409 idempotency.mismatch, and the room is unchanged", async () => {
    const p = await projects();
    const id = await p.create(SUB);
    const headers = { ...JSON_TYPE, "Idempotency-Key": "push-1" };
    await p.send(
      SUB,
      "PUT",
      `/api/projects/${id}/files`,
      JSON.stringify({ files: { "a.meltemi": "one\n" } }),
      headers,
    );
    const before = await p.h.rooms.read(id);
    const other = await p.send(
      SUB,
      "PUT",
      `/api/projects/${id}/files`,
      JSON.stringify({ files: { "a.meltemi": "two\n" } }),
      headers,
    );
    expect([other.status, await codeOf(other)]).toEqual([409, "idempotency.mismatch"]);
    expect(await p.h.rooms.read(id)).toEqual(before);
  });

  it("is a different request on another project: the key used on one is a mismatch on the other", async () => {
    const p = await projects();
    const one = await p.create(SUB, { name: "One" });
    const two = await p.create(SUB, { name: "Two" });
    const push = JSON.stringify({ files: { "a.meltemi": "one\n" } });
    const headers = { ...JSON_TYPE, "Idempotency-Key": "push-1" };
    await p.send(SUB, "PUT", `/api/projects/${one}/files`, push, headers);
    const other = await p.send(SUB, "PUT", `/api/projects/${two}/files`, push, headers);
    expect(await codeOf(other)).toBe("idempotency.mismatch");
  });

  it("keeps a stale push's refusal: the same retry is the same conflict", async () => {
    const p = await projects();
    const id = await p.create(SUB);
    await p.sendJson(SUB, "PUT", `/api/projects/${id}/files`, { files: { "b.meltemi": "b\n" } });
    const push = JSON.stringify({ files: { "a.meltemi": "one\n" }, ifRevision: 0 });
    const headers = { ...JSON_TYPE, "Idempotency-Key": "push-1" };
    const first = await p.send(SUB, "PUT", `/api/projects/${id}/files`, push, headers);
    const second = await p.send(SUB, "PUT", `/api/projects/${id}/files`, push, headers);
    expect([first.status, second.status]).toEqual([409, 409]);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
  });
});
