import { DEFAULT_LOCALE, resolveLocale } from "@meltemi/diagrams-i18n";
import { inlineScript } from "@meltemi/diagrams-player";
import type { CatalogData } from "./data.js";
import { messages } from "./messages/index.js";
import { escapeHtml, navView, pageView } from "./views.js";

/**
 * The content security policy of the catalog: inline scripts and styles, `data:` and `blob:`
 * pictures and fonts, and nothing from the network (decision 0027).
 */
export const CATALOG_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";

export interface CatalogPageOptions {
  /**
   * The language of the page and of its words, such as `es`; `en` by default. The runtime reads it
   * back from the page, so every page after the first, and the players, use it too.
   */
  readonly lang?: string;
  /**
   * The preview server's event stream: the page reloads, keeping its route and scroll, when the
   * server says the sources changed. The policy then allows that one connection.
   */
  readonly liveReload?: string;
}

/** The script of a live preview: reload on every `reload` event, back where the reader was. */
function liveReloadScript(events: string): string {
  return `(() => {
  try {
    const y = sessionStorage.getItem("meltemi-preview-scroll");
    if (y !== null) {
      sessionStorage.removeItem("meltemi-preview-scroll");
      addEventListener("load", () => setTimeout(() => scrollTo(0, Number(y)), 50));
    }
  } catch {}
  const source = new EventSource(${JSON.stringify(events)});
  source.addEventListener("reload", () => {
    try { sessionStorage.setItem("meltemi-preview-scroll", String(scrollY)); } catch {}
    location.reload();
  });
})();`;
}

/**
 * The data as JSON safe inside a `<script>` element: `<` is escaped, so nothing in it can close the
 * script, and so are the line separators JavaScript reads as line breaks.
 */
export function catalogJson(data: CatalogData): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #ffffff; --fg: #1b1f24; --muted: #59626e;
  --line: #d8dde4; --accent: #1f5fd6; --accent-fg: #ffffff; --badge: #eceff3; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1216; --panel: #171b21; --fg: #e6e9ee; --muted: #9ba5b2; --line: #2c323b;
    --accent: #6aa7ff; --accent-fg: #0f1216; --badge: #242a33; }
}
* { box-sizing: border-box; }
html { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
body { margin: 0; background: var(--bg); color: var(--fg); }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.skip { position: absolute; left: 12px; top: -48px; z-index: 3; padding: 8px 12px; border-radius: 6px;
  background: var(--accent); color: var(--accent-fg); }
.skip:focus { top: 8px; }
header.top { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px 16px;
  align-items: center; padding: 10px 20px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { font-weight: 650; color: var(--fg); text-decoration: none; }
.search { margin: 0 0 0 auto; flex: 0 1 380px; }
.search input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--line);
  border-radius: 6px; background: var(--bg); color: var(--fg); font: inherit; }
.layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); align-items: start; }
nav.side { position: sticky; top: 55px; max-height: calc(100vh - 55px); overflow: auto; padding: 16px 12px;
  border-right: 1px solid var(--line); background: var(--panel); min-height: calc(100vh - 55px); }
nav.side ul { list-style: none; margin: 0; padding: 0; }
nav.side a { display: block; padding: 4px 8px; border-radius: 6px; color: var(--fg); text-decoration: none; }
nav.side a:hover { background: var(--badge); }
nav.side a[aria-current="page"] { background: var(--accent); color: var(--accent-fg); }
nav.side a[aria-current="page"] .badge { background: transparent; color: inherit; border: 1px solid currentColor; }
.nav-title { margin: 18px 8px 4px; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted); }
.folder { display: block; padding: 8px 8px 2px; font-size: 0.85rem; color: var(--muted); }
main { min-width: 0; max-width: 1280px; padding: 24px 32px 48px; }
main:focus, h1:focus { outline: none; }
h1 { margin: 0 0 6px; font-size: 1.6rem; line-height: 1.25; }
h2 { margin: 28px 0 10px; font-size: 1.15rem; }
h2 code { font-weight: 400; color: var(--muted); }
h3 { margin: 16px 0 6px; font-size: 1rem; }
.lead { max-width: 72ch; color: var(--muted); }
.meta, .stats, .crumbs { margin: 0 0 8px; color: var(--muted); }
.crumbs { font-size: 0.85rem; }
.badge { display: inline-block; padding: 0 6px; border-radius: 4px; background: var(--badge); color: var(--muted);
  font-size: 0.72rem; font-weight: 650; line-height: 1.7; vertical-align: 1px; }
