import {
  MAX_PIXELS,
  VIDEO_DEFAULTS,
  exportFileName,
  produceExport,
  profileRequest,
  type DocumentAnalysis,
  type ExportContext,
  type ExportRequest,
  type WritableFormat,
} from "@meltemi/diagrams-editor";
import { LOCALES, isLocale, type Locale } from "@meltemi/diagrams-i18n";
import {
  BUILT_IN_THEMES,
  THEME_COLOR_TOKENS,
  isSafeUrl,
  type ExportProfile,
  type StoryDefinition,
} from "@meltemi/diagrams-model";
import {
  defaultMotionDuration,
  motionDuration,
  motionLoop,
  motionOptions,
  parseTime,
  planMotion,
  storyTimeline,
} from "@meltemi/diagrams-motion";
import type { FontPolicy } from "@meltemi/diagrams-render";
import { LANGUAGE_NAMES } from "../language.js";
import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { announce, download, field, h, openDialog, select } from "../ui.js";
import { downloadCatalog, stemOf } from "./files.js";
import { printPicture } from "./print.js";
import { pngOf } from "./raster.js";
import { VideoCancelled, recordVideo, videoSupport } from "./video.js";

/** The formats of the dialog, in the order it lists them. */
const FORMATS: readonly WritableFormat[] = ["svg", "png", "pdf", "html", "gif", "webm", "mp4"];
const VIDEO = new Set<WritableFormat>(["gif", "webm", "mp4"]);
const TYPES: Readonly<Record<string, string>> = {
  svg: "image/svg+xml",
  html: "text/html;charset=utf-8",
};

/**
 * What an export did: whether it was made (downloaded, or shown in the print dialog), and what to
 * tell the person. Callers decide by the flag, never by the words, which are in their language.
 */
export interface Outcome {
  readonly ok: boolean;
  readonly message: string;
}

const failed = (message: string): Outcome => ({ ok: false, message });

let playerScript: Promise<string> | undefined;

/** The player runtime written into HTML exports and video frames, fetched once. */
function player(): Promise<string> {
  playerScript ??= fetch("assets/player.js", { credentials: "same-origin" }).then((r) => {
    if (!r.ok) throw new Error(messages().exports.playerUnreadable);
    return r.text();
  });
  return playerScript;
}

/** What an export needs of the open file, with the studio's current compiler. */
function exportContext(playground: Playground, script: string): ExportContext | undefined {
  const studio = playground.studio;
  if (!studio.open.endsWith(".meltemi")) return undefined;
  const projects = studio.projects;
  const absolute = studio.absolute(studio.open);
  const workspace = projects.forFile(absolute);
  const file = workspace.file(absolute);
  if (!file) return undefined;
  return {
    file,
    workspace,
    projects,
    playerScript: () => script,
    report: () => undefined,
    printed: new Set(),
  };
}

/**
 * The language of the words exports add, as the open file's project sets it (`locale` in
 * project.json), else English: what the dialog's language starts from.
 */
function projectLocale(playground: Playground): Locale {
  const studio = playground.studio;
  return studio.projects.contentLocale(studio.projects.forFile(studio.absolute(studio.open)));
}

type Built = { request: ExportRequest; name: string } | string;

/**
 * Produces an export with every font and icon it reads, and writes it: a download, the print
 * dialog, or a recorded video.
 */
