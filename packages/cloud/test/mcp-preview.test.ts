// The preview tool (`mcp-previews`): a picture of the project as it is now, drawn by its renderer
// object with the command line's engine, with the report beside it; the width and the rate it
// refuses, and what a file with an error answers. The renderer's core runs in Node with the files
// the Worker bundles (`support/renderer.ts`), one object per project as the binding gives.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@meltemi/diagrams-cli";
import type { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EFFECTS_PATH,
  EFFECTS_SOURCE,
  effectFramesJourney,
} from "../../acceptance/src/mcp/effects.js";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { PREVIEWS_PER_MINUTE } from "../src/mcp/tool.js";
import { call, mcp, ok, refused, type CallResult, type Mcp } from "./support/mcp.js";
import { pngSize } from "./support/renderer.js";

const ANA = "u-ana";
const ACCEPTANCE = join(REPO_ROOT, "corpus", "acceptance");

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** The `.meltemi` files of a folder, by name. */
function folderFiles(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(folder)
    .filter((n) => n.endsWith(".meltemi"))
    .sort()) {
    files[name] = readFileSync(join(folder, name), "utf8");
  }
  return files;
}

/** The command line's export to standard output, in this process. */
async function mdg(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

async function projectOf(
  files: Record<string, string>,
): Promise<{ m: Mcp; client: Client; id: string }> {
  const m = await mcp();
  const client = await m.connect(await m.token(ANA));
  const { id } = ok<{ id: string }>(
    await call(client, "create_project", { name: "Previewed", files }),
  );
  return { m, client, id };
}

const textItems = (result: CallResult) => result.content.filter((item) => item.type === "text");

describe("a preview", () => {
  it("is, as SVG, what export --fonts system writes for the same files", async () => {
    const folder = join(ACCEPTANCE, "flow");
    const { client, id } = await projectOf(folderFiles(folder));
    const cli = await mdg(
      "export",
      join(folder, "cycles.meltemi"),
      "--fonts",
      "system",
      "--stdout",
    );
    expect(cli.code, cli.stderr).toBe(0);

    const result = await call(client, "preview", {
      project: id,
      path: "cycles.meltemi",
      format: "svg",
    });

    expect(result.isError).toBeFalsy();
    const [svg, report] = textItems(result);
    expect(svg?.text).toBe(cli.stdout);
    expect(JSON.parse(report!.text!)).toEqual(result.structuredContent);
    expect(result.structuredContent).toMatchObject({ format: "svg", revision: 1, cached: false });
  }, 60_000);

  it("is by default a PNG 1280 pixels wide, with a report of the revision, the elements and the relations", async () => {
    const { client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const result = await call(client, "preview", { project: id, path: "parallel.meltemi" });

    const images = result.content.filter((item) => item.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/png");
    const png = new Uint8Array(Buffer.from(images[0]!.data!, "base64"));
    expect(pngSize(png)?.width).toBe(1280);
    const report = ok<Record<string, unknown>>(result);
    expect(report).toMatchObject({ format: "png", width: 1280, revision: 1, estimatedFonts: [] });
    expect(report["elements"]).toBeGreaterThan(0);
    expect(report["relations"]).toBeGreaterThan(0);
    expect(
      (report["diagnostics"] as { severity: string }[]).filter((d) => d.severity === "error"),
    ).toEqual([]);
  }, 60_000);

  it("draws a story's frame at the time asked, as export --story --at does", async () => {
    const folder = join(REPO_ROOT, "corpus", "valid", "stories");
    const { client, id } = await projectOf(folderFiles(folder));
    const cli = await mdg(
      "export",
      join(folder, "purchase.meltemi"),
      "--story",
      "purchase",
      "--at",
      "2.4s",
      "--fonts",
      "system",
      "--stdout",
    );
    expect(cli.code, cli.stderr).toBe(0);
    const result = await call(client, "preview", {
      project: id,
      path: "purchase.meltemi",
      story: "purchase",
      at: "2.4s",
      format: "svg",
    });
    expect(textItems(result)[0]?.text).toBe(cli.stdout);
  }, 60_000);

  it("answers a file with an error as diagram.invalid with its diagnostics, and no picture", async () => {
    const { m, client, id } = await projectOf({
      "bad.meltemi": "diagram x: flow {\n  element a ->\n}\n",
    });
    const result = await call(client, "preview", { project: id, path: "bad.meltemi" });
    const error = refused(result);
    expect(error["code"]).toBe("diagram.invalid");
    expect(
      (error["diagnostics"] as { severity: string; line: number }[]).some(
        (d) => d.severity === "error" && d.line >= 1,
      ),
    ).toBe(true);
    expect(result.content.some((item) => item.type === "image")).toBe(false);
    expect((await m.renderers.stats(id)).renders).toBe(0);
  }, 60_000);

  it("reports a layout warning with its line, and draws the picture", async () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const { client, id } = await projectOf({
      "board.meltemi": `language "0.2"\n\ndiagram ideas: free {\n  sticky crowded "${words}"\n\n  placement {\n    place crowded at (120, 120)\n    size crowded (60, 60)\n  }\n}\n`,
    });
    const report = ok<{ diagnostics: { code: string; line: number; severity: string }[] }>(
      await call(client, "preview", { project: id, path: "board.meltemi", format: "svg" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "layout.text-overflow",
        severity: "warning",
        path: "board.meltemi",
      }),
    );
  }, 60_000);

  it("draws a Fontsource family with the fallback and names it", async () => {
    const { client, id } = await projectOf({
      "hand.meltemi": [
        'language "0.2"',
        "",
        "diagram hand: flow {",
        '  web["Web shop"]',
        '  api["Orders API"]',
        "  web -> api",
        "",
        '  style web { font "Caveat" }',
        "}",
        "",
      ].join("\n"),
    });
    const report = ok<{ estimatedFonts: string[] }>(
      await call(client, "preview", { project: id, path: "hand.meltemi" }),
    );
    expect(report.estimatedFonts).toContain("Caveat");
  }, 60_000);

  it("answers the same preview of an unchanged revision from the object's cache, byte-equal", async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const first = await call(client, "preview", { project: id, path: "cycles.meltemi" });
    const renders = (await m.renderers.stats(id)).renders;
    const second = await call(client, "preview", { project: id, path: "cycles.meltemi" });
    expect(second.content[0]?.data).toBe(first.content[0]?.data);
    expect(ok(second)).toMatchObject({ cached: true });
    expect((await m.renderers.stats(id)).renders).toBe(renders);
  }, 60_000);
});

// `mcp-previews`, "A preview of the current revision" (effect frames) and "The motion of an effect
// frame": `at` without `story` draws the diagram's effects at that instant, and the report says
// where each is, so an agent proves an animated arrow with the tools alone.
describe("an effect frame", () => {
  interface Mark {
    x: number;
    y: number;
    along: number;
  }
  interface Motion {
    atMs: number;
    loopMs: number | null;
    truncated: boolean;
    effects: {
      target: string;
      role: string;
      effect: string;
      durationMs: number;
      delayMs: number;
      repeat: number | "forever";
      direction: string;
      phase: number | null;
      marks: Mark[];
    }[];
  }
  const motionOf = (result: CallResult) =>
    ok<{ motion?: Motion; revision: number; width: number }>(result);
  /** The centre of the particle a frame draws in a relation's group (`circlePath`). */
  const particle = (svg: string, relation: string) => {
    const group =
      new RegExp(`<g data-id="${relation}" data-role="relation">[\\s\\S]*?</g>`).exec(svg)?.[0] ??
      "";
    const circle = /<path d="M(-?[\d.]+) (-?[\d.]+) a([\d.]+) /.exec(group);
    return circle ? { x: Number(circle[1]) + Number(circle[3]), y: Number(circle[2]) } : undefined;
  };

  it("proves an animated arrow at two instants through the tools alone, without a story", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token(ANA));
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Effects" }));
    try {
      const found = await effectFramesJourney(
        {
          call: (name, args) => call(client, name, args),
          ok: async (name, args = {}) => ok(await call(client, name, args)),
        },
        id,
      );
      expect(found.along).toEqual([0.25, 0.75]);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("is, as SVG, what export --at writes for the same file", async () => {
    const folder = mkdtempSync(join(tmpdir(), "mdg-effect-frame-"));
    try {
      writeFileSync(join(folder, EFFECTS_PATH), EFFECTS_SOURCE);
      const { client, id } = await projectOf({ [EFFECTS_PATH]: EFFECTS_SOURCE });
      for (const at of ["300ms", "0.9s"]) {
        const cli = await mdg(
          "export",
          join(folder, EFFECTS_PATH),
          "--at",
          at,
          "--fonts",
          "system",
          "--stdout",
        );
        expect(cli.code, cli.stderr).toBe(0);
        const result = await call(client, "preview", {
          project: id,
          path: EFFECTS_PATH,
          at,
          format: "svg",
        });
        expect(textItems(result)[0]?.text).toBe(cli.stdout);
      }
      // Still by default: the picture the command line exports without --at.
      const cli = await mdg("export", join(folder, EFFECTS_PATH), "--fonts", "system", "--stdout");
      const still = await call(client, "preview", {
        project: id,
        path: EFFECTS_PATH,
        format: "svg",
      });
      expect(textItems(still)[0]?.text).toBe(cli.stdout);
      expect(motionOf(still).motion).toBeUndefined();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  it("gives the marks of a PNG in its pixels, and answers a frame again from the cache", async () => {
    const { m, client, id } = await projectOf({ [EFFECTS_PATH]: EFFECTS_SOURCE });
    const svg = motionOf(
      await call(client, "preview", {
        project: id,
        path: EFFECTS_PATH,
        at: "300ms",
        format: "svg",
      }),
    );
    const result = await call(client, "preview", { project: id, path: EFFECTS_PATH, at: "300ms" });
    const png = motionOf(result);
    expect(png.width).toBe(1280);
    const scale = 1280 / svg.width;
    const [inSvg] = svg.motion!.effects[0]!.marks;
    const [inPng] = png.motion!.effects[0]!.marks;
    expect(inPng!.along).toBe(0.25);
    expect(inPng!.x).toBeCloseTo(inSvg!.x * scale, 1);
    expect(inPng!.y).toBeCloseTo(inSvg!.y * scale, 1);
    expect(JSON.parse(textItems(result)[0]!.text!)).toEqual(result.structuredContent);

    const renders = (await m.renderers.stats(id)).renders;
    const again = await call(client, "preview", { project: id, path: EFFECTS_PATH, at: "300ms" });
    expect(ok(again)).toMatchObject({ cached: true, motion: png.motion });
    expect((await m.renderers.stats(id)).renders).toBe(renders);
    // Another instant is another picture, never the first one's from the cache.
    const later = motionOf(
      await call(client, "preview", { project: id, path: EFFECTS_PATH, at: "900ms" }),
    );
    expect(later.motion!.effects[0]!.marks[0]!.x).toBeGreaterThan(inPng!.x);
    expect((await m.renderers.stats(id)).renders).toBe(renders + 1);
  }, 60_000);

  it("lists every kind of effect with its marks, and says when one is outside its window", async () => {
    const { client, id } = await projectOf({
      "kinds.meltemi": [
        'language "0.2"',
        "",
        "diagram kinds: flow {",
        "  direction LR",
        '  a["A"]',
        '  b["B"]',
        '  c["C"]',
        "  a -> b as ab",
        "  b -> c as bc",
        "  a -> c as ac",
        "",
        "  animate ab { effect flow; particles 2; duration 1s; direction reverse }",
        "  animate bc { effect trace; duration 1s }",
        "  animate ac { effect dash; duration 1s }",
        "  animate b { effect pulse; duration 2s }",
        "  animate c { effect pulse; duration 1s; delay 1s; repeat 2 }",
        "}",
        "",
      ].join("\n"),
    });
    const frame = async (at: string) => {
      const result = await call(client, "preview", {
        project: id,
        path: "kinds.meltemi",
        at,
        format: "svg",
      });
      return { svg: textItems(result)[0]!.text!, motion: motionOf(result).motion! };
    };
    const { svg, motion } = await frame("400ms");
    expect(motion).toMatchObject({ atMs: 400, loopMs: 3000, truncated: false });
    expect(
      motion.effects.map((e) => [e.target, e.role, e.effect, e.direction, e.phase, e.marks.length]),
    ).toEqual([
      ["ab", "relation", "flow", "reverse", 0.4, 2],
      ["bc", "relation", "trace", "forward", 0.4, 1],
      ["ac", "relation", "dash", "forward", 0.4, 0],
      ["b", "element", "pulse", "forward", 0.2, 0],
      ["c", "element", "pulse", "forward", null, 0],
    ]);
    expect(motion.effects[0]!.marks.map((mark) => mark.along)).toEqual([0.4, 0.9]);
    expect(motion.effects[1]!.marks[0]!.along).toBe(0.5);
    expect(motion.effects[4]).toMatchObject({ delayMs: 1000, repeat: 2 });
    // The first particle of the reversed flow is the first circle its group draws.
    const drawn = particle(svg, "ab")!;
    expect(drawn.x).toBeCloseTo(motion.effects[0]!.marks[0]!.x, 1);
    expect(drawn.y).toBeCloseTo(motion.effects[0]!.marks[0]!.y, 1);
    // Inside its window the delayed pulse has a phase; after its last repeat it has none again.
    expect((await frame("1.5s")).motion.effects[4]!.phase).toBe(0.5);
    expect((await frame("3.5s")).motion.effects[4]!.phase).toBeNull();
  }, 60_000);

  it("says a diagram animates nothing, and keeps motion out of still pictures and story frames", async () => {
    const stories = folderFiles(join(REPO_ROOT, "corpus", "valid", "stories"));
    const { client, id } = await projectOf({
      ...stories,
      "plain.meltemi": 'language "0.2"\n\ndiagram plain: flow {\n  a -> b\n}\n',
    });
    const plain = await call(client, "preview", {
      project: id,
      path: "plain.meltemi",
      at: "1s",
      format: "svg",
    });
    expect(motionOf(plain).motion).toEqual({
      atMs: 1000,
      loopMs: null,
      effects: [],
      truncated: false,
    });
    const still = await call(client, "preview", {
      project: id,
      path: "plain.meltemi",
      format: "svg",
    });
    expect(textItems(plain)[0]?.text).toBe(textItems(still)[0]?.text);
    expect(motionOf(still).motion).toBeUndefined();
    const story = await call(client, "preview", {
      project: id,
      path: "purchase.meltemi",
      story: "purchase",
      at: "2.4s",
      format: "svg",
    });
    expect(motionOf(story).motion).toBeUndefined();
  }, 60_000);

  it("lists the first fifty effects and says there were more", async () => {
    const nodes = Array.from({ length: 61 }, (_, i) => `  n${i}["N${i}"]`);
    const relations = Array.from({ length: 60 }, (_, i) => `  n${i} -> n${i + 1} as r${i}`);
    const animations = Array.from({ length: 60 }, (_, i) => `  animate r${i} { effect flow }`);
    const { client, id } = await projectOf({
      "many.meltemi": [
        'language "0.2"',
        "",
        "diagram many: flow {",
        ...nodes,
        ...relations,
        ...animations,
        "}",
        "",
      ].join("\n"),
    });
    const { motion } = motionOf(
      await call(client, "preview", {
        project: id,
        path: "many.meltemi",
        at: "0ms",
        format: "svg",
      }),
    );
    expect(motion!.effects).toHaveLength(50);
    expect(motion!.effects.map((effect) => effect.target)).toEqual(
      Array.from({ length: 50 }, (_, i) => `r${i}`),
    );
    expect(motion!.truncated).toBe(true);
  }, 60_000);

  it("refuses a time that is not one, and draws nothing", async () => {
    const { m, client, id } = await projectOf({ [EFFECTS_PATH]: EFFECTS_SOURCE });
    const error = refused(
      await call(client, "preview", { project: id, path: EFFECTS_PATH, at: "soon" }),
    );
    expect(error["code"]).toBe("request.invalid");
    expect(String(error["message"])).toContain("`at`");
    expect((await m.renderers.stats(id)).renders).toBe(0);
  });
});

describe("the limits of previews", () => {
  it("refuses a width over 2048 as request.invalid naming the limit, and draws nothing", async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const result = refused(
      await call(client, "preview", { project: id, path: "cycles.meltemi", width: 4096 }),
    );
    expect(result).toMatchObject({ code: "request.invalid", limit: 2048 });
    expect(String(result["message"])).toContain("2048");
    expect((await m.renderers.stats(id)).renders).toBe(0);
  });

  it("refuses a file that is not one of the project's .meltemi files", async () => {
    const { client, id } = await projectOf({ "notes.md": "# notes" });
    for (const path of ["notes.md", "nothing.meltemi"]) {
      expect(refused(await call(client, "preview", { project: id, path }))["code"]).toBe(
        "request.invalid",
      );
    }
  });

  it(`answers the ${PREVIEWS_PER_MINUTE + 1}st preview of a minute with rate.limited, and draws no picture`, async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    for (let n = 0; n < PREVIEWS_PER_MINUTE; n++) {
      ok(await call(client, "preview", { project: id, path: "cycles.meltemi", format: "svg" }));
    }
    const renders = (await m.renderers.stats(id)).renders;
    const limited = refused(
      await call(client, "preview", { project: id, path: "nested.meltemi", format: "svg" }),
    );
    expect(limited).toMatchObject({ code: "rate.limited" });
    expect(limited["retryAfter"]).toBeGreaterThan(0);
    expect((await m.renderers.stats(id)).renders).toBe(renders);
    // Other tools are not previews: they go on.
    ok(await call(client, "read_files", { project: id, paths: ["cycles.meltemi"] }));
  }, 60_000);
});
