// The account panel without a DOM (`account-panel`): the identity data through the page's own
// origin, the sections and the deep link, the actions and their refusals, the handle, and the
// addresses of the two flows that leave the page.

import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SECTIONS,
  AccountPanelModel,
  accountPageAddress,
  deviceLabel,
  linkAddress,
  returnAddressFor,
  sectionFrom,
  withoutAccountParameter,
  type AccountPanelHost,
  type AccountPanelState,
} from "../src/cloud/account-panel-model.js";
import { identityApi, readIdentity, type IdentityView } from "../src/cloud/identity-api.js";
import type { Outcome } from "../src/cloud/tokens.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch, jsonResponse, textResponse } from "./support/fake-fetch.js";

const PAGE = "https://diagrams.meltemi.dev/?project=abc#p=xyz";
const ACCOUNT_PAGE = "https://id.meltemi.dev/account";

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refused = (status: number, code?: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, ...(code === undefined ? {} : { code }) },
});

const VIEW: IdentityView = {
  signins: [
    {
      provider: "github",
      email: "ana@example.com",
      emailVerified: true,
      handle: "ana-dev",
      linkedAt: "2026-10-01T00:00:00.000Z",
    },
    {
      provider: "google",
      email: "ana@gmail.com",
      emailVerified: true,
      handle: "",
      linkedAt: "2026-10-09T00:00:00.000Z",
    },
  ],
  devices: [
    { sid: "s-phone", label: "Firefox on Android", createdAt: "", lastSeen: "", current: false },
    { sid: "s-here", label: "Edge on Windows", createdAt: "", lastSeen: "", current: true },
  ],
  canUnlink: true,
};

interface Fake extends AccountPanelHost {
  readonly reported: string[];
  signedOutCalls: number;
  answers: {
    read: Outcome<IdentityView>;
    unlink: Outcome<IdentityView>;
    revokeOthers: Outcome<IdentityView>;
    revokeOne: Outcome<IdentityView>;
    setHandle: Outcome<{ handle: string }>;
  };
  readonly asked: string[];
}

function fakeHost(): Fake {
  const host: Fake = {
    reported: [],
    signedOutCalls: 0,
    asked: [],
    answers: {
      read: ok(VIEW),
      unlink: ok({ ...VIEW, signins: [VIEW.signins[0]!], canUnlink: false }),
      revokeOthers: ok({ ...VIEW, devices: [VIEW.devices[1]!] }),
      revokeOne: ok({ ...VIEW, devices: [VIEW.devices[1]!] }),
      setHandle: ok({ handle: "ana" }),
    },
    identity: {
      read: async () => (host.asked.push("read"), host.answers.read),
      unlink: async (provider) => (host.asked.push(`unlink ${provider}`), host.answers.unlink),
      revokeOthers: async () => (host.asked.push("revoke-others"), host.answers.revokeOthers),
      revokeOne: async (sid) => (host.asked.push(`revoke ${sid}`), host.answers.revokeOne),
    },
    setHandle: async (handle) => (host.asked.push(`handle ${handle}`), host.answers.setHandle),
    signedOut: () => void host.signedOutCalls++,
    report: (message) => void host.reported.push(message),
  };
  return host;
}

function panel(host = fakeHost(), handle: string | null = null) {
  const states: AccountPanelState[] = [];
  const model = new AccountPanelModel(
    host,
    () => en.accountPanel,
    () => en.cloud,
    { section: "profile", handle },
    (state) => states.push(state),
  );
  return { host, model, states };
}

