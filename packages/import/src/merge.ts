import {
  applyTextEdits,
  firstToken,
  formatSource,
  LineIndex,
  tokensOf,
  type CstNode,
  type DiagramBlock,
  type Diagnostic,
  type KeywordStatement,
  type QualifiedRef,
  type Severity,
  type Span,
  type Statement,
  type TextEdit,
  type TopLevelItem,
} from "@meltemi/diagrams-language";
import { compile, type Compilation, type FlowDiagram } from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";

export interface MergeResult {
  /** The imported sheet with the existing sheet's adjustments. */
  readonly text: string;
  /** `import.merge` findings, with ranges in the existing sheet. */
  readonly findings: readonly Diagnostic[];
}

/** Statements that replace the imported one with the same keyword. */
const REPLACING = new Set(["layout", "routing", "theme", "preset", "canvas", "layers"]);
/** Statements whose leading arguments are a list of targets. */
const TARGET_LISTS = new Set(["style", "animate"]);
/** Placement statements and how many targets their lists need at least. */
const PLACEMENT_LISTS: Readonly<Record<string, number>> = { row: 2, column: 2, align: 2, order: 2 };
/** Words that end a constraint's target list. */
const LIST_WORDS = new Set([
  "horizontal",
  "vertical",
  "top",
  "bottom",
  "left",
  "right",
  "middle",
  "center",
]);
/** Element block statements that are adjustments rather than source content. */
const ELEMENT_ADJUSTMENTS = new Set(["class", "port", "link", "layer"]);

interface Piece {
  text: string;
  /** Where the statement was in the existing sheet, for findings. */
  origin: Span;
  /** A short description for findings. */
  what: string;
  /** Placement statements go into the diagram's one `placement { }` block. */
  placement: boolean;
  /** The statement's keyword, which decides where it goes. */
  word: string;
}

interface DiagramPlan {
  id: string;
  pieces: Piece[];
}

/**
 * Re-imports a sheet: `imported` is the new import, `existing` the sheet the user adjusted.
 * Adjustments whose targets still exist are kept by id; the rest is reported.
 */
export function mergeImport(existing: string, imported: string): MergeResult {
  const findings: { span: Span; message: string; severity: Severity }[] = [];
  const report = (span: Span, message: string, severity: Severity = "info") =>
    findings.push({ span, message, severity });
  const old = compile(existing);
  const neu = compile(imported);
  const oldItems = old.parse.root.items;
  const newItems = neu.parse.root.items;
  const idOf = (item: TopLevelItem): string | null =>
    "id" in item && item.id && "text" in item.id ? item.id.text : null;
  const newIds = new Set(newItems.map(idOf).filter((id): id is string => id !== null));

  const edits: TextEdit[] = [];
  const plans: DiagramPlan[] = [];
  for (const item of newItems) {
    if (item.kind !== "DiagramBlock") continue;
    const id = idOf(item);
    if (id === null) continue;
    const before = oldItems.find(
      (o): o is DiagramBlock => o.kind === "DiagramBlock" && idOf(o) === id,
    );
    if (!before) continue;
    const typeOf = (d: DiagramBlock) => (d.type && "text" in d.type ? d.type.text : "");
    if (typeOf(before) !== typeOf(item)) {
      report(before, messages().merge.typeChanged(id, typeOf(before), typeOf(item)), "warning");
      continue;
    }
    const oldDiagram = old.document.diagrams.find((d) => d.node === before);
    const newDiagram = neu.document.diagrams.find((d) => d.node === item);
    if (!oldDiagram || !newDiagram) continue;
    plans.push(planDiagram(existing, imported, oldDiagram, newDiagram, edits, report));
  }

  // The new import with renames, element adjustments and replaced statements. A rename inside a
  // statement that is replaced or deleted is already part of the replacement.
  const outer = edits.filter((a) => a.end > a.start);
  const base = applyTextEdits(
    imported,
    edits.filter(
      (a) =>
        !outer.some(
          (b) =>
            b !== a && b.start <= a.start && a.end <= b.end && b.end - b.start > a.end - a.start,
        ),
    ),
  );
  // Blocks of the existing sheet that the import does not produce.
  const kept: string[] = [];
  for (const item of oldItems) {
    const id = idOf(item);
    if (item.kind === "Header") continue;
    if (item.kind === "ImportStatement") {
      kept.unshift(existing.slice(item.start, item.end));
      continue;
    }
    if (id !== null && newIds.has(id)) continue;
    const text = existing.slice(commentStart(item), item.end).trim();
    if (text === "") continue;
    kept.push(text);
    report(item, messages().merge.kept(id ?? item.kind));
  }

  const dropped = new Set<Piece>();
  let text = assemble(base, plans, dropped, kept);
  // Safety: drop copied statements that do not compile against the new import.
  for (let round = 0; round < 50; round++) {
    const check = compile(text.text);
    const errors = check.diagnostics.filter((d) => d.severity === "error");
    if (errors.length === 0) break;
    let removed = false;
    for (const error of errors) {
      const piece = text.pieceAt(error.range.start.offset);
      if (piece && !dropped.has(piece)) {
        dropped.add(piece);
        report(piece.origin, messages().merge.droppedError(piece.what, error.message));
        removed = true;
      }
    }
    if (!removed) break;
    text = assemble(base, plans, dropped, kept);
  }
  const formatted = formatSource(text.text);
  const lines = new LineIndex(existing);
  return {
    text: formatted.ok ? formatted.text : text.text,
    findings: findings
      .sort((a, b) => a.span.start - b.span.start)
      .map((f) => ({
        code: "import.merge",
        severity: f.severity,
        message: f.message,
        range: lines.range(f.span),
      })),
  };
}

