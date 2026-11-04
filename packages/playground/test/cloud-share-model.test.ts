import { describe, expect, it } from "vitest";
import type { Outcome } from "../src/cloud/client.js";
import {
  MAX_MEMBERS,
  type Invitation,
  type Invited,
  type LinkLevel,
  type Member,
  type MemberRole,
  type ProjectRole,
  type SharingApi,
  type SharingState,
} from "../src/cloud/share-api.js";
import {
  EMAIL_MAX,
  ShareModel,
  checkEmail,
  displayName,
  explainSharing,
  shareTarget,
  shareView,
  type ShareHost,
  type ShareState,
  type ShareView,
  type ViewContext,
} from "../src/cloud/share-model.js";
import { whenText } from "../src/cloud/tokens.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const ID = "abcdefghij0123456789";
const ORIGIN = "https://diagrams.example";
const LINK = `${ORIGIN}/p/${ID}`;

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code: string, message = "No."): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, code, message },
});
const unreachable: Outcome<never> = { ok: false, failure: { kind: "unreachable", status: 0 } };

const member = (sub: string, role: MemberRole = "viewer", patch: Partial<Member> = {}): Member => ({
  sub,
  name: sub.replace(/^u-/, "").replace(/^./, (c) => c.toUpperCase()),
  picture: undefined,
  email: `${sub.replace(/^u-/, "")}@example.com`,
  role,
  addedAt: "2026-10-14T10:00:00.000Z",
  ...patch,
});

const invitation = (id: string, email: string, role: MemberRole = "viewer"): Invitation => ({
  id,
  email,
  role,
  createdAt: `2026-10-14T1${id.length}:00:00.000Z`,
  expiresAt: "2026-11-13T11:00:00.000Z",
  link: `${LINK}?invite=${id.padEnd(32, "0")}`,
});

/** What the service holds, and how each call answers: a test changes either. */
class FakeService {
  linkAccess: LinkLevel = "private";
  members: Member[] = [];
  invitations: Invitation[] = [];
  /** What the person asking is to the project. */
  role: ProjectRole = "owner";
  /** Whether the person is a member (sees the people) when they are not the owner. */
  isMember = true;
  calls: string[] = [];
  /** A test sets one to answer the call with this instead. */
  override: Record<string, () => Promise<Outcome<unknown>>> = {};
  next = 100;

  private state(): SharingState {
    if (this.role === "owner") {
      return {
        linkAccess: this.linkAccess,
        role: "owner",
        members: this.members,
        invitations: this.invitations,
      };
    }
    return {
      linkAccess: this.linkAccess,
      role: this.role,
      members: this.isMember
        ? this.members.map((m) => ({ ...m, email: undefined, addedAt: "" }))
        : undefined,
      invitations: undefined,
    };
  }

  private async answer<T>(name: string, made: () => Outcome<T>): Promise<Outcome<T>> {
    this.calls.push(name);
    const forced = this.override[name];
    if (forced) return (await forced()) as Outcome<T>;
    return made();
  }

