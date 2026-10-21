import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap } from "../ids.js";
import { messages } from "../messages/index.js";
import type { SourceLine } from "../report.js";
import { cssValue, emptyFlowSheet, type FlowSheet, type SheetElement } from "../writer.js";
import {
  colourSpec,
  commonStatement,
  Comments,
  lineSpan,
  Lines,
  plainText,
  unquote,
} from "./common.js";

/**
 * Description keywords, the flow kind each becomes and the `shape` style it keeps, written as
 * `style <id> { shape … }`; containers become groups and keep no shape.
 */
export const DESCRIPTION_KINDS: Readonly<Record<string, { kind: string; shape?: string }>> = {
  component: { kind: "node" },
  node: { kind: "node" },
  rectangle: { kind: "node" },
  card: { kind: "node", shape: "document" },
  agent: { kind: "node" },
  artifact: { kind: "node" },
  file: { kind: "node", shape: "document" },
  folder: { kind: "node", shape: "document" },
  frame: { kind: "node" },
  package: { kind: "node" },
  cloud: { kind: "node", shape: "cloud" },
  hexagon: { kind: "node", shape: "hexagon" },
  stack: { kind: "node" },
  label: { kind: "node" },
  action: { kind: "node" },
  process: { kind: "node" },
  boundary: { kind: "node" },
  control: { kind: "node" },
  entity: { kind: "node" },
  collections: { kind: "node" },
  database: { kind: "data" },
  storage: { kind: "data" },
  queue: { kind: "data" },
  interface: { kind: "node", shape: "circle" },
  circle: { kind: "node", shape: "circle" },
  actor: { kind: "node", shape: "person" },
  person: { kind: "node", shape: "person" },
  usecase: { kind: "node", shape: "ellipse" },
};

/** Containers that map to groups without losing anything. */
export const PLAIN_CONTAINERS: ReadonlySet<string> = new Set([
  "package",
  "node",
  "rectangle",
  "folder",
  "frame",
  "cloud",
  "card",
]);

const KEYWORD = new RegExp(`^(${Object.keys(DESCRIPTION_KINDS).join("|")})(/)?(?=\\s|$|\\{)`, "i");

interface Item {
  source: string;
  kind: string;
  keyword: string;
  label: string | null;
  description?: string;
  container: boolean;
  parent: string | null;
  order: number;
  span: Span;
  comments: string[];
}

interface Edge {
  from: string;
  to: string;
  dashed: boolean;
  noHead: boolean;
  twoWay: boolean;
  /** Heads other than the plain arrow, by the language's names. */
  head?: string;
  tail?: string;
  label?: string;
  stroke?: string;
  bold?: boolean;
  width?: number;
  span: Span;
  comments: string[];
}

