// What GitHub Sponsors tells the Worker (`sponsorship-entitlement`, "Sponsorship deliveries"): the
// `sponsorship` webhook of the sponsored account, `POST /_sponsors/github`. There is no person and
// no `Origin` here: the call is GitHub's, and its `X-Hub-Signature-256` over the exact bytes of the
// body is the only authentication, checked before the body is read as JSON so that nothing
// unsigned changes anything. Nothing of a delivery is ever logged: neither its body nor the secret.

import { GITHUB_LOGIN, sponsorsPage } from "../config.js";
import type { Route } from "../context.js";
import { randomId, verifyHmacHex } from "../crypto.js";
import { fail } from "../errors.js";
import { json, readCappedBytes } from "../http.js";
import type { NewSponsorship, SponsorshipStatus } from "../store/types.js";

/** The most a delivery may weigh: a real sponsorship event is a few kilobytes. */
export const MAX_DELIVERY_BYTES = 64 * 1024;

/** The prefix of GitHub's signature header: `sha256=` and the HMAC in hexadecimal. */
const SIGNATURE_PREFIX = "sha256=";

/** A delivery's id as GitHub sends it (a GUID); anything else is no delivery. */
const DELIVERY_ID = /^[A-Za-z0-9-]{1,100}$/;

/** An ISO 8601 time with a zone, as GitHub stamps a sponsorship. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** What the actions after `created` make of the sponsorship's status. */
const STATUS_OF: Readonly<Record<string, SponsorshipStatus>> = {
  edited: "active",
  tier_changed: "active",
  pending_tier_change: "active",
  pending_cancellation: "pending-cancellation",
  cancelled: "cancelled",
};

/** The fields of a `sponsorship` event the service keeps, read and checked. */
interface SponsorshipEvent {
  readonly action: string;
  readonly sponsorable: string;
  readonly login: string;
  readonly sponsorId: number;
  readonly sponsorType: string;
  readonly oneTime: boolean;
  readonly amountCents: number;
  readonly privacy: "public" | "private";
  readonly createdAt: string;
}

/** Whether the body is declared JSON: `application/json`, with or without parameters. */
function isJsonType(type: string | null): boolean {
  return type !== null && /^application\/json\s*(?:;|$)/i.test(type.trim());
}

const objectIn = (value: unknown, key: string): Record<string, unknown> | undefined => {
  const field = (value as Record<string, unknown> | undefined)?.[key];
  return field !== null && typeof field === "object" && !Array.isArray(field)
    ? (field as Record<string, unknown>)
    : undefined;
};

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isLogin = (value: unknown): value is string =>
  typeof value === "string" && GITHUB_LOGIN.test(value);

/**
 * The sponsorship an event carries: its action, the sponsorable's login, the sponsor's login, id
 * and type, the tier's kind and amount, the privacy level and the creation time. A field missing or
 * of another shape is `400 request.invalid`.
 */
function readSponsorship(body: Record<string, unknown>): SponsorshipEvent {
  const invalid = () => fail("request.invalid", "The delivery is not a sponsorship event.");
  const action = body["action"];
  const sponsorship = objectIn(body, "sponsorship");
  const sponsor = objectIn(sponsorship, "sponsor");
  const sponsorable = objectIn(sponsorship, "sponsorable");
  const tier = objectIn(sponsorship, "tier");
  if (typeof action !== "string" || !sponsorship || !sponsor || !sponsorable || !tier) {
    throw invalid();
  }
  const login = sponsor["login"];
  const id = sponsor["id"];
  const type = sponsor["type"];
  const oneTime = tier["is_one_time"];
  const amount = tier["monthly_price_in_cents"];
  const privacy = sponsorship["privacy_level"];
  const created = sponsorship["created_at"];
  if (!isLogin(login) || !isCount(id) || typeof type !== "string") throw invalid();
  if (type === "" || type.length > 40 || !isLogin(sponsorable["login"])) throw invalid();
  if (typeof oneTime !== "boolean" || !isCount(amount)) throw invalid();
  if (privacy !== "public" && privacy !== "private") throw invalid();
  if (typeof created !== "string" || !ISO_TIME.test(created)) throw invalid();
  const time = new Date(created);
  if (Number.isNaN(time.getTime())) throw invalid();
  return {
    action,
    sponsorable: sponsorable["login"] as string,
    login,
    sponsorId: id,
    sponsorType: type,
    oneTime,
    amountCents: amount,
    privacy,
    createdAt: time.toISOString(),
  };
}

