// Source-ordered versions: completion order must not roll Marketplace users backwards.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { output } from "./ci-run.mjs";
import { setVersion } from "./release-version.mjs";
import { packageSource, stampPackageSource } from "./package-source.mjs";

export const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function semver(version) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version ?? "")) {
    throw new Error(`Invalid stable version: ${version}`);
  }
  const parts = version.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("Version exceeds safe integer range.");
  return parts;
}

export function compareVersions(left, right) {
  const a = semver(left);
  const b = semver(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function canPromote(version, current, eligible) {
  return eligible && (!current || compareVersions(version, current) >= 0);
}

const addPatch = (version, distance) => {
  const [major, minor, patch] = semver(version);
  if (!Number.isSafeInteger(patch + distance)) throw new Error("Patch exceeds safe integer range.");
  return `${major}.${minor}.${patch + distance}`;
};

export function planRelease(cwd, sha, main = "refs/remotes/origin/main") {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("A full source SHA is required.");
  const history = git(cwd, "rev-list", "--first-parent", main).split("\n");
  const sourceIndex = history.indexOf(sha);
  if (sourceIndex < 0) throw new Error("CI source is not on main's first-parent history.");
  if (!git(cwd, "ls-tree", "--name-only", sha, "scripts/automatic-release.mjs")) {
    throw new Error(
      "Source predates automatic releases; recover its original release workflow instead.",
    );
  }
  const tags = git(cwd, "tag", "--list")
    .split("\n")
    .filter((tag) => /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag))
    .map((tag) => ({ tag, version: tag.slice(1), sha: git(cwd, "rev-parse", `${tag}^{commit}`) }));
  const exact = tags.filter((tag) => tag.sha === sha);
  if (exact.length > 1)
    throw new Error("Source has multiple stable version tags; resolve ambiguity manually.");
  const declaredAt = (commit) => {
    const version = JSON.parse(git(cwd, "show", `${commit}:packages/cli/package.json`)).version;
    semver(version);
    return version;
  };
  let version = exact[0]?.version;
  let anchor;
  const ancestors = history.slice(sourceIndex);
  for (let distance = 1; distance < ancestors.length; distance++) {
    const found = tags.filter((tag) => tag.sha === ancestors[distance]);
    if (found.length > 1) throw new Error("Release anchor has multiple stable version tags.");
    if (found.length) {
      anchor = { ...found[0], distance };
      break;
    }
  }
  if (!version) {
    const declared = declaredAt(sha);
    let distance = 0;
    while (distance + 1 < ancestors.length) {
      // The product manifest might not exist before the repository was bootstrapped.
      if (!git(cwd, "ls-tree", "--name-only", ancestors[distance + 1], "packages/cli/package.json"))
        break;
      if (declaredAt(ancestors[distance + 1]) !== declared) break;
      distance++;
    }
    const declaredCandidate = addPatch(declared, distance);
    const tagCandidate = anchor ? addPatch(anchor.version, anchor.distance) : undefined;
    // A tag in the same declaration era is authoritative. A later declaration may raise, never
    // lower, its trajectory; e.g. source floor 1.10.1 cannot reset an automated 1.10.50 release.
    version =
      tagCandidate &&
      (anchor.distance <= distance || compareVersions(tagCandidate, declaredCandidate) >= 0)
        ? tagCandidate
        : declaredCandidate;
  }
  const tag = `v${version}`;
  const collision = tags.find((entry) => entry.tag === tag && entry.sha !== sha);
  if (collision) throw new Error(`${tag} already names another SHA; tags are immutable.`);
  for (const entry of tags) {
    const index = history.indexOf(entry.sha);
    if (index < 0 || index === sourceIndex) continue;
    const comparison = compareVersions(version, entry.version);
    if ((index < sourceIndex && comparison >= 0) || (index > sourceIndex && comparison <= 0)) {
      throw new Error(
        `Version history is not source-ordered at ${entry.tag}; refusing a rollback.`,
      );
    }
  }
  return {
    sha,
    version,
    tag,
    existing: exact.length === 1,
    latest: !tags.some((entry) => compareVersions(entry.version, version) > 0),
    previous: anchor?.tag ?? "",
  };
}

export function reserveRelease(cwd, plan) {
  if (!plan.existing) git(cwd, "tag", plan.tag, plan.sha);
  // No force, no moving refs. A competing reservation fails instead of publishing a collision.
  git(cwd, "push", "origin", `refs/tags/${plan.tag}:refs/tags/${plan.tag}`);
}

/** Recovery uses the source's capabilities, not those of the newer delivery checkout. */
export function sourceHasPackageMetadata(cwd, sha) {
  return git(cwd, "ls-tree", "--name-only", sha, "scripts/package-source.mjs") !== "";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv[2] === "metadata") {
      const plan = JSON.parse(readFileSync(process.argv[3], "utf8"));
      const destination = resolve(process.argv[4]);
      if (!existsSync(join(destination, "manifest.json")))
        throw new Error("Checked release artifact is missing.");
      const { repository, sha, version, tag, ciRun } = plan;
      if (plan.packageSourceMetadata === 1) {
        const manifestPath = join(destination, "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.source = packageSource(plan);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
      writeFileSync(
        join(destination, "provenance.json"),
        `${JSON.stringify({ repository, sha, version, tag, ciRun }, null, 2)}\n`,
      );
      writeFileSync(join(destination, "delivery-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
      writeFileSync(join(destination, "notes.md"), plan.notes);
    } else {
      const cwd = process.cwd();
      git(cwd, "fetch", "origin", "refs/heads/main:refs/remotes/origin/main", "--tags");
      const plan = planRelease(cwd, process.env.SOURCE_SHA);
      const epoch = git(cwd, "show", "-s", "--format=%ct", plan.sha);
      if (!/^[0-9]+$/.test(epoch)) throw new Error("Source has no valid commit timestamp.");
      if (git(cwd, "rev-parse", "HEAD") !== plan.sha)
        throw new Error("Build checkout is not the CI SHA.");
      if (process.env.RELEASE_RUN_ID && !plan.existing)
        throw new Error("Artifact recovery requires the source's existing immutable tag.");
      if (process.argv[2] !== "stamp") reserveRelease(cwd, plan);
      setVersion(plan.version, cwd);
      if (process.argv[2] === "stamp") {
        output({ version: plan.version });
        console.log(`Build version ${plan.version} for ${plan.sha}; no tag reserved.`);
        process.exit(0);
      }
      const ciRun = process.env.CI_RUN_ID;
      if (!/^[1-9][0-9]*$/.test(ciRun ?? "")) throw new Error("CI_RUN_ID is required.");
      plan.ciRun = ciRun;
      plan.repository = process.env.GITHUB_REPOSITORY;
      if (sourceHasPackageMetadata(cwd, plan.sha)) {
        plan.packageSourceMetadata = 1;
        stampPackageSource(cwd, plan);
      }
      const range = plan.previous ? `${plan.previous}..${plan.sha}` : plan.sha;
      const changes = git(
        cwd,
        "log",
        "--first-parent",
        "--format=- %h %s",
        ...(plan.previous ? [] : ["-1"]),
        range,
      );
      plan.notes = `Meltemi Diagrams ${plan.version}\n\nSource: ${plan.sha}\nCI: https://github.com/${plan.repository}/actions/runs/${ciRun}\n\n${changes}\n`;
      writeFileSync(process.env.RELEASE_PLAN, `${JSON.stringify(plan, null, 2)}\n`);
      output({
        sha: plan.sha,
        version: plan.version,
        tag: plan.tag,
        latest: plan.latest,
        source_date_epoch: epoch,
        artifact: `release-${plan.sha}-${plan.version}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
      });
      console.log(`${plan.tag}: ${plan.sha}${plan.existing ? " (recovery)" : ""}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