async function run(
  playground: Playground,
  build: (context: ExportContext) => Built,
  progress?: { bar: HTMLProgressElement; text: HTMLElement; signal: AbortSignal },
): Promise<Outcome> {
  const m = messages().exports;
  const script = await player();
  const produced = await playground.studio.settled(
    ():
      | { readonly ok: false; readonly problem: string }
      | {
          readonly ok: true;
          readonly built: Exclude<Built, string>;
          readonly output: ReturnType<typeof produceExport>;
          readonly notices: readonly string[];
        } => {
      const context = exportContext(playground, script);
      if (!context) return { ok: false, problem: m.openSource };
      const built = build(context);
      if (typeof built === "string") return { ok: false, problem: built };
      // The browser's encoders have no alpha: a transparent WebM takes the theme's background
      // here, and the command line keeps the transparency.
      if (built.request.format === "webm" && built.request.background === "transparent") {
        const request = { ...built.request, background: null };
        return {
          ok: true,
          built: { ...built, request },
          output: produceExport(context, request),
          notices: [m.webmBackground],
        };
      }
      return { ok: true, built, output: produceExport(context, built.request), notices: [] };
    },
  );
  if (!produced.ok) return failed(produced.problem);
  const { built, output } = produced;
  if ("problem" in output) return failed(output.problem);
  const name = built.name;
  // What the export chose because nothing said (a duration, a background, a size) follows.
  const unbranded = built.request.branding === "none" ? [m.unbrandedNotice] : [];
  const told = (message: string) =>
    [message, ...produced.notices, ...(output.notices ?? []), ...unbranded].join(" ");
  if ("text" in output) {
    download(name, output.text, TYPES[built.request.format] ?? "text/plain");
    return { ok: true, message: told(m.downloaded(name)) };
  }
  if ("job" in output) {
    if (output.job.kind === "png") {
      download(name, (await pngOf(output.job)) as Uint8Array<ArrayBuffer>, "image/png");
      return { ok: true, message: told(m.downloaded(name)) };
    }
    await printPicture(output.job);
    return { ok: true, message: told(m.printing(name)) };
  }
  const controller = progress ?? {
    bar: h("progress"),
    text: h("span"),
    signal: new AbortController().signal,
  };
  try {
    const video = await recordVideo(
      output.video,
      output.document,
      (done, total) => {
        controller.bar.max = total;
        controller.bar.value = done;
        controller.text.textContent = m.frame(done, total);
      },
      controller.signal,
      `Meltemi Diagrams ${playground.options.version}`,
    );
    download(name, video.data as Uint8Array<ArrayBuffer>, video.type);
    return {
      ok: true,
      message: told(
        m.downloadedVideo(name, output.video.width, output.video.height, output.video.fps),
      ),
    };
  } catch (error) {
    if (error instanceof VideoCancelled) return failed(m.cancelled);
    return failed(error instanceof Error ? error.message : String(error));
  }
}

/** Writes the HTML player of a story, or opens the dialog on the HTML player of the diagram. */
export async function writePlayer(
  playground: Playground,
  story: string | undefined,
): Promise<void> {
  if (story === undefined) {
    openExportDialog(playground, { format: "html" });
    return;
  }
  const stem = stemOf(playground.studio.open);
  const outcome = await run(playground, (context) => {
    const target = context.file.compilation.document.stories.find((s) => s.id === story);
    if (!target) return messages().exports.noStory(story);
    return {
      request: baseRequest({ kind: "story", story: target }, "html"),
      name: `${stem}.${story}.html`,
    };
  });
  playground.status(outcome.message);
}

function baseRequest(target: ExportRequest["target"], format: WritableFormat): ExportRequest {
  return {
    target,
    format,
    theme: null,
    fonts: "embedded",
    motion: "static",
    at: null,
    scenario: undefined,
    scale: 2,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    durationMs: null,
    out: null,
  };
}

/** `1920x1080` within the capture's limits. */
function readSize(value: string): { width: number; height: number } | undefined {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value.trim());
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const fits = (n: number) => n >= 16 && n <= MAX_PIXELS;
  return fits(width) && fits(height) ? { width, height } : undefined;
}

/** `transparent`, a token as `@name`, or a CSS colour. */
function readBackground(value: string): string | undefined {
  if (value === "transparent") return value;
  if ((THEME_COLOR_TOKENS as readonly string[]).includes(value)) return `@${value}`;
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i.test(value) ? value : undefined;
}

