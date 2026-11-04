// Versions (`cloud-projects`, "Versions"): the policy as plain functions, and the one place a version
// is recorded. Nothing here knows a request, the room or R2: the store and the clock come in as
// arguments, so every rule runs in Node with a fake clock.
//
// The policy. A project holds at most `CLOUD_LIMITS.versions` versions, labelled ones counted.
// Unlabelled versions (the automatic ones and the unnamed ones alike) are thinned: more than
// `CLOUD_LIMITS.unlabelledVersions` of them go, oldest first, and the unlabelled versions older than
// thirty days keep only the newest of each ISO week. A labelled version never goes.
//
// Thinning never costs a person anything they did not ask for: a version that is refused (by the
// rate, or by a project that is full of labelled versions) deletes nothing, and one that is recorded
// thins the project afterwards, so what a project holds is always what the policy allows.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { compareBinary } from "./store/shared.js";
import type { CloudStore, Iso, Version, VersionGuard } from "./store/types.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Unlabelled versions older than this keep only the newest of each ISO week. */
export const WEEKLY_AFTER_MS = 30 * DAY_MS;
/** The window `CLOUD_LIMITS.versionsPerMinute` counts in. */
export const RATE_WINDOW_MS = 60 * 1000;
/** The longest label, in characters (code points) after trimming. */
export const MAX_LABEL_LENGTH = 80;

/** What a label may not hold: control characters, line and paragraph separators, lone surrogates. */
const FORBIDDEN_IN_LABEL = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

/**
 * The label a person gave, as it is kept: trimmed, at most 80 characters (counted as characters, not
 * UTF-16 units), nothing that cannot be shown. Empty, or no label at all, is `null`: a version with
 * none. `undefined` is returned for anything that is not a label, which is `request.invalid`.
 */
export function readLabel(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  if (label === "") return null;
  if (Array.from(label).length > MAX_LABEL_LENGTH || FORBIDDEN_IN_LABEL.test(label)) {
    return undefined;
  }
  return label;
}

/**
 * The ISO 8601 week of a moment, in UTC, as `YYYY-Www`: weeks begin on Monday and week 1 holds the
 * first Thursday of the year, so the year of a week can differ from the year of its days
 * (2027-01-01 is in 2026-W53, 2024-12-30 in 2025-W01).
 */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // The Thursday of the week decides the year, and its place in that year decides the week.
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday + 3);
  const year = day.getUTCFullYear();
  const week = Math.floor((day.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The UTC day of a stored time, `YYYY-MM-DD`. */
export const dayOf = (time: Iso): string => time.slice(0, 10);

export interface ThinOptions {
  /**
   * A new unlabelled version is about to be made: it counts toward the unlabelled versions that
   * stay, so that the oldest one goes to make room for it.
   */
  readonly incoming?: boolean;
  /** How many unlabelled versions stay; `CLOUD_LIMITS.unlabelledVersions` by default. */
  readonly keep?: number;
}

/** Whether `a` was made after `b`: the later time, and of one time the greater number. */
const newer = (a: Version, b: Version): boolean =>
  a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.number > b.number);

/**
 * The numbers of the versions the policy lets go at `now`, ascending. Labelled versions are never
 * among them. First the unlabelled versions older than thirty days give way to the newest of their
 * ISO week (among the old ones of that week); then, of those that stay, the oldest go while more
 * than `keep` remain.
 */
export function versionsToThin(
  versions: readonly Version[],
  now: Date,
  options: ThinOptions = {},
): number[] {
  const keep = options.keep ?? CLOUD_LIMITS.unlabelledVersions;
  const oldBefore = now.getTime() - WEEKLY_AFTER_MS;
  const unlabelled = versions.filter((version) => version.label === null);
  const doomed = new Set<number>();

  const newestOfWeek = new Map<string, Version>();
  for (const version of unlabelled) {
    const at = Date.parse(version.createdAt);
    // Not older than thirty days, or a time that is not one: stays.
    if (!(at < oldBefore)) continue;
    const week = isoWeek(new Date(at));
    const best = newestOfWeek.get(week);
    if (best === undefined || newer(version, best)) {
      if (best !== undefined) doomed.add(best.number);
      newestOfWeek.set(week, version);
    } else {
      doomed.add(version.number);
    }
  }

  const remaining = unlabelled
    .filter((version) => !doomed.has(version.number))
    .sort((a, b) => a.number - b.number);
  const room = Math.max(0, keep - (options.incoming === true ? 1 : 0));
  for (const version of remaining.slice(0, Math.max(0, remaining.length - room))) {
    doomed.add(version.number);
  }
  return [...doomed].sort((a, b) => a - b);
}

/** The paths of `current` that differ from `previous` (added or changed) and those it lost, in binary order. */
export function changedPaths(
  previous: ReadonlyMap<string, string> | undefined,
  current: ReadonlyMap<string, string>,
): string[] {
  const changed: string[] = [];
  for (const [path, hash] of current) if (previous?.get(path) !== hash) changed.push(path);
  if (previous) for (const path of previous.keys()) if (!current.has(path)) changed.push(path);
  return changed.sort(compareBinary);
}

/** Whether two sets of files are the same: the same paths with the same hashes. */
export function sameFiles(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [path, hash] of a) if (b.get(path) !== hash) return false;
  return true;
}

