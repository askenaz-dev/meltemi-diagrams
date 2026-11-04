import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-review-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ARCHITECTURE = join(CORPUS_ROOT, "projects", "valid", "architecture");
const hasGit = spawnSync("git", ["--version"]).status === 0;

async function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  // `review` is asynchronous: `--base cloud` reads the cloud project before it compares.
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Review test", "-c", "user.email=review@example.invalid", ...args],
    { cwd, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
}

/** Edits a copy of the architecture project: a relabel, an id rename, a new view, a file rename. */
function edit(root: string): void {
  const containers = join(root, "diagrams", "containers.meltemi");
  writeFileSync(
    containers,
    readFileSync(containers, "utf8").replace(
      'label shop.api "API de pedidos"',
      'label shop.api "Pedidos API"',
    ),
  );
  const purchase = join(root, "diagrams", "purchase.meltemi");
  writeFileSync(
    purchase,
    readFileSync(purchase, "utf8")
      .replace(
        "participant bank { link commerce.bank }",
        "participant issuer { link commerce.bank }",
      )
      .replace("api -> bank:", "api -> issuer:")
      .replace("bank --> api:", "issuer --> api:"),
  );
  writeFileSync(
    join(root, "diagrams", "overview.meltemi"),
    'language "0.2"\n\ndiagram overview: flow {\n  web["Web"]\n  api["API"]\n  web -> api\n}\n',
  );
  renameSync(join(root, "stories", "tour.meltemi"), join(root, "stories", "walkthrough.meltemi"));
}

describe.skipIf(!hasGit)("review against Git", () => {
  const repo = join(scratch, "repo");
  const project = join(repo, "architecture");
  cpSync(ARCHITECTURE, project, { recursive: true });
  for (const svg of ["containers", "context", "purchase"]) {
    rmSync(join(project, "diagrams", `${svg}.svg`), { force: true });
  }
  git(scratch, "init", "-q", repo);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "Architecture");

  it("finds nothing in a clean working tree", async () => {
    const { code, stdout } = await mdg(project, "review", "--exit-code");
    expect(stdout).toBe("No changes.\n");
    expect(code).toBe(0);
  });

  it("tells renames from removals and additions, by file and block", async () => {
    edit(project);
    const { code, stdout } = await mdg(repo, "review", "architecture", "--exit-code");
    expect(code).toBe(1);
    expect(stdout).toContain("~ diagrams/containers.meltemi\n");
    expect(stdout).toContain('label "API de pedidos" → "Pedidos API"');
    expect(stdout).toContain("~ diagrams/purchase.meltemi\n    diagram purchase\n");
    expect(stdout).toContain('> element bank → issuer "Banco"');
    expect(stdout).not.toContain("- element bank");
    expect(stdout).toContain("+ diagrams/overview.meltemi\n    + diagram overview: flow\n");
    expect(stdout).toContain("> stories/tour.meltemi → stories/walkthrough.meltemi\n");
    expect(stdout).toMatch(/^4 files changed: \d+ added, 0 removed, \d+ renamed, \d+ changed\.$/m);
  });

  it("prints JSON and writes a review page with marked pictures", async () => {
    const json = JSON.parse((await mdg(project, "review", "--json")).stdout);
    expect(
      json.files.map((f: { path: string; status: string }) => `${f.status} ${f.path}`),
    ).toEqual([
      "changed diagrams/containers.meltemi",
      "added diagrams/overview.meltemi",
      "changed diagrams/purchase.meltemi",
      "renamed stories/walkthrough.meltemi",
    ]);
    expect(json.summary.files).toBe(4);
    const { code, stdout } = await mdg(project, "review", "--out", "../review");
    expect(code).toBe(0);
    expect(stdout.split("\n")[0]).toMatch(/^Wrote \.\.[\\/]review[\\/]index\.html$/);
    const page = readFileSync(join(repo, "review", "index.html"), "utf8");
    expect(page).toContain('src="diagrams/purchase/purchase.before.svg"');
    expect(page).toContain('src="diagrams/overview/overview.after.svg"');
    expect(page).not.toContain(scratch);
    const after = readFileSync(
      join(repo, "review", "diagrams", "purchase", "purchase.after.svg"),
      "utf8",
    );
    expect(after).toContain('stroke="#0969da"');
    expect(existsSync(join(repo, "review", "diagrams", "overview", "overview.before.svg"))).toBe(
      false,
    );
  });

  it("compares with an older revision", async () => {
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "Edits");
    expect((await mdg(project, "review")).stdout).toBe("No changes.\n");
    expect((await mdg(project, "review", "--base", "HEAD~1")).stdout).toContain("4 files changed");
    expect((await mdg(project, "review", "--base", "nope")).stderr).toContain(
      '"nope" is not a commit, branch or tag',
    );
  });
});

describe("review of two paths", () => {
  it("compares two folders or two files without Git", async () => {
    const before = join(scratch, "before");
    const after = join(scratch, "after");
    cpSync(ARCHITECTURE, before, { recursive: true });
    cpSync(ARCHITECTURE, after, { recursive: true });
    edit(after);
    const folders = await mdg(scratch, "review", "after", "--before", "before");
    expect(folders.code).toBe(0);
    expect(folders.stdout).toContain("4 files changed");
    const files = await mdg(
      scratch,
      "review",
      join("after", "diagrams", "purchase.meltemi"),
      "--before",
      join("before", "diagrams", "purchase.meltemi"),
    );
    expect(files.stdout).toContain('> element bank → issuer "Banco"');
    expect(files.stdout).toContain("1 file changed");
  });

  it("refuses mixed versions and unknown paths", async () => {
    const loose = join(scratch, "loose");
    mkdirSync(loose, { recursive: true });
    expect(
      (await mdg(scratch, "review", "after", "--before", join("before", "project.json"))).code,
    ).toBe(2);
    expect((await mdg(scratch, "review", "missing")).code).toBe(2);
    expect(
      (await mdg(scratch, "review", "after", "--base", "HEAD", "--before", "before")).code,
    ).toBe(2);
    const outside = await mdg(loose, "review");
    if (spawnSync("git", ["rev-parse"], { cwd: loose }).status !== 0) {
      expect(outside.code).toBe(2);
      expect(outside.stderr).toContain("not in a Git repository");
      expect(outside.stderr).not.toContain(loose);
    }
    expect((await mdg(scratch, "review", "--help")).stdout).toContain("Usage: review [path]");
  });
});
