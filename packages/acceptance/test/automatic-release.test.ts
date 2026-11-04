import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const scripts = (name: string) =>
  import(/* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts", name)).href);
const { planRelease, reserveRelease, canPromote, semver, sourceHasPackageMetadata } =
  await scripts("automatic-release.mjs");
const { stampPackageSource } = await scripts("package-source.mjs");
const { validateCiRun, requestedRun } = await scripts("ci-run.mjs");
const { registryVersion, publicationEnvironment } = await scripts("publish-npm.mjs");
const { setVersion } = await scripts("release-version.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}meltemi-delivery-`))
      throw new Error("Unsafe fixture cleanup.");
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(marker = true) {
  const root = mkdtempSync(join(tmpdir(), "meltemi-delivery-"));
  roots.push(root);
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  if (marker) write("scripts/automatic-release.mjs", "// fixture\n");
  write("packages/cli/package.json", '{"version":"1.10.0"}\n');
  let count = 0;
  const commit = (version?: string) => {
    if (version) write("packages/cli/package.json", `{"version":"${version}"}\n`);
    write("change.txt", String(++count));
    git("add", ".");
    git("commit", "-m", `change ${count}`);
    const sha = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", sha);
    return sha;
  };
  const first = commit();
  return { repo, root, git, write, commit, first };
}

describe("CI authorization", () => {
  const repository = "askenaz-dev/meltemi-diagrams";
  const workflow = { id: 12, path: ".github/workflows/ci.yml" };
  const valid = {
    id: 34,
    name: "CI",
    path: workflow.path,
    workflow_id: workflow.id,
    status: "completed",
    conclusion: "success",
    event: "push",
    head_branch: "main",
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    head_sha: "a".repeat(40),
  };
  it("accepts the exact successful main push workflow", () =>
    expect(validateCiRun(valid, workflow, repository)).toBe(valid.head_sha));
  it.each([
    { name: "Other" },
    { path: ".github/workflows/other.yml" },
    { workflow_id: 13 },
    { status: "in_progress" },
    { conclusion: "failure" },
    { event: "pull_request" },
    { head_branch: "feature" },
    { repository: { full_name: "other/repo" } },
    { head_repository: { full_name: "fork/repo" } },
    { head_sha: "main" },
  ])("rejects an unauthorized run: %j", (change) =>
    expect(() => validateCiRun({ ...valid, ...change }, workflow, repository)).toThrow(
      /requires successful CI/,
    ),
  );
  it("refuses dispatch from a feature branch and accepts only numeric CI ids", () => {
    expect(() => requestedRun("workflow_dispatch", "refs/heads/feature", {}, "34")).toThrow(/main/);
    expect(() => requestedRun("workflow_dispatch", "refs/heads/main", {}, "abc")).toThrow(
      /numeric/,
    );
    expect(requestedRun("workflow_dispatch", "refs/heads/main", {}, "34")).toBe("34");
    expect(
      requestedRun("workflow_run", "refs/heads/main", { workflow_run: { id: 34 } }, "99"),
    ).toBe("34");
    expect(() => requestedRun("push", "refs/heads/main", {}, "34")).toThrow(/workflow_run/);
  });
});

describe("source-ordered release versions", () => {
  it("assigns source distance rather than CI completion order and reuses tagged SHA", () => {
    const f = fixture();
    f.git("tag", "-a", "v1.10.0", "-m", "base");
    const older = f.commit();
    const newer = f.commit();
    expect(planRelease(f.repo, newer).version).toBe("1.10.2");
    f.git("tag", "v1.10.2", newer);
    const oldPlan = planRelease(f.repo, older);
    expect(oldPlan).toMatchObject({ version: "1.10.1", latest: false });
    f.git("tag", "v1.10.1", older);
    expect(planRelease(f.repo, older)).toMatchObject({
      version: "1.10.1",
      existing: true,
      latest: false,
    });
    expect(planRelease(f.repo, newer).previous).toBe("v1.10.1");
  });
  it("a later tag resets distance inside the same declaration era", () => {
    const f = fixture();
    f.commit();
    f.commit();
    f.git("tag", "v1.10.0");
    expect(planRelease(f.repo, f.commit()).version).toBe("1.10.1");
  });
  it("a higher declaration opens a new base, while a lower one cannot reset automated patches", () => {
    const f = fixture();
    f.git("tag", "v1.10.50");
    f.commit();
    expect(planRelease(f.repo, f.commit("1.10.1")).version).toBe("1.10.52");
    const minor = f.commit("1.11.0");
    expect(planRelease(f.repo, minor).version).toBe("1.11.0");
    expect(planRelease(f.repo, f.commit()).version).toBe("1.11.1");
  });
  it("refuses a collision and an off-main source", () => {
    const f = fixture();
    f.git("tag", "v1.10.0");
    const main = f.commit();
    f.git("checkout", "-b", "feature");
    const other = f.commit();
    f.git("update-ref", "refs/remotes/origin/main", main);
    f.git("tag", "v1.10.1", other);
    expect(() => planRelease(f.repo, main)).toThrow(/immutable/);
    expect(() => planRelease(f.repo, other)).toThrow(/first-parent/);
  });
  it("rejects pre-automation sources instead of repackaging legacy releases", () => {
    const f = fixture(false);
    f.git("tag", "v1.10.0");
    expect(() => planRelease(f.repo, f.first)).toThrow(/original release workflow/);
  });
  it("reserves a tag without changing its source or pushing main, and retries idempotently", () => {
    const f = fixture();
    f.git("tag", "v1.10.0");
    const sha = f.commit();
    const remote = join(f.root, "remote.git");
    f.git("init", "--bare", remote);
    f.git("remote", "add", "origin", remote);
    f.git("push", "origin", "main", "--tags");
    const plan = planRelease(f.repo, sha);
    reserveRelease(f.repo, plan);
    reserveRelease(f.repo, planRelease(f.repo, sha));
    expect(f.git("rev-parse", "v1.10.1")).toBe(sha);
    expect(f.git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0]).toBe(sha);
    expect(f.git("status", "--porcelain")).toBe("");
  });
  it("never promotes a historical version or an unsafe semver", () => {
    expect(canPromote("1.10.1", "1.10.2", true)).toBe(false);
    expect(canPromote("1.10.2", "1.10.1", false)).toBe(false);
    expect(canPromote("1.10.2", "1.10.1", true)).toBe(true);
    expect(() => semver("01.0.0")).toThrow();
    expect(() => semver("1.0.9007199254740992")).toThrow();
  });
});

describe("publication safeguards", () => {
  it("keeps npm provenance coordinates equal to the runner identity even during historical recovery", () => {
    const env = {
      GITHUB_SHA: "b".repeat(40),
      GITHUB_REF: "refs/heads/main",
      GITHUB_WORKFLOW_REF: "repo/release.yml@refs/heads/main",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-fixture",
    };
    const actual = publicationEnvironment(
      { sha: "a".repeat(40), version: "1.10.1", tag: "v1.10.1" },
      env,
    );
    expect(actual).toEqual(env);
  });
  it("records deterministic product source in publishable packages, independently of runner identity", () => {
    const f = fixture();
    const path = join(f.repo, "packages/cli/package.json");
    writeFileSync(path, '{"name":"@meltemi/diagrams-cli","version":"1.10.1"}\n');
    const source = {
      repository: "askenaz-dev/meltemi-diagrams",
      sha: "a".repeat(40),
      tag: "v1.10.1",
    };
    const plan = { ...source, version: "1.10.1", ciRun: "123" };
    stampPackageSource(f.repo, plan);
    const once = readFileSync(path, "utf8");
    expect(JSON.parse(once).meltemiRelease).toEqual(source);
    stampPackageSource(f.repo, { ...plan, ciRun: "456" });
    expect(readFileSync(path, "utf8")).toBe(once);
    expect(() => stampPackageSource(f.repo, { ...plan, sha: "bad" })).toThrow(/source/);
  });
  it("does not add new metadata while recovering a source predating the capability marker", () => {
    const f = fixture();
    const before = f.commit("original release");
    f.write("scripts/package-source.mjs", "// package metadata capability\n");
    const after = f.commit("source metadata");
    expect(sourceHasPackageMetadata(f.repo, before)).toBe(false);
    expect(sourceHasPackageMetadata(f.repo, after)).toBe(true);
  });
  it("only treats a registry E404 as absent, not a timeout or denied authentication", () => {
    expect(registryVersion("pkg@1.0.0", () => '"1.0.0"')).toBe("1.0.0");
    expect(
      registryVersion("pkg@1.0.0", () => {
        throw { stdout: '{"error":{"code":"E404"}}' };
      }),
    ).toBeUndefined();
    for (const code of ["E401", "ETIMEDOUT"]) {
      expect(() =>
        registryVersion("pkg@1.0.0", () => {
          throw { stdout: JSON.stringify({ error: { code } }) };
        }),
      ).toThrow(/stopped/);
    }
  });
  it("stamps the requested disposable checkout without changing its Git commit", () => {
    const f = fixture();
    f.write("packages/cli/src/cli.ts", 'export const CLI_VERSION = "1.10.0";\n');
    f.write("examples/purchase/project.json", '{"meltemi-diagrams":"^1.10.0"}\n');
    f.write(
      "corpus/projects/invalid/project.tool-version/expected.json",
      '"but this is version 1.10.0."\n',
    );
    f.write("skills/meltemi-diagrams/SKILL.md", "metadata:\n  version: 1.10.0\n");
    const sha = f.commit();
    setVersion("1.10.99", f.repo);
    expect(
      JSON.parse(readFileSync(join(f.repo, "packages/cli/package.json"), "utf8")).version,
    ).toBe("1.10.99");
    expect(readFileSync(join(f.repo, "packages/cli/src/cli.ts"), "utf8")).toContain('"1.10.99"');
    expect(f.git("rev-parse", "HEAD")).toBe(sha);
    expect(JSON.parse(f.git("show", `${sha}:packages/cli/package.json`)).version).toBe("1.10.0");
  });
});
