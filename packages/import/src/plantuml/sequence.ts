import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap, slugId } from "../ids.js";
import { messages } from "../messages/index.js";
import type { SourceLine } from "../report.js";
import {
  emptySequenceSheet,
  type SeqEvent,
  type SeqGroup,
  type SeqParticipant,
  type SequenceSheet,
} from "../writer.js";
import { commonStatement, Comments, lineSpan, Lines, plainText, unquote } from "./common.js";

const PARTICIPANT_KINDS = new Set([
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
]);

const FRAGMENTS: Readonly<Record<string, string>> = {
  alt: "alt",
  opt: "opt",
  loop: "loop",
  par: "par",
  break: "break",
  critical: "critical",
  group: "region",
};

const NAME = String.raw`(?:"[^"]+"|[\p{L}\p{N}_.@]+)`;
const MESSAGE = new RegExp(
  String.raw`^(&\s*)?([\[?])?\s*(${NAME})?\s*` +
    String.raw`(<<|<|\\\\|\\|//|/|x|o)?(-{1,2})(?:\[([^\]]*)\])?(-?)(>>|>x|>o|>|\\\\|\\|//|/|x|o)?` +
    String.raw`\s*(${NAME})?\s*([\]?])?\s*((?:\+\+|--|\*\*|!!)(?:\s*#\S+)?)?\s*(?::\s*([\s\S]*))?$`,
  "u",
);

interface Frame {
  operator: string;
  id: string;
  branches: { label: string | null; events: SeqEvent[] }[];
  comments: string[];
  span: Span;
}

/** Builds the sequence diagram of a PlantUML sequence block. */
export class PlantSequenceReader {
  readonly sheet: SequenceSheet;
  private readonly ids: IdMap;
  private readonly participants = new Map<string, SeqParticipant>();
  private readonly frames: Frame[] = [];
  private readonly comments = new Comments();
  private box: SeqGroup | null = null;
  private readonly counters = new Map<string, number>();
  /** Activated participants with the participant whose message activated them. */
  private readonly active: { id: string; caller: string | null }[] = [];
  private lastMessage: { from: string; to: string } | null = null;

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