const ARROW =
  /^([<*o#x}+^|()0]{0,3})((?:[-.=~]|\[[^\]]*\]|(?:left|right|up|down|le|ri|do|l|r|u|d)(?=[-.]))+)([>*o#x{+^|()0]{0,3})/;

/**
 * The language's head for a PlantUML arrow end: plain arrows, the hollow triangle of inheritance,
 * the diamonds of composition and aggregation, a cross, and the crow's feet of IE notation.
 * Null for heads with no equivalent (`#`, `+`, `^`, sockets).
 */
export function plantHead(end: string): string | null {
  if (end === "") return "none";
  if (/^(<<?|>>?)$/.test(end)) return "triangle";
  if (end === "<|" || end === "|>") return "triangleOutline";
  const heads: Readonly<Record<string, string>> = {
    "*": "diamond",
    o: "diamondOutline",
    x: "cross",
    "}|": "oneOrMany",
    "|{": "oneOrMany",
    "}o": "zeroOrMany",
    "o{": "zeroOrMany",
    "||": "onlyOne",
    "|o": "zeroOrOne",
    "o|": "zeroOrOne",
    "}": "many",
    "{": "many",
  };
  return heads[end] ?? null;
}

/** Builds the flow diagram of a PlantUML component, deployment or use case block. */
export class DescriptionReader {
  readonly sheet: FlowSheet;
  private readonly items = new Map<string, Item>();
  private readonly edges: Edge[] = [];
  private readonly styles = new Map<string, Map<string, string>>();
  private readonly stack: (Item | null)[] = [];
  private readonly comments = new Comments();
  private order = 0;
  private notes = 0;

  constructor(
    private readonly ctx: FrontContext,
    id: string,
  ) {
    this.sheet = emptyFlowSheet("flow", id);
    this.sheet.layout = "auto";
  }

  private get reporter() {
    return this.ctx.reporter;
  }

  read(source: readonly SourceLine[]): FlowSheet {
    const lines = new Lines(source);
    while (!lines.done) {
      const line = lines.next()!;
      const t = line.text.trim();
      if (t === "") continue;
      const common = commonStatement(line, lines, this.reporter, this.comments);
      if (typeof common === "object") {
        this.sheet.title = common.title;
        continue;
      }
      if (common) continue;
      this.statement(line, lines, t);
    }
    for (const open of this.stack) {
      if (open)
        this.reporter.syntax(
          "description.container",
          open.span,
          messages().description.containerNotClosed,
        );
    }
    return this.finish();
  }

  private get parent(): string | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const item = this.stack[i];
      if (item) return item.source;
    }
    return null;
  }

  private statement(line: SourceLine, lines: Lines, t: string): void {
    const span = lineSpan(line);
    if (t === "}") {
      if (this.stack.length === 0)
        this.reporter.syntax(
          "description.container",
          span,
          messages().description.closeWithoutContainer,
        );
      else this.stack.pop();
      return;
    }
    const direction = /^(left to right|top to bottom) direction$/i.exec(t);
    if (direction) {
      this.sheet.direction = direction[1]!.toLowerCase() === "left to right" ? "LR" : "TB";
      this.reporter.mapped("description.direction");
      return;
    }
    if (/^together\s*\{$/i.test(t)) {
      this.stack.push(null);
      this.reporter.dropped("description.together", span, messages().description.together);
      return;
    }
    if (/^(port|portin|portout)\s/i.test(t)) {
      this.reporter.dropped("description.port", span, messages().description.ports);
      return;
    }
    if (/^note\b/i.test(t)) return this.note(line, lines, t, span);
    if (/^(hide|remove)\s/i.test(t)) return;
    if (this.relation(t, span)) return;
    if (this.declaration(lines, t, span)) return;
    this.reporter.syntax("description.statement", span, messages().common.cannotRead(t));
    this.sheet.trailing.push(messages(this.ctx.locale).content.notImported(t));
  }

  // -------------------------------------------------------------------------------------------
  // Elements

  private item(source: string, keyword: string, span: Span, label: string | null): Item {
    let item = this.items.get(source);
    if (!item) {
      const info = DESCRIPTION_KINDS[keyword] ?? { kind: "node" };
      item = {
        source,
        kind: info.kind,
        keyword,
        label,
        container: false,
        parent: this.parent,
        order: this.order++,
        span,
        comments: this.comments.take(),
      };
      this.items.set(source, item);
    }
    return item;
  }

  /** Short forms in declarations and relations: `[C]`, `()`, `(U)`, `:A:`, or an alias. */
  private ref(text: string): { source: string; keyword: string; label: string | null } | null {
    const t = text.trim();
    let m = /^\[([^\]]+)\]$/.exec(t);
    if (m) return { source: plainText(m[1]!), keyword: "component", label: plainText(m[1]!) };
    m = /^\(([^)]+)\)$/.exec(t);
    if (m) return { source: plainText(m[1]!), keyword: "usecase", label: plainText(m[1]!) };
    m = /^:([^:]+):$/.exec(t);
    if (m) return { source: plainText(m[1]!), keyword: "actor", label: plainText(m[1]!) };
    m = /^\(\)\s*("?)([^"]+)\1$/.exec(t);
    if (m) return { source: m[2]!.trim(), keyword: "interface", label: m[2]!.trim() };
    m = /^"([^"]+)"$/.exec(t);
    if (m) return { source: m[1]!, keyword: "rectangle", label: plainText(m[1]!) };
    if (/^[\p{L}\p{N}_.$@]+$/u.test(t)) return { source: t, keyword: "node", label: null };
    return null;
  }

  private declaration(lines: Lines, t: string, span: Span): boolean {
    let keyword: string;
    let rest: string;
    const kw = KEYWORD.exec(t);
    if (kw) {
      keyword = kw[1]!.toLowerCase();
      rest = t.slice(kw[0].length).trim();
    } else if (/^(\[|\(\)|\(|:)/.test(t)) {
      keyword = t.startsWith("[")
        ? "component"
        : t.startsWith("()")
          ? "interface"
          : t.startsWith("(")
            ? "usecase"
            : "actor";
      // `() "Label" as i` and `() i`: the parentheses only say "interface".
      rest = keyword === "interface" ? t.slice(2).trim() : t;
    } else return false;
    // Trailing `{` opens a container.
    let opens = false;
    if (rest.endsWith("{")) {
      opens = true;
      rest = rest.slice(0, -1).trim();
    }
    // Multi-line bracket labels: `component C [` … `]`.
    let bracketLabel: string | null = null;
    const bracketOpen = /^(\S+)\s+\[(.*)$/.exec(rest);
    if (bracketOpen && !rest.includes("]")) {
      const parts = [bracketOpen[2]!];
      for (;;) {
        const next = lines.next();
        if (!next) break;
        const text = next.text.trim();
        if (text.endsWith("]")) {
          parts.push(text.slice(0, -1));
          break;
        }
        parts.push(text);
      }
      bracketLabel = parts
        .map((p) => p.trim())
        .filter((p) => p !== "")
        .join("\n");
      rest = bracketOpen[1]!;
    } else {
      const inline = /^([\p{L}\p{N}_.$@]+)\s+\[([^\]]*)\](.*)$/u.exec(rest);
      if (inline) {
        bracketLabel = plainText(inline[2]!);
        rest = `${inline[1]!}${inline[3]!}`;
      }
    }
    // Colours and stereotypes at the end.
    let colourText: string | null = null;
    const colourMatch = /\s(#[^\s]+)\s*$/.exec(` ${rest}`);
    if (colourMatch) {
      colourText = colourMatch[1]!;
      rest = ` ${rest}`.slice(0, colourMatch.index).trim();
    }
    const stereotypes: string[] = [];
    rest = rest
      .replace(/<<\s*([^>]*?)\s*>>/g, (_, s: string) => {
        if (!s.startsWith("$")) stereotypes.push(s);
        return "";
      })
      .trim();
    // Names and aliases.
    let source: string;
    let label: string | null;
    let m: RegExpExecArray | null;
    if ((m = /^("[^"]*"|\[[^\]]*\]|\([^)]*\)|:[^:]*:)\s+as\s+(\S+)$/.exec(rest))) {
      const r = this.ref(m[1]!);
      label = r?.label ?? plainText(unquote(m[1]!));
      source = m[2]!.replace(/^\(|\)$/g, "");
    } else if ((m = /^(\S+)\s+as\s+("[^"]*"|\[[^\]]*\]|\([^)]*\)|:[^:]*:)$/.exec(rest))) {
      source = m[1]!;
      const r = this.ref(m[2]!);
      label = r?.label ?? plainText(unquote(m[2]!));
    } else if ((m = /^(\S+)\s+as\s+(\S+)$/.exec(rest))) {
      source = m[2]!;
      label = plainText(unquote(m[1]!));
    } else if (rest === "") {
      this.reporter.syntax("description.declaration", span, messages().description.noName(t));
      return true;
    } else {
      const r = this.ref(rest);
      if (r) {
        source = r.source;
        label = r.label;
      } else {
        source = plainText(unquote(rest));
        label = source;
      }
    }
    if (bracketLabel !== null) label = bracketLabel;
    const item = this.item(source, keyword, span, label);
    item.keyword = keyword;
    const info = DESCRIPTION_KINDS[keyword] ?? { kind: "node" };
    item.kind = info.kind;
    if (label !== null) item.label = label;
    item.span = span;
    if (stereotypes.length > 0) {
      item.description = stereotypes.map((s) => `«${s}»`).join(" ");
      this.reporter.approximated(
        "description.stereotype",
        span,
        messages().description.stereotypes,
      );
    }
    if (colourText) this.colour(item.source, colourText, span);
    if (opens) {
      item.container = true;
      this.stack.push(item);
    }
    return true;
  }

  private colour(source: string, text: string, span: Span): void {
    const spec = colourSpec(text);
    const props: [string, string][] = [];
    if (spec.fill) props.push(["fill", cssValue(spec.fill)]);
    if (spec.stroke) props.push(["stroke", cssValue(spec.stroke)]);
    if (spec.color) props.push(["color", cssValue(spec.color)]);
    if (spec.dashed) props.push(["line", "dashed"]);
    if (spec.bold) props.push(["width", "2"]);
    let map = this.styles.get(source);
    if (!map) {
      map = new Map();
      this.styles.set(source, map);
    }
    for (const [k, v] of props) map.set(k, v);
    this.reporter.mapped("description.colour");
    void span;
  }

  // -------------------------------------------------------------------------------------------
  // Relations

  private relation(t: string, span: Span): boolean {
    const colon = colonOutside(t);
    const head = colon < 0 ? t : t.slice(0, colon);
    const label = colon < 0 ? undefined : t.slice(colon + 1).trim();
    // Aliases in links stop at `.` so `a..>b` reads as a dotted link.
    const left =
      /^(\[[^\]]+\]|\(\)\s*"[^"]+"|\(\)\s*[\p{L}\p{N}_$@]+|\([^)]+\)|:[^:]+:|"[^"]+"|[\p{L}\p{N}_$@]+)\s*/u.exec(
        head,
      );
    if (!left) return false;
    let pos = left[0].length;
    const multiplicityLeft = /^"[^"]*"\s*/.exec(head.slice(pos));
    if (
      multiplicityLeft &&
      /[-.]/.test(
        head.slice(pos + multiplicityLeft[0].length, pos + multiplicityLeft[0].length + 2),
      )
    ) {
      pos += multiplicityLeft[0].length;
    }
    const arrow = ARROW.exec(head.slice(pos));
    if (!arrow || !/[-.]/.test(arrow[2]!)) return false;
    pos += arrow[0].length;
    let rest = head.slice(pos).trim();
    let multiplicity = multiplicityLeft !== null;
    const multiplicityRight = /^"[^"]*"\s+(?=\S)/.exec(rest);
    if (multiplicityRight) {
      rest = rest.slice(multiplicityRight[0].length);
      multiplicity = true;
    }
    const a = this.ref(left[1]!);
    const b = this.ref(rest);
    if (!a || !b) return false;
    const comments = this.comments.take();
    const from = this.item(a.source, a.keyword, span, a.label);
    const to = this.item(b.source, b.keyword, span, b.label);
    const [, leftHead = "", body = "", rightHead = ""] = arrow;
    const brackets = [...body.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]!);
    if (brackets.some((b) => /\bhidden\b/i.test(b))) {
      this.reporter.dropped("description.arrow.hidden", span, messages().description.hidden);
      return true;
    }
    const bare = body.replace(/\[[^\]]*\]/g, "");
    if (/(left|right|up|down|le|ri|do|\bl\b|\br\b|\bu\b|\bd\b)/.test(bare.replace(/[-.]/g, " "))) {
      this.reporter.approximated(
        "description.arrow.direction",
        span,
        messages().description.directions,
      );
    }
    if (multiplicity) {
      this.reporter.approximated(
        "description.arrow.multiplicity",
        span,
        messages().description.multiplicity,
      );
    }
    // A left head alone that points (a plain or hollow triangle) makes the relation point back,
    // so its head is at the target; diamonds and crow's feet stay at the end they are written on.
    const leftKind = plantHead(leftHead);
    const rightKind = plantHead(rightHead);
    const reversed =
      rightHead === "" && (leftKind === "triangle" || leftKind === "triangleOutline");
    const twoWay = leftHead !== "" && rightHead !== "" && leftKind === rightKind;
    if (leftKind === null || rightKind === null) {
      this.reporter.approximated(
        "description.arrow.head.other",
        span,
        messages().description.otherHeads,
      );
    } else if (twoWay) this.reporter.mapped("description.arrow.both");
    else if (leftKind !== "triangle" && leftKind !== "none") {
      this.reporter.mapped("description.arrow.head");
    } else if (rightKind !== "triangle" && rightKind !== "none") {
      this.reporter.mapped("description.arrow.head");
    } else this.reporter.mapped("description.arrow");
    const end = reversed ? leftKind! : (rightKind ?? "triangle");
    const start = reversed ? "none" : (leftKind ?? "triangle");
    const edge: Edge = {
      from: reversed ? to.source : from.source,
      to: reversed ? from.source : to.source,
      dashed: bare.includes(".") || brackets.some((b) => /\b(dashed|dotted)\b/i.test(b)),
      noHead: leftHead === "" && rightHead === "",
      twoWay,
      span,
      comments,
    };
    if (!edge.noHead) {
      if (end !== "triangle") edge.head = end;
      if (!twoWay && start !== "none") edge.tail = start;
    }
    for (const bracket of brackets) {
      for (const part of bracket.split(/[,;]/)) {
        const p = part.trim();
        if (p.startsWith("#")) edge.stroke = p.replace(/^#/, "").split(/[-|/\\]/)[0]!;
        else if (/^bold$/i.test(p)) edge.bold = true;
        else if (/^thickness\s*=\s*(\d+)/i.test(p)) edge.width = Number(/(\d+)/.exec(p)![1]);
      }
    }
    if (edge.stroke && /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(edge.stroke))
      edge.stroke = `#${edge.stroke}`;
    if (label !== undefined && label !== "")
      edge.label = plainText(label.replace(/^["]|["]$/g, "").replace(/\s*[<>]\s*$/, ""));
    this.edges.push(edge);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Notes

  private note(line: SourceLine, lines: Lines, t: string, span: Span): void {
    const attached =
      /^note\s+(left|right|top|bottom)(?:\s+of\s+(\S+))?\s*(?:#\S+)?\s*(?::\s*(.*))?$/i.exec(t);
    const floating = /^note\s+"([^"]*)"\s+as\s+(\S+)\s*(?:#\S+)?$/i.exec(t);
    const floatingBlock = /^note\s+as\s+(\S+)\s*(?:#\S+)?$/i.exec(t);
    const onLink = /^note\s+on\s+link\b/i.exec(t);
    if (onLink) {
      if (!t.includes(":")) lines.until(/^end\s*note$/i);
      this.reporter.dropped("description.note.link", span, messages().description.noteOnLink);
      return;
    }
    let text: string;
    let source: string;
    let target: string | null = null;
    if (attached) {
      target = attached[2] ?? this.lastItem();
      if (attached[3] !== undefined) text = attached[3];
      else text = this.noteBody(lines, span);
      source = this.noteId();
      if (target === null) {
        this.reporter.dropped("description.note", span, messages().description.unattachedNote);
        return;
      }
    } else if (floating) {
      text = floating[1]!;
      source = floating[2]!;
    } else if (floatingBlock) {
      source = floatingBlock[1]!;
      text = this.noteBody(lines, span);
    } else {
      this.reporter.syntax("description.note", span, messages().common.cannotRead(t));
      return;
    }
    const note = this.item(source, "note", span, plainText(text));
    note.kind = "note";
    note.label = plainText(text);
    this.reporter.mapped("description.note");
    if (target !== null) {
      const ref = this.ref(target);
      if (!ref) return;
      const to = this.item(ref.source, ref.keyword, span, ref.label);
      this.edges.push({
        from: note.source,
        to: to.source,
        dashed: true,
        noHead: true,
        twoWay: false,
        span,
        comments: [],
      });
    }
    void line;
  }

  private noteBody(lines: Lines, span: Span): string {
    const { body, closed } = lines.until(/^end\s*note$/i);
    if (!closed) this.reporter.syntax("description.note", span, messages().common.noteNotClosed);
    return body.map((l) => l.text.trim()).join("\n");
  }

  private noteId(): string {
    for (;;) {
      const id = `note${++this.notes}`;
      if (!this.items.has(id)) return id;
    }
  }

  private lastItem(): string | null {
    let last: Item | null = null;
    for (const item of this.items.values())
      if (item.kind !== "note" && (!last || item.order > last.order)) last = item;
    return last?.source ?? null;
  }

  // -------------------------------------------------------------------------------------------

  private finish(): FlowSheet {
    const ids = new IdMap(this.reporter);
    const ordered = [...this.items.values()].sort((a, b) => a.order - b.order);
    for (const item of ordered) ids.id(item.source, item.span);
    const elements = new Map<string, SheetElement>();
    const elementStyles: FlowSheet["styles"] = [];
    for (const item of ordered) {
      const id = ids.id(item.source);
      let kind = item.kind;
      const props: [string, string][] = [];
      if (item.container) {
        kind = "group";
        if (PLAIN_CONTAINERS.has(item.keyword))
          this.reporter.mapped(`description.container.${item.keyword}`);
        else
          this.reporter.approximated(
            `description.container.${item.keyword}`,
            item.span,
            messages().description.containerShape(item.keyword),
          );
      } else if (item.kind !== "note") {
        const shape = DESCRIPTION_KINDS[item.keyword]?.shape;
        if (shape !== undefined) props.push(["shape", shape]);
        this.reporter.mapped(`description.${item.keyword}`);
      }
      props.push(...(this.styles.get(item.source) ?? []));
      if (props.length > 0) elementStyles.push({ targets: [id], props });
      const label = item.label ?? item.source;
      const el: SheetElement = {
        kind,
        id,
        label: label === id ? null : label,
        classes: [],
        children: [],
        comments: item.comments,
      };
      if (item.description !== undefined) el.description = item.description;
      elements.set(item.source, el);
    }
    for (const item of ordered) {
      const el = elements.get(item.source)!;
      const parent = item.parent !== null ? elements.get(item.parent) : undefined;
      if (parent) parent.children.push(el);
      else this.sheet.elements.push(el);
    }
    const relationStyles: { targets: string[]; props: [string, string][] }[] = [];
    this.sheet.relations = this.edges.map((edge) => {
      const props: [string, string][] = [];
      if (edge.noHead) props.push(["arrowhead", "none"]);
      if (edge.head !== undefined) props.push(["arrowhead", edge.head]);
      if (edge.tail !== undefined) props.push(["arrowtail", edge.tail]);
      if (edge.stroke) props.push(["stroke", cssValue(edge.stroke)]);
      if (edge.width !== undefined) props.push(["width", String(Math.min(16, edge.width))]);
      else if (edge.bold) props.push(["width", "2"]);
      const id = props.length > 0 ? ids.fresh("e") : undefined;
      if (id !== undefined) relationStyles.push({ targets: [id], props });
      return {
        from: ids.id(edge.from),
        to: ids.id(edge.to),
        dashed: edge.dashed,
        ...(edge.twoWay ? { twoWay: true } : {}),
        ...(edge.label !== undefined && edge.label !== "" ? { label: edge.label } : {}),
        ...(id !== undefined ? { id } : {}),
        classes: [],
        comments: edge.comments,
      };
    });
    this.sheet.styles = [...elementStyles, ...relationStyles];
    this.sheet.trailing.push(...this.comments.take());
    return this.sheet;
  }
}

function colonOutside(text: string): number {
  let quote = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) {
      // `:Actor:` short forms are names, not labels.
      if (/^:[^:]+:/.test(text.slice(i)) && (i === 0 || /[\s>.-]/.test(text[i - 1]!))) {
        const end = text.indexOf(":", i + 1);
        i = end;
        continue;
      }
      return i;
    }
  }
  return -1;
}
