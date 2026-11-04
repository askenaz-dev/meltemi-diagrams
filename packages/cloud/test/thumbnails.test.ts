// Thumbnails (`cloud-projects`, "Thumbnails"; task 2.6): `PUT` and `GET /api/projects/:id/thumbnail`
// through the handler with the in-memory store, rooms and bucket. A project's picture is an SVG the
// page renders; the service keeps one, takes one per thirty seconds, and serves it so that nothing in
// it can run on the page's origin.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { afterEach, describe, expect, it, vi } from "vitest";
import { thumbnailKey } from "../src/keys.js";
import { jsonOf } from "./support/index.js";
import { KIB, codeOf, projects, svgOf } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const ANA = "u-ana";
const BETO = "u-beto";
const SVG = "image/svg+xml";

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup() {
  const p = await projects();
  const id = await p.create(ANA, { name: "Drawn", files: { "a.meltemi": "x\n" } });
  /** `type` is the `Content-Type` sent; `null` sends none. */
  const put = (body: BodyInit, type: string | null = SVG, who = ANA, on = id) =>
    p.send(
      who,
      "PUT",
      `/api/projects/${on}/thumbnail`,
      body,
      type === null ? {} : { "Content-Type": type },
    );
  const get = (who = ANA, on = id) => p.send(who, "GET", `/api/projects/${on}/thumbnail`);
  const stored = () => p.h.blobs.text(thumbnailKey(id));
  const listed = async () =>
    (
      await jsonOf<{ projects: { id: string; thumbnail: string | null }[] }>(
        await p.send(ANA, "GET", "/api/projects"),
      )
    ).projects.find((project) => project.id === id);
  return { ...p, id, put, get, stored, listed };
}

