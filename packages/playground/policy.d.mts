/** The identity service the page signs in with unless the build is told another. */
export const DEFAULT_IDENTITY: string;

/** What `dist/api/session` holds: `{"user":null}`. */
export const ANONYMOUS_SESSION: string;

/** What `dist/_headers` holds: the two headers the cloud Worker's assets platform gives every file. */
export const PAGE_HEADERS: string;

/** The avatar hosts of the providers the identity service signs in with. */
export const AVATAR_HOSTS: readonly string[];

/**
 * The origin of the identity service the page was built for, from the text of
 * `PLAYGROUND_IDENTITY`; nothing set is the default. Throws, saying what is expected, for anything
 * that is not an `http:` or `https:` origin.
 */
export function identityOrigin(value: string | undefined): string;

/** The page's Content-Security-Policy for the identity origin `identityOrigin` gave. */
export function contentSecurityPolicy(identity: string): string;

/** The agent setup pages' Content-Security-Policy: their stylesheet and icon, nothing else. */
export function agentSetupPolicy(): string;
