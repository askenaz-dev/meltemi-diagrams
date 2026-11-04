// CI is the authorization, including manual recovery. Never trust a user-supplied SHA.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateCiRun(run, workflow, repository) {
  if (
    run.name !== "CI" ||
    run.path !== ".github/workflows/ci.yml" ||
    run.workflow_id !== workflow.id ||
    workflow.path !== ".github/workflows/ci.yml" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? "")
  ) {
    throw new Error("Delivery requires successful CI (ci.yml), push to main, in this repository.");
  }
  return run.head_sha;
}

export function requestedRun(eventName, ref, event, input) {
  if (eventName === "workflow_dispatch" && ref !== "refs/heads/main") {
    throw new Error("Recovery must be dispatched from main.");
  }
  if (!["workflow_run", "workflow_dispatch"].includes(eventName)) {
    throw new Error("Delivery requires workflow_run or validated recovery.");
  }
  const id = eventName === "workflow_run" ? String(event.workflow_run?.id ?? "") : input;
  if (!/^[1-9][0-9]*$/.test(id ?? "")) throw new Error("A numeric CI run id is required.");
  return id;
}

export async function githubJson(path, env = process.env) {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN is required to validate CI.");
  const response = await fetch(`${env.GITHUB_API_URL ?? "https://api.github.com"}${path}`, {
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`GitHub authorization lookup failed (HTTP ${response.status}).`);
  return response.json();
}

export function output(values) {
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
      throw new Error("GITHUB_REPOSITORY is required.");
    }
    if (process.argv[2] === "current") {
      const commit = await githubJson(`/repos/${repository}/commits/main`);
      const current = commit.sha === process.env.SOURCE_SHA;
      output({ current });
      console.log(current ? "Source is current main." : "Skipped: source was superseded by main.");
    } else {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      const id = requestedRun(
        process.env.GITHUB_EVENT_NAME,
        process.env.GITHUB_REF,
        event,
        process.env.CI_RUN_ID,
      );
      const [run, workflow] = await Promise.all([
        githubJson(`/repos/${repository}/actions/runs/${id}`),
        githubJson(`/repos/${repository}/actions/workflows/ci.yml`),
      ]);
      const sha = validateCiRun(run, workflow, repository);
      output({ sha, ci_run_id: id });
      console.log(`Authorized CI ${id}, source ${sha}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
