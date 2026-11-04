import { planEdit, type EditOperation } from "@meltemi/diagrams-edit";
import type { Diagnostic, Statement, TextEdit } from "@meltemi/diagrams-language";
import type { Element, FlowDiagram, RouteEntry, SequenceEvent } from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { arrangeOperation } from "../arrange.js";
import { deleteStatements, removeListItems } from "@meltemi/diagrams-edit";
import { diagramAt } from "../syntax.js";
import { serviceMessages } from "../messages/services.js";

export interface CodeAction {
  readonly title: string;
  readonly kind: "quickfix" | "refactor";
  /** The diagnostic the action fixes, if any. */
  readonly diagnostic?: Diagnostic;
  readonly edits: readonly TextEdit[];
  readonly preferred?: boolean;
}

/** Edit distance between two words. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The alternatives a diagnostic offers for its text; fixes never read its words. */
const candidatesOf = (diagnostic: Diagnostic): readonly string[] =>
  diagnostic.data?.candidates ?? [];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function plan(
  analysis: DocumentAnalysis,
  operation: EditOperation,
): readonly TextEdit[] | undefined {
  const result = planEdit(analysis.compilation, operation, { revision: analysis.revision });
  return result.ok && result.plan.edits.length > 0 ? result.plan.edits : undefined;
}

/** The side a new port takes at one end of a route, given the layout direction. */
function facingSide(diagram: FlowDiagram, end: "from" | "to"): "north" | "south" | "east" | "west" {
  const sides = {
    LR: { from: "east", to: "west" },
    RL: { from: "west", to: "east" },
    TB: { from: "south", to: "north" },
    BT: { from: "north", to: "south" },
  } as const;
  return sides[diagram.properties.direction][end];
}

/** The innermost event of a kind whose statement contains `offset`. */
function eventAt(diagram: FlowDiagram, offset: number, kind: SequenceEvent["kind"]) {
  let found: SequenceEvent | undefined;
  for (const event of diagram.eventsByKey.values()) {
    if (event.kind !== kind || event.node.start > offset || offset > event.node.end) continue;
    if (!found || event.node.end - event.node.start < found.node.end - found.node.start)
      found = event;
  }
  return found;
}

/**
 * The group of a free diagram whose block writes `spacing` or `align` without `layout`, when the
 * diagnostic is the one on that keyword: the model refuses them until the group is a list.
 */
function listWithoutLayout(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  diagnostic: Diagnostic,
): string | undefined {
  if (diagram.type !== "free") return undefined;
  const start = diagnostic.range.start.offset;
  const word = analysis.text.slice(start, diagnostic.range.end.offset);
  if (word !== "spacing" && word !== "align") return undefined;
  const statementsOf = (e: Element): readonly Statement[] =>
    e.kind === "group" ? (e.node?.block?.statements ?? []) : [];
  const group = diagram.elements.find((e) =>
    statementsOf(e).some((s) => s.kind === "KeywordStatement" && s.keyword.start === start),
  );
  if (!group) return undefined;
  const listed = statementsOf(group).some(
    (s) => s.kind === "KeywordStatement" && s.keyword.text === "layout",
  );
  return listed ? undefined : group.id;
}

