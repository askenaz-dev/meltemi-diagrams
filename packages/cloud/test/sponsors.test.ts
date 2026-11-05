// Exports without the branding, by donation (`sponsorship-entitlement`): GitHub Sponsors' deliveries
// at `POST /_sponsors/github`, the claim when a person's sign-ins are read through the Worker, the
// session answer's `support` and `unbrandedBy`, the administration answer's sponsorships and holders,
// and what a deletion clears. Every signature here is made with Node's own HMAC, apart from the code
// under test; no test reaches the network.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { utf8, verifyHmacHex } from "../src/crypto.js";
import { MAX_DELIVERY_BYTES } from "../src/routes/sponsors.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore, Sponsorship } from "../src/store/types.js";
import { jsonOf } from "./support/index.js";
import { JSON_TYPE, codeOf, projects, type Projects } from "./support/projects.js";
import { addToken, bearer } from "./support/who.js";

const SECRET = "test-sponsors-secret";
const ACCOUNT = "askenaz";
const OWNER = "u-owner";
const ANA = "u-ana";
const BEN = "u-ben";
const CREATED = "2026-11-04T09:30:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// What GitHub sends.

/** GitHub's signature: `sha256=` and the hex HMAC-SHA256 of the exact body. */
const sign = (body: string, secret = SECRET): string =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

interface EventOptions {
  readonly action?: string;
  readonly login?: string;
  readonly id?: number;
  readonly type?: string;
  readonly oneTime?: boolean;
  readonly cents?: number;
  readonly privacy?: string;
  readonly sponsorable?: string;
  readonly createdAt?: string;
  /** Fields of `sponsorship` to leave out, by path (`sponsor.login`, `tier`). */
  readonly without?: readonly string[];
}

/** The body of a `sponsorship` event, shaped as GitHub documents it. */
function sponsorshipEvent(options: EventOptions = {}): string {
  const sponsorship: Record<string, unknown> = {
    node_id: "S_kwHOAA",
    created_at: options.createdAt ?? "2026-11-04T09:30:00+00:00",
    sponsorable: { login: options.sponsorable ?? ACCOUNT, id: 1, type: "User" },
    sponsor: {
      login: options.login ?? "ana",
      id: options.id ?? 4242,
      type: options.type ?? "User",
      avatar_url: "https://avatars.githubusercontent.com/u/4242",
    },
    privacy_level: options.privacy ?? "public",
    tier: {
      node_id: "ST_kwHOAA",
      name: "$10 a month",
      description: "Export without the Meltemi branding in the web app.",
      monthly_price_in_cents: options.cents ?? 1000,
      monthly_price_in_dollars: (options.cents ?? 1000) / 100,
      is_one_time: options.oneTime ?? false,
      is_custom_amount: false,
    },
  };
  for (const path of options.without ?? []) {
    const [head, tail] = path.split(".") as [string, string | undefined];
    if (tail === undefined) delete sponsorship[head];
    else delete (sponsorship[head] as Record<string, unknown>)[tail];
  }
  return JSON.stringify({
    action: options.action ?? "created",
    sponsorship,
    sender: { login: options.login ?? "ana", id: options.id ?? 4242 },
  });
}

interface Delivery {
  readonly event?: string;
  readonly id?: string | null;
  /** The signature header; the right one by default, none when `null`. */
  readonly signature?: string | null;
  readonly type?: string;
}

let deliveries = 0;
/** Posts a body to the Worker as GitHub does: no cookie, no `Origin`, signed. */
function deliver(p: Projects, body: string, options: Delivery = {}): Promise<Response> {
  const headers = new Headers({
    "Content-Type": options.type ?? "application/json",
    "X-GitHub-Event": options.event ?? "sponsorship",
    "User-Agent": "GitHub-Hookshot/abc1234",
  });
  const id = options.id === undefined ? `72d3162e-cc78-11e3-81ab-${++deliveries}` : options.id;
  if (id !== null) headers.set("X-GitHub-Delivery", id);
  const signature = options.signature === undefined ? sign(body) : options.signature;
  if (signature !== null) headers.set("X-Hub-Signature-256", signature);
  return p.h.request("/_sponsors/github", { method: "POST", headers, body });
}

// ---------------------------------------------------------------------------------------------
// The service.

