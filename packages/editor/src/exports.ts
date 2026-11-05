import type { Locale } from "@meltemi/diagrams-i18n";
import type { CaptureJob, VideoJob } from "@meltemi/diagrams-capture";
import type { Diagnostic } from "@meltemi/diagrams-language";
import type { LayoutResult, Scene } from "@meltemi/diagrams-layout";
import type { ExportProfile, FlowDiagram, StoryDefinition } from "@meltemi/diagrams-model";
import {
  animatedScene,
  defaultMotionDuration,
  motionLoop,
  motionOptions,
  planMotion,
  sceneAt,
  sceneStills,
  storyFrame,
} from "@meltemi/diagrams-motion";
import {
  effectsDocument,
  framesPage,
  playerFragment,
  playerPage,
  rootView,
  storiesDocument,
  storyDocument,
  type DrillViews,
  type LaidOutView,
  type PlayerDocument,
  type StoryPlayerDocument,
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
    | { readonly kind: "story"; readonly story: StoryDefinition }
    /** Stories of the file in one HTML player, in this order, over the views they share. */
    | { readonly kind: "stories"; readonly stories: readonly StoryDefinition[] };
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
   * A story as SVG, PNG or PDF: a picture of every scene's final state, the frame the player's
   * static view shows (`sceneStills`), instead of one frame; false when left out. SVG and PNG give
   * a file per scene, named after `out` with the scene's id before the extension; PDF one file
   * with a page per scene.
   */
  readonly scenes?: boolean;
  /**
   * The language of the words the export adds (C4 type lines, the player's controls); the
   * project's `locale` when left out.
   */
  readonly locale?: Locale;
  /**
   * Whether the pictures carry the theme's frame, the Meltemi strip at the foot of the sheet
   * (`"theme"`, when left out), or leave it out (`"none"`), whatever the theme says, in every
   * layout the export makes: the diagram, a story's views, the player's views and a video's frames.
   */
  readonly branding?: "theme" | "none";
}

/** The layout's frame option for a request: `"none"` for an export without the branding. */
const frameOf = (request: ExportRequest): "none" | undefined =>
  request.branding === "none" ? "none" : undefined;

/**
 * What an export makes: a text, a picture to capture or a video to record, with the notices of what
 * it chose because nothing said (a duration, a background, a size), in the interface language; or
 * the reason it cannot be made.
 */
export type ExportOutput =
  | ((
      | {
          text: string;
          views?: number;
          /** A player of several stories: the ids of the stories it holds, in order. */
          stories?: readonly string[];
        }
      | { job: CaptureJob }
      | { video: VideoJob; document: PlayerDocument }
      /** The SVG of every scene of a story, in scene order. */
      | { texts: readonly SceneOutput<string>[] }
      /** The PNG of every scene of a story to capture, in scene order. */
      | { jobs: readonly SceneOutput<CaptureJob>[] }
    ) & { readonly notices?: readonly string[] })
  | { problem: string };

/** The picture of one scene: its id, its file's name and path (null without `out`), and what it is. */
export interface SceneOutput<T> {
  readonly scene: string;
  /** `<stem>.<story>.<scene>.<ext>`, or the scene's id before the extension of `out`'s name. */
  readonly name: string;
  readonly out: string | null;
  readonly output: T;
}

/** A file name with a scene's id before its extension: `a.purchase.svg` to `a.purchase.overview.svg`. */
export function sceneFileName(name: string, scene: string): string {
  const dot = name.lastIndexOf(".");
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return dot > slash ? `${name.slice(0, dot)}.${scene}${name.slice(dot)}` : `${name}.${scene}`;
}