function planDiagram(
  existing: string,
  imported: string,
  oldDiagram: FlowDiagram,
  newDiagram: FlowDiagram,
  edits: TextEdit[],
  report: (span: Span, message: string, severity?: Severity) => void,
): DiagramPlan {
  const plan: DiagramPlan = { id: newDiagram.id, pieces: [] };
  const known = new Set<string>([
    ...newDiagram.elementsById.keys(),
    ...newDiagram.relationsByKey.keys(),
    ...newDiagram.eventsByKey.keys(),
  ]);
  const tokenRenames = new Map<string, string>();

  // Relation ids: matched by endpoints and occurrence.
  const occurrences = (diagram: FlowDiagram) => {
    const seen = new Map<string, number>();
    return diagram.relations
      .filter((r) => !r.derived)
      .map((r) => {
        const pair = `${r.from}->${r.to}`;
        const n = (seen.get(pair) ?? 0) + 1;
        seen.set(pair, n);
        return { key: `${pair}#${n}`, relation: r };
      });
  };
  const newByKey = new Map(occurrences(newDiagram).map((x) => [x.key, x.relation]));
  for (const { key, relation: before } of occurrences(oldDiagram)) {
    if (before.id === null) continue;
    const after = newByKey.get(key);
    if (!after || after.id === before.id) continue;
    // The existing id must not name something else in the new import.
    if (newDiagram.elementsById.has(before.id) || newDiagram.relationsByKey.has(before.id))
      continue;
    if (after.id === null) {
      const node = after.node;
      const anchor = (node.label ?? node.target).end;
      edits.push({ start: anchor, end: anchor, newText: ` as ${before.id}` });
    } else tokenRenames.set(after.id, before.id);
    known.add(before.id);
  }

  // Fragment ids: matched by operator and order.
  const fragments = (diagram: FlowDiagram) => {
    const out: { key: string; id: string | null; idRange: Span | null }[] = [];
    const counts = new Map<string, number>();
    for (const event of diagram.eventsByKey.values()) {
      if (event.kind !== "fragment") continue;
      const n = (counts.get(event.operator) ?? 0) + 1;
      counts.set(event.operator, n);
      out.push({
        key: `${event.operator}#${n}`,
        id: event.id,
        idRange: event.idRange
          ? { start: event.idRange.start.offset, end: event.idRange.end.offset }
          : null,
      });
    }
    return out;
  };
  const newFragments = new Map(fragments(newDiagram).map((f) => [f.key, f]));
  for (const before of fragments(oldDiagram)) {
    if (before.id === null) continue;
    const after = newFragments.get(before.key);
    if (!after || after.id === before.id || after.id === null) continue;
    if (newDiagram.elementsById.has(before.id) || newDiagram.relationsByKey.has(before.id))
      continue;
    tokenRenames.set(after.id, before.id);
    known.add(before.id);
  }
  if (tokenRenames.size > 0) {
    for (const token of tokensOf(newDiagram.node)) {
      if (token.kind !== "Identifier") continue;
      const to = tokenRenames.get(token.text);
      if (to !== undefined) edits.push({ start: token.start, end: token.end, newText: to });
    }
  }

  // Classes, ports, links and layers written in element blocks.
  for (const before of oldDiagram.elements) {
    const node = before.node;
    if (!node || before.implicit || !node.block) continue;
    const adjustments = node.block.statements.filter(
      (s): s is KeywordStatement =>
        s.kind === "KeywordStatement" && ELEMENT_ADJUSTMENTS.has(s.keyword.text),
    );
    if (adjustments.length === 0) continue;
    const after = newDiagram.elementsById.get(before.id);
    if (!after?.node) {
      for (const s of adjustments) {
        report(s, messages().merge.adjustmentDropped(existing.slice(s.start, s.end), before.id));
      }
      continue;
    }
    const target = after.node;
    const lines: string[] = [];
    const existingClass = target.block?.statements.find(
      (s): s is KeywordStatement => s.kind === "KeywordStatement" && s.keyword.text === "class",
    );
    for (const s of adjustments) {
      if (s.keyword.text === "class" && existingClass) {
        const names = new Set([
          ...existingClass.args.map((a) => imported.slice(a.start, a.end)),
          ...s.args.map((a) => existing.slice(a.start, a.end)),
        ]);
        edits.push({
          start: existingClass.start,
          end: existingClass.end,
          newText: `class ${[...names].join(", ")}`,
        });
        continue;
      }
      const sameKind = target.block?.statements.some(
        (t) =>
          t.kind === "KeywordStatement" &&
          t.keyword.text === s.keyword.text &&
          s.keyword.text !== "port",
      );
      if (sameKind) continue;
      lines.push(existing.slice(s.start, s.end));
    }
    if (lines.length === 0) continue;
    if (target.block) {
      const close = target.block.close;
      edits.push({
        start: close.start,
        end: close.start,
        newText: `${lines.map((l) => `\n${l}`).join("")}\n`,
      });
    } else {
      edits.push({ start: target.end, end: target.end, newText: ` { ${lines.join("; ")} }` });
    }
  }

  // Statements of the diagram body.
  const body = oldDiagram.block;
  const newBody = newDiagram.block;
  if (!body || !newBody) return plan;
  const newStatements = newBody.statements.filter(
    (s): s is KeywordStatement => s.kind === "KeywordStatement",
  );
  const placementKeys = new Set<string>();
  /** `style <target>` and `animate <target>` with the properties the existing sheet sets. */
  const overridden = new Map<string, Set<string>>();
  for (const stmt of body.statements) {
    if (stmt.kind !== "KeywordStatement") continue;
    const word = stmt.keyword.text;
    const origin: Span = { start: stmt.start, end: stmt.end };
    const text = withComments(existing, stmt);
    if (REPLACING.has(word)) {
      const twin = newStatements.find((s) => s.keyword.text === word);
      if (twin)
        edits.push({
          start: twin.start,
          end: twin.end,
          newText: existing.slice(stmt.start, stmt.end),
        });
      else plan.pieces.push({ text, origin, what: `\`${word}\``, placement: false, word });
      continue;
    }
    if (word === "class" && stmt.block && stmt.args.length === 1) {
      const name = existing.slice(stmt.args[0]!.start, stmt.args[0]!.end);
      const twin = newStatements.find(
        (s) =>
          s.keyword.text === "class" &&
          s.block &&
          s.args.length === 1 &&
          imported.slice(s.args[0]!.start, s.args[0]!.end) === name,
      );
      if (twin)
        edits.push({
          start: twin.start,
          end: twin.end,
          newText: existing.slice(stmt.start, stmt.end),
        });
      else plan.pieces.push({ text, origin, what: `class \`${name}\``, placement: false, word });
      continue;
    }
    if (word === "rule") {
      const kind = stmt.args[0] ? existing.slice(stmt.args[0].start, stmt.args[0].end) : "";
      for (const twin of newStatements.filter(
        (s) =>
          s.keyword.text === "rule" &&
          s.args[0] &&
          imported.slice(s.args[0].start, s.args[0].end) === kind,
      )) {
        edits.push(deleteLine(imported, twin));
      }
      plan.pieces.push({ text, origin, what: `rule \`${kind}\``, placement: false, word });
      continue;
    }
    if (word === "scenario" || (word === "label" && oldDiagram.type === "c4")) {
      plan.pieces.push({ text, origin, what: `\`${word}\``, placement: false, word });
      continue;
    }
    if (TARGET_LISTS.has(word)) {
      const piece = reduceTargets(existing, stmt, known, 1, report);
      if (!piece) continue;
      plan.pieces.push({ text: piece, origin, what: `\`${word}\``, placement: false, word });
      const props = (stmt.block?.statements ?? [])
        .filter((s): s is KeywordStatement => s.kind === "KeywordStatement")
        .map((s) => s.keyword.text);
      for (const ref of leadingRefs(stmt)) {
        const key = `${word} ${ref.text}`;
        const set = overridden.get(key) ?? new Set<string>();
        for (const prop of word === "animate" ? ["*"] : props) set.add(prop);
        overridden.set(key, set);
      }
      continue;
    }
    if (word === "placement" && stmt.block) {
      for (const inner of stmt.block.statements) {
        if (inner.kind !== "KeywordStatement") continue;
        const innerWord = inner.keyword.text;
        const innerOrigin: Span = { start: inner.start, end: inner.end };
        const min = PLACEMENT_LISTS[innerWord];
        const piece =
          min !== undefined
            ? reduceTargets(existing, inner, known, min, report)
            : checkTarget(existing, inner, known, report);
        if (!piece) continue;
        const target = inner.args[0] ? existing.slice(inner.args[0].start, inner.args[0].end) : "";
        placementKeys.add(`${innerWord} ${target}`);
        plan.pieces.push({
          text: piece,
          origin: innerOrigin,
          what: `\`${innerWord} ${target}\``,
          placement: true,
          word: innerWord,
        });
      }
    }
  }
  // The existing placements replace the imported ones for the same targets.
  for (const s of newStatements) {
    if (s.keyword.text !== "placement" || !s.block) continue;
    for (const inner of s.block.statements) {
      if (inner.kind !== "KeywordStatement") continue;
      const written = inner.args[0] ? imported.slice(inner.args[0].start, inner.args[0].end) : "";
      const target = tokenRenames.get(written) ?? written;
      if (placementKeys.has(`${inner.keyword.text} ${target}`))
        edits.push(deleteLine(imported, inner));
    }
  }
  // The existing styles and animations replace the imported ones, property by property.
  for (const s of newStatements) {
    const word = s.keyword.text;
    if (!TARGET_LISTS.has(word)) continue;
    const targets = leadingRefs(s).map((r) => tokenRenames.get(r.text) ?? r.text);
    if (targets.length === 0) continue;
    const props = (s.block?.statements ?? []).filter(
      (p): p is KeywordStatement => p.kind === "KeywordStatement",
    );
    const taken = (prop: string) =>
      targets.every((t) => {
        const set = overridden.get(`${word} ${t}`);
        return set !== undefined && (set.has(prop) || set.has("*"));
      });
    const remaining = props.filter((p) => !taken(p.keyword.text));
    if (remaining.length === props.length) continue;
    if (remaining.length === 0) {
      edits.push(deleteLine(imported, s));
      continue;
    }
    const body = remaining.map((p) => imported.slice(p.start, p.end)).join("; ");
    edits.push({
      start: s.start,
      end: s.end,
      newText: `${word} ${targets.join(", ")} { ${body} }`,
    });
  }
  return plan;
}

