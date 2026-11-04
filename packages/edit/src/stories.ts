import {
  isIdentifierText,
  type Block,
  type KeywordStatement,
  type TextEdit,
} from "@meltemi/diagrams-language";
import {
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
import { insertAfter, verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { formatNumber, quoteString } from "./text.js";
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

function requireStory(ctx: TextContext, id: string): StoryDefinition {
  const story = ctx.compilation.document.stories.find((s) => s.id === id);
  if (!story) {
    const ids = ctx.compilation.document.stories.map((s) => s.id);
    reject("edit.unsafe-target", reasons().stories.missing(id, ids));
  }
  return story;
}

function requireScene(story: StoryDefinition, id: string): StoryScene {
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
function checked(ctx: TextContext, edits: TextEdit[]): TextEdit[] {
  verifyNoNewErrors(ctx, edits);
  return edits;
}

function storyTime(ms: number): string {
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
    return checked(ctx, [separated]);
  }
  return checked(ctx, [
    insertStatement(ctx, body, story.node.start, render, {
      blankLineBefore: story.scenes.length > 0,
    }),
  ]);
}
