// The catalog's pages as HTML text: the page writer renders the first page with them, and the
// browser runtime renders every page after a route change, then fills the drawing placeholders.
import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import { formatTime } from "@meltemi/diagrams-player";
import type {
  CatalogData,
  CatalogElement,
  CatalogEntity,
  CatalogEntry,
  DiagramEntry,
  StoryEntry,
} from "./data.js";
import type { en } from "./messages/en.js";
import { messages } from "./messages/index.js";
import { href, type Route } from "./routes.js";
import { kindLabel, searchCatalog } from "./search.js";

/** Escapes text for element content and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const e = escapeHtml;

/** The catalog's words in the page's language. */
type Words = typeof en;

export interface PageView {
  /** The page's own title; the document title adds the catalog's. */
  readonly title: string;
  readonly html: string;
}

const titleOf = (entry: CatalogEntry) => entry.title ?? entry.id;
const kindOf = (entry: CatalogEntry, locale: Locale) =>
  kindLabel(entry.kind === "story" ? "story" : entry.type, locale) ?? entry.kind;
const folderName = (folder: string, t: Words) => (folder === "" ? t.nav.root : folder);
const entryHref = (entry: CatalogEntry) =>
  href(
    entry.kind === "story"
      ? { page: "story", key: entry.key }
      : { page: "diagram", key: entry.key, scenario: null, element: null },
  );