  read(source: readonly SourceLine[]): SequenceSheet {
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
      this.statement(lines, t, lineSpan(line));
    }
    while (this.frames.length > 0) {
      this.reporter.syntax(
        "sequence.end",
        this.frames[this.frames.length - 1]!.span,
        messages().plantumlSequence.fragmentNotClosed,
      );
      this.closeFrame();
    }
    this.sheet.trailing.push(...this.comments.take());
    return this.sheet;
  }

  private statement(lines: Lines, t: string, span: Span): void {
    const word = /^[a-z]+/i.exec(t)?.[0]?.toLowerCase() ?? "";
    if (PARTICIPANT_KINDS.has(word) && this.declare(t, word, span)) return;
    switch (word) {
      case "create":
        return this.create(t, span);
      case "activate":
      case "deactivate":
      case "destroy":
        return this.lifecycle(t, word, span);
      case "return":
        return this.returnMessage(t, span);
      case "autonumber":
        return this.autonumber(t, span);
      case "box":
        if (/^box\b/i.test(t)) return this.openBox(t, span);
        break;
      case "end":
        if (/^end\s*box$/i.test(t)) return this.closeBox(span);
        if (/^end$/i.test(t)) return this.end(span);
        break;
      case "else":
        return this.branch(t, span);
      case "note":
      case "hnote":
      case "rnote":
        return this.note(lines, t, span);
      case "ref":
        return this.ref(lines, t, span);
      case "order":
        return;
    }
    if (word in FRAGMENTS && new RegExp(`^${word}\\b`, "i").test(t))
      return this.openFrame(t, word, span);
    const divider = /^==\s*(.*?)\s*==$/.exec(t);
    if (divider) {
      this.events.push({
        type: "divider",
        text: plainText(divider[1]!),
        comments: this.comments.take(),
      });
      this.reporter.mapped("sequence.divider");
      return;
    }
    const delay = /^\.\.\.(?:\s*(.*?)\s*\.\.\.)?$/.exec(t);
    if (delay) {
      const text = delay[1] !== undefined && delay[1] !== "" ? plainText(delay[1]) : null;
      this.events.push({ type: "delay", text, comments: this.comments.take() });
      this.reporter.mapped("sequence.delay");
      return;
    }
    if (/^\|\|\d*\|\|$|^\|\|\|$/.test(t)) {
      this.reporter.dropped("sequence.space", span, messages().plantumlSequence.space);
      return;
    }
    if (/^hide\s+footbox$/i.test(t)) {
      this.reporter.dropped("sequence.footbox", span, messages().plantumlSequence.footbox);
      return;
    }
    if (this.message(t, span)) return;
    this.reporter.syntax("sequence.statement", span, messages().common.cannotRead(t));
    this.sheet.trailing.push(messages(this.ctx.locale).content.notImported(t));
  }

  // -------------------------------------------------------------------------------------------
  // Participants

  private participant(source: string, span: Span, kind = "participant"): SeqParticipant {
    const name = unquote(source);
    let p = this.participants.get(name);
    if (!p) {
      const id = this.ids.id(name, span);
      p = {
        type: "participant",
        kind,
        id,
        label: id === name ? null : plainText(name),
        comments: [],
      };
      this.participants.set(name, p);
      if (this.box) this.box.members.push(p);
      else this.sheet.participants.push(p);
    }
    return p;
  }

  private declare(t: string, word: string, span: Span, created = false): boolean {
    let rest = t.slice(word.length).trim();
    rest = rest.replace(/\s+order\s+-?\d+\s*/i, " ").trim();
    const colour = /\s(#\S+)\s*$/.exec(` ${rest}`);
    if (colour) {
      rest = ` ${rest}`.slice(0, colour.index).trim();
      this.reporter.dropped(
        "sequence.participant.colour",
        span,
        messages().plantumlSequence.participantColours,
      );
    }
    const stereotypes: string[] = [];
    rest = rest
      .replace(/<<\s*([^>]*?)\s*>>/g, (_, s: string) => {
        stereotypes.push(s);
        return "";
      })
      .trim();
    if (stereotypes.length > 0) {
      this.reporter.dropped(
        "sequence.participant.stereotype",
        span,
        messages().plantumlSequence.participantStereotypes,
      );
    }
    let source: string;
    let label: string | null = null;
    let m: RegExpExecArray | null;
    if ((m = /^"([^"]+)"\s+as\s+(\S+)$/.exec(rest))) {
      label = plainText(m[1]!);
      source = m[2]!;
    } else if ((m = /^(\S+)\s+as\s+"([^"]+)"$/.exec(rest))) {
      source = m[1]!;
      label = plainText(m[2]!);
    } else if ((m = /^(\S+)\s+as\s+(\S+)$/.exec(rest))) {
      source = m[2]!;
      label = plainText(m[1]!);
    } else if ((m = /^("[^"]+"|\S+)$/.exec(rest))) {
      source = unquote(m[1]!);
    } else return false;
    const existed = this.participants.has(source);
    const p = this.participant(source, span, word);
    p.kind = word;
    if (label !== null) p.label = label === p.id ? null : label;
    if (!existed) p.comments.push(...this.comments.take());
    this.reporter.mapped(`sequence.${word}`);
    if (created) {
      this.events.push({ type: "create", target: p.id, comments: [] });
      this.reporter.mapped("sequence.create");
    }
    return true;
  }

  private create(t: string, span: Span): void {
    const rest = t.replace(/^create\s+/i, "");
    const word = /^[a-z]+/i.exec(rest)?.[0]?.toLowerCase() ?? "";
    if (PARTICIPANT_KINDS.has(word) && this.declare(rest, word, span, true)) return;
    const p = this.participant(rest.trim(), span);
    this.events.push({ type: "create", target: p.id, comments: this.comments.take() });
    this.reporter.mapped("sequence.create");
  }

  private lifecycle(t: string, word: "activate" | "deactivate" | "destroy", span: Span): void {
    const m = /^\w+\s+("[^"]+"|\S+)(?:\s+#\S+)?\s*$/.exec(t);
    if (!m) {
      this.reporter.syntax(
        `sequence.${word}`,
        span,
        messages().common.expected(`${word} <participant>`),
      );
      return;
    }
    const p = this.participant(m[1]!, span);
    this.events.push({ type: word, target: p.id, comments: this.comments.take() });
    this.reporter.mapped(`sequence.${word}`);
    if (word === "activate")
      this.active.push({
        id: p.id,
        caller: this.lastMessage?.to === p.id ? this.lastMessage.from : null,
      });
    else if (word === "deactivate") this.popActive(p.id);
  }

  private popActive(id: string): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i]!.id === id) {
        this.active.splice(i, 1);
        return;
      }
    }
  }

  private returnMessage(t: string, span: Span): void {
    const top = this.active.pop();
    if (!top || top.caller === null) {
      this.reporter.syntax(
        "sequence.return",
        span,
        messages().plantumlSequence.returnWithoutActivation,
      );
      return;
    }
    const label = plainText(t.replace(/^return\b\s*/i, ""));
    this.events.push({
      type: "message",
      from: top.id,
      to: top.caller,
      dashed: true,
      async: false,
      ...(label !== "" ? { label } : {}),
      comments: this.comments.take(),
    });
    this.events.push({ type: "deactivate", target: top.id, comments: [] });
    this.reporter.mapped("sequence.return");
  }

  private autonumber(t: string, span: Span): void {
    if (/^autonumber\s+(stop|resume|inc)\b/i.test(t)) {
      this.reporter.dropped(
        "sequence.autonumber.control",
        span,
        messages().plantumlSequence.numberingControl,
      );
      return;
    }
    const m = /^autonumber(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+"[^"]*")?\s*$/i.exec(t);
    if (!m) {
      this.reporter.syntax(
        "sequence.autonumber",
        span,
        messages().common.expected("autonumber [start] [step]"),
      );
      return;
    }
    this.sheet.autonumber = m[1] !== undefined ? Number(m[1]) : 1;
    this.reporter.mapped("sequence.autonumber");
    if ((m[2] !== undefined && m[2] !== "1") || /"/.test(t)) {
      this.reporter.approximated(
        "sequence.autonumber.format",
        span,
        messages().plantumlSequence.numberingFormat,
      );
    }
  }

  private openBox(t: string, span: Span): void {
    if (this.box) {
      this.reporter.syntax("sequence.box", span, messages().common.nestedBoxes);
      return;
    }
    const m = /^box(?:\s+"([^"]*)")?(?:\s+([^\s"]+))?(?:\s+#\S+)?\s*$/i.exec(t);
    const label = m?.[1] ?? m?.[2] ?? null;
    if (/#\S+/.test(t))
      this.reporter.dropped("sequence.box.colour", span, messages().plantumlSequence.boxColours);
    const id = this.ids.unique(slugId(label ?? "", "box"));
    this.box = {
      type: "group",
      id,
      label: label === null || label === id ? null : plainText(label),
      members: [],
      comments: this.comments.take(),
    };
    this.sheet.participants.push(this.box);
    this.reporter.mapped("sequence.box");
  }

  private closeBox(span: Span): void {
    if (!this.box) {
      this.reporter.syntax("sequence.box", span, messages().plantumlSequence.endBoxWithoutBox);
      return;
    }
    this.box = null;
  }

  // -------------------------------------------------------------------------------------------
  // Fragments

  private nextId(operator: string): string {
    for (;;) {
      const n = (this.counters.get(operator) ?? 0) + 1;
      this.counters.set(operator, n);
      const id = `${operator}${n}`;
      if (this.ids.reserve(id)) return id;
    }
  }

  private openFrame(t: string, word: string, span: Span): void {
    const operator = FRAGMENTS[word]!;
    let text = t.slice(word.length).trim();
    text = text.replace(/^#\S+\s*/, "");
    if (word === "group") text = text.replace(/\s*\[[^\]]*\]\s*$/, "");
    this.frames.push({
      operator,
      id: this.nextId(operator),
      branches: [{ label: text === "" ? null : plainText(text), events: [] }],
      comments: this.comments.take(),
      span,
    });
    this.reporter.mapped(`sequence.${word}`);
  }

  private branch(t: string, span: Span): void {
    const frame = this.frames[this.frames.length - 1];
    if (!frame || !["alt", "par", "critical"].includes(frame.operator)) {
      this.reporter.syntax("sequence.else", span, messages().plantumlSequence.elseOutside);
      return;
    }
    const text = t.replace(/^else\b\s*/i, "").replace(/^#\S+\s*/, "");
    frame.branches.push({ label: text === "" ? null : plainText(text), events: [] });
    this.reporter.mapped("sequence.else");
  }

  private end(span: Span): void {
    if (this.frames.length === 0) {
      this.reporter.syntax("sequence.end", span, messages().plantumlSequence.endWithoutFragment);
      return;
    }
    this.closeFrame();
  }

  private closeFrame(): void {
    const frame = this.frames.pop()!;
    this.events.push({
      type: "fragment",
      operator: frame.operator,
      id: frame.id,
      branches: frame.branches,
      comments: frame.comments,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Notes

  private note(lines: Lines, t: string, span: Span): void {
    const m =
      /^[hr]?note\s+(left|right|over|across)(?:\s+of)?\s*([^:#]*?)?\s*(?:#\S+\s*)?(?::\s*(.*))?$/i.exec(
        t,
      );
    if (!m) {
      this.reporter.syntax("sequence.note", span, messages().common.cannotRead(t));
      return;
    }
    const where = m[1]!.toLowerCase();
    let text: string;
    if (m[3] !== undefined) text = m[3];
    else {
      const { body, closed } = lines.until(/^end\s*[hr]?note$|^endnote$/i);
      if (!closed) this.reporter.syntax("sequence.note", span, messages().common.noteNotClosed);
      text = body.map((l) => l.text.trim()).join("\n");
    }
    let targets = (m[2] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => this.participant(s, span).id);
    if (where === "across") {
      targets = [...this.participants.values()].map((p) => p.id);
      this.reporter.approximated(
        "sequence.note.across",
        span,
        messages().plantumlSequence.noteAcross,
      );
    }
    if (targets.length === 0 && this.lastMessage) {
      // A note after a message, beside its source or target.
      targets = [where === "right" ? this.lastMessage.to : this.lastMessage.from];
      this.reporter.approximated(
        "sequence.note.message",
        span,
        messages().plantumlSequence.noteOnMessage,
      );
    }
    if (targets.length === 0) {
      this.reporter.dropped(
        "sequence.note",
        span,
        messages().plantumlSequence.noteWithoutParticipant,
      );
      return;
    }
    const position = where === "left" ? "left of" : where === "right" ? "right of" : "over";
    this.events.push({
      type: "note",
      position,
      targets: position === "over" ? targets : targets.slice(0, 1),
      text: plainText(text),
      comments: this.comments.take(),
    });
    if (/^[hr]note/i.test(t)) {
      this.reporter.approximated(
        "sequence.note.shape",
        span,
        messages().plantumlSequence.noteShapes,
      );
    } else this.reporter.mapped("sequence.note");
  }

  private ref(lines: Lines, t: string, span: Span): void {
    const m = /^ref\s+over\s+([^:#]+?)\s*(?:#\S+\s*)?(?::\s*(.*))?$/i.exec(t);
    if (!m) {
      this.reporter.syntax("sequence.ref", span, messages().common.cannotRead(t));
      return;
    }
    let text = m[2];
    if (text === undefined) {
      const { body } = lines.until(/^end\s*ref$/i);
      text = body.map((l) => l.text.trim()).join("\n");
    }
    const targets = m[1]!.split(",").map((s) => this.participant(s.trim(), span).id);
    this.events.push({
      type: "note",
      position: "over",
      targets,
      text: `ref: ${plainText(text)}`,
      comments: this.comments.take(),
    });
    this.reporter.approximated("sequence.ref", span, messages().plantumlSequence.ref);
  }

  // -------------------------------------------------------------------------------------------
  // Messages

  private message(t: string, span: Span): boolean {
    const m = MESSAGE.exec(t);
    if (!m) return false;
    const [
      ,
      teoz,
      leftGate,
      fromRaw,
      leftHead = "",
      body1,
      bracket,
      body2,
      rightHead = "",
      toRaw,
      rightGate,
      suffix,
      label,
    ] = m;
    if (fromRaw === undefined && leftGate === undefined) return false;
    if (toRaw === undefined && rightGate === undefined) return false;
    const outside = () => this.participant("outside", span);
    let from = fromRaw !== undefined ? this.participant(fromRaw, span) : outside();
    let to = toRaw !== undefined ? this.participant(toRaw, span) : outside();
    if (leftGate !== undefined || rightGate !== undefined) {
      this.reporter.approximated("sequence.gate", span, messages().plantumlSequence.gate);
    }
    if (teoz !== undefined) {
      this.reporter.approximated("sequence.teoz", span, messages().plantumlSequence.parallel);
    }
    // `-[#red]->` is a solid arrow with a colour; only `--` makes it dashed.
    const dashed = body1 === "--";
    void body2;
    const reversed = leftHead !== "" && rightHead === "";
    if (reversed) [from, to] = [to, from];
    const head = reversed ? leftHead : rightHead;
    let async = false;
    const plain = (h: string) => h === ">" || h === "<";
    const twoWay = plain(leftHead) && plain(rightHead);
    if (twoWay) {
      this.reporter.mapped("sequence.message.both");
    } else if (leftHead !== "" && rightHead !== "") {
      this.reporter.approximated(
        "sequence.message.both",
        span,
        messages().plantumlSequence.twoHeads,
      );
    } else if (head === ">>" || head === "<<") {
      async = true;
      this.reporter.mapped("sequence.message.async");
    } else if (head === ">" || head === "<") {
      this.reporter.mapped(dashed ? "sequence.message.reply" : "sequence.message.call");
    } else {
      this.reporter.approximated("sequence.message.head", span, messages().plantumlSequence.heads);
    }
    if (bracket !== undefined)
      this.reporter.dropped(
        "sequence.message.colour",
        span,
        messages().plantumlSequence.messageColours,
      );
    const text = label !== undefined ? plainText(label) : "";
    const comments = this.comments.take();
    const suffixWord = suffix?.slice(0, 2);
    if (suffixWord === "**") {
      this.events.push({ type: "create", target: to.id, comments: [] });
      this.reporter.mapped("sequence.create");
    }
    this.events.push({
      type: "message",
      from: from.id,
      to: to.id,
      dashed,
      ...(twoWay ? { twoWay: true } : {}),
      async,
      ...(text !== "" ? { label: text } : {}),
      comments,
    });
    this.lastMessage = { from: from.id, to: to.id };
    if (suffixWord === "++") {
      this.events.push({ type: "activate", target: to.id, comments: [] });
      this.active.push({ id: to.id, caller: from.id });
      this.reporter.mapped("sequence.activation.shorthand");
    } else if (suffixWord === "--") {
      this.events.push({ type: "deactivate", target: from.id, comments: [] });
      this.popActive(from.id);
      this.reporter.mapped("sequence.activation.shorthand");
    } else if (suffixWord === "!!") {
      this.events.push({ type: "destroy", target: to.id, comments: [] });
      this.reporter.mapped("sequence.destroy");
    }
    return true;
  }
}