function fixes(analysis: DocumentAnalysis, diagnostic: Diagnostic): CodeAction[] {
  const t = serviceMessages().fixes;
  const actions: CodeAction[] = [];
  const offset = diagnostic.range.start.offset;
  const diagram = diagramAt(analysis.compilation, offset);
  const add = (title: string, edits: readonly TextEdit[] | undefined, preferred = false) => {
    if (edits) actions.push({ title, kind: "quickfix", diagnostic, edits, preferred });
  };
  // The plain ids the diagnostic names, in order.
  const ids = (diagnostic.data?.ids ?? []).filter((id) => IDENTIFIER.test(id));
  switch (diagnostic.code) {
    case "layout.missing-placement":
    case "layout.mode-unsupported": {
      if (!diagram) break;
      const operation = arrangeOperation(analysis, diagram.id, "unplaced");
      if (operation) add(t.arrangeUnplaced, plan(analysis, operation), true);
      break;
    }
    case "layout.placement-ignored": {
      if (!diagram) break;
      for (const mode of ["assisted", "manual"] as const) {
        add(
          t.switchLayout(mode),
          plan(analysis, {
            kind: "setDiagramProperty",
            diagram: diagram.id,
            property: "layout",
            value: mode,
          }),
          mode === "assisted",
        );
      }
      break;
    }
    case "c4.out-of-level": {
      // Remove the entry from `include`.
      const view = diagram?.c4;
      const node = view?.includeNode;
      if (!diagram || !node) break;
      const index = node.args.findIndex((a) => a.start <= offset && offset <= a.end);
      if (index < 0) break;
      const written = analysis.text.slice(node.args[index]!.start, node.args[index]!.end);
      const edits =
        node.args.length === 1
          ? deleteStatements(analysis.text, analysis.compilation.parse.root, [node])
          : removeListItems(node.args, new Set([index]));
      add(t.removeFromInclude(written), edits, true);
      break;
    }
    case "c4.scope-required": {
      const view = diagram?.c4;
      const model = view?.resolved?.definition;
      if (!diagram || !view || !model) break;
      const kind = view.level === "component" ? "container" : "system";
      const levelStmt = diagram.block?.statements.find(
        (s) => s.kind === "KeywordStatement" && s.keyword.text === "level",
      );
      if (!levelStmt) break;
      const indent = /[ \t]*$/.exec(analysis.text.slice(0, levelStmt.start))![0];
      const eol = analysis.text.includes("\r\n") ? "\r\n" : "\n";
      for (const [i, entity] of model.entities
        .filter((e) => e.kind === kind)
        .slice(0, 5)
        .entries()) {
        add(
          t.addScope(entity.path),
          [
            {
              start: levelStmt.end,
              end: levelStmt.end,
              newText: `${eol}${indent}scope ${entity.path}`,
            },
          ],
          i === 0,
        );
      }
      break;
    }
    case "ref.unknown-entity":
    case "ref.unknown-model": {
      const written = analysis.text.slice(
        diagnostic.range.start.offset,
        diagnostic.range.end.offset,
      );
      const candidates = candidatesOf(diagnostic)
        .filter((w) => w !== written)
        .slice(0, 3);
      for (const [i, w] of candidates.entries()) {
        add(
          t.changeTo(w),
          [{ start: diagnostic.range.start.offset, end: diagnostic.range.end.offset, newText: w }],
          i === 0,
        );
      }
      break;
    }
    case "sequence.activation": {
      const event = diagram && eventAt(diagram, offset, "deactivate");
      if (!diagram || !event || event.kind !== "deactivate") break;
      add(
        t.removeDeactivate,
        plan(analysis, { kind: "removeEvent", diagram: diagram.id, event: event.key }),
        true,
      );
      const indent = /[ \t]*$/.exec(analysis.text.slice(0, event.node.start))![0];
      const eol = analysis.text.includes("\r\n") ? "\r\n" : "\n";
      add(t.activateBefore(event.participant), [
        {
          start: event.node.start,
          end: event.node.start,
          newText: `activate ${event.participant}${eol}${indent}`,
        },
      ]);
      break;
    }
    case "ref.unknown-element": {
      const id = ids[0];
      if (!diagram || !id || diagram.elementsById.has(id)) break;
      const kind =
        diagram.type === "free" ? "box" : diagram.type === "sequence" ? "participant" : "node";
      // The target of a note's `on` lists the diagram's elements: the closest are offered first.
      const written = analysis.text.slice(
        diagnostic.range.start.offset,
        diagnostic.range.end.offset,
      );
      const close = candidatesOf(diagnostic)
        .filter((w) => w !== written)
        .map((w) => ({ w, distance: editDistance(w, written) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      for (const [i, { w }] of close.entries()) {
        add(
          t.changeTo(w),
          [{ start: diagnostic.range.start.offset, end: diagnostic.range.end.offset, newText: w }],
          i === 0,
        );
      }
      add(
        t.declareElement(id, kind),
        plan(analysis, {
          kind: "createElement",
          diagram: diagram.id,
          elementKind: kind,
          id,
          label: id,
        }),
        close.length === 0,
      );
      break;
    }
    case "ref.unknown-layer": {
      const layer = ids[0];
      if (!diagram || !layer) break;
      const layers = diagram.properties.layers.filter((l) => l !== "main");
      add(
        t.declareLayer(layer),
        plan(analysis, {
          kind: "setDiagramProperty",
          diagram: diagram.id,
          property: "layers",
          value: [...layers, layer, "main"].join(", "),
        }),
        true,
      );
      break;
    }
    case "ref.unknown-link": {
      const link = diagram?.links.find(
        (l) => l.range.start.offset <= offset && offset <= l.range.end.offset,
      );
      if (!diagram || !link) break;
      add(
        t.removeLink,
        plan(analysis, {
          kind: "setElementProperty",
          diagram: diagram.id,
          target: link.owner,
          targetKind: "element",
          property: "link",
          value: null,
        }),
      );
      // A close element name of the linked diagram.
      const target = analysis.compilation.document.diagrams.find((d) => d.id === link.diagram);
      const close = target?.elements
        .map((e) => ({ id: e.id, d: editDistance(e.id.toLowerCase(), link.element.toLowerCase()) }))
        .filter((c) => c.d <= 3)
        .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))[0];
      if (close) {
        add(
          t.changeTo(`${link.diagram}.${close.id}`),
          [
            {
              start: link.elementRange.start.offset,
              end: link.elementRange.end.offset,
              newText: close.id,
            },
          ],
          true,
        );
      }
      break;
    }
    case "placement.unknown-port": {
      const [element, port] = ids;
      if (!diagram || !element || !port) break;
      const route = diagram.placement.find(
        (p): p is RouteEntry =>
          p.statement === "route" && p.node.start <= offset && offset <= p.node.end,
      );
      const end = route && route.node.args[2] && offset <= route.node.args[2].end ? "from" : "to";
      add(
        t.declarePort(port, element),
        plan(analysis, {
          kind: "addPort",
          diagram: diagram.id,
          element,
          name: port,
          side: facingSide(diagram, end),
        }),
        true,
      );
      for (const existing of diagram.elementsById.get(element)?.ports ?? []) {
        add(t.usePort(element, existing.name), [
          {
            start: diagnostic.range.start.offset,
            end: diagnostic.range.end.offset,
            newText: existing.name,
          },
        ]);
      }
      break;
    }
    case "layout.place-ignored": {
      // A list places its children: the child's `place` goes (`ids` is the child, then the list).
      const [element, list] = ids;
      const place = diagram?.placement.find((p) => p.statement === "place" && p.target === element);
      if (!element || !list || !place) break;
      add(
        t.removePlace(element, list),
        deleteStatements(analysis.text, analysis.compilation.parse.root, [place.node]),
        true,
      );
      break;
    }
    case "layout.too-large": {
      // A document that grew into a whiteboard: the board's canvas grows with it.
      if (!diagram || diagram.properties.preset !== "document") break;
      add(
        t.switchPreset("board"),
        plan(analysis, {
          kind: "setDiagramProperty",
          diagram: diagram.id,
          property: "preset",
          value: "board",
        }),
        true,
      );
      break;
    }
    case "prop.invalid-value": {
      // `spacing` or `align` in a group block without `layout`: the list starts as a column.
      const group = diagram && listWithoutLayout(analysis, diagram, diagnostic);
      if (!diagram || !group) break;
      add(
        t.addListLayout(group),
        plan(analysis, {
          kind: "setElementProperty",
          diagram: diagram.id,
          target: group,
          targetKind: "element",
          property: "layout",
          value: "column",
        }),
        true,
      );
      break;
    }
    case "layout.text-overflow": {
      const size = diagnostic.data?.size;
      if (!diagram || !size) break;
      add(
        t.setSize(size.element, size.width, size.height),
        plan(analysis, {
          kind: "setSize",
          diagram: diagram.id,
          element: size.element,
          width: size.width,
          height: size.height,
        }),
        true,
      );
      break;
    }
    case "prop.unknown":
    case "layout.unknown-theme":
    case "theme.unknown-class":
    case "asset.unknown-icon": {
      let start = diagnostic.range.start.offset;
      const end = diagnostic.range.end.offset;
      let raw = analysis.text.slice(start, end);
      // A whole statement, such as `theme "tecnical.light"`: the fix replaces its quoted value.
      const value = /"[^"\n]*"$/.exec(raw);
      if (value && value.index > 0) {
        start += value.index;
        raw = value[0];
      }
      const quoted = raw.startsWith('"') && raw.endsWith('"');
      const written = quoted ? raw.slice(1, -1) : raw;
      const candidates = candidatesOf(diagnostic)
        .filter((w) => w !== written)
        .map((w) => ({ w, d: editDistance(w.toLowerCase(), written.toLowerCase()) }))
        .filter((c) => c.d <= 3 || (diagnostic.code === "asset.unknown-icon" && c.w.includes(":")))
        .sort((a, b) => a.d - b.d || a.w.localeCompare(b.w))
        .slice(0, 3);
      for (const [i, { w }] of candidates.entries()) {
        add(t.changeTo(w), [{ start, end, newText: quoted ? `"${w}"` : w }], i === 0);
      }
      break;
    }
  }
  return actions;
}

