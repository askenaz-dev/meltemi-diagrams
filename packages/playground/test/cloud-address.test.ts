import { describe, expect, it } from "vitest";
import {
  addressFor,
  isProjectId,
  planOpen,
  projectLink,
  readAddress,
  withoutInvite,
} from "../src/cloud/address.js";

const ID = "abcdefghij0123456789";
const OTHER = "zyxwvutsrq9876543210";

describe("a project's id in an address", () => {
  it("is 20 lowercase letters and digits, as the service has it", () => {
    expect(isProjectId(ID)).toBe(true);
    expect(isProjectId(ID.slice(1))).toBe(false);
    expect(isProjectId(`${ID}a`)).toBe(false);
    expect(isProjectId(ID.toUpperCase())).toBe(false);
    expect(isProjectId("../../etc/passwd/aaaaaa")).toBe(false);
    expect(isProjectId("")).toBe(false);
  });
});

describe("reading the address", () => {
  it("takes the project and the invitation as written", () => {
    expect(readAddress(`?project=${ID}&invite=abc`)).toEqual({ project: ID, invite: "abc" });
    expect(readAddress("")).toEqual({ project: undefined, invite: undefined });
    expect(readAddress("?other=1")).toEqual({ project: undefined, invite: undefined });
    expect(readAddress("?project=")).toEqual({ project: "", invite: undefined });
  });

  it("takes the first project when there are several", () => {
    expect(readAddress(`?project=${ID}&project=${OTHER}`).project).toBe(ID);
  });
});

describe("what the page does with its address on load", () => {
  it("opens the anonymous project when no project is asked", () => {
    expect(planOpen("")).toEqual({ kind: "none" });
    expect(planOpen("?theme=dark")).toEqual({ kind: "none" });
    // An invitation with no project to go with it asks nothing either.
    expect(planOpen("?invite=xyz")).toEqual({ kind: "none" });
  });

  it("opens the project the address names, with the invitation it carries, whoever is there", () => {
    // Nobody has a role until the service says so: the plan is the same for a person and for nobody.
    expect(planOpen(`?project=${ID}`)).toEqual({ kind: "open", id: ID, invite: undefined });
    expect(planOpen(`?invite=xyz&project=${ID}`)).toEqual({ kind: "open", id: ID, invite: "xyz" });
  });

  it("says a project is missing when the address names what cannot be one", () => {
    for (const project of ["", "not-an-id", ID.toUpperCase(), `${ID}${ID}`, "../x"]) {
      expect(planOpen(`?project=${encodeURIComponent(project)}`)).toEqual({
        kind: "missing",
        project,
        invite: undefined,
      });
    }
    expect(planOpen("?project=nonsense&invite=abc")).toEqual({
      kind: "missing",
      project: "nonsense",
      invite: "abc",
    });
  });
});

describe("the address once the invitation was accepted", () => {
  it("drops the invitation and keeps the project, the rest of the query and the fragment", () => {
    expect(withoutInvite(`https://app.example/?project=${ID}&invite=abc&a=1#frag`)).toBe(
      `https://app.example/?project=${ID}&a=1#frag`,
    );
    expect(withoutInvite(`https://app.example/?invite=abc&project=${ID}`)).toBe(
      `https://app.example/?project=${ID}`,
    );
  });

  it("leaves an address with no invitation, or one it cannot read, as it was", () => {
    expect(withoutInvite(`https://app.example/?project=${ID}`)).toBe(
      `https://app.example/?project=${ID}`,
    );
    expect(withoutInvite("not an address")).toBe("not an address");
  });
});

describe("the address with another project open", () => {
  it("names the project and keeps the rest of the address, the fragment included", () => {
    expect(addressFor("https://app.example/?a=1#p=xyz", ID)).toBe(
      `https://app.example/?a=1&project=${ID}#p=xyz`,
    );
  });

  it("replaces the project that was named and drops the invitation that went with it", () => {
    expect(addressFor(`https://app.example/?project=${OTHER}&invite=abc`, ID)).toBe(
      `https://app.example/?project=${ID}`,
    );
  });

  it("stops naming a project when it is given none", () => {
    expect(addressFor(`https://app.example/?project=${ID}&invite=abc&a=1`, undefined)).toBe(
      "https://app.example/?a=1",
    );
    expect(addressFor(`https://app.example/?project=${ID}`, undefined)).toBe(
      "https://app.example/",
    );
  });

  it("gives back an address it cannot read as it was", () => {
    expect(addressFor("not an address", ID)).toBe("not an address");
  });
});

describe("a project's link", () => {
  it("is the origin and /p/<id>", () => {
    expect(projectLink("https://app.example", ID)).toBe(`https://app.example/p/${ID}`);
    expect(projectLink("http://127.0.0.1:8787/", ID)).toBe(`http://127.0.0.1:8787/p/${ID}`);
  });
});
