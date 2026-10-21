// The conformance suite of the .meltemi language: the corpus files whose meaning is fixed, run
// through this implementation or through another one's commands.
// Usage: pnpm conformance [--command "<cmd {file}>"] [--diagnostics "<cmd {file}>"]
//   --command      prints the model JSON of a file, as `meltemi-diagrams convert --to json --stdout`
//   --diagnostics  prints the diagnostics of a file or project folder, as `validate --json`
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { run as cli } from "@meltemi/diagrams-cli";
import { REPO_ROOT } from "./corpus.js";

export const CORPUS = join(REPO_ROOT, "corpus");

export type CaseKind = "model" | "file diagnostics" | "valid project" | "invalid project";

export interface CaseResult {
  readonly kind: CaseKind;
  /** The case's path from the corpus folder, such as `valid/checkout.meltemi`. */
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ConformanceOptions {
  /** A command template with `{file}` that prints a file's model JSON. */
  readonly command?: string;
  /** A command template with `{file}` that prints diagnostics as `validate --json` does. */
  readonly diagnostics?: string;
}

/** The diagnostics output of `validate --json`, as far as the suite reads it. */
interface ValidateJson {
  readonly files: readonly {
    readonly path: string;
    readonly diagnostics: readonly { readonly code: string; readonly severity: string }[];
  }[];
}

/** Runs this implementation's CLI in-process and returns what it printed on standard output. */
function inProcess(args: readonly string[]): string {
  let out = "";
  let err = "";
  const code = cli([...args], {
    stdout: (t) => (out += t),
    stderr: (t) => (err += t),
    cwd: REPO_ROOT,
  });
  if (typeof code !== "number") throw new Error("The CLI answered asynchronously.");
  if (out === "" && code !== 0) throw new Error(err.trim() || `exited ${code}`);
  return out;
}

/** Runs another implementation's command for a path and returns its standard output. */
function external(template: string, path: string): string {
  const quoted = `"${path.replaceAll('"', '\\"')}"`;
  const command = template.replaceAll("{file}", quoted);
  const run = spawnSync(command, {
    cwd: REPO_ROOT,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // Messages in English, whatever the machine's language.
    env: { ...process.env, MELTEMI_LANG: "en" },
  });
  if (run.error) throw run.error;
  if (!run.stdout.trim()) throw new Error(`\`${command}\` printed nothing: ${run.stderr.trim()}`);
  return run.stdout;
}

/** The first path where two JSON values differ, such as `$.diagrams[0].relations[1].label`. */
export function firstDifference(expected: unknown, actual: unknown, path = "$"): string | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return path;
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      if (i >= expected.length || i >= actual.length) return `${path}[${i}]`;
      const found = firstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const a = expected as Record<string, unknown>;
    const b = actual as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(key in a) || !(key in b)) return `${path}.${key}`;
      const found = firstDifference(a[key], b[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return path;
}

const filesBelow = (folder: string, extension: string): string[] =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(extension))
    .map((e) => join(e.parentPath, e.name))
    .sort();

const folders = (folder: string) =>
  readdirSync(folder)
    .filter((name) => statSync(join(folder, name)).isDirectory())
    .sort()
    .map((name) => join(folder, name));

const caseName = (path: string) => relative(CORPUS, path).replaceAll("\\", "/");

/** Diagnostics by path relative to `root`, from the `validate --json` output. */
function diagnosticsBy(output: string, root: string): Map<string, string[]> {
  const parsed = JSON.parse(output) as ValidateJson;
  const by = new Map<string, string[]>();
  for (const file of parsed.files) {
    const absolute = isAbsolute(file.path) ? file.path : join(REPO_ROOT, file.path);
    const key = relative(root, absolute).replaceAll("\\", "/") || file.path;
    by.set(
      key,
      file.diagnostics.map((d) => d.code),
    );
  }
  return by;
}

/** Each code once, sorted. */
const unique = (codes: readonly string[]) => [...new Set(codes)].sort();

/**
 * The codes of the language. Layout findings belong to the drawing, and asset findings to a host
 * that reads the project's files; the layout tests and the project cases check those.
 */
const languageCodes = (codes: readonly string[]) =>
  codes.filter((c) => !c.startsWith("layout.") && !c.startsWith("asset."));

/** The codes of a project: the language's and its assets', without the drawing's. */
const projectCodes = (codes: readonly string[]) => codes.filter((c) => !c.startsWith("layout."));