/** The target list at the start of a statement's arguments. */
function leadingRefs(stmt: KeywordStatement): QualifiedRef[] {
  const refs: QualifiedRef[] = [];
  for (const arg of stmt.args) {
    if (arg.kind !== "QualifiedRef" || (refs.length > 0 && LIST_WORDS.has(arg.text))) break;
    refs.push(arg);
  }
  return refs;
}

/** The statement with its own leading comments. */
function withComments(text: string, stmt: Statement): string {
  return text.slice(commentStart(stmt), stmt.end).trim();
}

/** Where a node's leading comments start, or the node's start when it has none. */
function commentStart(node: CstNode): number {
  const first = firstToken(node);
  if (!first) return node.start;
  const comment = first.leadingTrivia.findIndex(
    (t) => t.kind === "LineComment" || t.kind === "BlockComment",
  );
  if (comment < 0) return node.start;
  let offset = first.start;
  for (let i = first.leadingTrivia.length - 1; i >= comment; i--)
    offset -= first.leadingTrivia[i]!.text.length;
  return offset;
}

/** A statement's text with its leading target list reduced to known targets, or null. */
function reduceTargets(
  text: string,
  stmt: KeywordStatement,
  known: ReadonlySet<string>,
  min: number,
  report: (span: Span, message: string) => void,
): string | null {
  const refs: QualifiedRef[] = [];
  for (const arg of stmt.args) {
    // Words such as `horizontal` or `top` after the list are not targets.
    if (arg.kind !== "QualifiedRef" || (refs.length > 0 && LIST_WORDS.has(arg.text))) break;
    refs.push(arg);
  }
  if (refs.length === 0) return withComments(text, stmt);
  const keep = refs.filter((r) => known.has(r.text));
  const gone = refs.filter((r) => !known.has(r.text));
  if (gone.length === 0) return withComments(text, stmt);
  const names = gone.map((r) => r.text);
  if (keep.length < min) {
    report(stmt, messages().merge.dropped(text.slice(stmt.start, stmt.end).split("\n")[0]!, names));
    return null;
  }
  report(stmt, messages().merge.targetsRemoved(names, stmt.keyword.text));
  const first = refs[0]!;
  const last = refs[refs.length - 1]!;
  const lead = text.slice(commentStart(stmt), first.start);
  return (lead + keep.map((r) => r.text).join(", ") + text.slice(last.end, stmt.end)).trim();
}

