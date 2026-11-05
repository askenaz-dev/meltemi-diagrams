// `pnpm acceptance:mcp`: the MCP acceptance suite (change `agent-mcp`, `mcp-acceptance`) against a
// host, as an agent with the official SDK's client and two test accounts' API tokens.
//
//   MELTEMI_ORIGIN=https://staging.diagrams.meltemi.dev \
//   MELTEMI_TOKEN=… MELTEMI_TOKEN_2=… pnpm acceptance:mcp
//
// MELTEMI_ORIGIN is the service's origin (MELTEMI_MCP_URL, the endpoint's address, works too).
// MELTEMI_TOKEN and MELTEMI_TOKEN_2 are the `mdg_` API tokens of two dedicated test accounts. Without
// them only what anybody sees is checked (the metadata documents, the challenge, a token the service
// did not issue), and every other step is reported skipped with its reason. MELTEMI_RESULTS is where
// `results.json` goes (`.test-output/mcp-acceptance/results.json` by default), with the run's log,
// redacted, beside it; MELTEMI_SERVER_LOG, a file of the Worker's log for criterion 29 to scan too.
//
// `--probe` only asks whether the host answers, and writes `answers=true|false` to GITHUB_OUTPUT for
// the deploy workflow, which skips the suite on a staging host whose domain is not attached yet.
//
// `--local` runs the same steps through the command line's local server (change local-mcp-server):
// one built `mdg mcp` process for each test account, its token in its own environment, its host the
// target's origin. The steps that prove the endpoint's own door and its OAuth server are skipped with
// their reason; nothing is asked of `/mcp`. Build the command line first
// (`pnpm --filter "@meltemi/diagrams-cli..." build`).
//
// The exit code is 1 when a step failed, when the log held something that grants access, or when the
// host does not answer (named, before any step), and 0 otherwise. Nothing that grants access is
// printed or written.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SDK } from "./agent.js";
import { startLocalServers, type LocalServers } from "./local.js";
import {
  MANUAL_CRITERIA,
  RunLog,
  runSteps,
  summarise,
  type Capabilities,
  type RunOutcome,
} from "./harness.js";
import { probeUntil, targetFrom, type Probe, type Target } from "./host.js";
import { newState, STEPS, type SuiteState } from "./steps.js";

/** The repository, from this file (`packages/acceptance/src/mcp/run.ts`): the suite loads no engine. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const env = process.env;
const inActions = env["GITHUB_ACTIONS"] === "true";
const local = process.argv.includes("--local");

/** A value of the environment, trimmed, or undefined when it is empty (GitHub's unset secret). */
const read = (name: string) => env[name]?.trim() || undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Writes a line for GitHub's runner: a notice or an error annotation, when running there. */
function annotate(kind: "notice" | "error", title: string, message: string): void {
  if (inActions) console.log(`::${kind} title=${title}::${message}`);
}

const target = targetFrom(env);
if (!target) {
  fail(
    "Set MELTEMI_ORIGIN (or MELTEMI_MCP_URL) to the service's address, such as https://staging.diagrams.meltemi.dev.",
  );
}

if (process.argv.includes("--probe")) {
  const probed = await probeUntil(target, 6, 5_000);
  if (env["GITHUB_OUTPUT"]) appendFileSync(env["GITHUB_OUTPUT"], `answers=${probed.answers}\n`);
  // The workflow says what a host that does not answer means for it (a notice on staging).
  console.log(
    `${target.origin} ${probed.answers ? "answers" : "does not answer"} (${probed.why}).`,
  );
  process.exit(0);
}

const resultsFile = resolve(
  read("MELTEMI_RESULTS") ?? join(REPO_ROOT, ".test-output", "mcp-acceptance", "results.json"),
);
mkdirSync(dirname(resultsFile), { recursive: true });

const tokens = { first: read("MELTEMI_TOKEN"), second: read("MELTEMI_TOKEN_2") };
const capabilities: Capabilities = {
  token: !!tokens.first,
  token2: !!tokens.second,
  ...(local ? { local: true } : {}),
};
const log = new RunLog();
for (const token of [tokens.first, tokens.second]) if (token) log.secrets.add(token);
const startedAt = new Date();

