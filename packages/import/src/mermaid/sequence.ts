import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap, slugId } from "../ids.js";
import { messages } from "../messages/index.js";
import {
  emptySequenceSheet,
  type SeqEvent,
  type SeqGroup,
  type SeqParticipant,
  type SequenceSheet,
} from "../writer.js";
import { cssValue } from "../writer.js";
import { cleanLabel, type Statement } from "./common.js";
import { readFields } from "./flowchart.js";

const PARTICIPANT_TYPES: Readonly<Record<string, string>> = {
  participant: "participant",
  actor: "actor",
  boundary: "boundary",
  control: "control",
  entity: "entity",
  database: "database",
  collections: "collections",
  queue: "queue",
};

/** What an arrow without an exact equivalent loses, by its key in the catalogs. */
type ArrowNote = keyof ReturnType<typeof messages>["sequence"]["arrows"];

/** Mermaid arrows, longest first, and how each maps. */
const ARROWS: readonly (readonly [
  string,
  { dashed: boolean; async: boolean; exact: boolean; twoWay?: boolean; note?: ArrowNote },
])[] = [
  ["<<-->>", { dashed: true, async: false, exact: true, twoWay: true }],
  ["<<->>", { dashed: false, async: false, exact: true, twoWay: true }],
  ["-->>", { dashed: true, async: false, exact: true }],
  ["->>", { dashed: false, async: false, exact: true }],
  ["--x", { dashed: true, async: false, exact: false, note: "cross" }],
  ["-x", { dashed: false, async: false, exact: false, note: "cross" }],
  ["--)", { dashed: true, async: true, exact: true }],
  ["-)", { dashed: false, async: true, exact: true }],
  ["-->", { dashed: true, async: false, exact: false, note: "reply" }],
  ["->", { dashed: false, async: false, exact: false, note: "call" }],
];

interface Frame {
  operator: string;
  id: string;
  branches: { label: string | null; events: SeqEvent[] }[];
  comments: string[];
  span: Span;
  /** `rect` frames carry a colour. */
  fill?: string;
}

/** Builds the sequence diagram of a Mermaid `sequenceDiagram`. */
export class SequenceReader {
  readonly sheet: SequenceSheet;
  private readonly ids: IdMap;
  private readonly participants = new Map<string, SeqParticipant>();
  private readonly frames: Frame[] = [];
  private box: SeqGroup | null = null;
  private readonly counters = new Map<string, number>();
  private readonly pendingDestroy = new Map<string, string[]>();

  constructor(
    private readonly ctx: FrontContext,
    id: string,
  ) {
    this.sheet = emptySequenceSheet(id);
    this.ids = new IdMap(ctx.reporter);
  }

  private get reporter() {
    return this.ctx.reporter;
  }

  private get events(): SeqEvent[] {
    const frame = this.frames[this.frames.length - 1];
    return frame ? frame.branches[frame.branches.length - 1]!.events : this.sheet.events;
  }

