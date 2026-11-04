import type { Span } from "@meltemi/diagrams-language";
import { messages } from "../messages/index.js";
import type { Reporter, SourceLine } from "../report.js";

/** A cursor over preprocessed lines that readers advance through multi-line constructs. */
export class Lines {
  index = 0;

  constructor(readonly lines: readonly SourceLine[]) {}

  get done(): boolean {
    return this.index >= this.lines.length;
  }

  next(): SourceLine | undefined {
    return this.lines[this.index++];
  }

  peek(): SourceLine | undefined {
    return this.lines[this.index];
  }

  /** Lines up to the one matching `end` (consumed), or to the end of the block. */
  until(end: RegExp): { body: SourceLine[]; closed: boolean } {
    const body: SourceLine[] = [];
    while (!this.done) {
      const line = this.next()!;
      if (end.test(line.text.trim())) return { body, closed: true };
      body.push(line);
    }
    return { body, closed: false };
  }
}

/** Comments collected for the next statement. */
export class Comments {
  private pending: string[] = [];

  add(text: string): void {
    this.pending.push(text);
  }

  take(): string[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}

/**
 * Handles the commands every PlantUML diagram shares. Returns the title when the line sets one,
 * `true` when the line was handled, and `false` otherwise.
 */
export function commonStatement(
  line: SourceLine,
  lines: Lines,
  reporter: Reporter,
  comments: Comments,
): { title: string } | boolean {
  const t = line.text.trim();
  if (t.startsWith("'")) {
    comments.add(t.replace(/^'+/, "").trim());
    return true;
  }
  const title = /^title\b\s*:?\s*(.*)$/i.exec(t);
  if (title) {
    if (title[1]!.trim() !== "") {
      reporter.mapped("plantuml.title");
      return { title: plainText(title[1]!) };
    }
    const { body, closed } = lines.until(/^end\s*title$/i);
    if (!closed) reporter.syntax("plantuml.title", line.span, messages().plantuml.titleNotClosed);
    reporter.mapped("plantuml.title");
    return { title: body.map((l) => plainText(l.text.trim())).join("\n") };
  }
  const skin = /^skinparam\b/i.test(t);
  if (skin) {
    if (t.endsWith("{")) lines.until(/^\}$/);
    reporter.dropped("plantuml.skinparam", line.span, messages().plantuml.skinparam);
    return true;
  }
  if (/^<style>/i.test(t)) {
    if (!/<\/style>/i.test(t)) lines.until(/<\/style>$/i);
    reporter.dropped("plantuml.style", line.span, messages().plantuml.style);
    return true;
  }
  const blockCommand =
    /^(legend|header|footer|caption|center\s+header|right\s+header|left\s+header|center\s+footer|right\s+footer|left\s+footer)\b(.*)$/i.exec(
      t,
    );
  if (blockCommand) {
    const word = blockCommand[1]!.toLowerCase().split(/\s+/).pop()!;
    const rest = blockCommand[2]!.trim();
    const oneLine =
      word === "caption" ||
      (rest !== "" && !/^(left|right|center|top|bottom)(\s+(left|right|center))?$/i.test(rest));
    if (!oneLine) {
      lines.until(new RegExp(`^end\\s*${word}$`, "i"));
    }
    reporter.dropped(`plantuml.${word}`, line.span, messages().common.notImported(word));
    return true;
  }
  if (/^(hide|show|remove|restore)\b/i.test(t)) {
    reporter.dropped("plantuml.hide", line.span, messages().plantuml.hide);
    return true;
  }
  if (
    /^(scale|newpage|allowmixing|allow_mixing|mainframe|!pragma|set\s+namespaceSeparator|page\b)/i.test(
      t,
    )
  ) {
    const word = /^!?[A-Za-z_]+/.exec(t)![0].toLowerCase().replace(/^!/, "");
    reporter.dropped(`plantuml.${word}`, line.span, messages().common.notImported(word));
    return true;
  }
  if (/^sprite\b/i.test(t)) {
    if (t.endsWith("{")) lines.until(/^\}$/);
    reporter.dropped("plantuml.sprite", line.span, messages().common.sprites);
    return true;
  }
  return false;
}

/** PlantUML label text: `\n` and `<br>` as line breaks, Creole and HTML markup removed. */
export function plainText(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/%newline\(\)/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\$[A-Za-z0-9_]+(\{[^}]*\})?>/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\/\/(.+?)\/\//g, "$1")
    .replace(/""(.+?)""/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();
}

/** Removes the quotes around a PlantUML name. */
export function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** The span of a whole line without indentation. */
export function lineSpan(line: SourceLine): Span {
  if (line.generated) return line.span;
  const lead = line.text.length - line.text.trimStart().length;
  return { start: line.start + lead, end: line.start + line.text.trimEnd().length };
}

/**
 * Reads a colour specification such as `#lightblue`, `#red;line:blue;line.dashed;text:white`
 * or `#line:red`, returning the style properties it sets.
 */
export function colourSpec(spec: string): {
  fill?: string;
  stroke?: string;
  color?: string;
  dashed?: boolean;
  bold?: boolean;
} {
  const out: { fill?: string; stroke?: string; color?: string; dashed?: boolean; bold?: boolean } =
    {};
  const parts = spec.replace(/^#/, "").split(/;|\s*#/);
  for (const raw of parts) {
    const part = raw.trim();
    if (part === "") continue;
    const kv = /^(line|text|back)\s*[:.]\s*(.*)$/i.exec(part);
    if (kv) {
      const key = kv[1]!.toLowerCase();
      const value = kv[2]!.trim();
      if (key === "line" && /^(dashed|dotted)$/i.test(value)) out.dashed = true;
      else if (key === "line" && /^bold$/i.test(value)) out.bold = true;
      else if (key === "line") out.stroke = colour(value);
      else if (key === "text") out.color = colour(value);
      else out.fill = colour(value);
      continue;
    }
    out.fill ??= colour(part);
  }
  return out;
}

/** PlantUML colours: names stay names, hex digits get their `#`, gradients keep the first colour. */
export function colour(value: string): string {
  const first = value
    .split(/[-|/\\]/)[0]!
    .trim()
    .replace(/^#/, "");
  return /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(first) ? `#${first}` : first;
}
