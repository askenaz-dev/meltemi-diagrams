import type { ImportFormat } from "./report.js";

const EXTENSIONS: Record<string, ImportFormat> = {
  mmd: "mermaid",
  mermaid: "mermaid",
  puml: "plantuml",
  plantuml: "plantuml",
  pu: "plantuml",
  iuml: "plantuml",
  wsd: "plantuml",
  md: "markdown",
  markdown: "markdown",
};

/** File extensions the importers read, without the dot. */
export const IMPORT_EXTENSIONS: readonly string[] = Object.keys(EXTENSIONS);

/** Mermaid diagram keywords the importer maps, and the type each becomes. */
export const MERMAID_SUPPORTED: Readonly<Record<string, string>> = {
  flowchart: "flowchart",
  graph: "flowchart",
  sequenceDiagram: "sequence",
  C4Context: "c4",
  C4Container: "c4",
  C4Component: "c4",
  C4Dynamic: "c4",
  "architecture-beta": "architecture",
  architecture: "architecture",
  "block-beta": "block",
  block: "block",
};

/** Mermaid diagram keywords that are recognised but not imported. */
export const MERMAID_UNSUPPORTED: readonly string[] = [
  "classDiagram",
  "classDiagram-v2",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "mindmap",
  "timeline",
  "sankey-beta",
  "sankey",
  "xychart-beta",
  "xychart",
  "packet-beta",
  "packet",
  "kanban",
  "radar-beta",
  "treemap-beta",
  "treemap",
  "C4Deployment",
  "zenuml",
  "info",
];

/** The extension of a file name, lower case and without the dot. */
export function extensionOf(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The file name without folders and extension. */
export function stemOf(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/** The first word of the first significant line of a Mermaid source, after front matter. */
export function mermaidKeyword(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (lines[i]?.trim() === "---") {
    i++;
    while (i < lines.length && lines[i]!.trim() !== "---") i++;
    i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "" || line.startsWith("%%")) continue;
    const word = /^[A-Za-z][A-Za-z0-9-]*/.exec(line)?.[0];
    return word ?? null;
  }
  return null;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*\{?[ \t]*(mermaid|plantuml|puml)\b/im;

/**
 * The format of a source: by extension when the name has a known one, otherwise by content.
 * Returns `null` when neither tells.
 */
export function detectFormat(text: string, fileName?: string): ImportFormat | null {
  if (fileName) {
    const byExtension = EXTENSIONS[extensionOf(fileName)];
    if (byExtension) return byExtension;
  }
  if (/^\s*@start[a-z]+\b/im.test(text)) {
    // A Markdown file can quote PlantUML in a fenced block; fences win.
    return FENCE.test(text) ? "markdown" : "plantuml";
  }
  const keyword = mermaidKeyword(text);
  if (keyword && (keyword in MERMAID_SUPPORTED || MERMAID_UNSUPPORTED.includes(keyword))) {
    return "mermaid";
  }
  if (FENCE.test(text)) return "markdown";
  return null;
}
