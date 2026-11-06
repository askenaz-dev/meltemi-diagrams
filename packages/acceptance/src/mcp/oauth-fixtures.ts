// Privileged fixture lifecycle. No entrypoint or authentication change is deployed with this tool.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Like } from "../../../cloud/src/env.js";
import { d1OAuthStore, prefixEnd, type KVLike } from "../../../cloud/src/oauth/store.js";
import { userIdOf } from "../../../cloud/src/oauth/settings.js";
import { Agent } from "./agent.js";
import {
  FIXTURE_CLIENT_PREFIX,
  FIXTURE_KINDS,
  FIXTURE_ORIGINS,
  fixtureFailure,
  parseOAuthFixtures,
  type FixtureEnvironment,
  type OAuthFixtures,
  type OAuthFixtureToken,
} from "./oauth-fixture-format.js";
import { fixtureHelpers, issueOAuthFixture } from "./oauth-fixtures-provider.js";
import {
  assertPrivateFixtureFile,
  fixturePathPresent,
  writeNewPrivateFixtureFile,
} from "./oauth-fixtures-private-file.js";
import {
  readFixtureRegistrations,
  removeFixtureRegistrations,
} from "./oauth-fixture-registration.js";

// Approved fixture identities, attested independently by the operator. No emails or account IDs
// are published. Key rotation preserves these identities; changing either requires source review.
export const TEST_SUB_HASHES = [
  "349328d550a22999898b47e70fd92bb90ef7c043f5afe793b69908a328f7de41",
  "744ab46d35af4aa3deb927e1890ad3c2c4029fdcda810aeef1b732c90f5aa8b1",
] as const;
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SQL_USER = "SELECT email FROM users WHERE sub = ?";
const SQL_KEY = "SELECT key FROM oauth_store WHERE key = ?";
const SQL_VALUE = "SELECT value FROM oauth_store WHERE key = ?";
const SQL_TOKENS =
  "SELECT key, value FROM oauth_store WHERE key >= ? AND key < ? ORDER BY key LIMIT ?";
const SQL_FORGET_APP = "DELETE FROM app_uses WHERE sub = ? AND grant_id = ?";
const SQL_APP = "SELECT grant_id FROM app_uses WHERE sub = ? AND grant_id = ?";
const SQL_REGISTRATION =
  "SELECT key, value FROM oauth_store WHERE key >= ? AND key < ? AND json_extract(value, '$.clientName') = ? ORDER BY key LIMIT ?";
const SQL_CLIENT_GRANTS =
  "SELECT key FROM oauth_store WHERE key >= ? AND key < ? AND json_extract(value, '$.clientId') = ? ORDER BY key LIMIT ?";

interface Grant {
  id: string;
  userId: string;
  clientId: string;
}
interface Journal {
  format: 1;
  environment: FixtureEnvironment;
  origin: string;
  runId: string;
  startedAt: number;
  firstSub: string;
  secondSub: string;
  fixtures: Partial<Record<(typeof FIXTURE_KINDS)[number], OAuthFixtureToken>>;
  cleanup: { clientIds: string[]; grants: Grant[]; keys: string[] };
  journalMac?: string;
}
export type FixturePhase =
  | "fixture.arguments"
  | "fixture.output_path"
  | "fixture.runtime"
  | "fixture.database_metadata"
  | "fixture.identity"
  | "fixture.grant_prepare"
  | "fixture.public_exchange"
  | "fixture.cleanup_validate"
  | "fixture.cleanup_delete"
  | "fixture.cleanup_verify";
export interface FixtureOptions {
  environment: FixtureEnvironment;
  origin: string;
  file: string;
  journalKey: string;
  onPhase?: (phase: FixturePhase) => void;
}
export interface FixtureServices {
  db: D1Like;
  /** Unit-test dependency injection only; the CLI always uses the reviewed constant allowlist. */
  subjectHashes?: readonly string[];
  whoami(token: string): Promise<{ sub: string; email: string }>;
  exchange(origin: string, form: URLSearchParams): Promise<Response>;
}
export interface CleanupSummary {
  format: 1;
  environment: FixtureEnvironment;
  success: boolean;
  clientsDeleted: number;
  grantsDeleted: number;
  keysDeleted: number;
  residuals: number;
}