  get(id: string) {
    return this.answer(`get ${id}`, () => ok(this.state()));
  }
  setLink(id: string, level: LinkLevel) {
    return this.answer(`setLink ${id} ${level}`, () => {
      this.linkAccess = level;
      return ok(this.state());
    });
  }
  invite(id: string, email: string, role: MemberRole) {
    return this.answer(`invite ${id} ${email} ${role}`, (): Outcome<Invited> => {
      const waiting = this.invitations.find((i) => i.email === email);
      if (waiting) {
        const again = { ...waiting, role };
        this.invitations = this.invitations.map((i) => (i === waiting ? again : i));
        return ok({ invitation: again, created: false });
      }
      const made = invitation(`inv${this.next++}`, email, role);
      this.invitations = [...this.invitations, made];
      return ok({ invitation: made, created: true });
    });
  }
  setRole(id: string, sub: string, role: MemberRole) {
    return this.answer(`setRole ${id} ${sub} ${role}`, () => {
      const held = this.members.find((m) => m.sub === sub);
      if (!held) return refused(404, "not-found", "There is no such member.");
      Object.assign(held, { role });
      return ok({ ...held });
    });
  }
  removeMember(id: string, sub: string) {
    return this.answer(`removeMember ${id} ${sub}`, () => {
      if (!this.members.some((m) => m.sub === sub)) {
        return refused(404, "not-found", "There is no such member.");
      }
      this.members = this.members.filter((m) => m.sub !== sub);
      return ok(null);
    });
  }
  leave(id: string) {
    return this.answer(`leave ${id}`, () =>
      this.role === "owner" ? refused(403, "access.denied") : ok(null),
    );
  }
  invitationsOf(id: string) {
    return this.answer(`invitations ${id}`, () => ok(this.invitations));
  }
  revoke(id: string, which: string) {
    return this.answer(`revoke ${id} ${which}`, () => {
      if (!this.invitations.some((i) => i.id === which)) {
        return refused(404, "not-found", "There is no such invitation.");
      }
      this.invitations = this.invitations.filter((i) => i.id !== which);
      return ok(null);
    });
  }
}

interface Rig {
  readonly model: ShareModel;
  readonly service: FakeService;
  readonly states: ShareState[];
  /** What was said in the status line, and what reached the clipboard, and the times the page was told. */
  readonly reports: string[];
  readonly copied: string[];
  readonly left: { count: number };
  readonly clipboard: { works: boolean };
}

function rig(
  setup: (service: FakeService) => void = () => {},
  words: () => typeof en.cloud = () => en.cloud,
): Rig {
  const service = new FakeService();
  setup(service);
  const api = {
    get: (id: string) => service.get(id),
    setLink: (id: string, level: LinkLevel) => service.setLink(id, level),
    invite: (id: string, email: string, role: MemberRole) => service.invite(id, email, role),
    setRole: (id: string, sub: string, role: MemberRole) => service.setRole(id, sub, role),
    removeMember: (id: string, sub: string) => service.removeMember(id, sub),
    leave: (id: string) => service.leave(id),
    invitations: (id: string) => service.invitationsOf(id),
    revoke: (id: string, which: string) => service.revoke(id, which),
  } satisfies SharingApi;
  const reports: string[] = [];
  const copied: string[] = [];
  const left = { count: 0 };
  const clipboard = { works: true };
  const host: ShareHost = {
    api,
    copy: async (text) => {
      if (clipboard.works) copied.push(text);
      return clipboard.works;
    },
    report: (message) => reports.push(message),
    left: () => void left.count++,
  };
  const states: ShareState[] = [];
  const model = new ShareModel(host, ID, LINK, words, (state) => states.push(state));
  return { model, service, states, reports, copied, left, clipboard };
}

const context = (patch: Partial<ViewContext> = {}): ViewContext => ({
  words: en.cloud,
  link: LINK,
  me: undefined,
  locale: "en",
  canPublish: true,
  ...patch,
});

const viewOf = (r: Rig, patch: Partial<ViewContext> = {}): ShareView =>
  shareView(r.model.state, context(patch));

/** A promise the test settles itself, to hold a call in the air. */
function deferred<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

