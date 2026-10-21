export const PACKAGE_NAME = "@meltemi/diagrams-import";

export { importText, type ImportOptions } from "./import.js";
export {
  detectFormat,
  extensionOf,
  stemOf,
  IMPORT_EXTENSIONS,
  MERMAID_SUPPORTED,
  MERMAID_UNSUPPORTED,
} from "./detect.js";
export {
  IMPORT_CODES,
  type ConstructCount,
  type ConstructStatus,
  type DiagramCoverage,
  type ImportCode,
  type ImportedDiagram,
  type ImportedType,
  type ImportFinding,
  type ImportFormat,
  type ImportResult,
  type ImportStatus,
  type SourceFormat,
} from "./report.js";
export { markdownBlocks, type MarkdownBlock } from "./markdown.js";
export { sanitizeId, slugId } from "./ids.js";
export { mergeImport, type MergeResult } from "./merge.js";
export {
  COVERAGE_VERSIONS,
  coverageMarkdown,
  coverageNotes,
  isProseCell,
  coverageOf,
  MERMAID_COVERAGE,
  PLANTUML_COVERAGE,
  type CoverageEntry,
} from "./coverage.js";
