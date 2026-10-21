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
    // The flow of `request` runs on the story's clock.
    expect(stdout).toContain('data-role="motion"');
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
    const drawn = storyFrame(doc.timeline, (key) => doc.views[key], 2400, { accent: doc.accent })!;
    expect(renderSvg(drawn, { fonts: "system" })).toBe(frame);
  });
});
