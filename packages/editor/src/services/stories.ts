import { isToken, type Range } from "@meltemi/diagrams-language";
import {
  STORY_ACTIONS,
  STORY_STATEMENTS,
  STORY_TRANSITIONS,
  SCENE_STATEMENTS,
  type FlowDiagram,
  type StoryAction,
  type StoryDefinition,
  type StoryReference,
  type StoryScene,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { entryOf, kindWord, serviceMessages } from "../messages/services.js";
import { tokenAt } from "../syntax.js";
import type { CompletionItem } from "./completion.js";
import { elementHover, eventHover, relationHover } from "./hover.js";
import type { SymbolNode } from "./navigation.js";

/**
 * What the story vocabulary means, in English. Hovers and completion details inside stories read
 * `storyDoc`, in the interface language.
 */
export const STORY_DOCS: Readonly<Record<string, string>> = serviceMessages("en").storyWords;

/** What a word of the story vocabulary means, in the interface language. */
function storyDoc(word: string): string | undefined {
  return entryOf(serviceMessages().storyWords, word);
}

const ID = "[A-Za-z_][A-Za-z0-9_]*";
const match = (prefix: string, pattern: string) => new RegExp(`^${pattern}$`).exec(prefix);

/** The story whose block contains `offset`. */
export function storyAt(analysis: DocumentAnalysis, offset: number): StoryDefinition | undefined {
  return analysis.compilation.document.stories.find(
    (s) => s.node.start <= offset && offset <= s.node.end,
  );
}

/** The scene of a story whose statement contains `offset`. */
export function storySceneAt(story: StoryDefinition, offset: number): StoryScene | undefined {
  return story.scenes.find((s) => s.node.start <= offset && offset <= s.node.end);
}

/** The view of the scene around `offset`, or the story's diagram between scenes. */
function viewAt(story: StoryDefinition, offset: number) {
  return (storySceneAt(story, offset) ?? { view: story.target }).view;
}

/** A target of a story under the cursor, with the diagram of its view. */
export interface StoryTargetAt {
  readonly story: StoryDefinition;
  readonly reference: StoryReference;
  /** The view's diagram, also for imported views. */
  readonly diagram: FlowDiagram | null;
}

export function storyTargetAt(
  analysis: DocumentAnalysis,
  offset: number,
): StoryTargetAt | undefined {
  for (const story of analysis.compilation.document.stories) {
    if (offset < story.node.start || offset > story.node.end) continue;
    const reference = story.references.find(
      (r) => r.range.start.offset <= offset && offset <= r.range.end.offset,
    );
    if (!reference) return undefined;
    return { story, reference, diagram: viewAt(story, offset).diagram };
  }
  return undefined;
}

/** The diagram name after `for` or `view` under the cursor, with its range and diagram. */
export function storyDiagramAt(
  analysis: DocumentAnalysis,
  offset: number,
): { range: Range; name: string; diagram: FlowDiagram | null; file: string | null } | undefined {
  const story = storyAt(analysis, offset);
  if (!story) return undefined;
  const lines = analysis.compilation.parse.lines;
  const target = story.node.target;
  if (target && target.kind === "QualifiedRef" && target.start <= offset && offset <= target.end) {
    return { ...story.target, range: lines.range(target) };
  }
  const scene = storySceneAt(story, offset);
  for (const statement of scene?.node.block?.statements ?? []) {
    if (statement.kind !== "KeywordStatement" || statement.keyword.text !== "view") continue;
    const ref = statement.args[0];
    if (ref?.kind === "QualifiedRef" && ref.start <= offset && offset <= ref.end) {
      return { ...scene!.view, range: lines.range(ref) };
    }
  }
  return undefined;
}

/** The references of the file's stories to an id of one of its diagrams. */
export function storyReferencesTo(
  analysis: DocumentAnalysis,
  diagram: string,
  id: string,
  kind: StoryReference["kind"],
): StoryReference[] {
  return analysis.compilation.document.stories.flatMap((s) =>
    s.references.filter(
      (r) => r.file === null && r.diagram === diagram && r.id === id && r.kind === kind,
    ),
  );
}

// ---------------------------------------------------------------------- completion

/** The diagrams a story or a scene can show: the file's and the imported names. */
function diagramNames(analysis: DocumentAnalysis): { label: string; detail: string }[] {
  const t = serviceMessages().completion;
  const names = analysis.compilation.document.diagrams
    .filter((d) => d.type !== "c4" || d.c4 !== null)
    .map((d) => ({ label: d.id, detail: t.diagram(d.type) }));
  for (const declaration of analysis.compilation.document.imports) {
    for (const binding of declaration.bindings) {
      names.push({
        label: declaration.form === "namespace" ? `${binding.name}.` : binding.name,
        detail: t.imported,
      });
    }
  }
  return names;
}

/** Elements, named relations and named notes or fragments of a view. */
function viewTargets(
  diagram: FlowDiagram | null,
  range: CompletionItem["range"],
  relationsOnly = false,
): CompletionItem[] {
  if (!diagram) return [];
  const relations: CompletionItem[] = diagram.relations
    .filter((r) => r.id !== null)
    .map((r) => ({ label: r.id!, kind: "relation", detail: `${r.from} -> ${r.to}`, range }));
  if (relationsOnly) return relations;
  return [
    ...diagram.elements.map((e): CompletionItem => ({
      label: e.id,
      kind: e.kind === "group" ? "group" : "element",
      detail: `${kindWord(e.kind)} · ${e.label}`,
      range,
    })),
    ...relations,
    ...[...diagram.eventsByKey.values()]
      .filter((e) => e.id !== null && e.kind !== "message")
      .map((e): CompletionItem => ({
        label: e.id!,
        kind: "element",
        detail: kindWord(e.kind),
        range,
      })),
  ];
}

function storyWords(
  values: readonly string[],
  kind: CompletionItem["kind"],
  range: CompletionItem["range"],
): CompletionItem[] {
  return values.map((label) => {
    const detail = storyDoc(label);
    return detail ? { label, kind, detail, range } : { label, kind, range };
  });
}

/** The start of a dotted id being typed before `offset`. */
function dottedStart(text: string, offset: number): number {
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_.]/.test(text[start - 1]!)) start--;
  return start;
}