describe("PUT /api/projects/:id/thumbnail", () => {
  it("stores the SVG, sets thumbnail_at, and the project then advertises its thumbnail", async () => {
    const w = await setup();
    expect((await w.listed())?.thumbnail).toBeNull();
    const svg = svgOf(0, "<circle r='5'/>");

    const response = await w.put(svg);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(w.stored()).toBe(svg);
    expect((await w.h.store.project(ANA, w.id))?.thumbnailAt).toBe(w.h.clock.now().toISOString());
    expect((await w.listed())?.thumbnail).toBe(`/api/projects/${w.id}/thumbnail`);
  });

  it("takes a type with parameters and in any case, and a document with a prolog", async () => {
    const w = await setup();
    const prolog = `<?xml version="1.0" encoding="UTF-8"?>\n${svgOf()}`;

    expect((await w.put(prolog, "image/svg+xml; charset=utf-8")).status).toBe(204);
    w.h.clock.advance(30_000);
    expect((await w.put(svgOf(), "IMAGE/SVG+XML")).status).toBe(204);
    w.h.clock.advance(30_000);
    expect((await w.put(svgOf(), " image/svg+xml ;charset=utf-8")).status).toBe(204);
  });

  it("answers 400 thumbnail.invalid for another type, whatever the body, and stores nothing", async () => {
    const w = await setup();
    for (const type of [
      "text/html",
      "image/png",
      "application/octet-stream",
      "text/xml",
      "svg",
      null,
    ]) {
      const response = await w.put(svgOf(), type);
      expect(response.status, String(type)).toBe(400);
      expect(await codeOf(response), String(type)).toBe("thumbnail.invalid");
    }
    expect(w.stored()).toBeUndefined();
    expect((await w.h.store.project(ANA, w.id))?.thumbnailAt).toBeNull();
  });

  it("answers 400 thumbnail.invalid for a body that is not a well-formed SVG, claiming the right type", async () => {
    const w = await setup();
    const bodies: [string, BodyInit][] = [
      ["nothing", ""],
      ["text", "a picture"],
      ["HTML", "<!doctype html><title>x</title><script>alert(1)</script>"],
      ["XML with another root", '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>'],
      ["an SVG that does not close", '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'],
      ["two roots", "<svg/><svg/>"],
      ["an entity it declares", '<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'],
      ["a PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])],
      [
        "bytes that are not UTF-8",
        new Uint8Array([
          0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0xfe, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e,
        ]),
      ],
    ];
    for (const [name, body] of bodies) {
      const response = await w.put(body);
      expect(response.status, name).toBe(400);
      expect(await codeOf(response), name).toBe("thumbnail.invalid");
    }
    expect(w.stored()).toBeUndefined();
  });

  it("answers 413 thumbnail.too-large for 300 KiB, and takes exactly 200 KiB", async () => {
    const w = await setup();

    const large = await w.put(svgOf(300 * KIB));

    expect(large.status).toBe(413);
    expect(await codeOf(large)).toBe("thumbnail.too-large");
    expect(w.stored()).toBeUndefined();
    // The limit is the byte: 200 KiB goes, one more does not. Neither refusal costs the thirty seconds.
    const exactly = svgOf(CLOUD_LIMITS.thumbnailBytes);
    expect(new TextEncoder().encode(exactly).length).toBe(CLOUD_LIMITS.thumbnailBytes);
    const over = svgOf(CLOUD_LIMITS.thumbnailBytes + 1);
    expect(new TextEncoder().encode(over).length).toBe(CLOUD_LIMITS.thumbnailBytes + 1);
    expect((await w.put(over)).status).toBe(413);
    expect((await w.put(exactly)).status).toBe(204);
    expect(new TextEncoder().encode(w.stored() ?? "").length).toBe(CLOUD_LIMITS.thumbnailBytes);
  });

  it("does not read past the cap, and refuses at once a body that says it is longer", async () => {
    const w = await setup();
    let pulled = 0;
    let released = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(4096).fill(97));
      },
      cancel() {
        released = true;
      },
    });

    const { cookie } = await w.h.signedIn({ sub: ANA });
    const response = await w.h.request(
      `/api/projects/${w.id}/thumbnail`,
      w.h.fromPage(cookie, {
        method: "PUT",
        headers: { "Content-Type": SVG },
        body: endless,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
    expect(pulled * 4096).toBeLessThanOrEqual(CLOUD_LIMITS.thumbnailBytes + 3 * 4096);
    expect(released).toBe(true);
    // A body that says it is longer is not read at all, small as it really is.
    const declared = await w.h.request(
      `/api/projects/${w.id}/thumbnail`,
      w.h.fromPage(cookie, {
        method: "PUT",
        headers: { "Content-Type": SVG, "Content-Length": String(CLOUD_LIMITS.thumbnailBytes + 1) },
        body: svgOf(),
      }),
    );
    expect(declared.status).toBe(413);
  });

  it("answers 429 thumbnail.rate for a second thumbnail ten seconds after the first, and the first stays", async () => {
    const w = await setup();
    const first = svgOf(0, "<circle r='1'/>");
    expect((await w.put(first)).status).toBe(204);
    const taken = (await w.h.store.project(ANA, w.id))?.thumbnailAt;
    w.h.clock.advance(10_000);

    const second = await w.put(svgOf(0, "<circle r='2'/>"));

    expect(second.status).toBe(429);
    expect(await codeOf(second)).toBe("thumbnail.rate");
    expect(second.headers.get("Retry-After")).toBe("20");
    expect(w.stored()).toBe(first);
    expect((await w.h.store.project(ANA, w.id))?.thumbnailAt).toBe(taken);
  });

  it("takes the next one thirty seconds after the last, to the second", async () => {
    const w = await setup();
    await w.put(svgOf(0, "<circle r='1'/>"));
    w.h.clock.advance(29_999);
    expect((await w.put(svgOf())).status).toBe(429);
    w.h.clock.advance(1);

    const next = svgOf(0, "<circle r='3'/>");
    expect((await w.put(next)).status).toBe(204);
    expect(w.stored()).toBe(next);
    // And thirty seconds count from that one.
    w.h.clock.advance(5_000);
    const limited = await w.put(svgOf());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("25");
  });

  it("spends none of the thirty seconds on a thumbnail it refuses", async () => {
    const w = await setup();
    expect((await w.put("not an svg")).status).toBe(400);
    expect((await w.put(svgOf(300 * KIB))).status).toBe(413);
    expect((await w.put(svgOf(), "text/plain")).status).toBe(400);

    expect((await w.put(svgOf())).status).toBe(204);
  });

  it("has a rate of its own for each project", async () => {
    const w = await setup();
    const other = await w.create(ANA, { name: "Other", files: { "b.meltemi": "y\n" } });
    expect((await w.put(svgOf())).status).toBe(204);

    expect((await w.put(svgOf(), SVG, ANA, other)).status).toBe(204);
    expect((await w.put(svgOf())).status).toBe(429);
  });

  it("lets only one of two requests made together take the thirty seconds", async () => {
    const w = await setup();

    const answers = await Promise.all([
      w.put(svgOf(0, "<circle r='1'/>")),
      w.put(svgOf(0, "<circle r='2'/>")),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([204, 429]);
    expect([svgOf(0, "<circle r='1'/>"), svgOf(0, "<circle r='2'/>")]).toContain(w.stored());
  });

  it("gives the thirty seconds back when the bucket refuses the write, and stores nothing", async () => {
    const w = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    w.h.blobs.refuse = (op) => op === "put";

    const failed = await w.put(svgOf());

    expect(failed.status).toBe(500);
    expect(await jsonOf(failed)).toEqual({ code: "internal", message: "Something went wrong." });
    expect(w.stored()).toBeUndefined();
    expect((await w.h.store.project(ANA, w.id))?.thumbnailAt).toBeNull();
    w.h.blobs.refuse = undefined;
    expect((await w.put(svgOf())).status).toBe(204);
  });

  it("puts back the time of the thumbnail it did not replace when the bucket refuses", async () => {
    const w = await setup();
    await w.put(svgOf(0, "<circle r='1'/>"));
    const taken = (await w.h.store.project(ANA, w.id))?.thumbnailAt;
    w.h.clock.advance(40_000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    w.h.blobs.refuse = (op) => op === "put";

    expect((await w.put(svgOf(0, "<circle r='2'/>"))).status).toBe(500);

    expect((await w.h.store.project(ANA, w.id))?.thumbnailAt).toBe(taken);
    expect(w.stored()).toBe(svgOf(0, "<circle r='1'/>"));
  });

  it("deletes the object, and answers project.not-found, for a project deleted while it was being written", async () => {
    const w = await setup();
    const put = w.h.blobs.put.bind(w.h.blobs);
    w.h.blobs.put = async (key, value) => {
      await put(key, value);
      await w.h.store.deleteProject(ANA, w.id);
    };

    const response = await w.put(svgOf());

    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("project.not-found");
    expect(w.h.blobs.objects.has(thumbnailKey(w.id))).toBe(false);
  });

  it("is the owner's alone on a private project: another person, nobody, and a cookie from another page", async () => {
    const w = await setup();
    await w.send(BETO, "GET", "/api/session");

    const beto = await w.put(svgOf(), SVG, BETO);
    expect(beto.status).toBe(404);
    expect(await codeOf(beto)).toBe("project.not-found");
    const anonymous = await w.h.request(`/api/projects/${w.id}/thumbnail`, {
      method: "PUT",
      headers: { "Content-Type": SVG },
      body: svgOf(),
    });
    // Not 401: nobody learns that a private project exists.
    expect(anonymous.status).toBe(404);
    expect(await codeOf(anonymous)).toBe("project.not-found");
    const { cookie } = await w.h.signedIn({ sub: ANA });
    const forged = await w.h.request(`/api/projects/${w.id}/thumbnail`, {
      method: "PUT",
      headers: { Cookie: cookie, Origin: "https://evil.example", "Content-Type": SVG },
      body: svgOf(),
    });
    expect(forged.status).toBe(403);
    expect(w.stored()).toBeUndefined();
  });

  it("takes a bearer token, which needs no Origin", async () => {
    const w = await setup();
    const { token } = await addToken(w.h.store, { sub: ANA });

    const response = await w.h.request(
      `/api/projects/${w.id}/thumbnail`,
      bearer(token, { method: "PUT", headers: { "Content-Type": SVG }, body: svgOf() }),
    );

    expect(response.status).toBe(204);
  });

  it("answers project.not-found for a project that does not exist or cannot be one", async () => {
    const w = await setup();
    for (const id of ["nosuchproject0000000x", "not-an-id"]) {
      const response = await w.put(svgOf(), SVG, ANA, id);
      expect(response.status, id).toBe(404);
      expect(await codeOf(response), id).toBe("project.not-found");
    }
  });
});

describe("GET /api/projects/:id/thumbnail", () => {
  it("serves the SVG as image/svg+xml, sandboxed, and not sniffed", async () => {
    const w = await setup();
    const svg = svgOf(0, "<circle r='7'/>");
    await w.put(svg);

    const response = await w.get();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(svg);
    const expected: Record<string, string> = {
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="thumbnail.svg"',
      "Cache-Control": "private, max-age=60",
      "Content-Length": String(new TextEncoder().encode(svg).length),
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  it("serves a script in an SVG as the bytes it is, with nothing that lets it run", async () => {
    const w = await setup();
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/session")</script><circle r="1"/></svg>';
    expect((await w.put(evil)).status).toBe(204);

    const response = await w.get();

    expect(await response.text()).toBe(evil);
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment/);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("serves the newest thumbnail", async () => {
    const w = await setup();
    await w.put(svgOf(0, "<circle r='1'/>"));
    w.h.clock.advance(30_000);
    const newest = svgOf(0, "<circle r='2'/>");
    await w.put(newest);

    expect(await (await w.get()).text()).toBe(newest);
  });

  it("answers 404 not-found while the project has none, and when the object is gone", async () => {
    const w = await setup();
    const none = await w.get();
    expect(none.status).toBe(404);
    expect(await codeOf(none)).toBe("not-found");

    await w.put(svgOf());
    w.h.blobs.objects.delete(thumbnailKey(w.id));
    expect((await w.get()).status).toBe(404);
  });

  it("is the owner's alone while the project is private", async () => {
    const w = await setup();
    await w.put(svgOf());

    const beto = await w.get(BETO);
    expect(beto.status).toBe(404);
    expect(await codeOf(beto)).toBe("project.not-found");
    const anonymous = await w.h.request(`/api/projects/${w.id}/thumbnail`);
    expect(anonymous.status).toBe(404);
    expect(await codeOf(anonymous)).toBe("project.not-found");
    const { token } = await addToken(w.h.store, { sub: ANA });
    expect((await w.h.request(`/api/projects/${w.id}/thumbnail`, bearer(token))).status).toBe(200);
  });

  it("is gone with the project", async () => {
    const w = await setup();
    await w.put(svgOf());

    expect((await w.send(ANA, "DELETE", `/api/projects/${w.id}`)).status).toBe(204);

    expect(w.h.blobs.objects.has(thumbnailKey(w.id))).toBe(false);
    expect((await w.get()).status).toBe(404);
  });
});
