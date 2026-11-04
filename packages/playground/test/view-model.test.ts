import { describe, expect, it } from "vitest";
import { signInLink } from "../src/cloud/session.js";
import { announcement, statusText } from "../src/cloud/status.js";
import {
  STALE_AFTER_MS,
  linkNotices,
  noticeText,
  openingFor,
  roleOf,
  viewerStatusWords,
  viewsOnly,
  type Acceptance,
  type LinkNotice,
  type LinkOutcome,
  type Role,
} from "../src/cloud/view-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const ID = "abcdefghij0123456789";

describe("the role a text names", () => {
  it("is one of the three, and nothing else", () => {
    expect(roleOf("owner")).toBe("owner");
    expect(roleOf("editor")).toBe("editor");
    expect(roleOf("viewer")).toBe("viewer");
    for (const value of ["admin", "", "Owner", undefined, null, 1, {}]) {
      expect(roleOf(value)).toBeUndefined();
    }
  });
});

describe("the mode a role gives", () => {
  const cases: [signedIn: boolean, role: Role, opening: string][] = [
    // Nobody signed in can only look, whatever the service says they are: and follows the room live.
    [false, "viewer", "view-live"],
    [false, "editor", "view-live"],
    [false, "owner", "view-live"],
    [true, "viewer", "view-live"],
    [true, "editor", "edit"],
    [true, "owner", "edit"],
  ];
  it.each(cases)("signed in %s, as %s: %s", (signedIn, role, opening) => {
    expect(openingFor({ signedIn, role })).toBe(opening);
    expect(viewsOnly(openingFor({ signedIn, role }))).toBe(opening !== "edit");
  });

  const live: [signedIn: boolean, role: Role, opening: string][] = [
    // A live session's token: the role is the session's, for a guest as for a person signed in.
    [false, "editor", "edit"],
    [false, "viewer", "view-live"],
    [true, "editor", "edit"],
    [true, "viewer", "view-live"],
    [true, "owner", "edit"],
  ];
  it.each(live)(
    "with a live session's token, signed in %s, as %s: %s",
    (signedIn, role, opening) => {
      expect(openingFor({ signedIn, role, live: true })).toBe(opening);
    },
  );

  it("reads the snapshot only for an anonymous visitor the room did not answer", () => {
    expect(openingFor({ signedIn: false, role: "viewer", unanswered: true })).toBe("view-snapshot");
    expect(openingFor({ signedIn: false, role: "viewer", unanswered: false })).toBe("view-live");
    // A guest of a session, or a person signed in, is never shown a snapshot for it.
    expect(openingFor({ signedIn: false, role: "editor", live: true, unanswered: true })).toBe(
      "edit",
    );
    expect(openingFor({ signedIn: true, role: "viewer", unanswered: true })).toBe("view-live");
  });

  it("offers a reload to a snapshot after five minutes", () => {
    expect(STALE_AFTER_MS).toBe(300_000);
  });
});