/** The service with a sponsored account, the owner, and the people who have asked once. */
async function service(
  options: { configured?: boolean; store?: CloudStore; people?: readonly string[] } = {},
) {
  const configured = options.configured ?? true;
  const p = await projects({
    env: {
      ADMIN_SUBS: OWNER,
      ...(configured ? { SPONSORS_ACCOUNT: ACCOUNT, SPONSORS_WEBHOOK_SECRET: SECRET } : {}),
    },
    ...(options.store ? { store: options.store } : {}),
  });
  p.profile(OWNER, { name: "Guillmar Ortiz", email: "owner@example.com", emailVerified: true });
  // The GitHub login each person's sign-ins carry; a person with none signed in with Google.
  const github = new Map<string, string | undefined>();
  p.h.identity.api = (request) => {
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { sub } = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      sub: string;
    };
    const login = github.get(sub);
    const identities = [
      ...(login === undefined
        ? []
        : [
            {
              provider: "github",
              email: `${sub}@example.com`,
              emailVerified: true,
              handle: login,
              linkedAt: "2026-10-01T00:00:00.000Z",
            },
          ]),
      {
        provider: "google",
        email: `${sub}@example.com`,
        emailVerified: true,
        handle: "",
        linkedAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    return new Response(
      JSON.stringify({
        user: { id: sub, name: sub, picture: "" },
        identities,
        sessions: [],
        canUnlink: identities.length > 1,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  for (const sub of [OWNER, ...(options.people ?? [])]) await p.send(sub, "GET", "/api/session");
  return {
    p,
    /** Links the GitHub login to the person's account at the identity service. */
    link: (sub: string, login: string | undefined) => github.set(sub, login),
    /** Opens the account panel: the sign-ins read through the Worker. */
    profile: async (sub: string) => {
      const response = await p.send(sub, "GET", "/api/account/identity");
      expect(response.status).toBe(200);
      return jsonOf<{ claimed?: boolean; identities: unknown[] }>(response);
    },
    session: async (sub: string) =>
      jsonOf<{
        user: { entitlements: { unbranded: boolean; unbrandedBy: string | null } } | null;
        support?: { url: string };
      }>(await p.send(sub, "GET", "/api/session")),
    admin: async () =>
      jsonOf<{
        permissions: { id: string; holders: { sub: string; by: unknown }[] }[];
        log: { by: unknown; action: string; target: unknown; detail: string }[];
        sponsorships: Record<string, unknown>[];
      }>(await p.send(OWNER, "GET", "/api/admin")),
    rows: () => p.h.store.sponsorships(50),
  };
}

const json = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
});

// ---------------------------------------------------------------------------------------------

describe("the signature GitHub sends", () => {
  it("is checked with GitHub's documented test vector, over the exact bytes", async () => {
    // https://docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries
    const secret = "It's a Secret to Everybody";
    const vector = "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
    expect(await verifyHmacHex(secret, utf8("Hello, World!"), vector)).toBe(true);
    expect(await verifyHmacHex(secret, utf8("Hello, World?"), vector)).toBe(false);
    expect(await verifyHmacHex(secret, utf8("Hello, World!"), vector.toUpperCase())).toBe(true);
    expect(await verifyHmacHex(secret, utf8("Hello, World!"), vector.slice(0, 62))).toBe(false);
    expect(await verifyHmacHex(secret, utf8("Hello, World!"), "")).toBe(false);
  });

  it("lets the test vector through the route, which then finds the body is not JSON", async () => {
    const { p } = await service();
    const response = await p.h.request("/_sponsors/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "sponsorship",
        "X-GitHub-Delivery": "d-vector",
        "X-Hub-Signature-256": sign("Hello, World!"),
      },
      body: "Hello, World!",
    });
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("request.invalid");
  });
});

describe("POST /_sponsors/github", () => {
  it("keeps a signed created sponsorship as an unclaimed, active row", async () => {
    const { p, rows } = await service();
    const response = await deliver(p, sponsorshipEvent(), { id: "d-1" });
    expect(await json(response)).toEqual({ status: 200, body: { recorded: true } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows()).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f]{32}$/),
        deliveryId: "d-1",
        login: "ana",
        sponsorId: 4242,
        sponsorType: "User",
        oneTime: false,
        amountCents: 1000,
        privacy: "public",
        createdAt: CREATED,
        status: "active",
        claimedBy: null,
        claimedAt: null,
      } satisfies Sponsorship,
    ]);
  });

  it("keeps one-time and monthly sponsorships alike, of any amount", async () => {
    const { p, rows } = await service();
    await deliver(p, sponsorshipEvent({ login: "ana", oneTime: true, cents: 500 }));
    await deliver(p, sponsorshipEvent({ login: "ben", cents: 1000, privacy: "private" }));
    const kept = Object.fromEntries((await rows()).map((s) => [s.login, s]));
    expect(kept["ana"]).toMatchObject({ oneTime: true, amountCents: 500, claimedBy: null });
    expect(kept["ben"]).toMatchObject({ oneTime: false, amountCents: 1000, privacy: "private" });
  });

  it("refuses a body changed after it was signed, without parsing it or keeping anything", async () => {
    const { p, rows } = await service();
    const body = sponsorshipEvent();
    const parse = vi.spyOn(JSON, "parse");
    const response = await deliver(p, body.replace('"ana"', '"eve"'), { signature: sign(body) });
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe("signature.invalid");
    expect(parse.mock.calls.some(([text]) => String(text).includes('"sponsorship"'))).toBe(false);
    expect(await rows()).toEqual([]);
  });

  it.each([
    ["no signature", null],
    ["a signature without its prefix", createHmac("sha256", SECRET).update("x").digest("hex")],
    ["the identity service's prefix", `v1=${"0".repeat(64)}`],
    ["the prefix alone", "sha256="],
    ["a signature that is not hexadecimal", `sha256=${"z".repeat(64)}`],
    ["a signature made with another secret", "other"],
  ])("refuses %s with 401", async (_label, signature) => {
    const { p, rows } = await service();
    const body = sponsorshipEvent();
    const response = await deliver(p, body, {
      signature: signature === "other" ? sign(body, "another-secret") : signature,
    });
    expect(response.status).toBe(401);
    expect(await rows()).toEqual([]);
  });

  it("handles a delivery id once: a repeat is 200 repeated, and one row exists", async () => {
    const { p, rows } = await service();
    const body = sponsorshipEvent();
    expect((await json(await deliver(p, body, { id: "d-same" }))).body).toEqual({
      recorded: true,
    });
    expect(await json(await deliver(p, body, { id: "d-same" }))).toEqual({
      status: 200,
      body: { repeated: true },
    });
    expect(await rows()).toHaveLength(1);
  });

  it("ignores another sponsorable, a ping and another event, and keeps nothing", async () => {
    const { p, rows } = await service();
    const ignored = { status: 200, body: { ignored: true } };
    expect(await json(await deliver(p, sponsorshipEvent({ sponsorable: "octocat" })))).toEqual(
      ignored,
    );
    expect(
      await json(
        await deliver(p, JSON.stringify({ zen: "Keep it logically awesome.", hook_id: 1 }), {
          event: "ping",
        }),
      ),
    ).toEqual(ignored);
    expect(await json(await deliver(p, sponsorshipEvent(), { event: "push" }))).toEqual(ignored);
    expect(await rows()).toEqual([]);
  });

  it("matches the sponsorable's login ignoring case", async () => {
    const { p, rows } = await service();
    await deliver(p, sponsorshipEvent({ sponsorable: "Askenaz" }));
    expect(await rows()).toHaveLength(1);
  });

  it.each([
    ["the sponsor's login", { without: ["sponsor.login"] }],
    ["the sponsor's id", { without: ["sponsor.id"] }],
    ["the sponsor's type", { without: ["sponsor.type"] }],
    ["the tier", { without: ["tier"] }],
    ["the tier's kind", { without: ["tier.is_one_time"] }],
    ["the tier's amount", { without: ["tier.monthly_price_in_cents"] }],
    ["the privacy level", { without: ["privacy_level"] }],
    ["the creation time", { without: ["created_at"] }],
    ["the sponsorable", { without: ["sponsorable"] }],
    ["a login that is not one", { login: "<script>" }],
    ["a negative amount", { cents: -5 }],
    ["a privacy level that is not one", { privacy: "secret" }],
    ["a time that is not one", { createdAt: "yesterday" }],
  ])("refuses an event without %s with 400, and keeps nothing", async (_label, options) => {
    const { p, rows } = await service();
    const response = await deliver(p, sponsorshipEvent(options as EventOptions));
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("request.invalid");
    expect(await rows()).toEqual([]);
  });

  it("refuses a sponsorship event without its delivery id, and a body that is not an object", async () => {
    const { p, rows } = await service();
    expect((await deliver(p, sponsorshipEvent(), { id: null })).status).toBe(400);
    expect((await deliver(p, "[1, 2]")).status).toBe(400);
    expect((await deliver(p, "not json")).status).toBe(400);
    expect(await rows()).toEqual([]);
  });

  it("refuses a body that is not declared JSON with 415, before reading it", async () => {
    const { p, rows } = await service();
    const body = `payload=${encodeURIComponent(sponsorshipEvent())}`;
    const response = await deliver(p, body, { type: "application/x-www-form-urlencoded" });
    expect(response.status).toBe(415);
    expect(await codeOf(response)).toBe("request.unsupported");
    expect(await rows()).toEqual([]);
    // A charset is fine.
    const charset = await deliver(p, sponsorshipEvent(), {
      type: "application/json; charset=utf-8",
    });
    expect(charset.status).toBe(200);
  });

  it("reads at most 64 KiB, even signed", async () => {
    const { p, rows } = await service();
    const base = sponsorshipEvent();
    const padded = `${base.slice(0, -1)},"pad":"${"x".repeat(MAX_DELIVERY_BYTES - base.length - 9)}"}`;
    expect(Buffer.byteLength(padded)).toBe(MAX_DELIVERY_BYTES);
    expect((await deliver(p, padded)).status).toBe(200);
    const over = `${base.slice(0, -1)},"pad":"${"x".repeat(MAX_DELIVERY_BYTES - base.length - 8)}"}`;
    const response = await deliver(p, over);
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("request.invalid");
    expect(await rows()).toHaveLength(1);
  });

  it("sets the status of the later actions by login and kind, and a cancellation changes no entitlement", async () => {
    const s = await service({ people: [ANA] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent());
    await s.profile(ANA);

    for (const action of ["edited", "pending_cancellation"]) {
      expect((await json(await deliver(s.p, sponsorshipEvent({ action })))).body).toEqual({
        updated: true,
      });
    }
    expect((await s.rows())[0]?.status).toBe("pending-cancellation");
    expect(
      (await json(await deliver(s.p, sponsorshipEvent({ action: "cancelled" })))).body,
    ).toEqual({ updated: true });
    expect((await s.rows())[0]?.status).toBe("cancelled");
    // A one-time sponsorship of the same login has none to update, and an unknown action is ignored.
    expect(
      (await json(await deliver(s.p, sponsorshipEvent({ action: "cancelled", oneTime: true }))))
        .body,
    ).toEqual({ updated: false });
    expect((await json(await deliver(s.p, sponsorshipEvent({ action: "renamed" })))).body).toEqual({
      ignored: true,
    });
    for (const action of ["constructor", "__proto__", "toString"]) {
      expect((await json(await deliver(s.p, sponsorshipEvent({ action })))).body).toEqual({
        ignored: true,
      });
    }
    expect((await s.rows())[0]?.status).toBe("cancelled");
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: true,
      unbrandedBy: "github-sponsors",
    });
  });

  it.each([undefined, "", "  ", "not a login!"])(
    "does not exist with SPONSORS_ACCOUNT %j: 404, nothing kept",
    async (SPONSORS_ACCOUNT) => {
      const store = memoryStore();
      const p = await projects({
        store,
        env: {
          SPONSORS_WEBHOOK_SECRET: SECRET,
          ...(SPONSORS_ACCOUNT === undefined ? {} : { SPONSORS_ACCOUNT }),
        },
      });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await deliver(p, sponsorshipEvent());
      expect(response.status).toBe(404);
      expect(await codeOf(response)).toBe("not-found");
      expect(await store.sponsorships(50)).toEqual([]);
      // Only a value that is set and unusable is worth a line, which names the variable alone.
      if (SPONSORS_ACCOUNT === "not a login!") {
        expect(errors.mock.calls.map((call) => call.join(" "))).toEqual([
          "cloud: SPONSORS_ACCOUNT is not a GitHub login; deliveries are refused",
        ]);
      } else expect(errors).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", " "])(
    "refuses every delivery with 500 when the secret is %j, saying so without a value",
    async (SPONSORS_WEBHOOK_SECRET) => {
      const store = memoryStore();
      const p = await projects({
        store,
        env: {
          SPONSORS_ACCOUNT: ACCOUNT,
          ...(SPONSORS_WEBHOOK_SECRET === undefined ? {} : { SPONSORS_WEBHOOK_SECRET }),
        },
      });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await deliver(p, sponsorshipEvent(), {
        signature: sign(sponsorshipEvent(), " "),
      });
      expect(response.status).toBe(500);
      expect(errors.mock.calls.map((call) => call.join(" "))).toEqual([
        "cloud: SPONSORS_WEBHOOK_SECRET is not set; sponsorship deliveries are refused",
      ]);
      expect(await store.sponsorships(50)).toEqual([]);
    },
  );

  it("never logs a body nor the secret, whatever it answers", async () => {
    const lines: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    const store = memoryStore();
    const failing: CloudStore = {
      ...store,
      recordSponsorship: () => Promise.reject(new Error("the database is down")),
    };
    const { p } = await service({ store: failing });
    const body = sponsorshipEvent({ login: "secret-sponsor" });
    await deliver(p, body);
    await deliver(p, body.replace("secret-sponsor", "other-sponsor"), { signature: sign(body) });
    await deliver(p, sponsorshipEvent({ login: "secret-sponsor", without: ["tier"] }));
    await deliver(p, body, { type: "text/plain" });
    const logged = lines.join("\n");
    expect(logged).not.toContain("secret-sponsor");
    expect(logged).not.toContain("other-sponsor");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("sponsorship");
  });

  it("needs no cookie and no Origin, and a cookie from another site changes nothing about it", async () => {
    const { p, rows } = await service({ people: [ANA] });
    const { cookie } = await p.h.signedIn({ sub: ANA });
    const body = sponsorshipEvent();
    const response = await p.h.request("/_sponsors/github", {
      method: "POST",
      headers: {
        ...JSON_TYPE,
        Cookie: cookie,
        Origin: "https://evil.example",
        "X-GitHub-Event": "sponsorship",
        "X-GitHub-Delivery": "d-cookie",
        "X-Hub-Signature-256": sign(body),
      },
      body,
    });
    expect(response.status).toBe(200);
    expect(await rows()).toHaveLength(1);
  });
});