/** `story <id> for <diagram>` at the top level. */
export function storyHeaderCompletions(
  analysis: DocumentAnalysis,
  prefix: string,
  offset: number,
): CompletionItem[] | undefined {
  if (match(prefix, `story\\s+${ID}\\s+\\w*`)) {
    return storyWords(["for"], "keyword", {
      start: offset - /\w*$/.exec(prefix)![0].length,
      end: offset,
    });
  }
  if (match(prefix, `story\\s+${ID}\\s+for\\s+[\\w.]*`)) {
    const range = { start: dottedStart(analysis.text, offset), end: offset };
    return diagramNames(analysis).map((n) => ({
      label: n.label,
      kind: "value",
      detail: n.detail,
      range,
    }));
  }
  return undefined;
}

/** Completion in a story, a scene or a `parallel` block. */
export function storyCompletions(
  analysis: DocumentAnalysis,
  scope: "story" | "scene" | "parallel",
  prefix: string,
  range: CompletionItem["range"],
  offset: number,
): CompletionItem[] {
  if (scope === "story") {
    return prefix === "" || match(prefix, ID) ? storyWords(STORY_STATEMENTS, "keyword", range) : [];
  }
  const story = storyAt(analysis, offset);
  const view = story ? viewAt(story, offset).diagram : null;
  const dotted = { start: dottedStart(analysis.text, offset), end: offset };
  if (scope === "scene" && match(prefix, `view\\s+[\\w.]*`)) {
    return diagramNames(analysis).map((n) => ({
      label: n.label,
      kind: "value",
      detail: n.detail,
      range: dotted,
    }));
  }
  if (scope === "scene" && match(prefix, `transition\\s+\\w*`)) {
    return storyWords(STORY_TRANSITIONS, "value", range);
  }
  if (scope === "scene" && match(prefix, `transition\\s+(fade|morph)\\s+\\w*`)) {
    return storyWords(["over"], "keyword", range);
  }
  if (match(prefix, `trace\\s+[\\w.]*`)) return viewTargets(view, dotted, true);
  if (match(prefix, `trace\\s+[\\w.]+\\s+\\w*`)) return storyWords(["over"], "keyword", range);
  const action = /^(reveal|hide|highlight|focus|camera)\s+((?:[\w.]+\s*,\s*)*)([\w.]*)$/.exec(
    prefix,
  );
  if (action) {
    const listed = new Set(
      action[2]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
    );
    const all = (action[1] === "focus" || action[1] === "camera") && listed.size === 0;
    return [
      ...(all ? storyWords(["all"], "keyword", dotted) : []),
      ...viewTargets(view, dotted).filter((i) => !listed.has(i.label)),
    ];
  }
  if (match(prefix, `(reveal|hide|highlight|focus|camera)\\s+[\\w.]+(\\s*,\\s*[\\w.]+)*\\s+\\w*`)) {
    return storyWords(["over"], "keyword", range);
  }
  if (prefix === "" || match(prefix, ID)) {
    return storyWords(
      scope === "scene" ? [...SCENE_STATEMENTS, ...STORY_ACTIONS] : STORY_ACTIONS,
      "keyword",
      range,
    );
  }
  return [];
}

// ---------------------------------------------------------------------- hover

/** A time for people, in the interface language: `800 ms`, `0 s`, `1.25 s`. */
const seconds = (ms: number) => serviceMessages().time(ms);

