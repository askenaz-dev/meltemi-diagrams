import type { Route } from "../context.js";
import { json } from "../http.js";
import type { User } from "../store/types.js";
import { roleOf, type AdminRole } from "./admin.js";

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
 * The person in a signed-in answer: who they are, their handle (null until they choose one), and
 * what their account may do. An owner or an administrator is entitled to export without the
 * branding with no grant; anyone else when an administrator entitled their account.
 */
function userShape(
  sub: string,
  name: string,
  picture: string,
  user: User | undefined,
  role: AdminRole | null,
) {
  return {
    sub,
    name,
    picture,
    handle: user?.handle ?? null,
    entitlements: { unbranded: (user?.unbrandedExports ?? false) || role !== null },
  };
}

/**
 * `GET /api/session`: who the page is, in one of three shapes (`cloud-accounts`). Never cached.
 * `handle` is the account's handle (`[a-z0-9-]{3,30}`) or null until it chose one.
 * `entitlements.unbranded` says whether the account may export without the Meltemi branding.
 *
 * A cookie principal whose email the identity service verified first has every pending invitation
 * for that email turned into a membership (`project-sharing`, "Invitations": the session is where
 * "invite by email" is resolved). The email is the session token's own claim, never the cached
 * row's, and an unverified one resolves nothing: anyone can claim an address they do not own.
 *
 * The cookie shape also says what the person is to the administration of the service
 * (`user.administration`: the role, or null) and, for a person with no role, the pending invitation
 * to administer addressed to that same verified claim (`user.administrationInvitation`), which they
 * accept or decline in the account panel; signing in alone makes nobody an administrator.
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
    const role = await roleOf(sub, config, deps.store);
    const verified = profile.emailVerified && profile.email !== "";
    const invitation =
      role === null && verified
        ? await deps.store.adminInvitationFor(profile.email.toLowerCase(), deps.now().toISOString())
        : undefined;
    const inviter = invitation ? await deps.store.user(invitation.invitedBy) : undefined;
    return json({
      user: {
        ...userShape(sub, profile.name, profile.picture, user, role),
        administration: role === null ? null : { role },
        administrationInvitation: invitation
          ? {
              id: invitation.id,
              invitedBy: { name: inviter?.name ?? "" },
              expiresAt: invitation.expiresAt,
            }
          : null,
      },
      account: `${config.issuer}/account`,
      signOut: `${config.issuer}/logout`,
    });
  }
  if (principal?.via === "token") {
    const user = await deps.store.user(principal.sub);
    return json({
      user: userShape(
        principal.sub,
        user?.name ?? "",
        user?.picture ?? "",
        user,
        await roleOf(principal.sub, config, deps.store),
      ),
      token: { id: principal.tokenId, name: principal.tokenName },
    });
  }
  const returnTo = pageAddress(config.origin, request.headers.get("Referer"));
  return json({
    user: null,
    signIn: `${config.issuer}/login?return_to=${encodeURIComponent(returnTo)}`,
  });
};
