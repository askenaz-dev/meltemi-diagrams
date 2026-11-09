import {
  applyTextEdits,
  type Block,
  type KeywordStatement,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { compile, type StoryScene } from "@meltemi/diagrams-model";
import { createTextContext, insertStatement, reject, type TextContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { commentsAbove, insertAfter } from "./insert.js";
import { reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { checked, requireScene, requireStory, storyTime } from "./stories.js";
import { firstTokenOf, isCommentTrivia, lineIndent, lineStart, quoteString } from "./text.js";

function safeSource(ctx: TextContext): void {
  if (ctx.compilation.parse.diagnostics.some((d) => d.severity === "error"))
    reject("edit.unsafe-target", reasons().stories.editSyntax);
}

function body(scene: StoryScene): Block {
  if (!scene.node.block) reject("edit.unsafe-target", reasons().stories.sceneNoBlock(scene.id));
  return scene.node.block;
}

function statements(block: Block, keyword: string): KeywordStatement[] {
  return block.statements.filter(
    (s): s is KeywordStatement => s.kind === "KeywordStatement" && s.keyword.text === keyword,
  );
}

/** Put a new header before action comments, or after the final existing header. */
function insertHeader(ctx: TextContext, scene: StoryScene, text: string, first = false): TextEdit {
  const block = body(scene);
  const firstAction = first ? block.statements[0] : scene.actions[0]?.node;
  const before = firstAction ? block.statements.indexOf(firstAction) : block.statements.length;
  const lastHeader = block.statements.slice(0, before).at(-1);
  if (lastHeader) return insertAfter(ctx, block, lastHeader, () => text);
  if (!firstAction) return insertStatement(ctx, block, scene.node.start, () => text);
  const comments = [
    ...commentsAbove(block, firstAction),
    ...(firstTokenOf(firstAction)?.leadingTrivia.filter(isCommentTrivia) ?? []),
  ];
  const start = Math.min(firstAction.start, ...comments.map((comment) => comment.start));
  const line = lineStart(ctx.text, start);
  const indent = lineIndent(ctx.text, start);
  if (line + indent.length === start)
    return { start: line, end: line, newText: indent + text + ctx.eol };
  return { start, end: start, newText: text + "; " };
}

export function setStoryTitle(ctx: TextContext, op: OperationOf<"setStoryTitle">): TextEdit[] {
  safeSource(ctx);
  const story = requireStory(ctx, op.story);
  if (op.title === story.title) return [];
  const block = story.node.block;
  if (block.kind !== "Block") reject("edit.unsafe-target", reasons().stories.fixSource);
  const titles = statements(block, "title");
  if (op.title === null)
    return checked(ctx, deleteStatements(ctx.text, ctx.compilation.parse.root, titles));
  if (typeof op.title !== "string") reject("edit.invalid-value", reasons().stories.titleString);
  const last = titles.at(-1)?.args[0];
  return checked(ctx, [
    last
      ? { start: last.start, end: last.end, newText: quoteString(op.title) }
      : insertStatement(ctx, block, story.node.start, () => `title ${quoteString(op.title!)}`),
  ]);
}

export function setSceneTitle(ctx: TextContext, op: OperationOf<"setSceneTitle">): TextEdit[] {
  safeSource(ctx);
  const scene = requireScene(requireStory(ctx, op.story), op.scene);
  if (op.title === scene.title) return [];
  const current = scene.node.args[1];
  if (op.title === null)
    return current ? checked(ctx, [{ start: current.start, end: current.end, newText: "" }]) : [];
  if (typeof op.title !== "string") reject("edit.invalid-value", reasons().stories.titleString);
  const id = scene.node.args[0]!;
  return checked(ctx, [
    current
      ? { start: current.start, end: current.end, newText: quoteString(op.title) }
      : { start: id.end, end: id.end, newText: ` ${quoteString(op.title)}` },
  ]);
}

export function setSceneOverlap(ctx: TextContext, op: OperationOf<"setSceneOverlap">): TextEdit[] {
  safeSource(ctx);
  const story = requireStory(ctx, op.story);
  const scene = requireScene(story, op.scene);
  const time = storyTime(op.durationMs);
  const previous = story.scenes[scene.index - 1];
  const currentOverlap = previous
    ? Math.max(0, previous.startMs + previous.durationMs - scene.startMs)
    : 0;
  const transition = scene.transition?.durationMs ?? 0;
  const prospectiveDuration =
    currentOverlap > 0 ? scene.durationMs : Math.max(transition, scene.durationMs - transition);
  const maximum = previous ? Math.min(previous.durationMs, prospectiveDuration) : 0;
  if (op.durationMs > maximum)
    reject("edit.invalid-value", reasons().stories.overlapMaximum(scene.id, maximum));
  const existing = statements(body(scene), "overlap");
  if (op.durationMs === 0)
    return checked(ctx, deleteStatements(ctx.text, ctx.compilation.parse.root, existing));
  const declaration = existing.at(-1);
  const value = declaration?.args[0];
  return checked(ctx, [
    value
      ? { start: value.start, end: value.end, newText: time }
      : insertHeader(ctx, scene, `overlap ${time}`),
  ]);
}

export function setSceneTransition(
  ctx: TextContext,
  op: OperationOf<"setSceneTransition">,
): TextEdit[] {
  safeSource(ctx);
  const scene = requireScene(requireStory(ctx, op.story), op.scene);
  if (!["cut", "fade", "morph"].includes(op.transition))
    reject("edit.invalid-value", reasons().stories.transitionKind);
  if (op.durationMs !== undefined) storyTime(op.durationMs);
  if (op.transition === "cut" && op.durationMs !== undefined && op.durationMs !== 0)
    reject("edit.invalid-value", reasons().stories.cut);
  const text =
    `transition ${op.transition}` +
    (op.transition !== "cut" && op.durationMs !== undefined
      ? ` over ${storyTime(op.durationMs)}`
      : "");
  const current = scene.transition?.node;
  if (!current) return checked(ctx, [insertHeader(ctx, scene, text)]);
  const edits: TextEdit[] = [];
  const kind = current.args[0]!;
  if (scene.transition!.kind !== op.transition)
    edits.push({ start: kind.start, end: kind.end, newText: op.transition });
  if (op.transition === "cut") {
    // Remove only tokens, retaining comments between the kind, `over` and its value.
    const over = current.args.find((arg) => arg.kind === "QualifiedRef" && arg.text === "over");
    const time = scene.transition!.timeRange;
    if (over) edits.push({ start: over.start, end: over.end, newText: "" });
    if (time) edits.push({ start: time.start.offset, end: time.end.offset, newText: "" });
  } else if (op.durationMs !== undefined) {
    const time = scene.transition!.timeRange;
    const value = storyTime(op.durationMs);
    if (time) {
      if (op.durationMs !== scene.transition!.writtenMs)
        edits.push({ start: time.start.offset, end: time.end.offset, newText: value });
    } else {
      const last = current.args.at(-1)!;
      edits.push({ start: last.end, end: last.end, newText: ` over ${value}` });
    }
  }
  return checked(ctx, edits);
}

export function removeScene(ctx: TextContext, op: OperationOf<"removeScene">): TextEdit[] {
  safeSource(ctx);
  const story = requireStory(ctx, op.story);
  const scene = requireScene(story, op.scene);
  const following = story.scenes[scene.index + 1];
  const orphaned = following ? statements(body(following), "overlap") : [];
  const edits = deleteStatements(ctx.text, ctx.compilation.parse.root, [scene.node, ...orphaned]);
  if (!following) return checked(ctx, edits);
  let candidate = applyTextEdits(ctx.text, edits);
  let compilation = compile(candidate, ctx.compilation.options);
  let updated = compilation.document.stories
    .find((item) => item.id === story.id)
    ?.scenes.find((item) => item.id === following.id);
  // Preserve an implicit view inherited from the removed scene.
  if (updated && updated.view.name !== following.view.name) {
    candidate = applyTextEdits(candidate, [
      insertHeader(createTextContext(compilation), updated, `view ${following.view.name}`, true),
    ]);
    compilation = compile(candidate, ctx.compilation.options);
    updated = compilation.document.stories
      .find((item) => item.id === story.id)
      ?.scenes.find((item) => item.id === following.id);
  }
  const previous = story.scenes[scene.index - 1]?.view ?? story.target;
  if (updated && !updated.transition && previous.name !== following.view.name) {
    candidate = applyTextEdits(candidate, [
      insertHeader(createTextContext(compilation), updated, "transition cut"),
    ]);
  }
  if (candidate === applyTextEdits(ctx.text, edits)) return checked(ctx, edits);
  let start = 0;
  while (
    start < ctx.text.length &&
    start < candidate.length &&
    ctx.text[start] === candidate[start]
  )
    start++;
  let end = ctx.text.length;
  let nextEnd = candidate.length;
  while (end > start && nextEnd > start && ctx.text[end - 1] === candidate[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  return checked(ctx, [{ start, end, newText: candidate.slice(start, nextEnd) }]);
}
