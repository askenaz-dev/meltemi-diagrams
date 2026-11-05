// The renderer object's drawing (`mcp-previews`): the acceptance corpus drawn over an in-memory
// project equals what `meltemi-diagrams export --fonts system` writes for the same files, PNGs come
// at the asked width, and the cache answers a repeated request with the same bytes and no drawing.
// The core runs in Node with exactly the files the Worker bundles (`support/renderer.ts`).

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "@meltemi/diagrams-cli";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { rendererBundleSource, BUNDLE_FILE } from "../scripts/renderer-bundle.js";
import {
  CACHE_ENTRIES,
  DEFAULT_PNG_WIDTH,
  MAX_PNG_WIDTH,
  RASTER_FACES,
  fittedWidth,
  isSfnt,
  memoryPreviewCache,
  rasterise,
  sfntFromWoff,
  type PreviewCache,
  type RenderOutcome,
  type RenderRequest,
  type RenderSuccess,
} from "@meltemi/diagrams-mcp/preview";
import { sqlPreviewCache } from "../src/renderer-cache.js";
import type { SqlRoomDb } from "../src/room-storage.js";
import { CLOUD, nodeRasterFonts, nodeRenderer, pngSize } from "./support/renderer.js";

const sqlite = await import("node:sqlite").catch(() => undefined);

const ACCEPTANCE = join(REPO_ROOT, "corpus", "acceptance");
const PROFILES = ["flow", "sequence", "c4", "free"] as const;

/** The command line's export to standard output, run in this process. */
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

/** The `.meltemi` files of a folder, by name, as the files of a project at its root. */
function folderFiles(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(folder)
    .filter((n) => n.endsWith(".meltemi"))
    .sort()) {
    files[name] = readFileSync(join(folder, name), "utf8");
  }
  return files;
}

