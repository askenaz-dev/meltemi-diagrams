import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { isSvgText } from "../../cloud/src/binary.js";
import { agentSetupPolicy } from "../policy.mjs";
import { SEA_BUDGET, isSeaInput, seaStills, seaWeight, type SeaMetafile } from "../sea.mjs";

/**
 * What the build writes for the family's sea (`playground-sea`): the agent setup pages' still
 * picture, one per scheme, placed in both pages; and the weight of the chunks that draw the sea,
 * none of which is in the bundle the editor starts with.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** Each page as the build writes it: where it is in dist, and its source. */
const PAGES = {
  "agent-setup/index.html": read("../agent-setup/en.html"),
  "es/agent-setup/index.html": read("../agent-setup/es.html"),
};

/** The pictures a page's `.setup-sea` shows, as paths in dist, with the media each is for. */
function seaPictures(page: string, html: string) {
  const picture = html.match(/<picture class="setup-sea">([\s\S]*?)<\/picture>/)?.[1];
  if (picture === undefined) return undefined;
  const resolve = (src: string) => posix.normalize(posix.join(posix.dirname(page), src));
  const sources = [...picture.matchAll(/<source srcset="([^"]+)" media="([^"]+)"/g)].map((m) => ({
    file: resolve(m[1]!),
    media: m[2]!,
  }));
  const img = picture.match(/<img src="([^"]+)" alt="([^"]*)"/);
  return { sources, img: img ? { file: resolve(img[1]!), alt: img[2]! } : undefined };
}

describe("the agent setup pages' sea", () => {
  const stills = seaStills();

  it.each(Object.keys(stills))(
    "%s is a well-formed SVG with no script, style or other file",
    (file) => {
      const svg = stills[file]!;
      expect(isSvgText(svg), `${file} is well-formed`).toBe(true);
      expect(svg).not.toMatch(/<script|<style|<foreignObject|\son\w+=/i);
      // Its only references are to its own parts (the mark defined once, used by every boat).
      const references = [...svg.matchAll(/\b(?:href|xlink:href)="([^"]*)"/g)].map((m) => m[1]!);
      expect(
        references.filter((r) => !r.startsWith("#")),
        file,
      ).toEqual([]);
      expect(Buffer.byteLength(svg), file).toBeLessThanOrEqual(30 * 1024);
    },
  );

  it.each(Object.entries(PAGES))(
    "%s shows the picture of its scheme from the site, with empty alternative text",
    (page, html) => {
      const shown = seaPictures(page, html);
      expect(shown, `${page} has its <picture class="setup-sea">`).toBeDefined();
      expect(shown!.img).toEqual({ file: "sea-diagrams.svg", alt: "" });
      expect(shown!.sources).toEqual([
        { file: "sea-diagrams-dark.svg", media: "(prefers-color-scheme: dark)" },
      ]);
      for (const file of [shown!.img!.file, ...shown!.sources.map((s) => s.file)]) {
        expect(Object.keys(stills), `${page} shows ${file}, which the build writes`).toContain(
          file,
        );
      }
      // Above the heading. The only script is the copy enhancement; the sea stays an image.
      expect(html.indexOf('class="setup-sea"')).toBeLessThan(html.indexOf("<h1>"));
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)];
      expect(scripts.map((m) => posix.normalize(posix.join(posix.dirname(page), m[1]!)))).toEqual([
        "agent-setup/copy-prompt.js",
      ]);
    },
  );

  it("keeps inline code and connections blocked while allowing the copy enhancement", () => {
    expect(agentSetupPolicy()).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'",
    );
  });

  it("is written by the build, at the root of the site", () => {
    const build = read("../build.mjs");
    expect(build).toMatch(
      /for \(const \[file, picture\] of Object\.entries\(seaStills\(\)\)\) writeFileSync\(join\(dist, file\), picture\);/,
    );
  });
});