function allActions(scene: StoryScene): StoryAction[] {
  const out: StoryAction[] = [];
  const visit = (a: StoryAction) => {
    out.push(a);
    a.children.forEach(visit);
  };
  scene.actions.forEach(visit);
  return out;
}

function viewLabel(view: { name: string; file: string | null }): string {
  return view.file === null ? `\`${view.name}\`` : `\`${view.name}\`${serviceMessages().imported}`;
}

/** Hovers inside a story: ids, targets, diagram names and the story vocabulary. */
export function storyHover(
  analysis: DocumentAnalysis,
  offset: number,
): { range: Range; markdown: string } | undefined {
  const story = storyAt(analysis, offset);
  if (!story) return undefined;
  const words = serviceMessages();
  const t = words.story;
  const lines = analysis.compilation.parse.lines;
  const target = storyTargetAt(analysis, offset);
  if (target) {
    const { reference, diagram } = target;
    const range = reference.range;
    if (!diagram) return { range, markdown: t.unresolvedView(reference.id) };
    const where = t.inView(viewLabel({ name: diagram.id, file: reference.file }));
    if (reference.kind === "relation") {
      const relation = diagram.relationsByKey.get(reference.id);
      if (relation) return { range, markdown: `${relationHover(diagram, relation)}\n\n${where}` };
    } else if (reference.kind === "event") {
      const event = diagram.eventsByKey.get(reference.id);
      if (event) return { range, markdown: `${eventHover(diagram, event)}\n\n${where}` };
    } else {
      const element = diagram.elementsById.get(reference.id);
      if (element) {
        const markdown =
          reference.file === null
            ? elementHover(analysis, diagram, element)
            : `**${kindWord(element.kind)}** \`${element.id}\` — ${element.label}`;
        return { range, markdown: `${markdown}\n\n${where}` };
      }
    }
  }
  const named = storyDiagramAt(analysis, offset);
  if (named) {
    return {
      range: named.range,
      markdown: named.diagram
        ? `${words.headings.diagram(named.diagram.type, named.diagram.id)}${named.diagram.properties.title ? ` — ${named.diagram.properties.title}` : ""}${named.file !== null ? words.imported : ""}`
        : words.headings.unresolvedDiagram(named.name),
    };
  }
  if (story.idRange.start.offset <= offset && offset <= story.idRange.end.offset) {
    return {
      range: story.idRange,
      markdown: [
        `${words.headings.story(story.id)}${story.title ? ` — ${story.title}` : ""}`,
        "",
        t.summary(seconds(story.durationMs), story.scenes.length, viewLabel(story.target)),
        ...(story.description ? ["", story.description] : []),
      ].join("\n"),
    };
  }
  const scene = storySceneAt(story, offset);
  if (scene && scene.idRange.start.offset <= offset && offset <= scene.idRange.end.offset) {
    return {
      range: scene.idRange,
      markdown: [
        `${words.headings.scene(scene.id)}${scene.title ? ` — ${scene.title}` : ""}`,
        "",
        t.span(
          seconds(scene.startMs),
          seconds(scene.startMs + scene.durationMs),
          viewLabel(scene.view),
          scene.transition ? scene.transition.kind : null,
        ),
      ].join("\n"),
    };
  }
  const token = tokenAt(analysis.compilation.parse.root, offset);
  if (!token || !isToken(token) || token.kind !== "Identifier") return undefined;
  const doc = storyDoc(token.text);
  if (!doc) return undefined;
  // Action keywords add their place on the clock.
  const action = scene ? allActions(scene).find((a) => a.node.keyword === token) : undefined;
  const timing = action
    ? `\n\n${t.timing(
        seconds(action.startMs),
        seconds(action.durationMs),
        action.writtenMs === null && action.kind !== "parallel",
      )}`
    : scene?.transition?.node.keyword === token
      ? `\n\n${t.timing(seconds(scene.transition.startMs), seconds(scene.transition.durationMs), false)}`
      : "";
  return { range: lines.range(token), markdown: `**${token.text}** — ${doc}${timing}` };
}

// ---------------------------------------------------------------------- outline

/** Stories with their scenes. */
export function storySymbols(analysis: DocumentAnalysis): SymbolNode[] {
  return analysis.compilation.document.stories.map((story) => ({
    name: story.id,
    detail: story.title ?? serviceMessages().story.symbol(seconds(story.durationMs)),
    kind: "story",
    range: story.range,
    selectionRange: story.idRange,
    children: story.scenes.map((scene) => ({
      name: scene.id,
      detail:
        scene.title ?? `${seconds(scene.startMs)} – ${seconds(scene.startMs + scene.durationMs)}`,
      kind: "scene",
      range: scene.range,
      selectionRange: scene.idRange,
      children: [],
    })),
  }));
}