/**
 * Confirms an inferred relation at `offset` (decision 0029): removes its `assumption` statement,
 * so it is drawn as any other relation.
 */
function confirmAssumption(analysis: DocumentAnalysis, offset: number): CodeAction[] {
  const document = analysis.compilation.document;
  const relations = [
    ...document.diagrams.flatMap((d) => d.relations),
    ...document.models.flatMap((m) => m.relations),
  ];
  const relation = relations.find(
    (r) => r.assumption !== null && r.node.start <= offset && offset <= r.node.end,
  );
  const statement = relation?.node.block?.statements.find(
    (s) => s.kind === "KeywordStatement" && s.keyword.text === "assumption",
  );
  if (!relation || !statement) return [];
  return [
    {
      title: serviceMessages().fixes.confirmAssumption,
      kind: "quickfix",
      edits: deleteStatements(analysis.text, analysis.compilation.parse.root, [statement]),
      preferred: true,
    },
  ];
}

/** Quick fixes for the diagnostics at a range, and refactors for the code at it. */
export function codeActions(
  analysis: DocumentAnalysis,
  range: { start: number; end: number },
  diagnostics: readonly Diagnostic[] = analysis.diagnostics.filter(
    (d) => d.range.start.offset <= range.end && range.start <= d.range.end.offset,
  ),
): CodeAction[] {
  const actions = diagnostics.flatMap((d) => fixes(analysis, d));
  actions.push(...confirmAssumption(analysis, range.start));
  const diagram = diagramAt(analysis.compilation, range.start);
  if (!diagram || diagram.hasSyntaxErrors) return actions;
  const relation = diagram.relations.find(
    (r) => r.id === null && r.node.start <= range.start && range.start <= r.node.end,
  );
  if (relation) {
    const used = new Set([
      ...diagram.elementsById.keys(),
      ...diagram.relations.map((r) => r.id ?? ""),
    ]);
    let id = `${relation.from}_${relation.to}`;
    for (let n = 2; used.has(id); n++) id = `${relation.from}_${relation.to}_${n}`;
    const edits = plan(analysis, {
      kind: "materializeRelationId",
      diagram: diagram.id,
      relationKey: relation.key,
      id,
    });
    if (edits)
      actions.push({ title: serviceMessages().fixes.nameRelation(id), kind: "refactor", edits });
  }
  const arrange =
    diagram.type === "sequence" ? undefined : arrangeOperation(analysis, diagram.id, "all");
  const edits = arrange ? plan(analysis, arrange) : undefined;
  if (edits) {
    actions.push({
      title: serviceMessages().fixes.arrangeDiagram(diagram.id),
      kind: "refactor",
      edits,
    });
  }
  return actions;
}
