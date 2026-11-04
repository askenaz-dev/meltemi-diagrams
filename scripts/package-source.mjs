// This file's presence in a checked source enables deterministic package source metadata.
import { readFileSync, writeFileSync } from "node:fs";
import { versionedManifests } from "./release-version.mjs";

/** Product source is separate from the workflow coordinates npm signs through OIDC. */
export function packageSource(plan) {
  if (
    !/^[a-f0-9]{40}$/.test(plan.sha ?? "") ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(plan.version ?? "") ||
    plan.tag !== `v${plan.version}` ||
    !/^[\w.-]+\/[\w.-]+$/.test(plan.repository ?? "")
  ) {
    throw new Error("Invalid checked package source.");
  }
  return { repository: plan.repository, sha: plan.sha, tag: plan.tag };
}

export function stampPackageSource(cwd, plan) {
  const source = packageSource(plan);
  for (const path of versionedManifests(cwd)) {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest.private || !manifest.name?.startsWith("@meltemi/diagrams-")) continue;
    manifest.meltemiRelease = source;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}