export function fixtureFilePath(path: string): string {
  const file = resolve(path);
  const fromRoot = relative(ROOT, file);
  if (
    (!fromRoot.startsWith(".." + sep) && !isAbsolute(fromRoot)) ||
    file.split(/[\\/]/).includes(".test-output")
  )
    fixtureFailure();
  if (fixturePathPresent(file) && (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()))
    fixtureFailure();
  // Resolve the existing parent to reject a symlink that leads back into the source/results tree.
  const parent = realpathSync(dirname(file));
  const actual = resolve(parent, file.slice(dirname(file).length + 1));
  const actualRelative = relative(ROOT, actual);
  if (
    (!actualRelative.startsWith(".." + sep) && !isAbsolute(actualRelative)) ||
    actual.split(/[\\/]/).includes(".test-output")
  )
    fixtureFailure();
  return actual;
}

function checkOptions(options: FixtureOptions): void {
  if (
    !Object.hasOwn(FIXTURE_ORIGINS, options.environment) ||
    FIXTURE_ORIGINS[options.environment] !== options.origin ||
    !options.journalKey
  )
    fixtureFailure();
}
function mac(journal: Journal, key: string): string {
  const { journalMac: _ignored, ...unsigned } = journal;
  return createHmac("sha256", key)
    .update("mcp-oauth-fixture-journal-v1\n")
    .update(JSON.stringify(unsigned))
    .digest("hex");
}
function save(file: string, journal: Journal, key: string, initial = false): void {
  journal.journalMac = mac(journal, key);
  if (initial) {
    writeNewPrivateFixtureFile(file, JSON.stringify(journal));
    return;
  }
  if (lstatSync(file).isSymbolicLink()) fixtureFailure();
  const temporary = `${file}.${journal.runId}.tmp`;
  try {
    writeNewPrivateFixtureFile(temporary, JSON.stringify(journal));
    renameSync(temporary, file);
  } finally {
    if (fixturePathPresent(temporary)) unlinkSync(temporary);
  }
}

function approvedSubjects(
  firstSub: string,
  secondSub: string,
  hashes: readonly string[] = TEST_SUB_HASHES,
): void {
  if (
    !firstSub ||
    !secondSub ||
    firstSub === secondSub ||
    firstSub.length > 512 ||
    secondSub.length > 512
  )
    fixtureFailure();
  if (
    [firstSub, secondSub].some(
      (sub, index) => createHash("sha256").update(sub).digest("hex") !== hashes[index],
    )
  )
    fixtureFailure();
}
async function verifyUsers(
  db: D1Like,
  firstSub: string,
  secondSub: string,
  expectedEmails?: readonly string[],
  hashes?: readonly string[],
): Promise<void> {
  approvedSubjects(firstSub, secondSub, hashes);
  const emails: string[] = [];
  for (const sub of [firstSub, secondSub]) {
    const row = await db.prepare(SQL_USER).bind(sub).first<{ email: string }>();
    if (!row || typeof row.email !== "string") fixtureFailure();
    emails.push(row.email.toLowerCase());
  }
  if (
    emails.some((email) => !email) ||
    (expectedEmails &&
      emails.some((email, index) => email !== expectedEmails[index]?.toLowerCase()))
  )
    fixtureFailure();
}

/** Verify the exact live principals before any write, without taking a browser session. */
export async function fixtureWhoami(
  origin: string,
  token: string,
): Promise<{ sub: string; email: string }> {
  let agent: Agent | undefined;
  try {
    agent = await Agent.connect({ origin, endpoint: origin + "/mcp" }, token);
    const answer = await agent.ok("whoami");
    if (typeof answer["sub"] !== "string" || typeof answer["email"] !== "string")
      return fixtureFailure();
    return { sub: answer["sub"], email: answer["email"] };
  } catch {
    return fixtureFailure();
  } finally {
    await agent?.close();
  }
}

