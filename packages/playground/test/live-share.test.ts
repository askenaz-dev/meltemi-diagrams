// The owner's live session in the share dialog (`live-sessions`, "The owner's controls";
// `project-sharing`, "The share dialog"): read when the dialog opens (so that a session started on
// another device shows), started with "Guests can edit", the switch changed, its link copied, ended;
// what the section shows; and nothing of it for anyone but the owner.

import { describe, expect, it } from "vitest";
import type { Outcome } from "../src/cloud/client.js";
import type { LiveApi, LiveSession } from "../src/cloud/live.js";
import type { ProjectRole, SharingApi, SharingState } from "../src/cloud/share-api.js";
import { ShareModel, shareView, type ViewContext } from "../src/cloud/share-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const ID = "abcdefghij0123456789";
const LINK = `https://diagrams.example/p/${ID}`;
const NOW = Date.parse("2026-10-21T10:00:00.000Z");

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

function session(patch: Partial<LiveSession> = {}): LiveSession {
  return {
    id: "s1",
    link: `${LINK}?live=0123456789abcdef0123456789abcdef`,
    guestsEdit: true,
    startedAt: "2026-10-21T10:00:00.000Z",
    until: "2026-10-22T10:00:00.000Z",
    guests: 0,
    ...patch,
  };
}

function rig(role: ProjectRole, on: LiveSession | null = null) {
  let current = on;
  const calls: string[] = [];
  const known: (LiveSession | null)[] = [];
  const copied: string[] = [];
  const reports: string[] = [];
  const state = (): SharingState => ({
    linkAccess: "private",
    role,
    members: role === "owner" ? [] : undefined,
    invitations: role === "owner" ? [] : undefined,
  });
  const api = {
    get: async () => ok(state()),
    setLink: async () => ok(state()),
    invite: async () => ({ ok: false, failure: { kind: "unreachable", status: 0 } }) as const,
    setRole: async () => ({ ok: false, failure: { kind: "unreachable", status: 0 } }) as const,
    removeMember: async () => ok(null),
    leave: async () => ok(null),
    invitations: async () => ok([]),
    revoke: async () => ok(null),
  } satisfies SharingApi;
  const live: LiveApi = {
    read: async (id) => {
      calls.push(`read ${id}`);
      return ok(current);
    },
    start: async (id, guestsEdit) => {
      calls.push(`start ${id} ${String(guestsEdit)}`);
      current = current
        ? { ...current, guestsEdit: guestsEdit ?? current.guestsEdit }
        : session({ guestsEdit: guestsEdit ?? true });
      return ok(current);
    },
    end: async (id) => {
      calls.push(`end ${id}`);
      current = null;
      return ok(null);
    },
  };
  const model = new ShareModel(
    {
      api,
      copy: async (text) => {
        copied.push(text);
        return true;
      },
      report: (message) => reports.push(message),
      left: () => undefined,
      live,
      liveKnown: (session) => known.push(session),
    },
    ID,
    LINK,
    () => en.cloud,
    () => undefined,
  );
  return { model, calls, known, copied, reports };
}

const context = (patch: Partial<ViewContext> = {}): ViewContext => ({
  words: en.cloud,
  link: LINK,
  me: undefined,
  locale: "en",
  canPublish: false,
  canLive: true,
  guestsNow: 0,
  now: NOW,
  ...patch,
});

describe("the owner's live session section", () => {
  it("offers to start one when none is on, after reading it", async () => {
    const r = rig("owner");
    // Nothing is shown before the dialog knows the person is the owner.
    expect(shareView(r.model.state, context()).live).toBeUndefined();
    await r.model.load();
    expect(r.calls).toEqual([`read ${ID}`]);
    expect(r.known).toEqual([null]);
    expect(shareView(r.model.state, context()).live).toEqual({
      known: true,
      on: false,
      link: "",
      guestsEdit: true,
      guests: en.cloud.live.section.guestsNow(0),
      ends: "",
    });
  });

  it("shows a session started on another device when the dialog opens", async () => {
    const r = rig("owner", session({ guestsEdit: false }));
    await r.model.load();
    const view = shareView(r.model.state, context({ guestsNow: 2 }))!.live!;
    expect(view).toEqual({
      known: true,
      on: true,
      link: session().link,
      guestsEdit: false,
      guests: "2 guests now",
      ends: "Ends in 24 h 0 min",
    });
  });

  it("starts one with the switch's choice, and the page learns of it", async () => {
    const r = rig("owner");
    await r.model.load();
    expect(await r.model.startLive(true)).toBe(true);
    expect(r.calls.at(-1)).toBe(`start ${ID} true`);
    expect(r.known.at(-1)).toEqual(session());
    expect(r.reports.at(-1)).toBe(en.cloud.live.section.started);
    expect(shareView(r.model.state, context())!.live).toMatchObject({
      on: true,
      guestsEdit: true,
      guests: "0 guests now",
    });
  });

  it("changes what guests may do, and says so", async () => {
    const r = rig("owner", session());
    await r.model.load();
    expect(await r.model.setGuestsEdit(false)).toBe(true);
    expect(r.calls.at(-1)).toBe(`start ${ID} false`);
    expect(r.reports.at(-1)).toBe(en.cloud.live.section.nowView);
    expect(r.model.state.live).toMatchObject({ guestsEdit: false });
    // The same choice again asks nothing.
    expect(await r.model.setGuestsEdit(false)).toBe(true);
    expect(r.calls.filter((call) => call.startsWith("start"))).toHaveLength(1);
  });

  it("copies the session's link", async () => {
    const r = rig("owner", session());
    await r.model.load();
    expect(await r.model.copy("live")).toBe(true);
    expect(r.copied).toEqual([session().link]);
    expect(r.model.state.status).toBe(en.cloud.live.section.copied);
  });

  it("ends it, and the page learns it is over", async () => {
    const r = rig("owner", session());
    await r.model.load();
    expect(await r.model.endLive()).toBe(true);
    expect(r.calls.at(-1)).toBe(`end ${ID}`);
    expect(r.known.at(-1)).toBeNull();
    expect(shareView(r.model.state, context())!.live).toMatchObject({ on: false, known: true });
  });

  it("speaks Spanish", async () => {
    const r = rig("owner", session());
    await r.model.load();
    const view = shareView(r.model.state, context({ words: es.cloud, guestsNow: 1 }))!.live!;
    expect(view.guests).toBe("1 invitado ahora");
    expect(view.ends).toBe("Termina en 24 h 0 min");
  });
});

describe("anyone but the owner", () => {
  it.each(["editor", "viewer"] as const)(
    "as %s sees nothing of the live session, and nothing is asked of it",
    async (role) => {
      const r = rig(role, session());
      await r.model.load();
      expect(r.calls).toEqual([]);
      expect(shareView(r.model.state, context())!.live).toBeUndefined();
      expect(await r.model.startLive(true)).toBe(false);
      expect(await r.model.endLive()).toBe(false);
      expect(r.calls).toEqual([]);
    },
  );

  it("sees nothing where the page offers no live sessions", async () => {
    const r = rig("owner", session());
    await r.model.load();
    expect(shareView(r.model.state, context({ canLive: false }))!.live).toBeUndefined();
  });
});
