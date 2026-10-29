import type { JsonWebKeySet } from "@meltemi/identity";
import type { Env } from "./env.js";

/** What the service knows of the identity service: where it is and where its keys are. */
export interface IdentitySettings {
  readonly issuer: string;
  readonly jwksUrl: string;
  readonly dev: boolean;
  /** The inline key set; present only in development. */
  readonly inlineJwks: JsonWebKeySet | undefined;
}

/** The environment, read and checked once per request. */
export interface Config extends IdentitySettings {
  /** The service's own origin: `ORIGIN`, or the request's own in development. */
  readonly origin: string;
  readonly host: string;
  /**
   * The owners of the service: the `sub`s listed in `ADMIN_SUBS`, always administrators and the only
   * ones who invite or remove administrators (`service-administration`). Empty when it is unset.
   */
  readonly owners: ReadonlySet<string>;
  /**
   * `PUBLISH_HOST` as given, trimmed; undefined when unset or empty. It is checked only where an
   * address is built (`publishHostOf`), so a value the service cannot use costs publishing and
   * nothing else.
   */
  readonly publishHost: string | undefined;
}

/** A misconfiguration the service cannot run with; answered as an internal error. */
export class ConfigError extends Error {}

function address(name: string, value: string | undefined, dev: boolean): URL {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new ConfigError(`${name} is not an address`);
  }
  if (url.protocol !== "https:" && !(dev && url.protocol === "http:")) {
    throw new ConfigError(`${name} must be https`);
  }
  return url;
}

/** A key set is an object with a `keys` array (the identity service's own variable is a bare array). */
function isKeySet(value: unknown): value is JsonWebKeySet {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as { keys?: unknown }).keys)
  );
}

/** The identity settings alone: what the verifier is built from, once per isolate. */
export function readIdentity(env: Env): IdentitySettings {
  const dev = env.DEV === "true";
  const issuer = address("IDENTITY_ISSUER", env.IDENTITY_ISSUER, dev).href.replace(/\/+$/, "");
  const jwksUrl = address("IDENTITY_JWKS_URL", env.IDENTITY_JWKS_URL, dev).href;
  let inlineJwks: JsonWebKeySet | undefined;
  // The inline key set is a development tool: outside development it is not even read.
  if (dev && env.IDENTITY_JWKS) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.IDENTITY_JWKS);
    } catch {
      throw new ConfigError("IDENTITY_JWKS is not JSON");
    }
    // Anything else would leave every cookie anonymous without a word: say so at once.
    if (!isKeySet(parsed)) throw new ConfigError('IDENTITY_JWKS is not a key set: {"keys":[...]}');
    inlineJwks = parsed;
  }
  return { issuer, jwksUrl, dev, inlineJwks };
}

/** The owners of the service: `ADMIN_SUBS` is a comma separated list of `sub`s; unset or empty is nobody. */
function readOwners(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((sub) => sub.trim())
      .filter((sub) => sub !== ""),
  );
}

export function readConfig(env: Env, request: Request): Config {
  const identity = readIdentity(env);
  const origin = identity.dev
    ? new URL(request.url).origin
    : address("ORIGIN", env.ORIGIN, false).origin;
  const publishHost = env.PUBLISH_HOST?.trim();
  return {
    ...identity,
    origin,
    host: new URL(origin).host,
    owners: readOwners(env.ADMIN_SUBS),
    publishHost: publishHost === "" ? undefined : publishHost,
  };
}

/** A name of hosts with at least one dot: lowercase letters, digits and hyphens in labels that neither start nor end with one. */
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The domain the session cookie is shared across: the identity service's host without its first
 * label (`id.meltemi.dev` gives `meltemi.dev`), or the host itself when it has two labels or fewer.
 */
function familyDomain(issuerHost: string): string {
  const labels = issuerHost.split(".");
  return labels.length > 2 ? labels.slice(1).join(".") : issuerHost;
}

/**
 * The host that serves publications, for building their addresses, or a `ConfigError` that names the
 * variable (never its value) when there is none or it cannot be used: not a host name, the
 * service's own host, or a host under the family's domain. The last two are the rule of decision
 * 0042 made mechanical: what a person published must never be served from a host that receives the
 * session cookie, and the one configuration mistake that would break it is refused here.
 * Development has no publish host: the Worker serves publications under `/_published/` instead.
 */
export function publishHostOf(config: Config): string {
  const host = config.publishHost;
  if (host === undefined) throw new ConfigError("PUBLISH_HOST is not set");
  if (host.length > 253 || !HOST_NAME.test(host)) {
    throw new ConfigError("PUBLISH_HOST is not a host name (lowercase, no scheme, port or path)");
  }
  const family = familyDomain(new URL(config.issuer).hostname);
  if (host === config.host || host === family || host.endsWith(`.${family}`)) {
    throw new ConfigError(
      "PUBLISH_HOST must not be a host of the service or of the family's domain",
    );
  }
  return host;
}
