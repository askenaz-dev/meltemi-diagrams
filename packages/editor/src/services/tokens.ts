import type { Range } from "@meltemi/diagrams-language";
import type { ClassUse, RouteEntry } from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";

export const SEMANTIC_TOKEN_TYPES = [
  "variable",
  "namespace",
  "function",
  "property",
  "class",
  "type",
] as const;
export const SEMANTIC_TOKEN_MODIFIERS = ["declaration"] as const;

export type SemanticTokenType = (typeof SEMANTIC_TOKEN_TYPES)[number];

export interface SemanticToken {
  readonly start: number;
  readonly length: number;
  readonly type: SemanticTokenType;
  readonly declaration: boolean;
}

/** Ids, ports, classes and themes, classified for semantic highlighting, in order. */
export function semanticTokens(analysis: DocumentAnalysis): SemanticToken[] {
  const tokens = new Map<number, SemanticToken>();
  const add = (start: number, end: number, type: SemanticTokenType, declaration = false) => {
    if (end > start && !tokens.has(start))
      tokens.set(start, { start, length: end - start, type, declaration });
  };
  const addRange = (range: Range, type: SemanticTokenType, declaration = false) =>
    add(range.start.offset, range.end.offset, type, declaration);
  const addClasses = (uses: readonly ClassUse[]) => {
    for (const use of uses) addRange(use.range, "class");
  };

  for (const model of analysis.compilation.document.models) {
    addRange(model.idRange, "namespace", true);
    for (const reference of model.references) {
      add(reference.token.start, reference.token.end, "variable", reference.role === "declaration");
    }
  }
  for (const diagram of analysis.compilation.document.diagrams) {
    // Entity paths of views and links, part by part.
    for (const reference of diagram.entityReferences) {
      add(reference.token.start, reference.token.end, "variable");
    }
    if (diagram.c4) addRange(diagram.c4.modelRange, "namespace");
    for (const reference of diagram.references) {
      const declaration = reference.role === "declaration" || reference.role === "relation-id";
      let type: SemanticTokenType = "function";
      if (reference.targetKind === "element") {
        type =
          diagram.elementsById.get(reference.target)?.kind === "group" ? "namespace" : "variable";
      }
      add(reference.token.start, reference.token.end, type, declaration);
    }
    for (const element of diagram.elements) {
      for (const port of element.ports) addRange(port.nameRange, "property", true);
      addClasses(element.classes);
      if (element.layerRange) addRange(element.layerRange, "property");
    }
    for (const relation of diagram.relations) {
      addClasses(relation.classes);
      if (relation.layerRange) addRange(relation.layerRange, "property");
    }
    for (const range of diagram.layerRanges.values()) addRange(range, "property", true);
    for (const link of diagram.links) {
      if (link.binding !== null) {
        const start = link.range.start.offset;
        add(start, start + link.binding.length, "namespace");
      }
      addRange(link.diagramRange, "namespace");
      addRange(link.elementRange, "variable");
    }
    for (const style of diagram.styles) addClasses(style.classes);
    for (const definition of diagram.classes) addRange(definition.idRange, "class", true);
    for (const scenario of diagram.scenarios) addRange(scenario.idRange, "type", true);
    for (const entry of diagram.placement) {
      if (entry.statement !== "route") continue;
      const route = entry as RouteEntry;
      for (const [end, index] of [
        [route.from, 2],
        [route.to, 4],
      ] as const) {
        if (!end.named) continue;
        const arg = route.node.args[index];
        if (arg?.kind === "QualifiedRef" && arg.parts[1])
          add(arg.parts[1].start, arg.parts[1].end, "property");
      }
    }
    const theme = diagram.block?.statements.find(
      (s) => s.kind === "KeywordStatement" && s.keyword.text === "theme",
    );
    if (theme?.kind === "KeywordStatement" && theme.args[0]?.kind === "StringLiteral") {
      add(theme.args[0].start, theme.args[0].end, "type");
    }
  }
  for (const story of analysis.compilation.document.stories) {
    addRange(story.idRange, "type", true);
    const target = story.node.target;
    if (target && target.kind === "QualifiedRef") add(target.start, target.end, "namespace");
    for (const scene of story.scenes) {
      addRange(scene.idRange, "type", true);
      for (const statement of scene.node.block?.statements ?? []) {
        const view = statement.kind === "KeywordStatement" && statement.keyword.text === "view";
        const ref = view ? statement.args[0] : undefined;
        if (ref?.kind === "QualifiedRef") add(ref.start, ref.end, "namespace");
      }
    }
    // Entity paths part by part, then the other targets.
    for (const reference of story.entityReferences) {
      add(reference.token.start, reference.token.end, "variable");
    }
    for (const reference of story.references) {
      addRange(reference.range, reference.kind === "relation" ? "function" : "variable");
    }
  }
  for (const profile of analysis.compilation.document.exports) {
    addRange(profile.idRange, "type", true);
    const target = profile.node.target;
    if (target && target.kind === "QualifiedRef") add(target.start, target.end, "namespace");
  }
  for (const theme of analysis.compilation.document.themes) {
    addRange(theme.idRange, "type", true);
    for (const definition of theme.classes) addRange(definition.idRange, "class", true);
  }
  return [...tokens.values()].sort((a, b) => a.start - b.start);
}
