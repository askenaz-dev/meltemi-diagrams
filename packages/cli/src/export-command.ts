import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { captureSync, type FileJob, type VideoJob } from "@meltemi/diagrams-capture";
import {
  MAX_PIXELS,
  WRITABLE_FORMATS,
  produceExport,
  profileOutputs,
  profileRequest,
  type ExportContext,
  type ExportRequest,
  type ProjectSessions,
  type WritableFormat,
} from "@meltemi/diagrams-editor/node";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { THEME_COLOR_TOKENS, isSafeUrl, type Compilation } from "@meltemi/diagrams-model";
import { parseTime } from "@meltemi/diagrams-motion";
import { playerScript } from "@meltemi/diagrams-player/node";
import { toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import type { FontPolicy } from "@meltemi/diagrams-render";

import { exportFileName } from "@meltemi/diagrams-editor";
import { argumentsError, messages } from "./messages/index.js";

export { WRITABLE_FORMATS, exportFileName };

/** What `export` needs from the command line around it. */
export interface ExportHost {
  readonly name: string;
  readonly io: {
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
    readonly cwd: string;
  };
  readonly display: (path: string) => string;
  readonly projects: () => ProjectSessions;
  readonly readSource: (path: string) => { file: string; text: string } | undefined;
  readonly projectDiagnostics: (workspace: Workspace) => Map<string, readonly Diagnostic[]>;
  readonly printDiagnostics: (
    out: (text: string) => void,
    path: string,
    diagnostics: readonly Diagnostic[],
  ) => void;
}

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;
const MELTEMI_EXTENSION = ".meltemi";

export const FONT_POLICIES = ["embedded", "outlined", "system"] as const;
export const MOTION_MODES = ["static", "animated"] as const;
type Writable = WritableFormat;
type Size = { readonly width: number; readonly height: number };

/** The `--background` word or colour, as profiles store it, or undefined when it is not one. */
function readBackground(value: string): string | undefined {
  if (value === "transparent") return value;
  if ((THEME_COLOR_TOKENS as readonly string[]).includes(value)) return `@${value}`;
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i.test(value) ? value : undefined;
}

/** `1920x1080` as a size within the capture's limits. */
function readSize(value: string): Size | undefined {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const fits = (n: number) => n >= 16 && n <= MAX_PIXELS;
  return fits(width) && fits(height) ? { width, height } : undefined;
}

/** Writes an export and says so; false (after reporting it) when the file cannot be written. */
function writeOutput(host: ExportHost, target: string, text: string, views = 1): boolean {
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
  } catch (error) {
    host.io.stderr(
      `${host.name} export: ${messages().common.cannotWrite(host.display(target), (error as Error).message)}\n`,
    );
    return false;
  }
  host.io.stdout(
    `${views > 1 ? messages().export.wroteViews(host.display(target), views) : messages().common.wrote(host.display(target))}\n`,
  );
  return true;
}