/** The file name of a source without its folder and `.meltemi`. */
const stemOfPath = (path: string) =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1).replace(/\.meltemi$/, "");

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
  frame: "none" | undefined,
): LayoutResult {
  const result = layoutIn(
    context.workspace,
    context.projects,
    owner,
    diagram,
    theme,
    scenario,
    locale,
    frame,
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

/**
 * The laid-out views of a story, by view key, or undefined when one cannot be drawn. With `cache`,
 * a view laid out for another story of the same request is taken from it, so it is laid out (and
 * its diagnostics reported) once.
 */
function storyLayouts(
  context: ExportContext,
  story: StoryDefinition,
  theme: string | null,
  locale: Locale,
  frame: "none" | undefined,
  cache?: Map<string, LayoutResult>,
): Map<string, LaidOutView> | undefined {
  return storyLayoutsIn(context.workspace, context.file, story, (owner, diagram) => {
    const key = `${owner.path}#${diagram.id}`;
    const known = cache?.get(key);
    if (known) return known;
    const result = layoutOf(context, owner, diagram, theme, undefined, locale, frame);
    cache?.set(key, result);
    return result;
  });
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
    layoutOf(context, view.owner, view.diagram, request.theme, undefined, locale, frameOf(request)),
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
export function produceExport(context: ExportContext, request: ExportRequest): ExportOutput {
  const provider = context.projects.fontsFor(context.workspace);
  const fontsFor = (policy: FontPolicy) => (policy === "embedded" ? { fonts: provider } : {});
  const problems = messages().exports;
  if (request.scenes) {
    if (request.target.kind !== "story") return { problem: problems.scenesStory };
    if (request.format !== "svg" && request.format !== "png" && request.format !== "pdf")
      return { problem: problems.scenesFormat };
    if (request.at !== null) return { problem: problems.scenesAt };
  }
  if (request.target.kind === "stories") return produceStories(context, request);
  if ((VIDEO as readonly string[]).includes(request.format)) return produceVideo(context, request);
  let scene: Scene;
  let colors: Readonly<Record<string, unknown>> | undefined;
  if (request.target.kind === "story") {
    const layouts = storyLayouts(
      context,
      request.target.story,
      request.theme,
      contentLocale(context, request),
      frameOf(request),
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
    colors = [...layouts!.values()][0]?.layout.theme as unknown as Record<string, unknown>;
    if (request.scenes) return produceScenes(context, request, doc, colors);
    const { timeline } = doc.stories[0]!;
    const frame = storyFrame(timeline, (key) => doc.views[key], request.at ?? timeline.durationMs, {
      accent: doc.accent,
    });
    if (!frame) return { problem: problems.nothingToDraw(request.target.story.id) };
    scene = frame;
  } else {
    const { diagram, owner } = request.target;
    const result = layoutOf(
      context,
      owner,
      diagram,
      request.theme,
      request.scenario,
      contentLocale(context, request),
      frameOf(request),
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
  const fitted = fitPicture(captureJob(context, decorated.scene, decorated.background, request));
  return fitted.notice ? { job: fitted.job, notices: [fitted.notice] } : { job: fitted.job };
}

/**
 * The player of several stories: each story's views laid out once for the request, a story that
 * cannot be drawn left out with a notice, and the page of the others.
 */
function produceStories(context: ExportContext, request: ExportRequest): ExportOutput {
  const problems = messages().exports;
  if (request.target.kind !== "stories") return { problem: problems.storiesHtml };
  if (request.format !== "html") return { problem: problems.storiesHtml };
  const locale = contentLocale(context, request);
  const cache = new Map<string, LayoutResult>();
  const stories = request.target.stories;
  const built = storiesDocument(
    stories.map((story) => ({
      story,
      layouts:
        storyLayouts(context, story, request.theme, locale, frameOf(request), cache) ?? new Map(),
    })),
    {
      ...(request.fonts === "embedded"
        ? { fonts: context.projects.fontsFor(context.workspace) }
        : {}),
      locale,
    },
  );
  const doc = built.document;
  if (!doc) return { problem: problems.storiesNotDrawn(stories.map((s) => s.id)) };
  const notices = built.left.map((id) => problems.storyLeftOut(id));
  return {
    text: playerHtml(doc, request, context.playerScript(), locale),
    stories: doc.stories.map((s) => s.id),
    ...(notices.length > 0 ? { notices } : {}),
  };
}

/**
 * The pictures of every scene of a story: the frame of each scene's final state (`sceneStills`),
 * as SVG texts or PNG jobs named after the scene, or one PDF with a page per scene, every page the
 * largest frame's size (or the request's) with its frame fitted and centred.
 */
function produceScenes(
  context: ExportContext,
  request: ExportRequest,
  doc: StoryPlayerDocument,
  colors: Readonly<Record<string, unknown>> | undefined,
): ExportOutput {
  const problems = messages().exports;
  const provider = context.projects.fontsFor(context.workspace);
  const { id, timeline } = doc.stories[0]!;
  const frames: { scene: string; drawn: { scene: Scene; background: string } }[] = [];
  for (const still of sceneStills(timeline)) {
    const frame = storyFrame(timeline, (key) => doc.views[key], still.atMs, { accent: doc.accent });
    if (!frame) return { problem: problems.nothingToDraw(id) };
    frames.push({ scene: still.id, drawn: decorate(frame, request, colors) });
  }
  if (frames.length === 0) return { problem: problems.noScenes(id) };
  const base = request.out ?? `${stemOfPath(context.file.path)}.${id}.${request.format}`;
  const named = <T>(scene: string, output: T): SceneOutput<T> => {
    const out = sceneFileName(base, scene);
    return {
      scene,
      name: out.slice(Math.max(out.lastIndexOf("/"), out.lastIndexOf("\\")) + 1),
      out: request.out === null ? null : out,
      output,
    };
  };
  if (request.format === "svg") {
    return {
      texts: frames.map(({ scene, drawn }) =>
        named(scene, renderSvg(drawn.scene, { fonts: request.fonts, provider })),
      ),
    };
  }
  const notices = new Set<string>();
  if (request.format === "png") {
    const jobs = frames.map(({ scene, drawn }) => {
      const fitted = fitPicture(captureJob(context, drawn.scene, drawn.background, request));
      if (fitted.notice) notices.add(fitted.notice);
      return named(scene, fitted.job);
    });
    return { jobs, ...(notices.size > 0 ? { notices: [...notices] } : {}) };
  }
  // One PDF: pages of one size, the largest frame's, each frame fitted and centred on its page.
  const width = request.size?.width ?? Math.max(...frames.map((f) => f.drawn.scene.width));
  const height = request.size?.height ?? Math.max(...frames.map((f) => f.drawn.scene.height));
  const svgOf = (scene: Scene) => renderSvg(scene, { fonts: "embedded", provider });
  const pages = frames.map(({ drawn }) => ({
    svg: svgOf(drawn.scene),
    background: drawn.background,
  }));
  const first = frames[0]!.drawn;
  const fitted = fitPicture({
    kind: "pdf",
    svg: pages[0]!.svg,
    width,
    height,
    scale: 1,
    background: first.background,
    pages,
  });
  return fitted.notice ? { job: fitted.job, notices: [fitted.notice] } : { job: fitted.job };
}

/**
 * A picture whose side would pass `MAX_PIXELS` made as large as fits, keeping its proportions: a
 * PNG at a smaller scale, a PDF on a smaller page; with the notice naming the pixels used.
 */
function fitPicture(job: CaptureJob): { job: CaptureJob; notice?: string } {
  const scale = job.scale ?? 1;
  const factor = Math.min(1, MAX_PIXELS / (job.width * scale), MAX_PIXELS / (job.height * scale));
  if (factor >= 1) return { job };
  const fitted: CaptureJob =
    job.kind === "png"
      ? { ...job, scale: scale * factor }
      : {
          ...job,
          width: Math.floor(job.width * factor),
          height: Math.floor(job.height * factor),
        };
  const used = fitted.scale ?? 1;
  return {
    job: fitted,
    notice: messages().exports.notices.clamped(
      Math.round(fitted.width * used),
      Math.round(fitted.height * used),
      MAX_PIXELS,
    ),
  };
}

/**
 * A video: the player document of the story or of the diagram's effects (with embedded fonts), and
 * the page that draws its frames at the output size.
 */
function produceVideo(context: ExportContext, request: ExportRequest): ExportOutput {
  const format = request.format as (typeof VIDEO)[number];
  const fonts = { fonts: context.projects.fontsFor(context.workspace) };
  const problems = messages().exports;
  const notices: string[] = [];
  let doc: PlayerDocument | undefined;
  let duration: number;
  let colors: Readonly<Record<string, unknown>> | undefined;
  if (request.target.kind === "stories") return { problem: problems.storiesHtml };
  if (request.target.kind === "story") {
    const layouts = storyLayouts(
      context,
      request.target.story,
      request.theme,
      contentLocale(context, request),
      frameOf(request),
    );
    const story = layouts && storyDocument(request.target.story, layouts, fonts);
    if (!story) return { problem: problems.storyNotDrawn(request.target.story.id) };
    doc = story;
    duration = request.durationMs || story.stories[0]!.timeline.durationMs;
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
      frameOf(request),
    );
    const effects = result.scene ? effectsDocument({ diagram, layout: result }, fonts) : undefined;
    if (!effects) return { problem: problems.cannotDraw(diagram.id) };
    doc = effects;
    colors = result.theme as unknown as Record<string, unknown>;
    // A given duration wins, then the end of finite effects; endless or still effects take the
    // default, which the notice names.
    const view = rootView(effects);
    if (request.durationMs) duration = request.durationMs;
    else if (view.durationMs) duration = view.durationMs;
    else {
      duration = defaultMotionDuration(view.plan);
      const notices_ = problems.notices;
      notices.push(
        view.plan.effects.length === 0
          ? notices_.stillDuration(diagram.id, duration)
          : motionLoop(view.plan) !== null
            ? notices_.defaultDuration(diagram.id, duration)
            : notices_.longestDuration(diagram.id, duration),
      );
    }
  }
  // MP4 has no transparency: it takes the theme's background, as the canvas shows it.
  let drawn = request;
  if (format === "mp4" && request.background === "transparent") {
    drawn = { ...request, background: null };
    notices.push(problems.notices.mp4Background);
  }
  const scene = doc.kind === "story" ? Object.values(doc.views)[0]!.scene : rootView(doc).scene;
  const background = decorate(scene, drawn, colors).background;
  const defaults = VIDEO_DEFAULTS[format];
  let width = request.size?.width ?? defaults.width;
  let height = request.size?.height ?? defaults.height;
  const factor = Math.min(1, MAX_PIXELS / width, MAX_PIXELS / height);
  if (factor < 1) {
    width = Math.floor(width * factor);
    height = Math.floor(height * factor);
    notices.push(problems.notices.clamped(width, height, MAX_PIXELS));
  }
  return {
    video: {
      format,
      html: framesPage(doc, context.playerScript(), { width, height, background }),
      width,
      height,
      fps: request.fps ?? defaults.fps,
      durationMs: duration,
      background,
      out: request.out!,
    },
    document: doc,
    ...(notices.length > 0 ? { notices } : {}),
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
    // A story's picture per scene: files named after the profile's, the scene before the extension.
    ...(profile.scenes && target.kind === "story" ? { scenes: true } : {}),
  };
}
