import type { Span } from "@meltemi/diagrams-language";
import { readC4, type C4Level, type C4Statement } from "../c4.js";
import { MERMAID_SUPPORTED, MERMAID_UNSUPPORTED } from "../detect.js";
import type { FrontContext, FrontOutcome } from "../front.js";
import { messages } from "../messages/index.js";
import type { SourceLine } from "../report.js";
import type { Sheet } from "../writer.js";
import { ArchitectureReader } from "./architecture.js";
import { BlockReader } from "./block.js";
import { splitStatements, yamlScalar, type Statement } from "./common.js";
import { FlowchartReader } from "./flowchart.js";
import { SequenceReader } from "./sequence.js";

const C4_LEVELS: Readonly<Record<string, C4Level>> = {
  C4Context: "context",
  C4Container: "container",
  C4Component: "component",
  C4Dynamic: "container",
};

/**
 * Imports one Mermaid diagram from its lines. `key` names the diagram for the reporter until its
 * id is known.
 */
export function importMermaid(
  ctx: FrontContext,
  lines: readonly SourceLine[],
  key: string,
): FrontOutcome {
  const r = ctx.reporter;
  r.begin(key);
  const whole: Span = {
    start: lines[0]?.span.start ?? 0,
    end: lines[lines.length - 1]?.span.end ?? 0,
  };
  // Front matter.
  let i = 0;
  while (i < lines.length && lines[i]!.text.trim() === "") i++;
  let title: string | undefined;
  if (lines[i]?.text.trim() === "---") {
    const open = lines[i]!;
    let j = i + 1;
    let inConfig = false;
    for (; j < lines.length && lines[j]!.text.trim() !== "---"; j++) {
      const line = lines[j]!;
      const top = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.text);
      if (top && !/^\s/.test(line.text)) {
        inConfig = top[1] === "config";
        if (top[1] === "title") {
          title = yamlScalar(top[2]!);
          r.mapped("mermaid.frontmatter.title");
        } else if (top[1] === "config") {
          r.dropped("mermaid.config", line.span, messages().mermaid.config);
        } else
          r.dropped("mermaid.frontmatter", line.span, messages().mermaid.frontMatterField(top[1]!));
      } else if (!inConfig && line.text.trim() !== "") {
        r.dropped("mermaid.frontmatter", line.span, messages().mermaid.frontMatterLine);
      }
    }
    if (j >= lines.length) {
      r.syntax("mermaid.frontmatter", open.span, messages().mermaid.frontMatterNotClosed);
      return { failed: true, key };
    }
    i = j + 1;
  }
  const body = lines.slice(i);
  for (const line of body) {
    if (/^\s*%%\{/.test(line.text)) {
      r.dropped("mermaid.init", line.span, messages().mermaid.init);
    }
  }
  const keywordIndex = body.findIndex((l) => {
    const t = l.text.trim();
    return t !== "" && !t.startsWith("%%");
  });
  if (keywordIndex < 0) {
    r.add({
      code: "import.unsupported-diagram",
      severity: "error",
      message: messages().mermaid.noDiagram,
      span: whole,
      construct: "mermaid.diagram",
      status: "dropped",
      essential: true,
    });
    return { failed: true, key };
  }
  const headerLine = body[keywordIndex]!;
  const keyword = /^[A-Za-z][A-Za-z0-9-]*/.exec(headerLine.text.trim())?.[0] ?? "";
  const type = MERMAID_SUPPORTED[keyword];
  if (!type) {
    const known = MERMAID_UNSUPPORTED.includes(keyword);
    r.add({
      code: "import.unsupported-diagram",
      severity: "error",
      message: known
        ? messages().mermaid.unsupported(keyword)
        : messages().mermaid.notADiagramType(keyword || headerLine.text.trim()),
      span: headerLine.span,
      construct: `mermaid.${keyword || "unknown"}`,
      status: "dropped",
      essential: true,
      hints: [messages().mermaid.supportedHint],
    });
    return { failed: true, key };
  }
  const header: Statement = {
    text: headerLine.text.trim(),
    span: headerLine.span,
    offset: headerLine.start + (headerLine.text.length - headerLine.text.trimStart().length),
    comments: [],
  };
  const comments = commentsBefore(body.slice(0, keywordIndex));
  const rest = body.slice(keywordIndex + 1);
  let sheet: Sheet;
  switch (type) {
    case "flowchart": {
      const reader = new FlowchartReader(ctx, key);
      reader.header(header);
      const { statements, trailing } = splitStatements(rest);
      for (const st of statements) reader.statement(st);
      sheet = reader.finish();
      sheet.trailing.push(...trailing);
      break;
    }
    case "sequence": {
      const reader = new SequenceReader(ctx, key);
      const { statements, trailing } = splitStatements(rest);
      for (const st of statements) reader.statement(st);
      sheet = reader.finish();
      sheet.trailing.push(...trailing);
      break;
    }
    case "architecture": {
      const reader = new ArchitectureReader(ctx, key);
      const { statements, trailing } = splitStatements(rest, { braces: false });
      for (const st of statements) reader.statement(st);
      sheet = reader.finish();
      sheet.trailing.push(...trailing);
      break;
    }
    case "block": {
      const reader = new BlockReader(ctx, key);
      const { statements, trailing } = splitStatements(rest, { braces: false });
      for (const st of statements) reader.statement(st);
      sheet = reader.finish();
      sheet.trailing.push(...trailing);
      break;
    }
    default: {
      const { statements, trailing } = splitStatements(rest, { braces: false, semicolons: false });
      const c4: C4Statement[] = [];
      for (const st of statements) {
        if (/^title\s/.test(st.text)) {
          title = st.text.replace(/^title\s+/, "").trim();
          r.mapped("mermaid.c4.title");
        } else if (/^accTitle\s*:/.test(st.text)) {
          title ??= st.text.replace(/^accTitle\s*:/, "").trim();
          r.mapped("mermaid.accTitle");
        } else if (/^accDescr\b/.test(st.text)) {
          r.dropped("mermaid.accDescr", st.span, messages().mermaid.c4Description);
        } else c4.push(st);
      }
      sheet = readC4(ctx, c4, {
        level: C4_LEVELS[keyword] ?? null,
        dynamic: keyword === "C4Dynamic",
        ...(title !== undefined ? { title } : {}),
        span: header.span,
        construct: "mermaid.c4",
      });
      sheet.trailing.push(...trailing);
      title = undefined;
    }
  }
  if (title !== undefined && sheet.type !== "c4") sheet.title ??= title;
  sheet.comments.unshift(...comments);
  return {
    sheet,
    format: "mermaid",
    kind: keyword,
    span: whole,
    key,
  };
}

function commentsBefore(lines: readonly SourceLine[]): string[] {
  return lines
    .map((l) => l.text.trim())
    .filter((t) => t.startsWith("%%") && !t.startsWith("%%{"))
    .map((t) => t.slice(2).trim());
}