describe("an email", () => {
  it("is trimmed and lower-cased, as the service reads it", () => {
    expect(checkEmail("  Ana@Example.COM ")).toEqual({ ok: true, email: "ana@example.com" });
  });

  it("is refused when it is empty or cannot be an address", () => {
    expect(checkEmail("")).toEqual({ ok: false, reason: "empty" });
    expect(checkEmail("   ")).toEqual({ ok: false, reason: "empty" });
    for (const bad of [
      "ana@",
      "@example.com",
      "ana",
      "ana@example",
      "a b@example.com",
      "a@@b.co",
    ]) {
      expect(checkEmail(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(checkEmail("ana@example.com\n")).toEqual({ ok: true, email: "ana@example.com" });
    expect(checkEmail("an\u0007a@example.com")).toEqual({ ok: false, reason: "invalid" });
    const long = `${"a".repeat(EMAIL_MAX)}@example.com`;
    expect(checkEmail(long)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("the owner's dialog", () => {
  const owned = (service: FakeService) => {
    service.linkAccess = "view";
    service.members = [member("u-ana", "editor"), member("u-bo", "viewer", { name: "" })];
    service.invitations = [invitation("inv1", "cy@example.com", "viewer")];
  };

  it("shows the link, the level to choose, the people with their emails and the invitations", async () => {
    const r = rig(owned);
    expect(viewOf(r).level).toBeUndefined();
    expect(viewOf(r).retry).toBe(false);
    await r.model.load();
    const view = viewOf(r, { me: "u-ana" });
    expect(view.link).toBe(`${ORIGIN}/p/${ID}`);
    expect(view.role).toBe("owner");
    // The three ways to open the link, one sentence each, the current one checked.
    expect(view.level?.map((l) => [l.value, l.checked])).toEqual([
      ["private", false],
      ["view", true],
      ["edit", false],
    ]);
    expect(view.level?.map((l) => l.label)).toEqual([
      "Only the people listed",
      "Anyone with the link can view",
      "Anyone signed in with the link can edit",
    ]);
    expect(view.level?.every((l) => l.text.endsWith("."))).toBe(true);
    // The people, with roles, emails, role controls and remove; the person looking marked.
    expect(view.people).toEqual([
      expect.objectContaining({
        key: "u-ana",
        name: "Ana",
        email: "ana@example.com",
        role: "editor",
        roleText: "Can edit",
        you: true,
        editable: true,
      }),
      // A person with no name is shown by their email.
      expect.objectContaining({ key: "u-bo", name: "bo@example.com", you: false, editable: true }),
    ]);
    expect(view.invitations).toEqual([
      expect.objectContaining({
        key: "inv1",
        email: "cy@example.com",
        roleText: "Can view",
        expires: en.cloud.sharing.expires(whenText("2026-11-13T11:00:00.000Z", "en")),
        link: `${LINK}?invite=${"inv1".padEnd(32, "0")}`,
      }),
    ]);
    expect(view.count).toBe(`3 of ${MAX_MEMBERS} people and invitations`);
    expect(view.invite).toBe(true);
    expect(view.publish).toBe(true);
    expect(view.leave).toBe(false);
  });

  it("offers the publish entry only where the page can publish", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(viewOf(r, { canPublish: false }).publish).toBe(false);
  });

  it("changes who the link admits with a PATCH and says what it admits now", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(await r.model.setLink("edit")).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`setLink ${ID} edit`);
    expect(viewOf(r).level?.find((l) => l.checked)?.value).toBe("edit");
    expect(r.model.state.status).toBe("Anyone signed in with the link can edit the project now.");
    expect(r.reports.at(-1)).toBe(r.model.state.status);
    expect(r.model.state.busy).toBe(false);
  });

  it("keeps the level when the service refuses, and says why", async () => {
    const r = rig(owned);
    await r.model.load();
    r.service.override["setLink " + ID + " private"] = async () => refused(403, "access.denied");
    expect(await r.model.setLink("private")).toBe(false);
    expect(viewOf(r).level?.find((l) => l.checked)?.value).toBe("view");
    expect(r.model.state.problem).toBe(en.cloud.sharing.errors.accessDenied);
    expect(r.model.state.busy).toBe(false);
    // The picture of the sharing is read again: the person may not be the owner any more.
    expect(r.service.calls.filter((c) => c.startsWith("get "))).toHaveLength(2);
  });

  it("invites by email with a role and shows the invitation's link at once, to copy", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(await r.model.invite("  Ana2@Example.com ", "viewer")).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`invite ${ID} ana2@example.com viewer`);
    const view = viewOf(r);
    // The dialog lists the pending invitation with a link `<origin>/p/<id>?invite=…` and a copy action.
    const made = view.invitations?.find((row) => row.email === "ana2@example.com");
    expect(made?.link).toMatch(new RegExp(`^${ORIGIN}/p/${ID}\\?invite=[0-9a-z]+$`));
    expect(view.revealed?.key).toBe(made?.key);
    expect(view.revealed?.roleText).toBe("Can view");
    // No mail is sent, and the dialog says so.
    expect(r.model.state.status).toContain("No email was sent");
    expect(r.model.state.invited?.email).toBe("ana2@example.com");
    expect(view.count).toBe(`4 of ${MAX_MEMBERS} people and invitations`);
    // Copy writes exactly that link.
    expect(await r.model.copy({ invitation: made!.key })).toBe(true);
    expect(r.copied).toEqual([made!.link]);
    expect(r.model.state.status).toBe(en.cloud.sharing.invitationCopied);
  });

  it("keeps the invitations in the order they were made, the earliest first", async () => {
    const r = rig(owned);
    await r.model.load();
    await r.model.invite("a@example.com", "viewer");
    await r.model.invite("b@example.com", "editor");
    expect(viewOf(r).invitations?.map((row) => row.email)).toEqual([
      "cy@example.com",
      "a@example.com",
      "b@example.com",
    ]);
    // The newest is the one shown at once.
    expect(viewOf(r).revealed?.email).toBe("b@example.com");
  });

  it("refuses an invalid email in the dialog and sends nothing", async () => {
    const r = rig(owned);
    await r.model.load();
    const before = r.service.calls.length;
    expect(await r.model.invite("ana@", "viewer")).toBe(false);
    expect(r.service.calls).toHaveLength(before);
    expect(r.model.state.emailProblem).toBe("That is not an email address.");
    expect(r.model.state.busy).toBe(false);
    expect(await r.model.invite("   ", "viewer")).toBe(false);
    expect(r.model.state.emailProblem).toBe("Enter the person's email address.");
    expect(r.service.calls).toHaveLength(before);
    // A good one clears the problem.
    expect(await r.model.invite("ana@example.com", "editor")).toBe(true);
    expect(r.model.state.emailProblem).toBe("");
  });

  it("says an invitation that was pending now gives the new role, and lists it once", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(await r.model.invite("cy@example.com", "editor")).toBe(true);
    expect(viewOf(r).invitations).toHaveLength(1);
    expect(viewOf(r).invitations?.[0]?.roleText).toBe("Can edit");
    expect(r.model.state.status).toContain("already had an invitation");
    expect(r.model.state.status).toContain("Can edit");
  });

  it("changes a member's role, and restores nothing it did not change", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(await r.model.setRole("u-bo", "editor")).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`setRole ${ID} u-bo editor`);
    expect(viewOf(r).people?.find((p) => p.key === "u-bo")?.role).toBe("editor");
    expect(r.model.state.status).toBe("Changed the role of bo@example.com to “Can edit”.");
    // The same role again is not a call.
    const calls = r.service.calls.length;
    expect(await r.model.setRole("u-bo", "editor")).toBe(true);
    expect(r.service.calls).toHaveLength(calls);
    // Nor is a person who is not in the list.
    expect(await r.model.setRole("u-nobody", "viewer")).toBe(false);
    expect(r.service.calls).toHaveLength(calls);
  });

  it("leaves the role as it was when the service refuses", async () => {
    const r = rig(owned);
    await r.model.load();
    r.service.override[`setRole ${ID} u-bo editor`] = async () => unreachable;
    expect(await r.model.setRole("u-bo", "editor")).toBe(false);
    expect(viewOf(r).people?.find((p) => p.key === "u-bo")?.role).toBe("viewer");
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
  });

  it("removes a member, and says so", async () => {
    const r = rig(owned);
    await r.model.load();
    expect(await r.model.remove("u-ana")).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`removeMember ${ID} u-ana`);
    expect(viewOf(r).people?.map((p) => p.key)).toEqual(["u-bo"]);
    expect(r.model.state.status).toBe("Removed Ana.");
    expect(viewOf(r).count).toBe(`2 of ${MAX_MEMBERS} people and invitations`);
  });

  it("treats a member who is already gone as removed, and reads nothing it must not", async () => {
    const r = rig(owned);
    await r.model.load();
    r.service.members = [member("u-bo", "viewer", { name: "" })];
    expect(await r.model.remove("u-ana")).toBe(true);
    expect(viewOf(r).people?.map((p) => p.key)).toEqual(["u-bo"]);
    expect(r.model.state.status).toBe(en.cloud.sharing.gone);
    expect(r.model.state.problem).toBe("");
  });

  it("revokes an invitation, including the one just made", async () => {
    const r = rig(owned);
    await r.model.load();
    await r.model.invite("ana2@example.com", "viewer");
    const fresh = r.model.state.invited!;
    expect(await r.model.revoke(fresh.id)).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`revoke ${ID} ${fresh.id}`);
    expect(viewOf(r).invitations?.map((row) => row.key)).toEqual(["inv1"]);
    expect(viewOf(r).revealed).toBeUndefined();
    expect(r.model.state.status).toBe("Revoked the invitation for ana2@example.com.");
    expect(await r.model.revoke("inv1")).toBe(true);
    expect(viewOf(r).invitations).toEqual([]);
  });

  it("says an invitation that is gone already is gone, and does not fail", async () => {
    const r = rig(owned);
    await r.model.load();
    r.service.invitations = [];
    expect(await r.model.revoke("inv1")).toBe(true);
    expect(viewOf(r).invitations).toEqual([]);
    expect(r.model.state.status).toBe(en.cloud.sharing.gone);
  });

  it("cannot leave, and no call is made", async () => {
    const r = rig(owned);
    await r.model.load();
    const calls = r.service.calls.length;
    expect(await r.model.leave()).toBe(false);
    expect(r.service.calls).toHaveLength(calls);
    expect(r.left.count).toBe(0);
  });
});