/** A length as the Duration field takes it: `6s`, `2.3s`. */
const asField = (ms: number) => `${Math.round(ms / 100) / 10}s`;

/**
 * What an empty Duration field gives a video, as its placeholder: the story's length, the end of
 * finite effects, one loop of endless ones, or the second of a diagram without moving effects.
 */
function durationShown(
  story: StoryDefinition | undefined,
  view: DocumentAnalysis["diagrams"][number] | undefined,
): string {
  const m = messages().exports;
  if (story) return m.durationStory(asField(storyTimeline(story).durationMs));
  const scene = view?.layout?.scene;
  if (!view || !scene) return m.durationPlaceholder;
  const plan = planMotion(view.diagram, scene, motionOptions(view.layout!.theme));
  const finite = motionDuration(plan);
  if (finite) return m.durationFinite(asField(finite));
  const ms = defaultMotionDuration(plan);
  if (plan.effects.length === 0) return m.durationStill(asField(ms));
  return motionLoop(plan) !== null ? m.durationLoop(asField(ms)) : m.durationLongest(asField(ms));
}

/**
 * Opens the export dialog on the open file: the diagram on the canvas, or a story; the file's
 * profiles; and the project's catalog. Its language is the one of the words the exports add, from
 * the project's `locale`, else English.
 */
