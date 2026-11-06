import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteDb } from "../../cloud/test/support/sqlite.js";
import { d1OAuthStore } from "../../cloud/src/oauth/store.js";
import { cloud } from "../../cloud/src/handler.js";
import { harness } from "../../cloud/test/support/index.js";
import {
  FIXTURE_CLIENT_PREFIX,
  FIXTURE_ORIGINS,
  fixtureSecrets,
  parseOAuthFixtures,
} from "../src/mcp/oauth-fixture-format.js";
import { recordFixtureClient } from "../src/mcp/oauth-fixture-registration.js";
import { remoteD1 } from "../src/mcp/oauth-fixtures-d1.js";
import { registerFixtureNodeRuntime } from "../src/mcp/oauth-fixtures-node.js";
import { fixtureHelpers, localFixtureExchange } from "../src/mcp/oauth-fixtures-provider.js";
import {
  cleanupOAuthFixtures,
  fixtureFilePath,
  setupOAuthFixtures,
  type FixtureOptions,
  type FixtureServices,
} from "../src/mcp/oauth-fixtures.js";

// These credentials and principals are synthetic. Exercise the real ACL adapter separately,
// rather than spawning PowerShell for every provider KV write in an offline lifecycle test.
vi.mock("../src/mcp/oauth-fixtures-private-file.js", async () => {
  const fs = await import("node:fs");
  const actual = await vi.importActual<typeof import("../src/mcp/oauth-fixtures-private-file.js")>(
    "../src/mcp/oauth-fixtures-private-file.js",
  );
  return {
    ...actual,
    assertPrivateFixtureFile() {},
    writeNewPrivateFixtureFile(file: string, text: string) {
      fs.writeFileSync(file, text, { flag: "wx", mode: 0o600 });
    },
  };
});

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const origin = FIXTURE_ORIGINS.staging;
const subjects = ["synthetic-fixture-primary", "synthetic-fixture-secondary"];
const subjectHashes = subjects.map((sub) => createHash("sha256").update(sub).digest("hex"));
const tokens = { first: "mdg_" + "a".repeat(43), second: "mdg_" + "b".repeat(43) };
const key = "unit-test-journal-key-not-a-credential";
const directories: string[] = [];
const databases: SqliteDb[] = [];

beforeAll(() => registerFixtureNodeRuntime());
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) {
    const resolved = realpathSync(directory);
    if (
      !resolved.startsWith(realpathSync(tmpdir()) + sep) ||
      !resolved.includes("meltemi-oauth-fixture-test-")
    )
      throw new Error("Unsafe test cleanup");
    rmSync(resolved, { recursive: true, force: true });
  }
});

function privateDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "meltemi-oauth-fixture-test-"));
  directories.push(directory);
  return directory;
}

function context() {
  const db = openDatabase();
  databases.push(db);
  for (const [index, sub] of subjects.entries())
    db.raw
      .prepare(
        "INSERT INTO users (sub,name,picture,email,email_verified,created_at) VALUES (?,?,?, ?,1,?)",
      )
      .run(sub, "Fixture user", "", `fixture-${index}@example.invalid`, new Date().toISOString());
  const options: FixtureOptions = {
    environment: "staging",
    origin,
    file: join(privateDirectory(), "fixtures.json"),
    journalKey: key,
  };
  const store = d1OAuthStore(db);
  const services: FixtureServices = {
    db,
    subjectHashes,
    async whoami(token) {
      const index = token === tokens.first ? 0 : 1;
      return { sub: subjects[index]!, email: `fixture-${index}@example.invalid` };
    },
    exchange: (at, form) => localFixtureExchange(at, store, form),
  };
  return { db, options, services, store };
}

