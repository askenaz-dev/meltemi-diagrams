import type { Route } from "../context.js";
import { json } from "../http.js";

/** The longest `return_to` the identity service accepts; a longer one is refused and nothing starts. */
const MAX_RETURN_TO_LENGTH = 2048;

/**
 * The page's own address for the sign-in's `return_to`: the Worker's origin plus the path and
 * query of the request's `Referer` when that is under the origin (so a project's page, which the
 * query names, comes back to itself), else the origin's root. The address is rebuilt from the
 * origin, so credentials or a fragment in a `Referer` never reach the link, and one the identity
 * service would refuse for its length falls back to the root.
 */
function pageAddress(origin: string, referer: string | null): string {
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === origin) {
        const address = `${origin}${url.pathname}${url.search}`;
        if (address.length <= MAX_RETURN_TO_LENGTH) return address;
      }
    } catch {
      // A Referer that is not an address is no Referer.
    }
  }
  return `${origin}/`;
}

/**
 * `GET /api/session`: who the page is, in one of three shapes (`cloud-accounts`). Never cached.
 * `handle` is the account's handle (`[a-z0-9-]{3,30}`) or null until it chose one.
 *
 * A cookie principal whose email the identity service verified first has every pending invitation
 * for that email turned into a membership (`project-sharing`, "Invitations": the session is where
 * "invite by email" is resolved). The email is the session token's own claim, never the cached
 * row's, and an unverified one resolves nothing: anyone can claim an address they do not own.
 */
export const sessionRoute: Route = async (ctx) => {
  const { principal, config, deps, request } = ctx;
  if (principal?.via === "cookie") {
    const { sub, profile } = principal;
    if (profile.emailVerified && profile.email !== "") {
      await deps.store.acceptInvitationsFor(
        sub,
        profile.email.toLowerCase(),
        deps.now().toISOString(),
      );
    }
    const user = await deps.store.user(sub);
    return json({
      user: { sub, name: profile.name, picture: profile.picture, handle: user?.handle ?? null },
      account: `${config.issuer}/account`,
      signOut: `${config.issuer}/logout`,
    });
  }
  if (principal?.via === "token") {
    const user = await deps.store.user(principal.sub);
    return json({
      user: {
        sub: principal.sub,
        name: user?.name ?? "",
        picture: user?.picture ?? "",
        handle: user?.handle ?? null,
      },
      token: { id: principal.tokenId, name: principal.tokenName },
    });
  }
  const returnTo = pageAddress(config.origin, request.headers.get("Referer"));
  return json({
    user: null,
    signIn: `${config.issuer}/login?return_to=${encodeURIComponent(returnTo)}`,
  });
};
