import { DEFAULT_LOCALE, resolveLocale } from "@meltemi/diagrams-i18n";
import type { SceneItem } from "@meltemi/diagrams-layout";
import type { PlayerDocument, ViewDetails } from "./format.js";

export interface ElementOptions {
  readonly autoplay?: boolean;
  readonly loop?: boolean;
  readonly static?: boolean;
  /** False hides playback/zoom controls; keyboard and fullscreen remain. True by default. */
  readonly controls?: boolean;
  /** False omits the text summary. True by default. */
  readonly summary?: boolean;
  /** False omits inspection details, keeping zoom and pan. True by default. */
  readonly details?: boolean;
  /** False omits the fullscreen affordance. True by default. */
  readonly fullscreen?: boolean;
  /** False omits optional document/story descriptions from the exported data. */
  readonly description?: boolean;
  /**
   * A document of several stories: the id of the story shown first, written as the element's
   * `story` attribute; the first story when it names none of them.
   */
  readonly story?: string;
  /**
   * The language of the player's words, such as `es`. The element carries it as its `lang` when
   * it is not English; a player speaks the language of its element or page, else English.
   */
  readonly lang?: string;
}

export interface PageOptions extends ElementOptions {
  /** False omits the visible page heading. True by default. */
  readonly heading?: boolean;
  /** The language of the page and of the player's words; `en` by default. */
  readonly lang?: string;
}

/** The content security policy of a player page: inline content, no request. */
export const PLAYER_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep only metadata needed by the chosen presentation, without changing frames or timing. */
function presentationData(document: PlayerDocument, options: ElementOptions): PlayerDocument {
  if (options.details !== false && options.description !== false) return document;
  let details = document.details;
  if (options.details === false) {
    details = {};
    // A text summary distinguishes Gantt bars from strokes by kind. No descriptive data is needed.
    if (options.summary !== false) {
      details = Object.fromEntries(
        Object.entries(document.details).map(([key, view]) => [
          key,
          {
            elements: Object.fromEntries(
              Object.entries(view.elements)
                .filter(([, item]) => item.kind === "task")
                .map(([id]) => [
                  id,
                  {
                    kind: "task",
                    type: null,
                    technology: null,
                    description: null,
                    url: null,
                    external: false,
                    entity: null,
                    opens: null,
                  },
                ]),
            ),
            relations: {},
            c4: null,
            parent: null,
          } satisfies ViewDetails,
        ]),
      );
    }
  }
  const description = options.description === false ? null : document.description;
  const itemsWithoutLinks = (items: readonly SceneItem[]): SceneItem[] =>
    items.map((item) => {
      if (item.kind !== "group") return item;
      const group = { ...item, items: itemsWithoutLinks(item.items) };
      delete group.href;
      return group;
    });
  const views = Object.fromEntries(
    Object.entries(document.views).map(([key, view]) => {
      const scene = {
        ...view.scene,
        ...(options.description === false ? { description: null } : {}),
        ...(options.details === false ? { items: itemsWithoutLinks(view.scene.items) } : {}),
      };
      if (options.details === false) delete scene.link;
      return [key, { ...view, scene }];
    }),
  );
  return document.kind === "story"
    ? {
        ...document,
        views: views as typeof document.views,
        details,
        description,
        stories: document.stories.map((story) => ({
          ...story,
          description: options.description === false ? null : story.description,
        })),
      }
    : { ...document, views: views as typeof document.views, details, description };
}

/**
 * The document as JSON safe inside a `<script>` element: `<` is escaped, so nothing in it can
 * close the script, and so are the line separators JavaScript reads as line breaks.
 */
