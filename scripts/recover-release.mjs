// Recover immutable checked bytes from a validated main Release run, never repack them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { githubJson } from "./ci-run.mjs";
import { safeArtifactNames, unpackManifest, validateArtifact } from "./preflight-release.mjs";

export function validateReleaseRun(run, workflow, repository, runId) {
  if (
    String(run.id) !== runId ||
    run.name !== "Release" ||
    run.path !== ".github/workflows/release.yml" ||
    run.workflow_id !== workflow.id ||
    workflow.path !== ".github/workflows/release.yml" ||
    run.status !== "completed" ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    !["workflow_run", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== "main" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? "")
  ) {
    throw new Error("Recovery requires a completed main Release run in this repository.");
  }
}

export function selectRecoveryArtifact(artifacts, run, plan) {
  const prefix = `release-${plan.sha}-${plan.version}-${run.id}-`;
  const candidates = artifacts
    .filter((artifact) => artifact.name.startsWith(prefix))
    .map((artifact) => {
      const attempt = artifact.name.slice(prefix.length);
      if (!/^[1-9][0-9]*$/.test(attempt) || Number(attempt) > run.run_attempt)
        throw new Error("Artifact attempt does not belong to the selected release run.");
      return { ...artifact, attempt: Number(attempt) };
    })
    .sort((a, b) => a.attempt - b.attempt);
  if (!candidates.length)
    throw new Error("The selected release has no artifact for this source/version.");
  if (new Set(candidates.map((artifact) => artifact.attempt)).size !== candidates.length)
    throw new Error("Ambiguous release artifacts for the same attempt.");
  const artifact = candidates[0];
  if (artifact.expired)
    throw new Error(
      "The original checked artifact expired; it cannot be rebuilt by this recovery.",
    );
  if (
    !/^[1-9][0-9]*$/.test(String(artifact.id)) ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "") ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run?.repository_id !== run.repository.id ||
    artifact.workflow_run?.head_repository_id !== run.head_repository.id ||
    artifact.workflow_run?.head_branch !== "main" ||
    artifact.workflow_run?.head_sha !== run.head_sha
  ) {
    throw new Error("Artifact identity or digest does not match the selected release run.");
  }
  return artifact;
}

export function validateCheckAttempt(jobs, run, artifact) {
  const checks = jobs.filter((job) => job.name === "check");
  if (
    checks.length !== 1 ||
    checks[0].run_id !== run.id ||
    checks[0].head_sha !== run.head_sha ||
    checks[0].status !== "completed" ||
    checks[0].conclusion !== "success" ||
    (checks[0].run_attempt !== undefined && checks[0].run_attempt !== artifact.attempt)
  ) {
    throw new Error("The artifact's exact check attempt did not succeed.");
  }
}

export function verifyArchive(bytes, artifact) {
  if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== artifact.digest)
    throw new Error("Downloaded artifact ZIP differs from GitHub's SHA-256 digest.");
}

export function rejectMissingOriginal(jobs) {
  if (
    jobs.some(
      (job) => job.name === "check" && job.status === "completed" && job.conclusion === "success",
    )
  )
    throw new Error(
      "An earlier check succeeded but its original artifact is unavailable; refusing a rebuilt replacement.",
    );
}

async function listAll(path, key) {
  const all = [];
  for (let page = 1; ; page++) {
    const result = await githubJson(`${path}?per_page=100&page=${page}`);
    if (!Array.isArray(result[key]))
      throw new Error("GitHub returned an invalid artifact/job list.");
    all.push(...result[key]);
    if (result[key].length < 100) return all;
  }
}

export async function recoverRelease(directory, plan, runId) {
  if (!/^[1-9][0-9]*$/.test(runId ?? "") || !plan.existing)
    throw new Error(
      "Artifact recovery requires a release run id and an already reserved source tag.",
    );
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== plan.repository || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? ""))
    throw new Error("Artifact recovery repository differs from the authorized plan.");
  const base = `/repos/${repository}/actions`;
  const [run, workflow, artifacts] = await Promise.all([
    githubJson(`${base}/runs/${runId}`),
    githubJson(`${base}/workflows/release.yml`),
    listAll(`${base}/runs/${runId}/artifacts`, "artifacts"),
  ]);
  validateReleaseRun(run, workflow, repository, runId);
  execFileSync("git", ["merge-base", "--is-ancestor", run.head_sha, "origin/main"]);
  const artifact = selectRecoveryArtifact(artifacts, run, plan);
  for (let attempt = 1; attempt < artifact.attempt; attempt++) {
    rejectMissingOriginal(await listAll(`${base}/runs/${runId}/attempts/${attempt}/jobs`, "jobs"));
  }
  const jobs = await listAll(`${base}/runs/${runId}/attempts/${artifact.attempt}/jobs`, "jobs");
  validateCheckAttempt(jobs, run, artifact);
  const response = await fetch(
    `${process.env.GITHUB_API_URL ?? "https://api.github.com"}${base}/artifacts/${artifact.id}/zip`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) throw new Error(`Artifact download failed (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyArchive(bytes, artifact);
  const zip = join(mkdtempSync(join(tmpdir(), "meltemi-recovery-")), "release.zip");
  writeFileSync(zip, bytes);
  const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).trimEnd().split("\n");
  safeArtifactNames(names);
  if (existsSync(directory) && readdirSync(directory).length)
    throw new Error("Recovery destination must be empty.");
  mkdirSync(directory, { recursive: true });
  execFileSync("unzip", ["-q", zip, "-d", directory]);
  const checked = validateArtifact(directory, plan, unpackManifest);
  // This private plan is not a published asset. Keep source/provenance/content unchanged.
  checked.plan.latest = plan.latest;
  writeFileSync(
    join(directory, "delivery-plan.json"),
    `${JSON.stringify(checked.plan, null, 2)}\n`,
  );
  console.log(
    `Recovered artifact ${artifact.id}, Release ${run.id} attempt ${artifact.attempt}; no rebuild.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await recoverRelease(
      process.argv[3],
      JSON.parse(readFileSync(process.argv[2], "utf8")),
      process.env.RELEASE_RUN_ID,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