// Recording ------------------------------------------------------------------------------------

export interface RecordVersion {
  readonly projectId: string;
  /** The project's owner, whose usage follows (the versions' blobs are theirs). */
  readonly owner: string;
  readonly label: string | null;
  readonly auto: boolean;
  /** The sub of the person the version is made for. */
  readonly createdBy: string;
  readonly now: Date;
  /**
   * Whether `CLOUD_LIMITS.versionsPerMinute` applies. A person's request does; the daily version,
   * which the service makes by itself, does not.
   */
  readonly rated: boolean;
}

export interface Recorded {
  readonly version: Version;
  /** What the project holds now, thinning done, oldest first: the version is the last. */
  readonly remaining: readonly Version[];
}

/**
 * Records a version of the project's materialised files: the cap and the rate are checked by the
 * store in the statement that inserts it (`"quota"`, then `"rate"`; `"missing"` for a project that is
 * gone), and then the project is thinned by the policy.
 *
 * A project that is full is thinned first and tried once more, counting the version about to be made
 * (a project of 100 unlabelled and 100 labelled versions makes room by letting its oldest unlabelled
 * one go); but a request the rate would refuse deletes nothing. The files are the project's as the
 * last materialisation wrote them: call `rooms.materialise` first.
 */
export async function recordVersion(
  store: CloudStore,
  input: RecordVersion,
): Promise<Recorded | "quota" | "rate" | "missing"> {
  const { projectId, now } = input;
  const since: Iso = new Date(now.getTime() - RATE_WINDOW_MS).toISOString();
  const rate = { max: CLOUD_LIMITS.versionsPerMinute, since };
  const guard: VersionGuard = {
    maxVersions: CLOUD_LIMITS.versions,
    ...(input.rated ? { rate } : {}),
  };
  const draft = {
    projectId,
    label: input.label,
    auto: input.auto,
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
  };

  let made = await store.createVersion(draft, guard);
  if (made === "quota") {
    const doomed = versionsToThin(await store.listVersions(projectId), now, {
      incoming: input.label === null,
    });
    if (doomed.length === 0) return "quota";
    // Making room for a version the rate refuses would lose a version for nothing.
    if (input.rated && (await store.countVersionsSince(projectId, since)) >= rate.max) {
      return "rate";
    }
    await store.deleteVersions(projectId, doomed);
    made = await store.createVersion(draft, guard);
  }
  if (typeof made === "string") return made;

  const held = await store.listVersions(projectId);
  const doomed = new Set(versionsToThin(held, now));
  if (doomed.size > 0) await store.deleteVersions(projectId, [...doomed]);
  await store.refreshStorageBytes(input.owner);
  return { version: made, remaining: held.filter((version) => !doomed.has(version.number)) };
}

/**
 * The daily version (`cloud-projects`, "Versions"): the first materialisation of a UTC day that
 * finds the files changed since the latest version records one unlabelled automatic version, so that
 * "what did it look like yesterday" has an answer without anybody naming anything. `files` is the
 * project as the materialisation just wrote it. Answers how many D1 rows it wrote (0 for none).
 *
 * It is skipped, silently, when a version was already made today (by anybody), when the project holds
 * no files and no version, when the files are the latest version's, and when the project is full of
 * versions the policy keeps. A project that has no version yet gets its first one on a day after the
 * day it was created: its creation is not a change to keep.
 */
export async function recordDailyVersion(
  store: CloudStore,
  input: {
    readonly projectId: string;
    readonly files: ReadonlyMap<string, string>;
    readonly now: Date;
    /** The owner, when the caller already knows it. */
    readonly owner?: string;
  },
): Promise<number> {
  const { projectId, files, now } = input;
  const today = dayOf(now.toISOString());
  const latest = await store.latestVersion(projectId);
  if (latest !== undefined && dayOf(latest.createdAt) >= today) return 0;

  const owner = input.owner ?? (await store.ownerOf(projectId));
  if (owner === undefined) return 0;
  let before: ReadonlyMap<string, string> = new Map();
  if (latest !== undefined) {
    before = (await store.versionFiles(projectId, latest.number)) ?? new Map();
  } else {
    const project = await store.project(owner, projectId);
    if (project === undefined || dayOf(project.createdAt) >= today) return 0;
  }
  if (sameFiles(before, files)) return 0;

  const recorded = await recordVersion(store, {
    projectId,
    owner,
    label: null,
    auto: true,
    createdBy: owner,
    now,
    rated: false,
  });
  if (typeof recorded === "string") return 0;
  // The version row, and one row for each file it holds.
  return 1 + files.size;
}