describe("the sections and the address", () => {
  it("lists six sections in order", () => {
    expect(ACCOUNT_SECTIONS).toEqual([
      "profile",
      "signins",
      "devices",
      "tokens",
      "usage",
      "danger",
    ]);
  });

  it("reads the section an address asks for, Profile for one that does not exist, none for none", () => {
    expect(sectionFrom("devices")).toBe("devices");
    expect(sectionFrom("nothing")).toBe("profile");
    expect(sectionFrom(null)).toBeUndefined();
  });

  it("drops the parameter from the address and keeps the rest", () => {
    expect(
      withoutAccountParameter("https://diagrams.meltemi.dev/?project=abc&account=tokens#p=1"),
    ).toBe("https://diagrams.meltemi.dev/?project=abc#p=1");
  });

  it("comes back to the page at a section, without the fragment, within the service's length", () => {
    expect(returnAddressFor(PAGE, "signins")).toBe(
      "https://diagrams.meltemi.dev/?project=abc&account=signins",
    );
    const long = `https://diagrams.meltemi.dev/?q=${"x".repeat(3000)}`;
    expect(returnAddressFor(long, "danger")).toBe("https://diagrams.meltemi.dev/?account=danger");
  });

  it("links a provider at the identity service and comes back to the section", () => {
    const back = returnAddressFor(PAGE, "signins");
    const address = new URL(linkAddress(ACCOUNT_PAGE, "github", back));
    expect(address.origin + address.pathname).toBe("https://id.meltemi.dev/login");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      provider: "github",
      link: "1",
      return_to: back,
    });
    expect(accountPageAddress(ACCOUNT_PAGE, back)).toBe(
      `https://id.meltemi.dev/account?return_to=${encodeURIComponent(back)}`,
    );
  });

  it("says a device in the page's language", () => {
    expect(deviceLabel("Edge on Windows", en.accountPanel)).toBe("Edge on Windows");
    expect(deviceLabel("Other browser on Other system", es.accountPanel)).toBe(
      "Otro navegador en otro sistema",
    );
    expect(deviceLabel("Something", en.accountPanel)).toBe("Something");
  });
});

describe("the identity data", () => {
  it("is read, and the sections show it", async () => {
    const { model } = panel();
    expect(model.state.identity).toBe("loading");
    await model.load();
    expect(model.state).toMatchObject({ identity: "ready", view: VIEW });
  });

  it("fails into a state of its own when the identity service is unavailable", async () => {
    const host = fakeHost();
    host.answers.read = refused(502, "identity.unavailable");
    const { model } = panel(host);
    await model.load();
    expect(model.state.identity).toBe("failed");
    expect(host.signedOutCalls).toBe(0);
  });

  it("tells the page the person is signed out on a 401, and says nothing else", async () => {
    const host = fakeHost();
    host.answers.read = refused(401, "auth.required");
    const { model } = panel(host);
    await model.load();
    expect(host.signedOutCalls).toBe(1);
  });

  it("changes nothing once the panel closed", async () => {
    const { model, states } = panel();
    model.dispose();
    await model.load();
    expect(states).toEqual([]);
  });
});

describe("the actions", () => {
  it("unlink a provider and show the identity data as it is now", async () => {
    const { host, model } = panel();
    await model.load();
    expect(await model.unlink("google")).toBe(true);
    expect(host.asked).toContain("unlink google");
    expect(model.state.view?.signins.map((s) => s.provider)).toEqual(["github"]);
    expect(model.state.status).toBe("Google was unlinked.");
    expect(host.reported).toEqual(["Google was unlinked."]);
  });

  it("say why an unlink was refused, and keep the list", async () => {
    const host = fakeHost();
    host.answers.unlink = refused(409, "identity.last");
    const { model } = panel(host);
    await model.load();
    expect(await model.unlink("github")).toBe(false);
    expect(model.state.problem).toBe(en.accountPanel.identityLast);
    expect(model.state.view).toEqual(VIEW);
  });

  it("sign out one device, then the others", async () => {
    const { host, model } = panel();
    await model.load();
    expect(await model.revokeOne("s-phone", "Firefox on Android")).toBe(true);
    expect(model.state.status).toBe("Firefox on Android was signed out.");
    expect(await model.revokeOthers()).toBe(true);
    expect(host.asked).toEqual(["read", "revoke s-phone", "revoke-others"]);
    expect(model.state.view?.devices.map((d) => d.current)).toEqual([true]);
  });

  it("read the list again when a device was already signed out elsewhere", async () => {
    const host = fakeHost();
    host.answers.revokeOne = refused(404, "session.not-found");
    const { model } = panel(host);
    await model.load();
    await model.revokeOne("s-phone", "Firefox on Android");
    expect(model.state.problem).toBe(en.accountPanel.sessionGone);
    await Promise.resolve();
    expect(host.asked.filter((a) => a === "read")).toHaveLength(2);
  });

  it("say the minute's allowance and an unreachable service in words", async () => {
    const host = fakeHost();
    const { model } = panel(host);
    await model.load();
    host.answers.revokeOthers = refused(429, "rate.limited");
    await model.revokeOthers();
    expect(model.state.problem).toBe(en.accountPanel.rateLimited);
    host.answers.revokeOthers = { ok: false, failure: { kind: "unreachable", status: 0 } };
    await model.revokeOthers();
    expect(model.state.problem).toBe(en.accountPanel.unreachable);
  });

  it("send nothing while another action is on its way", async () => {
    const host = fakeHost();
    let release!: () => void;
    host.identity.revokeOthers = () => new Promise((done) => (release = () => done(ok(VIEW))));
    const { model } = panel(host);
    const first = model.revokeOthers();
    expect(await model.unlink("google")).toBe(false);
    release();
    await first;
  });
});