/** Writes the outputs: text at once, pictures and videos in one browser session. */
function writeAll(
  host: ExportHost,
  outputs: { request: ExportRequest; output: ReturnType<typeof produceExport> }[],
): number {
  let failed = false;
  const jobs: FileJob[] = [];
  const videos: VideoJob[] = [];
  // What each output chose because nothing said (a duration, a background, a size), said after it.
  const notices = new Map<string, readonly string[]>();
  const tell = (out: string) => {
    for (const notice of notices.get(out) ?? []) {
      host.io.stderr(`${host.display(out)}: ${notice}\n`);
    }
  };
  for (const { request, output } of outputs) {
    if ("problem" in output) {
      host.io.stderr(`${host.name} export: ${output.problem}\n`);
      failed = true;
      continue;
    }
    if (output.notices && request.out !== null) notices.set(request.out, output.notices);
    if ("text" in output) {
      if (request.out === null) host.io.stdout(output.text);
      else if (!writeOutput(host, request.out, output.text, output.views)) return EXIT_USAGE;
      else tell(request.out);
      continue;
    }
    if ("video" in output) videos.push(output.video);
    else jobs.push({ ...output.job, out: request.out! });
  }
  if (jobs.length > 0 || videos.length > 0) {
    let result: ReturnType<typeof captureSync>;
    try {
      for (const job of [...jobs, ...videos]) mkdirSync(dirname(job.out), { recursive: true });
      result = captureSync(jobs, { videos });
    } catch (error) {
      host.io.stderr(`${host.name} export: ${(error as Error).message}\n`);
      return EXIT_USAGE;
    }
    const t = messages().export;
    for (const job of jobs) {
      host.io.stdout(`${t.wrotePicture(host.display(job.out), result.browser)}\n`);
      tell(job.out);
    }
    videos.forEach((video, i) => {
      host.io.stdout(
        `${t.wroteVideo(host.display(video.out), result.browser, result.ffmpeg, result.frames[i]!)}\n`,
      );
      tell(video.out);
    });
  }
  return failed ? EXIT_FINDINGS : EXIT_OK;
}

export function noDiagramDiagnostic(compilation: Compilation): Diagnostic {
  const first = compilation.document.unsupported[0];
  const types = [...new Set(compilation.document.unsupported.map((u) => u.profile))];
  const others = compilation.document.stories.length + compilation.document.exports.length > 0;
  const t = messages().export;
  return {
    code: "export.no-diagram",
    severity: "error",
    message: t.noDiagram(types),
    range: first?.range ?? compilation.parse.lines.range({ start: 0, end: 0 }),
    hints: [others ? t.noDiagramStoriesHint : t.noDiagramTypesHint],
  };
}

/**
 * `meltemi-diagrams export`: diagrams, story frames, players and profiles of a file, or of every
 * file of a project folder.
 */
