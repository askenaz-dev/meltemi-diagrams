import { sceneStills, storyTimeline, type TimelineAction } from "@meltemi/diagrams-motion";
import type { RenderFailure, ReportDiagnostic } from "./protocol.js";

/** A read-only story inspection at one project snapshot. No image assets are required. */
export interface InspectStoryRequest {
  revision: number;
  files: Readonly<Record<string, string>>;
  file: string;
  story: string;
}

export interface InspectionAction {
  kind: string;
  path: number[];
  targets: { id: string; kind: string }[];
  all: boolean;
  startMs: number;
  endMs: number;
  durationMs: number;
  children: InspectionAction[];
  line: number;
}

export interface StoryInspection {
  revision: number;
  path: string;
  id: string;
  title: string | null;
  durationMs: number;
  views: string[];
  scenes: {
    id: string;
    title: string | null;
    view: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    stillAtMs: number;
    transition: { kind: string; startMs: number; endMs: number; durationMs: number } | null;
    actions: InspectionAction[];
    line: number;
  }[];
  diagnostics: ReportDiagnostic[];
  truncated: boolean;
}

export type InspectStoryOutcome = { ok: true; inspection: StoryInspection } | RenderFailure;

/** Bound the JSON report independently of the source/renderer safety limits. */
export const MAX_INSPECTION_ITEMS = 10_000;

const actionReport = (action: TimelineAction): InspectionAction => ({
  ...action,
  path: [...action.path],
  targets: action.targets.map((target) => ({ ...target })),
  endMs: action.startMs + action.durationMs,
  children: action.children.map(actionReport),
});

/** Project compiled times without reimplementing sequential, parallel or transition rules. */
export function inspectionOf(
  story: Parameters<typeof storyTimeline>[0],
  request: Pick<InspectStoryRequest, "revision" | "file">,
  diagnostics: ReportDiagnostic[],
  truncated: boolean,
): InspectStoryOutcome {
  const timeline = storyTimeline(story);
  const pending = timeline.scenes.flatMap((scene) => [...scene.actions]);
  let count = timeline.scenes.length;
  while (pending.length > 0) {
    const action = pending.pop()!;
    if (++count > MAX_INSPECTION_ITEMS) {
      return {
        ok: false,
        code: "request.invalid",
        message: `The story inspection exceeds ${MAX_INSPECTION_ITEMS} scenes and actions.`,
      };
    }
    pending.push(...action.children);
  }
  if (count > MAX_INSPECTION_ITEMS) {
    return {
      ok: false,
      code: "request.invalid",
      message: `The story inspection exceeds ${MAX_INSPECTION_ITEMS} scenes and actions.`,
    };
  }
  const stills = sceneStills(timeline);
  return {
    ok: true,
    inspection: {
      revision: request.revision,
      path: request.file,
      id: timeline.id,
      title: timeline.title,
      durationMs: timeline.durationMs,
      views: [...timeline.views],
      scenes: timeline.scenes.map((scene, i) => ({
        ...scene,
        endMs: scene.startMs + scene.durationMs,
        stillAtMs: stills[i]!.atMs,
        transition: scene.transition
          ? {
              ...scene.transition,
              endMs: scene.transition.startMs + scene.transition.durationMs,
            }
          : null,
        actions: scene.actions.map(actionReport),
      })),
      diagnostics,
      truncated,
    },
  };
}
