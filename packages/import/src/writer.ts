import { formatNumber, quoteString } from "@meltemi/diagrams-edit";
import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import { formatSource } from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";

/** Style properties in written order, with values already in source form (`"#fff"`, `3`). */
export type Props = [name: string, value: string][];

/** Quotes a label or a value as a `.meltemi` string. */
export const quote = quoteString;

/** A quoted CSS value for `fill`, `stroke` and `color`. */
export function cssValue(value: string): string {
  return quoteString(value.trim());
}

// ---------------------------------------------------------------------------------------------
// Flow diagrams and free compositions

export interface SheetElement {
  /** `node`, `decision`, `data`, `note`, `tag` and `group` in flow; `box`, `text`, `group` in free. */
  kind: string;
  id: string;
  /** `null` writes no label, so the label is the id. */
  label: string | null;
  description?: string;
  classes: string[];
  children: SheetElement[];
  comments: string[];
  /** Free compositions: centre, relative to the parent group's interior. */
  place?: { x: number; y: number };
  size?: { w: number; h: number };
}

export interface SheetRelation {
  from: string;
  to: string;
  dashed: boolean;
  /** Written `<->` or `<-->`: the same head at both ends. */
  twoWay?: boolean;
  label?: string;
  id?: string;
  classes: string[];
  comments: string[];
  /** Extra block statements, already written (`kind async`, `technology "…"`). */
  block?: string[];
}

export interface FlowSheet {
  type: "flow" | "free";
  id: string;
  title?: string;
  description?: string;
  direction?: string;
  /** `auto` writes `layout auto`; free compositions leave it out (manual by default). */
  layout?: "auto";
  elements: SheetElement[];
  relations: SheetRelation[];
  classDefs: { id: string; props: Props }[];
  rules: { kind: string; props: Props }[];
  styles: { targets: string[]; props: Props }[];
  routes: { relation: string; from: string; to: string }[];
  animates: { targets: string[]; props: Props }[];
  comments: string[];
  /** Comments at the end of the diagram, such as source lines that were not imported. */
  trailing: string[];
}