/** The entries grouped by folder, folders in path order (the root first). */
export function folders(data: CatalogData): [string, CatalogEntry[]][] {
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of data.entries) {
    groups.set(entry.folder, [...(groups.get(entry.folder) ?? []), entry]);
  }
  return [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const badge = (text: string) => `<span class="badge">${e(text)}</span>`;
const heading = (text: string) => `<h1 tabindex="-1">${e(text)}</h1>`;
const crumbs = (t: Words, ...parts: string[]) =>
  `<nav class="crumbs" aria-label="${e(t.nav.breadcrumb)}"><a href="#/">${e(t.nav.overview)}</a>${parts.map((p) => ` <span aria-hidden="true">/</span> ${p}`).join("")}</nav>`;
const paragraph = (text: string | null, className = "") =>
  text ? `<p${className ? ` class="${className}"` : ""}>${e(text)}</p>` : "";
const external = (url: string, text: string) =>
  `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(text)}</a>`;
const list = (items: readonly string[]) =>
  items.length > 0 ? `<ul class="links">${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
const code = (text: string) => `<code>${e(text)}</code>`;

/**
 * The navigation: overview, entities, and every entry by folder, the current one marked; its words
 * in `locale`.
 */
export function navView(data: CatalogData, route: Route, locale: Locale = DEFAULT_LOCALE): string {
  const t = messages(locale);
  const current = (on: boolean) => (on ? ' aria-current="page"' : "");
  const top = [
    `<li><a href="#/"${current(route.page === "home")}>${e(t.nav.overview)}</a></li>`,
    ...(data.entities.length > 0
      ? [
          `<li><a href="#/entities"${current(route.page === "entities" || route.page === "entity")}>${e(t.nav.entities)}</a></li>`,
        ]
      : []),
  ];
  const groups = folders(data).map(
    ([folder, entries]) =>
      `<li><span class="folder">${e(folderName(folder, t))}</span><ul>${entries
        .map((entry) => {
          const on =
            (route.page === "diagram" || route.page === "story") && route.key === entry.key;
          return `<li><a href="${e(entryHref(entry))}"${current(on)}>${badge(kindOf(entry, locale))} ${e(titleOf(entry))}</a></li>`;
        })
        .join("")}</ul></li>`,
  );
  return `<ul class="nav-top">${top.join("")}</ul><h2 class="nav-title">${e(t.nav.folders)}</h2><ul class="folders">${groups.join("")}</ul>`;
}

function homeView(data: CatalogData, locale: Locale): PageView {
  const t = messages(locale);
  const diagrams = data.entries.filter((x) => x.kind === "diagram").length;
  const stories = data.entries.length - diagrams;
  const stats = [
    t.counts.diagrams(diagrams),
    t.counts.stories(stories),
    ...(data.entities.length > 0 ? [t.counts.entities(data.entities.length)] : []),
  ].join(" · ");
  const sections = folders(data).map(
    ([folder, entries], i) =>
      `<section aria-labelledby="folder-${i}"><h2 id="folder-${i}">${e(folderName(folder, t))}</h2><ul class="cards">${entries
        .map(
          (entry) =>
            `<li class="card"><a href="${e(entryHref(entry))}"><div class="thumb" data-thumb="${e(entry.key)}" aria-hidden="true"></div><span class="card-title">${e(titleOf(entry))}</span><span class="card-meta">${badge(kindOf(entry, locale))} <code>${e(entry.id)}</code></span></a></li>`,
        )
        .join("")}</ul></section>`,
  );
  return {
    title: t.nav.overview,
    html: `${heading(data.title)}${paragraph(data.description, "lead")}<p class="stats">${e(stats)}</p>${sections.join("")}`,
  };
}

const actions = (data: CatalogData, entry: CatalogEntry, t: Words) =>
  `<div class="actions"><button type="button" data-action="download-svg">${e(t.entry.downloadSvg)}</button>${
    data.sources?.[entry.file] !== undefined
      ? `<button type="button" data-action="download-source">${e(t.entry.downloadSource)}</button>`
      : ""
  }</div>`;

const sourceSection = (data: CatalogData, entry: CatalogEntry, t: Words) => {
  const text = data.sources?.[entry.file];
  return text === undefined
    ? ""
    : `<section aria-labelledby="source"><h2 id="source">${e(t.entry.source)}</h2><details><summary>${e(entry.file)}</summary><pre class="source"><code>${e(text)}</code></pre></details></section>`;
};

const entryMeta = (entry: CatalogEntry, locale: Locale, extra: string[] = []) =>
  `<p class="meta">${badge(kindOf(entry, locale))} ${messages(locale).entry.place(code(entry.id), code(entry.file))}${extra.map((x) => ` · ${x}`).join("")}</p>`;

function entryLink(data: CatalogData, key: string): string {
  const entry = data.entries.find((x) => x.key === key);
  return entry ? `<a href="${e(entryHref(entry))}">${e(titleOf(entry))}</a>` : e(key);
}

function entityLink(data: CatalogData, key: string): string {
  const entity = data.entities.find((x) => x.key === key);
  return entity ? `<a href="${e(href({ page: "entity", key }))}">${e(entity.label)}</a>` : "";
}

/** The diagrams above a diagram, outermost first: the entries that open it, cut at a repeat. */
export function parentChain(data: CatalogData, entry: DiagramEntry): DiagramEntry[] {
  const chain: DiagramEntry[] = [];
  const seen = new Set([entry.key]);
  for (let at = entry.parent; at && !seen.has(at.entry);) {
    seen.add(at.entry);
    const parent = data.entries.find(
      (x): x is DiagramEntry => x.kind === "diagram" && x.key === at!.entry,
    );
    if (!parent) break;
    chain.unshift(parent);
    at = parent.parent;
  }
  return chain;
}

function targetCell(data: CatalogData, element: CatalogElement, t: Words): string {
  const parts: string[] = [];
  const opens = element.opens;
  if (opens) {
    const entry = data.entries.find((x) => x.key === opens.entry);
    if (entry) {
      parts.push(
        t.entry.opens(
          `<a href="${e(href({ page: "diagram", key: entry.key, scenario: null, element: opens.element }))}">${e(titleOf(entry))}</a>`,
        ),
      );
    }
  }
  const target = element.target;
  if (target?.kind === "diagram") {
    const entry = data.entries.find((x) => x.key === target.entry);
    const label =
      entry?.kind === "diagram"
        ? (entry.elements.find((x) => x.id === target.element)?.label ?? target.element)
        : target.element;
    if (entry && entry.key !== opens?.entry) {
      parts.push(
        `<a href="${e(href({ page: "diagram", key: entry.key, scenario: null, element: target.element }))}">${e(titleOf(entry))} › ${e(label)}</a>`,
      );
    }
  } else if (target?.kind === "entity") {
    const link = entityLink(data, target.entity);
    if (link) parts.push(t.entry.entity(link));
  }
  if (element.url) parts.push(external(element.url, t.entry.openLink));
  return parts.join("<br>");
}

function diagramView(
  data: CatalogData,
  entry: DiagramEntry,
  route: Route,
  locale: Locale,
): PageView {
  const t = messages(locale);
  const scenario = route.page === "diagram" ? route.scenario : null;
  const index = Math.max(
    0,
    entry.views.findIndex((v) => v.scenario === scenario),
  );
  // The view as written is named in the page's language; scenarios by their own labels.
  const picker =
    entry.views.length > 1
      ? `<p class="picker"><label for="scenario">${e(t.entry.scenario)}</label> <select id="scenario">${entry.views
          .map(
            (v, i) =>
              `<option value="${i}"${i === index ? " selected" : ""}>${e(v.scenario === null ? t.entry.asWritten : v.label)}</option>`,
          )
          .join("")}</select></p>`
      : "";
  const c = t.columns;
  const elements =
    entry.elements.length === 0
      ? ""
      : `<section aria-labelledby="elements"><h2 id="elements">${e(t.entry.elements)}</h2><div class="table"><table><thead><tr><th scope="col">${e(c.element)}</th><th scope="col">${e(c.kind)}</th><th scope="col">${e(c.technology)}</th><th scope="col">${e(c.description)}</th><th scope="col">${e(c.leadsTo)}</th></tr></thead><tbody>${entry.elements
          .map(
            (x) =>
              `<tr><th scope="row">${e(x.label)}${x.label !== x.id ? ` <code>${e(x.id)}</code>` : ""}${x.external ? ` (${e(t.entry.external)})` : ""}</th><td>${e(x.kind)}</td><td>${e(x.technology ?? "")}</td><td>${e(x.description ?? "")}</td><td>${targetCell(data, x, t)}</td></tr>`,
          )
          .join("")}</tbody></table></div></section>`;
  const relations =
    entry.relations.length === 0
      ? ""
      : `<section aria-labelledby="relations"><h2 id="relations">${e(t.entry.relations)}</h2><div class="table"><table><thead><tr><th scope="col">${e(c.from)}</th><th scope="col">${e(c.to)}</th><th scope="col">${e(c.label)}</th><th scope="col">${e(c.technology)}</th><th scope="col">${e(c.description)}</th></tr></thead><tbody>${entry.relations
          .map(
            (r) =>
              `<tr><td>${e(r.from)}</td><td>${e(r.to)}</td><td>${e(r.label ?? "")}</td><td>${e(r.technology ?? "")}</td><td>${e(r.description ?? "")}${r.assumption !== null ? `${r.description ? "<br>" : ""}${badge(t.entry.assumption)} ${e(r.assumption)}` : ""}</td></tr>`,
          )
          .join("")}</tbody></table></div></section>`;
  const related = [
    entry.stories.length > 0
      ? `<h3>${e(t.entry.storiesShowing)}</h3>${list(entry.stories.map((k) => entryLink(data, k)))}`
      : "",
    entry.linksTo.length > 0
      ? `<h3>${e(t.entry.linksTo)}</h3>${list(entry.linksTo.map((k) => entryLink(data, k)))}`
      : "",
    entry.linkedFrom.length > 0
      ? `<h3>${e(t.entry.linkedFrom)}</h3>${list(entry.linkedFrom.map((k) => entryLink(data, k)))}`
      : "",
  ].join("");
  const above = parentChain(data, entry).map(
    (x) => `<a href="${e(entryHref(x))}">${e(titleOf(x))}</a>`,
  );
  return {
    title: titleOf(entry),
    html: [
      crumbs(t, e(folderName(entry.folder, t)), ...above),
      heading(titleOf(entry)),
      entryMeta(entry, locale),
      paragraph(entry.description, "lead"),
      picker,
      `<div class="drawing" id="drawing" data-entry="${e(entry.key)}" data-view="${index}"></div>`,
      actions(data, entry, t),
      elements,
      relations,
      related
        ? `<section aria-labelledby="related"><h2 id="related">${e(t.entry.related)}</h2>${related}</section>`
        : "",
      sourceSection(data, entry, t),
    ].join(""),
  };
}

function storyView(data: CatalogData, entry: StoryEntry, locale: Locale): PageView {
  const t = messages(locale);
  const { timeline } = entry.document;
  const scenes = `<section aria-labelledby="scenes"><h2 id="scenes">${e(t.entry.scenes)}</h2><ol class="scenes">${timeline.scenes
    .map(
      (s) =>
        `<li><span>${e(s.title ?? s.id)}</span>${s.title !== null ? ` <code>${e(s.id)}</code>` : ""} <span class="muted">${e(t.entry.startsAt(formatTime(s.startMs, locale)))}</span></li>`,
    )
    .join("")}</ol></section>`;
  const shows =
    entry.shows.length > 0
      ? `<section aria-labelledby="shows"><h2 id="shows">${e(t.entry.shows)}</h2>${list(entry.shows.map((k) => entryLink(data, k)))}</section>`
      : "";
  return {
    title: titleOf(entry),
    html: [
      crumbs(t, e(folderName(entry.folder, t))),
      heading(titleOf(entry)),
      entryMeta(entry, locale, [
        e(formatTime(timeline.durationMs, locale)),
        e(t.counts.scenes(timeline.scenes.length)),
      ]),
      paragraph(entry.description, "lead"),
      `<div class="drawing" id="drawing" data-entry="${e(entry.key)}"></div>`,
      actions(data, entry, t),
      scenes,
      shows,
      sourceSection(data, entry, t),
    ].join(""),
  };
}

const shownInLinks = (data: CatalogData, entity: CatalogEntity) =>
  entity.shownIn.map(({ entry, element }) => {
    const target = data.entries.find((x) => x.key === entry);
    return target
      ? `<a href="${e(href({ page: "diagram", key: entry, scenario: null, element }))}">${e(titleOf(target))}</a>`
      : e(entry);
  });

function entitiesView(data: CatalogData, locale: Locale): PageView {
  const t = messages(locale);
  const c = t.columns;
  const models = new Map<string, CatalogEntity[]>();
  for (const entity of data.entities) {
    const key = `${entity.file}#${entity.model}`;
    models.set(key, [...(models.get(key) ?? []), entity]);
  }
  const sections = [...models.values()].map(
    (entities, i) =>
      `<section aria-labelledby="model-${i}"><h2 id="model-${i}">${e(entities[0]!.model)} <code>${e(entities[0]!.file)}</code></h2><div class="table"><table><thead><tr><th scope="col">${e(c.entity)}</th><th scope="col">${e(c.kind)}</th><th scope="col">${e(c.technology)}</th><th scope="col">${e(c.description)}</th><th scope="col">${e(c.shownIn)}</th></tr></thead><tbody>${entities
        .map(
          (x) =>
            `<tr><th scope="row">${entityLink(data, x.key)}${x.external ? ` (${e(t.entities.external)})` : ""}</th><td>${e(x.kind)}</td><td>${e(x.technology ?? "")}</td><td>${e(x.description ?? "")}</td><td>${shownInLinks(data, x).join(", ")}</td></tr>`,
        )
        .join("")}</tbody></table></div></section>`,
  );
  return {
    title: t.nav.entities,
    html: `${crumbs(t)}${heading(t.nav.entities)}<p class="lead">${e(t.entities.lead)}</p>${sections.join("")}`,
  };
}