/** The same login, as GitHub compares them: ignoring the case of the letters. */
const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * `POST /_sponsors/github`: a delivery of the Sponsors webhook of `SPONSORS_ACCOUNT`.
 *
 * Without the variable the path does not exist (`404 not-found`). A body that is not declared
 * `application/json` is `415 request.unsupported` (the webhook's form chooses the type), one over
 * 64 KiB is `400 request.invalid` and read no further, and one whose `X-Hub-Signature-256` is not
 * `sha256=` and the HMAC-SHA-256 of its exact bytes with `SPONSORS_WEBHOOK_SECRET` is `401
 * signature.invalid`, with nothing parsed. Signed, the body is read as JSON (`400` when it is not):
 * a `ping` or any other event, and a sponsorship of another sponsorable, are `200 { ignored }`; a
 * `created` sponsorship is kept, once per `X-GitHub-Delivery` (`200 { repeated }` for a repeat), as
 * an unclaimed row; the later actions set the status of the newest sponsorship of that login and
 * kind (`200 { updated }`) and change no entitlement. A failure of the store is a `500`, which
 * GitHub's dashboard shows and the owner redelivers.
 */
export const sponsorsRoute: Route = async (ctx) => {
  const account = ctx.config.sponsorsAccount;
  if (account === undefined) {
    if ((ctx.env.SPONSORS_ACCOUNT ?? "").trim() !== "") {
      console.error("cloud: SPONSORS_ACCOUNT is not a GitHub login; deliveries are refused");
    }
    throw fail("not-found");
  }
  const secret = ctx.env.SPONSORS_WEBHOOK_SECRET ?? "";
  if (secret.trim() === "") {
    // Nothing can be verified without the key: refuse everything, loudly, naming the secret only.
    console.error("cloud: SPONSORS_WEBHOOK_SECRET is not set; sponsorship deliveries are refused");
    throw fail("internal");
  }
  const { request } = ctx;
  if (!isJsonType(request.headers.get("Content-Type"))) throw fail("request.unsupported");
  const bytes = await readCappedBytes(request, MAX_DELIVERY_BYTES);
  if (bytes === undefined) throw fail("request.invalid", "The delivery is too long.");
  const signature = request.headers.get("X-Hub-Signature-256") ?? "";
  if (
    !signature.startsWith(SIGNATURE_PREFIX) ||
    !(await verifyHmacHex(secret, bytes, signature.slice(SIGNATURE_PREFIX.length)))
  ) {
    throw fail("signature.invalid");
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw fail("request.invalid", "The delivery is not JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw fail("request.invalid", "The delivery is not a JSON object.");
  }
  if (request.headers.get("X-GitHub-Event") !== "sponsorship") return json({ ignored: true });
  const delivery = request.headers.get("X-GitHub-Delivery") ?? "";
  if (!DELIVERY_ID.test(delivery)) {
    throw fail("request.invalid", "The delivery has no X-GitHub-Delivery.");
  }
  const event = readSponsorship(body as Record<string, unknown>);
  if (!sameLogin(event.sponsorable, account)) return json({ ignored: true });

  const { store } = ctx.deps;
  if (event.action === "created") {
    const sponsorship: NewSponsorship = {
      id: randomId(ctx.deps.randomBytes),
      deliveryId: delivery,
      login: event.login,
      sponsorId: event.sponsorId,
      sponsorType: event.sponsorType,
      oneTime: event.oneTime,
      amountCents: event.amountCents,
      privacy: event.privacy,
      createdAt: event.createdAt,
    };
    const outcome = await store.recordSponsorship(sponsorship);
    return json(outcome === "repeated" ? { repeated: true } : { recorded: true });
  }
  // An own key only: an action named after a property of every object is no action of GitHub's.
  const status = Object.hasOwn(STATUS_OF, event.action) ? STATUS_OF[event.action] : undefined;
  if (status === undefined) return json({ ignored: true });
  const updated = await store.updateSponsorship(event.login, event.oneTime, status, event.privacy);
  return json({ updated });
};

/** The `support` of the session answer: where to donate, when the service has a sponsored account. */
export function supportOf(account: string | undefined): { readonly url: string } | undefined {
  return account === undefined ? undefined : { url: sponsorsPage(account) };
}