describe("a member's dialog", () => {
  const asEditor = (service: FakeService) => {
    service.role = "editor";
    service.linkAccess = "private";
    service.members = [member("u-ana", "editor"), member("u-bo", "viewer")];
    service.invitations = [invitation("inv1", "cy@example.com")];
  };

  it("shows the link, their role, the people by name and Leave, and no invitation", async () => {
    const r = rig(asEditor);
    await r.model.load();
    const view = viewOf(r, { me: "u-ana" });
    expect(view.link).toBe(LINK);
    expect(view.role).toBe("editor");
    expect(view.roleText).toBe("You can edit this project.");
    expect(view.people?.map((p) => [p.name, p.email, p.editable, p.you])).toEqual([
      ["Ana", undefined, false, true],
      ["Bo", undefined, false, false],
    ]);
    expect(view.leave).toBe(true);
    // Nothing that changes the sharing, nothing of the invitations, nothing to publish.
    expect(view.level).toBeUndefined();
    expect(view.invite).toBe(false);
    expect(view.invitations).toBeUndefined();
    expect(view.revealed).toBeUndefined();
    expect(view.publish).toBe(false);
    expect(view.count).toBe("");
    expect(JSON.stringify(view)).not.toContain("example.com");
  });

  it("never asks the service to change the sharing", async () => {
    const r = rig(asEditor);
    await r.model.load();
    const calls = r.service.calls.length;
    expect(await r.model.setLink("edit")).toBe(false);
    expect(await r.model.invite("x@example.com", "viewer")).toBe(false);
    expect(await r.model.setRole("u-bo", "editor")).toBe(false);
    expect(await r.model.remove("u-bo")).toBe(false);
    expect(await r.model.revoke("inv1")).toBe(false);
    expect(r.service.calls).toHaveLength(calls);
  });

  it("leaves: the service is asked, the page lets go of the project and the dialog has nothing more to show", async () => {
    const r = rig(asEditor);
    await r.model.load();
    expect(await r.model.leave()).toBe(true);
    expect(r.service.calls.at(-1)).toBe(`leave ${ID}`);
    expect(r.left.count).toBe(1);
    expect(r.model.state.left).toBe(true);
    expect(r.model.state.status).toBe("You left the project.");
    const view = viewOf(r);
    expect(view.people).toBeUndefined();
    expect(view.leave).toBe(false);
    expect(view.link).toBe(LINK);
  });

  it("stays a member when leaving is refused", async () => {
    const r = rig(asEditor);
    await r.model.load();
    r.service.override[`leave ${ID}`] = async () =>
      refused(404, "not-found", "You are not a member.");
    expect(await r.model.leave()).toBe(false);
    expect(r.left.count).toBe(0);
    expect(r.model.state.left).toBe(false);
    expect(viewOf(r).leave).toBe(true);
    expect(r.model.state.problem).toBe(en.cloud.errors.notFound);
  });
});

