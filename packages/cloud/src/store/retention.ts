import type { Iso } from "./types.js";

/** How long a caller's failed exchanges of the command line are kept: an hour. */
export const CLI_FAILURE_KEEP_MS = 60 * 60 * 1000;

/**
 * The time before which a caller's failures are dropped when it fails again at `at`: one hour
 * earlier. A failure exactly that old is kept; one a millisecond older goes. Both stores use it,
 * so they prune the same rows. An `at` that is not a time is a caller's mistake and throws.
 */
export function cliFailureCutoff(at: Iso): Iso {
  return new Date(Date.parse(at) - CLI_FAILURE_KEEP_MS).toISOString();
}

/**
 * How long a handled deletion event is kept: 31 days. A session lasts thirty days, so after that
 * no cookie issued before the deletion can be presented any more, and the identity service stops
 * retrying an event after seven days: the record has nothing left to do.
 */
export const DELETION_KEEP_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * The time before which handled deletion events are dropped by a sweep at `now`: 31 days earlier.
 * An event exactly that old is kept; one a millisecond older goes. Both stores use it. A `now` that
 * is not a time is a caller's mistake and throws.
 */
export function deletionCutoff(now: Iso): Iso {
  return new Date(Date.parse(now) - DELETION_KEEP_MS).toISOString();
}

/** The window of the publish rate: a project may publish `CLOUD_LIMITS.publishesPerHour` times in it. */
export const PUBLISH_WINDOW_MS = 60 * 60 * 1000;

/**
 * The time before which a publish request no longer counts at `now`: one hour earlier. A request
 * exactly that old still counts (and is kept by the sweep); one a millisecond older counts for
 * nothing and goes. Both stores use it. A `now` that is not a time is a caller's mistake and throws.
 */
export function publishCutoff(now: Iso): Iso {
  return new Date(Date.parse(now) - PUBLISH_WINDOW_MS).toISOString();
}

/** How long an invitation can be accepted: thirty days from the moment it was made. */
export const INVITATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The time an invitation made at `createdAt` stops being valid: thirty days later. It is valid
 * while `now` is before that, and expired from that very moment on.
 */
export function invitationExpiresAt(createdAt: Iso): Iso {
  return new Date(Date.parse(createdAt) + INVITATION_LIFETIME_MS).toISOString();
}

/**
 * The time after which an invitation made then is still valid at `now`: thirty days earlier. An
 * invitation made exactly then has expired; one a millisecond later is valid. Both stores filter
 * with it (`created_at > cutoff`): expired rows are not removed by a sweep, they are not listed,
 * not counted against the limit and not accepted, and go with their project. A `now` that is not
 * a time is a caller's mistake and throws.
 */
export function invitationCutoff(now: Iso): Iso {
  return new Date(Date.parse(now) - INVITATION_LIFETIME_MS).toISOString();
}