  statement(st: Statement): void {
    const t = st.text;
    const word = /^[A-Za-z]+/.exec(t)?.[0] ?? "";
    switch (word) {
      case "participant":
      case "actor":
        return this.declare(st, word);
      case "create":
        return this.create(st);
      case "destroy":
        return this.lifecycle(st, "destroy");
      case "activate":
      case "deactivate":
        return this.lifecycle(st, word);
      case "box":
        return this.openBox(st);
      case "autonumber":
        return this.autonumber(st);
      case "title":
        if (/^title\s*:?\s/.test(t)) {
          this.sheet.title = t.replace(/^title\s*:?\s*/, "").trim();
          this.reporter.mapped("sequence.title");
          return;
        }
        break;
      case "accTitle":
        this.sheet.title ??= t.replace(/^accTitle\s*:/, "").trim();
        this.reporter.mapped("mermaid.accTitle");
        return;
      case "accDescr":
        this.sheet.description = t
          .replace(/^accDescr\s*[:{]/, "")
          .replace(/\}\s*$/, "")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l !== "")
          .join("\n");
        this.reporter.mapped("mermaid.accDescr");
        return;
      case "Note":
      case "note":
        return this.note(st);
      case "loop":
      case "alt":
      case "opt":
      case "par":
      case "critical":
      case "break":
      case "rect":
        if (/^[A-Za-z]+(\s|$)/.test(t)) return this.openFrame(st, word);
        break;
      case "else":
      case "and":
      case "option":
        if (/^[A-Za-z]+(\s|$)/.test(t)) return this.branch(st, word);
        break;
      case "end":
        if (t === "end") return this.end(st);
        break;
      case "link":
      case "links":
        this.reporter.dropped("sequence.links", st.span, messages().sequence.links);
        return;
      case "properties":
      case "details":
        this.reporter.dropped("sequence.properties", st.span, messages().sequence.properties);
        return;
    }
    if (this.message(st)) return;
    this.reporter.syntax("sequence.statement", st.span, messages().common.cannotRead(t));
    this.sheet.trailing.push(messages(this.ctx.locale).content.notImported(t));
  }

  // -------------------------------------------------------------------------------------------

  private participant(source: string, span: Span, kind = "participant"): SeqParticipant {
    let p = this.participants.get(source);
    if (!p) {
      const id = this.ids.id(source, span);
      p = { type: "participant", kind, id, label: null, comments: [] };
      this.participants.set(source, p);
      if (this.box) this.box.members.push(p);
      else this.sheet.participants.push(p);
    }
    return p;
  }

  private declare(st: Statement, word: string, created = false): void {
    const m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?\s*$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        "sequence.participant",
        st.span,
        messages().common.expected("participant <id> [as <label>]"),
      );
      return;
    }
    let source = m[2]!.trim();
    let kind = word;
    const meta = /^(.+?)@\{([\s\S]*)\}$/.exec(source);
    if (meta) {
      source = meta[1]!.trim();
      const type = readFields(meta[2]!.replace(/"(\w+)"\s*:/g, "$1:")).get("type");
      if (type !== undefined) {
        const mapped = PARTICIPANT_TYPES[type];
        if (mapped) kind = mapped;
        else
          this.reporter.approximated(
            "sequence.participant.type",
            st.span,
            messages().sequence.participantType(type),
          );
      }
    }
    const existing = this.participants.has(source);
    const p = this.participant(source, st.span, kind);
    if (!existing || kind !== "participant") p.kind = kind;
    p.comments.push(...st.comments);
    if (m[3] !== undefined) {
      const label = cleanLabel(m[3], this.reporter, st.span);
      p.label = label === p.id ? null : label;
    } else if (p.id !== source) p.label = source;
    this.reporter.mapped(`sequence.${kind}`);
    if (created) {
      this.events.push({ type: "create", target: p.id, comments: [] });
      this.reporter.mapped("sequence.create");
    }
  }

  private create(st: Statement): void {
    const rest = st.text.replace(/^create\s+/, "");
    const word = /^(participant|actor)\b/.exec(rest)?.[1];
    if (!word) {
      this.reporter.syntax(
        "sequence.create",
        st.span,
        messages().common.expected("create participant <id>"),
      );
      return;
    }
    this.declare({ ...st, text: rest, offset: -1 }, word, true);
  }

  private lifecycle(st: Statement, type: "activate" | "deactivate" | "destroy"): void {
    const m = /^\w+\s+(.+?)\s*$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        `sequence.${type}`,
        st.span,
        messages().common.expected(`${type} <participant>`),
      );
      return;
    }
    const p = this.participant(m[1]!, st.span);
    this.reporter.mapped(`sequence.${type}`);
    if (type === "destroy") {
      // Mermaid writes `destroy` before the message that destroys; it follows that message here.
      this.pendingDestroy.set(p.id, [...st.comments]);
      return;
    }
    this.events.push({ type, target: p.id, comments: [...st.comments] });
  }

  private openBox(st: Statement): void {
    if (this.box) {
      this.reporter.syntax("sequence.box", st.span, messages().common.nestedBoxes);
      return;
    }
    const rest = st.text.replace(/^box\b\s*/, "");
    const colour =
      /^(transparent|rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|aqua|black|blue|fuchsia|gray|grey|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow|[A-Za-z]+(?=\s))\s*/.exec(
        rest,
      );
    let label = rest;
    if (colour && rest.length > colour[0].length) label = rest.slice(colour[0].length);
    else if (colour && /^(transparent|rgba?\(|hsla?\(|#)/.test(rest)) label = "";
    const id = this.ids.unique(slugId(label, "box"));
    this.box = {
      type: "group",
      id,
      label: label.trim() === "" ? null : label.trim(),
      members: [],
      comments: [...st.comments],
    };
    this.sheet.participants.push(this.box);
    this.reporter.mapped("sequence.box");
    if (colour && colour[1] !== "transparent") {
      this.reporter.dropped("sequence.box.colour", st.span, messages().sequence.boxColour);
    }
  }

  private autonumber(st: Statement): void {
    const m = /^autonumber(?:\s+(\d+))?(?:\s+(\d+))?\s*$/.exec(st.text);
    if (/^autonumber\s+off\s*$/.test(st.text)) {
      this.reporter.dropped("sequence.autonumber.off", st.span, messages().sequence.autonumberOff);
      return;
    }
    if (!m) {
      this.reporter.syntax(
        "sequence.autonumber",
        st.span,
        messages().common.expected("autonumber [start] [step]"),
      );
      return;
    }
    this.sheet.autonumber = m[1] !== undefined ? Number(m[1]) : 1;
    this.reporter.mapped("sequence.autonumber");
    if (m[2] !== undefined && m[2] !== "1") {
      this.reporter.approximated(
        "sequence.autonumber.step",
        st.span,
        messages().sequence.autonumberStep,
      );
    }
  }

  private note(st: Statement): void {
    const m = /^[Nn]ote\s+(left of|right of|over)\s+([^:]+?)\s*:\s*([\s\S]*)$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        "sequence.note",
        st.span,
        messages().common.expected("Note left of|right of|over <participants>: <text>"),
      );
      return;
    }
    const targets = m[2]!.split(",").map((s) => this.participant(s.trim(), st.span).id);
    const position = m[1] as "over" | "left of" | "right of";
    const text = cleanLabel(m[3]!, this.reporter, st.span);
    this.events.push({
      type: "note",
      position,
      targets: position === "over" ? targets : targets.slice(0, 1),
      text,
      comments: [...st.comments],
    });
    this.reporter.mapped("sequence.note");
    if (position !== "over" && targets.length > 1) {
      this.reporter.approximated("sequence.note", st.span, messages().sequence.sideNote);
    }
  }

  private nextId(operator: string): string {
    const base = operator === "rect" ? "region" : operator;
    for (;;) {
      const n = (this.counters.get(base) ?? 0) + 1;
      this.counters.set(base, n);
      const id = `${base}${n}`;
      if (this.ids.reserve(id)) return id;
    }
  }

  private openFrame(st: Statement, word: string): void {
    const label = st.text.slice(word.length).trim();
    const operator = word === "rect" ? "region" : word;
    const frame: Frame = {
      operator,
      id: this.nextId(word),
      branches: [
        {
          label: word === "rect" || label === "" ? null : cleanLabel(label, this.reporter, st.span),
          events: [],
        },
      ],
      comments: [...st.comments],
      span: st.span,
    };
    if (word === "rect" && label !== "") frame.fill = label;
    this.frames.push(frame);
    this.reporter.mapped(`sequence.${word}`);
  }

  private branch(st: Statement, word: string): void {
    const frame = this.frames[this.frames.length - 1];
    const expected = frame
      ? { alt: "else", par: "and", critical: "option" }[frame.operator]
      : undefined;
    if (!frame || expected !== word) {
      this.reporter.syntax(`sequence.${word}`, st.span, messages().sequence.branchOutside(word));
      return;
    }
    const label = st.text.slice(word.length).trim();
    frame.branches.push({
      label: label === "" ? null : cleanLabel(label, this.reporter, st.span),
      events: [],
    });
    this.reporter.mapped(`sequence.${word}`);
  }

  private end(st: Statement): void {
    if (this.frames.length > 0) return this.closeFrame();
    if (this.box) {
      this.box = null;
      return;
    }
    this.reporter.syntax("sequence.end", st.span, messages().common.endWithoutBlock);
  }

  private closeFrame(): void {
    const frame = this.frames.pop();
    if (frame) {
      this.events.push({
        type: "fragment",
        operator: frame.operator,
        id: frame.id,
        branches: frame.branches,
        comments: frame.comments,
      });
      if (frame.fill !== undefined) {
        this.sheet.styles.push({ targets: [frame.id], props: [["fill", cssValue(frame.fill)]] });
      }
    }
  }

  private message(st: Statement): boolean {
    const t = st.text;
    const colon = indexOfColon(t);
    const head = colon < 0 ? t : t.slice(0, colon);
    const label = colon < 0 ? "" : t.slice(colon + 1);
    // Arrows ending in `>` or `)` first, so `order-xyz->>b` is not read as a `-x` message.
    let found: { index: number; arrow: string; info: (typeof ARROWS)[number][1] } | null = null;
    for (const pass of [false, true]) {
      for (const [arrow, info] of ARROWS) {
        if (arrow.endsWith("x") !== pass) continue;
        const index = head.indexOf(arrow);
        if (index > 0 && (found === null || index < found.index)) found = { index, arrow, info };
      }
      if (found) break;
    }
    if (!found) return false;
    let from = head.slice(0, found.index).trim();
    let to = head.slice(found.index + found.arrow.length).trim();
    let activate = false;
    let deactivate = false;
    if (to.startsWith("+")) {
      activate = true;
      to = to.slice(1).trim();
    } else if (to.startsWith("-")) {
      deactivate = true;
      to = to.slice(1).trim();
    }
    if (from === "" || to === "" || /\s/.test(from) || /\s/.test(to)) return false;
    from = from.replace(/^\+|^-/, "");
    const a = this.participant(from, st.span);
    const b = this.participant(to, st.span);
    const text = cleanLabel(label, this.reporter, st.span);
    this.events.push({
      type: "message",
      from: a.id,
      to: b.id,
      dashed: found.info.dashed,
      ...(found.info.twoWay ? { twoWay: true } : {}),
      async: found.info.async,
      ...(text !== "" ? { label: text } : {}),
      comments: [...st.comments],
    });
    if (found.info.exact) this.reporter.mapped(`sequence.message.${found.arrow}`);
    else {
      this.reporter.approximated(
        `sequence.message.${found.arrow}`,
        st.span,
        messages().sequence.arrows[found.info.note!],
      );
    }
    if (activate) {
      this.events.push({ type: "activate", target: b.id, comments: [] });
      this.reporter.mapped("sequence.activation.shorthand");
    }
    if (deactivate) {
      this.events.push({ type: "deactivate", target: a.id, comments: [] });
      this.reporter.mapped("sequence.activation.shorthand");
    }
    for (const id of [a.id, b.id]) {
      const comments = this.pendingDestroy.get(id);
      if (comments === undefined) continue;
      this.pendingDestroy.delete(id);
      this.events.push({ type: "destroy", target: id, comments });
    }
    return true;
  }

  finish(): SequenceSheet {
    for (const [id, comments] of this.pendingDestroy)
      this.events.push({ type: "destroy", target: id, comments });
    this.pendingDestroy.clear();
    while (this.frames.length > 0) {
      const frame = this.frames[this.frames.length - 1]!;
      this.reporter.syntax(
        `sequence.${frame.operator}`,
        frame.span,
        messages().common.blockNotClosed,
      );
      this.closeFrame();
    }
    return this.sheet;
  }
}

function indexOfColon(text: string): number {
  return text.indexOf(":");
}
