// The page's side of the administration (`account-panel`, "Administration section"): the answer of
// `GET /api/admin` as the section reads it, the calls, the address of a takedown, and the log in
// words, in both languages.

import { describe, expect, it } from "vitest";
import {
  adminApi,
  isEmail,
  logText,
  permissionName,
  publicationAt,
  readView,
  whoText,
} from "../src/cloud/administration.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch } from "./support/fake-fetch.js";

const PAGE = { href: "https://diagrams.meltemi.dev/?p=1#x" };
const answer = (value: unknown) => ({ status: 200, text: JSON.stringify(value), type: "" });

const VIEW = {
  role: "owner",
  owners: [{ sub: "o1", name: "Guillmar Ortiz", handle: null, email: "guillmarortiz@gmail.com" }],
  administrators: [
    {
      sub: "u2",
      name: "Ana",
      handle: "ana",
      email: "ana@example.com",
      invitedBy: { sub: "o1", name: "Guillmar Ortiz" },
      since: "2026-10-29T12:00:00.000Z",
    },
  ],
  invitations: [
    {
      id: "0123456789abcdef0123456789abcdef",
      email: "beto@example.com",
      invitedBy: { sub: "o1", name: "Guillmar Ortiz" },
      createdAt: "2026-10-29T12:00:00.000Z",
      expiresAt: "2026-11-05T12:00:00.000Z",
    },
  ],
  permissions: [
    {
      id: "unbranded-exports",
      holders: [
        {
          sub: "u3",
          name: "",
          handle: null,
          email: "carla@example.com",
          by: { sub: "o1", name: "Guillmar Ortiz" },
          at: "2026-10-29T12:00:00.000Z",
        },
      ],
    },
  ],
  log: [
    {
      at: "2026-10-29T12:00:00.000Z",
      by: { sub: "o1", name: "Guillmar Ortiz" },
      action: "grant",
      target: { sub: "u9", name: "", deleted: true },
      detail: "unbranded-exports",
    },
    {
      at: "2026-10-29T11:00:00.000Z",
      by: { sub: "o1", name: "Guillmar Ortiz" },
      action: "invite",
      target: { email: "beto@example.com" },
      detail: "",
    },
  ],
  publishHost: "meltemi.page",
};

describe("the administration answer", () => {
  it("reads every part, and leaves out what cannot be read", () => {
    const read = readView(answer({ ...VIEW, owners: [...VIEW.owners, { name: "no sub" }] }));
    expect(read?.value.role).toBe("owner");
    expect(read?.value.owners.map((o) => o.sub)).toEqual(["o1"]);
    expect(read?.value.administrators[0]?.invitedBy).toEqual({
      sub: "o1",
      name: "Guillmar Ortiz",
      deleted: false,
    });
    expect(read?.value.permissions[0]?.holders[0]?.by?.name).toBe("Guillmar Ortiz");
    expect(read?.value.log[0]?.target).toEqual({ sub: "u9", name: "", deleted: true });
    expect(read?.value.log[1]?.target).toEqual({ email: "beto@example.com" });
    expect(read?.value.publishHost).toBe("meltemi.page");
  });

  it("is none without a role, and null publish host when it is not text", () => {
    expect(readView(answer({ ...VIEW, role: "root" }))).toBeUndefined();
    expect(readView(answer({ ...VIEW, publishHost: 5 }))?.value.publishHost).toBeNull();
  });
});

describe("the calls", () => {
  it("asks the admin routes relative to the page, with JSON bodies", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 204 }));
    const api = adminApi(fake.fetch, PAGE);
    await api.invite("ana@example.com");
    await api.setPermission("ana@example.com", "unbranded-exports", true);
    await api.takeDown("tienda", "precios", "Phishing");
    await api.removeAdministrator("u2");
    const calls = fake.calls.map((c) => [c.init.method ?? "GET", c.url, c.init.body ?? null]);
    expect(calls).toEqual([
      ["POST", "https://diagrams.meltemi.dev/api/admin/invitations", '{"email":"ana@example.com"}'],
      [
        "PUT",
        "https://diagrams.meltemi.dev/api/admin/accounts/ana%40example.com/permissions/unbranded-exports",
        '{"granted":true}',
      ],
      [
        "DELETE",
        "https://diagrams.meltemi.dev/api/admin/publications/tienda/precios",
        '{"reason":"Phishing"}',
      ],
      ["DELETE", "https://diagrams.meltemi.dev/api/admin/administrators/u2", null],
    ]);
  });
});

describe("the fields", () => {
  it("checks an email as the Worker does", () => {
    expect(isEmail(" ana@example.com ")).toBe(true);
    for (const value of ["ana", "ana@localhost", "a b@example.com", `${"a".repeat(260)}@x.io`]) {
      expect(isEmail(value), value).toBe(false);
    }
  });

  it("reads the address of a publication of the publish host, or handle/slug", () => {
    expect(publicationAt("https://meltemi.page/tienda/precios/", "meltemi.page")).toEqual({
      handle: "tienda",
      slug: "precios",
    });
    expect(publicationAt("tienda/precios", null)).toEqual({ handle: "tienda", slug: "precios" });
    expect(
      publicationAt("http://localhost:8788/_published/tienda/precios/", "localhost:8788"),
    ).toEqual({ handle: "tienda", slug: "precios" });
    for (const value of [
      "https://example.com/tienda/precios",
      "https://meltemi.page/tienda",
      "https://meltemi.page/Tienda/precios",
      "https://meltemi.page/tienda/precios/more",
      "tienda",
    ]) {
      expect(publicationAt(value, "meltemi.page"), value).toBeUndefined();
    }
  });
});

describe("the log in words", () => {
  const view = readView(answer(VIEW))!.value;

  it("says who did what to whom, in English and Spanish", () => {
    expect(logText(view.log[0]!, en.accountPanel)).toBe(
      "Guillmar Ortiz granted Export without the Meltemi branding to a deleted account",
    );
    expect(logText(view.log[1]!, en.accountPanel)).toBe("Guillmar Ortiz invited beto@example.com");
    expect(logText(view.log[0]!, es.accountPanel)).toBe(
      "Guillmar Ortiz concedió Exportar sin la marca de Meltemi a una cuenta eliminada",
    );
  });

  it("names a person by name, else email, else id, and an unknown permission by its id", () => {
    expect(whoText(view.permissions[0]!.holders[0]!, en.accountPanel)).toBe("carla@example.com");
    expect(permissionName("quota", en.accountPanel)).toBe("quota");
  });

  it("has the same permissions and log actions in both languages", () => {
    const a = en.accountPanel.administration;
    const b = es.accountPanel.administration;
    expect(Object.keys(b.permissions)).toEqual(Object.keys(a.permissions));
    expect(Object.keys(b.log).sort()).toEqual(Object.keys(a.log).sort());
    expect(Object.keys(a.log).sort()).toEqual(
      [
        "accept",
        "decline",
        "grant",
        "invite",
        "leave",
        "remove",
        "revoke",
        "revoke-invitation",
        "takedown",
      ].sort(),
    );
  });
});