export function openExportDialog(
  playground: Playground,
  preset: { format?: WritableFormat } = {},
): void {
  const m = messages().exports;
  const analysis = playground.studio.document();
  if (!analysis) {
    playground.status(m.openSource);
    return;
  }
  const document = analysis.compilation.document;
  const diagrams = analysis.diagrams.filter((d) => d.layout?.scene);
  const stories = document.stories;
  if (diagrams.length === 0 && stories.length === 0) {
    playground.status(m.nothingToDraw);
    return;
  }
  const current = playground.studio.session.current;
  const targets = [
    ...diagrams.map((d) => ({ value: `diagram:${d.id}`, label: m.diagram(d.id, d.title) })),
    ...stories.map((s) => ({ value: `story:${s.id}`, label: m.story(s.id, s.title) })),
  ];
  const what = select(
    targets,
    diagrams.some((d) => d.id === current) ? `diagram:${current}` : targets[0]!.value,
  );
  const format = select(
    FORMATS.map((value) => ({ value, label: m.formats[value] })),
    preset.format ?? "svg",
  );
  const themes = [...new Set([...BUILT_IN_THEMES, ...analysis.themes.map((t) => t.id)])];
  const theme = select(
    [{ value: "", label: m.ownTheme }, ...themes.map((t) => ({ value: t, label: t }))],
    "",
  );
  // Each language is listed by its own name.
  const language = select(
    LOCALES.map((locale) => ({ value: locale, label: LANGUAGE_NAMES[locale] })),
    projectLocale(playground),
  );
  for (const option of language.options) option.lang = option.value;
  const locale = (): Locale => (isLocale(language.value) ? language.value : "en");
  const scenario = select([{ value: "", label: m.everyMessage }]);
  const fonts = select(
    [
      { value: "embedded", label: m.fontPolicies.embedded },
      { value: "outlined", label: m.fontPolicies.outlined },
      { value: "system", label: m.fontPolicies.system },
    ],
    "embedded",
  );
  const motion = select([
    { value: "static", label: m.motions.static },
    { value: "animated", label: m.motions.animated },
  ]);
  const at = h("input", { type: "text", placeholder: m.atPlaceholder, spellcheck: "false" });
  const scale = h("input", { type: "number", min: 1, max: 8, step: 1, value: 2 });
  const size = h("input", {
    type: "text",
    placeholder: m.sizePlaceholder,
    spellcheck: "false",
  });
  const background = h("input", {
    type: "text",
    placeholder: m.backgroundPlaceholder,
    spellcheck: "false",
  });
  const link = h("input", { type: "url", placeholder: "https://…", spellcheck: "false" });
  const embed = h("input", { type: "checkbox" });
  const autoplay = h("input", { type: "checkbox" });
  const loop = h("input", { type: "checkbox" });
  const fps = h("input", { type: "number", min: 1, max: 60, step: 1, placeholder: "30 (GIF 15)" });
  const duration = h("input", {
    type: "text",
    placeholder: m.durationPlaceholder,
    spellcheck: "false",
  });
  const check = (label: string, input: HTMLInputElement, hint?: string) => {
    const box = h("label", { class: "check" }, input, h("span", {}, label));
    if (!hint) return box;
    const note = h("span", { class: "field-hint", id: `${input.id}-hint` }, hint);
    input.setAttribute("aria-describedby", note.id);
    return h("div", { class: "field" }, box, note);
  };
  // Exports without the Meltemi branding, for an account an administrator entitled: the box is
  // built for nobody else, and starts unchecked each time the dialog opens.
  const session = playground.options.session;
  const entitled = session.kind === "cookie" && session.user.entitlements.unbranded;
  const branding = h("input", { type: "checkbox", id: "export-unbranded" });

  const rows: Record<string, HTMLElement> = {
    scenario: field(m.scenario, scenario),
    fonts: field(m.fonts, fonts),
    motion: field(m.effects, motion),
    at: field(m.instant, at, m.instantHint),
    scale: field(m.scale, scale, m.scaleHint),
    size: field(m.size, size, m.sizeHint),
    background: field(m.background, background),
    link: field(m.link, link, m.linkHint),
    embed: check(m.embed, embed),
    autoplay: check(m.autoplay, autoplay),
    loop: check(m.loop, loop),
    fps: field(m.fps, fps),
    duration: field(m.duration, duration),
  };
  const support = h("p", { class: "field-hint", role: "status" });
  const problem = h("p", { class: "field-problem", role: "alert" });
  const bar = h("progress", { max: 1, value: 0, hidden: true });
  const progressText = h("span", { class: "field-hint" });
  let abort: AbortController | undefined;

  const show = () => {
    const f = format.value as WritableFormat;
    const story = what.value.startsWith("story:");
    const diagram = diagrams.find((d) => `diagram:${d.id}` === what.value);
    const visible = new Set<string>();
    if (f === "svg")
      ["fonts", "at", "background", "link", ...(story ? [] : ["motion"])].forEach((r) =>
        visible.add(r),
      );
    if (f === "png") ["at", "scale", "size", "background"].forEach((r) => visible.add(r));
    if (f === "pdf") ["at", "size", "background", "link"].forEach((r) => visible.add(r));
    if (f === "html") ["fonts", "embed", "autoplay", "loop"].forEach((r) => visible.add(r));
    if (VIDEO.has(f)) ["size", "background", "fps", "duration"].forEach((r) => visible.add(r));
    const scenarios = diagram?.diagram.type === "sequence" ? diagram.diagram.scenarios : [];
    if (scenarios.length > 0 && !story && f !== "html" && !VIDEO.has(f)) visible.add("scenario");
    scenario.replaceChildren(
      h("option", { value: "" }, m.everyMessage),
      ...scenarios.map((s) =>
        h("option", { value: s.id }, s.label ? `${s.id} · ${s.label}` : s.id),
      ),
    );
    for (const [name, row] of Object.entries(rows)) row.hidden = !visible.has(name);
    support.textContent = "";
    if (exportButton) exportButton.disabled = false;
    if (VIDEO.has(f)) {
      const defaults = VIDEO_DEFAULTS[f as "gif" | "webm" | "mp4"];
      size.placeholder = `${defaults.width}x${defaults.height}`;
      fps.placeholder = String(defaults.fps);
      void videoSupport(f as "gif" | "webm" | "mp4").then((reason) => {
        if (format.value !== f) return;
        support.textContent = reason ? m.commandLine(reason, f) : "";
        // A format the browser cannot make cannot be chosen.
        if (exportButton) exportButton.disabled = reason !== undefined;
      });
    } else size.placeholder = m.sizePlaceholder;
    if (f === "pdf") support.textContent = m.pdfHint;
    duration.placeholder = durationShown(
      stories.find((s) => `story:${s.id}` === what.value),
      diagram,
    );
  };
  what.addEventListener("change", show);
  format.addEventListener("change", show);

  /** The request of the form, or why it cannot be made. */
  const build = (context: ExportContext): Built => {
    const f = format.value as WritableFormat;
    const stem = stemOf(playground.studio.open);
    const [kind, id] = what.value.split(":") as ["diagram" | "story", string];
    let target: ExportRequest["target"];
    let name: string;
    if (kind === "story") {
      const story = context.file.compilation.document.stories.find((s) => s.id === id);
      if (!story) return m.noStory(id);
      target = { kind: "story", story };
      name = `${stem}.${id}.${f}`;
    } else {
      const diagram = context.file.compilation.document.diagrams.find((d) => d.id === id);
      if (!diagram) return m.noDiagram(id);
      target = { kind: "diagram", diagram, owner: context.file };
      const chosen = rows.scenario!.hidden ? undefined : scenario.value || undefined;
      name = exportFileName(stem, id, context.file.compilation.document.diagrams.length, chosen, f);
    }
    const request = {
      ...baseRequest(target, f),
      theme: theme.value || null,
      locale: locale(),
    } as {
      -readonly [K in keyof ExportRequest]: ExportRequest[K];
    };
    if (entitled && branding.checked) request.branding = "none";
    if (!rows.scenario!.hidden && scenario.value) request.scenario = scenario.value;
    if (!rows.fonts!.hidden) request.fonts = fonts.value as FontPolicy;
    if (!rows.motion!.hidden) request.motion = motion.value as "static" | "animated";
    if (!rows.at!.hidden && at.value.trim()) {
      const time = parseTime(at.value.trim());
      if (time === null || time < 0) return m.badInstant(at.value);
      request.at = time;
    }
    if (!rows.scale!.hidden) {
      const value = Number(scale.value || 2);
      if (!(value >= 1 && value <= 8)) return m.badScale;
      request.scale = value;
    }
    if (!rows.size!.hidden && size.value.trim()) {
      const value = readSize(size.value);
      if (!value) return m.badSize(MAX_PIXELS);
      request.size = value;
    }
    if (!rows.background!.hidden && background.value.trim()) {
      const value = readBackground(background.value.trim());
      if (!value) return m.badBackground;
      request.background = value;
    }
    if (!rows.link!.hidden && link.value.trim()) {
      if (!isSafeUrl(link.value.trim())) return m.badLink;
      request.link = link.value.trim();
    }
    if (!rows.embed!.hidden) request.embed = embed.checked;
    if (!rows.autoplay!.hidden) request.autoplay = autoplay.checked;
    if (!rows.loop!.hidden) request.loop = loop.checked;
    if (!rows.fps!.hidden && fps.value) {
      const value = Number(fps.value);
      if (!Number.isInteger(value) || value < 1 || value > 60) return m.badFps;
      request.fps = value;
    }
    if (!rows.duration!.hidden && duration.value.trim()) {
      const value = parseTime(duration.value.trim());
      if (value === null || value <= 0 || value > 600_000) return m.badDuration;
      request.durationMs = value;
    }
    if (request.embed && f === "html") name = name.replace(/\.html$/, ".fragment.html");
    return { request, name };
  };

  const exportNow = async () => {
    problem.textContent = "";
    const f = format.value as WritableFormat;
    const video = VIDEO.has(f);
    abort = video ? new AbortController() : undefined;
    bar.hidden = !video;
    progressText.textContent = video ? m.drawing : "";
    const outcome = await run(
      playground,
      build,
      video ? { bar, text: progressText, signal: abort!.signal } : undefined,
    );
    abort = undefined;
    bar.hidden = true;
    progressText.textContent = "";
    if (!outcome.ok) {
      problem.textContent = outcome.message;
      // A cancelled recording closed the dialog; the status line says what happened.
      if (!dialog.open) playground.status(outcome.message);
      return false;
    }
    playground.status(outcome.message);
    announce(outcome.message);
    return true;
  };

  const profiles = analysis.compilation.document.exports;
  const profileList = h("ul", { class: "profiles" });
  for (const profile of profiles) {
    const button = h(
      "button",
      {
        type: "button",
        class: "button with-text",
        "aria-label": m.exportProfile(profile.id),
      },
      m.export,
    );
    button.addEventListener("click", async () => {
      button.disabled = true;
      const outcome = await runProfile(playground, profile, { bar, text: progressText }, locale());
      button.disabled = false;
      playground.status(outcome.message);
      problem.textContent = outcome.ok ? "" : outcome.message;
    });
    profileList.append(
      h(
        "li",
        {},
        h(
          "span",
          { class: "profile-name" },
          h("code", {}, profile.id),
          " ",
          m.profile(profile.format ?? "?", profile.target.name),
        ),
        button,
      ),
    );
  }

  // The project's catalog, in the dialog's language.
  const catalogButton = h(
    "button",
    { type: "button", class: "button with-text", "aria-label": m.exportCatalog },
    m.export,
  );
  catalogButton.addEventListener("click", async () => {
    catalogButton.disabled = true;
    problem.textContent = "";
    try {
      await downloadCatalog(
        playground,
        locale(),
        entitled && branding.checked ? "none" : undefined,
      );
    } finally {
      catalogButton.disabled = false;
    }
  });

  const dialog = openDialog(
    m.title,
    [
      field(m.what, what),
      field(m.format, format),
      support,
      field(m.theme, theme),
      ...(entitled ? [check(m.unbranded, branding, m.unbrandedHint)] : []),
      field(m.language, language, m.languageHint),
      ...Object.values(rows),
      ...(profiles.length > 0
        ? [h("h3", {}, m.profiles), h("p", { class: "field-hint" }, m.profilesHint), profileList]
        : []),
      h("h3", {}, m.catalog),
      h(
        "div",
        { class: "catalog-export" },
        h("span", { class: "field-hint" }, m.catalogHint),
        catalogButton,
      ),
      h("div", { class: "progress-row" }, bar, progressText),
      problem,
    ],
    [
      { label: messages().dialog.cancel, run: () => void abort?.abort() },
      { label: m.export, primary: true, run: exportNow },
    ],
    { wide: true },
  );
  const exportButton = dialog.querySelector<HTMLButtonElement>(".dialog-actions .primary");
  dialog.addEventListener("close", () => abort?.abort());
  show();
  what.focus();
}

/**
 * Runs an export profile of the open file, its output named as the profile says; the words the
 * export adds are in `locale`, else the project's language.
 */
export async function runProfile(
  playground: Playground,
  profile: ExportProfile,
  progress?: { bar: HTMLProgressElement; text: HTMLElement },
  locale?: Locale,
): Promise<Outcome> {
  const m = messages().exports;
  const stem = stemOf(playground.studio.open);
  const abort = new AbortController();
  if (progress) progress.bar.hidden = !VIDEO.has(profile.format as WritableFormat);
  const outcome = await run(
    playground,
    (context) => {
      const fresh = context.file.compilation.document.exports.find((p) => p.id === profile.id);
      if (!fresh) return m.profileGone(profile.id);
      const request = profileRequest(context, fresh, stem, (name) => name);
      if (typeof request === "string") return `${profile.id}: ${request}`;
      return {
        request: locale ? { ...request, locale } : request,
        name: request.out!.slice(request.out!.lastIndexOf("/") + 1),
      };
    },
    progress ? { ...progress, signal: abort.signal } : undefined,
  );
  if (progress) progress.bar.hidden = true;
  return outcome;
}