describe("a viewer's dialog", () => {
  it("shows the link and the role, and no member, no invitation and no control that changes the level", async () => {
    const r = rig((service) => {
      service.role = "viewer";
      service.isMember = false;
      service.linkAccess = "view";
      // What the service would never send, kept to see that the page shows none of it.
      service.members = [member("u-ana", "editor")];
      service.invitations = [invitation("inv1", "cy@example.com")];
    });
    await r.model.load();
    const view = viewOf(r);
    expect(view.link).toBe(`${ORIGIN}/p/${ID}`);
    expect(view.role).toBe("viewer");
    expect(view.roleText).toBe("You can view this project but not change it.");
    expect(view.people).toBeUndefined();
    expect(view.invitations).toBeUndefined();
    expect(view.level).toBeUndefined();
    expect(view.invite).toBe(false);
    expect(view.leave).toBe(false);
    expect(view.publish).toBe(false);
    expect(view.revealed).toBeUndefined();
  });

  it("is the same for a signed-in person an edit link makes an editor without a membership", async () => {
    const r = rig((service) => {
      service.role = "editor";
      service.isMember = false;
      service.linkAccess = "edit";
    });
    await r.model.load();
    const view = viewOf(r);
    expect(view.role).toBe("editor");
    expect(view.people).toBeUndefined();
    // A role that comes from the link, not from a membership, has nothing to leave.
    expect(view.leave).toBe(false);
    expect(view.level).toBeUndefined();
  });

  it("can still copy the project's link", async () => {
    const r = rig((service) => {
      service.role = "viewer";
      service.isMember = false;
    });
    await r.model.load();
    expect(await r.model.copy("link")).toBe(true);
    expect(r.copied).toEqual([LINK]);
    expect(r.model.state.status).toBe(en.cloud.sharing.linkCopied);
  });
});