describe("the handle", () => {
  it("is saved when it keeps the rule, and said", async () => {
    const { host, model } = panel();
    expect(await model.saveHandle(" ana ")).toBe(true);
    expect(host.asked).toEqual(["handle ana"]);
    expect(model.state).toMatchObject({ handle: "ana", handleProblem: "" });
    expect(host.reported).toEqual(["Your handle is ana."]);
  });

  it("is refused before anything is sent when it breaks the rule", async () => {
    const { host, model } = panel();
    expect(await model.saveHandle("Ana!")).toBe(false);
    expect(host.asked).toEqual([]);
    expect(model.state.handleProblem).toBe(en.cloud.publishing.handleChars);
    model.typedHandle("ab");
    expect(model.state.handleProblem).toBe(en.cloud.publishing.handleShort(3));
    model.typedHandle("");
    expect(model.state.handleProblem).toBe("");
  });

  it("explains a taken and a locked handle", async () => {
    const host = fakeHost();
    const { model } = panel(host, "ana");
    host.answers.setHandle = refused(409, "handle.taken");
    await model.saveHandle("beto");
    expect(model.state.handleProblem).toBe(en.cloud.publishing.handleTaken);
    host.answers.setHandle = refused(409, "handle.locked");
    await model.saveHandle("beto");
    expect(model.state.handleProblem).toBe(en.cloud.publishing.handleLocked);
    expect(model.state.handle).toBe("ana");
  });

  it("sends nothing for the handle the person already has", async () => {
    const { host, model } = panel(fakeHost(), "ana");
    expect(await model.saveHandle("ana")).toBe(true);
    expect(host.asked).toEqual([]);
  });
});

describe("the page's calls", () => {
  it("go to its own origin, and read the identity data, leaving out rows they cannot read", async () => {
    const fake = fakeFetch(() =>
      jsonResponse({
        user: { id: "u1", name: "Ana", picture: "" },
        identities: [
          { provider: "github", email: "a@b.c", emailVerified: true, handle: "a", linkedAt: "x" },
          { email: "no provider" },
        ],
        sessions: [{ sid: "s1", label: "Edge on Windows", current: true }, { label: "no sid" }],
        canUnlink: false,
      }),
    );
    const api = identityApi(fake.fetch, { href: PAGE });
    const read = await api.read();
    expect(read).toEqual({
      ok: true,
      value: {
        signins: [
          { provider: "github", email: "a@b.c", emailVerified: true, handle: "a", linkedAt: "x" },
        ],
        devices: [
          { sid: "s1", label: "Edge on Windows", createdAt: "", lastSeen: "", current: true },
        ],
        canUnlink: false,
      },
    });
    await api.unlink("google");
    await api.revokeOthers();
    await api.revokeOne("a/b");
    expect(fake.calls.map((c) => [c.init.method ?? "GET", c.url, c.init.body ?? null])).toEqual([
      ["GET", "https://diagrams.meltemi.dev/api/account/identity", null],
      ["POST", "https://diagrams.meltemi.dev/api/account/identity/unlink", '{"provider":"google"}'],
      ["POST", "https://diagrams.meltemi.dev/api/account/identity/sessions/revoke-others", "{}"],
      ["POST", "https://diagrams.meltemi.dev/api/account/identity/sessions/a%2Fb/revoke", "{}"],
    ]);
  });

  it("take an answer without its lists, or one that is not JSON, as unexpected", async () => {
    expect(readIdentity({ status: 200, text: '{"identities":[]}' })).toBeUndefined();
    const fake = fakeFetch(() => textResponse("<html>"));
    const read = await identityApi(fake.fetch, { href: PAGE }).read();
    expect(read).toMatchObject({ ok: false, failure: { kind: "unexpected" } });
  });

  it("carry the service's code on a refusal", async () => {
    const fake = fakeFetch(() =>
      jsonResponse({ code: "identity.unavailable", message: "Down." }, 502),
    );
    const read = await identityApi(fake.fetch, { href: PAGE }).read();
    expect(read).toEqual({
      ok: false,
      failure: { kind: "refused", status: 502, code: "identity.unavailable", message: "Down." },
    });
  });
});
