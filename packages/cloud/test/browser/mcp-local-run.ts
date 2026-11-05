// A run of the MCP acceptance suite through the command line's local server against the Worker on
// this computer (change `local-mcp-server`, task 7.2): the Worker as the browser suite starts it
// (`wrangler dev` on a free port, its migrations, the test keys), two people signed in with the
// suite's own sessions, an API token each, and `pnpm acceptance:mcp --local` with those tokens in its
// environment. The Worker's log is written beside the suite's results, and scanned for any request
// to `/mcp`: the local server must not make one.
//
//   pnpm playground:build && pnpm --filter "@meltemi/diagrams-cli..." build
//   tsx --conditions=@meltemi/diagrams-source packages/cloud/test/browser/mcp-local-run.ts
//
// The exit code is the suite's, or 1 when a request reached `/mcp`. No token is printed.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makePerson } from "./support.js";
import { CLOUD, startWorker, type RunningWorker } from "./worker.js";

const REPO = join(CLOUD, "..", "..");
const RESULTS = join(REPO, ".test-output", "mcp-acceptance-local");
mkdirSync(RESULTS, { recursive: true });

/** An API token for each of the two people, made with their sessions as the page makes one. */
async function tokensOf(worker: RunningWorker): Promise<string[]> {
  const tokens: string[] = [];
  for (const [sub, name] of [
    ["dev-ana", "Ana"],
    ["dev-ben", "Ben"],
  ] as const) {
    const person = await makePerson(worker, sub, { name });
    const made = await person.api("POST", "/api/tokens", { name: "mcp-local-acceptance" });
    if (made.status !== 201) throw new Error(`no token for ${sub}: ${made.status}`);
    tokens.push((made.json() as { token: string }).token);
  }
  return tokens;
}

/** The suite with `--local`, its exit code; the Worker's log is kept in `serverLog` meanwhile. */
function suite(
  worker: RunningWorker,
  tokens: readonly string[],
  serverLog: string,
): Promise<number> {
  return new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        join(REPO, "node_modules", "tsx", "dist", "cli.mjs"),
        join(REPO, "packages", "acceptance", "src", "mcp", "run.ts"),
        "--local",
      ],
      {
        cwd: REPO,
        env: {
          ...process.env,
          MELTEMI_ORIGIN: worker.origin,
          MELTEMI_TOKEN: tokens[0],
          MELTEMI_TOKEN_2: tokens[1],
          MELTEMI_RESULTS: join(RESULTS, "results.json"),
          MELTEMI_SERVER_LOG: serverLog,
        },
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    // The Worker's log so far, for criterion 29, before the suite's last step reads it.
    const keep = setInterval(() => writeFileSync(serverLog, worker.output()), 500);
    child.once("exit", (exit) => {
      clearInterval(keep);
      resolve(exit ?? 1);
    });
  });
}

const worker = await startWorker();
const code = await (async (): Promise<number> => {
  try {
    const serverLog = join(RESULTS, "worker.log");
    const passed = await suite(worker, await tokensOf(worker), serverLog);
    const log = worker.output();
    writeFileSync(serverLog, log);
    const toMcp = log.split(/\r?\n/).filter((line) => /\s(POST|GET|DELETE)\s+\/mcp\b/.test(line));
    console.log(`\nRequests to /mcp in the Worker's log: ${toMcp.length}.`);
    return toMcp.length > 0 ? 1 : passed;
  } finally {
    await worker.stop();
  }
})();
process.exit(code);
