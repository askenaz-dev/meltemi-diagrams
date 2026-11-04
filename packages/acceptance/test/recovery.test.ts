import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const {
  validateReleaseRun,
  selectRecoveryArtifact,
  validateCheckAttempt,
  verifyArchive,
  rejectMissingOriginal,
} = await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts/recover-release.mjs")).href
);
const { validateArtifact, preflightRelease, safeArtifactNames } = await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts/preflight-release.mjs")).href
);
const { NPM_PACKAGE_NAMES } = await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts/publish-npm.mjs")).href
);
const plan = {
  sha: "a".repeat(40),
  version: "1.10.18",
  tag: "v1.10.18",
  repository: "askenaz-dev/meltemi-diagrams",
  ciRun: "7",
  packageSourceMetadata: 1,
  existing: true,
  latest: false,
};
const workflow = { id: 2, path: ".github/workflows/release.yml" };
const run = {
  id: 8,
  name: "Release",
  path: workflow.path,
  workflow_id: 2,
  status: "completed",
  event: "workflow_run",
  head_branch: "main",
  head_sha: "b".repeat(40),
  repository: { id: 4, full_name: plan.repository },
  head_repository: { id: 4, full_name: plan.repository },
  run_attempt: 2,
};
const archive = Buffer.from("original ZIP bytes");
const artifact = {
  id: 12,
  name: `release-${plan.sha}-${plan.version}-${run.id}-1`,
  expired: false,
  digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
  workflow_run: {
    id: 8,
    repository_id: 4,
    head_repository_id: 4,
    head_branch: "main",
    head_sha: run.head_sha,
  },
};
const check = {
  name: "check",
  run_id: 8,
  head_sha: run.head_sha,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
};

describe("authorized original release artifacts", () => {
  it("permits a partial failed release but requires its exact successful check attempt", () => {
    expect(() =>
      validateReleaseRun({ ...run, conclusion: "failure" }, workflow, plan.repository, "8"),
    ).not.toThrow();
    const selected = selectRecoveryArtifact(
      [artifact, { ...artifact, id: 13, name: artifact.name.replace(/-1$/, "-2") }],
      run,
      plan,
    );
    expect(selected.id).toBe(12);
    expect(selected.attempt).toBe(1);
    expect(() => validateCheckAttempt([check], run, selected)).not.toThrow();
    expect(() => verifyArchive(archive, selected)).not.toThrow();
  });
  it.each([
    { event: "pull_request" },
    { head_branch: "feature" },
    { workflow_id: 9 },
    { path: ".github/workflows/ci.yml" },
    { status: "in_progress" },
    { id: 9 },
    { repository: { ...run.repository, full_name: "other/repo" } },
    { head_repository: { ...run.head_repository, full_name: "fork/repo" } },
  ])("rejects an unauthorized run: %j", (change) => {
    expect(() =>
      validateReleaseRun({ ...run, ...change }, workflow, plan.repository, "8"),
    ).toThrow();
  });
  it("rejects mismatched workflow identity, artifact source, repository, attempt and ambiguity", () => {
    expect(() =>
      validateReleaseRun(run, { ...workflow, path: "other" }, plan.repository, "8"),
    ).toThrow();
    expect(() => selectRecoveryArtifact([artifact], run, { ...plan, sha: "c".repeat(40) })).toThrow(
      /no artifact/,
    );
    expect(() =>
      selectRecoveryArtifact(
        [{ ...artifact, workflow_run: { ...artifact.workflow_run, repository_id: 99 } }],
        run,
        plan,
      ),
    ).toThrow(/identity/);
    expect(() =>
      selectRecoveryArtifact(
        [{ ...artifact, name: artifact.name.replace(/-1$/, "-3") }],
        run,
        plan,
      ),
    ).toThrow(/attempt/);
    expect(() => selectRecoveryArtifact([artifact, { ...artifact, id: 13 }], run, plan)).toThrow(
      /Ambiguous/,
    );
    expect(() =>
      validateCheckAttempt([{ ...check, run_attempt: 2 }], run, { ...artifact, attempt: 1 }),
    ).toThrow(/exact check/);
    expect(() =>
      validateCheckAttempt([{ ...check, conclusion: "failure" }], run, { ...artifact, attempt: 1 }),
    ).toThrow(/exact check/);
  });
  it("refuses an expired original even when a newer rebuilt artifact remains available", () => {
    expect(() =>
      selectRecoveryArtifact(
        [
          { ...artifact, expired: true },
          { ...artifact, id: 13, name: artifact.name.replace(/-1$/, "-2") },
        ],
        run,
        plan,
      ),
    ).toThrow(/expired/);
  });
  it("refuses a deleted original instead of accepting a later successful rebuild", () => {
    expect(() => rejectMissingOriginal([check])).toThrow(/original artifact is unavailable/);
    expect(() => rejectMissingOriginal([{ ...check, conclusion: "failure" }])).not.toThrow();
  });
  it("rejects a corrupt ZIP and unsafe or duplicate extraction paths", () => {
    expect(() => verifyArchive(Buffer.from("changed"), artifact)).toThrow(/SHA-256/);
    for (const names of [
      ["../file"],
      ["a/b"],
      ["a\\b"],
      ["/absolute"],
      ["file", "file"],
      ["file\n"],
    ])
      expect(() => safeArtifactNames(names)).toThrow(/flat/);
  });
});

