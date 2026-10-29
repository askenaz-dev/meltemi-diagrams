import {
  type Arg,
  type DiagnosticBag,
  type KeywordStatement,
  type LineIndex,
  type Range,
  type Span,
  type StoryBlock,
  type Token,
  type DiagnosticData,
} from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import { closePaths } from "./model.js";
import { STORY_DEFAULT_TIMES, STORY_MAX_TIME, STORY_TRANSITIONS } from "./schema.js";
import { headerHasError, singleIdent, spanOf } from "./style-values.js";
import type {
  FlowDiagram,
  ResolvedDiagram,
  StoryAction,
  StoryActionKind,
  StoryDefinition,
  StoryEntityReference,
  StoryReference,
  StoryScene,
  StoryTarget,
  StoryTransition,
  StoryTransitionKind,
  StoryView,
  TargetKind,
} from "./types.js";

/** Actions that name targets. */
const TARGETED = new Set(["reveal", "hide", "highlight", "focus", "camera", "trace", "draw"]);
const ACTIONS = new Set([...TARGETED, "hold", "parallel"]);

interface Interval {
  start: number;
  end: number;
  at: Span;
}

export interface StoryResolver {
  /** A diagram of the file or an imported one, by the name written. */
  resolve(name: string): ResolvedDiagram | undefined;
  /** True when the name starts with an import binding that did not resolve (yet). */
  pending(name: string): boolean;
  /** Names to suggest for an unknown diagram. */
  names(): string[];
}