export function emptyFlowSheet(type: "flow" | "free", id: string): FlowSheet {
  return {
    type,
    id,
    elements: [],
    relations: [],
    classDefs: [],
    rules: [],
    styles: [],
    routes: [],
    animates: [],
    comments: [],
    trailing: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Sequence diagrams

export interface SeqParticipant {
  type: "participant";
  kind: string;
  id: string;
  label: string | null;
  comments: string[];
}

export interface SeqGroup {
  type: "group";
  id: string;
  label: string | null;
  members: SeqParticipant[];
  comments: string[];
}

export type SeqEvent =
  | {
      type: "message";
      from: string;
      to: string;
      dashed: boolean;
      /** Written `<->` or `<-->`: a head at both ends. */
      twoWay?: boolean;
      async: boolean;
      label?: string;
      comments: string[];
    }
  | {
      type: "activate" | "deactivate" | "create" | "destroy";
      target: string;
      comments: string[];
    }
  | {
      type: "note";
      position: "over" | "left of" | "right of";
      targets: string[];
      text: string;
      comments: string[];
    }
  | {
      type: "fragment";
      operator: string;
      id: string;
      branches: { label: string | null; events: SeqEvent[] }[];
      comments: string[];
    }
  | { type: "divider"; text: string; comments: string[] }
  | { type: "delay"; text: string | null; comments: string[] }
  | { type: "comment"; text: string };

export interface SequenceSheet {
  type: "sequence";
  id: string;
  title?: string;
  description?: string;
  autonumber: number | null;
  participants: (SeqParticipant | SeqGroup)[];
  events: SeqEvent[];
  styles: { targets: string[]; props: Props }[];
  comments: string[];
  trailing: string[];
}

export function emptySequenceSheet(id: string): SequenceSheet {
  return {
    type: "sequence",
    id,
    autonumber: null,
    participants: [],
    events: [],
    styles: [],
    comments: [],
    trailing: [],
  };
}

/** The keyword that opens the second and later branches of a fragment. */
export const BRANCH_KEYWORD: Readonly<Record<string, string>> = {
  alt: "else",
  par: "and",
  critical: "option",
};

// ---------------------------------------------------------------------------------------------
// Models and C4 views

export type EntityKind = "person" | "system" | "container" | "datastore" | "component";

export interface C4Entity {
  kind: EntityKind;
  id: string;
  label: string | null;
  description?: string;
  technology?: string;
  external: boolean;
  children: C4Entity[];
  comments: string[];
}

export interface C4Relation {
  /** Full paths from the model's root. */
  from: string;
  to: string;
  label?: string;
  technology?: string;
  comments: string[];
}

export interface C4Sheet {
  type: "c4";
  /** The view's id. */
  id: string;
  model: string;
  title?: string;
  description?: string;
  level: "context" | "container" | "component";
  scope?: string;
  include: string[];
  direction?: string;
  entities: C4Entity[];
  relations: C4Relation[];
  comments: string[];
  trailing: string[];
}

export type Sheet = FlowSheet | SequenceSheet | C4Sheet;

// ---------------------------------------------------------------------------------------------
// Printing

class Out {
  readonly lines: string[] = [];
  private depth = 0;

  line(text: string): void {
    this.lines.push(text === "" ? "" : "  ".repeat(this.depth) + text);
  }

  comments(texts: readonly string[]): void {
    for (const text of texts) {
      for (const part of text.split(/\r?\n/)) {
        const trimmed = part.trim();
        this.line(trimmed === "" ? "//" : `// ${trimmed}`);
      }
    }
  }

  open(text: string): void {
    this.line(`${text} {`);
    this.depth++;
  }

  close(suffix = ""): void {
    this.depth--;
    this.line(`}${suffix}`);
  }

  blank(): void {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== "") this.lines.push("");
  }

  /** Re-opens after a `}` written by `close` (for `} else "x" {`). */
  reopen(text: string): void {
    const last = this.lines.pop()!;
    this.lines.push(`${last} ${text} {`);
    this.depth++;
  }
}

function labelPart(id: string, label: string | null | undefined): string {
  return label === null || label === undefined || label === id ? "" : ` ${quoteString(label)}`;
}

function propsText(props: Props): string {
  return props.map(([name, value]) => `${name} ${value}`).join("; ");
}

function point(x: number, y: number): string {
  return `(${formatNumber(x)}, ${formatNumber(y)})`;
}

function printElement(out: Out, el: SheetElement): void {
  out.comments(el.comments);
  const head = `${el.kind} ${el.id}${labelPart(el.id, el.label)}`;
  const inner: string[] = [];
  if (el.description !== undefined) inner.push(`description ${quoteString(el.description)}`);
  if (el.classes.length > 0) inner.push(`class ${el.classes.join(", ")}`);
  if (el.children.length === 0) {
    if (inner.length === 0) out.line(head);
    else if (inner.length === 1 && el.kind !== "group") out.line(`${head} { ${inner[0]} }`);
    else {
      out.open(head);
      for (const line of inner) out.line(line);
      out.close();
    }
    return;
  }
  out.open(head);
  for (const line of inner) out.line(line);
  for (const child of el.children) printElement(out, child);
  out.close();
}

function printRelation(out: Out, rel: SheetRelation): void {
  out.comments(rel.comments);
  let text = `${rel.from} ${rel.twoWay ? "<" : ""}${rel.dashed ? "-->" : "->"} ${rel.to}`;
  if (rel.label !== undefined) text += `: ${quoteString(rel.label)}`;
  if (rel.id !== undefined) text += ` as ${rel.id}`;
  const inner = [...(rel.block ?? [])];
  if (rel.classes.length > 0) inner.push(`class ${rel.classes.join(", ")}`);
  if (inner.length > 0) text += ` { ${inner.join("; ")} }`;
  out.line(text);
}

function placements(elements: readonly SheetElement[], into: string[]): void {
  for (const el of elements) {
    if (el.place) into.push(`place ${el.id} at ${point(el.place.x, el.place.y)}`);
    if (el.size) into.push(`size ${el.id} ${point(el.size.w, el.size.h)}`);
    placements(el.children, into);
  }
}

function printStyles(out: Out, styles: FlowSheet["styles"]): void {
  for (const style of styles) {
    if (style.props.length === 0 || style.targets.length === 0) continue;
    out.line(`style ${style.targets.join(", ")} { ${propsText(style.props)} }`);
  }
}

function printFlow(out: Out, sheet: FlowSheet): void {
  out.comments(sheet.comments);
  out.open(`diagram ${sheet.id}: ${sheet.type}`);
  if (sheet.title !== undefined) out.line(`title ${quoteString(sheet.title)}`);
  if (sheet.description !== undefined) out.line(`description ${quoteString(sheet.description)}`);
  if (sheet.direction !== undefined) out.line(`direction ${sheet.direction}`);
  if (sheet.layout !== undefined) out.line(`layout ${sheet.layout}`);
  if (sheet.classDefs.length > 0 || sheet.rules.length > 0) {
    out.blank();
    for (const def of sheet.classDefs) out.line(`class ${def.id} { ${propsText(def.props)} }`);
    for (const rule of sheet.rules) out.line(`rule ${rule.kind} { ${propsText(rule.props)} }`);
  }
  if (sheet.elements.length > 0) {
    out.blank();
    for (const el of sheet.elements) printElement(out, el);
  }
  if (sheet.relations.length > 0) {
    out.blank();
    for (const rel of sheet.relations) printRelation(out, rel);
  }
  const placed: string[] = [];
  placements(sheet.elements, placed);
  for (const route of sheet.routes) {
    placed.push(`route ${route.relation} from ${route.from} to ${route.to}`);
  }
  if (placed.length > 0) {
    out.blank();
    out.open("placement");
    for (const line of placed) out.line(line);
    out.close();
  }
  if (sheet.styles.some((s) => s.props.length > 0 && s.targets.length > 0)) {
    out.blank();
    printStyles(out, sheet.styles);
  }
  if (sheet.animates.length > 0) {
    out.blank();
    for (const a of sheet.animates) {
      out.line(`animate ${a.targets.join(", ")} { ${propsText(a.props)} }`);
    }
  }
  if (sheet.trailing.length > 0) {
    out.blank();
    out.comments(sheet.trailing);
  }
  out.close();
}

function printEvent(out: Out, event: SeqEvent): void {
  if (event.type === "comment") {
    out.comments([event.text]);
    return;
  }
  out.comments(event.comments);
  switch (event.type) {
    case "message": {
      let text = `${event.from} ${event.twoWay ? "<" : ""}${event.dashed ? "-->" : "->"} ${event.to}`;
      if (event.label !== undefined && event.label !== "") text += `: ${quoteString(event.label)}`;
      if (event.async) text += " { kind async }";
      out.line(text);
      return;
    }
    case "activate":
    case "deactivate":
    case "create":
    case "destroy":
      out.line(`${event.type} ${event.target}`);
      return;
    case "note":
      out.line(
        event.position === "over"
          ? `note over ${event.targets.join(", ")} ${quoteString(event.text)}`
          : `note ${event.position} ${event.targets[0]} ${quoteString(event.text)}`,
      );
      return;
    case "divider":
      out.line(`divider ${quoteString(event.text)}`);
      return;
    case "delay":
      out.line(
        event.text === null || event.text === "" ? "delay" : `delay ${quoteString(event.text)}`,
      );
      return;
    case "fragment": {
      const [first, ...rest] = event.branches;
      const label = (l: string | null) => (l === null || l === "" ? "" : ` ${quoteString(l)}`);
      out.open(`${event.operator} ${event.id}${label(first?.label ?? null)}`);
      for (const e of first?.events ?? []) printEvent(out, e);
      out.close();
      const keyword = BRANCH_KEYWORD[event.operator];
      for (const branch of rest) {
        if (!keyword) break;
        out.reopen(`${keyword}${label(branch.label)}`);
        for (const e of branch.events) printEvent(out, e);
        out.close();
      }
      return;
    }
  }
}

function printParticipant(out: Out, p: SeqParticipant): void {
  out.comments(p.comments);
  out.line(`${p.kind} ${p.id}${labelPart(p.id, p.label)}`);
}

function printSequence(out: Out, sheet: SequenceSheet): void {
  out.comments(sheet.comments);
  out.open(`diagram ${sheet.id}: sequence`);
  if (sheet.title !== undefined) out.line(`title ${quoteString(sheet.title)}`);
  if (sheet.description !== undefined) out.line(`description ${quoteString(sheet.description)}`);
  if (sheet.autonumber !== null) {
    out.line(sheet.autonumber === 1 ? "autonumber" : `autonumber ${sheet.autonumber}`);
  }
  if (sheet.participants.length > 0) {
    out.blank();
    for (const item of sheet.participants) {
      if (item.type === "participant") {
        printParticipant(out, item);
        continue;
      }
      out.comments(item.comments);
      out.open(`group ${item.id}${labelPart(item.id, item.label)}`);
      for (const member of item.members) printParticipant(out, member);
      out.close();
    }
  }
  if (sheet.events.length > 0) {
    out.blank();
    for (const event of sheet.events) printEvent(out, event);
  }
  if (sheet.styles.length > 0) {
    out.blank();
    printStyles(out, sheet.styles);
  }
  if (sheet.trailing.length > 0) {
    out.blank();
    out.comments(sheet.trailing);
  }
  out.close();
}

function printEntity(out: Out, entity: C4Entity): void {
  out.comments(entity.comments);
  const head = `${entity.kind} ${entity.id}${labelPart(entity.id, entity.label)}`;
  const inner: string[] = [];
  if (entity.description !== undefined)
    inner.push(`description ${quoteString(entity.description)}`);
  if (entity.technology !== undefined) inner.push(`technology ${quoteString(entity.technology)}`);
  if (entity.external) inner.push("external");
  if (entity.children.length === 0 && inner.length === 0) {
    out.line(head);
    return;
  }
  if (entity.children.length === 0 && inner.length === 1) {
    out.line(`${head} { ${inner[0]} }`);
    return;
  }
  out.open(head);
  for (const line of inner) out.line(line);
  for (const child of entity.children) printEntity(out, child);
  out.close();
}

function printC4(out: Out, sheet: C4Sheet): void {
  out.comments(sheet.comments);
  out.open(`model ${sheet.model}`);
  for (const entity of sheet.entities) printEntity(out, entity);
  if (sheet.relations.length > 0) {
    out.blank();
    for (const rel of sheet.relations) {
      out.comments(rel.comments);
      let text = `${rel.from} -> ${rel.to}`;
      if (rel.label !== undefined && rel.label !== "") text += `: ${quoteString(rel.label)}`;
      if (rel.technology !== undefined) text += ` { technology ${quoteString(rel.technology)} }`;
      out.line(text);
    }
  }
  out.close();
  out.blank();
  out.open(`diagram ${sheet.id}: c4 using ${sheet.model}`);
  if (sheet.title !== undefined) out.line(`title ${quoteString(sheet.title)}`);
  if (sheet.description !== undefined) out.line(`description ${quoteString(sheet.description)}`);
  out.line(`level ${sheet.level}`);
  if (sheet.scope !== undefined) out.line(`scope ${sheet.scope}`);
  if (sheet.include.length > 0) out.line(`include ${sheet.include.join(", ")}`);
  if (sheet.direction !== undefined) out.line(`direction ${sheet.direction}`);
  if (sheet.trailing.length > 0) {
    out.blank();
    out.comments(sheet.trailing);
  }
  out.close();
}

export interface SheetHeader {
  readonly fileName?: string;
  readonly format: string;
  /** The language of the header comment; English by default. */
  readonly locale?: Locale;
}

/** Writes a sheet with the header, the diagrams and the canonical formatting. */
export function printSheet(header: SheetHeader, sheets: readonly Sheet[]): string {
  const out = new Out();
  out.line('language "0.2"');
  out.line("");
  const from = header.fileName
    ? `${header.fileName.replace(/\\/g, "/").split("/").pop()} (${header.format})`
    : header.format;
  out.line(`// ${messages(header.locale ?? DEFAULT_LOCALE).content.header(from)}`);
  for (const sheet of sheets) {
    out.blank();
    if (sheet.type === "sequence") printSequence(out, sheet);
    else if (sheet.type === "c4") printC4(out, sheet);
    else printFlow(out, sheet);
  }
  const text = out.lines.join("\n") + "\n";
  const formatted = formatSource(text);
  return formatted.ok ? formatted.text : text;
}
