import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

async function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

const ASSETS = "corpus/projects/valid/assets";
const ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>\n';

let scratch: string | undefined;
function project(files: Record<string, string>): string {
  scratch = mkdtempSync(join(tmpdir(), "mdg-assets-"));
  const all = { "project.json": '{ "name": "a", "language": "0.2" }\n', ...files };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(scratch, name)), { recursive: true });
    writeFileSync(join(scratch, name), text);
  }
  return scratch;
}
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("meltemi-diagrams assets", () => {
  it("lists packs, aliases and fonts with their licences", async () => {
    const { code, stdout } = await mdg(REPO_ROOT, "assets", "list", ASSETS);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^Bundled fonts:\n/);
    expect(stdout).toMatch(/\nIcon packs:\n/);
    expect(stdout).toMatch(
      / {2}aws +2026\.10 +assets\/icons\/aws +LicenseRef-Corpus-Provider-Terms +2 icons +redistribute: no\n/,
    );
    expect(stdout).toMatch(/ {2}brand +1\.0\.0 +assets\/icons\/brand\.json +CC0-1\.0 +3 icons\n/);
    expect(stdout).toMatch(/ {2}tabler +3\.48\.0 +built-in +MIT +\d+ icons\n/);
    expect(stdout).toContain("Aliases:\n  cloud -> aws\n");
    expect(stdout).toMatch(
      /Project fonts:\n {2}Corpus Sans +400 +normal +assets\/fonts\/CorpusSans-Regular\.ttf +CC0-1\.0\n/,
    );
  });

  it("lists the bundled fonts with their groups, weights and licence, outside a project too", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mdg-assets-"));
    const { code, stdout } = await mdg(scratch, "assets", "list");
    expect(code).toBe(0);
    const table = stdout.slice(0, stdout.indexOf("Icon packs:")).trim().split("\n");
    expect(table[0]).toBe("Bundled fonts:");
    expect(table).toHaveLength(18);
    expect(table).toContainEqual(
      expect.stringMatching(/^ {2}Roboto +sans +400 500 600 700 +OFL-1\.1$/),
    );
    expect(table).toContainEqual(
      expect.stringMatching(/^ {2}Comic Neue +hand +400 700 +OFL-1\.1$/),
    );
  });

  it("searches icons by name and tags", async () => {
    const { code, stdout } = await mdg(
      REPO_ROOT,
      "assets",
      "icons",
      "cloud",
      "upload",
      "--limit",
      "3",
    );
    expect(code).toBe(0);
    const lines = stdout.trim().split("\n");
    expect(lines[0]).toBe("tabler:cloud-upload");
    expect(lines.length).toBeLessThanOrEqual(3);
    const brand = await mdg(REPO_ROOT, "assets", "icons", "logo", "--project", ASSETS);
    expect(brand.stdout.split("\n")[0]).toBe("brand:logo");
    const none = await mdg(REPO_ROOT, "assets", "icons", "zzzqqq");
    expect([none.code, none.stdout]).toEqual([1, ""]);
  });

  it("writes a stable lock and reports drift", async () => {
    const dir = project({
      "assets/icons/local/box.svg": ICON,
      "assets/licenses.json": '{ "icons": { "local": { "license": "CC0-1.0" } } }\n',
      "a.meltemi":
        'diagram d: flow {\n  layout manual\n  a["A"]\n  style a { icon "local:box" }\n  placement { place a at (1, 1) }\n}\n',
    });
    const first = await mdg(dir, "assets", "lock");
    expect(first).toMatchObject({ code: 0, stdout: "Wrote assets.lock.json\n" });
    const text = readFileSync(join(dir, "assets.lock.json"), "utf8");
    await mdg(dir, "assets", "lock");
    expect(readFileSync(join(dir, "assets.lock.json"), "utf8")).toBe(text);
    expect((await mdg(dir, "validate", ".")).stdout).toBe(
      "Checked 1 file: 0 errors, 0 warnings.\n",
    );

    writeFileSync(join(dir, "assets/icons/local/box.svg"), ICON.replace("M4 4", "M5 5"));
    const drift = await mdg(dir, "validate", ".");
    expect(drift.code).toBe(0);
    expect(drift.stdout).toContain(
      "assets.lock.json:1:1: warning asset.lock-mismatch The assets differ from assets.lock.json: icon pack `local` changed content.",
    );
    expect((await mdg(dir, "validate", ".", "--strict")).code).toBe(1);
  });

  it("refuses unknown subcommands", async () => {
    const { code, stderr } = await mdg(REPO_ROOT, "assets", "publish");
    expect(code).toBe(2);
    expect(stderr).toContain("use list, icons or lock");
  });
});

describe("assets in validate and export", () => {
  it("prints asset diagnostics and fails on errors", async () => {
    const { code, stdout } = await mdg(
      REPO_ROOT,
      "validate",
      "corpus/projects/invalid/asset.unsafe-svg",
    );
    expect(code).toBe(1);
    expect(stdout).toContain(
      "corpus/projects/invalid/asset.unsafe-svg/assets/icons/local/bad.svg:1:1: error asset.unsafe-svg",
    );
  });

  it("warns about an icon file a reference cannot name, in validate and in assets list", async () => {
    const project = "corpus/projects/invalid/asset.unusable-name";
    const validate = await mdg(REPO_ROOT, "validate", project);
    expect(validate.code).toBe(0);
    expect(validate.stdout).toContain(
      `${project}/assets/icons/brand/My Logo (1).svg:1:1: warning asset.unusable-name`,
    );
    const list = await mdg(REPO_ROOT, "assets", "list", project);
    expect(list.stdout + list.stderr).toContain("asset.unusable-name");
    expect(list.stdout + list.stderr).toContain("My-Logo-1.svg");
  });

  it("exports icons and project fonts", async () => {
    const file = `${ASSETS}/diagrams/overview.meltemi`;
    const system = await mdg(REPO_ROOT, "export", file, "--stdout", "--fonts", "system");
    expect(system.code).toBe(0);
    expect(system.stdout).toContain('<g data-id="cloud:lambda" data-role="icon"');
    expect(system.stdout).toContain('<g data-id="tabler:database" data-role="icon"');
    expect(system.stdout).toContain('<linearGradient id="icon-');
    const embedded = await mdg(REPO_ROOT, "export", file, "--stdout");
    expect(embedded.stdout).toMatch(
      /@font-face\{font-family:"Corpus Sans";font-weight:400;src:url\(data:font\/ttf;base64,/,
    );
  });
});
