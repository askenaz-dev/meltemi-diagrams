import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Scratch } from "./cloud-fixtures.js";
import { ok, startMcp, type Running } from "./mcp-support.js";

const source = `language "0.2"
diagram d: flow {
  layout manual
  a -> b as request
  placement { place a at (80, 80); place b at (400, 80) }
}
story tour for d {
  scene first { highlight a over 10s }
  scene second { overlap 8s; highlight b over 10s }
  scene third { overlap 8s; trace request over 10s }
}
`;

describe("folder MCP inspection of concurrent scenes", () => {
  const scratch = new Scratch();
  const folder = scratch.folder({ "story.meltemi": source });
  const file = join(folder, "story.meltemi");
  const requests: string[] = [];
  let server: Running;

  beforeAll(async () => {
    server = await startMcp(["--folder", folder], {
      cwd: scratch.root,
      env: { MELTEMI_LANG: "en" },
      hooks: {
        fetch: async (request) => {
          requests.push(String(request));
          throw new Error("A local story inspection must not contact a service.");
        },
      },
    });
  });

  afterAll(async () => {
    if (server) expect(await server.stop()).toBe(0);
    expect(scratch.root.startsWith(join(tmpdir(), "mdg-cloud-"))).toBe(true);
    rmSync(scratch.root, { recursive: true, force: true });
  });

  it("reports the compiled overlaps, absolute action times and directed closing instants", async () => {
    const inspection = ok(
      await server.call("inspect_story", { path: "story.meltemi", story: "tour" }),
    );
    expect(inspection).toMatchObject({
      path: "story.meltemi",
      id: "tour",
      durationMs: 14000,
      diagnostics: [],
      scenes: [
        {
          id: "first",
          startMs: 0,
          endMs: 10000,
          stillAtMs: 10000,
          actions: [{ startMs: 0, endMs: 10000 }],
        },
        {
          id: "second",
          startMs: 2000,
          endMs: 12000,
          stillAtMs: 12000,
          actions: [{ startMs: 2000, endMs: 12000 }],
        },
        {
          id: "third",
          startMs: 4000,
          endMs: 14000,
          stillAtMs: 14000,
          actions: [{ startMs: 4000, endMs: 14000 }],
        },
      ],
    });
    expect(readFileSync(file, "utf8")).toBe(source);
    expect(requests).toEqual([]);

    writeFileSync(
      file,
      source.replace("scene second { overlap 8s;", "scene second { overlap 0ms;"),
    );
    const changed = ok(
      await server.call("inspect_story", { path: "story.meltemi", story: "tour" }),
    );
    expect(changed["revision"]).not.toBe(inspection["revision"]);
    expect(changed).toMatchObject({
      durationMs: 22000,
      scenes: [{ startMs: 0 }, { startMs: 10000 }, { startMs: 12000 }],
    });
    expect(requests).toEqual([]);
  });
});