describe("the link", () => {
  it("is shown before the sharing is read, and when it cannot be", async () => {
    const r = rig();
    expect(viewOf(r).link).toBe(LINK);
    expect(viewOf(r).people).toBeUndefined();
    r.service.override[`get ${ID}`] = async () => unreachable;
    await r.model.load();
    expect(r.model.state.list).toBe("failed");
    expect(viewOf(r).retry).toBe(true);
    expect(viewOf(r).link).toBe(LINK);
    expect(r.model.state.problem).toBe(en.cloud.errors.unreachable);
    expect(r.reports.at(-1)).toBe(en.cloud.errors.unreachable);
    // Trying again reads it.
    delete r.service.override[`get ${ID}`];
    await r.model.load();
    expect(r.model.state.list).toBe("ready");
    expect(viewOf(r).retry).toBe(false);
    expect(r.model.state.problem).toBe("");
  });

  it("is copied exactly, and a clipboard that refuses says to select it by hand", async () => {
    const r = rig();
    await r.model.load();
    r.clipboard.works = false;
    expect(await r.model.copy("link")).toBe(false);
    expect(r.copied).toEqual([]);
    expect(r.model.state.status).toBe(en.cloud.sharing.selectIt);
    // An invitation the dialog does not hold is nothing to copy.
    expect(await r.model.copy({ invitation: "nope" })).toBe(false);
  });
});