const roots: string[] = [];
afterEach(() => {
  for (const directory of roots.splice(0)) {
    if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}meltemi-recovery-test-`))
      throw new Error("Unsafe fixture cleanup.");
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "meltemi-recovery-test-"));
  roots.push(directory);
  const json = (file: string, value: unknown) =>
    writeFileSync(join(directory, file), `${JSON.stringify(value, null, 2)}\n`);
  const source = { repository: plan.repository, sha: plan.sha, tag: plan.tag };
  const files = [];
  for (const name of NPM_PACKAGE_NAMES as string[]) {
    const file = `${name.replace("@", "").replace("/", "-")}-${plan.version}.tgz`;
    json(file, {
      name,
      version: plan.version,
      meltemiRelease: source,
    });
    const bytes = readFileSync(join(directory, file));
    files.push({
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const file = `meltemi-diagrams-${plan.version}.vsix`;
  const bytes = Buffer.from("original VSIX");
  writeFileSync(join(directory, file), bytes);
  files.push({
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  json("manifest.json", { version: plan.version, source, files });
  json("delivery-plan.json", { ...plan, latest: true });
  json("provenance.json", { ...source, version: plan.version, ciRun: plan.ciRun });
  writeFileSync(join(directory, "notes.md"), "Original notes\n");
  return { directory, json, files, unpack: (path: string) => readFileSync(path, "utf8") };
}

describe("publication preflight", () => {
  it("accepts original checked bytes despite changed latest eligibility", () => {
    const f = fixture();
    const checked = validateArtifact(f.directory, plan, f.unpack);
    expect(checked.plan.latest).toBe(true);
    expect(checked.assets.map((asset: { name: string }) => asset.name)).toEqual([
      "manifest.json",
      "provenance.json",
      `meltemi-diagrams-${plan.version}.vsix`,
    ]);
  });
  it.each(["sha", "ciRun", "repository", "version", "tag"])(
    "rejects changed %s metadata before remote access",
    (key) => {
      const f = fixture();
      f.json("delivery-plan.json", { ...plan, [key]: "wrong" });
      expect(() => validateArtifact(f.directory, plan, f.unpack)).toThrow(/authorized source\/CI/);
    },
  );
  it("rejects a corrupt file, capability mismatch and unexpected artifact files", () => {
    const f = fixture();
    writeFileSync(join(f.directory, f.files[0]!.file), "corrupt");
    expect(() => validateArtifact(f.directory, plan, f.unpack)).toThrow(/checked manifest/);
    const g = fixture();
    g.json("delivery-plan.json", { ...plan, packageSourceMetadata: undefined });
    expect(() => validateArtifact(g.directory, plan, g.unpack)).toThrow(/capability/);
    const h = fixture();
    writeFileSync(join(h.directory, "extra"), "unexpected");
    expect(() => validateArtifact(h.directory, plan, h.unpack)).toThrow(/files differ/);
  });
  it("keeps fresh delivery independent from npm and GitHub outages", async () => {
    const f = fixture();
    const unavailable = () => {
      throw new Error("must not contact a channel");
    };
    await expect(
      preflightRelease(
        f.directory,
        { ...plan, existing: false },
        f.unpack,
        unavailable,
        unavailable,
      ),
    ).resolves.toBeUndefined();
  });
  it("rejects a published GitHub manifest conflict before any npm call", async () => {
    const f = fixture();
    const api = async () => ({
      tag_name: plan.tag,
      draft: false,
      assets: [{ name: "manifest.json", size: 1, digest: "sha256:wrong" }],
    });
    const npm = () => {
      throw new Error("must not contact npm after manifest conflict");
    };
    await expect(preflightRelease(f.directory, plan, f.unpack, npm, api)).rejects.toThrow(
      /manifest.json differs/,
    );
  });
  it("checks every recovery package without issuing registry writes", async () => {
    const f = fixture();
    const calls: string[][] = [];
    const npm = (args: string[]) => {
      calls.push(args);
      throw { stdout: '{"error":{"code":"E404"}}' };
    };
    await preflightRelease(f.directory, plan, f.unpack, npm, async () => undefined);
    expect(calls).toHaveLength(19);
    expect(calls.every((args) => args[0] === "view")).toBe(true);
    expect(basename(f.directory)).toMatch(/^meltemi-recovery-test-/);
  });
});