/** Every key is journaled durably before its first write, including incomplete setup recovery. */
function ownedStore(db: D1Like, journal: Journal, persist: () => void): KVLike {
  const store = d1OAuthStore(db);
  const userId = userIdOf(journal.firstSub);
  function owned(key: string): boolean {
    return (
      journal.cleanup.keys.includes(key) ||
      journal.cleanup.grants.some(
        (grant) =>
          key === `grant:${grant.userId}:${grant.id}` ||
          key.startsWith(`token:${grant.userId}:${grant.id}:`),
      )
    );
  }
  return {
    get: (key, options) => store.get(key, options),
    list: (options) => store.list(options),
    async delete(key) {
      if (!owned(key)) fixtureFailure();
      await store.delete(key);
    },
    async put(key, value, options) {
      const row = JSON.parse(value) as Record<string, unknown>;
      if (key.startsWith("client:")) {
        const id = key.slice(7);
        if (
          !/^[A-Za-z0-9_-]{16}$/.test(id) ||
          row["clientId"] !== id ||
          typeof row["clientName"] !== "string" ||
          !FIXTURE_KINDS.some(
            (kind) => row["clientName"] === `${FIXTURE_CLIENT_PREFIX}${journal.runId}-${kind}`,
          ) ||
          row["tokenEndpointAuthMethod"] !== "none"
        )
          fixtureFailure();
        if (!journal.cleanup.clientIds.includes(id)) {
          if (
            journal.cleanup.clientIds.length >= 4 ||
            (await db.prepare(SQL_KEY).bind(key).first())
          )
            fixtureFailure();
          journal.cleanup.clientIds.push(id);
        }
      } else if (key.startsWith(`grant:${userId}:`)) {
        const id = key.slice(`grant:${userId}:`.length);
        const metadata = row["metadata"] as { fixtureRunId?: string } | undefined;
        if (
          !/^[A-Za-z0-9_-]{16}$/.test(id) ||
          row["id"] !== id ||
          row["userId"] !== userId ||
          typeof row["clientId"] !== "string" ||
          !journal.cleanup.clientIds.includes(row["clientId"]) ||
          metadata?.fixtureRunId !== journal.runId
        )
          fixtureFailure();
        if (!journal.cleanup.grants.some((grant) => grant.id === id)) {
          if (journal.cleanup.grants.length >= 4 || (await db.prepare(SQL_KEY).bind(key).first()))
            fixtureFailure();
          journal.cleanup.grants.push({ id, userId, clientId: row["clientId"] });
        }
      } else if (key.startsWith(`token:${userId}:`)) {
        if (
          !owned(key) ||
          row["userId"] !== userId ||
          !journal.cleanup.grants.some((grant) => grant.id === row["grantId"])
        )
          fixtureFailure();
      } else fixtureFailure();
      if (!journal.cleanup.keys.includes(key)) {
        if (journal.cleanup.keys.length >= 32) fixtureFailure();
        journal.cleanup.keys.push(key);
      }
      persist();
      await store.put(key, value, options);
    },
  };
}

export async function setupOAuthFixtures(
  options: FixtureOptions,
  tokens: { first: string; second: string },
  services: FixtureServices,
): Promise<OAuthFixtures> {
  checkOptions(options);
  const file = fixtureFilePath(options.file);
  if (
    fixturePathPresent(file) ||
    !/^mdg_[A-Za-z0-9_-]{43}$/.test(tokens.first) ||
    !/^mdg_[A-Za-z0-9_-]{43}$/.test(tokens.second) ||
    tokens.first === tokens.second
  )
    fixtureFailure();
  options.onPhase?.("fixture.identity");
  const people = [];
  for (const token of [tokens.first, tokens.second]) people.push(await services.whoami(token));
  approvedSubjects(people[0]!.sub, people[1]!.sub, services.subjectHashes);
  await verifyUsers(
    services.db,
    people[0]!.sub,
    people[1]!.sub,
    people.map((person) => person.email),
    services.subjectHashes,
  );
  const journal: Journal = {
    format: 1,
    environment: options.environment,
    origin: options.origin,
    runId: randomBytes(12).toString("hex"),
    startedAt: Date.now(),
    firstSub: people[0]!.sub,
    secondSub: people[1]!.sub,
    fixtures: {},
    cleanup: { clientIds: [], grants: [], keys: [] },
  };
  save(file, journal, options.journalKey, true);
  const store = ownedStore(services.db, journal, () => save(file, journal, options.journalKey));
  try {
    for (const kind of FIXTURE_KINDS) {
      options.onPhase?.("fixture.grant_prepare");
      journal.fixtures[kind] = await issueOAuthFixture({
        kind,
        origin: options.origin,
        sub: journal.firstSub,
        runId: journal.runId,
        store,
        exchange: services.exchange,
      });
      save(file, journal, options.journalKey);
    }
    return parseOAuthFixtures(journal, options.origin);
  } catch {
    // Leave the private journal for unconditional cleanup, including setup that failed midway.
    return fixtureFailure();
  }
}