export function exportCommand(args: readonly string[], host: ExportHost): number {
  const { io, name } = host;
  const usage = (message: string) => {
    io.stderr(`${name} export: ${message}\n`);
    return EXIT_USAGE;
  };
  let options: {
    diagram?: string;
    scenario?: string;
    story?: string;
    profile?: string;
    profiles: boolean;
    format?: string;
    out?: string;
    theme?: string;
    fonts?: string;
    motion?: string;
    at?: string;
    scale?: string;
    size?: string;
    background?: string;
    link?: string;
    fps?: string;
    duration?: string;
    embed: boolean;
    stdout: boolean;
  };
  let paths: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        diagram: { type: "string" },
        scenario: { type: "string" },
        story: { type: "string" },
        profile: { type: "string" },
        profiles: { type: "boolean", default: false },
        format: { type: "string" },
        out: { type: "string" },
        theme: { type: "string" },
        fonts: { type: "string" },
        motion: { type: "string" },
        at: { type: "string" },
        scale: { type: "string" },
        size: { type: "string" },
        background: { type: "string" },
        link: { type: "string" },
        fps: { type: "string" },
        duration: { type: "string" },
        embed: { type: "boolean", default: false },
        stdout: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    options = parsed.values as typeof options;
    paths = parsed.positionals;
  } catch (error) {
    return usage(argumentsError(error));
  }
  const t = messages().export;
  if (paths.length !== 1) return usage(t.onePath);

  // Profiles carry every option themselves.
  const profileMode = options.profile !== undefined || options.profiles;
  if (profileMode) {
    if (options.profile !== undefined && options.profiles) return usage(t.profileOrProfiles);
    const given = (
      [
        ["format", options.format],
        ["diagram", options.diagram],
        ["story", options.story],
        ["scenario", options.scenario],
        ["theme", options.theme],
        ["fonts", options.fonts],
        ["motion", options.motion],
        ["at", options.at],
        ["scale", options.scale],
        ["size", options.size],
        ["background", options.background],
        ["link", options.link],
        ["fps", options.fps],
        ["duration", options.duration],
      ] as const
    ).find(([, value]) => value !== undefined);
    const flag = given
      ? `--${given[0]}`
      : options.embed
        ? "--embed"
        : options.stdout
          ? "--stdout"
          : null;
    if (flag) return usage(t.profileOption(flag));
    if (options.out !== undefined) {
      const out = isAbsolute(options.out) ? options.out : resolve(io.cwd, options.out);
      let isDirectory: boolean;
      try {
        isDirectory = statSync(out).isDirectory();
      } catch {
        isDirectory = false;
      }
      if (!isDirectory) return usage(t.profilesOut);
    }
  }

  const format = options.format ?? "svg";
  if (!(WRITABLE_FORMATS as readonly string[]).includes(format)) {
    return usage(t.format(format, WRITABLE_FORMATS));
  }
  const fonts = options.fonts ?? "embedded";
  if (!(FONT_POLICIES as readonly string[]).includes(fonts)) {
    return usage(t.fonts(fonts, FONT_POLICIES));
  }
  const motion = options.motion ?? "static";
  if (!(MOTION_MODES as readonly string[]).includes(motion)) {
    return usage(t.motion(motion, MOTION_MODES));
  }
  let at: number | null = null;
  if (options.at !== undefined) {
    at = parseTime(options.at);
    if (at === null) return usage(t.at(options.at));
    if (motion === "animated") return usage(t.atAnimated);
  }
  if (options.story !== undefined) {
    const clash =
      options.diagram !== undefined
        ? "--diagram"
        : options.scenario !== undefined
          ? "--scenario"
          : motion === "animated"
            ? "--motion animated"
            : null;
    if (clash) return usage(t.story(clash));
  }
  const picture = format === "png" || format === "pdf";
  const video = format === "mp4" || format === "webm" || format === "gif";
  if (format === "html") {
    const clash =
      at !== null
        ? "--at"
        : motion === "animated"
          ? "--motion animated"
          : fonts === "outlined"
            ? "--fonts outlined"
            : null;
    if (clash) return usage(t.html(clash));
  } else if (options.embed) {
    return usage(t.embed);
  }
  if (picture && motion === "animated") return usage(t.picture(format));
  if (video) {
    const clash =
      at !== null
        ? "--at"
        : motion === "animated"
          ? "--motion animated"
          : options.link
            ? "--link"
            : null;
    if (clash) return usage(t.video(format, clash));
  }
  if ((picture || video) && options.stdout) return usage(t.stdoutFile(format));
  let fps: number | null = null;
  if (options.fps !== undefined) {
    if (!video) return usage(t.fpsVideo);
    fps = Number(options.fps);
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) return usage(t.fps(options.fps));
  }
  let durationMs: number | null = null;
  if (options.duration !== undefined) {
    if (!video) return usage(t.durationVideo);
    durationMs = parseTime(options.duration);
    if (durationMs === null || durationMs <= 0 || durationMs > 600_000) {
      return usage(t.duration(options.duration));
    }
  }
  let scale = 2;
  if (options.scale !== undefined) {
    if (format !== "png") return usage(t.scalePng);
    scale = Number(options.scale);
    if (!(scale >= 1 && scale <= 8)) return usage(t.scale(options.scale));
  }
  let size: Size | null = null;
  if (options.size !== undefined) {
    if (!picture && !video) return usage(t.sizeOutput);
    size = readSize(options.size) ?? null;
    if (!size) return usage(t.size(MAX_PIXELS, options.size));
  }
  let background: string | null = null;
  if (options.background !== undefined) {
    if (format === "html") return usage(t.backgroundHtml);
    background = readBackground(options.background) ?? null;
    if (!background) return usage(t.background(options.background));
  }
  if (options.link !== undefined) {
    if (format !== "svg" && format !== "pdf") return usage(t.linkFormats);
    if (!isSafeUrl(options.link)) return usage(t.link(options.link));
  }

  // A folder exports every file of its project below it, with the same options.
  const given = isAbsolute(paths[0]!) ? paths[0]! : resolve(io.cwd, paths[0]!);
  let folderMode = false;
  try {
    folderMode = statSync(given).isDirectory();
  } catch {
    // Not found: reading the file reports it.
  }
  if (folderMode) {
    const clash =
      options.diagram !== undefined
        ? "--diagram"
        : options.story !== undefined
          ? "--story"
          : options.scenario !== undefined
            ? "--scenario"
            : options.stdout
              ? "--stdout"
              : null;
    if (clash) return usage(t.oneFile(clash));
  }
  // With --stdout, stdout holds only the output; diagnostics go to stderr.
  const log = options.stdout ? io.stderr : io.stdout;
  const projects = host.projects();
  const base = {
    theme: options.theme ?? null,
    fonts: fonts as FontPolicy,
    motion: motion as "static" | "animated",
    at,
    scale,
    size,
    background,
    link: options.link ?? null,
    embed: options.embed,
    autoplay: false,
    loop: false,
    fps,
    durationMs,
  };
  const outRoot =
    options.out === undefined
      ? null
      : isAbsolute(options.out)
        ? options.out
        : resolve(io.cwd, options.out);
  const outputs: { request: ExportRequest; output: ReturnType<typeof produceExport> }[] = [];
  let failed = false;
  let profilesFound = 0;

  /**
   * Plans the outputs of one file. In a folder, files without diagrams or without the profile are
   * passed over, and outputs under --out keep the file's folder.
   */
  const planFile = (
    workspace: Workspace,
    sourceFile: string,
    folderOut: string | null,
  ): string | undefined => {
    const projectPath = toProjectPath(sourceFile);
    const path = host.display(sourceFile);
    const file = workspace.file(projectPath)!;
    const compilation = file.compilation;
    host.printDiagnostics(log, path, file.diagnostics);
    const context: ExportContext = {
      file,
      workspace,
      projects,
      playerScript,
      report: (where, diagnostics) => host.printDiagnostics(log, host.display(where), diagnostics),
      printed: new Set(file.diagnostics.map((d) => `${d.code}@${d.range.start.offset}`)),
    };
    // Diagrams without errors are still exported when other blocks of the file have problems.
    if (file.diagnostics.some((d) => d.severity === "error")) failed = true;
    const stem = basename(sourceFile, MELTEMI_EXTENSION);
    const folder = dirname(sourceFile);
    const push = (request: ExportRequest) =>
      outputs.push({ request, output: produceExport(context, request) });

    /** Where an output goes: --out as a file or a directory, or beside the source. */
    const outTarget = (name: string, many: boolean): string | null | false => {
      if (options.stdout) return null;
      if (folderOut !== null) return join(folderOut, name);
      if (outRoot === null) return join(folder, name);
      let isDirectory = false;
      try {
        isDirectory = statSync(outRoot).isDirectory();
      } catch {
        // Not an existing directory: treat the path as a file name.
      }
      if (isDirectory) return join(outRoot, name);
      return many ? false : outRoot;
    };

    if (profileMode) {
      const all = compilation.document.exports;
      const chosen =
        options.profile === undefined ? all : all.filter((p) => p.id === options.profile);
      profilesFound += chosen.length;
      if (chosen.length === 0) {
        if (folderMode) return undefined;
        return options.profile === undefined
          ? t.noProfiles(path)
          : t.noProfile(
              options.profile,
              path,
              all.map((p) => p.id),
            );
      }
      for (const profile of chosen) {
        const request = profileRequest(
          context,
          profile,
          stem,
          profileOutputs(folder, folderOut ?? options.out, io.cwd),
        );
        if (typeof request === "string") {
          io.stderr(`${name} export: ${profile.id}: ${request}\n`);
          failed = true;
          continue;
        }
        push(request);
      }
      return undefined;
    }

    if (options.story !== undefined) {
      const story = compilation.document.stories.find((s) => s.id === options.story);
      if (!story) {
        const available = compilation.document.stories.map((s) => s.id);
        return t.noStory(options.story, path, available);
      }
      const out = outTarget(`${stem}.${story.id}.${format}`, false);
      push({
        ...base,
        target: { kind: "story", story },
        format: format as Writable,
        scenario: undefined,
        out: out === false ? null : out,
      });
      return undefined;
    }

    const renderable = compilation.document.diagrams.filter((d) => !d.hasErrors);
    let selected = renderable;
    if (options.diagram !== undefined) {
      selected = renderable.filter((d) => d.id === options.diagram);
      if (selected.length === 0) {
        const available = renderable.map((d) => d.id);
        return messages().common.noDiagram(options.diagram, path, available);
      }
    }
    if (selected.length === 0) {
      // In a folder, models, themes and stories have nothing to draw on their own.
      if (folderMode && compilation.document.diagrams.length === 0) return undefined;
      host.printDiagnostics(log, path, [noDiagramDiagnostic(compilation)]);
      failed = true;
      return undefined;
    }
    if (options.scenario !== undefined) {
      // Only the sequence diagrams that declare the scenario.
      const declaring = selected.filter((d) => d.scenarios.some((s) => s.id === options.scenario));
      if (declaring.length === 0) {
        const available = [...new Set(selected.flatMap((d) => d.scenarios.map((s) => s.id)))];
        return t.noScenario(options.scenario, path, available);
      }
      selected = declaring;
    }
    if (options.stdout && selected.length > 1) return t.stdoutOne;
    for (const diagram of selected) {
      // One diagram: named after the file. Several: the diagram id keeps the outputs apart, and a
      // scenario adds its id.
      const fileName = exportFileName(
        stem,
        diagram.id,
        compilation.document.diagrams.length,
        options.scenario,
        format,
      );
      const out = outTarget(fileName, selected.length > 1);
      if (out === false) return t.severalDiagrams(path, selected.length);
      push({
        ...base,
        target: { kind: "diagram", diagram, owner: file },
        format: format as Writable,
        scenario: options.scenario,
        out,
      });
    }
    return undefined;
  };

  if (folderMode) {
    const folder = toProjectPath(given);
    const workspace = projects.forFolder(folder);
    for (const [problemPath, diagnostics] of host.projectDiagnostics(workspace)) {
      host.printDiagnostics(log, host.display(problemPath), diagnostics);
      if (diagnostics.some((d) => d.severity === "error")) failed = true;
    }
    const files = workspace
      .sources()
      .filter((path) => path === folder || path.startsWith(`${folder}/`));
    if (files.length === 0) return usage(t.noFiles(host.display(given)));
    for (const path of files) {
      const relativeFolder = dirname(relative(folder, path));
      const folderOut =
        outRoot === null ? null : relativeFolder === "." ? outRoot : join(outRoot, relativeFolder);
      const problem = planFile(workspace, path, folderOut);
      if (problem !== undefined) return usage(problem);
    }
    if (profileMode && profilesFound === 0) {
      return usage(
        options.profile === undefined
          ? t.noProfiles(host.display(given))
          : t.noFileWithProfile(host.display(given), options.profile),
      );
    }
  } else {
    const source = host.readSource(paths[0]!);
    if (!source) return EXIT_USAGE;
    const workspace = projects.forFile(toProjectPath(source.file));
    for (const [problemPath, diagnostics] of host.projectDiagnostics(workspace)) {
      host.printDiagnostics(log, host.display(problemPath), diagnostics);
      if (diagnostics.some((d) => d.severity === "error")) failed = true;
    }
    const problem = planFile(workspace, source.file, null);
    if (problem !== undefined) return usage(problem);
  }

  const code = writeAll(host, outputs);
  return code === EXIT_USAGE ? code : failed || code === EXIT_FINDINGS ? EXIT_FINDINGS : EXIT_OK;
}
