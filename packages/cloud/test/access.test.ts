// What a person is to a project, as one pure function (`project-sharing`, "Link access and
// members"): the matrix of the design, cell by cell. The routes that apply it, and the order of
// their refusals, are sharing-access.test.ts.

import { describe, expect, it } from "vitest";
import { access, linkRole, suffices, type Need, type Role } from "../src/access.js";
import type { LinkAccess, MemberRole } from "../src/store/types.js";

const OWNER = "u-owner";
const project = (linkAccess: LinkAccess) => ({ ownerSub: OWNER, linkAccess });
const person = { sub: "u-ana" };

describe("access: the matrix of the design", () => {
  // Rows: the link level. Columns: anonymous, signed in and not a member, a member as given
  // (a viewer, an editor). The owner is always the owner.
  const MATRIX: [
    LinkAccess,
    Role | undefined,
    Role | undefined,
    Role | undefined,
    Role | undefined,
  ][] = [
    //  link       anonymous  stranger   viewer     editor
    ["private", undefined, undefined, "viewer", "editor"],
    ["view", "viewer", "viewer", "viewer", "editor"],
    ["edit", "viewer", "editor", "editor", "editor"],
  ];

  it.each(MATRIX)(
    "gives, with the link %s: anonymous %s, a stranger %s, a viewer %s, an editor %s",
    (link, anonymous, stranger, viewer, editor) => {
      expect(access(project(link), undefined)).toBe(anonymous);
      expect(access(project(link), person)).toBe(stranger);
      expect(access(project(link), person, "viewer")).toBe(viewer);
      expect(access(project(link), person, "editor")).toBe(editor);
    },
  );

  it("covers the nine cells the specification counts: three levels by anonymous, signed in and member", () => {
    const cells = MATRIX.flatMap(([link]) => [
      access(project(link), undefined),
      access(project(link), person),
      access(project(link), person, "viewer"),
    ]);
    expect(cells).toEqual([
      undefined,
      undefined,
      "viewer", // private
      "viewer",
      "viewer",
      "viewer", // view
      "viewer",
      "editor",
      "editor", // edit
    ]);
  });

  it.each(["private", "view", "edit"] as const)(
    "gives the owner the owner role with the link %s, member or not",
    (link) => {
      expect(access(project(link), { sub: OWNER })).toBe("owner");
      expect(access(project(link), { sub: OWNER }, "viewer")).toBe("owner");
      expect(access(project(link), { sub: OWNER }, "editor")).toBe("owner");
    },
  );

  it("never gives anonymous more than viewer, whatever the link, and never a member's role", () => {
    for (const link of ["private", "view", "edit"] as const) {
      for (const member of [undefined, "viewer", "editor"] as (MemberRole | undefined)[]) {
        const role = access(project(link), undefined, member);
        expect(role === undefined || role === "viewer", `${link} ${member}`).toBe(true);
      }
    }
  });

  it("gives a signed-in person who is not a member what the link gives, and no more", () => {
    expect(access(project("private"), person)).toBeUndefined();
    expect(access(project("view"), person)).toBe("viewer");
    expect(access(project("edit"), person)).toBe("editor");
  });

  it("never gives a member less than the link gives, and never more than they were given on a private link", () => {
    expect(access(project("view"), person, "viewer")).toBe("viewer");
    expect(access(project("edit"), person, "viewer")).toBe("editor");
    expect(access(project("private"), person, "viewer")).toBe("viewer");
    expect(access(project("private"), person, "editor")).toBe("editor");
    expect(access(project("view"), person, "editor")).toBe("editor");
    expect(access(project("edit"), person, "editor")).toBe("editor");
  });

  it("is a person with the owner's sub and nobody else: a sub that merely looks the same is a stranger", () => {
    for (const sub of ["U-OWNER", "u-owner ", "u-owne", "u-owner2", ""]) {
      expect(access(project("private"), { sub }), JSON.stringify(sub)).toBeUndefined();
    }
  });

  it("reads nothing but what it is given", () => {
    // The same arguments, the same answer: no clock, no store, no randomness.
    for (let i = 0; i < 3; i++) {
      expect(access(project("edit"), person, "viewer")).toBe("editor");
    }
  });
});

describe("what the link gives", () => {
  it("is nothing while private, reading with view, and editing with edit for a person with an account only", () => {
    expect(linkRole("private", false)).toBeUndefined();
    expect(linkRole("private", true)).toBeUndefined();
    expect(linkRole("view", false)).toBe("viewer");
    expect(linkRole("view", true)).toBe("viewer");
    expect(linkRole("edit", false)).toBe("viewer");
    expect(linkRole("edit", true)).toBe("editor");
  });
});

describe("what a role is enough for", () => {
  const ENOUGH: [Role, Need, boolean][] = [
    ["viewer", "read", true],
    ["viewer", "write", false],
    ["viewer", "manage", false],
    ["editor", "read", true],
    ["editor", "write", true],
    ["editor", "manage", false],
    ["owner", "read", true],
    ["owner", "write", true],
    ["owner", "manage", true],
  ];
  it.each(ENOUGH)("%s needing %s: %s", (role, need, enough) => {
    expect(suffices(role, need)).toBe(enough);
  });
});
