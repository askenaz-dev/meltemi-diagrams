import { type Library } from "@meltemi/diagrams-assets";
import type { IconRegistry } from "@meltemi/diagrams-assets";
import { sortDiagnostics, type Diagnostic } from "@meltemi/diagrams-language";
import { layoutDiagram, type LayoutOptions, type LayoutResult } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import {
  compile,
  type Compilation,
  type FlowDiagram,
  type LayoutMode,
  type ThemeDefinition,
} from "@meltemi/diagrams-model";
import type { FontProvider } from "@meltemi/diagrams-render";

/** One flow or free diagram of an analysed document. */
export interface DiagramView {
  readonly id: string;
  readonly title: string | null;
  readonly mode: LayoutMode;
  readonly diagram: FlowDiagram;
  /** The layout with the document's options; null when the diagram has compile errors. */
  readonly layout: LayoutResult | null;
}

/** Everything the services and the canvas need about one version of a document. */
export interface DocumentAnalysis {
  readonly text: string;
  readonly revision: number;
  readonly compilation: Compilation;
  /** Compile, module, project and layout diagnostics, deduplicated and sorted. */
  readonly diagnostics: readonly Diagnostic[];
  readonly diagrams: readonly DiagramView[];
  readonly layoutOptions: LayoutOptions;
  /** Themes in scope for the document: its own and the imported ones. */
  readonly themes: readonly ThemeDefinition[];
  readonly icons: IconRegistry | undefined;
  /** The element libraries the document can create from: built-in, project and plugin ones. */
  readonly libraries: readonly Library[];
  /** Embeds fonts in rendered SVG; the same library that measures text. */
  readonly fonts: FontProvider | undefined;
  readonly formatOptions: { readonly indent: number | "tab" };
  /** Image files of the project, relative to the document, for completion. */
  readonly imageFiles: (() => readonly string[]) | undefined;
  /** Lays out a diagram of another file of the project, for stories that show it. */
  readonly importedView: ImportedViews | undefined;
}

/** A diagram of another file and its layout with that file's themes and assets. */
export type ImportedViews = (
  file: string,
  diagram: string,
) => { readonly diagram: FlowDiagram; readonly layout: LayoutResult } | undefined;

export interface AnalysisInput {
  readonly text: string;
  readonly revision?: number;
  /** The compilation of `text`, for example inside a project; compiled alone by default. */
  readonly compilation?: Compilation;
  /** Diagnostics of the compilation and its project; the compilation's own by default. */
  readonly diagnostics?: readonly Diagnostic[];
  /** Layout options; the ELK engine is used when no engine is given. */
  readonly layout?: LayoutOptions;
  readonly icons?: IconRegistry;
  /** The libraries, or how to build them: built when first asked for, not on every analysis. */
  readonly libraries?: readonly Library[] | (() => readonly Library[]);
  readonly fonts?: FontProvider;
  readonly formatOptions?: { readonly indent: number | "tab" };
  /** Lists the project's image files relative to the document. */
  readonly imageFiles?: () => readonly string[];
  /** Lays out diagrams of other files of the project, for stories. */
  readonly importedView?: ImportedViews;
}

let defaultEngine: ReturnType<typeof createElkEngine> | undefined;

const key = (d: Diagnostic) => `${d.code}@${d.range.start.offset}:${d.range.end.offset}`;

/** Compiles (unless given a compilation), lays out every diagram and merges diagnostics. */
export function analyzeDocument(input: AnalysisInput): DocumentAnalysis {
  const compilation = input.compilation ?? compile(input.text);
  const layoutOptions: LayoutOptions = {
    ...input.layout,
    engine: input.layout?.engine ?? (defaultEngine ??= createElkEngine()),
  };
  const diagnostics = [...(input.diagnostics ?? compilation.diagnostics)];
  const seen = new Set(diagnostics.map(key));
  const diagrams = compilation.document.diagrams.map((diagram): DiagramView => {
    const layout = diagram.hasErrors ? null : layoutDiagram(compilation, diagram, layoutOptions);
    for (const d of layout?.diagnostics ?? []) {
      if (seen.has(key(d))) continue;
      seen.add(key(d));
      diagnostics.push(d);
    }
    return {
      id: diagram.id,
      title: diagram.properties.title,
      mode: diagram.properties.layout,
      diagram,
      layout,
    };
  });
  const given = input.libraries ?? [];
  let libraries: readonly Library[] | undefined = typeof given === "function" ? undefined : given;
  return {
    text: input.text,
    revision: input.revision ?? 0,
    compilation,
    diagnostics: sortDiagnostics(diagnostics),
    diagrams,
    layoutOptions,
    themes: layoutOptions.themes ?? compilation.document.themes,
    icons: input.icons,
    // Libraries read packs' categories (Tabler's are a 2 MB file): only the panel needs them.
    get libraries(): readonly Library[] {
      libraries ??= (given as () => readonly Library[])();
      return libraries;
    },
    fonts: input.fonts,
    formatOptions: input.formatOptions ?? { indent: 2 },
    imageFiles: input.imageFiles,
    importedView: input.importedView,
  };
}

/** The view of a diagram by id. */
export function diagramView(analysis: DocumentAnalysis, id: string): DiagramView | undefined {
  return analysis.diagrams.find((d) => d.id === id);
}