function entityView(data: CatalogData, entity: CatalogEntity, locale: Locale): PageView {
  const t = messages(locale);
  const children = data.entities.filter((x) => x.parent === entity.key);
  const parent = entity.parent === null ? "" : entityLink(data, entity.parent);
  const facts = [
    entity.technology ? `<dt>${e(t.columns.technology)}</dt><dd>${e(entity.technology)}</dd>` : "",
    parent ? `<dt>${e(t.entities.partOf)}</dt><dd>${parent}</dd>` : "",
    entity.url ? `<dt>${e(t.entities.link)}</dt><dd>${external(entity.url, entity.url)}</dd>` : "",
    `<dt>${e(t.entities.model)}</dt><dd>${t.entry.place(code(entity.model), code(entity.file))}</dd>`,
  ].join("");
  return {
    title: entity.label,
    html: [
      crumbs(t, `<a href="#/entities">${e(t.nav.entities)}</a>`),
      heading(entity.label),
      `<p class="meta">${badge(entity.kind)} <code>${e(entity.path)}</code>${entity.external ? ` · ${e(t.entities.external)}` : ""}</p>`,
      paragraph(entity.description, "lead"),
      `<dl class="facts">${facts}</dl>`,
      children.length > 0
        ? `<section aria-labelledby="contains"><h2 id="contains">${e(t.entities.contains)}</h2>${list(children.map((x) => entityLink(data, x.key)))}</section>`
        : "",
      entity.views.length > 0
        ? `<section aria-labelledby="scoped"><h2 id="scoped">${e(t.entities.views)}</h2>${list(entity.views.map((k) => entryLink(data, k)))}</section>`
        : "",
      `<section aria-labelledby="shown"><h2 id="shown">${e(t.entities.shownIn)}</h2>${list(shownInLinks(data, entity))}</section>`,
    ].join(""),
  };
}