/** Compiles one `story` block: scenes, actions, absolute times, targets and the story rules. */
export function analyzeStory(
  node: StoryBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
  resolver: StoryResolver,
): StoryDefinition {
  const error = (
    code: string,
    message: string,
    at: Span,
    hints?: string[],
    severity: "error" | "warning" = "error",
    data?: DiagnosticData,
  ) =>
    bag.add({
      code,
      severity,
      message,
      span: at,
      ...(hints ? { hints } : {}),
      ...(data ? { data } : {}),
    });
  const range = (s: Span): Range => lines.range(s);
  const references: StoryReference[] = [];
  const entityReferences: StoryEntityReference[] = [];

  const view = (written: { text: string; span: Span } | null): StoryView => {
    if (!written) return { name: "", diagram: null, file: null };
    const resolved = resolver.resolve(written.text);
    if (!resolved && !resolver.pending(written.text)) {
      const names = resolver.names();
      const m = messages();
      error(
        "story.unknown-diagram",
        m.diagnostics.story.unknownDiagram(written.text),
        written.span,
        [names.length > 0 ? m.hints.story.diagrams(names) : m.hints.story.declareDiagram],
      );
    }
    return { name: written.text, diagram: resolved?.diagram ?? null, file: resolved?.file ?? null };
  };

  const target = node.target && node.target.kind === "QualifiedRef" ? node.target : null;
  if (!target) {
    error("story.unknown-diagram", messages().diagnostics.story.namesDiagram, spanOf(node.keyword));
  }
  const storyView = view(target ? { text: target.text, span: spanOf(target) } : null);

  let title: string | null = null;
  let description: string | null = null;
  const scenes: StoryScene[] = [];
  const sceneIds = new Map<string, Token>();
  let clock = 0;
  let previousView = storyView;
  // Channels whose actions must not overlap: `<channel>:<view>[:<target>]`.
  const channels = new Map<string, Interval[]>();

  /** A time of `over` or `hold`, the keyword written. */
  const time = (arg: Arg | undefined, keyword: "over" | "hold"): number | null => {
    if (arg?.kind === "NumberLiteral" && (arg.unit === "ms" || arg.unit === "s")) {
      const ms = arg.unit === "s" ? Math.round(arg.value * 1000 * 1000) / 1000 : arg.value;
      if (ms >= 0 && ms <= STORY_MAX_TIME) return ms;
    }
    error(
      "prop.invalid-value",
      messages().diagnostics.story.time(keyword),
      arg ? spanOf(arg) : spanOf(node.keyword),
    );
    return null;
  };

  const block = node.block.kind === "Block" ? node.block : null;
  for (const stmt of block?.statements ?? []) {
    if (stmt.kind !== "KeywordStatement" || headerHasError(stmt)) {
      if (stmt.kind !== "Error" && stmt.kind !== "KeywordStatement") {
        error("prop.unknown", messages().diagnostics.story.contents, spanOf(stmt));
      }
      continue;
    }
    const word = stmt.keyword.text;
    if (word === "title" || word === "description") {
      const value = stmt.args[0];
      if (value?.kind !== "StringLiteral" || stmt.args.length > 1) {
        error(
          "prop.invalid-value",
          messages().diagnostics.common.expectsString(word),
          spanOf(stmt),
        );
        continue;
      }
      if (word === "title") title = value.value;
      else description = value.value;
      continue;
    }
    if (word !== "scene") {
      const m = messages();
      error("prop.unknown", m.diagnostics.story.notStoryStatement(word), spanOf(stmt.keyword), [
        m.hints.story.actionsInScene,
      ]);
      continue;
    }
    const scene = analyzeScene(stmt);
    if (scene) scenes.push(scene);
  }

  function analyzeScene(stmt: KeywordStatement): StoryScene | null {
    const idArg = stmt.args[0];
    const idToken =
      idArg?.kind === "QualifiedRef" && idArg.parts.length === 1 ? idArg.parts[0]! : null;
    if (
      !idToken ||
      !stmt.block ||
      stmt.args.length > 2 ||
      (stmt.args[1] && stmt.args[1].kind !== "StringLiteral")
    ) {
      error("prop.invalid-value", messages().diagnostics.story.sceneShape, spanOf(stmt));
      return null;
    }
    const first = sceneIds.get(idToken.text);
    if (first) {
      const m = messages();
      bag.add({
        code: "ref.duplicate-id",
        severity: "error",
        message: m.diagnostics.story.duplicateScene(idToken.text),
        span: spanOf(idToken),
        related: [{ message: m.related.firstScene, span: spanOf(first) }],
      });
    } else sceneIds.set(idToken.text, idToken);
    const sceneTitle = stmt.args[1]?.kind === "StringLiteral" ? stmt.args[1].value : null;
    const index = scenes.length;
    const start = clock;
    let sceneView = previousView;
    let viewStatement: KeywordStatement | null = null;
    let transition: StoryTransition | null = null;
    const actions: StoryAction[] = [];
    let cursor = start;
    for (const inner of stmt.block.statements) {
      if (inner.kind !== "KeywordStatement" || headerHasError(inner)) {
        if (inner.kind !== "Error" && inner.kind !== "KeywordStatement") {
          error("prop.unknown", messages().diagnostics.story.sceneContents, spanOf(inner));
        }
        continue;
      }
      const word = inner.keyword.text;
      if (word === "view") {
        const ref = inner.args[0];
        if (
          ref?.kind !== "QualifiedRef" ||
          inner.args.length > 1 ||
          actions.length > 0 ||
          transition
        ) {
          error("prop.invalid-value", messages().diagnostics.story.viewFirst, spanOf(inner));
          continue;
        }
        sceneView = view({ text: ref.text, span: spanOf(ref) });
        viewStatement = inner;
        continue;
      }
      if (word === "transition") {
        const kind = singleIdent(inner.args[0]);
        if (
          !kind ||
          !(STORY_TRANSITIONS as readonly string[]).includes(kind.text) ||
          actions.length > 0 ||
          transition
        ) {
          error("prop.invalid-value", messages().diagnostics.story.transitionFirst, spanOf(inner));
          continue;
        }
        const { written, timeArg } = overTime(inner, 1);
        const duration = written ?? STORY_DEFAULT_TIMES[kind.text as StoryTransitionKind];
        transition = {
          kind: kind.text as StoryTransitionKind,
          durationMs: kind.text === "cut" ? 0 : duration,
          writtenMs: written,
          startMs: start,
          range: range(spanOf(inner)),
          timeRange: timeArg ? range(spanOf(timeArg)) : null,
          node: inner,
        };
        cursor = start + transition.durationMs;
        continue;
      }
      if (!ACTIONS.has(word)) {
        const m = messages();
        error(
          "prop.unknown",
          m.diagnostics.story.notAction(word),
          spanOf(inner.keyword),
          [m.hints.story.actions],
          "error",
          { candidates: [...ACTIONS] },
        );
        continue;
      }
      const action = analyzeAction(inner, [index, actions.length], cursor, sceneView);
      if (!action) continue;
      actions.push(action);
      cursor = action.startMs + action.durationMs;
    }
    if (sceneView.name !== previousView.name && !transition) {
      const m = messages();
      error(
        "story.missing-transition",
        m.diagnostics.story.missingTransition(sceneView.name),
        spanOf(viewStatement ?? stmt.keyword),
        [m.hints.story.transition],
      );
    }
    if (actions.length === 0 && !transition) {
      error(
        "story.empty-scene",
        messages().diagnostics.story.emptyScene(idToken.text),
        spanOf(idToken),
        undefined,
        "warning",
      );
    }
    previousView = sceneView;
    clock = cursor;
    // Focus lasts to the end of its scene.
    return {
      id: idToken.text,
      title: sceneTitle,
      index,
      view: sceneView,
      transition,
      actions,
      startMs: start,
      durationMs: cursor - start,
      range: range(spanOf(stmt)),
      idRange: range(spanOf(idToken)),
      node: stmt,
    };
  }

  function overTime(
    stmt: KeywordStatement,
    from: number,
  ): { written: number | null; timeArg: Arg | null; end: number } {
    const overIndex = stmt.args.findIndex((a, i) => i >= from && singleIdent(a)?.text === "over");
    if (overIndex < 0) return { written: null, timeArg: null, end: stmt.args.length };
    const arg = stmt.args[overIndex + 1];
    const written = time(arg, "over");
    if (stmt.args.length > overIndex + 2) {
      error(
        "prop.invalid-value",
        messages().diagnostics.story.afterOver,
        spanOf(stmt.args[overIndex + 2]!),
      );
    }
    return { written, timeArg: arg ?? null, end: overIndex };
  }

  function analyzeAction(
    stmt: KeywordStatement,
    path: number[],
    start: number,
    sceneView: StoryView,
  ): StoryAction | null {
    const kind = stmt.keyword.text as StoryActionKind;
    const base = { kind, path, range: range(spanOf(stmt)), node: stmt };
    if (kind === "hold") {
      const arg = stmt.args[0];
      const written = stmt.args.length === 1 ? time(arg, "hold") : null;
      if (stmt.args.length !== 1)
        error("prop.invalid-value", messages().diagnostics.story.hold, spanOf(stmt));
      return {
        ...base,
        targets: [],
        all: false,
        durationMs: written ?? 0,
        writtenMs: written,
        startMs: start,
        children: [],
        timeRange: arg ? range(spanOf(arg)) : null,
      };
    }
    if (kind === "parallel") {
      if (!stmt.block || stmt.args.length > 0) {
        error("prop.invalid-value", messages().diagnostics.story.parallel, spanOf(stmt));
        return null;
      }
      const children: StoryAction[] = [];
      for (const inner of stmt.block.statements) {
        if (inner.kind !== "KeywordStatement" || headerHasError(inner)) continue;
        if (!ACTIONS.has(inner.keyword.text)) {
          error(
            "prop.unknown",
            messages().diagnostics.story.notAction(inner.keyword.text),
            spanOf(inner.keyword),
          );
          continue;
        }
        const child = analyzeAction(inner, [...path, children.length], start, sceneView);
        if (child) children.push(child);
      }
      const duration = Math.max(0, ...children.map((c) => c.durationMs));
      return {
        ...base,
        targets: [],
        all: false,
        durationMs: duration,
        writtenMs: null,
        startMs: start,
        children,
        timeRange: null,
      };
    }
    const { written, timeArg, end } = overTime(stmt, 0);
    const refs = stmt.args.slice(0, end);
    const all =
      (kind === "focus" || kind === "camera") &&
      refs.length === 1 &&
      singleIdent(refs[0])?.text === "all";
    if (refs.length === 0) {
      error(
        "prop.invalid-value",
        messages().diagnostics.story.namesTargets(kind),
        spanOf(stmt.keyword),
      );
    }
    if (kind === "trace" && refs.length > 1) {
      error("prop.invalid-value", messages().diagnostics.story.traceOne, spanOf(refs[1]!));
    }
    const targets: StoryTarget[] = [];
    if (!all) {
      for (const ref of refs) {
        if (ref.kind !== "QualifiedRef") {
          error("prop.invalid-value", messages().diagnostics.story.ids(kind), spanOf(ref));
          continue;
        }
        const found = storyTargetKind(ref.text, sceneView.diagram);
        if (!found) {
          if (sceneView.diagram) {
            const ids = [
              ...sceneView.diagram.elementsById.keys(),
              ...sceneView.diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
            ];
            const close = closePaths(ref.text, ids);
            const m = messages();
            bag.add({
              code: "ref.unknown-element",
              severity: "error",
              message: m.diagnostics.story.unknownTarget(sceneView.name, ref.text),
              span: spanOf(ref),
              data: { ids: [ref.text], candidates: close },
              ...(close.length > 0 ? { hints: [m.hints.didYouMean(close)] } : {}),
            });
          }
          continue;
        }
        if (kind === "trace" && found !== "relation") {
          error(
            "story.invalid-target",
            messages().diagnostics.story.traceTarget(ref.text, found === "element"),
            spanOf(ref),
          );
          continue;
        }
        // `draw` replays pens, free lines and named relations; a view not resolved is not checked.
        if (kind === "draw" && sceneView.diagram && !drawTargetKind(ref.text, sceneView.diagram)) {
          const element = sceneView.diagram.elementsById.get(ref.text);
          error(
            "story.invalid-target",
            messages().diagnostics.story.drawTarget(ref.text, element?.kind ?? null),
            spanOf(ref),
          );
          continue;
        }
        const target: StoryTarget = { id: ref.text, kind: found, range: range(spanOf(ref)) };
        targets.push(target);
        if (sceneView.diagram) {
          references.push({
            diagram: sceneView.diagram.id,
            file: sceneView.file,
            id: ref.text,
            kind: found,
            range: target.range,
          });
          // Each part of a path in a C4 view names an entity of its model.
          const c4 = sceneView.diagram.c4;
          if (c4 && found === "element") {
            ref.parts.forEach((part, i) =>
              entityReferences.push({
                token: part,
                model: c4.model,
                path: ref.parts
                  .slice(0, i + 1)
                  .map((p) => p.text)
                  .join("."),
                role: "story",
                view: sceneView,
              }),
            );
          }
        }
      }
    }
    const duration = written ?? STORY_DEFAULT_TIMES[kind as keyof typeof STORY_DEFAULT_TIMES];
    const action: StoryAction = {
      ...base,
      targets,
      all,
      durationMs: duration,
      writtenMs: written,
      startMs: start,
      children: [],
      timeRange: timeArg ? range(spanOf(timeArg)) : null,
    };
    checkChannels(action, sceneView);
    return action;
  }

  function checkChannels(action: StoryAction, sceneView: StoryView): void {
    // A drawn target appears as it is drawn, on the channel of a trace.
    const channels =
      action.kind === "reveal" || action.kind === "hide"
        ? ["visibility"]
        : action.kind === "draw"
          ? ["visibility", "trace"]
          : action.kind === "highlight" || action.kind === "trace"
            ? [action.kind]
            : action.kind === "focus" || action.kind === "camera"
              ? [action.kind]
              : [];
    // One conflict per target and action, however many of its channels clash (`draw p, p`).
    const reported = new Set<string>();
    for (const channel of channels) checkChannel(action, sceneView, channel, reported);
  }

  function checkChannel(
    action: StoryAction,
    sceneView: StoryView,
    channel: string,
    reported: Set<string>,
  ): void {
    const keys =
      channel === "focus" || channel === "camera"
        ? [`${channel}:${sceneView.name}`]
        : action.targets.map((t) => `${channel}:${sceneView.name}:${t.id}`);
    const span = { start: action.node.start, end: action.node.end };
    for (const key of keys) {
      const list = channels.get(key) ?? [];
      const end = action.startMs + action.durationMs;
      const clash = list.find((i) =>
        action.durationMs === 0 && i.end === i.start
          ? i.start === action.startMs
          : action.startMs < i.end && i.start < end,
      );
      const target = key.split(":").pop()!;
      if (clash && !reported.has(target)) {
        reported.add(target);
        const m = messages();
        bag.add({
          code: "story.conflict",
          severity: "error",
          message: m.diagnostics.story.conflict(action.kind, channel, target),
          span,
          related: [{ message: m.related.earlierAction, span: clash.at }],
          hints: [m.hints.story.conflict],
        });
      }
      list.push({ start: action.startMs, end, at: span });
      channels.set(key, list);
    }
  }

  return {
    id: id.text,
    target: storyView,
    title,
    description,
    scenes,
    durationMs: clock,
    references,
    entityReferences,
    range: range(spanOf(node)),
    idRange: range(spanOf(id)),
    node,
  };
}

/**
 * What a story target names in a view: an element, a named relation or a named note or fragment.
 * Every id of a view that did not resolve is taken as an element.
 */
export function storyTargetKind(id: string, diagram: FlowDiagram | null): TargetKind | null {
  if (!diagram) return "element";
  if (diagram.elementsById.has(id)) return "element";
  const relation = diagram.relationsByKey.get(id);
  if (relation && relation.id === id) return "relation";
  const event = diagram.eventsByKey.get(id);
  if (event && event.id === id && event.kind !== "message") return "event";
  return null;
}

/** What `draw` replays: a pen stroke, a free line or a named relation. */
export type DrawTargetKind = "pen" | "line" | "relation";

/**
 * What a target of `draw` names in a view, drawn from its first point to its last: a pen, a free
 * line or a named relation; null for anything else, which `draw` refuses. Story targets keep the
 * kind `storyTargetKind` gives them (`element` for pens and lines).
 */
export function drawTargetKind(id: string, diagram: FlowDiagram): DrawTargetKind | null {
  const element = diagram.elementsById.get(id);
  if (element) return element.kind === "pen" || element.kind === "line" ? element.kind : null;
  const relation = diagram.relationsByKey.get(id);
  return relation && relation.id === id ? "relation" : null;
}
