// An unprivileged DCR receipt, distinct from the HMAC-protected privileged cleanup journal.
import { lstatSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import {
  FIXTURE_CLIENT_PREFIX,
  fixtureFailure,
  parseOAuthFixtures,
} from "./oauth-fixture-format.js";
import {
  assertPrivateFixtureFile,
  fixturePathPresent,
  writeNewPrivateFixtureFile,
} from "./oauth-fixtures-private-file.js";

export interface FixtureRegistration {
  clientId: string;
  clientName: string;
}
const sidecar = (file: string) => file + ".registration.json";

export function readFixtureRegistrations(
  file: string,
  origin: string,
  runId: string,
): FixtureRegistration[] {
  const path = sidecar(file);
  if (!fixturePathPresent(path)) return [];
  try {
    assertPrivateFixtureFile(path);
    if (lstatSync(path).size > 8 * 1024) return fixtureFailure();
    const value = JSON.parse(readFileSync(path, "utf8")) as {
      format?: unknown;
      origin?: unknown;
      runId?: unknown;
      clients?: FixtureRegistration[];
    };
    if (
      value.format !== 1 ||
      value.origin !== origin ||
      value.runId !== runId ||
      !Array.isArray(value.clients) ||
      value.clients.length > 8 ||
      value.clients.some(
        (client) =>
          !client ||
          !/^[A-Za-z0-9_-]{16}$/.test(client.clientId) ||
          client.clientName !== `${FIXTURE_CLIENT_PREFIX}${runId}-registration`,
      ) ||
      new Set(value.clients.map((client) => client.clientId)).size !== value.clients.length
    )
      return fixtureFailure();
    return value.clients;
  } catch {
    return fixtureFailure();
  }
}

export function recordFixtureClient(
  file: string,
  origin: string,
  client: FixtureRegistration,
): void {
  try {
    assertPrivateFixtureFile(file);
    if (lstatSync(file).size > 128 * 1024) fixtureFailure();
    const fixtures = parseOAuthFixtures(JSON.parse(readFileSync(file, "utf8")) as unknown, origin);
    if (
      !/^[A-Za-z0-9_-]{16}$/.test(client.clientId) ||
      client.clientName !== `${FIXTURE_CLIENT_PREFIX}${fixtures.runId}-registration`
    )
      fixtureFailure();
    const clients = readFixtureRegistrations(file, origin, fixtures.runId);
    if (clients.some((existing) => existing.clientId === client.clientId)) return;
    if (clients.length >= 8 || fixtures.cleanup.clientIds.includes(client.clientId))
      fixtureFailure();
    clients.push(client);
    const path = sidecar(file);
    const temporary = path + ".tmp";
    try {
      writeNewPrivateFixtureFile(
        temporary,
        JSON.stringify({ format: 1, origin, runId: fixtures.runId, clients }),
      );
      renameSync(temporary, path);
    } finally {
      if (fixturePathPresent(temporary)) unlinkSync(temporary);
    }
  } catch {
    fixtureFailure();
  }
}

export function removeFixtureRegistrations(file: string): void {
  if (fixturePathPresent(sidecar(file))) {
    assertPrivateFixtureFile(sidecar(file));
    unlinkSync(sidecar(file));
  }
}
