import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findBrowser, pngInfo } from "@meltemi/diagrams-capture";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { BROKEN_STORY, FLOWS_SOURCE, PURCHASE_SOURCE } from "../../../test-support/flows.js";
import { run } from "../src/index.js";

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

const scratch = mkdtempSync(join(tmpdir(), "mdg-export-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const annotations = "corpus/valid/edge/annotations.meltemi";

describe("meltemi-diagrams export", () => {
  it("writes one SVG per diagram into a directory", () => {
    const { code, stdout } = mdg("export", annotations, "--out", scratch);
    expect(code).toBe(0);
    const target = join(scratch, "annotations.svg");
    expect(existsSync(target)).toBe(true);
    expect(stdout).toContain("Wrote ");
    expect(stdout).toContain("annotations.svg");
    expect(readFileSync(target, "utf8").startsWith("<svg")).toBe(true);
  });

  it("writes to a named file", () => {
    const target = join(scratch, "custom.svg");
    const { code } = mdg("export", annotations, "--out", target);
    expect(code).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  it("prints to stdout without writing", () => {
    const before = readdirSync(scratch).length;
    const { code, stdout } = mdg("export", annotations, "--stdout");
    expect(code).toBe(0);
    expect(stdout.startsWith("<svg")).toBe(true);
    expect(readdirSync(scratch).length).toBe(before);
  });

  it("arranges an assisted diagram with ELK", () => {
    const { code, stdout, stderr } = mdg("export", "corpus/valid/checkout.meltemi", "--stdout");
    expect(code).toBe(0);
    expect(stderr).not.toContain("error");
    expect(stdout.startsWith("<svg")).toBe(true);
    for (const id of ["client", "api", "orders", "db"]) expect(stdout).toContain(`data-id="${id}"`);
    // The placed boxes keep their places: `orders` stays 340 px right of `api`.
    const x = (id: string) =>
      Number(new RegExp(String.raw`data-id="${id}"[^>]*>\s*<rect x="([\d.]+)"`).exec(stdout)?.[1]);
    expect(x("orders") - x("api")).toBe(340);
  });

  it("rejects an unknown diagram", () => {
    const { code, stderr } = mdg("export", annotations, "--diagram", "nope");
    expect(code).toBe(2);
    expect(stderr).toContain("nope");
    expect(stderr).toContain("annotations");
  });

  it("reports a file without a compiled diagram", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/invalid/export.unknown-target.meltemi",
      "--out",
      scratch,
    );
    expect(code).toBe(1);
    expect(stdout).toContain("export.no-diagram");
  });

  it("exports a sequence diagram and one of its scenarios", () => {
    const all = mdg("export", "corpus/valid/sequence/payment.meltemi", "--out", scratch);
    expect(all.code).toBe(0);
    const full = readFileSync(join(scratch, "payment.svg"), "utf8");
    expect(full).toContain("Rechazo");
    const one = mdg(
      "export",
      "corpus/valid/sequence/payment.meltemi",
      "--scenario",
      "approved",
      "--out",
      scratch,
    );
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("payment.approved.svg");
    const approved = readFileSync(join(scratch, "payment.approved.svg"), "utf8");
    expect(approved).toContain("Pago aprobado");
    expect(approved).not.toContain("Rechazo");
  });

  it("refuses an unknown scenario with the available ones", () => {
    const { code, stderr } = mdg(
      "export",
      "corpus/valid/sequence/payment.meltemi",
      "--scenario",
      "lost",
      "--stdout",
    );
    expect(code).toBe(2);
    expect(stderr).toContain('no scenario named "lost"');
    expect(stderr).toContain("available: approved, rejected");
  });

  it("reports export.no-diagram for the corpus example", () => {
    const { code, stdout, stderr } = mdg(
      "export",
      "corpus/invalid/export.no-diagram.meltemi",
      "--stdout",
    );
    expect(code).toBe(1);
    // With --stdout, diagnostics go to stderr.
    expect(stdout).toBe("");
    expect(stderr).toContain("error export.no-diagram");
  });

  it("rejects unsupported formats and missing arguments", () => {
    const tiff = mdg("export", annotations, "--format", "tiff");
    expect(tiff.code).toBe(2);
    expect(tiff.stderr).toContain("use svg, png, pdf, html");
    expect(mdg("export").code).toBe(2);
    expect(mdg("export", "a.meltemi", "b.meltemi").code).toBe(2);
    expect(mdg("export", "missing.meltemi").code).toBe(2);
  });

  it("prints warnings and still exports", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/invalid/layout.unknown-theme.meltemi",
      "--out",
      scratch,
    );
    expect(code).toBe(0);
    expect(stdout).toContain("warning layout.unknown-theme");
    expect(existsSync(join(scratch, "layout.unknown-theme.svg"))).toBe(true);
  });
});