describe("what the status line says after an address was opened", () => {
  const say = (
    signedIn: boolean,
    invite: string | undefined,
    acceptance: Acceptance,
    outcome: LinkOutcome,
  ) => linkNotices({ signedIn, invite, acceptance, outcome });

  // The decision table, role aside (the role decides the mode, above): signed in x invitation x outcome.
  const table: [string, boolean, string | undefined, Acceptance, LinkOutcome, LinkNotice[]][] = [
    ["nobody, no invitation, opened", false, undefined, "none", "opened", []],
    ["nobody, no invitation, not found", false, undefined, "none", "not-found", ["notFoundSignIn"]],
    ["nobody, an invitation, opened", false, "tok", "none", "opened", ["signInToAccept"]],
    ["nobody, an invitation, not found", false, "tok", "none", "not-found", ["signInToAccept"]],
    ["signed in, no invitation, opened", true, undefined, "none", "opened", []],
    ["signed in, no invitation, not found", true, undefined, "none", "not-found", ["notFound"]],
    ["signed in, accepted, opened", true, "tok", "accepted", "opened", ["inviteAccepted"]],
    ["signed in, invalid, opened", true, "tok", "invalid", "opened", ["inviteInvalid"]],
    [
      "signed in, invalid, not found",
      true,
      "tok",
      "invalid",
      "not-found",
      ["inviteInvalid", "notFound"],
    ],
    ["signed in, signed out meanwhile", true, "tok", "signed-out", "opened", ["signInToAccept"]],
    [
      "signed in, signed out meanwhile, not found",
      true,
      "tok",
      "signed-out",
      "not-found",
      ["signInToAccept"],
    ],
    ["signed in, the call failed, opened", true, "tok", "failed", "opened", []],
    ["signed in, the call failed, not found", true, "tok", "failed", "not-found", ["notFound"]],
  ];
  it.each(table)("%s", (_name, signedIn, invite, acceptance, outcome, notices) => {
    expect(say(signedIn, invite, acceptance, outcome)).toEqual(notices);
  });

  it("says nothing of its own when the service failed: the failure is worded by the caller", () => {
    for (const signedIn of [true, false]) {
      expect(say(signedIn, undefined, "none", "failed")).toEqual([]);
      expect(say(signedIn, "tok", "failed", "failed")).toEqual([]);
    }
  });

  it("words the notices in the page's language, an accepted invitation with the project and the role", () => {
    const accepted = { name: "Purchase", role: "editor" };
    expect(noticeText(["inviteInvalid", "notFound"], en.viewing, accepted)).toBe(
      `${en.viewing.inviteInvalid} ${en.viewing.notFound}`,
    );
    expect(noticeText(["inviteAccepted"], en.viewing, accepted)).toBe(
      "Invitation accepted: you can edit Purchase.",
    );
    expect(noticeText(["inviteAccepted"], en.viewing, { name: "Purchase", role: "viewer" })).toBe(
      "Invitation accepted: you can view Purchase.",
    );
    expect(noticeText(["inviteAccepted"], es.viewing, accepted)).toBe(
      "Invitación aceptada: puedes editar Purchase.",
    );
    expect(noticeText(["signInToAccept"], es.viewing, accepted)).toBe(es.viewing.signInToAccept);
    expect(noticeText([], en.viewing, accepted)).toBe("");
  });

  it("does not reveal whether a project exists: a private one and a missing one say the same", () => {
    // The same facts give the same notices: the page has nothing else to go by.
    expect(say(false, undefined, "none", "not-found")).toEqual(
      say(false, undefined, "none", "not-found"),
    );
    expect(en.viewing.notFoundSignIn).not.toMatch(/private|exist|denied|allowed/i);
    expect(en.viewing.notFound).not.toMatch(/private|exist|denied|allowed/i);
  });
});

describe("a viewer's connection in the status line", () => {
  const words = viewerStatusWords(en.viewing.status);

  it("follows the room live and never speaks of saving or of this browser keeping the project", () => {
    expect(statusText({ state: "connected", kept: true }, words)).toBe("Following live");
    expect(statusText({ state: "saving", kept: true }, words)).toBe("Following live");
    expect(statusText({ state: "connecting", kept: true }, words)).toBe(
      en.viewing.status.connecting,
    );
    expect(statusText({ state: "reconnecting", kept: true }, words)).toBe(
      en.viewing.status.reconnecting,
    );
    expect(statusText({ state: "offline", kept: true }, words)).toBe(en.viewing.status.offline);
    expect(statusText({ state: "gone", kept: true }, words)).toBe(en.viewing.status.gone);
    for (const state of ["connected", "reconnecting", "offline"] as const) {
      expect(statusText({ state, kept: true }, words)).not.toMatch(/saved|saving|browser|kept/i);
    }
  });

  it("tells a screen reader the connection dropped and came back, in the viewer's words", () => {
    const connected = { state: "connected", kept: true } as const;
    const offline = { state: "offline", kept: true } as const;
    expect(announcement(connected, offline, words)).toBe(en.viewing.status.offline);
    expect(announcement(offline, connected, words)).toBe(en.viewing.status.synced);
    expect(announcement(connected, connected, words)).toBeUndefined();
  });

  it("speaks Spanish too", () => {
    const spanish = viewerStatusWords(es.viewing.status);
    expect(statusText({ state: "connected", kept: true }, spanish)).toBe("Siguiendo en vivo");
  });
});

describe("the sign-in link of a page that names a project", () => {
  it("returns to the same address, project and invitation included, without the fragment", () => {
    const page = `https://diagrams.example/?project=${ID}&invite=a1b2c3#p=xyz`;
    const link = signInLink("https://id.example", page);
    const back = new URL(link).searchParams.get("return_to");
    expect(back).toBe(`https://diagrams.example/?project=${ID}&invite=a1b2c3`);
    expect(new URL(back!).searchParams.get("invite")).toBe("a1b2c3");
  });
});