describe("privileged OAuth fixtures", () => {
  it("creates provider-native credentials, historical expiry and a distinct resource; then cleans exactly its rows", async () => {
    const { db, options, services, store } = context();
    const clock = Date.now;
    const bundle = await setupOAuthFixtures(options, tokens, services);
    expect(Date.now).toBe(clock);
    expect(
      parseOAuthFixtures(JSON.parse(readFileSync(options.file, "utf8")) as unknown, origin).runId,
    ).toBe(bundle.runId);
    if (process.platform !== "win32") expect(lstatSync(options.file).mode & 0o077).toBe(0);
    const helpers = await fixtureHelpers(origin, store);
    const normal = await helpers.unwrapToken(bundle.fixtures.normal.accessToken);
    expect(normal).toMatchObject({
      scope: expect.arrayContaining(["projects:write"]),
      audience: origin + "/mcp",
    });
    expect(await helpers.unwrapToken(bundle.fixtures.expired.accessToken)).toBeNull();
    expect(await helpers.unwrapToken(bundle.fixtures.narrow.accessToken)).toMatchObject({
      scope: ["projects:read"],
    });
    expect(await helpers.unwrapToken(bundle.fixtures.wrongResource.accessToken)).toMatchObject({
      audience: "https://mcp-acceptance.invalid/mcp",
    });
    expect(bundle.fixtures.expired.expiresAt).toBeLessThan(Date.now() / 1000);
    // Positive and negative credentials all cross the same actual product authorization route.
    const host = await harness({ env: { ORIGIN: origin }, start: new Date().toISOString() });
    const publicCall = (token: string) =>
      cloud(
        new Request(origin + "/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        }),
        host.env,
        { ...host.deps, oauthStore: store },
      );
    expect((await publicCall(bundle.fixtures.normal.accessToken)).status).toBe(200);
    expect((await publicCall(bundle.fixtures.expired.accessToken)).status).toBe(401);
    expect((await publicCall(bundle.fixtures.wrongResource.accessToken)).status).toBe(401);
    const journal = JSON.parse(readFileSync(options.file, "utf8")) as {
      cleanup: { grants: { id: string }[] };
    };
    db.raw
      .prepare("INSERT INTO app_uses (sub,grant_id,last_used_at) VALUES (?,?,?)")
      .run(subjects[0]!, journal.cleanup.grants[0]!.id, new Date().toISOString());
    await store.put("client:unrelatedclient0", JSON.stringify({ clientName: "Unrelated app" }));
    const result = await cleanupOAuthFixtures(options, db, { subjectHashes });
    expect(result).toMatchObject({
      success: true,
      clientsDeleted: 4,
      grantsDeleted: 4,
      residuals: 0,
    });
    expect(db.raw.prepare("SELECT key FROM oauth_store").all()).toEqual([
      { key: "client:unrelatedclient0" },
    ]);
    expect(db.raw.prepare("SELECT * FROM app_uses").all()).toEqual([]);
    expect(existsSync(options.file)).toBe(false);
  });

  it("recovers an incomplete setup from its signed write-ahead journal and restores the clock on failure", async () => {
    const { db, options, services } = context();
    const clock = Date.now;
    services.exchange = async () => {
      throw new Error("sensitive response must not escape");
    };
    await expect(setupOAuthFixtures(options, tokens, services)).rejects.toThrow(
      /^OAuth fixture preparation/,
    );
    expect(Date.now).toBe(clock);
    expect(existsSync(options.file)).toBe(true);
    expect(await cleanupOAuthFixtures(options, db, { subjectHashes })).toMatchObject({
      success: true,
      clientsDeleted: 1,
      grantsDeleted: 1,
      residuals: 0,
    });
    expect(db.raw.prepare("SELECT * FROM oauth_store").all()).toEqual([]);
  });

  it("rejects an altered cleanup manifest before deleting any row", async () => {
    const { db, options, services } = context();
    await setupOAuthFixtures(options, tokens, services);
    const raw = JSON.parse(readFileSync(options.file, "utf8")) as {
      cleanup: { grants: { id: string }[] };
    };
    raw.cleanup.grants[0]!.id = "x".repeat(16);
    writeFileSync(options.file, JSON.stringify(raw));
    const before = db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all();
    await expect(cleanupOAuthFixtures(options, db, { subjectHashes })).rejects.toThrow(
      /^OAuth fixture preparation/,
    );
    expect(db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all()).toEqual(before);
  });

  it("rejects foreign metadata on an expired grant before deleting any valid fixture", async () => {
    const { db, options, services } = context();
    const bundle = await setupOAuthFixtures(options, tokens, services);
    const grantId = bundle.fixtures.expired.accessToken.split(":")[1]!;
    const key = `grant:${encodeURIComponent(subjects[0]!)}:${grantId}`;
    const stored = db.raw.prepare("SELECT value FROM oauth_store WHERE key = ?").get(key) as {
      value: string;
    };
    const grant = JSON.parse(stored.value) as { metadata: { fixtureRunId: string } };
    grant.metadata.fixtureRunId = "other-run";
    db.raw
      .prepare("UPDATE oauth_store SET value = ? WHERE key = ?")
      .run(JSON.stringify(grant), key);
    const before = db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all();
    await expect(cleanupOAuthFixtures(options, db, { subjectHashes })).rejects.toThrow(
      /^OAuth fixture preparation/,
    );
    expect(db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all()).toEqual(before);
    expect(db.raw.prepare("SELECT * FROM app_uses").all()).toEqual([]);
  });

  it("recovers one lost DCR response by exact nonce name and preserves a similar name", async () => {
    const { db, options, services, store } = context();
    const bundle = await setupOAuthFixtures(options, tokens, services);
    const helpers = await fixtureHelpers(origin, store);
    const client = await helpers.createClient({
      clientName: `${FIXTURE_CLIENT_PREFIX}${bundle.runId}-registration`,
      redirectUris: ["http://127.0.0.1:33418/callback"],
      tokenEndpointAuthMethod: "none",
    });
    const unrelated = await helpers.createClient({
      clientName: `${FIXTURE_CLIENT_PREFIX}${bundle.runId}-registration-other`,
      redirectUris: ["http://127.0.0.1:33418/callback"],
      tokenEndpointAuthMethod: "none",
    });
    // The first response was lost: no unprivileged sidecar exists.
    expect(await cleanupOAuthFixtures(options, db, { subjectHashes })).toMatchObject({
      success: true,
      clientsDeleted: 5,
      residuals: 0,
    });
    expect(await helpers.lookupClient(client.clientId)).toBeNull();
    expect(await helpers.lookupClient(unrelated.clientId)).not.toBeNull();
  });

  it("does not delete a registration client that unexpectedly acquired a grant", async () => {
    const { db, options, services, store } = context();
    const bundle = await setupOAuthFixtures(options, tokens, services);
    const helpers = await fixtureHelpers(origin, store);
    const clientName = `${FIXTURE_CLIENT_PREFIX}${bundle.runId}-registration`;
    const client = await helpers.createClient({
      clientName,
      redirectUris: ["http://127.0.0.1:33418/callback"],
      tokenEndpointAuthMethod: "none",
    });
    recordFixtureClient(options.file, origin, { clientId: client.clientId, clientName });
    await store.put(
      "grant:synthetic-other:unexpectedgrant0",
      JSON.stringify({ clientId: client.clientId }),
    );
    const before = db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all();
    await expect(cleanupOAuthFixtures(options, db, { subjectHashes })).rejects.toThrow(
      /^OAuth fixture preparation/,
    );
    expect(db.raw.prepare("SELECT * FROM oauth_store ORDER BY key").all()).toEqual(before);
  });

  it("refuses real-identity mismatches and a mismatched environment before remote writes", async () => {
    const { db, options, services } = context();
    await expect(
      setupOAuthFixtures(options, tokens, { ...services, subjectHashes: undefined }),
    ).rejects.toThrow(/^OAuth fixture preparation/);
    await expect(
      setupOAuthFixtures({ ...options, origin: FIXTURE_ORIGINS.production }, tokens, services),
    ).rejects.toThrow(/^OAuth fixture preparation/);
    expect(db.raw.prepare("SELECT * FROM oauth_store").all()).toEqual([]);
    expect(existsSync(options.file)).toBe(false);
    expect(await cleanupOAuthFixtures(options, db)).toMatchObject({
      success: true,
      residuals: 0,
      keysDeleted: 0,
    });
  });
});

describe("fixture transport and private boundary", () => {
  it.each(["journal", "sidecar", "hardlink", "symlink", "parent-alias"] as const)(
    "refuses summary %s aliases before any writes or remote credentials are needed",
    (kind) => {
      const directory = privateDirectory();
      const file = join(directory, "fixture.json");
      const receipt = file + ".registration.json";
      writeFileSync(file, "synthetic-journal-preserved", { mode: 0o600 });
      writeFileSync(receipt, "synthetic-receipt-preserved", { mode: 0o600 });
      let summary = file;
      if (kind === "sidecar") summary = receipt;
      if (kind === "hardlink") {
        summary = join(directory, "summary.json");
        linkSync(file, summary);
      }
      if (kind === "symlink") {
        summary = join(directory, "summary.json");
        symlinkSync(receipt, summary, "file");
      }
      if (kind === "parent-alias") {
        const alias = join(directory, "alias");
        symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
        summary = join(alias, "fixture.json.registration.json");
      }
      const result = spawnSync(
        process.execPath,
        [
          "--conditions=@meltemi/diagrams-source",
          "--import",
          "tsx",
          join(repo, "packages/acceptance/src/mcp/oauth-fixtures-cli.ts"),
          "cleanup",
          "--environment",
          "staging",
          "--file",
          file,
          "--summary",
          summary,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            SystemRoot: process.env["SystemRoot"],
            PATH: process.env["PATH"],
            TEMP: process.env["TEMP"],
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("fixture.output_path");
      expect(result.stdout).not.toContain("zero records changed");
      expect(readFileSync(file, "utf8")).toBe("synthetic-journal-preserved");
      expect(readFileSync(receipt, "utf8")).toBe("synthetic-receipt-preserved");
    },
  );

  it.each(["file", "directory", "dangling"] as const)(
    "fails closed without a signed journal when a DCR %s remains",
    async (kind) => {
      const { options, db } = context();
      const sidecar = options.file + ".registration.json";
      if (kind === "file")
        writeFileSync(sidecar, "synthetic-registration-receipt", { mode: 0o600 });
      else if (kind === "directory") mkdirSync(sidecar);
      else
        symlinkSync(
          join(dirname(options.file), "missing-target"),
          sidecar,
          process.platform === "win32" ? "junction" : "file",
        );
      await expect(cleanupOAuthFixtures(options, db)).rejects.toThrow(/^OAuth fixture preparation/);
      const summary = join(privateDirectory(), "cleanup-summary.json");
      const result = spawnSync(
        process.execPath,
        [
          "--conditions=@meltemi/diagrams-source",
          "--import",
          "tsx",
          join(repo, "packages/acceptance/src/mcp/oauth-fixtures-cli.ts"),
          "cleanup",
          "--environment",
          "staging",
          "--file",
          options.file,
          "--summary",
          summary,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            SystemRoot: process.env["SystemRoot"],
            PATH: process.env["PATH"],
            TEMP: process.env["TEMP"],
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("zero records changed");
      expect(result.stderr).toContain("fixture.cleanup_validate");
      if (kind === "file")
        expect(readFileSync(sidecar, "utf8")).toBe("synthetic-registration-receipt");
      else if (kind === "directory") expect(lstatSync(sidecar).isDirectory()).toBe(true);
      else expect(lstatSync(sidecar).isSymbolicLink()).toBe(true);
      expect(existsSync(options.file)).toBe(false);
      expect(JSON.parse(readFileSync(summary, "utf8"))).toEqual({
        format: 1,
        environment: "staging",
        success: false,
        residuals: null,
        phase: "fixture.cleanup_validate",
      });
      expect(db.raw.prepare("SELECT * FROM oauth_store").all()).toEqual([]);
    },
  );

  it("binds fixed D1 metadata and SQL parameters, and hides failed response bodies", async () => {
    const requests: { url: string; body?: unknown }[] = [];
    const connection = {
      accountId: "a".repeat(32),
      databaseId: "00000000-0000-0000-0000-000000000000",
      databaseName: "meltemi-diagrams-staging",
      token: "never-log-this-token",
    };
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
      });
      expect(init?.redirect).toBe("manual");
      return Response.json({
        success: true,
        result: init?.body
          ? [{ success: true, results: [{ email: "synthetic@example.invalid" }] }]
          : { uuid: connection.databaseId, name: connection.databaseName },
      });
    };
    const remote = remoteD1(connection, fetcher);
    await remote.verify();
    expect(
      await remote.db
        .prepare("SELECT email FROM users WHERE sub = ?")
        .bind("untrusted' SQL --")
        .first(),
    ).toEqual({ email: "synthetic@example.invalid" });
    expect(requests[1]!.body).toEqual({
      sql: "SELECT email FROM users WHERE sub = ?",
      params: ["untrusted' SQL --"],
    });
    expect(() => remote.db.prepare("DELETE FROM users WHERE sub = ?")).toThrow(
      /^OAuth fixture preparation/,
    );
    const failed = remoteD1(
      connection,
      async () => new Response("credential-in-response", { status: 403 }),
    );
    await expect(failed.verify()).rejects.toThrow(/^OAuth fixture preparation/);
    const mismatch = remoteD1(connection, async () =>
      Response.json({
        success: true,
        result: { uuid: connection.databaseId, name: "meltemi-diagrams" },
      }),
    );
    await expect(mismatch.verify()).rejects.toThrow(/^OAuth fixture preparation/);
  });

  it("keeps credentials discoverable for redaction even before malformed input is rejected", () => {
    const raw = {
      fixtures: {
        normal: { accessToken: "sensitive-access", refreshToken: "sensitive-refresh" },
        unrelated: "not-a-credential",
      },
    };
    expect(fixtureSecrets(raw)).toEqual(["sensitive-access", "sensitive-refresh"]);
    expect(() => parseOAuthFixtures(raw, origin)).toThrow(/^OAuth fixture preparation/);
    expect(() => fixtureFilePath(join(repo, ".test-output", "private.json"))).toThrow(
      /^OAuth fixture preparation/,
    );
  });

  it("loads and executes the official provider under this Node version without runtime product handlers", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=@meltemi/diagrams-source",
        "--import",
        "tsx",
        join(repo, "packages/acceptance/src/mcp/oauth-fixtures-cli.ts"),
        "--self-check",
      ],
      {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          SystemRoot: process.env["SystemRoot"],
          PATH: process.env["PATH"],
          TEMP: process.env["TEMP"],
        },
      },
    );
    expect(output).toBe(
      "OAuth fixture Node runtime probe passed (isolated in-memory provider only).\n",
    );
    expect(output).not.toMatch(/mdg_|access_token|refresh_token/);
  });
});
