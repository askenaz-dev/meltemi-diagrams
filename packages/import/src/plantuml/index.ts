import type { Span } from "@meltemi/diagrams-language";
import { readC4, type C4Statement } from "../c4.js";
import type { FrontContext, FrontOutcome } from "../front.js";
import { messages } from "../messages/index.js";
import type { SourceLine } from "../report.js";
import { commonStatement, Comments, lineSpan, Lines } from "./common.js";
import { DescriptionReader } from "./description.js";
import { preprocess, type PreprocessOptions } from "./preprocess.js";
import { PlantSequenceReader } from "./sequence.js";

interface Block {
  name?: string;
  lines: SourceLine[];
  span: Span;
  header: Span;
  kind: string;
}

const C4_MACRO =
  /^(Person|Person_Ext|System|System_Ext|SystemDb|SystemDb_Ext|SystemQueue|SystemQueue_Ext|Container|ContainerDb|ContainerQueue|Container_Ext|ContainerDb_Ext|ContainerQueue_Ext|Component|ComponentDb|ComponentQueue|Component_Ext|ComponentDb_Ext|ComponentQueue_Ext|Rel|BiRel|Rel_[A-Za-z_]+|BiRel_[A-Za-z_]+|RelIndex|System_Boundary|Container_Boundary|Enterprise_Boundary|Boundary)\s*\(/;

const DESCRIPTION =
  /^(component|interface|node|package|folder|frame|cloud|rectangle|card|agent|artifact|file|storage|usecase|hexagon|stack|label|action|process|circle|person)\b|^\[[^\]]+\]|^\(\)|^\([^)]+\)(\s|$)|^:[^:]+:|^(left to right|top to bottom) direction$|\[[^\]]+\]\s*[-.<]|[-.>]\s*\[[^\]]+\]|\([^)]+\)\s*[-.<]|[-.>]\s*\([^)]+\)/i;

const SEQUENCE =
  /^(participant|boundary|control|entity|collections|queue)\s|^(activate|deactivate|destroy|create|return|autonumber|alt|else|opt|loop|par|break|critical|group|ref\s+over|box)\b|^==.*==$|^\.\.\.|^\|\|\d*\|\|$|^note\s+over\b|^[hr]note\b|^(\S+)\s*-{1,2}>{1,2}\s*(\S+)\s*:|\+\+\s*(:|$)/i;

const UNSUPPORTED: readonly [RegExp, string][] = [
  [
    /^(abstract\s+class|abstract|class|enum|annotation|struct|exception|metaclass|protocol)\s+\S/i,
    "class",
  ],
  [
    /^(start|stop|endif|endwhile|fork|end\s+fork|repeat|detach|kill)$|^:[^\n]*[;|<>/\]}]$|^if\s*\(.*\)\s*then|^while\s*\(|^partition\s|^\|[^|]+\|$/i,
    "activity",
  ],
  [/^state\s|\[\*\]/i, "state"],
  [/^(object|map)\s/i, "object"],
  [/^(robust|concise|clock|binary)\s/i, "timing"],
  [/^(json|yaml)\s/i, "data"],
];