export function playerData(document: PlayerDocument): string {
  return JSON.stringify(document)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** A script's code, safe inside a `<script>` element of a page. */
export function inlineScript(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

/** The `<meltemi-player>` element with its data. */
export function playerElement(document: PlayerDocument, options: ElementOptions = {}): string {
  const attributes = [
    options.lang !== undefined && resolveLocale(options.lang) !== DEFAULT_LOCALE
      ? ` lang="${escapeHtml(options.lang)}"`
      : "",
    options.autoplay ? " autoplay" : "",
    options.loop ? " loop" : "",
    options.static ? " static" : "",
    options.controls === false ? ' controls="false"' : "",
    options.summary === false ? ' summary="false"' : "",
    options.details === false ? ' details="false"' : "",
    options.fullscreen === false ? ' fullscreen="false"' : "",
    options.story !== undefined ? ` story="${escapeHtml(options.story)}"` : "",
  ].join("");
  return `<meltemi-player${attributes}><script type="application/json">${playerData(presentationData(document, options))}</script></meltemi-player>`;
}

/**
 * A fragment to paste into a page: the element, its data and the runtime. Pasting it more than
 * once is fine; the element is defined once.
 */
export function playerFragment(
  document: PlayerDocument,
  script: string,
  options: ElementOptions = {},
): string {
  return `${playerElement(document, options)}\n<script>${inlineScript(script)}</script>\n`;
}

/**
 * A complete page that plays the document offline: data, fonts and runtime inline. The page's
 * `lang` gives the player its language.
 */
export function playerPage(
  document: PlayerDocument,
  script: string,
  options: PageOptions = {},
): string {
  const { lang = DEFAULT_LOCALE, heading = true, ...element } = options;
  const title = document.title ?? document.id;
  const description = options.description === false ? null : document.description;
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // The page's own data and script only: nothing is fetched (decision 0030).
    `<meta http-equiv="Content-Security-Policy" content="${PLAYER_POLICY}">`,
    // An empty icon: browsers would otherwise ask the server for /favicon.ico, which the policy blocks.
    '<link rel="icon" href="data:,">',
    `<title>${escapeHtml(title)}</title>`,
    ...(description ? [`<meta name="description" content="${escapeHtml(description)}">`] : []),
    '<meta name="generator" content="Meltemi Diagrams">',
    "<style>",
    "html { color-scheme: light dark; }",
    "body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: Canvas; color: CanvasText; }",
    "main { max-width: 1200px; margin: 0 auto; }",
    "h1 { font-size: 1.25rem; margin: 0 0 4px; }",
    "p { margin: 0 0 16px; color: GrayText; }",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    ...(heading ? [`<h1>${escapeHtml(title)}</h1>`] : []),
    ...(description ? [`<p>${escapeHtml(description)}</p>`] : []),
    playerElement(document, element),
    "</main>",
    `<script>${inlineScript(script)}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export interface FramesPageOptions {
  /** The output size; the picture is fitted and centred. */
  readonly width: number;
  readonly height: number;
  /** A CSS colour, `transparent`, or null for the drawing's own background. */
  readonly background: string | null;
  /** Diagrams: the drawing without effects. */
  readonly static?: boolean;
}

/**
 * A page that draws any frame of the document at the output size, for video capture: it defines
 * `__draw(t)`, which draws the frame at `t` milliseconds and resolves once the fonts are ready and
 * the frame is on screen. A document of several stories draws its first story's frames.
 */
export function framesPage(
  document: PlayerDocument,
  script: string,
  options: FramesPageOptions,
): string {
  const width = Math.round(options.width);
  const height = Math.round(options.height);
  const background = options.background ?? "transparent";
  const css = /^[#\w(),.%\s-]+$/.test(background) ? background : "transparent";
  const drawOptions = JSON.stringify({
    static: options.static === true,
    background: options.background,
  }).replace(/</g, "\\u003c");
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8"><style>',
    `html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${css}; }`,
    `#frame > svg { display: block; width: ${width}px; height: ${height}px; }`,
    "</style></head><body>",
    '<div id="frame"></div>',
    `<script type="application/json" id="meltemi-document">${playerData(document)}</script>`,
    `<script>${inlineScript(script)}</script>`,
    "<script>",
    "(() => {",
    '  const data = JSON.parse(document.getElementById("meltemi-document").textContent);',
    '  const style = document.createElement("style");',
    '  style.textContent = data.fontFaces.join("\\n");',
    "  document.head.append(style);",
    '  const frame = document.getElementById("frame");',
    `  const options = ${drawOptions};`,
    "  window.__draw = (t) => {",
    "    frame.innerHTML = MeltemiPlayer.frameSvg(data, t, options);",
    "    return document.fonts.ready.then(",
    "      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),",
    "    );",
    "  };",
    "})();",
    "</script>",
    "</body></html>",
    "",
  ].join("\n");
}