export function runConformance(options: ConformanceOptions = {}): CaseResult[] {
  const results: CaseResult[] = [];
  const modelOf = (path: string) =>
    options.command
      ? external(options.command, path)
      : inProcess(["convert", path, "--to", "json", "--stdout"]);
  const diagnosticsOf = (path: string) =>
    options.diagnostics
      ? external(options.diagnostics, path)
      : inProcess(["validate", path, "--json"]);
  const check = (kind: CaseKind, path: string, test: () => string | null, passed: string) => {
    try {
      const problem = test();
      results.push({
        kind,
        name: caseName(path),
        passed: problem === null,
        detail: problem ?? passed,
      });
    } catch (error) {
      results.push({
        kind,
        name: caseName(path),
        passed: false,
        detail: (error as Error).message.split("\n")[0]!,
      });
    }
  };

  // Valid files: the model JSON, compared as JSON.
  for (const file of filesBelow(join(CORPUS, "valid"), ".meltemi")) {
    check(
      "model",
      file,
      () => {
        const expected: unknown = JSON.parse(
          readFileSync(file.replace(/\.meltemi$/, ".model.json"), "utf8"),
        );
        const actual: unknown = JSON.parse(modelOf(file));
        const differs = firstDifference(expected, actual);
        return differs ? `differs at ${differs}` : null;
      },
      "same model JSON",
    );
  }
  // Invalid files: the language codes of `<name>.diagnostics.json`, among them the file's name
  // unless the name is a code of another layer (a layout or an export finding).
  for (const file of filesBelow(join(CORPUS, "invalid"), ".meltemi")) {
    const expected = unique(
      languageCodes(
        (
          JSON.parse(readFileSync(file.replace(/\.meltemi$/, ".diagnostics.json"), "utf8")) as {
            code: string;
          }[]
        ).map((d) => d.code),
      ),
    );
    check(
      "file diagnostics",
      file,
      () => {
        const codes = unique(
          languageCodes(
            [...diagnosticsBy(diagnosticsOf(file), join(CORPUS, "invalid")).values()].flat(),
          ),
        );
        return codes.join() === expected.join()
          ? null
          : `expected ${expected.join(", ") || "no language diagnostic"}, got ${codes.join(", ") || "none"}`;
      },
      `reports ${expected.join(", ") || "no language diagnostic"}`,
    );
  }
  // Valid projects: no error.
  for (const folder of folders(join(CORPUS, "projects", "valid"))) {
    check(
      "valid project",
      folder,
      () => {
        const parsed = JSON.parse(diagnosticsOf(folder)) as ValidateJson;
        const errors = parsed.files.flatMap((f) =>
          f.diagnostics.filter((d) => d.severity === "error").map((d) => `${f.path}: ${d.code}`),
        );
        return errors.length > 0 ? `errors: ${errors.join("; ")}` : null;
      },
      "no error",
    );
  }
  // Invalid projects: the codes of `expected.json`, file by file.
  for (const folder of folders(join(CORPUS, "projects", "invalid"))) {
    check(
      "invalid project",
      folder,
      () => {
        const expected = JSON.parse(readFileSync(join(folder, "expected.json"), "utf8")) as Record<
          string,
          { code: string }[]
        >;
        const actual = diagnosticsBy(diagnosticsOf(folder), folder);
        const problems: string[] = [];
        for (const path of new Set([...Object.keys(expected), ...actual.keys()])) {
          const want = projectCodes((expected[path] ?? []).map((d) => d.code)).sort();
          const got = projectCodes(actual.get(path) ?? []).sort();
          if (want.join() !== got.join())
            problems.push(
              `${path}: expected ${want.join(", ") || "nothing"}, got ${got.join(", ") || "nothing"}`,
            );
        }
        return problems.length > 0 ? problems.join("; ") : null;
      },
      "the expected codes",
    );
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const option = (name: string) => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1] : undefined;
  };
  const results = runConformance({
    command: option("--command"),
    diagnostics: option("--diagnostics"),
  });
  const failed = results.filter((r) => !r.passed);
  for (const r of failed) console.log(`  ✗ ${r.kind} ${r.name}: ${r.detail}`);
  const kinds = [...new Set(results.map((r) => r.kind))];
  for (const kind of kinds) {
    const of = results.filter((r) => r.kind === kind);
    console.log(`${of.filter((r) => r.passed).length} of ${of.length} ${kind} cases pass`);
  }
  console.log(
    failed.length === 0 ? "\nThe implementation conforms." : `\n${failed.length} cases fail.`,
  );
  if (failed.length > 0) process.exitCode = 1;
}
