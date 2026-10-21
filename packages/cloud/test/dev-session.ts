// `pnpm cloud:dev-session`: somebody signed in for the Worker running on this computer, with no
// identity service. It prepares `packages/cloud/.dev.vars` (development mode, an inline key set,
// the two secrets) and prints, for two people, the line to paste in the browser's console to be
// them. Ignored by Git: `.dev.vars*` holds only development values, and the keys are kept in
// `.dev.vars.keys.json` so that a second run signs sessions the Worker still accepts.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signSessionToken, testJwks, testKeys, type TestKeys } from "@meltemi/identity/testing";

const FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..");
const VARS = join(FOLDER, ".dev.vars");
const KEYS = join(FOLDER, ".dev.vars.keys.json");

/** Where the Worker listens (`wrangler.jsonc`, `dev.port`) and where the identity service would. */
const WORKER = "http://localhost:8788";
const ISSUER = "http://localhost:8787";

const PEOPLE = [
  { sub: "dev-ana", name: "Ana", email: "ana@example.com" },
  { sub: "dev-ben", name: "Ben", email: "ben@example.com" },
] as const;

async function keys(): Promise<TestKeys> {
  if (existsSync(KEYS)) return JSON.parse(readFileSync(KEYS, "utf8")) as TestKeys;
  const made = await testKeys();
  writeFileSync(KEYS, `${JSON.stringify(made)}\n`, "utf8");
  return made;
}

/** The text of `.dev.vars` with these settings set: others are kept, secrets only when missing. */
function withSettings(
  text: string,
  settings: Readonly<Record<string, string>>,
  onlyIfMissing: readonly string[],
): string {
  const lines = text === "" ? [] : text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  for (const [name, value] of Object.entries(settings)) {
    const index = lines.findIndex((line) => line.startsWith(`${name}=`));
    const present = index !== -1 && lines[index]!.slice(name.length + 1).trim() !== "";
    if (present && onlyIfMissing.includes(name)) continue;
    if (index === -1) lines.push(`${name}=${value}`);
    else lines[index] = `${name}=${value}`;
  }
  return `${lines.join("\n")}\n`;
}

const pair = await keys();
const settings = {
  DEV: "true",
  IDENTITY_ISSUER: ISSUER,
  IDENTITY_JWKS_URL: `${ISSUER}/.well-known/jwks.json`,
  IDENTITY_EVENTS_SECRET: randomBytes(24).toString("base64url"),
  FORMS_SECRET: randomBytes(24).toString("base64url"),
  IDENTITY_JWKS: JSON.stringify(testJwks(pair)),
  ADMIN_SUBS: PEOPLE[0].sub,
};
const before = existsSync(VARS) ? readFileSync(VARS, "utf8") : "";
const after = withSettings(before, settings, [
  "IDENTITY_EVENTS_SECRET",
  "FORMS_SECRET",
  "ADMIN_SUBS",
]);
if (after !== before) writeFileSync(VARS, after, "utf8");
console.log(
  `${before === "" ? "Made" : after === before ? "Kept" : "Updated"} ${VARS}\n` +
    "(development only; ignored by Git). Start the Worker with the page built for the local\n" +
    "identity address:\n\n" +
    "  PLAYGROUND_IDENTITY=http://localhost:8787 pnpm playground:build\n" +
    "  pnpm cloud:migrate --local\n" +
    "  pnpm --filter @meltemi/diagrams-cloud run dev\n",
);

const now = new Date();
for (const person of PEOPLE) {
  const token = await signSessionToken(
    {
      sub: person.sub,
      name: person.name,
      email: person.email,
      email_verified: true,
      picture: `${WORKER}/favicon.svg`,
      iss: ISSUER,
    },
    pair,
    now,
  );
  console.log(
    `${person.name} (${person.sub}): on ${WORKER}, paste in the browser's console and reload:\n\n` +
      `  document.cookie = "meltemi_session=${token}; path=/; max-age=2592000"\n`,
  );
}
console.log(
  "Use two browser profiles (or a private window) to be Ana and Ben at the same time. The\n" +
    "identity service must not be running: it would not know these sessions. Sign in, Account and\n" +
    "Sign out belong to it; deleting the cookie is how you sign out here.",
);