function searchView(data: CatalogData, query: string, locale: Locale): PageView {
  const t = messages(locale);
  const results = searchCatalog(data, query, locale);
  const status =
    query.trim() === "" ? t.search.prompt : t.search.results(results.length, query.trim());
  return {
    title: t.search.title,
    html: `${heading(t.search.title)}<p class="lead" id="search-status">${e(status)}</p><ol class="results">${results
      .map(
        (r) =>
          `<li><a href="${e(r.href)}">${e(r.title)}</a> ${badge(r.label)} <span class="muted">${e(r.place === "" ? t.nav.root : r.place)}</span>${
            r.matches.length > 0
              ? `<br><span class="matches">${r.matches.map(e).join(" · ")}</span>`
              : ""
          }</li>`,
      )
      .join("")}</ol>`,
  };
}

function missingView(locale: Locale): PageView {
  const t = messages(locale).missing;
  return {
    title: t.title,
    html: `${heading(t.title)}<p>${e(t.text)} <a href="#/">${e(t.home)}</a>.</p>`,
  };
}

/** The page of a route, its words in `locale`. */
export function pageView(
  data: CatalogData,
  route: Route,
  locale: Locale = DEFAULT_LOCALE,
): PageView {
  switch (route.page) {
    case "home":
      return homeView(data, locale);
    case "diagram": {
      const entry = data.entries.find((x) => x.key === route.key);
      return entry?.kind === "diagram"
        ? diagramView(data, entry, route, locale)
        : missingView(locale);
    }
    case "story": {
      const entry = data.entries.find((x) => x.key === route.key);
      return entry?.kind === "story" ? storyView(data, entry, locale) : missingView(locale);
    }
    case "entities":
      return data.entities.length > 0 ? entitiesView(data, locale) : missingView(locale);
    case "entity": {
      const entity = data.entities.find((x) => x.key === route.key);
      return entity ? entityView(data, entity, locale) : missingView(locale);
    }
    case "search":
      return searchView(data, route.query, locale);
    case "missing":
      return missingView(locale);
  }
}