describe("the sea's weight", () => {
  const root = mkdtempSync(join(tmpdir(), "sea-weight-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  /** Writes the outputs of a fixture build, `bytes` of incompressible text each. */
  function outputs(files: Record<string, number>): void {
    let seed = 7;
    const random = () => (seed = (seed * 48271) % 2147483647);
    for (const [file, bytes] of Object.entries(files)) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        Array.from({ length: bytes }, () => String.fromCharCode(33 + (random() % 90))).join(""),
      );
    }
  }

  const OCEAN =
    "../../node_modules/.pnpm/@meltemi+ocean@0.1.20/node_modules/@meltemi/ocean/dist/sea.js";
  /** A page like the real one: the editor's entry, its static chunk, the sea's entry and chunk. */
  function metafile(options: { seaInStart?: boolean } = {}): SeaMetafile {
    return {
      outputs: {
        "dist/playground.js": {
          entryPoint: "src/main.ts",
          inputs: { "src/main.ts": {}, "src/empty-sea.ts": {} },
          imports: [
            { path: "dist/chunks/chunk-A.js", kind: "import-statement" },
            {
              path: "dist/chunks/sea-B.js",
              kind: options.seaInStart ? "import-statement" : "dynamic-import",
            },
          ],
        },
        "dist/chunks/chunk-A.js": { inputs: { "../editor/src/index.ts": {} }, imports: [] },
        "dist/chunks/sea-B.js": {
          inputs: {},
          imports: [{ path: "dist/chunks/chunk-C.js", kind: "import-statement" }],
        },
        "dist/chunks/chunk-C.js": {
          inputs: { "src/sea.ts": {}, [OCEAN]: {} },
          imports: [],
        },
        "dist/boot-sea.js": {
          entryPoint: "src/boot-sea.ts",
          inputs: { "src/boot-sea.ts": {} },
          imports: [{ path: "dist/chunks/chunk-C.js", kind: "import-statement" }],
        },
        "dist/chunks/chunk-C.js.map": { inputs: {}, imports: [] },
      },
    };
  }

  it("knows the sea's inputs", () => {
    expect(isSeaInput(OCEAN)).toBe(true);
    expect(isSeaInput(OCEAN.replaceAll("/", "\\"))).toBe(true);
    expect(isSeaInput("src/sea.ts")).toBe(true);
    expect(isSeaInput("src/boot-sea.ts")).toBe(true);
    expect(isSeaInput("src/empty-sea.ts")).toBe(false);
    expect(isSeaInput("src/main.ts")).toBe(false);
  });

  it("weighs the chunks that carry the sea, out of the editor's bundle", () => {
    outputs({
      "dist/playground.js": 50_000,
      "dist/chunks/chunk-A.js": 50_000,
      "dist/chunks/sea-B.js": 300,
      "dist/chunks/chunk-C.js": 9000,
      "dist/boot-sea.js": 800,
    });
    const weight = seaWeight(metafile(), root);
    expect(weight.chunks.map((c) => c.file).sort()).toEqual([
      "dist/boot-sea.js",
      "dist/chunks/chunk-C.js",
    ]);
    expect(weight.gzip).toBeGreaterThan(0);
    expect(weight.gzip).toBeLessThanOrEqual(SEA_BUDGET);
  });

  it("fails over budget, naming the chunk", () => {
    outputs({ "dist/chunks/chunk-C.js": 40_000, "dist/boot-sea.js": 800 });
    expect(() => seaWeight(metafile(), root)).toThrow(
      /weigh [\d.]+ KB gzipped, over 25 KB: .*dist\/chunks\/chunk-C\.js \([\d.]+ KB\)/,
    );
  });

  it("fails when the editor's bundle carries the sea, naming the chunk", () => {
    outputs({ "dist/chunks/chunk-C.js": 9000, "dist/boot-sea.js": 800 });
    expect(() => seaWeight(metafile({ seaInStart: true }), root)).toThrow(
      /^dist\/chunks\/chunk-C\.js carries the sea \(src\/sea\.ts, .*@meltemi\/ocean\/dist\/sea\.js\) and is part of the bundle the editor starts with/,
    );
  });

  it("fails when no chunk carries the sea", () => {
    const empty = metafile();
    const outputs = Object.fromEntries(
      Object.entries(empty.outputs).map(([file, output]) => [file, { ...output, inputs: {} }]),
    );
    expect(() => seaWeight({ outputs }, root)).toThrow(/No chunk of the page carries the sea/);
  });
});