/** The ids of the diagrams a sheet declares, in order. */
const diagramIds = (text: string): string[] =>
  [...text.matchAll(/^diagram ([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]!);

/** The sheets of the acceptance corpus with each of their diagrams. */
const SHEETS = PROFILES.flatMap((profile) => {
  const folder = join(ACCEPTANCE, profile);
  return Object.entries(folderFiles(folder)).flatMap(([name, text]) =>
    diagramIds(text).map((diagram) => ({ profile, folder, name, diagram })),
  );
});

/** The sheets that write a Fontsource family, which the renderer measures with the fallback. */
const FONTSOURCE = new Set(["typography.meltemi"]);

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function drawn(outcome: RenderOutcome): RenderSuccess {
  if (!outcome.ok) throw new Error(`not drawn: ${outcome.code}: ${outcome.message}`);
  return outcome;
}

function request(overrides: Partial<RenderRequest> & Pick<RenderRequest, "file">): RenderRequest {
  return {
    revision: 7,
    files: folderFiles(join(ACCEPTANCE, "flow")),
    format: "svg",
    ...overrides,
  };
}

describe("the renderer draws as the command line", () => {
  // Every sheet is drawn by an object of its own: the sheets share names and revisions, which an
  // object's cache would take for the same request.

  it("covers the four profiles of the acceptance corpus", () => {
    expect(new Set(SHEETS.map((s) => s.profile))).toEqual(new Set(PROFILES));
    expect(SHEETS.length).toBeGreaterThan(30);
  });

  it.each(
    SHEETS.filter((s) => !FONTSOURCE.has(s.name)).map(
      (s) => [`${s.profile}/${s.name}#${s.diagram}`, s] as const,
    ),
  )(
    "%s is the SVG of export --fonts system",
    async (_name, sheet) => {
      const cli = await mdg(
        "export",
        join(sheet.folder, sheet.name),
        "--diagram",
        sheet.diagram,
        "--fonts",
        "system",
        "--stdout",
      );
      expect(cli.code, cli.stderr).toBe(0);
      const preview = drawn(
        await nodeRenderer().render({
          revision: 1,
          files: folderFiles(sheet.folder),
          file: sheet.name,
          diagram: sheet.diagram,
          format: "svg",
        }),
      );
      expect(preview.contentType).toBe("image/svg+xml");
      expect(decode(preview.bytes)).toBe(cli.stdout);
      expect(preview.report.estimatedFonts).toEqual([]);
      expect(preview.report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(preview.report.elements).toBeGreaterThan(0);
    },
    60_000,
  );

  it.each(SHEETS.filter((s) => FONTSOURCE.has(s.name)).map((s) => [`${s.profile}`, s] as const))(
    "%s/typography names the Fontsource families it measured with the fallback",
    async (_profile, sheet) => {
      const text = readFileSync(join(sheet.folder, sheet.name), "utf8");
      const written = [...text.matchAll(/font "([^"]+)"/g)].map((m) => m[1]!);
      const preview = drawn(
        await nodeRenderer().render({
          revision: 1,
          files: folderFiles(sheet.folder),
          file: sheet.name,
          diagram: sheet.diagram,
          format: "svg",
        }),
      );
      expect(written.length).toBeGreaterThan(3);
      expect([...preview.report.estimatedFonts].sort()).toEqual([...new Set(written)].sort());
    },
    60_000,
  );

  it("draws a story's frame as export --story --at does", async () => {
    const folder = join(REPO_ROOT, "corpus", "valid", "stories");
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
    const renderer = nodeRenderer();
    const preview = drawn(
      await renderer.render({
        revision: 1,
        files: folderFiles(folder),
        file: "purchase.meltemi",
        story: "purchase",
        at: "2.4s",
        format: "svg",
      }),
    );
    expect(decode(preview.bytes)).toBe(cli.stdout);
    const end = drawn(
      await renderer.render({
        revision: 1,
        files: folderFiles(folder),
        file: "purchase.meltemi",
        story: "purchase",
        format: "svg",
      }),
    );
    expect(decode(end.bytes)).not.toBe(cli.stdout);
  }, 60_000);

  it("reports the size, the elements and the relations of the picture", async () => {
    const preview = drawn(await nodeRenderer().render(request({ file: "cycles.meltemi" })));
    const svg = decode(preview.bytes);
    const width = Number(/^<svg[^>]* width="([\d.]+)"/.exec(svg)![1]);
    expect(preview.report).toMatchObject({ revision: 7, format: "svg", width, truncated: false });
    expect(preview.report.elements).toBe(svg.split('data-role="element"').length - 1);
    expect(preview.report.relations).toBeGreaterThan(0);
  });
});

describe("PNG previews", () => {
  const renderer = nodeRenderer();

  it.each([
    [undefined, DEFAULT_PNG_WIDTH],
    [640, 640],
    [MAX_PNG_WIDTH, MAX_PNG_WIDTH],
  ])(
    "width %s draws a PNG %i pixels wide",
    async (width, expected) => {
      const svg = drawn(await renderer.render(request({ file: "cycles.meltemi" })));
      const png = drawn(
        await renderer.render(
          request({ file: "cycles.meltemi", format: "png", ...(width ? { width } : {}) }),
        ),
      );
      expect(png.contentType).toBe("image/png");
      const size = pngSize(png.bytes);
      expect(size?.width).toBe(expected);
      expect(size?.height).toBe(Math.round((expected * svg.report.height) / svg.report.width));
      expect(png.report).toMatchObject({ format: "png", width: expected, fitted: false });
      expect(png.report.height).toBe(size?.height);
      expect(png.report.estimatedFonts).toEqual([]);
    },
    60_000,
  );

  it("draws every profile, the sketch theme's hand and the mono tags included", async () => {
    for (const [profile, file] of [
      ["sequence", "thirty.meltemi"],
      ["c4", "nested.meltemi"],
      ["free", "sketch.meltemi"],
    ] as const) {
      const png = drawn(
        await nodeRenderer().render({
          revision: 1,
          files: folderFiles(join(ACCEPTANCE, profile)),
          file,
          format: "png",
        }),
      );
      expect(pngSize(png.bytes)?.width, `${profile}/${file}`).toBe(DEFAULT_PNG_WIDTH);
      expect(png.report.estimatedFonts, `${profile}/${file}`).toEqual([]);
    }
  }, 60_000);

  it("refuses a width over the limit, under it, or for an SVG", async () => {
    for (const [format, width] of [
      ["png", MAX_PNG_WIDTH + 1],
      ["png", 4096],
      ["png", 8],
      ["png", 640.5],
      ["svg", 640],
    ] as const) {
      const outcome = await renderer.render(request({ file: "cycles.meltemi", format, width }));
      expect(outcome, `${format} ${width}`).toMatchObject({ ok: false, code: "request.invalid" });
    }
    const wide = await renderer.render(
      request({ file: "cycles.meltemi", format: "png", width: 4096 }),
    );
    expect(!wide.ok && wide.message).toContain(String(MAX_PNG_WIDTH));
  });

  it("draws a picture taller than the pixel budget narrower, and says so", () => {
    expect(fittedWidth(2048, 100, 100)).toBe(2048);
    expect(fittedWidth(2048, 100, 400)).toBe(1024);
    expect(fittedWidth(1280, 100, 400)).toBe(1024);
    expect(fittedWidth(1000, 100, 400)).toBe(1000);
  });

  it("draws a Fontsource family with the fallback and names it", async () => {
    const files = folderFiles(join(ACCEPTANCE, "free"));
    const png = drawn(
      await nodeRenderer().render({
        revision: 1,
        files,
        file: "typography.meltemi",
        format: "png",
      }),
    );
    expect(pngSize(png.bytes)?.width).toBe(DEFAULT_PNG_WIDTH);
    expect(png.report.estimatedFonts).toContain("Caveat");
  }, 60_000);

  it("names IBM Plex Sans in a PNG, measured exactly but drawn with Inter", async () => {
    const files = {
      "plex.meltemi": [
        'language "0.2"',
        "",
        "diagram plex: flow {",
        '  theme "editorial.light"',
        '  a["Measured"]',
        '  b["Drawn"]',
        "  a -> b",
        "}",
        "",
      ].join("\n"),
    };
    const renderer = nodeRenderer();
    const svg = drawn(
      await renderer.render({ revision: 1, files, file: "plex.meltemi", format: "svg" }),
    );
    expect(svg.report.estimatedFonts).toEqual([]);
    const png = drawn(
      await renderer.render({ revision: 1, files, file: "plex.meltemi", format: "png" }),
    );
    expect(png.report.estimatedFonts).toEqual(["IBM Plex Sans"]);
  }, 60_000);

  it("names a family nobody bundles, which the layout estimated", async () => {
    const files = {
      "comic.meltemi": [
        'language "0.2"',
        "",
        "diagram comic: flow {",
        '  a["Comic"]',
        '  b["Plain"]',
        "  a -> b",
        '  style a { font "Comic Sans MS" }',
        "}",
        "",
      ].join("\n"),
    };
    const svg = drawn(
      await nodeRenderer().render({ revision: 1, files, file: "comic.meltemi", format: "svg" }),
    );
    expect(svg.report.estimatedFonts).toEqual(["Comic Sans MS"]);
    expect(svg.report.diagnostics.map((d) => d.code)).toContain("layout.unmeasured-font");
  }, 60_000);
});

describe("what the renderer refuses", () => {
  const renderer = nodeRenderer();

  it("answers a file with an error with its diagnostics and no picture", async () => {
    const folder = join(ACCEPTANCE, "errors");
    const outcome = await renderer.render({
      revision: 1,
      files: folderFiles(folder),
      file: "flow-unclosed.meltemi",
      format: "png",
    });
    expect(outcome).toMatchObject({ ok: false, code: "diagram.invalid" });
    expect(!outcome.ok && outcome.diagnostics?.some((d) => d.severity === "error")).toBe(true);
    expect(!outcome.ok && outcome.diagnostics?.[0]).toMatchObject({
      path: "flow-unclosed.meltemi",
      line: expect.any(Number),
    });
    expect(renderer.stats().renders).toBe(0);
  });

  it("refuses an unknown file, diagram or story, naming what there is", async () => {
    for (const file of ["missing.meltemi", "toString", "__proto__"]) {
      const unknownFile = await renderer.render(request({ file }));
      expect(unknownFile, file).toMatchObject({ ok: false, code: "request.invalid" });
    }
    const unknownDiagram = await renderer.render(
      request({ file: "cycles.meltemi", diagram: "nope" }),
    );
    expect(unknownDiagram).toMatchObject({ ok: false, code: "request.invalid" });
    expect(!unknownDiagram.ok && unknownDiagram.message).toContain("cycles");
    const unknownStory = await renderer.render(request({ file: "cycles.meltemi", story: "nope" }));
    expect(unknownStory).toMatchObject({ ok: false, code: "request.invalid" });
    const both = await renderer.render(
      request({ file: "cycles.meltemi", diagram: "cycles", story: "x" }),
    );
    expect(both).toMatchObject({ ok: false, code: "request.invalid" });
    for (const bad of [null, {}, { ...request({ file: "cycles.meltemi" }), revision: -1 }]) {
      expect(await renderer.render(bad)).toMatchObject({ ok: false, code: "request.invalid" });
    }
  });
});

/** `SqlRoomDb` over a `node:sqlite` database, as the room's storage tests have it. */
function dbOf(raw: import("node:sqlite").DatabaseSync): SqlRoomDb {
  return {
    exec(query, ...bindings) {
      const bound = bindings.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ) as (string | number | Uint8Array | null)[];
      const statement = raw.prepare(query);
      if (/^\s*select/i.test(query)) {
        const rows = statement.all(...bound).map((row) => ({ ...row }));
        return { toArray: () => rows };
      }
      statement.run(...bound);
      return { toArray: () => [] };
    },
    transactionSync(run) {
      raw.exec("BEGIN");
      try {
        const result = run();
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const CACHES: [string, () => PreviewCache][] = [["in memory", () => memoryPreviewCache()]];
if (sqlite) {
  CACHES.push([
    "in the object's SQLite",
    () => sqlPreviewCache(dbOf(new sqlite.DatabaseSync(":memory:"))),
  ]);
}

describe.each(CACHES)("the cache %s", (_where, cache) => {
  it("answers a repeated request byte-equal, without drawing", async () => {
    const renderer = nodeRenderer(cache());
    for (const format of ["svg", "png"] as const) {
      const first = drawn(await renderer.render(request({ file: "nested.meltemi", format })));
      const renders = renderer.stats().renders;
      const second = drawn(await renderer.render(request({ file: "nested.meltemi", format })));
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
      expect(second.report).toEqual(first.report);
      expect(renderer.stats().renders).toBe(renders);
    }
  }, 60_000);

  it("draws again at another revision, width or diagram", async () => {
    const renderer = nodeRenderer(cache());
    await renderer.render(request({ file: "nested.meltemi" }));
    await renderer.render(request({ file: "nested.meltemi", revision: 8 }));
    await renderer.render(request({ file: "nested.meltemi", format: "png", width: 320 }));
    await renderer.render(request({ file: "nested.meltemi", format: "png", width: 321 }));
    expect(renderer.stats()).toEqual({ renders: 4, cached: 4 });
  }, 60_000);

  it(`keeps the last ${CACHE_ENTRIES} answers, the least recently used dropped first`, async () => {
    const renderer = nodeRenderer(cache());
    const at = (revision: number) => request({ file: "cycles.meltemi", revision });
    for (let revision = 0; revision < CACHE_ENTRIES; revision++)
      await renderer.render(at(revision));
    // The first is used again, so the second is the oldest when one more comes.
    expect(drawn(await renderer.render(at(0))).cached).toBe(true);
    await renderer.render(at(CACHE_ENTRIES));
    expect(renderer.stats()).toEqual({ renders: CACHE_ENTRIES + 1, cached: CACHE_ENTRIES });
    expect(drawn(await renderer.render(at(0))).cached).toBe(true);
    expect(drawn(await renderer.render(at(1))).cached).toBe(false);
  }, 60_000);
});

/** The text of a Windows (UTF-16) record of a TrueType file's `name` table, or undefined. */
function nameRecord(ttf: Uint8Array, nameId: number): string | undefined {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    const entry = 12 + i * 16;
    if (String.fromCharCode(...ttf.subarray(entry, entry + 4)) !== "name") continue;
    const table = view.getUint32(entry + 8);
    const storage = table + view.getUint16(table + 4);
    for (let r = 0; r < view.getUint16(table + 2); r++) {
      const at = table + 6 + r * 12;
      if (view.getUint16(at) !== 3 || view.getUint16(at + 6) !== nameId) continue;
      const start = storage + view.getUint16(at + 10);
      let text = "";
      for (let c = 0; c < view.getUint16(at + 8); c += 2)
        text += String.fromCharCode(view.getUint16(start + c));
      return text;
    }
  }
  return undefined;
}

describe("the bundle", () => {
  it("is the file the generator writes from renderer-files.ts", async () => {
    expect(readFileSync(BUNDLE_FILE, "utf8")).toBe(await rendererBundleSource());
  });

  it("makes each raster face a TrueType font named by the family the SVG writes", async () => {
    const { FontLibrary } = await import("@meltemi/diagrams-fonts");
    for (const face of RASTER_FACES) {
      const woff = new Uint8Array(readFileSync(join(CLOUD, "node_modules", face.path)));
      const ttf = await sfntFromWoff(woff, face.family);
      expect(isSfnt(ttf), face.path).toBe(true);
      expect(ttf.length).toBeGreaterThan(woff.length);
      // The tables read back: the face's own family and weight, and the typographic family the
      // rasteriser matches, whatever the face's family says (`Inter SemiBold`).
      const added = new FontLibrary(() => undefined).addFont(ttf, basename(face.path));
      expect(added.ok && added.font.family, face.path).toMatch(new RegExp(`^${face.family}`));
      expect(added.ok && added.font.weight, face.path).toBe(face.weight);
      expect(nameRecord(ttf, 16), face.path).toBe(face.family);
      expect(nameRecord(await sfntFromWoff(woff), 16), face.path).toBeUndefined();
    }
  });

  it("draws text at weight 600 with Inter's SemiBold face, which its own name would hide", async () => {
    await nodeRasterFonts();
    const woff = (weight: number) =>
      new Uint8Array(
        readFileSync(
          join(CLOUD, "node_modules", RASTER_FACES.find((f) => f.weight === weight)!.path),
        ),
      );
    const regular = await sfntFromWoff(woff(400), "Inter");
    const named = await sfntFromWoff(woff(600), "Inter");
    const unnamed = await sfntFromWoff(woff(600));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><rect width="200" height="40" fill="#fff"/>' +
      '<text x="10" y="28" font-family="&quot;Inter&quot;" font-size="20" font-weight="600">Semibold</text></svg>';
    const draw = (fonts: Uint8Array[]) =>
      Buffer.from(rasterise(svg, 200, { width: 200, height: 40 }, fonts).png);
    expect(draw([regular, unnamed]).equals(draw([regular]))).toBe(true);
    expect(draw([regular, named]).equals(draw([regular]))).toBe(false);
  });

  it("refuses bytes that are not a WOFF file", async () => {
    await expect(sfntFromWoff(new Uint8Array(64))).rejects.toThrow(/WOFF/);
    expect(dirname(BUNDLE_FILE)).toBe(join(CLOUD, "src"));
  });
});
