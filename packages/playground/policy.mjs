// What the build decides about the page's Content-Security-Policy and about its anonymous session.
// A module of its own, so that a test can read it without running the build.

/** The identity service the page signs in with unless the build is told another. */
export const DEFAULT_IDENTITY = "https://id.meltemi.dev";

/**
 * What `dist/api/session` holds: the answer a static server gives when nothing answers the API,
 * so that the page finds nobody signed in and the browser logs no 404.
 */
export const ANONYMOUS_SESSION = '{"user":null}';

/**
 * What `dist/_headers` holds: the headers the assets platform of the cloud Worker gives every file
 * of the page it serves without running the Worker. The page's own policy is a `meta` tag, which
 * cannot say who may frame it; without `frame-ancestors` any site could frame a signed-in page and
 * trick a person into pressing Revoke, Create or Sign out. The agent setup prompt names its charset:
 * without it, a client that does not assume UTF-8 (PowerShell's `Invoke-WebRequest`) reads its
 * dashes and ellipses as Latin-1 (decision 0063). A static server serves the file as a plain file,
 * with no effect on the page.
 */
export const PAGE_HEADERS = `/*
  Content-Security-Policy: frame-ancestors 'self'
  X-Content-Type-Options: nosniff
/agent-setup/prompt.md
  Content-Type: text/markdown; charset=utf-8
`;

/**
 * The origin of the identity service the page was built for, from the text of
 * `PLAYGROUND_IDENTITY`. It names a service at the root of its origin (`/login`, `/logout`), so the
 * text must be just that: an `http:` or `https:` origin, with a trailing slash at most. Nothing set
 * (or only blanks) is the default. Anything else throws, saying what is expected, before the build
 * touches a file.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
export function identityOrigin(value) {
  const text = (value ?? "").trim();
  if (text === "") return DEFAULT_IDENTITY;
  const refused = (why) =>
    new Error(
      `PLAYGROUND_IDENTITY must be the origin of the identity service, such as ${DEFAULT_IDENTITY} (${why}); got "${text}".`,
    );
  let url;
  try {
    url = new URL(text);
  } catch {
    throw refused("it is not an address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw refused("it must start with http:// or https://");
  }
  if (url.href !== `${url.origin}/`) {
    throw refused("it must have no credentials, path, query or fragment");
  }
  // The origin goes into the policy, which sits in an attribute: it must hold nothing else.
  if (!/^https?:\/\/[A-Za-z0-9.:[\]-]+$/.test(url.origin)) {
    throw refused("it holds characters that cannot be in an origin");
  }
  return url.origin;
}

/** The avatar hosts of the providers the identity service signs in with. */
export const AVATAR_HOSTS = [
  "https://avatars.githubusercontent.com",
  "https://*.googleusercontent.com",
];

/**
 * The page's Content-Security-Policy: scripts, styles, fonts and connections from its own origin
 * only; the providers' avatars as images; and forms that post to the page itself or to the identity
 * service (signing out). Signing in is a navigation, not a request, so `connect-src` stays `'self'`.
 *
 * @param {string} identity the origin `identityOrigin` gave
 * @returns {string}
 */
export function contentSecurityPolicy(identity) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${AVATAR_HOSTS.join(" ")}`,
    "font-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "base-uri 'none'",
    `form-action 'self' ${identity}`,
  ].join("; ");
}

/**
 * The agent setup pages' Content-Security-Policy (decision 0063): static pages with no script, no
 * connection and no inline style, which load their stylesheet and icon from their own origin.
 *
 * @returns {string}
 */
export function agentSetupPolicy() {
  return [
    "default-src 'none'",
    "style-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