describe("meltemi-diagrams export --stories", () => {
  const folder = join(scratch, "flows");
  mkdirSync(join(folder, "project"), { recursive: true });
  writeFileSync(join(folder, "flows.meltemi"), FLOWS_SOURCE);
  writeFileSync(join(folder, "outages.meltemi"), `${FLOWS_SOURCE}${BROKEN_STORY}`);
  writeFileSync(join(folder, "project", "flows.meltemi"), FLOWS_SOURCE);
  const here = (...args: string[]) => {
    let stdout = "";
    let stderr = "";
    const code = run(args, {
      stdout: (t) => (stdout += t),
      stderr: (t) => (stderr += t),
      cwd: folder,
    });
    return { code, stdout, stderr };
  };
  /** The player document of a page or fragment. */
  const documentOf = (html: string) =>
    JSON.parse(
      /<script type="application\/json">(.*?)<\/script>/s.exec(html)![1]!.replace(/\\u003c/g, "<"),
    ) as {
      version: number;
      id: string;
      stories: { id: string }[];
      views: Record<string, unknown>;
    };

  it("writes every story of the file into one player, in source order, over one view", () => {
    const { code, stdout, stderr } = here(
      "export",
      "flows.meltemi",
      "--format",
      "html",
      "--stories",
      "--fonts",
      "system",
    );
    expect([code, stderr]).toEqual([0, ""]);
    expect(stdout).toBe("Wrote flows.stories.html (2 stories)\n");
    const page = readFileSync(join(folder, "flows.stories.html"), "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>A purchase</title>");
    const doc = documentOf(page);
    expect(doc.version).toBe(3);
    expect(doc.stories.map((s) => s.id)).toEqual(["purchase", "refund"]);
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    // The same bytes twice; HTML is the format of --stories when none is given.
    expect(here("export", "flows.meltemi", "--stories", "--fonts", "system").code).toBe(0);
    expect(readFileSync(join(folder, "flows.stories.html"), "utf8")).toBe(page);
  });

  it("writes the stories listed, in the order listed, as a fragment", () => {
    const { code, stdout } = here(
      "export",
      "flows.meltemi",
      "--format",
      "html",
      "--stories",
      "refund,purchase",
      "--embed",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout.startsWith("<meltemi-player>")).toBe(true);
    expect(documentOf(stdout).stories.map((s) => s.id)).toEqual(["refund", "purchase"]);
    expect(documentOf(stdout).id).toBe("refund");
    // A list with the file after it, and `--stories=`.
    const after = here("export", "--stories", "refund", "flows.meltemi", "--stdout");
    expect(documentOf(after.stdout).stories.map((s) => s.id)).toEqual(["refund"]);
    const equals = here("export", "flows.meltemi", "--stories=purchase", "--stdout");
    expect(documentOf(equals.stdout).stories.map((s) => s.id)).toEqual(["purchase"]);
  });

  it("leaves out a story that cannot be drawn and names it, its diagnostic printed once", () => {
    const { code, stdout, stderr } = here(
      "export",
      "outages.meltemi",
      "--stories",
      "--fonts",
      "system",
    );
    expect(code).toBe(1);
    expect(stdout).toMatch(/Wrote outages\.stories\.html \(2 stories\)\n$/);
    expect(stdout.match(/prop\.invalid-value/g)).toHaveLength(1);
    expect(stderr).toBe(
      "outages.stories.html: The story `outage` was left out: it shows a diagram that cannot be drawn.\n",
    );
    const doc = documentOf(readFileSync(join(folder, "outages.stories.html"), "utf8"));
    expect(doc.stories.map((s) => s.id)).toEqual(["purchase", "refund"]);
  });

  it("refuses another format, a story, an instant, a folder and ids that are no story", () => {
    const cases: [string[], string][] = [
      [
        ["flows.meltemi", "--format", "svg", "--stories"],
        "--stories writes an HTML player; it cannot be combined with --format svg.",
      ],
      [["flows.meltemi", "--stories", "--story", "purchase"], "cannot be combined with --story."],
      [["flows.meltemi", "--stories", "--diagram", "checkout"], "combined with --diagram."],
      [["flows.meltemi", "--stories", "--at", "1s"], "cannot be combined with --at."],
      [["flows.meltemi", "--stories=a b"], "--stories takes story ids separated by commas"],
      [
        ["project", "--format", "html", "--stories"],
        "--stories works on one file; give a .meltemi file, not a folder.",
      ],
      [
        ["flows.meltemi", "--format", "html", "--stories", "purchase,tour"],
        'no story named "tour" in flows.meltemi; available: purchase, refund.',
      ],
      [["flows.meltemi", "--profiles", "--stories"], "--stories does not go with --profile"],
    ];
    for (const [args, message] of cases) {
      const result = here("export", ...args);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).toContain(message);
      expect(result.stdout).toBe("");
    }
    writeFileSync(
      join(folder, "none.meltemi"),
      'language "0.2"\n\ndiagram d: flow {\n  a -> b\n}\n',
    );
    const none = here("export", "none.meltemi", "--stories");
    expect([none.code, none.stderr]).toEqual([
      2,
      "meltemi-diagrams export: none.meltemi has no stories.\n",
    ]);
  });
});

// Each test starts the browser: see capture.test.ts.
describe.skipIf(!findBrowser())("meltemi-diagrams export --profile with scenes", () => {
  it("writes a PNG of every scene of a story, named after the profile", () => {
    const folder = join(scratch, "slides");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "purchase.meltemi"),
      `${PURCHASE_SOURCE}\nexport slides for purchase {\n  format png\n  scale 2\n  scenes true\n}\n`,
    );
    let stdout = "";
    let stderr = "";
    const code = run(["export", "purchase.meltemi", "--profile", "slides"], {
      stdout: (t) => (stdout += t),
      stderr: (t) => (stderr += t),
      cwd: folder,
    });
    expect(code, stderr).toBe(0);
    expect(stdout).toMatch(
      /^Wrote purchase\.slides\.overview\.png \(.+\)\nWrote purchase\.slides\.processing\.png \(.+\)\n$/,
    );
    const overview = pngInfo(readFileSync(join(folder, "purchase.slides.overview.png")));
    const processing = pngInfo(readFileSync(join(folder, "purchase.slides.processing.png")));
    expect(overview.width).toBe(processing.width);
    expect(overview.width % 2).toBe(0);
  }, 180_000);
});
