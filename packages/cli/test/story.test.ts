import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findBrowser } from "@meltemi/diagrams-capture";
import { storyFrame } from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-story-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
copyFileSync(
  join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"),
  join(scratch, "purchase.meltemi"),
);

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: scratch,
  });
  return { code, stdout, stderr };
}

describe("export --story", () => {
  it("writes the frame at a time as <stem>.<story>.svg", () => {
    const { code, stdout } = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--at",
      "500ms",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote purchase.purchase.svg\n");
    const svg = readFileSync(join(scratch, "purchase.purchase.svg"), "utf8");
    // `reveal ... over 800ms`: at 500 ms the boxes are at 5/8 opacity, written with two decimals.
    expect(svg).toContain('opacity="0.63"');
  });

  it("writes the end of the story without --at", () => {
    const { code, stdout } = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout.startsWith("<svg")).toBe(true);
    expect(stdout).not.toContain('opacity="0.63"');
    // The flow of `request` runs on the story's clock: a particle rides its line.
    expect(stdout).toMatch(/<g data-id="request" data-role="relation">[\s\S]*? a4 4 0 1 0 8 0 /);
  });

  it("writes into a directory given by --out", () => {
    const { code } = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--out",
      ".",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(existsSync(join(scratch, "purchase.purchase.svg"))).toBe(true);
  });

  it("refuses unknown stories, bad times and other selections", () => {
    const unknown = mdg("export", "purchase.meltemi", "--story", "tour");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('no story named "tour"');
    expect(unknown.stderr).toContain("available: purchase");
    expect(mdg("export", "purchase.meltemi", "--story", "purchase", "--at", "soon").code).toBe(2);
    for (const [extra, flag] of [
      [["--diagram", "checkout"], "--diagram"],
      [["--scenario", "happy"], "--scenario"],
      [["--motion", "animated"], "--motion animated"],
    ] as const) {
      const result = mdg("export", "purchase.meltemi", "--story", "purchase", ...extra);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`cannot be combined with ${flag}.`);
    }
  });

  it("draws views imported from other files of a project", () => {
    const tour = join(CORPUS_ROOT, "projects", "valid", "architecture", "stories", "tour.meltemi");
    const start = mdg(
      "export",
      tour,
      "--story",
      "tour",
      "--at",
      "0",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(start.code).toBe(0);
    expect(start.stdout).toContain('opacity="0"');
    const end = mdg("export", tour, "--story", "tour", "--stdout", "--fonts", "system");
    expect(end.code).toBe(0);
    // The last scene frames the camera on the API and its database.
    expect(end.stdout).toMatch(/<svg[^>]* viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
  });
});

describe("export --scenes", () => {
  it("writes each scene's final state as its own SVG, equal to the frame at its instant", () => {
    const { code, stdout } = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--scenes",
      "--out",
      "scenes",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).toBe(
      "Wrote scenes/purchase.purchase.overview.svg\nWrote scenes/purchase.purchase.processing.svg\n",
    );
    // The instants of the player's static view: just before the next scene, and the end.
    for (const [scene, at] of [
      ["overview", "1799.99ms"],
      ["processing", "7400ms"],
    ] as const) {
      const frame = mdg(
        "export",
        "purchase.meltemi",
        "--story",
        "purchase",
        "--at",
        at,
        "--stdout",
        "--fonts",
        "system",
      ).stdout;
      expect(readFileSync(join(scratch, "scenes", `purchase.purchase.${scene}.svg`), "utf8")).toBe(
        frame,
      );
    }
    // Beside the file without --out, into an existing directory with it.
    expect(mdg("export", "purchase.meltemi", "--story", "purchase", "--scenes").code).toBe(0);
    expect(existsSync(join(scratch, "purchase.purchase.overview.svg"))).toBe(true);
    expect(existsSync(join(scratch, "purchase.purchase.processing.svg"))).toBe(true);
  });

  it("refuses an instant, a file to write to, standard output, other formats and no story", () => {
    const cases: [string[], string][] = [
      [
        ["--story", "purchase", "--scenes", "--at", "1s"],
        "--scenes writes every scene's final state; it cannot take --at.",
      ],
      [
        ["--story", "purchase", "--scenes", "--out", "one.svg"],
        "--scenes writes several files; --out must be a directory.",
      ],
      [
        ["--story", "purchase", "--scenes", "--out", "purchase.meltemi"],
        "--out must be a directory.",
      ],
      [["--story", "purchase", "--scenes", "--stdout"], "--stdout prints one output."],
      [
        ["--story", "purchase", "--scenes", "--format", "html"],
        "--scenes writes SVG, PNG or PDF pictures; it cannot be combined with --format html.",
      ],
      [["--story", "purchase", "--scenes", "--format", "gif"], "--format gif."],
      [["--scenes"], "--scenes takes a story: give it with --story <id>."],
      [["--scenes", "--stories"], "cannot be combined with --scenes."],
      [["--profiles", "--scenes"], "--scenes does not go with --profile or --profiles."],
    ];
    for (const [extra, message] of cases) {
      const result = mdg("export", "purchase.meltemi", ...extra);
      expect(result.code, extra.join(" ")).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.stdout).toBe("");
    }
    expect(existsSync(join(scratch, "one.svg"))).toBe(false);
    const folder = mdg("export", ".", "--story", "purchase", "--scenes");
    expect(folder.code).toBe(2);
    const scenesOnly = mdg("export", ".", "--scenes");
    expect(scenesOnly.code).toBe(2);
  });

  it("writes nothing for a story whose view cannot be drawn, and exits with 1", () => {
    writeFileSync(
      join(scratch, "outage.meltemi"),
      'language "0.2"\n\ndiagram broken: flow {\n  direction sideways\n  a["A"]\n}\n\nstory outage for broken {\n  scene only {\n    reveal a over 500ms\n  }\n}\n',
    );
    const { code, stdout, stderr } = mdg(
      "export",
      "outage.meltemi",
      "--story",
      "outage",
      "--scenes",
    );
    expect(code).toBe(1);
    expect(stdout).toContain("error prop.invalid-value");
    expect(stdout).not.toContain("Wrote");
    expect(stderr).toContain("`outage` shows a diagram that cannot be drawn.");
    expect(existsSync(join(scratch, "outage.outage.only.svg"))).toBe(false);
  });
});

