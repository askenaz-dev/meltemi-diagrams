import type { Locale } from "@meltemi/diagrams-i18n";
import type { CaptureJob, VideoJob } from "@meltemi/diagrams-capture";
import type { Diagnostic } from "@meltemi/diagrams-language";
import type { LayoutResult, Scene } from "@meltemi/diagrams-layout";
import type { ExportProfile, FlowDiagram, StoryDefinition } from "@meltemi/diagrams-model";
import {
  animatedScene,
  motionOptions,
  planMotion,
  sceneAt,
  storyFrame,
} from "@meltemi/diagrams-motion";
import {
  effectsDocument,
  framesPage,
  playerFragment,
  playerPage,
  rootView,
  storyDocument,
  type DrillViews,
  type LaidOutView,
  type PlayerDocument,
} from "@meltemi/diagrams-player";
import type { FileCompilation, Workspace } from "@meltemi/diagrams-project";
import { renderSvg, type FontPolicy } from "@meltemi/diagrams-render";
import { viewClosure } from "./drill.js";
import { layoutIn, storyLayoutsIn } from "./layouts.js";
import { messages } from "./messages/index.js";
import type { ProjectSessions } from "./projects.js";

/** Formats this version writes. */
export const WRITABLE_FORMATS = ["svg", "png", "pdf", "html", "mp4", "webm", "gif"] as const;
const VIDEO = ["mp4", "webm", "gif"] as const;
/** The size and frame rate of a video when nothing else is said (decision 0026). */
export const VIDEO_DEFAULTS = {
  mp4: { width: 1920, height: 1080, fps: 30 },
  webm: { width: 1920, height: 1080, fps: 30 },
  gif: { width: 960, height: 540, fps: 15 },
} as const;
export type WritableFormat = (typeof WRITABLE_FORMATS)[number];
type Writable = WritableFormat;
type Size = { readonly width: number; readonly height: number };

/** The largest side of a captured picture, in pixels. */
export const MAX_PIXELS = 16384;

/** One output: what to draw, how, and where it goes (null: standard output). */
export interface ExportRequest {
  readonly target:
    | { readonly kind: "diagram"; readonly diagram: FlowDiagram; readonly owner: FileCompilation }
    | { readonly kind: "story"; readonly story: StoryDefinition };
  readonly format: Writable;
  readonly theme: string | null;
  readonly fonts: FontPolicy;
  readonly motion: "static" | "animated";
  readonly at: number | null;
  readonly scenario: string | undefined;
  readonly scale: number;
  readonly size: Size | null;
  /** `transparent`, a CSS colour or `@<token>`; null for the theme's. */
  readonly background: string | null;
  readonly link: string | null;
  readonly embed: boolean;
  readonly autoplay: boolean;
  readonly loop: boolean;
  /** Videos: frames per second, or null for the format's default. */
  readonly fps: number | null;
  /** Videos: how long they last, or null for the story's or the effects' end. */
  readonly durationMs: number | null;
  readonly out: string | null;
  /**
   * The language of the words the export adds (C4 type lines, the player's controls); the
   * project's `locale` when left out.
   */
  readonly locale?: Locale;
}

/** What an export needs of its file and project. */
export interface ExportContext {
  readonly file: FileCompilation;
  readonly workspace: Workspace;
  readonly projects: ProjectSessions;
  /** The player's runtime script, for HTML outputs. */
  readonly playerScript: () => string;
  /** Reports the layout diagnostics of a file, as its project path. */
  readonly report: (path: string, diagnostics: readonly Diagnostic[]) => void;
  /** Diagnostics of `file` already reported, by code and offset. */
  readonly printed: ReadonlySet<string>;
}

/** The language of what an export adds: the request's, else the project's, else English. */
function contentLocale(context: ExportContext, request: ExportRequest): Locale {
  return request.locale ?? context.projects.contentLocale(context.workspace);
}

/** Lays out a diagram with the themes, fonts and images of the file that defines it. */
function layoutOf(
  context: ExportContext,
  owner: FileCompilation,
  diagram: FlowDiagram,
  theme: string | null,
  scenario: string | undefined,
  locale: Locale,
): LayoutResult {
  const result = layoutIn(
    context.workspace,
    context.projects,
    owner,
    diagram,
    theme,
    scenario,
    locale,
  );
  const own = owner === context.file;
  context.report(
    owner.path,
    result.diagnostics.filter(
      (d) => !own || !context.printed.has(`${d.code}@${d.range.start.offset}`),
    ),
  );
  return result;
}

/** The laid-out views of a story, by view key, or undefined when one cannot be drawn. */
function storyLayouts(
  context: ExportContext,
  story: StoryDefinition,
  theme: string | null,
  locale: Locale,
): Map<string, LaidOutView> | undefined {
  return storyLayoutsIn(context.workspace, context.file, story, (owner, diagram) =>
    layoutOf(context, owner, diagram, theme, undefined, locale),
  );
}