function readJournal(file: string, options: FixtureOptions): Journal {
  assertPrivateFixtureFile(file);
  if (
    lstatSync(file).size > 128 * 1024 ||
    (process.platform !== "win32" && (lstatSync(file).mode & 0o077) !== 0)
  )
    fixtureFailure();
  const value = JSON.parse(readFileSync(file, "utf8")) as Journal;
  if (
    typeof value.journalMac !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.journalMac) ||
    !timingSafeEqual(
      Buffer.from(value.journalMac, "hex"),
      Buffer.from(mac(value, options.journalKey), "hex"),
    )
  )
    fixtureFailure();
  if (
    value.format !== 1 ||
    value.environment !== options.environment ||
    value.origin !== options.origin ||
    !/^[a-f0-9]{24}$/.test(value.runId) ||
    !Number.isSafeInteger(value.startedAt) ||
    value.startedAt <= 0 ||
    typeof value.firstSub !== "string" ||
    typeof value.secondSub !== "string" ||
    !Array.isArray(value.cleanup?.clientIds) ||
    !Array.isArray(value.cleanup.grants) ||
    !Array.isArray(value.cleanup.keys) ||
    value.cleanup.clientIds.length > 4 ||
    value.cleanup.grants.length > 4 ||
    value.cleanup.keys.length > 32 ||
    new Set(value.cleanup.clientIds).size !== value.cleanup.clientIds.length ||
    !value.cleanup.clientIds.every(
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{16}$/.test(id),
    ) ||
    !value.cleanup.grants.every(
      (grant) =>
        grant &&
        /^[A-Za-z0-9_-]{16}$/.test(grant.id) &&
        grant.userId === userIdOf(value.firstSub) &&
        value.cleanup.clientIds.includes(grant.clientId),
    )
  )
    fixtureFailure();
  const owned = (key: string) =>
    value.cleanup.clientIds.some((id) => key === `client:${id}`) ||
    value.cleanup.grants.some(
      (grant) =>
        key === `grant:${grant.userId}:${grant.id}` ||
        new RegExp(
          `^token:${grant.userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${grant.id}:[a-f0-9]{64}$`,
        ).test(key),
    );
  if (!value.cleanup.keys.every((key) => typeof key === "string" && owned(key))) fixtureFailure();
  return value;
}