// Each test starts the browser: see capture.test.ts.
describe.skipIf(!findBrowser())("export --scenes with the installed browser", () => {
  it("writes a PNG per scene, and one PDF with a page per scene", () => {
    const png = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--scenes",
      "--format",
      "png",
      "--scale",
      "1",
      "--out",
      "stills",
    );
    expect(png.code, png.stderr).toBe(0);
    expect(png.stdout).toMatch(
      /^Wrote stills\/purchase\.purchase\.overview\.png \(.+\)\nWrote stills\/purchase\.purchase\.processing\.png \(.+\)\n$/,
    );
    const pdf = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--scenes",
      "--format",
      "pdf",
    );
    expect(pdf.code, pdf.stderr).toBe(0);
    expect(pdf.stdout).toMatch(/^Wrote purchase\.purchase\.pdf \(.+\)\n$/);
    const bytes = readFileSync(join(scratch, "purchase.purchase.pdf")).toString("latin1");
    expect(bytes.startsWith("%PDF-")).toBe(true);
    expect(bytes.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(2);
    // --out may name the PDF.
    const named = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--scenes",
      "--format",
      "pdf",
      "--out",
      "deck.pdf",
    );
    expect(named.code, named.stderr).toBe(0);
    expect(existsSync(join(scratch, "deck.pdf"))).toBe(true);
  }, 180_000);
});