/** The scene with the request's background and picture link, and the background for capture. */
function decorate(
  scene: Scene,
  request: ExportRequest,
  colors: Readonly<Record<string, unknown>> | undefined,
): { scene: Scene; background: string } {
  let background = scene.background;
  if (request.background === "transparent") background = "transparent";
  else if (request.background?.startsWith("@")) {
    const token = colors?.[request.background.slice(1)];
    if (typeof token === "string") background = token;
  } else if (request.background) background = request.background;
  return {
    scene: {
      ...scene,
      background: background === "transparent" ? "none" : background,
      ...(request.link ? { link: request.link } : {}),
    },
    background,
  };
}

/**
 * The views a drill-down reaches from a diagram across its project, laid out like the diagram
 * (its theme override, the content language), with what each element opens.
 */
function drillViews(
  context: ExportContext,
  request: ExportRequest,
  owner: FileCompilation,
  diagram: FlowDiagram,
  layout: LayoutResult,
  locale: Locale,
): DrillViews {
  const program = context.workspace.compileProject();
  const sources = context.workspace.sources();
  const root = program.files.get(owner.path) ?? owner;
  const rootDiagram =
    root.compilation.document.diagrams.find((d) => d.id === diagram.id) ?? diagram;
  return viewClosure(program, sources, { owner: root, diagram: rootDiagram }, layout, (view) =>
    layoutOf(context, view.owner, view.diagram, request.theme, undefined, locale),
  );
}

function playerHtml(
  doc: PlayerDocument,
  request: ExportRequest,
  script: string,
  lang: Locale,
): string {
  const options = { autoplay: request.autoplay, loop: request.loop, lang };
  return request.embed ? playerFragment(doc, script, options) : playerPage(doc, script, options);
}

/** A picture for the browser: its SVG with embedded fonts, at the output size. */
function captureJob(
  context: ExportContext,
  scene: Scene,
  background: string,
  request: ExportRequest,
): CaptureJob {
  return {
    kind: request.format as "png" | "pdf",
    svg: renderSvg(scene, {
      fonts: "embedded",
      provider: context.projects.fontsFor(context.workspace),
    }),
    width: request.size?.width ?? scene.width,
    height: request.size?.height ?? scene.height,
    scale: request.format === "png" ? request.scale : 1,
    background,
  };
}

/**
 * The text of an output, or the picture the browser captures, or the video it records (with the
 * player document its frames are drawn from); a message when it cannot be made. The command line,
 * the editor and the playground write what this returns. What the export adds is in the content
 * language; its messages are in the interface language.
 */
export function produceExport(
  context: ExportContext,
  request: ExportRequest,
):
  | { text: string; views?: number }
  | { job: CaptureJob }
  | { video: VideoJob; document: PlayerDocument }
  | { problem: string } {
  const provider = context.projects.fontsFor(context.workspace);
  const fontsFor = (policy: FontPolicy) => (policy === "embedded" ? { fonts: provider } : {});
  if ((VIDEO as readonly string[]).includes(request.format)) return produceVideo(context, request);
  const problems = messages().exports;
  let scene: Scene;
  let colors: Readonly<Record<string, unknown>> | undefined;
  if (request.target.kind === "story") {
    const layouts = storyLayouts(
      context,
      request.target.story,
      request.theme,
      contentLocale(context, request),
    );
    const doc =
      layouts &&
      storyDocument(request.target.story, layouts, {
        ...fontsFor(request.fonts),
        locale: contentLocale(context, request),
      });
    if (!doc) return { problem: problems.storyNotDrawn(request.target.story.id) };
    if (request.format === "html")
      return {
        text: playerHtml(doc, request, context.playerScript(), contentLocale(context, request)),
      };
    const frame = storyFrame(
      doc.timeline,
      (key) => doc.views[key],
      request.at ?? doc.timeline.durationMs,
      { accent: doc.accent },
    );
    if (!frame) return { problem: problems.nothingToDraw(request.target.story.id) };
    scene = frame;
    colors = [...layouts!.values()][0]?.layout.theme as unknown as Record<string, unknown>;
  } else {
    const { diagram, owner } = request.target;
    const result = layoutOf(
      context,
      owner,
      diagram,
      request.theme,
      request.scenario,
      contentLocale(context, request),
    );
    if (!result.scene) return { problem: problems.cannotDraw(diagram.id) };
    if (request.format === "html") {
      const locale = contentLocale(context, request);
      const drill = drillViews(context, request, owner, diagram, result, locale);
      const doc = effectsDocument(
        { diagram, layout: result },
        { ...fontsFor(request.fonts), locale, drill },
      );
      return doc
        ? {
            text: playerHtml(doc, request, context.playerScript(), locale),
            views: Object.keys(doc.views).length,
          }
        : { problem: problems.cannotDraw(diagram.id) };
    }
    colors = result.theme as unknown as Record<string, unknown>;
    scene = result.scene;
    if (request.motion === "animated" || request.at !== null) {
      const plan = planMotion(diagram, scene, motionOptions(result.theme));
      scene = request.at !== null ? sceneAt(scene, plan, request.at) : animatedScene(scene, plan);
    }
  }
  const decorated = decorate(scene, request, colors);
  if (request.format === "svg") {
    return { text: renderSvg(decorated.scene, { fonts: request.fonts, provider }) };
  }
  const job = captureJob(context, decorated.scene, decorated.background, request);
  if (job.width * (job.scale ?? 1) > MAX_PIXELS || job.height * (job.scale ?? 1) > MAX_PIXELS) {
    return {
      problem: problems.tooLarge(
        request.format.toUpperCase(),
        Math.round(job.width * (job.scale ?? 1)),
        Math.round(job.height * (job.scale ?? 1)),
        MAX_PIXELS,
      ),
    };
  }
  return { job };
}