/** Imports every `@startuml` block of a PlantUML source. */
export function importPlantUml(
  ctx: FrontContext,
  lines: readonly SourceLine[],
  key: () => string,
  options: PreprocessOptions,
): FrontOutcome[] {
  const r = ctx.reporter;
  const blocks = splitBlocks(ctx, lines);
  const outcomes: FrontOutcome[] = [];
  for (const block of blocks) {
    const k = key();
    r.begin(k);
    if (block.kind !== "uml") {
      r.add({
        code: "import.unsupported-diagram",
        severity: "error",
        message: messages().plantuml.unsupportedStart(block.kind),
        span: block.header,
        construct: `plantuml.${block.kind}`,
        status: "dropped",
        essential: true,
        hints: [messages().plantuml.supportedHint],
      });
      outcomes.push({ failed: true, key: k });
      continue;
    }
    const uncommented = blockComments(block.lines);
    const { lines: processed, libraries } = preprocess(r, uncommented, options);
    if (libraries.c4Unsupported) {
      r.add({
        code: "import.unsupported-diagram",
        severity: "error",
        message: messages().plantuml.unsupportedC4(libraries.c4Unsupported),
        span: block.header,
        construct: `plantuml.${libraries.c4Unsupported}`,
        status: "dropped",
        essential: true,
        hints: [messages().plantuml.c4LevelsHint],
      });
      outcomes.push({ failed: true, key: k });
      continue;
    }
    const kind = classify(processed, libraries.c4);
    if (kind.unsupported) {
      r.add({
        code: "import.unsupported-diagram",
        severity: "error",
        message: messages().plantuml.unsupportedKind(kind.unsupported),
        span: block.header,
        construct: `plantuml.${kind.unsupported}`,
        status: "dropped",
        essential: true,
        hints: [messages().plantuml.supportedHint],
      });
      outcomes.push({ failed: true, key: k });
      continue;
    }
    if (kind.type === "empty") {
      r.add({
        code: "import.unsupported-diagram",
        severity: "error",
        message: messages().plantuml.empty,
        span: block.header,
        construct: "plantuml.empty",
        status: "dropped",
        essential: true,
      });
      outcomes.push({ failed: true, key: k });
      continue;
    }
    let sheet;
    let sourceKind: string;
    if (kind.type === "c4") {
      const { statements, title, comments, direction } = c4Statements(ctx, processed);
      sheet = readC4(ctx, statements, {
        level: libraries.c4Level,
        dynamic: libraries.c4Dynamic,
        ...(title !== undefined ? { title } : {}),
        span: block.header,
        construct: "plantuml.c4",
      });
      if (direction !== undefined) sheet.direction ??= direction;
      sheet.trailing.push(...comments);
      sourceKind =
        libraries.c4Level === "context"
          ? "C4_Context"
          : libraries.c4Level === "component"
            ? "C4_Component"
            : libraries.c4Dynamic
              ? "C4_Dynamic"
              : libraries.c4Level === "container"
                ? "C4_Container"
                : "C4";
    } else if (kind.type === "sequence") {
      sheet = new PlantSequenceReader(ctx, k).read(processed);
      sourceKind = "sequence";
    } else {
      sheet = new DescriptionReader(ctx, k).read(processed);
      sourceKind = "description";
    }
    outcomes.push({
      sheet,
      format: "plantuml",
      kind: sourceKind,
      span: block.span,
      ...(block.name !== undefined ? { name: block.name } : {}),
      key: k,
    });
  }
  return outcomes;
}

function splitBlocks(ctx: FrontContext, lines: readonly SourceLine[]): Block[] {
  const blocks: Block[] = [];
  let open: { kind: string; name?: string; header: SourceLine; lines: SourceLine[] } | null = null;
  for (const line of lines) {
    const t = line.text.trim();
    const start = /^@start([a-z]+)\b\s*(?:\(id=([^)]*)\))?\s*(.*)$/i.exec(t);
    if (start && !open) {
      const name = (start[2] ?? start[3] ?? "").trim();
      open = { kind: start[1]!.toLowerCase(), header: line, lines: [] };
      if (name !== "") open.name = name;
      continue;
    }
    if (/^@end[a-z]+\b/i.test(t) && open) {
      blocks.push({
        ...(open.name !== undefined ? { name: open.name } : {}),
        kind: open.kind,
        lines: open.lines,
        header: lineSpan(open.header),
        span: { start: open.header.span.start, end: line.span.end },
      });
      open = null;
      continue;
    }
    if (open) open.lines.push(line);
  }
  if (open) {
    ctx.reporter.syntax(
      "plantuml.block",
      lineSpan(open.header),
      messages().plantuml.blockNotClosed(open.kind),
    );
    blocks.push({
      ...(open.name !== undefined ? { name: open.name } : {}),
      kind: open.kind,
      lines: open.lines,
      header: lineSpan(open.header),
      span: {
        start: open.header.span.start,
        end: lines[lines.length - 1]?.span.end ?? open.header.span.end,
      },
    });
  }
  if (blocks.length === 0 && !lines.some((l) => /^\s*@start/i.test(l.text))) {
    const first = lines.find((l) => l.text.trim() !== "");
    const span = first ? lineSpan(first) : { start: 0, end: 0 };
    blocks.push({
      kind: "uml",
      lines: [...lines],
      header: span,
      span: { start: lines[0]?.span.start ?? 0, end: lines[lines.length - 1]?.span.end ?? 0 },
    });
  }
  return blocks;
}

