import { verifyEventSignature } from "@meltemi/identity";
import type { Route } from "../context.js";
import { fail } from "../errors.js";
import { json, readCappedBytes } from "../http.js";
import { publishedKey, thumbnailKey } from "../keys.js";

/** The most a deletion event may weigh: a real one is under 300 bytes. */
const MAX_BODY_BYTES = 8 * 1024;

/** The one event type the service acts on. */
const USER_DELETED = "user.deleted";

/** An ISO 8601 time with a zone, the shape the identity service stamps its events with. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface IdentityEvent {
  readonly id: string;
  readonly type: string;
  readonly sub: string;
  /** The event's time in the store's canonical form (UTC, with milliseconds). */
  readonly at: string;
}

/**
 * The body of a request as text, never holding more than `maxBytes` of it: a caller that declares
 * more, or sends more, is refused and the rest of the stream is not read.
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const bytes = await readCappedBytes(request, maxBytes);
  if (bytes === undefined) throw fail("request.invalid", "The request body is too long.");
  return new TextDecoder().decode(bytes);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * The event a signed body carries: a JSON object with the text fields `id`, `type`, `sub` and `at`
 * (any others are ignored). Anything else is `400 request.invalid`.
 */
function readEvent(body: string): IdentityEvent {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw fail("request.invalid");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw fail("request.invalid");
  }
  const { id, type, sub, at } = value as Record<string, unknown>;
  if (!isText(id) || !isText(type) || !isText(sub)) throw fail("request.invalid");
  if (typeof at !== "string" || !ISO_TIME.test(at)) throw fail("request.invalid");
  const time = new Date(at);
  if (Number.isNaN(time.getTime())) throw fail("request.invalid");
  return { id, type, sub, at: time.toISOString() };
}

/**
 * `POST /_identity/events`: what the identity service tells this product (`@meltemi/identity`'s
 * README). There is no person and no `Origin` here: the call is the identity service's own, and its
 * `Meltemi-Signature` over the exact text of the body is the only authentication, checked before the
 * body is read as JSON so that nothing unsigned changes anything.
 *
 * A `user.deleted` event removes everything held for its `sub` once (delivery is at least once, so
 * a repeat of an event id changes nothing): the user, tokens and codes, the projects with their rows
 * (members, invitations and publications included), the person's memberships in the projects of
 * others and their open sockets there, and the rooms, thumbnails and published pages that no row
 * names. The answer is `200` only
 * after the data is gone; a failure is a non-2xx, which the identity service retries. Any other type
 * of event is signed, acknowledged and ignored.
 */
export const eventsRoute: Route = async (ctx) => {
  const secret = ctx.env.IDENTITY_EVENTS_SECRET;
  if (!secret) {
    // Nothing can be verified without the key: refuse everything, loudly, and let the sender retry.
    console.error("cloud: IDENTITY_EVENTS_SECRET is not set; deletion events cannot be verified");
    throw fail("internal");
  }
  const body = await readCappedText(ctx.request, MAX_BODY_BYTES);
  const signature = ctx.request.headers.get("Meltemi-Signature");
  if (!(await verifyEventSignature(secret, body, signature))) throw fail("signature.invalid");

  const event = readEvent(body);
  if (event.type !== USER_DELETED) return json({ status: "ignored" });
  const { store, rooms } = ctx.deps;
  // The person's projects have a room each and, maybe, a thumbnail: neither is a row, so the event
  // cannot remove them and only the rows know which projects they were. Their ids are read BEFORE
  // the event removes the rows, the rooms and thumbnails go, and then the event is applied. Every
  // step is safe to repeat, so a delivery that follows a failure finishes the job.
  //
  //
  // The person's open sockets in the projects of others are cut too: a room resolves the role of a
  // socket once, when it opens, so a member whose membership the event removes would otherwise go
  // on writing as an editor until the connection happened to end. They are cut before the event is
  // applied (a failure is an error, the event is delivered again and the rows that name those
  // projects are still here) and once more after it, for a page that reconnected in between: from
  // then on the upgrade is refused, because the membership and the session are gone.
  //
  // Not for an event that was already handled: a person who signed in again (the same `sub`) and
  // made projects since is not the person this event is about, and a late repeat must not touch
  // them. `deletedSince` is true for the event itself once it was handled.
  let shared: string[] = [];
  if (!(await store.deletedSince(event.sub, event.at))) {
    // The published pages are objects too, and only the publications' rows know their addresses.
    const published = await store.publicationsOwnedBy(event.sub);
    for (const projectId of await store.projectIdsOf(event.sub)) {
      await rooms.destroy(projectId);
      await ctx.env.BLOBS.delete(thumbnailKey(projectId));
    }
    for (const { handle, slug } of published)
      await ctx.env.BLOBS.delete(publishedKey(handle, slug));
    shared = (await store.listProjects(event.sub))
      .filter((project) => project.role !== "owner")
      .map((project) => project.id);
    for (const projectId of shared) await rooms.disconnect(projectId, { sub: event.sub });
  }
  const status = await store.applyUserDeleted(event.id, event.sub, event.at);
  for (const projectId of shared) {
    try {
      await rooms.disconnect(projectId, { sub: event.sub });
    } catch {
      // The first cut was made and the upgrade is refused now: only a page that reconnected in the
      // few milliseconds between them stays, and nothing can retry it, the memberships being gone.
      console.warn("cloud: could not cut the sockets of a deleted account in a shared project");
    }
  }
  return json({ status });
};
