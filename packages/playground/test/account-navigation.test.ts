import { describe, expect, it } from "vitest";
import { centralAccountAddress, hasAdministration } from "../src/cloud/account-navigation.js";

const account = "https://id.meltemi.dev/account?environment=staging&return_to=secret#discard";
const production = "https://diagrams.meltemi.dev/?environment=staging#environment=staging";

describe("central account and administration navigation", () => {
  it.each(["profile", "administration"] as const)(
    "uses only the fixed %s destination, current language and actual production environment",
    (destination) => {
      const path = destination === "profile" ? "/account/profile" : "/admin/diagrams/access";
      expect(centralAccountAddress(account, production, "es", destination)).toBe(
        `https://id.meltemi.dev${path}?lang=es&environment=production`,
      );
    },
  );

  it.each(["profile", "administration"] as const)(
    "preserves staging for the %s destination",
    (destination) => {
      const target = new URL(
        centralAccountAddress(
          account,
          "https://staging.diagrams.meltemi.dev/?environment=production",
          "en",
          destination,
        ),
      );
      expect(target.searchParams.get("environment")).toBe("staging");
      expect(target.searchParams.get("lang")).toBe("en");
      expect([...target.searchParams.keys()]).toEqual(["lang", "environment"]);
      expect(target.hash).toBe("");
    },
  );

  it.each([
    "https://staging.diagrams.meltemi.dev.example.com",
    "https://diagrams.meltemi.dev/?next=https://staging.diagrams.meltemi.dev",
    "http://staging.diagrams.meltemi.dev",
    "http://localhost:8788/?environment=staging",
  ])("cannot select staging through another origin or query: %s", (page) => {
    expect(
      new URL(centralAccountAddress(account, page, "en", "administration")).searchParams.get(
        "environment",
      ),
    ).toBe("production");
  });

  it("uses the validated development identity origin without carrying its query", () => {
    expect(
      centralAccountAddress(
        "http://localhost:8787/account?return_to=discard",
        "http://localhost:8788",
        "en",
        "profile",
      ),
    ).toBe("http://localhost:8787/account/profile?lang=en&environment=production");
  });

  it("offers administration only for an owner, an administrator or an invitee", () => {
    const plain = { administration: null, administrationInvitation: null };
    expect(hasAdministration(plain)).toBe(false);
    expect(hasAdministration({ ...plain, administration: { role: "owner" } })).toBe(true);
    expect(hasAdministration({ ...plain, administration: { role: "administrator" } })).toBe(true);
    expect(
      hasAdministration({
        ...plain,
        administrationInvitation: {
          id: "pending",
          invitedBy: "Owner",
          expiresAt: "2026-11-12T00:00:00Z",
        },
      }),
    ).toBe(true);
  });
});