/** A placement statement whose first argument must still exist. */
function checkTarget(
  text: string,
  stmt: KeywordStatement,
  known: ReadonlySet<string>,
  report: (span: Span, message: string) => void,
): string | null {
  const first = stmt.args[0];
  if (first?.kind === "QualifiedRef" && !known.has(first.text)) {
    report(stmt, messages().merge.dropped(text.slice(stmt.start, stmt.end), [first.text]));
    return null;
  }
  return withComments(text, stmt);
}

function deleteLine(text: string, node: { start: number; end: number }): TextEdit {
  const lineStart = text.lastIndexOf("\n", node.start - 1) + 1;
  let lineEnd = text.indexOf("\n", node.end);
  if (lineEnd < 0) lineEnd = text.length;
  const before = text.slice(lineStart, node.start).trim();
  const after = text.slice(node.end, lineEnd).trim();
  if (before === "" && after === "")
    return { start: lineStart, end: Math.min(text.length, lineEnd + 1), newText: "" };
  return { start: node.start, end: node.end, newText: "" };
}

interface Assembled {
  text: string;
  pieceAt(offset: number): Piece | undefined;
}

/** Where a diagram-level statement goes: properties, definitions, content, placement, styles. */
const RANK: Readonly<Record<string, number>> = {
  title: 0,
  description: 0,
  direction: 1,
  layout: 1,
  routing: 1,
  theme: 1,
  preset: 1,
  canvas: 1,
  layers: 1,
  level: 1,
  scope: 1,
  include: 1,
  exclude: 1,
  label: 1,
  autonumber: 1,
  class: 2,
  rule: 2,
  placement: 5,
  style: 6,
  animate: 7,
  scenario: 8,
};
const CONTENT = 3;
const PLACEMENT = 5;