/**
 * A video: the player document of the story or of the diagram's effects (with embedded fonts), and
 * the page that draws its frames at the output size.
 */
function produceVideo(
  context: ExportContext,
  request: ExportRequest,
): { video: VideoJob; document: PlayerDocument } | { problem: string } {
  const format = request.format as (typeof VIDEO)[number];
  const fonts = { fonts: context.projects.fontsFor(context.workspace) };
  const problems = messages().exports;
  let doc: PlayerDocument | undefined;
  let duration: number | null;
  let colors: Readonly<Record<string, unknown>> | undefined;
  if (request.target.kind === "story") {
    const layouts = storyLayouts(
      context,
      request.target.story,
      request.theme,
      contentLocale(context, request),
    );
    const story = layouts && storyDocument(request.target.story, layouts, fonts);
    if (!story) return { problem: problems.storyNotDrawn(request.target.story.id) };
    doc = story;
    duration = request.durationMs ?? story.timeline.durationMs;
    colors = [...layouts!.values()][0]?.layout.theme as unknown as Record<string, unknown>;
  } else {
    const { diagram, owner } = request.target;
    const result = layoutOf(
      context,
      owner,
      diagram,
      request.theme,
      request.scenario,
      contentLocale(context, request),
    );
    const effects = result.scene ? effectsDocument({ diagram, layout: result }, fonts) : undefined;
    if (!effects) return { problem: problems.cannotDraw(diagram.id) };
    doc = effects;
    duration = request.durationMs ?? rootView(effects).durationMs;
    colors = result.theme as unknown as Record<string, unknown>;
    if (duration === null || duration === 0) {
      return {
        problem: duration === null ? problems.endless(diagram.id) : problems.still(diagram.id),
      };
    }
  }
  if (format === "mp4" && request.background === "transparent") {
    return { problem: problems.transparentMp4 };
  }
  const scene = doc.kind === "story" ? Object.values(doc.views)[0]!.scene : rootView(doc).scene;
  const background = decorate(scene, request, colors).background;
  const defaults = VIDEO_DEFAULTS[format];
  const width = request.size?.width ?? defaults.width;
  const height = request.size?.height ?? defaults.height;
  if (width > MAX_PIXELS || height > MAX_PIXELS) {
    return { problem: problems.videoSide(MAX_PIXELS) };
  }
  return {
    video: {
      format,
      html: framesPage(doc, context.playerScript(), { width, height, background }),
      width,
      height,
      fps: request.fps ?? defaults.fps,
      durationMs: duration!,
      background,
      out: request.out!,
    },
    document: doc,
  };
}

/**
 * The request of a profile, or why it cannot run. The output is named as the profile says
 * (`<stem>.<profile>.<format>` by default) and `place` turns that name into where it is written.
 */
export function profileRequest(
  context: ExportContext,
  profile: ExportProfile,
  stem: string,
  place: (name: string) => string,
): ExportRequest | string {
  const errors = context.file.diagnostics.some(
    (d) =>
      d.severity === "error" &&
      d.range.start.offset >= profile.range.start.offset &&
      d.range.end.offset <= profile.range.end.offset,
  );
  const problems = messages().exports;
  if (errors || profile.format === null) return problems.profileProblems;
  const format = profile.format as Writable;
  let target: ExportRequest["target"];
  if (profile.target.kind === "story" && profile.target.story) {
    target = { kind: "story", story: profile.target.story };
  } else if (profile.target.kind === "diagram" && profile.target.diagram) {
    const owner =
      profile.target.file === null ? context.file : context.workspace.file(profile.target.file);
    const diagram = owner?.compilation.document.diagrams.find(
      (d) => d.id === profile.target.diagram!.id,
    );
    if (!owner || !diagram || diagram.hasErrors) return problems.cannotDraw(profile.target.name);
    target = { kind: "diagram", diagram, owner };
  } else return problems.notExportable(profile.target.name);
  const name = profile.file ?? `${stem}.${profile.id}.${format}`;
  return {
    target,
    format,
    theme: profile.theme,
    fonts: profile.fonts ?? "embedded",
    motion: profile.motion ?? "static",
    at: profile.atMs,
    scenario: profile.scenario ?? undefined,
    scale: profile.scale ?? 2,
    size: profile.size,
    background: profile.background,
    link: profile.link,
    embed: profile.embed,
    autoplay: profile.autoplay,
    loop: profile.loop,
    fps: profile.fps,
    durationMs: profile.durationMs,
    out: place(name),
  };
}
