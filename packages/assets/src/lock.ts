/** The asset lock, `assets.lock.json`: versions, sources, licences and integrity of every asset. */
import { messages } from "./messages/index.js";

export const LOCK_NAME = "assets.lock.json";
export const LOCK_VERSION = 1;

export interface LockedPack {
  readonly version: string | null;
  readonly source: string;
  readonly license: string | null;
  /** `sha256-<base64>` for project packs; absent for built-in packs, pinned by version. */
  readonly integrity?: string;
}

export interface LockedFont {
  readonly family: string;
  readonly license: string | null;
  readonly integrity: string;
}

/** A plugin as installed: its version, folder and the integrity of its manifest. */
export interface LockedPlugin {
  readonly version: string;
  readonly path: string;
  readonly integrity: string;
}

export interface AssetLock {
  readonly lockVersion: number;
  readonly icons: Readonly<Record<string, LockedPack>>;
  /** Fonts by project path. */
  readonly fonts: Readonly<Record<string, LockedFont>>;
  /** Plugins by name; absent when the project installs none. */
  readonly plugins?: Readonly<Record<string, LockedPlugin>>;
}

function sortKeys<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key]!;
  return sorted;
}

/** Stable text of a lock: sorted keys, two-space indentation, a final line break. */
export function formatLock(lock: AssetLock): string {
  const icons: Record<string, LockedPack> = {};
  for (const [prefix, pack] of Object.entries(sortKeys(lock.icons))) {
    icons[prefix] = {
      version: pack.version,
      source: pack.source,
      license: pack.license,
      ...(pack.integrity === undefined ? {} : { integrity: pack.integrity }),
    };
  }
  const fonts: Record<string, LockedFont> = {};
  for (const [path, font] of Object.entries(sortKeys(lock.fonts))) {
    fonts[path] = { family: font.family, license: font.license, integrity: font.integrity };
  }
  const plugins =
    lock.plugins && Object.keys(lock.plugins).length > 0 ? sortKeys(lock.plugins) : undefined;
  return `${JSON.stringify({ lockVersion: lock.lockVersion, icons, fonts, ...(plugins ? { plugins } : {}) }, null, 2)}\n`;
}

/**
 * What changed between a written lock and the current assets, as readable reasons by key, in the
 * interface language of the moment they are compared.
 */
export function compareLocks(written: AssetLock, current: AssetLock): string[] {
  const t = messages().lock;
  const changes: string[] = [];
  const keys = (a: object, b: object) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const prefix of keys(written.icons, current.icons)) {
    const before = written.icons[prefix];
    const after = current.icons[prefix];
    if (!before) changes.push(t.packAdded(prefix));
    else if (!after) changes.push(t.packRemoved(prefix));
    else if (before.version !== after.version) {
      changes.push(t.packVersion(prefix, before.version, after.version));
    } else if (before.integrity !== after.integrity) changes.push(t.packContent(prefix));
    else if (before.license !== after.license) changes.push(t.packLicense(prefix));
  }
  for (const path of keys(written.fonts, current.fonts)) {
    const before = written.fonts[path];
    const after = current.fonts[path];
    if (!before) changes.push(t.fontAdded(path));
    else if (!after) changes.push(t.fontRemoved(path));
    else if (before.integrity !== after.integrity) changes.push(t.fontContent(path));
    else if (before.license !== after.license) changes.push(t.fontLicense(path));
  }
  const writtenPlugins = written.plugins ?? {};
  const currentPlugins = current.plugins ?? {};
  for (const name of keys(writtenPlugins, currentPlugins)) {
    const before = writtenPlugins[name];
    const after = currentPlugins[name];
    if (!before) changes.push(t.pluginAdded(name));
    else if (!after) changes.push(t.pluginRemoved(name));
    else if (before.version !== after.version) {
      changes.push(t.pluginVersion(name, before.version, after.version));
    } else if (before.integrity !== after.integrity) changes.push(t.pluginContent(name));
    else if (before.path !== after.path) changes.push(t.pluginMoved(name, after.path));
  }
  return changes;
}