function rankOf(stmt: Statement): number {
  if (stmt.kind !== "KeywordStatement") return CONTENT;
  const word = stmt.keyword.text;
  // `class` with a block defines a class; groups and elements are content.
  if (word === "class" && !stmt.block) return CONTENT;
  return RANK[word] ?? CONTENT;
}

interface Item {
  rank: number;
  text: string;
  piece?: Piece;
  /** A blank line came before it in the import. */
  gap?: boolean;
}

/**
 * Rebuilds each merged diagram in the canonical order (properties, definitions, content,
 * placement, styles, animations, scenarios), with the kept pieces in their places, and appends
 * the existing sheet's blocks that the import does not produce.
 */
function assemble(
  base: string,
  plans: readonly DiagramPlan[],
  dropped: ReadonlySet<Piece>,
  kept: readonly string[],
): Assembled {
  const compiled: Compilation = compile(base);
  const ranges: { start: number; end: number; piece: Piece }[] = [];
  const replaced: { start: number; end: number; build: (offset: number) => string }[] = [];
  for (const plan of plans) {
    const diagram = compiled.document.diagrams.find((d) => d.id === plan.id);
    const block = diagram?.node.block;
    if (!diagram || !block || block.kind !== "Block" || block.close.kind === "Missing") continue;
    const items: Item[] = [];
    const placed: Item[] = [];
    let previous = block.open.end;
    for (const stmt of block.statements) {
      const gap = /\n[ \t]*\r?\n/.test(base.slice(previous, commentStart(stmt)));
      previous = stmt.end;
      if (stmt.kind === "KeywordStatement" && stmt.keyword.text === "placement" && stmt.block) {
        for (const inner of stmt.block.statements) {
          placed.push({ rank: PLACEMENT, text: withComments(base, inner) });
        }
        continue;
      }
      items.push({ rank: rankOf(stmt), text: withComments(base, stmt), gap });
    }
    for (const piece of plan.pieces) {
      if (dropped.has(piece)) continue;
      if (piece.placement) placed.push({ rank: PLACEMENT, text: piece.text, piece });
      else items.push({ rank: RANK[piece.word] ?? CONTENT, text: piece.text, piece });
    }
    const closing = commentTrivia(block.close);
    const header = base.slice(diagram.node.start, block.open.end);
    replaced.push({
      start: diagram.node.start,
      end: diagram.node.end,
      build: (offset) => {
        const groups = new Map<number, Item[]>();
        for (const item of items) groups.set(item.rank, [...(groups.get(item.rank) ?? []), item]);
        if (placed.length > 0 && !groups.has(PLACEMENT)) groups.set(PLACEMENT, []);
        let out = header;
        const add = (item: Item) => {
          if (item.piece) {
            ranges.push({
              start: offset + out.length,
              end: offset + out.length + item.text.length,
              piece: item.piece,
            });
          }
          out += item.text;
        };
        [...groups.keys()]
          .sort((a, b) => a - b)
          .forEach((rank, i) => {
            out += i === 0 ? "\n" : "\n\n";
            const list = groups.get(rank)!;
            if (rank === PLACEMENT && placed.length > 0) {
              out += "placement {";
              for (const p of placed) {
                out += "\n";
                add(p);
              }
              out += "\n}";
              for (const item of list) {
                out += "\n";
                add(item);
              }
              return;
            }
            list.forEach((item, j) => {
              if (j > 0) out += item.gap ? "\n\n" : "\n";
              add(item);
            });
          });
        if (closing !== "") out += `\n\n${closing}`;
        return `${out}\n}`;
      },
    });
  }
  replaced.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const r of replaced) {
    out += base.slice(cursor, r.start);
    out += r.build(out.length);
    cursor = r.end;
  }
  out += base.slice(cursor);
  const imports = kept.filter((k) => k.startsWith("import "));
  const blocks = kept.filter((k) => !k.startsWith("import "));
  const missing = imports.filter((i) => !out.includes(i));
  if (missing.length > 0) {
    const header = /^language\s+"[^"]*"\s*\n/.exec(out);
    const at = header ? header[0].length : 0;
    const insert = `\n${missing.join("\n")}\n`;
    out = out.slice(0, at) + insert + out.slice(at);
    for (const r of ranges) {
      if (r.start < at) continue;
      r.start += insert.length;
      r.end += insert.length;
    }
  }
  if (blocks.length > 0) out = `${out.replace(/\s*$/, "")}\n\n${blocks.join("\n\n")}\n`;
  return {
    text: out,
    pieceAt: (offset) => ranges.find((r) => offset >= r.start && offset <= r.end)?.piece,
  };
}

/** The comments in a token's leading trivia, one per line. */
function commentTrivia(token: {
  leadingTrivia: readonly { kind: string; text: string }[];
}): string {
  return token.leadingTrivia
    .filter((t) => t.kind === "LineComment" || t.kind === "BlockComment")
    .map((t) => t.text.trim())
    .join("\n");
}