/** `results.json`: what ran, against what, and how it ended; never a token or a link. */
function writeResults(
  state: SuiteState | undefined,
  outcome: RunOutcome | undefined,
  probed: Probe,
) {
  const results = {
    suite: "mcp-acceptance",
    change: "agent-mcp",
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    origin: target!.origin,
    endpoint: target!.endpoint,
    transport: local ? "local server (mdg mcp)" : "endpoint",
    reachable: probed.answers,
    ...(probed.answers ? {} : { unreachable: probed.why }),
    server: state?.server ?? null,
    protocolVersion: state?.protocolVersion ?? null,
    client: SDK,
    node: process.version,
    accounts: { MELTEMI_TOKEN: capabilities.token, MELTEMI_TOKEN_2: capabilities.token2 },
    authorizationServer: capabilities.oauth ?? null,
    passed: outcome?.passed ?? false,
    summary: summarise(outcome?.results ?? []),
    steps: outcome?.results ?? [],
    leaks: outcome?.leaks ?? [],
    manual: {
      criteria: MANUAL_CRITERIA,
      note: "1, 7, 8, 9 and the voice half of 16 are the procedure of docs/quality/mcp-acceptance.md, with the real Codex",
    },
    workflow:
      "criterion 30 is the deploy workflow's run of this suite on staging and then production",
  };
  // The results are scanned like every line: a value that grants access never reaches the file.
  const json = log.redact(JSON.stringify(results, null, 2));
  writeFileSync(resultsFile, `${json}\n`);
  writeFileSync(
    join(dirname(resultsFile), "log.txt"),
    `${log.lines.map((entry) => entry.line).join("\n")}\n`,
  );
}

/** The run's table for GitHub's step summary. */
function writeSummary(outcome: RunOutcome, server: Target): void {
  const file = env["GITHUB_STEP_SUMMARY"];
  if (!file) return;
  const rows = outcome.results.map(
    (r) =>
      `| ${r.criterion ?? ""} | ${r.step} | ${r.outcome} | ${r.ms} | ${(r.reason ?? r.error ?? "").replace(/\|/g, "\\|")} |`,
  );
  const counts = summarise(outcome.results);
  appendFileSync(
    file,
    [
      `### MCP acceptance: ${server.origin}`,
      "",
      `${outcome.passed ? "Passed" : "Failed"}: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.`,
      "",
      "| Criterion | Step | Outcome | ms | Reason |",
      "| --: | --- | --- | --: | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
}

// The host first: one that does not answer is named before any step.
const probed = await probeUntil(target, 3, 3_000, fetch, local);
if (!probed.answers) {
  writeResults(undefined, undefined, probed);
  annotate("error", "MCP acceptance", `${target.origin} does not answer (${probed.why}).`);
  fail(`The host ${target.origin} does not answer (${probed.why}); no step ran.`);
}

log.write(
  "-",
  local
    ? `MCP acceptance against ${target.origin}, through mdg mcp`
    : `MCP acceptance against ${target.endpoint}`,
);
if (!capabilities.token || !capabilities.token2) {
  const missing = [
    !capabilities.token && "MELTEMI_TOKEN",
    !capabilities.token2 && "MELTEMI_TOKEN_2",
  ]
    .filter(Boolean)
    .join(" and ");
  log.write("-", `${missing} not set: the steps that need them are skipped, each with its reason.`);
}

let servers: LocalServers | undefined;
if (local) {
  try {
    servers = await startLocalServers({
      bin: join(REPO_ROOT, "packages", "cli", "dist", "bin.js"),
      origin: target.origin,
      tokens,
      log: join(dirname(resultsFile), "mdg-mcp.log"),
    });
  } catch (error) {
    fail(error instanceof Error ? log.redact(error.message) : "mdg mcp did not start");
  }
  log.write("-", `through mdg mcp: ${[servers.first, servers.second].filter(Boolean).join(", ")}`);
}

const state = newState({
  target,
  capabilities,
  tokens,
  ...(read("MELTEMI_SERVER_LOG") ? { serverLog: read("MELTEMI_SERVER_LOG")! } : {}),
  ...(servers?.first
    ? {
        local: {
          first: servers.first,
          ...(servers.second ? { second: servers.second } : {}),
          log: servers.log,
        },
      }
    : {}),
});
const outcome = await runSteps(STEPS, state, capabilities, log);
await servers?.stop();
writeResults(state, outcome, probed);
writeSummary(outcome, target);

const counts = summarise(outcome.results);
log.write(
  "-",
  `${outcome.passed ? "Passed" : "Failed"}: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped. Results: ${resultsFile}`,
);
if (counts.skipped > 0) {
  annotate(
    "notice",
    "MCP acceptance",
    `${counts.skipped} step(s) skipped against ${target.origin}; results.json gives each reason.`,
  );
}
for (const result of outcome.results.filter((r) => r.outcome === "failed")) {
  annotate("error", "MCP acceptance", `${result.step}: ${result.error ?? "failed"}`);
}
// The SDK's transports may hold sockets open; the run is over.
process.exit(outcome.passed ? 0 : 1);
