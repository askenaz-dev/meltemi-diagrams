import {
  activationPair,
  defaultLabel,
  quoteString,
  type EditOperation,
} from "@meltemi/diagrams-edit";
import type { TextEdit } from "@meltemi/diagrams-language";
import type { Box, LayoutResult } from "@meltemi/diagrams-layout";
import {
  FRAGMENT_BRANCH_KEYWORDS,
  FRAGMENT_OPERATORS,
  PARTICIPANT_KINDS,
  type Element,
  type EventPlace,
  type FlowDiagram,
  type FragmentOperator,
  type Relation,
  type SequenceEvent,
  type TagUse,
} from "@meltemi/diagrams-model";
import type { DiagramView } from "./analysis.js";
import type { CanvasAction, EventInfo, InspectorField } from "./canvas/protocol.js";
import { messages } from "./messages/index.js";

const PARTICIPANTS: ReadonlySet<string> = new Set(PARTICIPANT_KINDS);

/** Whether an element of a sequence diagram is a participant, not a group. */
export function isParticipant(element: Element | undefined): boolean {
  return element !== undefined && PARTICIPANTS.has(element.kind);
}

/** Every event in order, with the events of fragments after the fragment. */
export function allEvents(events: readonly SequenceEvent[]): SequenceEvent[] {
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

/**
 * The event of `kind` whose statement starts in text that an edit wrote: `written` are the
 * spans of the edited text that the edit's insertions hold (its plan's inverse edits), so this
 * is an event the edit moved, under the key it has now. The first in order: a moved fragment
 * rather than an event inside it.
 */
export function movedEvent(
  diagram: FlowDiagram,
  kind: SequenceEvent["kind"],
  written: readonly TextEdit[],
): SequenceEvent | undefined {
  return allEvents(diagram.events).find(
    (e) => e.kind === kind && written.some((s) => e.node.start >= s.start && e.node.start < s.end),
  );
}

/** Whether an event takes a `space`: messages, notes and fragments. */
export const isSpaced = (event: SequenceEvent): boolean =>
  event.kind === "message" || event.kind === "note" || event.kind === "fragment";

/** The written `space` above (`before`) or below (`after`) an event, 0 when none. */
export function spaceOf(
  diagram: FlowDiagram,
  event: SequenceEvent,
  side: "before" | "after" = "before",
): number {
  if (event.id === null) return 0;
  const entry = diagram.placement.find(
    (p) => p.statement === "space" && p.target === event.id && p.side === side,
  );
  return entry?.statement === "space" ? entry.amount : 0;
}

/** The written `gap` left (`before`) or right (`after`) of a participant, 0 when none. */
export function gapOf(
  diagram: FlowDiagram,
  participant: string,
  side: "before" | "after" = "before",
): number {
  const entry = diagram.placement.find(
    (p) => p.statement === "gap" && p.target === participant && p.side === side,
  );
  return entry?.statement === "gap" ? entry.amount : 0;
}

/** Whether a side of a participant is the outer side of the first or the last one. */
function outerSide(diagram: FlowDiagram, participant: string, side: "before" | "after"): boolean {
  const order = diagram.elements.filter((e) => e.kind !== "group");
  return side === "before"
    ? order[0]?.id === participant
    : order[order.length - 1]?.id === participant;
}

/** The key of the fragment or the call a place is in, or null at the diagram level. */
const placeKey = (place: EventPlace | undefined): string | null =>
  place === undefined ? null : "fragment" in place ? place.fragment : place.message;

/**
 * The events of a sequence diagram for the canvas, in order, with their rows and frames: a note's
 * or a fragment's frame, the bar an `activate` opens, and the other end of every activation.
 */
export function eventInfos(diagram: FlowDiagram, layout: LayoutResult | null): EventInfo[] {
  const rows = layout?.events;
  if (!rows) return [];
  const infos: EventInfo[] = [];
  for (const event of allEvents(diagram.events)) {
    const row = rows.get(event.key);
    if (!row) continue;
    const framed = event.kind === "note" || event.kind === "fragment";
    const box = framed
      ? (layout?.boxes?.get(event.key) ?? null)
      : event.kind === "activate"
        ? (layout?.bars?.get(event.key)?.box ?? null)
        : null;
    infos.push({
      key: event.key,
      kind: event.kind,
      y: row.y,
      height: row.height,
      box,
      pair: activationPair(diagram, event)?.key ?? null,
      parent: placeKey(event.path[event.path.length - 1]),
      participant:
        event.kind === "activate" ||
        event.kind === "deactivate" ||
        event.kind === "create" ||
        event.kind === "destroy"
          ? event.participant
          : null,
      label:
        event.kind === "note"
          ? event.text
          : event.kind === "fragment"
            ? (event.branches[0]?.condition ?? null)
            : event.kind === "divider" || event.kind === "delay"
              ? event.label
              : null,
      space: spaceOf(diagram, event),
      spaced: isSpaced(event),
    });
  }
  return infos;
}

/**
 * The operations of a drag on a sequence diagram: a participant dropped among the others is
 * reordered there; a message, note or fragment dragged down or up changes its `space`, which
 * never goes below 0, so it never passes its neighbour.
 */
export function sequenceMove(
  view: DiagramView,
  ids: readonly string[],
  delta: { readonly x: number; readonly y: number },
): EditOperation[] {
  const diagram = view.diagram;
  const boxes = view.layout?.boxes ?? new Map<string, Box>();
  const centre = (id: string) => {
    const box = boxes.get(id);
    return box ? box.x + box.width / 2 : undefined;
  };
  const ops: EditOperation[] = [];
  for (const id of ids) {
    const element = diagram.elementsById.get(id);
    if (element) {
      const x = centre(id);
      if (x === undefined || Math.abs(delta.x) < 1) continue;
      const parent = element.groupPath[element.groupPath.length - 1] ?? null;
      // The declared siblings left of a point give the index there.
      const indexAt = (at: number) =>
        diagram.elements.filter((e) => {
          if (e.id === id || !e.node) return false;
          if ((e.groupPath[e.groupPath.length - 1] ?? null) !== parent) return false;
          const c = centre(e.id);
          return c !== undefined && c < at;
        }).length;
      const index = indexAt(x + delta.x);
      if (index === indexAt(x) && PARTICIPANTS.has(element.kind)) {
        // No neighbour's centre crossed: the head moves by the gap before it, which never goes
        // below 0 before the first participant.
        const amount = Math.round(gapOf(diagram, id) + delta.x);
        ops.push({
          kind: "setSpacing",
          diagram: diagram.id,
          target: id,
          targetKind: "participant",
          side: "before",
          amount: outerSide(diagram, id, "before") ? Math.max(0, amount) : amount,
        });
        continue;
      }
      ops.push({ kind: "reorderParticipant", diagram: diagram.id, participant: id, index });
      continue;
    }
    const event = diagram.eventsByKey.get(id);
    if (!event || !isSpaced(event) || Math.abs(delta.y) < 1) continue;
    ops.push({
      kind: "setSpacing",
      diagram: diagram.id,
      target: event.key,
      targetKind: "event",
      amount: Math.max(0, Math.round(spaceOf(diagram, event) + delta.y)),
    });
  }
  return ops;
}

export type SequenceResult =
  | {
      readonly ok: true;
      readonly operations: readonly EditOperation[];
      /** The selection after the edit. */
      readonly select?: string[];
      /** The pill whose inline editor opens after the edit: the tag just added, by its owner. */
      readonly editTag?: { readonly owner: string; readonly index: number };
      /**
       * The event whose statement the operations move: the selection follows it to the key it
       * has after the edit, since counted keys (`activate#2`, `a->b#1`) follow the order of the
       * statements (`movedEvent`).
       */
      readonly follow?: string;
    }
  | { readonly ok: false; readonly reason: string };

/** The selected message, or the message right before the first selected event. */
function messageOf(diagram: FlowDiagram, ids: readonly string[]): SequenceEvent | undefined {
  const order = allEvents(diagram.events);
  const selected = order.filter((e) => ids.includes(e.key));
  const message = selected.find((e) => e.kind === "message");
  if (message) return message;
  const first = selected[0];
  if (!first) return undefined;
  return order
    .slice(0, order.indexOf(first))
    .reverse()
    .find((e) => e.kind === "message");
}

/** The events of the block an event is in: the diagram's, a branch's or a call's. */
function siblingsOf(diagram: FlowDiagram, event: SequenceEvent): readonly SequenceEvent[] {
  const place = event.path[event.path.length - 1];
  if (!place) return diagram.events;
  if ("fragment" in place) {
    const fragment = diagram.eventsByKey.get(place.fragment);
    return fragment?.kind === "fragment" ? (fragment.branches[place.branch]?.events ?? []) : [];
  }
  const call = diagram.eventsByKey.get(place.message);
  return call?.kind === "message" ? call.events : [];
}

const isReturn = (diagram: FlowDiagram, event: SequenceEvent): boolean =>
  event.kind === "message" && diagram.relationsByKey.get(event.relation)?.returns != null;

/**
 * Whether a message's receiver is activated after it: `written` when the next event of its block
 * is `activate <receiver>`, which `toggleActivation` removes; `block` when the message is a call
 * whose block activates the receiver, which it refuses; undefined otherwise.
 */
export function activationOf(
  diagram: FlowDiagram,
  relation: Relation,
): "written" | "block" | undefined {
  const message = diagram.eventsByKey.get(relation.key);
  if (message?.kind !== "message") return undefined;
  if (message.events.length > 0) return "block";
  const siblings = siblingsOf(diagram, message);
  const next = siblings[siblings.indexOf(message) + 1];
  return next?.kind === "activate" && next.participant === relation.to ? "written" : undefined;
}

/**
 * The owner of the tags an action or a field names: the selected message (a `return` included),
 * else the selected participant. On another kind of diagram any selected element or relation, so
 * that the edit refuses it with its own reason.
 */
function tagOwner(
  diagram: FlowDiagram,
  ids: readonly string[],
):
  | {
      readonly target: string;
      readonly targetKind: "element" | "relation";
      readonly tags: readonly TagUse[];
    }
  | undefined {
  const relation = ids.map((id) => diagram.relationsByKey.get(id)).find((r) => r !== undefined);
  if (relation) return { target: relation.key, targetKind: "relation", tags: relation.tags };
  const element = ids
    .map((id) => diagram.elementsById.get(id))
    .find((e) => (diagram.type === "sequence" ? isParticipant(e) : e !== undefined));
  return element ? { target: element.id, targetKind: "element", tags: element.tags } : undefined;
}

/** The first of `word`, `word 2`, `word 3`… that is not among `taken`. */
function freshTag(word: string, taken: readonly TagUse[]): string {
  const texts = new Set(taken.map((t) => t.text));
  let text = word;
  for (let n = 2; texts.has(text); n++) text = `${word} ${n}`;
  return text;
}

/**
 * The selected call, or the call around the selection: a selected message that is not a
 * `return` (with a block, when `withBlock`), else the nearest call the selection is inside.
 */
function callOf(
  diagram: FlowDiagram,
  ids: readonly string[],
  withBlock: boolean,
): SequenceEvent | undefined {
  const selected = allEvents(diagram.events).filter((e) => ids.includes(e.key));
  const first = selected.find((e) => e.kind === "message") ?? selected[0];
  if (!first) return undefined;
  if (
    first.kind === "message" &&
    !isReturn(diagram, first) &&
    (!withBlock || first.events.length > 0)
  ) {
    return first;
  }
  const place = [...first.path].reverse().find((p) => "message" in p);
  return place && "message" in place ? diagram.eventsByKey.get(place.message) : undefined;
}

/** The last selected event, or undefined to append at the end. */
function anchorOf(diagram: FlowDiagram, ids: readonly string[]): SequenceEvent | undefined {
  const order = allEvents(diagram.events);
  const selected = order.filter((e) => ids.includes(e.key));
  return selected[selected.length - 1];
}

/** The participants of the selection, or the ends of the selected message. */
function participantsOf(diagram: FlowDiagram, ids: readonly string[]): string[] {
  const selected = ids.filter((id) => isParticipant(diagram.elementsById.get(id)));
  if (selected.length > 0) return selected;
  const message = messageOf(diagram, ids);
  if (message?.kind === "message") {
    const relation = diagram.relationsByKey.get(message.relation)!;
    return [...new Set([relation.from, relation.to])];
  }
  const first = diagram.elements.find((e) => isParticipant(e));
  return first ? [first.id] : [];
}

/** `<base><n>` with the smallest free `n`, for a new note or fragment. */
function freshId(diagram: FlowDiagram, base: string): string {
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...diagram.eventsByKey.keys(),
  ]);
  for (let n = 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** The operations of the sequence actions of the canvas. */
export function sequenceAction(
  view: DiagramView,
  action: Extract<
    CanvasAction,
    {
      kind:
        | "moveEvent"
        | "toggleActivation"
        | "nestInCall"
        | "unnestCall"
        | "addReturn"
        | "insertEvent"
        | "wrap"
        | "moveActivation"
        | "addTag"
        | "setTag"
        | "removeTag";
    }
  >,
): SequenceResult {
  const diagram = view.diagram;
  const d = diagram.id;
  const reasons = messages().sequence.reasons;
  switch (action.kind) {
    case "moveActivation": {
      // The bar's `activate`, from either of its ends.
      const found = diagram.eventsByKey.get(action.id);
      const activate =
        found?.kind === "deactivate" ? activationPair(diagram, found) : (found ?? null);
      if (activate?.kind !== "activate") return { ok: false, reason: reasons.selectBar };
      const row = diagram.eventsByKey.get(action.row);
      if (!row) return { ok: false, reason: reasons.dropOnRow };
      const select = [activate.key];
      const none: SequenceResult = { ok: true, operations: [], select };
      if (action.end === "start") {
        // On a call with a block, the bar starts at the call's arrow: first in its block.
        const first = row.kind === "message" ? row.events[0] : undefined;
        if (row.key === activate.key || first?.key === activate.key) return none;
        return {
          ok: true,
          operations: [
            {
              kind: "moveEvent",
              diagram: d,
              event: activate.key,
              to: first ? { before: first.key } : { after: row.key },
            },
          ],
          select,
          // Moved past another participant's `activate`, the bar's own is counted anew.
          follow: activate.key,
        };
      }
      const deactivate = activationPair(diagram, activate);
      if (deactivate?.key === row.key) return none;
      return {
        ok: true,
        operations: [
          deactivate
            ? { kind: "moveEvent", diagram: d, event: deactivate.key, to: { after: row.key } }
            : // A bar open to the end is closed at the row.
              {
                kind: "insertEvent",
                diagram: d,
                statement: `deactivate ${activate.participant}`,
                after: row.key,
              },
        ],
        select,
      };
    }
    case "addTag":
    case "setTag":
    case "removeTag": {
      const owner = tagOwner(diagram, action.ids);
      if (!owner) return { ok: false, reason: reasons.selectToTag };
      const { target, targetKind } = owner;
      const select = [...action.ids];
      if (action.kind === "addTag") {
        // The word in the interface language, numbered when the owner has it already.
        const text = freshTag(messages().written.tag, owner.tags);
        return {
          ok: true,
          operations: [{ kind: "addTag", diagram: d, target, targetKind, text }],
          select: [target],
          editTag: { owner: target, index: owner.tags.length },
        };
      }
      // An emptied tag goes.
      const remove = action.kind === "removeTag" || action.text.trim() === "";
      return {
        ok: true,
        operations: [
          remove
            ? { kind: "removeTag", diagram: d, target, targetKind, index: action.index }
            : {
                kind: "setTag",
                diagram: d,
                target,
                targetKind,
                index: action.index,
                text: action.text,
              },
        ],
        select,
      };
    }
    case "moveEvent": {
      const event = diagram.eventsByKey.get(action.id);
      if (!event) return { ok: false, reason: reasons.selectEvent };
      return {
        ok: true,
        operations: [
          { kind: "moveEvent", diagram: d, event: event.key, direction: action.direction },
        ],
        select: [event.key],
        follow: event.key,
      };
    }
    case "toggleActivation": {
      const message = messageOf(diagram, action.ids);
      if (message?.kind !== "message") return { ok: false, reason: reasons.selectMessage };
      const relation = diagram.relationsByKey.get(message.relation)!;
      const chosen = action.ids.find((id) => isParticipant(diagram.elementsById.get(id)));
      return {
        ok: true,
        operations: [
          {
            kind: "toggleActivation",
            diagram: d,
            participant: chosen ?? relation.to,
            after: message.key,
          },
        ],
        select: [...action.ids],
      };
    }
    case "nestInCall": {
      // The selected events of the first one's block, after the call right before them.
      const order = allEvents(diagram.events);
      const first = order.find((e) => action.ids.includes(e.key));
      const siblings = first ? siblingsOf(diagram, first) : [];
      const call = first ? siblings[siblings.indexOf(first) - 1] : undefined;
      if (call?.kind !== "message" || isReturn(diagram, call)) {
        return { ok: false, reason: reasons.nestAfterCall };
      }
      const events = siblings.filter((e) => action.ids.includes(e.key));
      return {
        ok: true,
        operations: [
          { kind: "nestInCall", diagram: d, call: call.key, events: events.map((e) => e.key) },
        ],
        select: [call.key],
      };
    }
    case "unnestCall":
    case "addReturn": {
      const call = callOf(diagram, action.ids, action.kind === "unnestCall");
      if (!call) return { ok: false, reason: reasons.selectCall };
      return {
        ok: true,
        operations: [
          action.kind === "unnestCall"
            ? { kind: "unnestCall", diagram: d, call: call.key }
            : {
                kind: "insertEvent",
                diagram: d,
                statement: "return",
                inside: { message: call.key },
              },
        ],
        select: [call.key],
      };
    }
    case "insertEvent": {
      const anchor = anchorOf(diagram, action.ids);
      let statement: string;
      let id: string | undefined;
      // The starter texts are what the person would have typed: in the interface language.
      if (action.eventKind === "note") {
        const participants = participantsOf(diagram, action.ids);
        if (participants.length === 0) return { ok: false, reason: reasons.addParticipant };
        id = freshId(diagram, "note");
        const text = quoteString(defaultLabel("note")!);
        statement = `note ${id} over ${participants.join(", ")} ${text}`;
      } else if (action.eventKind === "divider") {
        statement = `divider ${quoteString(messages().written.divider)}`;
      } else {
        statement = "delay";
      }
      return {
        ok: true,
        operations: [
          {
            kind: "insertEvent",
            diagram: d,
            statement,
            ...(anchor ? { after: anchor.key } : {}),
          },
        ],
        ...(id ? { select: [id] } : {}),
      };
    }
    case "wrap": {
      const order = allEvents(diagram.events);
      const selected = order.filter((e) => action.ids.includes(e.key));
      const id = freshId(diagram, action.operator);
      const condition = action.operator === "par" ? undefined : messages().written.condition;
      if (selected.length === 0) {
        // An empty fragment at the end.
        const head = `${action.operator} ${id}${condition ? ` ${quoteString(condition)}` : ""}`;
        return {
          ok: true,
          operations: [{ kind: "insertEvent", diagram: d, statement: `${head} {\n}` }],
          select: [id],
        };
      }
      // The outermost selected events: those whose fragments are not selected too.
      const keys = new Set(selected.map((e) => e.key));
      const outer = selected.filter(
        (e) => !e.path.some((p) => "fragment" in p && keys.has(p.fragment)),
      );
      return {
        ok: true,
        operations: [
          {
            kind: "wrapInFragment",
            diagram: d,
            events: outer.map((e) => e.key),
            operator: action.operator,
            id,
            ...(condition ? { condition } : {}),
          },
        ],
        select: [id],
      };
    }
  }
}

// ---------------------------------------------------------------------- inspector

const MESSAGE_KINDS = ["call", "reply", "async"] as const;

function messageKind(relation: Relation): (typeof MESSAGE_KINDS)[number] {
  return relation.async ? "async" : relation.line === "dashed" ? "reply" : "call";
}

/** The room above and below an event: **Space before** and **Space after**. */
const spaceFields = (diagram: FlowDiagram, event: SequenceEvent | undefined): InspectorField[] =>
  (["before", "after"] as const).map((side) => ({
    name: side === "before" ? "space" : "spaceAfter",
    label:
      side === "before"
        ? messages().sequence.fields.spaceBefore
        : messages().sequence.fields.spaceAfter,
    type: "number",
    value: event && spaceOf(diagram, event, side) > 0 ? spaceOf(diagram, event, side) : null,
    placeholder: "0",
  }));

/**
 * **Tags** of a participant or a message: a text field per tag in order (`tag.<n>`), which
 * rewrites it and, emptied, removes it, with a **Remove** button (`removeTag`); then the empty
 * `tag.new`, whose text adds a tag at the end. The canvas draws the run as one list.
 */
function tagFields(owner: string, tags: readonly TagUse[]): InspectorField[] {
  const words = messages().sequence.fields;
  return [
    ...tags.map((tag, index): InspectorField => ({
      name: `tag.${index}`,
      label: words.tagAt(index + 1),
      type: "text",
      value: tag.text,
      button: {
        label: words.removeTag,
        action: { kind: "removeTag", ids: [owner], index },
      },
    })),
    {
      name: "tag.new",
      label: words.newTag,
      type: "text",
      value: null,
      placeholder: words.addTag,
    },
  ];
}

/**
 * **Activates the receiver** of a message: checked when an `activate` of its receiver follows it,
 * or, read-only with the reason under it, when the call's block activates the receiver.
 */
function activatesField(diagram: FlowDiagram, relation: Relation): InspectorField {
  const words = messages().sequence;
  const activation = activationOf(diagram, relation);
  return {
    name: "activates",
    label: words.fields.activates,
    type: "boolean",
    value: activation ? "on" : "off",
    ...(activation === "block"
      ? { readonly: true, note: words.blockActivates(relation.key, relation.to) }
      : {}),
  };
}

/** Fields of a participant or a participant group, before the style fields. */
export function participantFields(diagram: FlowDiagram, element: Element): InspectorField[] {
  const group = element.kind === "group";
  const words = messages();
  return [
    { name: "id", label: words.fields.id, type: "id", value: element.id },
    {
      name: "kind",
      label: words.fields.kind,
      type: "enum",
      value: element.kind,
      options: group ? ["group"] : PARTICIPANT_KINDS,
      ...(group ? { readonly: true } : {}),
    },
    { name: "label", label: words.fields.label, type: "text", value: element.label },
    {
      name: "description",
      label: words.fields.description,
      type: "multiline",
      value: element.description,
    },
    {
      name: "classes",
      label: words.fields.classes,
      type: "classes",
      value: element.classes.map((c) => c.name).join(", ") || null,
    },
    {
      name: "link",
      label: words.fields.linkedTo,
      type: "text",
      value: element.link?.text ?? null,
      placeholder: "diagram.element",
    },
    ...(group
      ? []
      : [
          ...(["before", "after"] as const).map((side) => ({
            name: side === "before" ? "gap" : "gapAfter",
            label:
              side === "before" ? words.sequence.fields.gapBefore : words.sequence.fields.gapAfter,
            type: "number" as const,
            // A negative gap brings the participant closer: shown as written.
            value: gapOf(diagram, element.id, side) !== 0 ? gapOf(diagram, element.id, side) : null,
            placeholder: "0",
          })),
          ...tagFields(element.id, element.tags),
        ]),
  ];
}

/** Fields of a message, before the style fields. */
export function messageFields(diagram: FlowDiagram, relation: Relation): InspectorField[] {
  const participants = diagram.elements.filter((e) => isParticipant(e)).map((e) => e.id);
  const words = messages();
  // A `return` takes its ends and its line from the call it answers.
  const answers = relation.returns !== null;
  const fixed = answers ? ({ readonly: true } as const) : {};
  return [
    {
      name: "id",
      label: words.fields.id,
      type: "id",
      value: relation.id,
      placeholder: relation.key,
    },
    { name: "label", label: words.fields.label, type: "text", value: relation.label },
    {
      name: "description",
      label: words.fields.description,
      type: "multiline",
      value: relation.description,
    },
    {
      name: "from",
      label: words.fields.from,
      type: "enum",
      value: relation.from,
      options: participants,
      ...fixed,
    },
    {
      name: "to",
      label: words.fields.to,
      type: "enum",
      value: relation.to,
      options: participants,
      ...fixed,
    },
    {
      name: "message",
      label: words.sequence.fields.message,
      type: "enum",
      value: answers ? "return" : messageKind(relation),
      options: answers ? ["return"] : MESSAGE_KINDS,
      ...fixed,
    },
    ...spaceFields(diagram, diagram.eventsByKey.get(relation.key)),
    // A `return` answers its call: it activates nothing.
    ...(answers ? [] : [activatesField(diagram, relation)]),
    ...tagFields(relation.key, relation.tags),
  ];
}

/** Fields of an event other than a message. */
export function eventFields(diagram: FlowDiagram, event: SequenceEvent): InspectorField[] {
  const participants = diagram.elements.filter((e) => isParticipant(e)).map((e) => e.id);
  const words = messages();
  const fields = words.sequence.fields;
  const id: InspectorField = {
    name: "id",
    label: words.fields.id,
    type: "id",
    value: event.id,
    placeholder: event.key,
  };
  switch (event.kind) {
    case "note":
      return [
        id,
        { name: "text", label: fields.text, type: "multiline", value: event.text },
        {
          name: "position",
          label: fields.position,
          type: "enum",
          value: event.position,
          options: ["over", "left", "right"],
        },
        {
          name: "participants",
          label: event.position === "over" ? fields.over : fields.of,
          type: "text",
          value: event.participants.join(", "),
          placeholder: participants.join(", "),
        },
        ...spaceFields(diagram, event),
      ];
    case "fragment":
      return [
        id,
        {
          name: "operator",
          label: fields.operator,
          type: "enum",
          value: event.operator,
          options: FRAGMENT_OPERATORS,
        },
        ...event.branches.map((branch, i): InspectorField => ({
          name: `condition.${i}`,
          label:
            i === 0
              ? fields.condition
              : words.sequence.branchCondition(FRAGMENT_BRANCH_KEYWORDS[event.operator], i),
          type: "text",
          value: branch.condition,
        })),
        ...spaceFields(diagram, event),
      ];
    case "divider":
      return [{ name: "text", label: words.fields.label, type: "text", value: event.label }];
    case "delay":
      return [{ name: "text", label: words.fields.label, type: "text", value: event.label }];
    case "activate":
    case "deactivate":
    case "create":
    case "destroy":
      return [
        {
          name: "participant",
          label: fields.participant,
          type: "enum",
          value: event.participant,
          options: participants,
          readonly: true,
        },
      ];
    case "message":
      return [];
  }
}

/** Fields of a sequence diagram but its canvas, which every profile shares. */
export function sequenceDiagramFields(
  diagram: FlowDiagram,
  themes: readonly string[],
  defaultTheme: string,
): InspectorField[] {
  const p = diagram.properties;
  const words = messages();
  return [
    { name: "title", label: words.fields.title, type: "text", value: p.title },
    {
      name: "description",
      label: words.fields.description,
      type: "multiline",
      value: p.description,
    },
    {
      name: "autonumber",
      label: words.sequence.fields.numberFrom,
      type: "number",
      value: p.autonumber,
      placeholder: "off",
    },
    {
      name: "spacing",
      label: words.sequence.fields.participantSpacing,
      type: "number",
      value: p.spacing,
      placeholder: "40",
    },
    {
      name: "theme",
      label: words.fields.theme,
      type: "enum",
      value: p.theme,
      placeholder: defaultTheme,
      options: themes,
    },
  ];
}

/**
 * The operations that write a sequence field: participant gaps, message kinds and spacing, a
 * message's **Activates the receiver**, the **Tags** of messages and participants, events;
 * undefined for the fields every profile shares.
 */
export function sequenceFieldOperations(
  diagram: FlowDiagram,
  id: string,
  field: string,
  value: string | number | null,
): SequenceResult | undefined {
  const d = diagram.id;
  const text = value === null ? null : String(value);
  const number = value === null || value === "" ? null : Number(value);
  const reasons = messages().sequence.reasons;
  // **Tags**: `tag.<n>` rewrites or, emptied, removes a tag; `tag.new` adds one at the end.
  const tag = /^tag\.(\d+|new)$/.exec(field);
  if (tag) {
    const owner = tagOwner(diagram, [id]);
    if (!owner) return undefined;
    const { target, targetKind } = owner;
    const written = text?.trim() ?? "";
    if (tag[1] === "new") {
      return written === ""
        ? { ok: true, operations: [] }
        : {
            ok: true,
            operations: [{ kind: "addTag", diagram: d, target, targetKind, text: text! }],
          };
    }
    const index = Number(tag[1]);
    return {
      ok: true,
      operations: [
        written === ""
          ? { kind: "removeTag", diagram: d, target, targetKind, index }
          : { kind: "setTag", diagram: d, target, targetKind, index, text: text! },
      ],
    };
  }
  const element = diagram.elementsById.get(id);
  if (element) {
    if (field !== "gap" && field !== "gapAfter") return undefined;
    const side = field === "gap" ? "before" : "after";
    // Negative between two participants; on the outer side of the first or last, 0 or more.
    if (
      number !== null &&
      (!Number.isFinite(number) || (number < 0 && outerSide(diagram, id, side)))
    ) {
      return { ok: false, reason: reasons.signedPixels };
    }
    return {
      ok: true,
      operations: [
        {
          kind: "setSpacing",
          diagram: d,
          target: id,
          targetKind: "participant",
          amount: number,
          side,
        },
      ],
    };
  }
  const event = diagram.eventsByKey.get(id);
  if (!event) return undefined;
  if (field === "space" || field === "spaceAfter") {
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      return { ok: false, reason: reasons.pixels };
    }
    return {
      ok: true,
      operations: [
        {
          kind: "setSpacing",
          diagram: d,
          target: event.key,
          targetKind: "event",
          amount: number,
          side: field === "space" ? "before" : "after",
        },
      ],
    };
  }
  if (event.kind === "message" && field === "activates") {
    // **Activates the receiver**: the pair `toggleActivation` writes or removes.
    const relation = diagram.relationsByKey.get(event.relation)!;
    const on = text === "on" || text === "true";
    const activation = activationOf(diagram, relation);
    if (activation === "block") {
      return on
        ? { ok: true, operations: [] }
        : { ok: false, reason: messages().sequence.blockActivates(relation.key, relation.to) };
    }
    if (on === (activation === "written")) return { ok: true, operations: [] };
    return {
      ok: true,
      operations: [
        { kind: "toggleActivation", diagram: d, participant: relation.to, after: event.key },
      ],
    };
  }
  if (event.kind === "message") {
    if (field !== "message") return undefined;
    const relation = diagram.relationsByKey.get(event.relation)!;
    if (!MESSAGE_KINDS.includes(text as never)) return { ok: false, reason: reasons.messageKind };
    const operations: EditOperation[] = [];
    const line = text === "reply" ? "dashed" : "solid";
    if (relation.line !== line) {
      operations.push({ kind: "setRelationLine", diagram: d, relation: relation.key, line });
    }
    if (relation.async !== (text === "async")) {
      operations.push({
        kind: "setElementProperty",
        diagram: d,
        target: relation.key,
        targetKind: "relation",
        property: "kind",
        value: text === "async" ? "async" : null,
      });
    }
    return { ok: true, operations };
  }
  switch (field) {
    case "id":
      if (!text) return { ok: true, operations: [] };
      return {
        ok: true,
        operations: [{ kind: "renameEvent", diagram: d, event: event.key, newId: text }],
        select: [text],
      };
    case "text":
      return {
        ok: true,
        operations: [{ kind: "setEventText", diagram: d, event: event.key, text: text || null }],
      };
    case "position":
    case "participants": {
      if (event.kind !== "note") return undefined;
      const position = (field === "position" ? text : event.position) as "over" | "left" | "right";
      let participants =
        field === "participants"
          ? (text ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p !== "")
          : [...event.participants];
      // `left of` and `right of` keep the first participant.
      if (position !== "over") participants = participants.slice(0, 1);
      return {
        ok: true,
        operations: [
          { kind: "setNotePlacement", diagram: d, note: event.key, position, participants },
        ],
      };
    }
    case "operator":
      if (event.kind !== "fragment") return undefined;
      return {
        ok: true,
        operations: [
          { kind: "setFragmentOperator", diagram: d, fragment: event.key, operator: text ?? "" },
        ],
        ...(event.id ? { select: [event.id] } : {}),
      };
    default: {
      const condition = /^condition\.(\d+)$/.exec(field);
      if (!condition || event.kind !== "fragment") return undefined;
      return {
        ok: true,
        operations: [
          {
            kind: "setFragmentCondition",
            diagram: d,
            fragment: event.key,
            branch: Number(condition[1]),
            condition: text || null,
          },
        ],
      };
    }
  }
}

/** The fragment operators the canvas offers. */
export const OPERATORS: readonly FragmentOperator[] = FRAGMENT_OPERATORS;