describe("what the service refuses", () => {
  const ownerRig = () =>
    rig((service) => {
      service.members = [member("u-ana", "editor")];
    });

  it("says a full project in words, with the limit", async () => {
    const r = ownerRig();
    await r.model.load();
    r.service.override[`invite ${ID} x@example.com viewer`] = async () =>
      refused(413, "quota.members");
    expect(await r.model.invite("x@example.com", "viewer")).toBe(false);
    expect(r.model.state.problem).toBe(
      `A project holds at most ${MAX_MEMBERS} people and pending invitations together. Remove someone or revoke an invitation first.`,
    );
    // Nothing was recorded.
    expect(viewOf(r).invitations).toEqual([]);
    expect(r.model.state.invited).toBeUndefined();
    expect(r.model.state.busy).toBe(false);
  });

  it("says a request the service did not accept, an invitation that is not valid, and a refusal for a non-owner", () => {
    const refusal = (status: number, code: string) =>
      explainSharing({ kind: "refused", status, code }, en.cloud);
    expect(refusal(400, "request.invalid")).toBe(en.cloud.sharing.errors.requestInvalid);
    expect(refusal(404, "invite.invalid")).toBe(en.cloud.sharing.errors.inviteInvalid);
    expect(refusal(403, "access.denied")).toBe(en.cloud.sharing.errors.accessDenied);
    expect(explainSharing({ kind: "refused", status: 403 }, en.cloud)).toBe(
      en.cloud.sharing.errors.accessDenied,
    );
    // The rest is what every cloud call says.
    expect(refusal(404, "project.not-found")).toBe(en.cloud.errors.notFound);
    expect(refusal(401, "auth.required")).toBe(en.cloud.errors.signedOut);
    expect(explainSharing({ kind: "unreachable", status: 0 }, en.cloud)).toBe(
      en.cloud.errors.unreachable,
    );
    expect(explainSharing({ kind: "unexpected", status: 200 }, en.cloud)).toBe(
      en.cloud.errors.unexpected,
    );
    expect(
      explainSharing({ kind: "refused", status: 500, code: "internal", message: "Oops" }, en.cloud),
    ).toBe("Oops (internal)");
  });

  it("says each of them in Spanish", async () => {
    const r = rig(
      (service) => {
        service.members = [member("u-ana", "editor")];
      },
      () => es.cloud,
    );
    await r.model.load();
    r.service.override[`invite ${ID} x@example.com viewer`] = async () =>
      refused(413, "quota.members");
    await r.model.invite("x@example.com", "viewer");
    expect(r.model.state.problem).toContain("como máximo 50 personas");
    await r.model.invite("ana@", "viewer");
    expect(r.model.state.emailProblem).toBe("Eso no es un correo electrónico.");
    r.service.override[`invite ${ID} y@example.com viewer`] = async () =>
      refused(400, "request.invalid");
    await r.model.invite("y@example.com", "viewer");
    expect(r.model.state.problem).toBe(es.cloud.sharing.errors.requestInvalid);
    expect(viewOf(r, { words: es.cloud }).level?.[1]?.label).toBe(
      "Cualquiera con el enlace puede ver",
    );
    expect(viewOf(r, { words: es.cloud }).people?.[0]?.roleText).toBe("Puede editar");
  });

  it("reads the picture again after a refusal that says it is out of date", async () => {
    const r = ownerRig();
    await r.model.load();
    // Somebody else removed Ana in the meantime; the owner's remove is refused as not found, which
    // is treated as done, and the list no longer shows her.
    r.service.members = [];
    r.service.override[`removeMember ${ID} u-ana`] = async () => refused(403, "access.denied");
    expect(await r.model.remove("u-ana")).toBe(false);
    expect(viewOf(r).people).toEqual([]);
    expect(r.model.state.problem).toBe(en.cloud.sharing.errors.accessDenied);
  });
});

