// Values the store suites share: the clock, hashes, and a value that must be there.

import { createHash } from "node:crypto";
import type { Iso } from "../../src/store/types.js";

export const T0 = Date.parse("2026-10-14T12:00:00.000Z");
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** An ISO time `ms` milliseconds after the suite's origin. */
export const at = (ms: number): Iso => new Date(T0 + ms).toISOString();

/** The SHA-256 in hexadecimal of a label: what a token, a code or a blob rests as. */
export const sha = (label: string): string => createHash("sha256").update(label).digest("hex");

export function present<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("expected a value, got none");
  return value;
}
