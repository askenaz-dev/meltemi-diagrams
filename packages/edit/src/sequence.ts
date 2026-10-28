import {
  isToken,
  type Block,
  type CstNode,
  type KeywordStatement,
  type Statement,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import {
  FRAGMENT_BRANCH_KEYWORDS,
  FRAGMENT_OPERATORS,
  PARTICIPANT_KINDS,
  relationNameAnchor,
  type FragmentEvent,
  type MessageEvent,
  type PlacementEntry,
  type SequenceEvent,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, requireElement, type EditContext } from "./context.js";
import { declarationText, usedIds } from "./create.js";
import { deleteStatements } from "./delete.js";
import {
  diagramBody,
  groupBlock,
  insertAfter,
  insertBefore,
  insertDeclaration,
  isDeclaration,
  reindent,
  verifyNoNewErrors,
} from "./insert.js";
import { reasons } from "./messages/index.js";
import { insertPlacements, removeListItems, requireNewId, type OperationOf } from "./plan.js";
import { relationDependents } from "./relations.js";
import { formatNumber, lineIndent, quoteString } from "./text.js";
import { renameInStories } from "./stories.js";

const PARTICIPANTS: ReadonlySet<string> = new Set(PARTICIPANT_KINDS);
const EVENT_KEYWORDS: ReadonlySet<string> = new Set([
  "activate",
  "deactivate",
  "create",
  "destroy",
  "note",
  "divider",
  "delay",
  "return",
  ...FRAGMENT_OPERATORS,
]);

/** Refuses an operation on a diagram that is not a sequence diagram. */
export function requireSequence(ctx: EditContext): void {
  if (ctx.diagram.type !== "sequence") {
    reject("edit.unsafe-target", reasons().sequence.notSequence(ctx.diagram.id));
  }
}

/** Refuses the flow geometry operations on a sequence diagram. */
export function refuseFlowGeometry(ctx: EditContext, kind: string): void {
  if (ctx.diagram.type !== "sequence") return;
  reject("edit.invalid-value", reasons().sequence.flowGeometry(kind));
}

/** Whether a statement belongs to the event order of a sequence diagram. */
export function isEventStatement(statement: Statement): boolean {
  return (
    statement.kind === "RelationStatement" ||
    (statement.kind === "KeywordStatement" && EVENT_KEYWORDS.has(statement.keyword.text))
  );
}

export function requireEvent(ctx: EditContext, key: string): SequenceEvent {
  const event = ctx.diagram.eventsByKey.get(key);
  if (!event) {
    reject("edit.unsafe-target", reasons().sequence.noEvent(key, ctx.diagram.id));
  }
  return event;
}

function requireFragment(ctx: EditContext, key: string): FragmentEvent {
  const event = requireEvent(ctx, key);
  if (event.kind !== "fragment") reject("edit.unsafe-target", reasons().sequence.notFragment(key));
  return event;
}

/** The block of a call: the block on its relation statement. */
function callBlock(call: MessageEvent): Block | undefined {
  const node = call.node;
  return node.kind === "RelationStatement" && node.block?.kind === "Block" ? node.block : undefined;
}

/** The block that holds an event: the diagram body, a fragment branch or a call's block. */
function containerOf(ctx: EditContext, event: SequenceEvent): { block: Block; owner: number } {
  const place = event.path[event.path.length - 1];
  if (!place) return { block: diagramBody(ctx), owner: ctx.diagram.node.start };
  if ("message" in place) {
    const call = requireEvent(ctx, place.message);
    const block = call.kind === "message" ? callBlock(call) : undefined;
    if (!block) reject("edit.unsafe-target", reasons().sequence.noCallBlock(place.message));
    return { block, owner: call.node.start };
  }
  const fragment = requireFragment(ctx, place.fragment);
  return { block: fragment.branches[place.branch]!.block, owner: fragment.node.start };
}

function siblings(block: Block): Statement[] {
  return block.statements.filter(isEventStatement);
}

/** The text of a statement re-indented for a new line indentation. */
function moved(ctx: EditContext, statement: Statement, indent: string): string {
  return reindent(
    ctx.text.slice(statement.start, statement.end),
    lineIndent(ctx.text, statement.start),
    indent,
  );
}

type Destination =
  | { readonly kind: "before" | "after"; readonly anchor: Statement; readonly block: Block }
  | { readonly kind: "start" | "end"; readonly block: Block; readonly owner: number };

/** Deletes a statement and writes it again at a destination. */
function relocate(ctx: EditContext, statement: Statement, to: Destination): TextEdit[] {
  const edits = deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  const indentFor = (block: Block, owner: number) => {
    const first = block.statements[0];
    return first ? lineIndent(ctx.text, first.start) : lineIndent(ctx.text, owner) + ctx.unit;
  };
  switch (to.kind) {
    case "before": {
      const indent = lineIndent(ctx.text, to.anchor.start);
      edits.push(insertBefore(ctx, to.anchor, () => moved(ctx, statement, indent)));
      break;
    }
    case "after": {
      const indent = lineIndent(ctx.text, to.anchor.start);
      edits.push(insertAfter(ctx, to.block, to.anchor, () => moved(ctx, statement, indent)));
      break;
    }
    case "start": {
      const first = to.block.statements[0];
      const indent = indentFor(to.block, to.owner);
      edits.push(
        first
          ? insertBefore(ctx, first, () => moved(ctx, statement, indent))
          : insertStatement(ctx, to.block, to.owner, () => moved(ctx, statement, indent)),
      );
      break;
    }
    case "end": {
      const indent = indentFor(to.block, to.owner);
      edits.push(insertStatement(ctx, to.block, to.owner, () => moved(ctx, statement, indent)));
      break;
    }
  }
  return edits;
}

// ---------------------------------------------------------------------- participants

export function reorderParticipant(
  ctx: EditContext,
  op: OperationOf<"reorderParticipant">,
): TextEdit[] {
  requireSequence(ctx);
  const element = requireElement(ctx, op.participant);
  if (!PARTICIPANTS.has(element.kind) && element.kind !== "group") {
    reject("edit.unsafe-target", reasons().sequence.notParticipantOrGroup(element.id));
  }
  const parent = element.groupPath[element.groupPath.length - 1];
  const { block, owner } = parent
    ? groupBlock(ctx, parent)
    : { block: diagramBody(ctx), owner: ctx.diagram.node.start };
  const declared = block.statements.filter(isDeclaration);
  const index = Math.max(
    0,
    Math.min(Math.round(op.index), declared.length - (element.node ? 1 : 0)),
  );
  if (!element.node) {
    const text = declarationText(element.kind, element.id, element.label, "sequence");
    const anchor = declared[index];
    const edits = anchor
      ? [insertBefore(ctx, anchor, () => text)]
      : [insertDeclaration(ctx, block, owner, () => text)];
    verifyNoNewErrors(ctx, edits);
    return edits;
  }
  const current = declared.indexOf(element.node);
  if (current === index) return [];
  const others = declared.filter((s) => s !== element.node);
  const edits =
    index < others.length
      ? relocate(ctx, element.node, { kind: "before", anchor: others[index]!, block })
      : relocate(ctx, element.node, { kind: "after", anchor: others[others.length - 1]!, block });
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- events

export function moveEvent(ctx: EditContext, op: OperationOf<"moveEvent">): TextEdit[] {
  requireSequence(ctx);
  const event = requireEvent(ctx, op.event);
  const statement = event.node;
  const { block } = containerOf(ctx, event);
  const list = siblings(block);
  const index = list.indexOf(statement);
  const up = op.direction === "up";
  const neighbour = list[up ? index - 1 : index + 1];
  let edits: TextEdit[];
  if (neighbour) {
    const fragment =
      neighbour.kind === "KeywordStatement" &&
      FRAGMENT_OPERATORS.includes(neighbour.keyword.text as never)
        ? [...ctx.diagram.eventsByKey.values()].find((e) => e.node === neighbour)
        : undefined;
    const call =
      neighbour.kind === "RelationStatement"
        ? [...ctx.diagram.eventsByKey.values()].find((e) => e.node === neighbour)
        : undefined;
    if (call?.kind === "message" && call.events.length > 0) {
      // Into the adjacent call's block: before its trailing `return` going up, so that the
      // return stays last; at its start going down.
      const block = callBlock(call)!;
      const inner = siblings(block);
      const last = inner[inner.length - 1];
      const returns = last?.kind === "KeywordStatement" && last.keyword.text === "return";
      edits = up
        ? returns
          ? relocate(ctx, statement, { kind: "before", anchor: last, block })
          : relocate(ctx, statement, { kind: "end", block, owner: call.node.start })
        : inner[0]
          ? relocate(ctx, statement, { kind: "before", anchor: inner[0], block })
          : relocate(ctx, statement, { kind: "start", block, owner: call.node.start });
    } else if (fragment && fragment.kind === "fragment") {
      // Into the adjacent fragment: the end of its last branch, or the start of its first.
      const branch = up ? fragment.branches[fragment.branches.length - 1]! : fragment.branches[0]!;
      edits = relocate(ctx, statement, {
        kind: up ? "end" : "start",
        block: branch.block,
        owner: fragment.node.start,
      });
    } else {
      edits = relocate(ctx, statement, { kind: up ? "before" : "after", anchor: neighbour, block });
    }
  } else {
    // At the edge of a branch: into the neighbouring branch, or out of the fragment; at the
    // edge of a call's block, out of the call.
    const place = event.path[event.path.length - 1];
    if (!place) return [];
    if ("message" in place) {
      const call = requireEvent(ctx, place.message);
      const outer = containerOf(ctx, call);
      const edits = relocate(ctx, statement, {
        kind: up ? "before" : "after",
        anchor: call.node,
        block: outer.block,
      });
      verifyNoNewErrors(ctx, edits);
      return edits;
    }
    const fragment = requireFragment(ctx, place.fragment);
    const next = fragment.branches[place.branch + (up ? -1 : 1)];
    if (next) {
      edits = relocate(ctx, statement, {
        kind: up ? "end" : "start",
        block: next.block,
        owner: fragment.node.start,
      });
    } else {
      const outer = containerOf(ctx, fragment);
      edits = relocate(ctx, statement, {
        kind: up ? "before" : "after",
        anchor: fragment.node,
        block: outer.block,
      });
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** A fresh id for a note, a fragment or a message, as `createElement` would choose ids. */
function freshEventId(ctx: EditContext, base: string): string {
  const used = usedIds(ctx);
  for (const key of ctx.diagram.eventsByKey.keys()) used.add(key);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** The id of an event, with the edit that writes it when the event has none. */
function namedEvent(ctx: EditContext, event: SequenceEvent): { id: string; edits: TextEdit[] } {
  if (event.id !== null) return { id: event.id, edits: [] };
  const node = event.node;
  if (event.kind === "message") {
    const relation = ctx.diagram.relationsByKey.get(event.relation)!;
    const id = freshEventId(ctx, `${relation.from}_${relation.to}`);
    const anchor = relationNameAnchor(relation);
    return { id, edits: [{ start: anchor, end: anchor, newText: ` as ${id}` }] };
  }
  if (event.kind === "note" || event.kind === "fragment") {
    const keyword = (node as KeywordStatement).keyword;
    const id = freshEventId(ctx, event.kind === "note" ? "note" : event.operator);
    return { id, edits: [{ start: keyword.end, end: keyword.end, newText: ` ${id}` }] };
  }
  reject("edit.unsafe-target", reasons().sequence.noSpace(event.kind));
}

export function setSpacing(ctx: EditContext, op: OperationOf<"setSpacing">): TextEdit[] {
  requireSequence(ctx);
  const side = op.side ?? "before";
  const amount = op.amount === null || Math.round(op.amount) === 0 ? null : Math.round(op.amount);
  const statement = op.targetKind === "event" ? "space" : "gap";
  const onSide = (p: PlacementEntry) =>
    (p.statement === "space" || p.statement === "gap") && p.side === side;
  let id: string;
  const edits: TextEdit[] = [];
  if (op.targetKind === "event") {
    if (amount !== null && amount < 0)
      reject("edit.invalid-value", reasons().sequence.negativeSpace);
    const event = requireEvent(ctx, op.target);
    const entry = event.id
      ? ctx.diagram.placement.find(
          (p) => p.statement === "space" && p.target === event.id && onSide(p),
        )
      : undefined;
    if (!entry && amount === null) return [];
    const named = namedEvent(ctx, event);
    id = named.id;
    edits.push(...named.edits);
  } else {
    const element = requireElement(ctx, op.target);
    if (!PARTICIPANTS.has(element.kind))
      reject("edit.unsafe-target", reasons().sequence.notParticipant(element.id));
    id = element.id;
    // Before the first participant and after the last there is nothing to bring closer.
    const order = ctx.diagram.elements.filter((e) => e.kind !== "group");
    const edge = side === "before" ? order[0]?.id === id : order[order.length - 1]?.id === id;
    if (amount !== null && amount < 0 && edge)
      reject("edit.invalid-value", reasons().sequence.outerGap(id));
  }
  const entry = ctx.diagram.placement.find(
    (p) => p.statement === statement && p.target === id && onSide(p),
  );
  if (entry) {
    if (amount === null) {
      edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, [entry.node]));
    } else {
      const arg = entry.node.args[1];
      if (arg?.kind !== "NumberLiteral")
        reject("edit.unsafe-target", reasons().sequence.amountUnreadable);
      if (arg.value === amount) return edits;
      edits.push({ start: arg.token.start, end: arg.token.end, newText: formatNumber(amount) });
    }
  } else if (amount !== null) {
    // `before` is the default and never written.
    const written = side === "after" ? " after" : "";
    edits.push(insertPlacements(ctx, [`${statement} ${id} ${formatNumber(amount)}${written}`]));
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function insertEvent(ctx: EditContext, op: OperationOf<"insertEvent">): TextEdit[] {
  requireSequence(ctx);
  let edit: TextEdit;
  if (op.after !== undefined) {
    const event = requireEvent(ctx, op.after);
    const { block } = containerOf(ctx, event);
    edit = insertAfter(ctx, block, event.node, (indent) =>
      reindent(op.statement, "", indent ?? ""),
    );
  } else if (op.inside !== undefined && "message" in op.inside) {
    // Last in the call's block, which is created when the call has none.
    const call = requireEvent(ctx, op.inside.message);
    if (call.kind !== "message" || call.node.kind !== "RelationStatement") {
      reject("edit.unsafe-target", reasons().sequence.notMessage(op.inside.message));
    }
    const node = call.node;
    const block = callBlock(call);
    if (block) {
      edit = insertStatement(ctx, block, node.start, (indent) =>
        reindent(op.statement, "", indent ?? ""),
      );
    } else {
      const indent = lineIndent(ctx.text, node.start);
      const inner = indent + ctx.unit;
      edit = {
        start: node.end,
        end: node.end,
        newText: ` {${ctx.eol}${inner}${reindent(op.statement, "", inner)}${ctx.eol}${indent}}`,
      };
    }
  } else if (op.inside !== undefined) {
    const fragment = requireFragment(ctx, op.inside.fragment);
    const branch = fragment.branches[op.inside.branch];
    if (!branch)
      reject("edit.unsafe-target", reasons().sequence.noBranch(fragment.key, op.inside.branch + 1));
    const first = branch.block.statements[0];
    edit = first
      ? insertBefore(ctx, first, (indent) => reindent(op.statement, "", indent ?? ""))
      : insertStatement(ctx, branch.block, fragment.node.start, (indent) =>
          reindent(op.statement, "", indent ?? ""),
        );
  } else {
    const body = diagramBody(ctx);
    const events = siblings(body);
    const last = events[events.length - 1];
    edit = last
      ? insertAfter(ctx, body, last, (indent) => reindent(op.statement, "", indent ?? ""))
      : insertDeclaration(ctx, body, ctx.diagram.node.start, (indent) =>
          reindent(op.statement, "", indent ?? ""),
        );
  }
  const edits = [edit];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- fragments

export function wrapInFragment(ctx: EditContext, op: OperationOf<"wrapInFragment">): TextEdit[] {
  requireSequence(ctx);
  if (!(FRAGMENT_OPERATORS as readonly string[]).includes(op.operator)) {
    reject(
      "edit.invalid-value",
      reasons().sequence.notFragmentOperator(op.operator, FRAGMENT_OPERATORS),
    );
  }
  if (op.events.length === 0) reject("edit.unsafe-target", reasons().sequence.selectEvents);
  const events = op.events.map((key) => requireEvent(ctx, key));
  const { block } = containerOf(ctx, events[0]!);
  const list = siblings(block);
  const indices = events.map((e) => list.indexOf(e.node)).sort((a, b) => a - b);
  if (indices.some((i) => i < 0) || events.some((e) => containerOf(ctx, e).block !== block)) {
    reject("edit.unsafe-target", reasons().sequence.sameBlock);
  }
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1)
      reject("edit.unsafe-target", reasons().sequence.consecutive);
  }
  const first = list[indices[0]!]!;
  const last = list[indices[indices.length - 1]!]!;
  const indent = lineIndent(ctx.text, first.start);
  if (op.id !== undefined && usedIds(ctx).has(op.id))
    reject("edit.id-conflict", reasons().ids.used(op.id));
  const head = `${op.operator}${op.id ? ` ${op.id}` : ""}${op.condition ? ` ${quoteString(op.condition)}` : ""}`;
  const body = reindent(ctx.text.slice(first.start, last.end), indent, indent + ctx.unit);
  const edits: TextEdit[] = [
    {
      start: first.start,
      end: last.end,
      newText: `${head} {${ctx.eol}${indent}${ctx.unit}${body}${ctx.eol}${indent}}`,
    },
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function unwrapFragment(ctx: EditContext, op: OperationOf<"unwrapFragment">): TextEdit[] {
  requireSequence(ctx);
  const fragment = requireFragment(ctx, op.fragment);
  if (
    fragment.branches.slice(1).some((b) => b.events.length > 0 || b.block.statements.length > 0)
  ) {
    reject("edit.unsafe-target", reasons().sequence.otherBranches(fragment.key));
  }
  const statements = fragment.branches[0]!.block.statements;
  const indent = lineIndent(ctx.text, fragment.node.start);
  // The fragment's own space, styles and scenario choices go with it; its events stay.
  const dependents = eventDependents(ctx, fragment.id ? new Set([fragment.id]) : new Set());
  let edits: TextEdit[];
  if (statements.length === 0) {
    edits = deleteStatements(ctx.text, ctx.compilation.parse.root, [
      fragment.node,
      ...dependents.statements,
    ]);
  } else {
    const first = statements[0]!;
    const last = statements[statements.length - 1]!;
    const text = reindent(
      ctx.text.slice(first.start, last.end),
      lineIndent(ctx.text, first.start),
      indent,
    );
    edits = [
      { start: fragment.node.start, end: fragment.node.end, newText: text },
      ...deleteStatements(ctx.text, ctx.compilation.parse.root, dependents.statements),
    ];
  }
  edits.push(...dependents.edits);
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function addBranch(ctx: EditContext, op: OperationOf<"addBranch">): TextEdit[] {
  requireSequence(ctx);
  const fragment = requireFragment(ctx, op.fragment);
  const keyword = FRAGMENT_BRANCH_KEYWORDS[fragment.operator];
  if (!keyword) reject("edit.invalid-value", reasons().sequence.singleBranch(fragment.operator));
  const indent = lineIndent(ctx.text, fragment.node.start);
  const condition = op.condition ? ` ${quoteString(op.condition)}` : "";
  const edits: TextEdit[] = [
    {
      start: fragment.node.end,
      end: fragment.node.end,
      newText: ` ${keyword}${condition} {${ctx.eol}${indent}}`,
    },
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function setFragmentCondition(
  ctx: EditContext,
  op: OperationOf<"setFragmentCondition">,
): TextEdit[] {
  requireSequence(ctx);
  const fragment = requireFragment(ctx, op.fragment);
  const branch = fragment.branches[op.branch];
  if (!branch)
    reject("edit.unsafe-target", reasons().sequence.noBranch(fragment.key, op.branch + 1));
  const node = fragment.node as KeywordStatement;
  const clause = node.chain ? node.chain.clauses[op.branch]! : node;
  const args = clause.args;
  const current = args.find((a) => a.kind === "StringLiteral");
  let edits: TextEdit[];
  if (op.condition === null || op.condition === "") {
    if (!current) return [];
    edits = [{ start: current.start - 1, end: current.end, newText: "" }];
  } else {
    const quoted = quoteString(op.condition);
    if (current) {
      if (current.kind === "StringLiteral" && current.token.text === quoted) return [];
      edits = [{ start: current.start, end: current.end, newText: quoted }];
    } else {
      const anchor = args[args.length - 1]?.end ?? clause.keyword.end;
      edits = [{ start: anchor, end: anchor, newText: ` ${quoted}` }];
    }
  }
  // Scenarios that choose the branch by its condition follow the change.
  for (const scenario of ctx.diagram.scenarios) {
    for (const choice of scenario.choices) {
      if (
        choice.kind !== "choose" ||
        choice.fragment !== fragment.id ||
        choice.branch !== op.branch
      )
        continue;
      const value = choice.node.args[1];
      if (value?.kind !== "StringLiteral") continue;
      const newText = op.condition ? quoteString(op.condition) : formatNumber(op.branch + 1);
      edits.push({ start: value.start, end: value.end, newText });
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The event statements that depend on removed participants: lifecycles, activations and notes. */
export function participantEvents(ctx: EditContext, removed: ReadonlySet<string>): SequenceEvent[] {
  const found: SequenceEvent[] = [];
  const visit = (events: readonly SequenceEvent[]) => {
    for (const event of events) {
      if (
        (event.kind === "activate" ||
          event.kind === "deactivate" ||
          event.kind === "create" ||
          event.kind === "destroy") &&
        removed.has(event.participant)
      ) {
        found.push(event);
      } else if (event.kind === "note" && event.participants.some((p) => removed.has(p))) {
        found.push(event);
      } else if (event.kind === "fragment") {
        for (const branch of event.branches) visit(branch.events);
      } else if (event.kind === "message") {
        visit(event.events);
      }
    }
  };
  visit(ctx.diagram.events);
  return found;
}

export function removeEvent(ctx: EditContext, op: OperationOf<"removeEvent">): TextEdit[] {
  requireSequence(ctx);
  const event = requireEvent(ctx, op.event);
  if (event.kind === "message") {
    reject("edit.unsafe-target", reasons().sequence.removeMessage);
  }
  // A fragment goes with its events, and everything goes with what names them.
  const all = withNested([event]);
  const events = eventDependents(ctx, eventIdsOf(all));
  const relations = relationDependents(
    ctx,
    new Set(all.flatMap((e) => (e.kind === "message" && e.id !== null ? [e.id] : []))),
  );
  const edits = [
    ...deleteStatements(ctx.text, ctx.compilation.parse.root, [
      event.node,
      ...events.statements,
      ...relations.statements,
    ]),
    ...events.edits,
    ...relations.edits,
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The events with the events of the fragments and calls among them, in order. */
function withNested(events: readonly SequenceEvent[]): SequenceEvent[] {
  const all: SequenceEvent[] = [];
  const visit = (list: readonly SequenceEvent[]) => {
    for (const event of list) {
      all.push(event);
      if (event.kind === "fragment") for (const branch of event.branches) visit(branch.events);
      if (event.kind === "message") visit(event.events);
    }
  };
  visit(events);
  return all;
}

/** The events inside the blocks of the calls among `relations` (keys), at any depth. */
export function nestedInCalls(ctx: EditContext, relations: ReadonlySet<string>): SequenceEvent[] {
  const found: SequenceEvent[] = [];
  const visit = (events: readonly SequenceEvent[]) => {
    for (const event of events) {
      if (event.kind === "fragment") for (const branch of event.branches) visit(branch.events);
      else if (event.kind === "message" && relations.has(event.relation))
        found.push(...withNested(event.events));
      else if (event.kind === "message") visit(event.events);
    }
  };
  visit(ctx.diagram.events);
  return found;
}

/** The written ids of the notes and fragments among `events`. */
export function eventIdsOf(events: readonly SequenceEvent[]): Set<string> {
  return new Set(events.flatMap((e) => (e.kind !== "message" && e.id !== null ? [e.id] : [])));
}

/**
 * The statements that only name the given notes and fragments (`space`, scenario choices,
 * styles and animations), and edits that drop them from statements shared with other targets.
 */
export function eventDependents(
  ctx: EditContext,
  ids: ReadonlySet<string>,
): { statements: CstNode[]; edits: TextEdit[] } {
  const statements: CstNode[] = [];
  if (ids.size === 0) return { statements, edits: [] };
  for (const entry of ctx.diagram.placement) {
    if (entry.statement === "space" && ids.has(entry.target)) statements.push(entry.node);
  }
  for (const scenario of ctx.diagram.scenarios) {
    for (const choice of scenario.choices)
      if (ids.has(choice.fragment)) statements.push(choice.node);
  }
  const partial = new Map<KeywordStatement, Set<number>>();
  for (const entry of [...ctx.diagram.styles, ...ctx.diagram.animations]) {
    if (entry.targetKind !== "event" || !ids.has(entry.target)) continue;
    const index = entry.node.args.findIndex((arg) => arg.start === entry.targetRange.start.offset);
    const set = partial.get(entry.node) ?? new Set<number>();
    if (index >= 0) set.add(index);
    partial.set(entry.node, set);
  }
  const edits: TextEdit[] = [];
  for (const [node, indices] of partial) {
    if (indices.size >= node.args.length) statements.push(node);
    else edits.push(...removeListItems(node.args, indices));
  }
  return { statements, edits };
}

export function renameEvent(ctx: EditContext, op: OperationOf<"renameEvent">): TextEdit[] {
  requireSequence(ctx);
  const event = requireEvent(ctx, op.event);
  if (event.kind !== "note" && event.kind !== "fragment") {
    reject(
      "edit.unsafe-target",
      event.kind === "message"
        ? reasons().sequence.renameMessage
        : reasons().sequence.eventNoId(event.kind),
    );
  }
  if (op.newId === event.id) return [];
  requireNewId(ctx, op.newId);
  if (event.id === null) {
    const keyword = (event.node as KeywordStatement).keyword;
    return [{ start: keyword.end, end: keyword.end, newText: ` ${op.newId}` }];
  }
  const tokens = new Map<number, Token>();
  for (const reference of ctx.diagram.references) {
    if (reference.targetKind === "event" && reference.target === event.id) {
      tokens.set(reference.token.start, reference.token);
    }
  }
  return [
    ...[...tokens.values()].map((t) => ({ start: t.start, end: t.end, newText: op.newId })),
    ...renameInStories(ctx.compilation, ctx.diagram.id, event.id, op.newId, "event"),
  ];
}

/**
 * Activates a participant after a message, deactivating it after the first later message it
 * sends back to the sender in the same block, or after the block's last event; when the
 * participant is activated right after the message, removes that activation and its
 * `deactivate` instead.
 */
export function toggleActivation(
  ctx: EditContext,
  op: OperationOf<"toggleActivation">,
): TextEdit[] {
  requireSequence(ctx);
  const element = requireElement(ctx, op.participant);
  if (!PARTICIPANTS.has(element.kind))
    reject("edit.unsafe-target", reasons().sequence.notParticipant(element.id));
  const message = requireEvent(ctx, op.after);
  if (message.kind !== "message")
    reject("edit.unsafe-target", reasons().sequence.notMessage(op.after));
  const relation = ctx.diagram.relationsByKey.get(message.relation)!;
  // A call's block activates its receiver already.
  if (message.events.length > 0) {
    reject("edit.invalid-value", reasons().sequence.callActivates(message.key, relation.to));
  }
  const { block } = containerOf(ctx, message);
  const events = eventsOfBlock(ctx, message);
  const index = events.indexOf(message);
  const next = events[index + 1];
  let edits: TextEdit[];
  if (next?.kind === "activate" && next.participant === element.id) {
    // The matching `deactivate`: the first one at the same depth, at any later point in order.
    const order = withNested(ctx.diagram.events);
    let depth = 0;
    let match: SequenceEvent | undefined;
    for (const event of order.slice(order.indexOf(next) + 1)) {
      if (event.kind !== "activate" && event.kind !== "deactivate") continue;
      if (event.participant !== element.id) continue;
      if (event.kind === "activate") depth++;
      else if (depth === 0) {
        match = event;
        break;
      } else depth--;
    }
    edits = deleteStatements(
      ctx.text,
      ctx.compilation.parse.root,
      match ? [next.node, match.node] : [next.node],
    );
  } else {
    const reply = events.slice(index + 1).find((e) => {
      if (e.kind !== "message") return false;
      const r = ctx.diagram.relationsByKey.get(e.relation)!;
      return r.from === element.id && r.to === relation.from;
    });
    const last = reply ?? events[events.length - 1]!;
    const indent = lineIndent(ctx.text, message.node.start);
    edits = [
      insertAfter(ctx, block, message.node, () => `activate ${element.id}`),
      insertAfter(ctx, block, last.node, () => `deactivate ${element.id}`),
    ];
    if (last === message) {
      // Both go after the message, in order.
      edits = [
        insertAfter(
          ctx,
          block,
          message.node,
          () => `activate ${element.id}${ctx.eol}${indent}deactivate ${element.id}`,
        ),
      ];
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The events of the block that holds `event`, in order. */
function eventsOfBlock(ctx: EditContext, event: SequenceEvent): readonly SequenceEvent[] {
  const place = event.path[event.path.length - 1];
  if (!place) return ctx.diagram.events;
  if ("message" in place) {
    const call = requireEvent(ctx, place.message);
    return call.kind === "message" ? call.events : [];
  }
  const fragment = requireFragment(ctx, place.fragment);
  return fragment.branches[place.branch]!.events;
}

export function setEventText(ctx: EditContext, op: OperationOf<"setEventText">): TextEdit[] {
  requireSequence(ctx);
  const event = requireEvent(ctx, op.event);
  if (event.kind !== "note" && event.kind !== "divider" && event.kind !== "delay") {
    reject("edit.unsafe-target", reasons().sequence.noText(op.event));
  }
  const node = event.node as KeywordStatement;
  // The text of a note comes last; the label of a divider or a delay is its only argument.
  const current = event.kind === "note" ? node.args[node.args.length - 1] : node.args[0];
  if (current && current.kind !== "StringLiteral")
    reject("edit.unsafe-target", reasons().sequence.textUnreadable);
  if (op.text === null || op.text === "") {
    if (event.kind !== "delay")
      reject("edit.invalid-value", reasons().sequence.needsText(event.kind));
    if (!current) return [];
    return [{ start: node.keyword.end, end: current.end, newText: "" }];
  }
  const quoted = quoteString(op.text);
  if (!current) return [{ start: node.keyword.end, end: node.keyword.end, newText: ` ${quoted}` }];
  if (current.kind === "StringLiteral" && current.token.text === quoted) return [];
  return [{ start: current.start, end: current.end, newText: quoted }];
}

export function setNotePlacement(
  ctx: EditContext,
  op: OperationOf<"setNotePlacement">,
): TextEdit[] {
  requireSequence(ctx);
  const event = requireEvent(ctx, op.note);
  if (event.kind !== "note") reject("edit.unsafe-target", reasons().sequence.notNote(op.note));
  if (!["over", "left", "right"].includes(op.position)) {
    reject("edit.invalid-value", reasons().sequence.notePosition);
  }
  if (op.participants.length === 0)
    reject("edit.invalid-value", reasons().sequence.noteParticipant);
  if (op.position !== "over" && op.participants.length > 1) {
    reject("edit.invalid-value", reasons().sequence.oneParticipant(op.position));
  }
  for (const id of op.participants) {
    const element = requireElement(ctx, id);
    if (!PARTICIPANTS.has(element.kind))
      reject("edit.unsafe-target", reasons().sequence.notParticipant(id));
  }
  const node = event.node as KeywordStatement;
  const text = node.args[node.args.length - 1]!;
  const start = event.idRange ? event.idRange.end.offset : node.keyword.end;
  const where = op.position === "over" ? "over" : `${op.position} of`;
  const edits: TextEdit[] = [
    { start, end: text.start, newText: ` ${where} ${op.participants.join(", ")} ` },
  ];
  if (ctx.text.slice(start, text.start) === edits[0]!.newText) return [];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function setFragmentOperator(
  ctx: EditContext,
  op: OperationOf<"setFragmentOperator">,
): TextEdit[] {
  requireSequence(ctx);
  const fragment = requireFragment(ctx, op.fragment);
  if (!(FRAGMENT_OPERATORS as readonly string[]).includes(op.operator)) {
    reject("edit.invalid-value", reasons().sequence.notOperator(op.operator, FRAGMENT_OPERATORS));
  }
  if (op.operator === fragment.operator) return [];
  const keyword = FRAGMENT_BRANCH_KEYWORDS[op.operator];
  if (fragment.branches.length > 1 && !keyword) {
    reject(
      "edit.invalid-value",
      reasons().sequence.singleBranchFor(op.operator, fragment.key, fragment.branches.length),
    );
  }
  const node = fragment.node as KeywordStatement;
  const clauses = node.chain ? node.chain.clauses : [node];
  const edits: TextEdit[] = clauses.map((clause, index) => ({
    start: clause.keyword.start,
    end: clause.keyword.end,
    newText: index === 0 ? op.operator : keyword!,
  }));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- call blocks

/** The start of the comment lines right above a line, with no blank line between. */
function leadingComments(text: string, lineStart: number): number {
  let from = lineStart;
  while (from > 0) {
    const previous = text.lastIndexOf("\n", from - 2) + 1;
    if (
      !text
        .slice(previous, from - 1)
        .trim()
        .startsWith("//")
    )
      break;
    from = previous;
  }
  return from;
}

export function nestInCall(ctx: EditContext, op: OperationOf<"nestInCall">): TextEdit[] {
  requireSequence(ctx);
  const call = requireEvent(ctx, op.call);
  if (call.kind !== "message" || call.node.kind !== "RelationStatement") {
    reject("edit.unsafe-target", reasons().sequence.notMessage(op.call));
  }
  const node = call.node;
  // The events must be the siblings right after the call, in order.
  const siblingsOfCall = eventsOfBlock(ctx, call);
  const at = siblingsOfCall.indexOf(call);
  const chosen = op.events.map((key) => requireEvent(ctx, key));
  const following = siblingsOfCall.slice(at + 1, at + 1 + chosen.length);
  const ordered = [...chosen].sort((a, b) => a.node.start - b.node.start);
  if (chosen.length === 0 || ordered.some((event, i) => event !== following[i])) {
    reject("edit.unsafe-target", reasons().sequence.nestAfterCall);
  }
  if (
    ordered.some(
      (event) => event.node.kind === "KeywordStatement" && event.node.keyword.text === "return",
    )
  ) {
    reject("edit.unsafe-target", reasons().sequence.nestReturn);
  }
  const first = ordered[0]!.node;
  const last = ordered[ordered.length - 1]!.node;
  const indent = lineIndent(ctx.text, node.start);
  const inner = indent + ctx.unit;
  // The comment lines right above the first event move with it.
  const firstLine = ctx.text.lastIndexOf("\n", first.start - 1) + 1;
  const from = leadingComments(ctx.text, firstLine);
  const own = lineIndent(ctx.text, first.start);
  const text = reindent(ctx.text.slice(from + own.length, last.end), own, inner);
  const block = callBlock(call);
  const edits: TextEdit[] = [
    ...deleteStatements(
      ctx.text,
      ctx.compilation.parse.root,
      ordered.map((e) => e.node),
    ),
  ];
  if (from < firstLine) edits.push({ start: from, end: firstLine, newText: "" });
  edits.unshift(
    block
      ? insertStatement(ctx, block, node.start, (blockIndent) =>
          reindent(text, inner, blockIndent ?? inner),
        )
      : {
          start: node.end,
          end: node.end,
          newText: ` {${ctx.eol}${inner}${text}${ctx.eol}${indent}}`,
        },
  );
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function unnestCall(ctx: EditContext, op: OperationOf<"unnestCall">): TextEdit[] {
  requireSequence(ctx);
  const call = requireEvent(ctx, op.call);
  if (call.kind !== "message" || call.node.kind !== "RelationStatement") {
    reject("edit.unsafe-target", reasons().sequence.notMessage(op.call));
  }
  const node = call.node;
  const block = callBlock(call);
  const events = block ? siblings(block) : [];
  if (!block || events.length === 0) {
    reject("edit.unsafe-target", reasons().sequence.noCallBlock(call.key));
  }
  const relation = ctx.diagram.relationsByKey.get(call.relation)!;
  // Every `return` answering this call, at any depth of fragments inside its block, becomes a
  // written reply in place: `<callee> --> <caller>`, its label, id and block kept.
  const rewrites: TextEdit[] = [];
  for (const reply of ctx.diagram.relations) {
    if (reply.returns !== call.key || reply.node.kind !== "KeywordStatement") continue;
    const keyword = reply.node.keyword;
    const label = reply.node.args[0]?.kind === "StringLiteral" ? reply.node.args[0] : undefined;
    const arrow = `${relation.to} --> ${relation.from}`;
    rewrites.push(
      label
        ? { start: keyword.start, end: label.start, newText: `${arrow}: ` }
        : { start: keyword.start, end: keyword.end, newText: arrow },
    );
  }
  const first = events[0]!;
  const last = events[events.length - 1]!;
  const from = first.start;
  // The moved text, with the rewrites applied inside it.
  let slice = ctx.text.slice(from, last.end);
  for (const rewrite of [...rewrites].sort((a, b) => b.start - a.start)) {
    slice =
      slice.slice(0, rewrite.start - from) + rewrite.newText + slice.slice(rewrite.end - from);
  }
  const indent = lineIndent(ctx.text, node.start);
  const text = reindent(slice, lineIndent(ctx.text, first.start), indent);
  const properties = block.statements.filter((s) => !isEventStatement(s));
  const interleaved = properties.some((p) => p.start > first.start && p.end < last.end);
  if (interleaved) reject("edit.unsafe-target", reasons().sequence.unnestInterleaved(call.key));
  const edits: TextEdit[] = [];
  if (properties.length === 0) {
    // Only events were in the block: the block goes, from the end of what precedes it.
    const before = node.id && isToken(node.id) ? node.id.end : relationNameAnchor(relation);
    edits.push({ start: before, end: node.end, newText: `${ctx.eol}${indent}${text}` });
  } else {
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, events));
    edits.push({ start: node.end, end: node.end, newText: `${ctx.eol}${indent}${text}` });
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}