describe("export --format html", () => {
  it("writes the player page of a story", () => {
    const { code, stdout } = mdg(
      "export",
      "purchase.meltemi",
      "--format",
      "html",
      "--story",
      "purchase",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).toBe("Wrote purchase.purchase.html\n");
    const page = readFileSync(join(scratch, "purchase.purchase.html"), "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>A purchase</title>");
    expect(page).toContain(
      '<meltemi-player><script type="application/json">{"format":"meltemi-player"',
    );
    // Offline: nothing is fetched.
    expect(page).not.toMatch(/(src|href)="https?:/);
  });

  it("embeds the fonts unless asked not to", () => {
    const embedded = mdg(
      "export",
      "purchase.meltemi",
      "--format",
      "html",
      "--story",
      "purchase",
      "--stdout",
    );
    expect(embedded.stdout).toMatch(/"fontFaces":\["@font-face\{/);
    const system = mdg(
      "export",
      "purchase.meltemi",
      "--format",
      "html",
      "--story",
      "purchase",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(system.stdout).toContain('"fontFaces":[]');
  });

  it("writes fragments and players of a diagram's effects", () => {
    const fragment = mdg(
      "export",
      "purchase.meltemi",
      "--format",
      "html",
      "--story",
      "purchase",
      "--embed",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(fragment.stdout.startsWith("<meltemi-player>")).toBe(true);
    expect(fragment.stdout).not.toContain("<html");
    const effects = mdg("export", "purchase.meltemi", "--format", "html", "--fonts", "system");
    expect(effects.code).toBe(0);
    expect(effects.stdout).toBe("Wrote purchase.html\n");
    expect(readFileSync(join(scratch, "purchase.html"), "utf8")).toContain('"kind":"effects"');
  });

  it("refuses options that do not apply to a player", () => {
    for (const [extra, flag] of [
      [["--at", "1s"], "--at"],
      [["--motion", "animated"], "--motion animated"],
      [["--fonts", "outlined"], "--fonts outlined"],
    ] as const) {
      const result = mdg("export", "purchase.meltemi", "--format", "html", ...extra);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(`cannot be combined with ${flag}.`);
    }
    const embed = mdg("export", "purchase.meltemi", "--embed");
    expect(embed.code).toBe(2);
    expect(embed.stderr).toContain("needs --format html");
    expect(mdg("export", "purchase.meltemi", "--format", "tiff").stderr).toContain(
      "use svg, png, pdf, html",
    );
  });
});

describe("export --format html of a diagram that opens other views", () => {
  const folder = join(scratch, "c4");
  mkdirSync(folder, { recursive: true });
  const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
  writeFileSync(join(folder, "commerce.meltemi"), commerce);
  const page = () => readFileSync(join(folder, "commerce.context.html"), "utf8");
  const documentOf = (html: string) =>
    JSON.parse(
      /<script type="application\/json">(.*?)<\/script>/s.exec(html)![1]!.replace(/\\u003c/g, "<"),
    ) as {
      key: string;
      views: Record<string, unknown>;
      details: Record<
        string,
        { elements: Record<string, { opens: unknown; type: string | null }>; parent: unknown }
      >;
    };

  it("bundles every view a drill-down reaches, the same bytes twice", () => {
    const first = mdg(
      "export",
      "c4/commerce.meltemi",
      "--diagram",
      "context",
      "--format",
      "html",
      "--fonts",
      "system",
    );
    expect(first.code).toBe(0);
    expect(first.stdout).toBe("Wrote c4/commerce.context.html (3 views)\n");
    const written = page();
    const doc = documentOf(written);
    expect(doc.key).toBe("context");
    expect(Object.keys(doc.views)).toEqual(["context", "containers", "components"]);
    expect(doc.details.context!.elements.shop!.opens).toEqual({
      view: "containers",
      element: null,
      transition: "morph",
    });
    expect(doc.details.containers!.elements["shop.api"]!.type).toBe("Container");
    expect(doc.details.containers!.elements["shop.db"]!.opens).toBeNull();
    mdg(
      "export",
      "c4/commerce.meltemi",
      "--diagram",
      "context",
      "--format",
      "html",
      "--fonts",
      "system",
    );
    expect(page()).toBe(written);
  });

  it("leaves out a child view with errors, and the target that leads to it", () => {
    writeFileSync(
      join(folder, "commerce.meltemi"),
      commerce.replace("  level component\n", "  level component\n  include nowhere\n"),
    );
    const result = mdg(
      "export",
      "c4/commerce.meltemi",
      "--diagram",
      "context",
      "--format",
      "html",
      "--fonts",
      "system",
    );
    expect(result.stdout).toMatch(/Wrote c4\/commerce\.context\.html \(2 views\)\n$/);
    expect(result.stdout.match(/ref\.unknown-entity/g)).toHaveLength(1);
    const doc = documentOf(page());
    expect(Object.keys(doc.views)).toEqual(["context", "containers"]);
    expect(doc.details.containers!.elements["shop.api"]!.opens).toBeNull();
    writeFileSync(join(folder, "commerce.meltemi"), commerce);
  });
});

describe("the player and the exporter", () => {
  it("draw the same frame from the page's document", () => {
    const page = mdg(
      "export",
      "purchase.meltemi",
      "--format",
      "html",
      "--story",
      "purchase",
      "--stdout",
      "--fonts",
      "system",
    ).stdout;
    const json = /<script type="application\/json">(.*?)<\/script>/s.exec(page)![1]!;
    const doc = JSON.parse(json);
    const frame = mdg(
      "export",
      "purchase.meltemi",
      "--story",
      "purchase",
      "--at",
      "2.4s",
      "--stdout",
      "--fonts",
      "system",
    ).stdout;
    const drawn = storyFrame(doc.stories[0].timeline, (key) => doc.views[key], 2400, {
      accent: doc.accent,
    })!;
    expect(renderSvg(drawn, { fonts: "system" })).toBe(frame);
  });
});