code { font: 0.86em ui-monospace, "Cascadia Mono", Consolas, monospace; }
.cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); margin: 0;
  padding: 0; list-style: none; }
.card a { display: flex; flex-direction: column; gap: 4px; height: 100%; padding: 10px; border: 1px solid var(--line);
  border-radius: 8px; background: var(--panel); color: var(--fg); text-decoration: none; }
.card a:hover { border-color: var(--accent); }
.thumb { height: 150px; overflow: hidden; border-radius: 4px; background: var(--bg); }
.card-title { font-weight: 650; }
.card-meta { font-size: 0.85rem; color: var(--muted); }
.picker { margin: 12px 0 0; }
select, button { font: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line);
  border-radius: 6px; }
select { padding: 4px 8px; }
button { padding: 6px 12px; cursor: pointer; }
button:hover { border-color: var(--accent); }
.drawing { margin: 12px 0; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
thead th { font-size: 0.8rem; font-weight: 650; color: var(--muted); }
.links { margin: 0; padding-left: 1.2em; }
.scenes { padding-left: 1.4em; }
.results { padding-left: 1.4em; }
.results li { margin: 0 0 12px; }
.matches, .muted { color: var(--muted); }
.matches { font-size: 0.85rem; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; }
pre.source { max-height: 480px; overflow: auto; padding: 12px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--bg); font-size: 0.85rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
footer { padding: 16px 32px; font-size: 0.8rem; color: var(--muted); border-top: 1px solid var(--line); }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; }
  nav.side { position: static; min-height: 0; max-height: 45vh; border-right: 0; border-bottom: 1px solid var(--line); }
  main { padding: 16px; }
  .search { flex: 1 1 100%; margin: 0; }
}
@media print { header.top, nav.side, .actions, .skip { display: none; } .layout { display: block; } }
`;

/**
 * The catalog as one offline page: data, fonts, styles and the runtime inline, the overview and
 * the navigation already written so they read without scripts.
 */
export function catalogPage(
  data: CatalogData,
  script: string,
  options: CatalogPageOptions = {},
): string {
  const lang = options.lang ?? DEFAULT_LOCALE;
  const locale = resolveLocale(lang);
  const t = messages(locale).page;
  const home = pageView(data, { page: "home" }, locale);
  const policy = options.liveReload ? `${CATALOG_POLICY}; connect-src 'self'` : CATALOG_POLICY;
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    // An empty icon: browsers would otherwise ask the server for /favicon.ico, which the policy blocks.
    '<link rel="icon" href="data:,">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(data.title)}</title>`,
    ...(data.description
      ? [`<meta name="description" content="${escapeHtml(data.description)}">`]
      : []),
    `<meta name="generator" content="${escapeHtml(data.generator)}">`,
    `<style>${STYLE}</style>`,
    ...(data.fontFaces.length > 0
      ? [`<style id="meltemi-fonts">\n${data.fontFaces.join("\n")}\n</style>`]
      : []),
    "</head>",
    "<body>",
    `<a class="skip" href="#main">${escapeHtml(t.skip)}</a>`,
    '<header class="top">',
    `<a class="brand" href="#/">${escapeHtml(data.title)}</a>`,
    '<form class="search" role="search" action="#" autocomplete="off">',
    `<label class="sr" for="search">${escapeHtml(t.searchLabel)}</label>`,
    `<input id="search" type="search" placeholder="${escapeHtml(t.searchPlaceholder)}" spellcheck="false" aria-describedby="search-hint">`,
    `<span class="sr" id="search-hint">${escapeHtml(t.searchHint)}</span>`,
    "</form>",
    "</header>",
    '<div class="layout">',
    `<nav class="side" id="nav" aria-label="${escapeHtml(t.navigation)}">${navView(data, { page: "home" }, locale)}</nav>`,
    `<main id="main" tabindex="-1">${home.html}<noscript><p>${escapeHtml(t.noScript)}</p></noscript></main>`,
    "</div>",
    `<footer>${t.builtWith(escapeHtml(data.generator))}</footer>`,
    '<div class="sr" id="announce" role="status" aria-live="polite"></div>',
    `<script type="application/json" id="meltemi-catalog">${catalogJson(data)}</script>`,
    `<script>${inlineScript(script)}</script>`,
    ...(options.liveReload
      ? [`<script>${inlineScript(liveReloadScript(options.liveReload))}</script>`]
      : []),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