describe("one action at a time", () => {
  it("ignores another action while one is on its way, and shows the controls as waiting", async () => {
    const r = rig((service) => {
      service.members = [member("u-ana", "editor")];
    });
    await r.model.load();
    const held = deferred<Outcome<unknown>>();
    r.service.override[`setLink ${ID} edit`] = () => held.promise;
    const first = r.model.setLink("edit");
    expect(r.model.state.busy).toBe(true);
    const calls = r.service.calls.length;
    expect(await r.model.setLink("private")).toBe(false);
    expect(await r.model.invite("x@example.com", "viewer")).toBe(false);
    expect(await r.model.remove("u-ana")).toBe(false);
    expect(r.service.calls).toHaveLength(calls);
    held.settle(ok({ linkAccess: "edit", role: "owner", members: [], invitations: [] }));
    expect(await first).toBe(true);
    expect(r.model.state.busy).toBe(false);
  });

  it("says nothing after the dialog was closed", async () => {
    const r = rig();
    await r.model.load();
    const held = deferred<Outcome<unknown>>();
    r.service.override[`setLink ${ID} edit`] = () => held.promise;
    const pending = r.model.setLink("edit");
    r.model.dispose();
    const seen = r.states.length;
    held.settle(ok({ linkAccess: "edit", role: "owner", members: [], invitations: [] }));
    await pending;
    expect(r.states).toHaveLength(seen);
  });
});

describe("names", () => {
  it("shows a name, else an email the owner sees, else someone", () => {
    expect(displayName({ name: " Ana ", email: "a@x.co" }, en.cloud)).toBe("Ana");
    expect(displayName({ name: "", email: "a@x.co" }, en.cloud)).toBe("a@x.co");
    expect(displayName({ name: " ", email: undefined }, en.cloud)).toBe("Someone");
    expect(displayName({ name: "", email: undefined }, es.cloud)).toBe("Alguien");
  });

  it("marks the person looking only on their own row", async () => {
    const r = rig((service) => {
      service.members = [member("u-ana"), member("u-bo")];
    });
    await r.model.load();
    expect(viewOf(r, { me: "u-bo" }).people?.map((p) => p.you)).toEqual([false, true]);
    expect(viewOf(r, { me: undefined }).people?.map((p) => p.you)).toEqual([false, false]);
  });
});

describe("the project the Share button is about", () => {
  const cloud = { id: ID, name: "In the cloud" };
  const viewed = { id: "bcdefghij01234567890", name: "Viewed by its link" };

  it("is the cloud project that is open", () => {
    expect(shareTarget(cloud, undefined)).toBe(cloud);
    // A viewer signed in has both (the controller holds the project and view mode is on): the cloud's.
    expect(shareTarget(cloud, viewed)).toBe(cloud);
  });

  it("is the project that is only shown to view by its link, for a person nobody is signed in as", () => {
    expect(shareTarget(undefined, viewed)).toBe(viewed);
  });

  it("is nothing for the anonymous project, whose dialog is the one that carries the files", () => {
    expect(shareTarget(undefined, undefined)).toBeUndefined();
  });

  it("gives a viewer who looks through the link alone the link and their role, and nothing of the people", async () => {
    const r = rig((service) => {
      service.role = "viewer";
      service.isMember = false;
      service.linkAccess = "view";
    });
    await r.model.load();
    const view = viewOf(r);
    expect(view.link).toBe(LINK);
    expect(view.role).toBe("viewer");
    expect(view.roleText).toBe(en.cloud.sharing.youAre.viewer);
    expect(view.level).toBeUndefined();
    expect(view.people).toBeUndefined();
    expect(view.invitations).toBeUndefined();
    expect(view.invite).toBe(false);
    expect(view.leave).toBe(false);
    expect(view.publish).toBe(false);
  });
});
