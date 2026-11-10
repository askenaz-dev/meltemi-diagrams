import {
  applyTextEdits,
  isIdentifierText,
  isToken,
  type Block,
  type KeywordStatement,
  type TextEdit,
  type Token,
  type Trivia,
} from "@meltemi/diagrams-language";
import {
  compile,
  STORY_MAX_TIME,
  singleIdent,
  storyTargetKind,
  type Compilation,
  type StoryAction,
  type StoryDefinition,
  type StoryReference,
  type StoryScene,
  type TargetKind,
} from "@meltemi/diagrams-model";
import { reject, insertStatement, type TextContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { appendBlock, newStoryId, topLevelNames } from "./diagrams.js";
import { commentsAbove, insertAfter, verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import {
  firstTokenOf,
  formatNumber,
  isCommentTrivia,
  lineIndent,
  lineStart,
  quoteString,
} from "./text.js";
import type { Dependent } from "./types.js";

/** The story references of a file to an id of one of its diagrams. */
export function storyReferences(
  compilation: Compilation,
  diagram: string,
  id: string,
  kind?: TargetKind,
): StoryReference[] {
  return compilation.document.stories.flatMap((story) =>
    story.references.filter(
      (r) =>
        r.file === null &&
        r.diagram === diagram &&
        r.id === id &&
        (kind === undefined || r.kind === kind),
    ),
  );
}

/** Edits that rename an id of a diagram in the stories of the same file. */
export function renameInStories(
  compilation: Compilation,
  diagram: string,
  id: string,
  newId: string,
  kind?: TargetKind,
): TextEdit[] {
  return storyReferences(compilation, diagram, id, kind).map((r) => ({
    start: r.range.start.offset,
    end: r.range.end.offset,
    newText: newId,
  }));
}

/** The target arguments of an action: those before `over`. */
function targetArgs(action: StoryAction): KeywordStatement["args"] {
  const args = action.node.args;
  const over = args.findIndex((a) => singleIdent(a)?.text === "over");
  return over < 0 ? args : args.slice(0, over);
}

/**
 * Story actions that name removed ids of a diagram: an action left without targets is deleted, the
 * others lose the removed targets.
 */
export function storyDependents(
  compilation: Compilation,
  diagram: string,
  removed: ReadonlySet<string>,
): { statements: KeywordStatement[]; edits: TextEdit[]; dependents: Dependent[] } {
  const statements: KeywordStatement[] = [];
  const edits: TextEdit[] = [];
  const dependents: Dependent[] = [];
  // True when the action goes as a whole.
  const visit = (action: StoryAction, story: string): boolean => {
    if (action.kind === "parallel") {
      const before = statements.length;
      const gone = action.children.filter((child) => visit(child, story)).length;
      if (gone === 0 || gone < action.children.length) return false;
      // A parallel block left empty goes with its actions.
      statements.splice(before, statements.length - before, action.node);
      return true;
    }
    if (action.targets.length === 0) return false;
    const gone = action.targets.filter((t) => removed.has(t.id));
    if (gone.length === 0) return false;
    dependents.push({
      kind: "story",
      name: story,
      description: messages().dependents.storyAction(action.kind, story, action.range.start.line),
      range: action.range,
    });
    if (gone.length === action.targets.length) {
      statements.push(action.node);
      return true;
    }
    const args = targetArgs(action);
    const indexes = new Set(
      gone.map((t) => args.findIndex((a) => a.start === t.range.start.offset)),
    );
    edits.push(...removeListItems(args, indexes));
    return false;
  };
  for (const story of compilation.document.stories) {
    for (const scene of story.scenes) {
      if (scene.view.file !== null || scene.view.diagram?.id !== diagram) continue;
      for (const action of scene.actions) visit(action, story.id);
    }
  }
  return { statements, edits, dependents };
}

// ---------------------------------------------------------------------- story operations

export function requireStory(ctx: TextContext, id: string): StoryDefinition {
  const story = ctx.compilation.document.stories.find((s) => s.id === id);
  if (!story) {
    const ids = ctx.compilation.document.stories.map((s) => s.id);
    reject("edit.unsafe-target", reasons().stories.missing(id, ids));
  }
  return story;
}

export function requireScene(story: StoryDefinition, id: string): StoryScene {
  const scene = story.scenes.find((s) => s.id === id);
  if (!scene) reject("edit.unsafe-target", reasons().stories.noScene(story.id, id));
  return scene;
}

function sceneAt(story: StoryDefinition, index: number | undefined): StoryScene {
  const scene = index === undefined ? undefined : story.scenes[index];
  if (!scene) reject("edit.unsafe-target", reasons().stories.noSceneAt(story.id, index));
  return scene;
}

/** The action at a path: scene index, then action indexes through `parallel` blocks. */
function actionAt(story: StoryDefinition, path: readonly number[]): StoryAction {
  const scene = sceneAt(story, path[0]);
  let actions = scene.actions;
  let action: StoryAction | undefined;
  for (const index of path.slice(1)) {
    action = actions[index];
    if (!action) break;
    actions = action.children;
  }
  if (!action || path.length < 2) {
    reject("edit.unsafe-target", reasons().stories.noAction(scene.id, path));
  }
  return action;
}

/** The edits, once they are known to add no errors to the file. */
export function checked(ctx: TextContext, edits: TextEdit[]): TextEdit[] {
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function storyTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0 || ms > STORY_MAX_TIME) {
    reject("edit.invalid-value", reasons().stories.timeRange(STORY_MAX_TIME));
  }
  return `${formatNumber(Math.round(ms))}ms`;
}

/** Replaces the written time of a statement, or writes ` over <time>` after its arguments. */
function timeEdit(
  statement: KeywordStatement,
  timeRange: StoryAction["timeRange"],
  time: string,
  keyword: "over" | null,
): TextEdit {
  if (timeRange) return { start: timeRange.start.offset, end: timeRange.end.offset, newText: time };
  const last = statement.args[statement.args.length - 1];
  const end = last?.end ?? statement.keyword.end;
  // `over` written without a time.
  if (keyword === null || singleIdent(last)?.text === "over")
    return { start: end, end, newText: ` ${time}` };
  return { start: end, end, newText: ` ${keyword} ${time}` };
}

export function setStoryTiming(ctx: TextContext, op: OperationOf<"setStoryTiming">): TextEdit[] {
  const story = requireStory(ctx, op.story);
  const time = storyTime(op.durationMs);
  if (op.path.length === 1) {
    const scene = sceneAt(story, op.path[0]);
    const transition = scene.transition;
    if (!transition) reject("edit.unsafe-target", reasons().stories.noTransition(scene.id));
    if (transition.kind === "cut") reject("edit.invalid-value", reasons().stories.cut);
    return checked(ctx, [timeEdit(transition.node, transition.timeRange, time, "over")]);
  }
  const action = actionAt(story, op.path);
  if (action.kind === "parallel") {
    reject("edit.invalid-value", reasons().stories.parallel);
  }
  return checked(ctx, [
    timeEdit(action.node, action.timeRange, time, action.kind === "hold" ? null : "over"),
  ]);
}

/** Sets a scene's total by its ending pause, preserving its timed content. */
export function setSceneDuration(
  ctx: TextContext,
  op: OperationOf<"setSceneDuration">,
): TextEdit[] {
  const story = requireStory(ctx, op.story);
  const scene = requireScene(story, op.scene);
  const final = scene.actions.at(-1);
  const hold = final?.kind === "hold" ? final : undefined;
  const previous = story.scenes[scene.index - 1];
  const following = story.scenes[scene.index + 1];
  const incoming = previous
    ? Math.max(0, previous.startMs + previous.durationMs - scene.startMs)
    : 0;
  const outgoing = following
    ? Math.max(0, scene.startMs + scene.durationMs - following.startMs)
    : 0;
  const actionEnd = final
    ? final.startMs + final.durationMs - scene.startMs
    : incoming > 0
      ? 0
      : (scene.transition?.durationMs ?? 0);
  const prefix = hold ? hold.startMs - scene.startMs : actionEnd;
  const minimum = Math.max(prefix, scene.transition?.durationMs ?? 0, incoming, outgoing);
  if (!Number.isFinite(op.durationMs) || op.durationMs < minimum) {
    reject("edit.invalid-value", reasons().stories.sceneMinimum(scene.id, minimum));
  }
  if (op.durationMs === scene.durationMs) return [];
  const next = Math.round(op.durationMs) - prefix;
  const time = storyTime(next);
  if (hold) {
    return checked(ctx, [timeEdit(hold.node, hold.timeRange, time, null)]);
  }
  if (next === 0) return [];
  const block = scene.node.block;
  if (!block) reject("edit.unsafe-target", reasons().stories.sceneNoBlock(scene.id));
  return checked(ctx, [insertStatement(ctx, block, scene.node.start, () => `hold ${time}`)]);
}

/** Removes a source story without deleting its diagrams or unrelated export profiles. */
export function removeStory(ctx: TextContext, op: OperationOf<"removeStory">): TextEdit[] {
  // A recovered, unclosed story can own later top-level text through the end of the file.
  if (ctx.compilation.parse.diagnostics.some((d) => d.severity === "error"))
    reject("edit.unsafe-target", reasons().stories.fixSource);
  const story = requireStory(ctx, op.story);
  const profiles = ctx.compilation.document.exports.filter((p) => p.target.story?.id === story.id);
  if (profiles.length > 0 && !op.cascade) {
    reject(
      "edit.has-dependents",
      reasons().stories.exportDependents(story.id, profiles.length),
      profiles.map((p) => ({
        kind: "export",
        name: p.id,
        description: reasons().stories.exportProfile(p.id),
        range: p.range,
      })),
    );
  }
  return checked(
    ctx,
    deleteStatements(ctx.text, ctx.compilation.parse.root, [
      story.node,
      ...profiles.map((p) => p.node),
    ]),
  );
}

export function insertStoryAction(
  ctx: TextContext,
  op: OperationOf<"insertStoryAction">,
): TextEdit[] {
  const story = requireStory(ctx, op.story);
  const scene = requireScene(story, op.scene);
  const block = scene.node.block;
  if (!block) reject("edit.unsafe-target", reasons().stories.sceneNoBlock(scene.id));
  let text: string;
  if (op.action === "hold") {
    if (op.targets.length > 0 || op.all)
      reject("edit.invalid-value", reasons().stories.holdTargets);
    if (op.durationMs === undefined) reject("edit.invalid-value", reasons().stories.holdTime);
    text = `hold ${storyTime(op.durationMs)}`;
  } else {
    let targets: string;
    if (op.all) {
      if (op.action !== "focus" && op.action !== "camera") {
        reject("edit.invalid-value", reasons().stories.allActions);
      }
      if (op.targets.length > 0) reject("edit.invalid-value", reasons().stories.allTargets);
      targets = "all";
    } else {
      if (op.targets.length === 0)
        reject("edit.invalid-value", reasons().stories.needsTargets(op.action));
      if (op.action === "trace" && op.targets.length !== 1) {
        reject("edit.invalid-value", reasons().stories.traceOne);
      }
      const view = scene.view.diagram;
      for (const target of op.targets) {
        const kind = storyTargetKind(target, view);
        if (kind === null) {
          reject("edit.unsafe-target", reasons().stories.noTarget(scene.view.name, target));
        }
        if (op.action === "trace" && kind !== "relation") {
          reject("edit.invalid-value", reasons().stories.traceRelation(target));
        }
      }
      targets = op.targets.join(", ");
    }
    text = `${op.action} ${targets}`;
    if (op.durationMs !== undefined) text += ` over ${storyTime(op.durationMs)}`;
  }
  return checked(ctx, [insertStatement(ctx, block, scene.node.start, () => text)]);
}

export function removeStoryAction(
  ctx: TextContext,
  op: OperationOf<"removeStoryAction">,
): TextEdit[] {
  const story = requireStory(ctx, op.story);
  const action = actionAt(story, op.path);
  return checked(ctx, deleteStatements(ctx.text, ctx.compilation.parse.root, [action.node]));
}

interface ActionSource {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly lineComment: boolean;
  readonly leadingLineComment: boolean;
  readonly indent: string;
}

/**
 * Block comments after `;` and standalone comment lines belong to the following action, until a
 * blank line. An inline `//` on the preceding statement's final line stays with that statement,
 * including when it follows `;`.
 */
function commentsAfterSemicolon(ctx: TextContext, block: Block, node: KeywordStatement): Trivia[] {
  const separators: Token[] = [];
  let previousLine = -1;
  for (let i = block.children.indexOf(node) - 1; i >= 0; i--) {
    const child = block.children[i]!;
    if (!isToken(child) || (child.kind !== "Semicolon" && child.kind !== "Newline")) {
      previousLine = lineStart(ctx.text, Math.max(child.start, child.end - 1));
      break;
    }
    separators.unshift(child);
  }
  const comments: Trivia[] = [];
  let afterSemicolon = false;
  let afterNewline = false;
  for (const separator of separators) {
    const attached = separator.leadingTrivia.filter(isCommentTrivia);
    if (afterSemicolon)
      comments.push(
        ...attached.filter(
          (comment) =>
            comment.kind !== "LineComment" || lineStart(ctx.text, comment.start) !== previousLine,
        ),
      );
    if (separator.kind === "Semicolon") afterSemicolon = true;
    else if (afterNewline && attached.length === 0) {
      // A blank line detaches comments from the action below it.
      comments.length = 0;
      afterSemicolon = false;
    }
    afterNewline = separator.kind === "Newline";
  }
  return comments;
}

/**
 * An action's exact source, including attached comment-only lines and inline comments on either
 * side. Separators and indentation outside the payload stay in their original slots. In
 * particular, a blank line ends attachment, a block comment after `;` belongs to the following
 * action, and an inline `//` on the action's final line stays with it even after `;`.
 */
function actionSource(ctx: TextContext, block: Block, action: StoryAction): ActionSource {
  const node = action.node;
  const leading = [
    ...commentsAbove(block, node),
    ...commentsAfterSemicolon(ctx, block, node),
    ...(firstTokenOf(node)?.leadingTrivia.filter(isCommentTrivia) ?? []),
  ];
  const start = Math.min(node.start, ...leading.map((comment) => comment.start));
  let end = node.end;
  let last: Trivia | undefined;
  let afterSemicolon = false;
  for (let i = block.children.indexOf(node) + 1; i < block.children.length; i++) {
    const child = block.children[i]!;
    if (!isToken(child)) break;
    for (const comment of child.leadingTrivia.filter(isCommentTrivia)) {
      if (
        !afterSemicolon ||
        (comment.kind === "LineComment" &&
          lineStart(ctx.text, comment.start) === lineStart(ctx.text, node.end - 1))
      ) {
        end = comment.end;
        last = comment;
      }
    }
    if (child.kind !== "Semicolon") break;
    afterSemicolon = true;
  }
  return {
    start,
    end,
    text: ctx.text.slice(start, end),
    lineComment: last?.kind === "LineComment",
    leadingLineComment: leading.some(
      (comment) =>
        comment.kind === "LineComment" && !ctx.text.slice(start, comment.start).includes("\n"),
    ),
    indent:
      lineStart(ctx.text, node.start) + lineIndent(ctx.text, node.start).length === node.start
        ? lineIndent(ctx.text, node.start)
        : lineIndent(ctx.text, block.open.start) + ctx.unit,
  };
}

/** A moved trailing `//` needs a line break before another statement, comment or closing brace. */
function actionSeparator(
  ctx: TextContext,
  source: ActionSource,
  separator: string,
  indent: string,
  next?: ActionSource,
): string {
  let safe = separator;
  if (source.lineComment && !/^[ \t]*\r?\n/.test(safe))
    safe = ctx.eol + indent + safe.replace(/^[ \t;]*/, "");
  // A standalone leading `//` must not become the previous action's inline trailing comment.
  if (next?.leadingLineComment && !safe.includes("\n")) safe += ctx.eol + indent;
  return safe;
}

/** Reorders direct scene actions by permuting their source payloads, keeping gap trivia in place. */
export function reorderStoryAction(
  ctx: TextContext,
  op: OperationOf<"reorderStoryAction">,
): TextEdit[] {
  if (ctx.compilation.parse.diagnostics.some((d) => d.severity === "error"))
    reject("edit.unsafe-target", reasons().stories.reorderSyntax);
  if (
    !Array.isArray(op.path) ||
    op.path.length !== 2 ||
    op.path.some((index) => !Number.isInteger(index) || index < 0)
  )
    reject("edit.invalid-value", reasons().stories.reorderPath);
  const story = requireStory(ctx, op.story);
  const scene = sceneAt(story, op.path[0]);
  const action = actionAt(story, op.path);
  const current = scene.actions.indexOf(action);
  if (!Number.isInteger(op.index) || op.index < 0 || op.index >= scene.actions.length)
    reject("edit.invalid-value", reasons().stories.reorderIndex(scene.actions.length - 1));
  if (current === op.index) return [];
  const block = scene.node.block;
  if (!block) reject("edit.unsafe-target", reasons().stories.sceneNoBlock(scene.id));
  const nodes = new Set(scene.actions.map((item) => item.node));
  const first = block.statements.indexOf(scene.actions[0]!.node);
  if (
    first < 0 ||
    block.statements.slice(first).some((node) => !nodes.has(node as KeywordStatement))
  )
    reject("edit.unsafe-target", reasons().stories.reorderBoundary);

  const sources = scene.actions.map((item) => actionSource(ctx, block, item));
  if (sources.some((source, i) => i > 0 && source.start < sources[i - 1]!.end))
    reject("edit.unsafe-target", reasons().stories.reorderBoundary);
  const low = Math.min(current, op.index);
  const high = Math.max(current, op.index);
  const before = sources.slice(low, high + 1);
  const after = [...before];
  after.splice(op.index - low, 0, ...after.splice(current - low, 1));
  const start = before[0]!.start;
  const inlineStart = ctx.text.slice(lineStart(ctx.text, start), start).trim() !== "";
  let newText = after[0]!.leadingLineComment && inlineStart ? ctx.eol + after[0]!.indent : "";
  for (let i = 0; i < after.length; i++) {
    const source = after[i]!;
    newText += source.text;
    if (i < after.length - 1) {
      const gap = ctx.text.slice(before[i]!.end, before[i + 1]!.start);
      newText += actionSeparator(ctx, source, gap, after[i + 1]!.indent, after[i + 1]);
    }
  }
  const last = before.at(-1)!;
  const next = sources[high + 1];
  const boundary = next?.start ?? block.close.start;
  const suffix = ctx.text.slice(last.end, boundary);
  const safeSuffix = actionSeparator(
    ctx,
    after.at(-1)!,
    suffix,
    next?.indent ?? lineIndent(ctx.text, scene.node.start),
    next,
  );
  const edits = [{ start, end: boundary, newText: newText + safeSuffix }];
  checked(ctx, edits);

  // Comment movement must not swallow a neighbour, change a header or silently change timing.
  const candidate = applyTextEdits(ctx.text, edits);
  const nextStory = compile(candidate, ctx.compilation.options).document.stories.find(
    (item) => item.id === story.id,
  );
  const nextScene = nextStory?.scenes[scene.index];
  const expected = [...scene.actions];
  expected.splice(op.index, 0, ...expected.splice(current, 1));
  // Source times can be fractional milliseconds; addition in a different order can change only
  // the final floating-point bit. This permits that error, never a changed written duration.
  const sameDuration = (actual: number | undefined, original: number) =>
    actual !== undefined &&
    Math.abs(actual - original) <=
      Number.EPSILON *
        Math.max(1, Math.abs(scene.startMs), Math.abs(original)) *
        (scene.actions.length + story.scenes.length + 1);
  const sameActionDuration = (actual: StoryAction, original: StoryAction): boolean =>
    actual.durationMs === original.durationMs &&
    actual.writtenMs === original.writtenMs &&
    actual.children.length === original.children.length &&
    actual.children.every((child, i) => sameActionDuration(child, original.children[i]!));
  const transitionText = (text: string, item: StoryScene) =>
    item.transition ? text.slice(item.transition.node.start, item.transition.node.end) : null;
  if (
    !sameDuration(nextScene?.durationMs, scene.durationMs) ||
    !sameDuration(nextStory?.durationMs, story.durationMs) ||
    !nextScene ||
    nextScene.startMs !== scene.startMs ||
    nextScene.id !== scene.id ||
    nextScene.title !== scene.title ||
    nextScene.view.name !== scene.view.name ||
    nextScene.view.file !== scene.view.file ||
    nextScene.transition?.durationMs !== scene.transition?.durationMs ||
    transitionText(candidate, nextScene) !== transitionText(ctx.text, scene) ||
    nextScene.actions.length !== expected.length ||
    nextScene.actions.some(
      (item, i) =>
        !sameActionDuration(item, expected[i]!) ||
        candidate.slice(item.node.start, item.node.end) !==
          ctx.text.slice(expected[i]!.node.start, expected[i]!.node.end),
    )
  )
    reject("edit.unsafe-target", reasons().stories.reorderBoundary);
  return edits;
}

/**
 * Appends `story <id> for <diagram> {` with one empty scene `scene <scene> {` and `}`, and `}`,
 * after the last top-level statement, separated by a blank line, with `title "…"` first inside
 * when given. The diagram is one of the file's, of any profile; the id is the first free
 * `story<n>` by default and the scene `scene1`. The new story warns `story.empty-scene` until
 * its scene has an action: a warning, not an error.
 */
export function createStory(ctx: TextContext, op: OperationOf<"createStory">): TextEdit[] {
  const diagrams = ctx.compilation.document.diagrams;
  if (!diagrams.some((d) => d.id === op.diagram)) {
    reject(
      "edit.unsafe-target",
      reasons().stories.diagramNotInFile(
        op.diagram,
        diagrams.map((d) => d.id),
      ),
    );
  }
  if (op.id !== undefined) {
    if (!isIdentifierText(op.id))
      reject("edit.invalid-id", reasons().stories.invalidStoryId(op.id));
    if (topLevelNames(ctx.compilation).has(op.id)) {
      reject("edit.id-conflict", reasons().stories.storyTaken(op.id));
    }
  }
  const scene = op.scene ?? "scene1";
  if (!isIdentifierText(scene)) reject("edit.invalid-id", reasons().stories.invalidSceneId(scene));
  const id = op.id ?? newStoryId(ctx.compilation);
  const { eol, unit } = ctx;
  const title = op.title !== undefined ? `${unit}title ${quoteString(op.title)}${eol}${eol}` : "";
  const block = [
    `story ${id} for ${op.diagram} {${eol}`,
    title,
    `${unit}scene ${scene} {${eol}`,
    `${unit}}${eol}`,
    "}",
  ].join("");
  return checked(ctx, [appendBlock(ctx, block)]);
}

export function insertScene(ctx: TextContext, op: OperationOf<"insertScene">): TextEdit[] {
  const story = requireStory(ctx, op.story);
  if (!isIdentifierText(op.id)) reject("edit.invalid-id", reasons().stories.invalidSceneId(op.id));
  if (story.scenes.some((s) => s.id === op.id)) {
    reject("edit.id-conflict", reasons().stories.sceneExists(story.id, op.id));
  }
  const body: Block | null = story.node.block.kind === "Block" ? story.node.block : null;
  if (!body) reject("edit.unsafe-target", reasons().stories.noBody(story.id));
  const header = `scene ${op.id}${op.title !== undefined ? ` ${quoteString(op.title)}` : ""}`;
  const render = (indent: string | null) =>
    indent === null ? `${header} {}` : `${header} {${ctx.eol}${indent}}`;
  if (op.after !== undefined) {
    const after = requireScene(story, op.after);
    const edit = insertAfter(ctx, body, after.node, render);
    // Scenes are kept apart by a blank line.
    const separated = edit.newText.startsWith(ctx.eol)
      ? { ...edit, newText: ctx.eol + edit.newText }
      : edit;
    const following = story.scenes[after.index + 1];
    const orphaned =
      following?.node.block?.statements.filter(
        (stmt): stmt is KeywordStatement =>
          stmt.kind === "KeywordStatement" && stmt.keyword.text === "overlap",
      ) ?? [];
    return checked(ctx, [
      separated,
      ...deleteStatements(ctx.text, ctx.compilation.parse.root, orphaned),
    ]);
  }
  return checked(ctx, [
    insertStatement(ctx, body, story.node.start, render, {
      blankLineBefore: story.scenes.length > 0,
    }),
  ]);
}