export async function cleanupOAuthFixtures(
  options: FixtureOptions,
  db: D1Like,
  validation: Pick<FixtureServices, "subjectHashes"> = {},
): Promise<CleanupSummary> {
  options.onPhase?.("fixture.cleanup_validate");
  checkOptions(options);
  const file = fixtureFilePath(options.file);
  const summary: CleanupSummary = {
    format: 1,
    environment: options.environment,
    success: true,
    clientsDeleted: 0,
    grantsDeleted: 0,
    keysDeleted: 0,
    residuals: 0,
  };
  if (!fixturePathPresent(file)) {
    if (fixturePathPresent(file + ".registration.json")) fixtureFailure();
    return summary;
  }
  const journal = readJournal(file, options);
  await verifyUsers(db, journal.firstSub, journal.secondSub, undefined, validation.subjectHashes);
  const store = d1OAuthStore(db);
  const registrations = readFixtureRegistrations(file, options.origin, journal.runId);
  if (registrations.length > 1) fixtureFailure();
  const registrationName = `${FIXTURE_CLIENT_PREFIX}${journal.runId}-registration`;
  const recovered = await db
    .prepare(SQL_REGISTRATION)
    .bind("client:", prefixEnd("client:"), registrationName, 2)
    .all<{ key: string; value: string }>();
  if (recovered.results.length > 1) fixtureFailure();
  const registrationIds = [
    ...new Set([
      ...registrations.map((registration) => registration.clientId),
      ...recovered.results.map((row) => row.key.slice(7)),
    ]),
  ];
  if (registrationIds.length > 1 || registrationIds.some((id) => !/^[A-Za-z0-9_-]{16}$/.test(id)))
    fixtureFailure();
  const allClientIds = [...journal.cleanup.clientIds, ...registrationIds];
  if (allClientIds.length !== new Set(allClientIds).size) fixtureFailure();
  async function rawValue(key: string): Promise<Record<string, unknown> | null> {
    const row = await db.prepare(SQL_VALUE).bind(key).first<{ value: string }>();
    return row ? (JSON.parse(row.value) as Record<string, unknown>) : null;
  }
  // Prevalidate all records, including expired ones, before any deletion.
  const existingKeys = new Set<string>();
  for (const id of allClientIds) {
    const row = await rawValue(`client:${id}`);
    if (row) {
      summary.clientsDeleted++;
      existingKeys.add(`client:${id}`);
    }
    const expectedNames = registrationIds.includes(id)
      ? [`${FIXTURE_CLIENT_PREFIX}${journal.runId}-registration`]
      : FIXTURE_KINDS.map((kind) => `${FIXTURE_CLIENT_PREFIX}${journal.runId}-${kind}`);
    if (
      row &&
      (row["clientId"] !== id ||
        !expectedNames.includes(String(row["clientName"])) ||
        row["tokenEndpointAuthMethod"] !== "none")
    )
      fixtureFailure();
    if (row && registrationIds.includes(id)) {
      if (
        !Array.isArray(row["redirectUris"]) ||
        row["redirectUris"].length !== 1 ||
        row["redirectUris"][0] !== "http://127.0.0.1:33418/callback" ||
        typeof row["registrationDate"] !== "number" ||
        row["registrationDate"] < Math.floor(journal.startedAt / 1000)
      )
        fixtureFailure();
      const grants = await db
        .prepare(SQL_CLIENT_GRANTS)
        .bind("grant:", prefixEnd("grant:"), id, 1)
        .all();
      if (grants.results.length > 0) fixtureFailure();
    }
  }
  const keys = new Set(journal.cleanup.keys);
  for (const id of registrationIds) keys.add(`client:${id}`);
  for (const grant of journal.cleanup.grants) {
    const row = await rawValue(`grant:${grant.userId}:${grant.id}`);
    if (row) {
      summary.grantsDeleted++;
      existingKeys.add(`grant:${grant.userId}:${grant.id}`);
    }
    if (
      row &&
      (row["id"] !== grant.id ||
        row["userId"] !== grant.userId ||
        row["clientId"] !== grant.clientId ||
        (row["metadata"] as { fixtureRunId?: string } | undefined)?.fixtureRunId !== journal.runId)
    )
      fixtureFailure();
    const prefix = `token:${grant.userId}:${grant.id}:`;
    const rows = await db
      .prepare(SQL_TOKENS)
      .bind(prefix, prefixEnd(prefix), 101)
      .all<{ key: string; value: string }>();
    if (rows.results.length > 100 || rows.results.some((row) => !row.key.startsWith(prefix)))
      fixtureFailure();
    for (const token of rows.results) {
      const data = JSON.parse(token.value) as {
        userId?: unknown;
        grantId?: unknown;
        grant?: { clientId?: unknown };
      };
      if (
        data.userId !== grant.userId ||
        data.grantId !== grant.id ||
        data.grant?.clientId !== grant.clientId
      )
        fixtureFailure();
      keys.add(token.key);
      existingKeys.add(token.key);
    }
    keys.add(`grant:${grant.userId}:${grant.id}`);
  }
  const helpers = await fixtureHelpers(options.origin, store);
  options.onPhase?.("fixture.cleanup_delete");
  for (const grant of journal.cleanup.grants) {
    await helpers.revokeGrant(grant.id, grant.userId);
    await db.prepare(SQL_FORGET_APP).bind(journal.firstSub, grant.id).run();
  }
  for (const key of keys) await store.delete(key);
  options.onPhase?.("fixture.cleanup_verify");
  for (const key of keys) if (await db.prepare(SQL_KEY).bind(key).first()) summary.residuals++;
  for (const grant of journal.cleanup.grants) {
    const prefix = `token:${grant.userId}:${grant.id}:`;
    summary.residuals += (
      await db.prepare(SQL_TOKENS).bind(prefix, prefixEnd(prefix), 101).all()
    ).results.length;
    if (await db.prepare(SQL_APP).bind(journal.firstSub, grant.id).first()) summary.residuals++;
  }
  if (summary.residuals !== 0) fixtureFailure();
  summary.keysDeleted = existingKeys.size;
  unlinkSync(file);
  removeFixtureRegistrations(file);
  return summary;
}
