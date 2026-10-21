import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { redactSecrets, run } from "../src/index.js";

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr, lines: stdout.trimEnd().split("\n") };
}

const scratch = mkdtempSync(join(tmpdir(), "mdg-cli-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("meltemi-diagrams validate", () => {
  it("accepts the valid corpus", () => {
    const { code, lines, stderr } = mdg("validate", "corpus/valid");
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(lines.at(-1)).toMatch(/^Checked \d+ files: 0 errors, 0 warnings\.$/);
  });

  it("prints one line per diagnostic and exits with 1 on errors", () => {
    const { code, lines } = mdg("validate", "corpus/invalid/ref.unknown-element.meltemi");
    expect(code).toBe(1);
    expect(lines[0]).toBe(
      "corpus/invalid/ref.unknown-element.meltemi:6:11: error ref.unknown-element Unknown element `gateway`.",
    );
    expect(lines[1]).toBe('    hint: Declare it first, for example `gateway["Label"]`.');
    expect(lines.at(-1)).toBe("Checked 1 file: 1 error, 0 warnings.");
  });

  it("finds .meltemi files recursively and reports every invalid file", () => {
    const { code, stdout } = mdg("validate", "corpus/invalid");
    expect(code).toBe(1);
    expect(stdout).toContain(
      "corpus/invalid/syntax.unexpected-character.meltemi:4:5: error syntax.unexpected-character",
    );
    expect(stdout).toMatch(/Checked 68 files: \d+ errors, 16 warnings\./);
    // The composition of the diagrams is checked too, as the editor shows it.
    expect(stdout).toContain(
      "corpus/invalid/layout.connector-crossing.meltemi:10:3: warning layout.connector-crossing",
    );
  });

  it("exits with 2 and names a missing path", () => {
    const { code, stderr } = mdg("validate", "does-not-exist.meltemi");
    expect(code).toBe(2);
    expect(stderr).toContain("does-not-exist.meltemi");
  });

  it.each([
    [["validate"], 2],
    [["validate", "--nope", "corpus/valid"], 2],
    [["frobnicate"], 2],
    [[], 2],
    [["--help"], 0],
    [["--version"], 0],
  ])("exits %j with %i", (args, expected) => {
    expect(mdg(...(args as string[])).code).toBe(expected);
  });

  it("prints a single JSON object with --json", () => {
    const { code, stdout } = mdg("validate", "--json", "corpus/valid");
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as {
      files: { path: string; diagnostics: unknown[] }[];
      summary: { files: number; errors: number; warnings: number; infos: number };
    };
    expect(parsed.files.length).toBe(parsed.summary.files);
    expect(parsed.files.map((f) => f.path)).toContain("corpus/valid/checkout.meltemi");
    expect(parsed.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  it("uses the diagnostics JSON shape in --json output", () => {
    const { stdout } = mdg("validate", "--json", "corpus/invalid/ref.unknown-element.meltemi");
    const parsed = JSON.parse(stdout) as { files: { diagnostics: Record<string, unknown>[] }[] };
    expect(Object.keys(parsed.files[0]!.diagnostics[0]!)).toEqual([
      "code",
      "severity",
      "message",
      "range",
      "hints",
      "related",
    ]);
  });

  it("counts warnings as errors only with --strict", () => {
    const file = "corpus/invalid/syntax.mixed-line-endings.meltemi";
    expect(mdg("validate", file).code).toBe(0);
    expect(mdg("validate", "--strict", file).code).toBe(1);
  });

  it("validates files outside the corpus by absolute path", () => {
    const path = join(scratch, "ok.meltemi");
    writeFileSync(path, "diagram d: flow { a -> b }\n");
    expect(mdg("validate", path).code).toBe(0);
  });
});

describe("meltemi-diagrams as a process", () => {
  it("runs from the sources with the @meltemi/diagrams-source condition", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=@meltemi/diagrams-source",
        "packages/cli/src/bin.ts",
        "validate",
        "corpus/valid",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Checked \d+ files: 0 errors, 0 warnings\./);
  });

  it("exits with 1 for the invalid corpus", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--conditions=@meltemi/diagrams-source",
        "packages/cli/src/bin.ts",
        "validate",
        "corpus/invalid",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
  });
});

describe("command names", () => {
  it("installs meltemi-diagrams and the mdg alias from the same entry point", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "packages/cli/package.json"), "utf8"));
    expect(manifest.bin).toEqual({ "meltemi-diagrams": "./dist/bin.js", mdg: "./dist/bin.js" });
  });

  it("names the full command and the alias in the help", () => {
    const { code, stdout } = mdg("--help");
    expect(code).toBe(0);
    expect(stdout.startsWith("Usage: meltemi-diagrams <command> [options]\nAlias: mdg\n")).toBe(
      true,
    );
  });

  it("rejects an unknown command naming the full command", () => {
    const { code, stderr } = mdg("frobnicate");
    expect(code).toBe(2);
    expect(stderr).toBe(
      'meltemi-diagrams: unknown command "frobnicate". Run "meltemi-diagrams --help".\n',
    );
  });

  it("exposes the CLI from sources as the mdg root script only", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    expect(manifest.scripts.mdg).toContain("packages/cli/src/bin.ts");
    expect(manifest.scripts.studio).toBeUndefined();
  });
});

describe("errors without secrets", () => {
  it("removes the values of secret-looking variables", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-0123456789",
      GITHUB_TOKEN: "ghp_abcdefghijk",
      PATH: "/usr/bin:/bin/x",
    };
    expect(
      redactSecrets("failed with sk-ant-0123456789 and ghp_abcdefghijk in /usr/bin:/bin/x", env),
    ).toBe("failed with [redacted] and [redacted] in /usr/bin:/bin/x");
  });
});
