// Never deployed. Privileged preparation/cleanup runs apart from the unprivileged public suite.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { registerFixtureNodeRuntime } from "./oauth-fixtures-node.js";
import {
  FIXTURE_ORIGINS,
  fixtureFailure,
  type FixtureEnvironment,
} from "./oauth-fixture-format.js";
import { remoteD1 } from "./oauth-fixtures-d1.js";
import type { FixturePhase } from "./oauth-fixtures.js";
import { fixturePathPresent } from "./oauth-fixtures-private-file.js";
import { fixtureOutputAliases } from "./oauth-fixture-output.js";

let phase: FixturePhase = "fixture.arguments";

function value(name: string): string {
  const text = process.env[name]?.trim();
  return text || fixtureFailure();
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "--self-check" && process.argv.length === 3) {
    phase = "fixture.runtime";
    registerFixtureNodeRuntime();
    const { issueOAuthFixture, localFixtureExchange } =
      await import("./oauth-fixtures-provider.js");
    const rows = new Map<string, { value: string; expires?: number }>();
    const store: import("../../../cloud/src/oauth/store.js").KVLike = {
      async get(key, options) {
        const row = rows.get(key);
        if (!row || (row.expires !== undefined && row.expires <= Date.now())) return null;
        return options === "json" || (typeof options === "object" && options.type === "json")
          ? (JSON.parse(row.value) as unknown)
          : row.value;
      },
      async put(key, content, options) {
        rows.set(key, {
          value: content,
          ...(options?.expirationTtl ? { expires: Date.now() + options.expirationTtl * 1000 } : {}),
          ...(options?.expiration ? { expires: options.expiration * 1000 } : {}),
        });
      },
      async delete(key) {
        rows.delete(key);
      },
      async list(options) {
        return {
          keys: [...rows.keys()]
            .filter((key) => key.startsWith(options?.prefix ?? ""))
            .map((name) => ({ name })),
          list_complete: true,
        };
      },
    };
    const normal = await issueOAuthFixture({
      kind: "normal",
      origin: FIXTURE_ORIGINS.staging,
      sub: "node-runtime-probe",
      runId: "a".repeat(24),
      store,
      exchange: (origin, form) => localFixtureExchange(origin, store, form),
    });
    if (!normal.accessToken || !normal.refreshToken) fixtureFailure();
    console.log("OAuth fixture Node runtime probe passed (isolated in-memory provider only).");
    return;
  }
  if (mode !== "setup" && mode !== "cleanup") fixtureFailure();
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      environment: { type: "string" },
      file: { type: "string" },
      summary: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const environment = parsed.values.environment;
  if (
    !environment ||
    !Object.hasOwn(FIXTURE_ORIGINS, environment) ||
    !parsed.values.file ||
    (mode === "setup" && parsed.values.summary)
  )
    fixtureFailure();
  phase = "fixture.runtime";
  registerFixtureNodeRuntime();
  const { cleanupOAuthFixtures, fixtureFilePath, fixtureWhoami, setupOAuthFixtures } =
    await import("./oauth-fixtures.js");
  phase = "fixture.arguments";
  const options = {
    environment: environment as FixtureEnvironment,
    origin: FIXTURE_ORIGINS[environment as FixtureEnvironment],
    file: fixtureFilePath(parsed.values.file),
    journalKey: process.env["CLOUDFLARE_API_TOKEN"]?.trim() ?? "",
    onPhase: (next: FixturePhase) => {
      phase = next;
    },
  };
  const summaryFile = parsed.values.summary ? resolve(parsed.values.summary) : undefined;
  let summaryMayBeWritten = true;
  const validateSummaryPath = () => {
    if (summaryFile && fixtureOutputAliases(options.file, [summaryFile])) {
      summaryMayBeWritten = false;
      phase = "fixture.output_path";
      fixtureFailure();
    }
  };
  // Reject invalid output configuration before setup/cleanup can mutate any remote record.
  validateSummaryPath();
  const writeSummary = (summary: unknown) => {
    if (!summaryFile) return;
    validateSummaryPath();
    mkdirSync(dirname(summaryFile), { recursive: true });
    validateSummaryPath();
    writeFileSync(summaryFile, JSON.stringify(summary) + "\n");
  };
  if (mode === "cleanup" && !fixturePathPresent(options.file)) {
    phase = "fixture.cleanup_validate";
    if (fixturePathPresent(options.file + ".registration.json")) {
      writeSummary({ format: 1, environment, success: false, residuals: null, phase });
      fixtureFailure();
    }
    writeSummary({
      format: 1,
      environment,
      success: true,
      clientsDeleted: 0,
      grantsDeleted: 0,
      keysDeleted: 0,
      residuals: 0,
    });
    console.log("OAuth fixture cleanup: no preparation journal; zero records changed.");
    return;
  }
  if (value("MELTEMI_ORIGIN") !== options.origin) fixtureFailure();
  const remote = remoteD1({
    accountId: value("CLOUDFLARE_ACCOUNT_ID"),
    databaseId: value("D1_DATABASE_ID"),
    token: value("CLOUDFLARE_API_TOKEN"),
    databaseName: environment === "staging" ? "meltemi-diagrams-staging" : "meltemi-diagrams",
  });
  phase = "fixture.database_metadata";
  await remote.verify();
  try {
    if (mode === "setup") {
      await setupOAuthFixtures(
        options,
        { first: value("MELTEMI_TOKEN"), second: value("MELTEMI_TOKEN_2") },
        {
          db: remote.db,
          whoami: (token) => fixtureWhoami(options.origin, token),
          exchange: async (origin, form) => {
            if (origin !== options.origin) return fixtureFailure();
            phase = "fixture.public_exchange";
            return fetch(origin + "/oauth/token", {
              method: "POST",
              body: form,
              redirect: "manual",
              signal: AbortSignal.timeout(30_000),
            });
          },
        },
      );
      console.log(
        "OAuth fixtures prepared: four isolated credentials; private journal is outside results.",
      );
    } else {
      const summary = await cleanupOAuthFixtures(options, remote.db);
      writeSummary(summary);
      console.log(
        `OAuth fixture cleanup: ${summary.clientsDeleted} clients, ${summary.grantsDeleted} grants, zero residuals.`,
      );
    }
  } catch {
    if (summaryMayBeWritten)
      writeSummary({ format: 1, environment, success: false, residuals: null, phase });
    return fixtureFailure();
  }
}

try {
  await main();
} catch {
  // Never print caught errors: provider, transport and JSON errors can contain credentials.
  console.error(
    `OAuth fixture operation failed (${phase}); no credential or remote error body was logged.`,
  );
  process.exitCode = 1;
}
