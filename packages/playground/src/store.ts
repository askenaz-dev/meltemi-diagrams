import { cleanPath } from "./files.js";
import type { LanguageChoice } from "./language.js";

/** Keys of what the page keeps in the browser. */
export const STORE_KEYS = {
  project: "meltemi-playground:project:v1",
  previous: "meltemi-playground:previous:v1",
  settings: "meltemi-playground:settings:v1",
} as const;

/** Images larger than this are not kept between visits. */
export const KEPT_IMAGE_BYTES = 512 * 1024;

/** A project as the browser keeps it. */
export interface KeptProject {
  readonly open: string;
  readonly files: ReadonlyMap<string, string | Uint8Array>;
  /** Images left out because they are too large. */
  readonly skipped?: readonly string[];
}

/** Settings of the page, kept per browser. */
export interface Settings {
  theme?: "light" | "dark";
  /** The interface language: `auto` (the default) follows the browser. */
  language?: LanguageChoice;
  /** The share of the width the code takes, from 0.2 to 0.8. */
  split?: number;
  canvas?: unknown;
  /** The explorer: its width in pixels, whether it is a rail, and whether every file is listed. */
  explorer?: { width?: number; collapsed?: boolean; showAll?: boolean };
  /** The code pane: whether it is folded to a rail (its share stays in `split`). */
  code?: { collapsed?: boolean };
}

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * What this tab last loaded from a key or wrote to it (the stored text, or null for nothing).
 * Another tab's write to the key shows as a difference (`keptByAnotherTab`).
 */
const holding = new Map<string, string | null>();

function stored(key: string): string | null | undefined {
  try {
    return storage()?.getItem(key);
  } catch {
    return undefined;
  }
}

/**
 * Whether another tab wrote the key since this tab loaded it or wrote it. A slot that was emptied
 * (the browser's data cleared, the key removed) holds no work of another tab to protect.
 */
export function keptByAnotherTab(key: string): boolean {
  if (!holding.has(key)) return false;
  const now = stored(key);
  return now !== undefined && now !== null && now !== holding.get(key);
}

/**
 * As `keepProject`, for a tab that changed nothing since it loaded or kept the key (opening a
 * cloud project, signing in, changing the language): when another tab kept the key since, that
 * tab's work is newer than this tab's copy, and it is left as it is.
 */
export function keepProjectIfCurrent(
  key: string,
  project: { open: string; files: Iterable<readonly [string, string | Uint8Array]> },
): "kept" | "unavailable" | "full" {
  return keptByAnotherTab(key) ? "kept" : keepProject(key, project);
}

/**
 * Keeps a project in the browser: text files, and images up to `KEPT_IMAGE_BYTES`. Returns
 * whether it was kept: `unavailable` without storage, `full` when the browser refused the size.
 */
export function keepProject(
  key: string,
  project: { open: string; files: Iterable<readonly [string, string | Uint8Array]> },
): "kept" | "unavailable" | "full" {
  const store = storage();
  if (!store) return "unavailable";
  const files: Record<string, string | { base64: string }> = {};
  const skipped: string[] = [];
  for (const [path, content] of project.files) {
    if (typeof content === "string") files[path] = content;
    else if (content.length <= KEPT_IMAGE_BYTES) files[path] = { base64: toBase64(content) };
    else skipped.push(path);
  }
  try {
    const text = JSON.stringify({ v: 1, open: project.open, files, skipped });
    store.setItem(key, text);
    holding.set(key, text);
    return "kept";
  } catch {
    return "full";
  }
}

/**
 * The project kept under a key, or undefined. With `loading`, the page is putting it in its
 * editor: this tab then holds what it read, and a later write by another tab can be told apart.
 */
export function keptProject(
  key: string,
  options: { loading?: boolean } = {},
): KeptProject | undefined {
  const store = storage();
  let text: string | null | undefined;
  try {
    text = store?.getItem(key);
  } catch {
    return undefined;
  }
  if (options.loading && text !== undefined) holding.set(key, text);
  if (!text) return undefined;
  try {
    const data = JSON.parse(text) as {
      v?: number;
      open?: string;
      files?: Record<string, string | { base64: string }>;
      skipped?: string[];
    };
    if (data.v !== 1 || !data.files) return undefined;
    const files = new Map<string, string | Uint8Array>();
    for (const [path, content] of Object.entries(data.files)) {
      const clean = cleanPath(path);
      if (!clean) continue;
      files.set(clean, typeof content === "string" ? content : fromBase64(content.base64));
    }
    return {
      open: typeof data.open === "string" ? data.open : "",
      files,
      ...(data.skipped?.length ? { skipped: data.skipped } : {}),
    };
  } catch {
    return undefined;
  }
}

export function forget(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/** The settings kept in this browser; none when nothing, or nothing readable, is kept. */
export function loadSettings(): Settings {
  try {
    const text = storage()?.getItem(STORE_KEYS.settings);
    const value: unknown = text ? JSON.parse(text) : {};
    return value !== null && typeof value === "object" ? (value as Settings) : {};
  } catch {
    return {};
  }
}

/** Keeps the settings; false when the browser keeps nothing. */
export function saveSettings(settings: Settings): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORE_KEYS.settings, JSON.stringify(settings));
    return true;
  } catch {
    // Settings are a convenience; the page works without them.
    return false;
  }
}
