// This module is deliberately safe to import in the unprivileged acceptance process.
export const FIXTURE_ORIGINS = {
  staging: "https://staging.diagrams.meltemi.dev",
  production: "https://diagrams.meltemi.dev",
} as const;

export type FixtureEnvironment = keyof typeof FIXTURE_ORIGINS;
export const FIXTURE_CLIENT_PREFIX = "mcp-acceptance-oauth-";
export const FIXTURE_KINDS = ["normal", "narrow", "expired", "wrongResource"] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export interface OAuthFixtureToken {
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly issuedAt?: number;
  readonly expiresAt?: number;
}

export interface OAuthFixtures {
  readonly format: 1;
  readonly environment: FixtureEnvironment;
  readonly origin: string;
  readonly runId: string;
  readonly firstSub: string;
  readonly secondSub: string;
  readonly fixtures: {
    readonly normal: OAuthFixtureToken & { readonly refreshToken: string };
    readonly narrow: OAuthFixtureToken;
    readonly expired: OAuthFixtureToken;
    readonly wrongResource: OAuthFixtureToken;
  };
  readonly cleanup: { readonly clientIds: readonly string[] };
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
export function fixtureFailure(): never {
  throw new Error("OAuth fixture preparation or validation failed; no credential was logged.");
}

/** Extract credentials before validation, including malformed files; never return arbitrary text. */
export function fixtureSecrets(raw: unknown): readonly string[] {
  const fixtures = record(record(raw)?.["fixtures"]);
  const secrets: string[] = [];
  for (const kind of FIXTURE_KINDS) {
    const token = record(fixtures?.[kind]);
    for (const key of ["accessToken", "refreshToken"])
      if (typeof token?.[key] === "string" && token[key] !== "") secrets.push(token[key]);
  }
  return secrets;
}

/** No diagnostics include data from this private file. */
export function parseOAuthFixtures(raw: unknown, origin: string): OAuthFixtures {
  const value = record(raw);
  if (
    !value ||
    value["format"] !== 1 ||
    !Object.hasOwn(FIXTURE_ORIGINS, String(value["environment"])) ||
    value["origin"] !== origin ||
    FIXTURE_ORIGINS[value["environment"] as FixtureEnvironment] !== origin ||
    typeof value["runId"] !== "string" ||
    !/^[a-f0-9]{24}$/.test(value["runId"]) ||
    typeof value["firstSub"] !== "string" ||
    !value["firstSub"] ||
    typeof value["secondSub"] !== "string" ||
    !value["secondSub"] ||
    value["firstSub"] === value["secondSub"]
  )
    fixtureFailure();
  const fixtures = record(value["fixtures"]);
  const ids: string[] = [];
  const tokenShape = /^[^:\s]{1,512}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{16,128}$/;
  for (const kind of FIXTURE_KINDS) {
    const item = record(fixtures?.[kind]);
    if (
      !item ||
      typeof item["clientId"] !== "string" ||
      !/^[A-Za-z0-9_-]{16}$/.test(item["clientId"]) ||
      typeof item["accessToken"] !== "string" ||
      !tokenShape.test(item["accessToken"]) ||
      (kind === "normal" && typeof item["refreshToken"] !== "string") ||
      (item["refreshToken"] !== undefined &&
        (typeof item["refreshToken"] !== "string" || !tokenShape.test(item["refreshToken"])))
    )
      fixtureFailure();
    ids.push(item["clientId"]);
  }
  const cleanup = record(value["cleanup"]);
  if (
    !Array.isArray(cleanup?.["clientIds"]) ||
    ids.length !== new Set(ids).size ||
    cleanup["clientIds"].length !== ids.length ||
    !cleanup["clientIds"].every((id) => typeof id === "string" && ids.includes(id)) ||
    new Set(cleanup["clientIds"]).size !== ids.length
  )
    fixtureFailure();
  return raw as OAuthFixtures;
}
