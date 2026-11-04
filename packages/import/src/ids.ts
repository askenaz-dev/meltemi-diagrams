import type { Span } from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import type { Reporter } from "./report.js";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `id` can be written as is. */
export function isPlainId(id: string): boolean {
  return IDENTIFIER.test(id);
}

/**
 * Rewrites any text into an identifier: accents removed, other characters as `_`, a leading digit
 * prefixed with `n`. Statement words are contextual in the language, so `node` or `else` stay ids.
 */
export function sanitizeId(raw: string): string {
  if (isPlainId(raw)) return raw;
  let id = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_");
  if (id !== raw) id = id.replace(/^_+(?=.)/, "").replace(/(?<=.)_+$/, "");
  if (id === "" || id === "_") id = "n";
  if (/^[0-9]/.test(id)) id = `n${id}`;
  return id;
}

/** A readable id from a title or a file name: lower case words joined by `_`. */
export function slugId(text: string, fallback: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "");
  let id = "";
  for (const word of words) {
    const next = id === "" ? word : `${id}_${word}`;
    if (next.length > 40 && id !== "") break;
    id = next.slice(0, 40);
  }
  if (id === "") return fallback;
  if (/^[0-9]/.test(id)) id = `n${id}`;
  return id;
}

/**
 * Maps source ids to unique identifiers within one namespace, the same source id always to the
 * same result. Rewritten ids are reported once as `import.renamed-id`.
 */
export class IdMap {
  private readonly bySource = new Map<string, string>();
  private readonly used = new Set<string>();

  constructor(
    private readonly reporter: Reporter | null,
    reserved: Iterable<string> = [],
  ) {
    for (const id of reserved) this.used.add(id);
  }

  has(source: string): boolean {
    return this.bySource.has(source);
  }

  get(source: string): string | undefined {
    return this.bySource.get(source);
  }

  /** The id of a source id, creating it on first use. */
  id(source: string, span?: Span): string {
    const known = this.bySource.get(source);
    if (known !== undefined) return known;
    const base = sanitizeId(source);
    const id = this.unique(base);
    this.bySource.set(source, id);
    if (id !== source && this.reporter && span) {
      this.reporter.add({
        code: "import.renamed-id",
        severity: "info",
        message: messages().import.renamedId(source, id),
        span,
        construct: "id",
        status: null,
        essential: false,
      });
    }
    return id;
  }

  /** A fresh id that no source id maps to, such as `e1` or `note2`. */
  fresh(prefix: string): string {
    for (let n = 1; ; n++) {
      const id = `${prefix}${n}`;
      if (!this.used.has(id)) {
        this.used.add(id);
        return id;
      }
    }
  }

  /** Marks an id as taken, without a source. Returns false when it already was. */
  reserve(id: string): boolean {
    if (this.used.has(id)) return false;
    this.used.add(id);
    return true;
  }

  unique(base: string): string {
    if (!this.used.has(base)) {
      this.used.add(base);
      return base;
    }
    for (let n = 2; ; n++) {
      const id = `${base}_${n}`;
      if (!this.used.has(id)) {
        this.used.add(id);
        return id;
      }
    }
  }
}
