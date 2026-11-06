import type { Locale } from "@meltemi/diagrams-i18n";
import type { SessionUser } from "./session.js";

const STAGING_ORIGIN = "https://staging.diagrams.meltemi.dev";

/** The session is a hint for navigation; the central console verifies its live product role. */
export function hasAdministration(
  user: Pick<SessionUser, "administration" | "administrationInvitation">,
): boolean {
  return user.administration !== null || user.administrationInvitation !== null;
}

/** Fixed paths on the validated identity origin, carrying no caller query, fragment or credential. */
export function centralAccountAddress(
  accountPage: string,
  pageAddress: string,
  locale: Locale,
  destination: "profile" | "administration",
): string {
  const identityOrigin = new URL(accountPage).origin;
  const target = new URL(
    destination === "administration" ? "/admin/diagrams/access" : "/account/profile",
    identityOrigin,
  );
  target.searchParams.set("lang", locale);
  target.searchParams.set(
    "environment",
    new URL(pageAddress).origin === STAGING_ORIGIN ? "staging" : "production",
  );
  return target.href;
}
