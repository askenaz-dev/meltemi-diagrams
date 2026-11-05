// The routes over the operations (change agent-mcp, task 1.2): the refusals an operation throws are
// answered by the routes exactly as the routes answered them before the operations existed. A rate's
// wait is the `Retry-After` header of the HTTP answer and not a field of its body, which stays
// `{ code, message }` (the MCP tools give it as `retryAfter`, having no header).

import { describe, expect, it } from "vitest";
import { jsonOf } from "./support/index.js";
import { MINUTE, projects } from "./support/projects.js";

const ANA = "u-ana";

describe("a rate refused through a route", () => {
  it("answers versions.rate with Retry-After and a body of code and message only", async () => {
    const p = await projects();
    const id = await p.create(ANA, { name: "Kept", files: { "a.md": "a" } });
    for (let n = 0; n < 6; n++) {
      expect((await p.sendJson(ANA, "POST", `/api/projects/${id}/versions`, {})).status).toBe(201);
    }
    const seventh = await p.sendJson(ANA, "POST", `/api/projects/${id}/versions`, {});
    expect(seventh.status).toBe(429);
    expect(seventh.headers.get("Retry-After")).toBe("60");
    expect(Object.keys(await jsonOf(seventh)).sort()).toEqual(["code", "message"]);
  });

  it("answers publish.rate with Retry-After and a body of code and message only", async () => {
    const p = await projects({ env: { PUBLISH_HOST: "meltemi.page" } });
    const id = await p.create(ANA, { name: "Published" });
    expect((await p.sendJson(ANA, "PATCH", "/api/account", { handle: "ana" })).status).toBe(200);
    for (let n = 0; n < 10; n++) {
      p.h.clock.advance(MINUTE);
      const put = await p.sendJson(ANA, "PUT", `/api/projects/${id}/publish`, {
        slug: `page-${n}`,
        html: "<!doctype html><p>a page</p>",
      });
      expect(put.status, `request ${n + 1}`).toBe(200);
    }
    const eleventh = await p.sendJson(ANA, "PUT", `/api/projects/${id}/publish`, {
      slug: "page-10",
      html: "<!doctype html><p>a page</p>",
    });
    expect(eleventh.status).toBe(429);
    expect(Number(eleventh.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Object.keys(await jsonOf(eleventh)).sort()).toEqual(["code", "message"]);
  });
});