describe("the claim, when the sign-ins are read through the Worker", () => {
  it("grants Ana, whose GitHub sign-in is the sponsor's, claims the row and logs the grant by GitHub Sponsors", async () => {
    const s = await service({ people: [ANA] });
    s.link(ANA, "Ana");
    await deliver(s.p, sponsorshipEvent({ login: "ana" }));
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: false,
      unbrandedBy: null,
    });
    s.p.h.clock.advance(60_000);
    const now = s.p.h.clock.now().toISOString();

    const view = await s.profile(ANA);

    expect(view.claimed).toBe(true);
    expect(view.identities).toHaveLength(2);
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: true,
      unbrandedBy: "github-sponsors",
    });
    expect((await s.rows())[0]).toMatchObject({ claimedBy: ANA, claimedAt: now });
    const admin = await s.admin();
    expect(admin.log[0]).toEqual({
      at: now,
      by: { sub: "github-sponsors", name: "GitHub Sponsors" },
      action: "grant",
      target: { sub: ANA, name: ANA },
      detail: "unbranded-exports (ana)",
    });
    expect(admin.permissions[0]?.holders).toEqual([
      {
        sub: ANA,
        handle: null,
        name: ANA,
        email: expect.any(String),
        by: { sub: "github-sponsors", name: "GitHub Sponsors" },
        at: now,
      },
    ]);
    // The next opening claims nothing more, and says nothing of a claim.
    expect((await s.profile(ANA)).claimed).toBeUndefined();
    expect((await s.admin()).log).toHaveLength(1);
  });

  it("grants nothing to Ben, who links the login after Ana claimed it: the row still names Ana", async () => {
    const s = await service({ people: [ANA, BEN] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent());
    await s.profile(ANA);
    s.link(BEN, "ana");

    expect((await s.profile(BEN)).claimed).toBeUndefined();

    expect((await s.session(BEN)).user?.entitlements.unbranded).toBe(false);
    expect((await s.rows())[0]?.claimedBy).toBe(ANA);
  });

  it("grants nothing for a Google sign-in alone, nor for an organisation's sponsorship", async () => {
    const s = await service({ people: [ANA, BEN] });
    s.link(BEN, "acme");
    await deliver(s.p, sponsorshipEvent({ login: "ana" }));
    await deliver(s.p, sponsorshipEvent({ login: "acme", type: "Organization" }));
    expect((await s.profile(ANA)).claimed).toBeUndefined();
    expect((await s.profile(BEN)).claimed).toBeUndefined();
    expect((await s.rows()).map((r) => r.claimedBy)).toEqual([null, null]);
    // Linking GitHub is how the donation is recognised: the next opening claims it.
    s.link(ANA, "ana");
    expect((await s.profile(ANA)).claimed).toBe(true);
  });

  it("claims a sponsorship that was cancelled before the claim, and keeps a grant cancelled after it", async () => {
    const s = await service({ people: [ANA, BEN] });
    s.link(ANA, "ana");
    s.link(BEN, "ben");
    await deliver(s.p, sponsorshipEvent({ login: "ana" }));
    await deliver(s.p, sponsorshipEvent({ login: "ben" }));
    await deliver(s.p, sponsorshipEvent({ login: "ben", action: "cancelled" }));
    expect((await s.profile(BEN)).claimed).toBe(true);
    await s.profile(ANA);
    await deliver(s.p, sponsorshipEvent({ login: "ana", action: "cancelled" }));
    for (const sub of [ANA, BEN]) {
      expect((await s.session(sub)).user?.entitlements.unbranded).toBe(true);
    }
    expect((await s.rows()).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
  });

  it("claims nothing while the service has no sponsored account", async () => {
    const store = memoryStore();
    await store.recordSponsorship({
      id: "0".repeat(32),
      deliveryId: "d-old",
      login: "ana",
      sponsorId: 1,
      sponsorType: "User",
      oneTime: true,
      amountCents: 500,
      privacy: "public",
      createdAt: CREATED,
    });
    const s = await service({ configured: false, store, people: [ANA] });
    s.link(ANA, "ana");
    expect((await s.profile(ANA)).claimed).toBeUndefined();
    expect((await store.sponsorships(50))[0]?.claimedBy).toBeNull();
    expect((await s.admin()).sponsorships).toEqual([]);
  });

  it("answers the sign-ins when the claim fails, and logs no login", async () => {
    const store = memoryStore();
    const failing: CloudStore = {
      ...store,
      unclaimedSponsorship: () => Promise.reject(new Error("the database is down")),
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await service({ store: failing, people: [ANA] });
    s.link(ANA, "ana");
    const view = await s.profile(ANA);
    expect(view.claimed).toBeUndefined();
    expect(view.identities).toHaveLength(2);
    expect(errors.mock.calls.map((call) => call.join(" "))).toEqual([
      "cloud: a sponsorship claim failed: the database is down",
    ]);
  });

  it("lets an administrator revoke a grant by sponsorship by hand, and logs it", async () => {
    const s = await service({ people: [ANA] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent());
    await s.profile(ANA);
    s.p.h.clock.advance(60_000);
    const response = await s.p.sendJson(
      OWNER,
      "PUT",
      `/api/admin/accounts/${ANA}/permissions/unbranded-exports`,
      { granted: false },
    );
    expect((await jsonOf<{ permission: unknown }>(response)).permission).toEqual({
      id: "unbranded-exports",
      granted: false,
      by: OWNER,
      at: s.p.h.clock.now().toISOString(),
    });
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: false,
      unbrandedBy: null,
    });
    expect((await s.admin()).log.map((entry) => entry.action)).toEqual(["revoke", "grant"]);
    // The row stays claimed: the donation is not claimed a second time.
    expect((await s.profile(ANA)).claimed).toBeUndefined();
  });

  it("clears a deleted account's claim, so the account that links the login next is granted", async () => {
    const s = await service({ people: [ANA, BEN] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent());
    await s.profile(ANA);
    const body = JSON.stringify({
      id: "evt_ana",
      type: "user.deleted",
      sub: ANA,
      at: s.p.h.clock.now().toISOString(),
    });
    const deleted = await s.p.h.request("/_identity/events", {
      method: "POST",
      headers: {
        ...JSON_TYPE,
        "Meltemi-Signature": `v1=${createHmac("sha256", s.p.h.env.IDENTITY_EVENTS_SECRET).update(body).digest("hex")}`,
      },
      body,
    });
    expect(deleted.status).toBe(200);
    expect(await s.p.h.store.user(ANA)).toBeUndefined();
    expect((await s.rows())[0]).toMatchObject({ claimedBy: null, claimedAt: null });

    s.link(BEN, "ana");
    expect((await s.profile(BEN)).claimed).toBe(true);
    expect((await s.session(BEN)).user?.entitlements.unbrandedBy).toBe("github-sponsors");
  });
});

describe("what the answers say of it", () => {
  it("adds the sponsors page to every shape of the session answer when configured", async () => {
    const s = await service({ people: [ANA] });
    const support = { url: "https://github.com/sponsors/askenaz" };
    expect((await s.session(ANA)).support).toEqual(support);
    expect(
      (await jsonOf<{ support?: unknown }>(await s.p.anonymous("GET", "/api/session"))).support,
    ).toEqual(support);
    const { token } = await addToken(s.p.h.store, { sub: ANA });
    const byToken = await jsonOf<{ support?: unknown; user: { entitlements: unknown } }>(
      await s.p.h.request("/api/session", bearer(token)),
    );
    expect(byToken.support).toEqual(support);
    expect(byToken.user.entitlements).toEqual({ unbranded: false, unbrandedBy: null });
  });

  it("says who granted the flag: a sponsorship, a person, or nobody for an owner's implicit right", async () => {
    const s = await service({ people: [ANA, BEN] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent());
    await s.profile(ANA);
    await s.p.sendJson(OWNER, "PUT", `/api/admin/accounts/${BEN}/permissions/unbranded-exports`, {
      granted: true,
    });
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: true,
      unbrandedBy: "github-sponsors",
    });
    expect((await s.session(BEN)).user?.entitlements).toEqual({
      unbranded: true,
      unbrandedBy: "administrator",
    });
    expect((await s.session(OWNER)).user?.entitlements).toEqual({
      unbranded: true,
      unbrandedBy: null,
    });
  });

  it("carries no support without the variable", async () => {
    const s = await service({ configured: false, people: [ANA] });
    expect(await s.session(ANA)).not.toHaveProperty("support");
    expect(await jsonOf(await s.p.anonymous("GET", "/api/session"))).not.toHaveProperty("support");
    expect((await s.session(ANA)).user?.entitlements).toEqual({
      unbranded: false,
      unbrandedBy: null,
    });
  });

  it("lists the sponsorships to the owner, the newest first, with who claimed each", async () => {
    const s = await service({ people: [ANA] });
    s.link(ANA, "ana");
    await deliver(s.p, sponsorshipEvent({ login: "ana", createdAt: "2026-11-01T10:00:00Z" }));
    await deliver(
      s.p,
      sponsorshipEvent({
        login: "ben",
        oneTime: true,
        cents: 500,
        privacy: "private",
        createdAt: "2026-11-03T10:00:00Z",
      }),
    );
    await s.profile(ANA);
    expect((await s.admin()).sponsorships).toEqual([
      {
        login: "ben",
        type: "User",
        oneTime: true,
        amountCents: 500,
        status: "active",
        createdAt: "2026-11-03T10:00:00.000Z",
        privacy: "private",
        claimedBy: null,
      },
      {
        login: "ana",
        type: "User",
        oneTime: false,
        amountCents: 1000,
        status: "active",
        createdAt: "2026-11-01T10:00:00.000Z",
        privacy: "public",
        claimedBy: { sub: ANA, name: ANA, handle: null, email: expect.any(String) },
      },
    ]);
    // Nobody else learns of them: the route is the administrators'.
    expect((await s.p.send(ANA, "GET", "/api/admin")).status).toBe(404);
  });
});
