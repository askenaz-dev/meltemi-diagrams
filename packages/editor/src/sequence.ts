import { defaultLabel, quoteString, type EditOperation } from "@meltemi/diagrams-edit";
import type { Box, LayoutResult } from "@meltemi/diagrams-layout";
import {
  FRAGMENT_BRANCH_KEYWORDS,
  FRAGMENT_OPERATORS,
  PARTICIPANT_KINDS,
  type Element,
  type FlowDiagram,
  type FragmentOperator,
  type Relation,
  type SequenceEvent,
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
    }
  };
  visit(events);
  return all;
}

/** Whether an event takes a `space`: messages, notes and fragments. */
export const isSpaced = (event: SequenceEvent): boolean =>
  event.kind === "message" || event.kind === "note" || event.kind === "fragment";

/** The written `space` above an event, 0 when none. */
export function spaceOf(diagram: FlowDiagram, event: SequenceEvent): number {
  if (event.id === null) return 0;
  const entry = diagram.placement.find((p) => p.statement === "space" && p.target === event.id);
  return entry?.statement === "space" ? entry.amount : 0;
}

/** The written `gap` left of a participant, 0 when none. */
export function gapOf(diagram: FlowDiagram, participant: string): number {
  const entry = diagram.placement.find((p) => p.statement === "gap" && p.target === participant);
  return entry?.statement === "gap" ? entry.amount : 0;
}

/** The events of a sequence diagram for the canvas, in order, with their rows and frames. */
export function eventInfos(diagram: FlowDiagram, layout: LayoutResult | null): EventInfo[] {
  const rows = layout?.events;
  if (!rows) return [];
  const infos: EventInfo[] = [];
  for (const event of allEvents(diagram.events)) {
    const row = rows.get(event.key);
    if (!row) continue;
    const framed = event.kind === "note" || event.kind === "fragment";
    infos.push({
      key: event.key,
      kind: event.kind,
      y: row.y,
      height: row.height,
      box: framed ? (layout?.boxes?.get(event.key) ?? null) : null,
      parent: event.path[event.path.length - 1]?.fragment ?? null,
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
      // The declared siblings left of the drop point give the index.
      const index = diagram.elements.filter((e) => {
        if (e.id === id || !e.node) return false;
        if ((e.groupPath[e.groupPath.length - 1] ?? null) !== parent) return false;
        const c = centre(e.id);
        return c !== undefined && c < x + delta.x;
      }).length;
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
    { kind: "moveEvent" | "toggleActivation" | "insertEvent" | "wrap" }
  >,
): SequenceResult {
  const diagram = view.diagram;
  const d = diagram.id;
  const reasons = messages().sequence.reasons;
  switch (action.kind) {
    case "moveEvent": {
      const event = diagram.eventsByKey.get(action.id);
      if (!event) return { ok: false, reason: reasons.selectEvent };
      return {
        ok: true,
        operations: [
          { kind: "moveEvent", diagram: d, event: event.key, direction: action.direction },
        ],
        select: [event.key],
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
      const outer = selected.filter((e) => !e.path.some((p) => keys.has(p.fragment)));
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

const spaceField = (diagram: FlowDiagram, event: SequenceEvent | undefined): InspectorField => ({
  name: "space",
  label: messages().sequence.fields.spaceBefore,
  type: "number",
  value: event && spaceOf(diagram, event) > 0 ? spaceOf(diagram, event) : null,
  placeholder: "0",
});

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
          {
            name: "gap",
            label: words.sequence.fields.gapBefore,
            type: "number" as const,
            value: gapOf(diagram, element.id) > 0 ? gapOf(diagram, element.id) : null,
            placeholder: "0",
          },
        ]),
  ];
}

/** Fields of a message, before the style fields. */
export function messageFields(diagram: FlowDiagram, relation: Relation): InspectorField[] {
  const participants = diagram.elements.filter((e) => isParticipant(e)).map((e) => e.id);
  const words = messages();
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
    },
    { name: "to", label: words.fields.to, type: "enum", value: relation.to, options: participants },
    {
      name: "message",
      label: words.sequence.fields.message,
      type: "enum",
      value: messageKind(relation),
      options: MESSAGE_KINDS,
    },
    spaceField(diagram, diagram.eventsByKey.get(relation.key)),
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
        spaceField(diagram, event),
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
        spaceField(diagram, event),
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
 * The operations that write a sequence field: participant gaps, message kinds and spacing,
 * events; undefined for the fields every profile shares.
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
  const element = diagram.elementsById.get(id);
  if (element) {
    if (field !== "gap") return undefined;
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      return { ok: false, reason: reasons.pixels };
    }
    return {
      ok: true,
      operations: [
        { kind: "setSpacing", diagram: d, target: id, targetKind: "participant", amount: number },
      ],
    };
  }
  const event = diagram.eventsByKey.get(id);
  if (!event) return undefined;
  if (field === "space") {
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      return { ok: false, reason: reasons.pixels };
    }
    return {
      ok: true,
      operations: [
        { kind: "setSpacing", diagram: d, target: event.key, targetKind: "event", amount: number },
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