/** Turns `/' … '/` comments into `'` lines so every later step sees one comment per line. */
function blockComments(lines: readonly SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  let inside = false;
  for (const line of lines) {
    let text = line.text;
    if (!inside && !text.includes("/'")) {
      out.push(line);
      continue;
    }
    let result = "";
    const comments: string[] = [];
    let i = 0;
    while (i < text.length) {
      if (inside) {
        const end = text.indexOf("'/", i);
        if (end < 0) {
          comments.push(text.slice(i));
          i = text.length;
        } else {
          comments.push(text.slice(i, end));
          i = end + 2;
          inside = false;
        }
      } else {
        const start = text.indexOf("/'", i);
        if (start < 0) {
          result += text.slice(i);
          i = text.length;
        } else {
          result += text.slice(i, start);
          i = start + 2;
          inside = true;
        }
      }
    }
    text = result;
    for (const c of comments) {
      for (const part of c.split("\n")) {
        if (part.trim() !== "") out.push({ ...line, text: `' ${part.trim()}`, generated: true });
      }
    }
    if (text.trim() !== "") out.push({ ...line, text, generated: true });
  }
  return out;
}

function classify(
  lines: readonly SourceLine[],
  c4: boolean,
):
  | { type: "c4" | "sequence" | "description" | "empty"; unsupported?: undefined }
  | { unsupported: string; type?: undefined } {
  const significant = lines
    .map((l) => l.text.trim())
    .filter(
      (t) =>
        t !== "" &&
        !t.startsWith("'") &&
        !/^(title|skinparam|hide|show|scale|header|footer|legend|caption)\b/i.test(t),
    );
  if (c4 || significant.some((t) => C4_MACRO.test(t))) return { type: "c4" };
  for (const [re, kind] of UNSUPPORTED) {
    if (significant.some((t) => re.test(t))) {
      // `end` alone also closes sequence fragments; activity needs a stronger signal.
      if (
        kind === "activity" &&
        significant.some((t) => SEQUENCE.test(t)) &&
        !significant.some((t) => /^:[^\n]*;$/.test(t) || /^start$/i.test(t))
      )
        continue;
      return { unsupported: kind };
    }
  }
  if (significant.length === 0) return { type: "empty" };
  if (significant.some((t) => DESCRIPTION.test(t))) return { type: "description" };
  if (significant.some((t) => SEQUENCE.test(t))) return { type: "sequence" };
  // PlantUML reads `a -> b` without other hints as a sequence.
  if (significant.some((t) => /^\S+\s*-{1,2}>{1,2}\s*\S+/.test(t))) return { type: "sequence" };
  return { type: "description" };
}

function c4Statements(
  ctx: FrontContext,
  lines: readonly SourceLine[],
): { statements: C4Statement[]; title?: string; comments: string[]; direction?: string } {
  const statements: C4Statement[] = [];
  const comments = new Comments();
  const cursor = new Lines(lines);
  let title: string | undefined;
  let direction: string | undefined;
  while (!cursor.done) {
    const line = cursor.next()!;
    const t = line.text.trim();
    if (t === "") continue;
    const common = commonStatement(line, cursor, ctx.reporter, comments);
    if (typeof common === "object") {
      title = common.title;
      continue;
    }
    if (common) continue;
    if (/^(left to right|top to bottom) direction$/i.test(t)) {
      direction = /^left/i.test(t) ? "LR" : "TB";
      ctx.reporter.mapped("plantuml.c4.direction");
      continue;
    }
    // `}` may share a line with what follows, as in `} Rel(a, b, "x")`.
    const parts = t.startsWith("}") && t.length > 1 ? ["}", t.slice(1).trim()] : [t];
    for (const part of parts) {
      statements.push({ text: part, span: lineSpan(line), comments: comments.take() });
    }
  }
  return {
    statements,
    ...(title !== undefined ? { title } : {}),
    comments: comments.take(),
    ...(direction !== undefined ? { direction } : {}),
  };
}
