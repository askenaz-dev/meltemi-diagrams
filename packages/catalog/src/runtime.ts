// The browser runtime of the catalog: routes in the hash, pages from `views.ts`, drawings and
// players from the player's runtime, search, downloads. Bundled into one script with the player.
import { resolveLocale } from "@meltemi/diagrams-i18n";
import type { StoryViewData } from "@meltemi/diagrams-motion";
import {
  frameSvg,
  mountPlayer,
  type DetailRef,
  type EnterTransition,
  type HostCrumb,
  type HostTarget,
  type PanelSection,
  type PlayerHandle,
} from "@meltemi/diagrams-player/runtime";
import {
  CATALOG_FORMAT,
  CATALOG_VERSION,
  type CatalogData,
  type CatalogEntry,
  type CatalogOpens,
  type DiagramEntry,
  type StoryEntry,
} from "./data.js";
import { messages } from "./messages/index.js";
import { href, parseRoute, type Route } from "./routes.js";
import { searchCatalog } from "./search.js";
import { navView, pageView, parentChain } from "./views.js";

function readData(): CatalogData | undefined {
  try {
    const value = JSON.parse(document.getElementById("meltemi-catalog")?.textContent ?? "") as {
      format?: unknown;
      version?: unknown;
    };
    return value.format === CATALOG_FORMAT && value.version === CATALOG_VERSION
      ? (value as CatalogData)
      : undefined;
  } catch {
    return undefined;
  }
}

/** A standalone SVG: the drawing with the `@font-face` rules of its text. */
function withFaces(svg: string, data: CatalogData, faces: readonly number[]): string {
  const rules = faces.map((i) => data.fontFaces[i]).filter((rule) => rule !== undefined);
  if (rules.length === 0) return svg;
  return svg.replace(
    /^<svg[^>]*>/,
    (open) =>
      `${open}\n  <defs>\n    <style>\n      ${rules.join("\n      ")}\n    </style>\n  </defs>`,
  );
}

function download(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (file: string) => file.slice(file.lastIndexOf("/") + 1);
const stemOf = (file: string) => baseName(file).replace(/\.meltemi$/, "");

/** Draws a static thumbnail of an entry in its own shadow root. */
function drawThumb(element: HTMLElement, entry: CatalogEntry): void {
  if (element.shadowRoot) return;
  const svg =
    entry.kind === "diagram"
      ? frameSvg(entry.views[0]!.document, 0, { static: true })
      : frameSvg(entry.document, entry.document.timeline.durationMs);
  const root = element.attachShadow({ mode: "open" });
  root.innerHTML = `<style>:host { display: block; } svg { display: block; width: 100%; height: 100%; }</style>${svg}`;
}

function start(): void {
  const main = document.getElementById("main")!;
  const nav = document.getElementById("nav")!;
  const search = document.getElementById("search") as HTMLInputElement;
  const announce = document.getElementById("announce")!;
  // The language the page was written in: every page, result and player speaks it.
  const locale = resolveLocale(document.documentElement.lang);
  const t = messages(locale);
  const data = readData();
  if (!data) {
    main.textContent = messages(locale).page.unreadable;
    return;
  }
  const entries = new Map(data.entries.map((entry) => [entry.key, entry]));
  let current: Route = { page: "home" };
  let players: PlayerHandle[] = [];
  let observer: IntersectionObserver | undefined;
  let searchPushed = false;

  const go = (route: Route) => {
    location.hash = href(route);
  };

  const clear = () => {
    for (const player of players) player.destroy();
    players = [];
    observer?.disconnect();
    observer = undefined;
  };

  const mountThumbs = () => {
    const thumbs = [...main.querySelectorAll<HTMLElement>("[data-thumb]")];
    const draw = (element: HTMLElement) => {
      const entry = entries.get(element.dataset.thumb ?? "");
      if (entry) drawThumb(element, entry);
    };
    if (typeof IntersectionObserver !== "function") {
      thumbs.forEach(draw);
      return;
    }
    // Printing shows every card, so every thumbnail is drawn first.
    window.addEventListener("beforeprint", () => thumbs.forEach(draw), { once: true });
    observer = new IntersectionObserver(
      (seen) => {
        for (const item of seen) {
          if (!item.isIntersecting) continue;
          draw(item.target as HTMLElement);
          observer?.unobserve(item.target);
        }
      },
      { rootMargin: "300px" },
    );
    for (const thumb of thumbs) observer.observe(thumb);
  };

  /** A drill-down on its way from one page to the next: the next page's player plays it in. */
  let pending: (EnterTransition & { readonly to: string }) | null = null;

  const titleOfEntry = (key: string) => {
    const entry = entries.get(key);
    return entry ? (entry.title ?? entry.id) : key;
  };
  const elementOf = (entry: DiagramEntry, id: string) => entry.elements.find((e) => e.id === id);
  /** The scene, effects and relation ends of a diagram as written. */
  const rootOf = (entry: DiagramEntry): StoryViewData => {
    const document = entry.views[0]!.document;
    return document.views[document.key]!;
  };

  /** What the player opens for an element: the catalogued view it opens, as a page. */
  const hostTarget = (entry: DiagramEntry, id: string): HostTarget | null => {
    const opens = elementOf(entry, id)?.opens;
    if (!opens || !entries.has(opens.entry)) return null;
    return { label: titleOfEntry(opens.entry), transition: opens.transition, data: opens };
  };

  /** The links the panel adds for an element or relation of a diagram. */
  const sectionsFor = (entry: DiagramEntry, ref: DetailRef): PanelSection[] => {
    const story = (key: string) => ({
      label: titleOfEntry(key),
      href: href({ page: "story", key }),
    });
    if (ref.role === "relation") {
      const relation = entry.relations.find((r) => r.key === ref.id);
      return relation && relation.stories.length > 0
        ? [{ heading: t.entry.storiesShowing, items: relation.stories.map(story) }]
        : [];
    }
    const element = elementOf(entry, ref.id);
    if (!element) return [];
    const sections: PanelSection[] = [];
    if (element.stories.length > 0)
      sections.push({ heading: t.entry.storiesShowing, items: element.stories.map(story) });
    const leads: { label: string; href: string }[] = [];
    const target = element.target;
    if (target?.kind === "diagram" && target.entry !== element.opens?.entry) {
      leads.push({
        label: titleOfEntry(target.entry),
        href: href({ page: "diagram", key: target.entry, scenario: null, element: target.element }),
      });
    } else if (target?.kind === "entity") {
      const entity = data.entities.find((e) => e.key === target.entity);
      if (entity) {
        leads.push({
          label: `${t.columns.entity}: ${entity.label}`,
          href: href({ page: "entity", key: entity.key }),
        });
      }
    }
    if (leads.length > 0) sections.push({ heading: t.columns.leadsTo, items: leads });
    const entity =
      target?.kind === "entity" ? data.entities.find((e) => e.key === target.entity) : undefined;
    if (entity && entity.views.length > 0) {
      sections.push({
        heading: t.entities.views,
        items: entity.views.map((key) => ({
          label: titleOfEntry(key),
          href: href({ page: "diagram", key, scenario: null, element: null }),
        })),
      });
    }
    return sections;
  };

  /** The diagrams above a diagram, as crumbs that go to their pages. */
  const trailOf = (entry: DiagramEntry): HostCrumb[] =>
    parentChain(data, entry).map((parent) => ({
      title: titleOfEntry(parent.key),
      go: () => {
        // Going up to the parent plays the way up on its page.
        const element = parent.elements.find((e) => e.opens?.entry === entry.key)?.id;
        if (element && parent.key === entry.parent?.entry) {
          pending = {
            to: parent.key,
            fromKey: `from:${entry.key}`,
            from: rootOf(entry),
            element,
            direction: "up",
            transition: elementOf(parent, element)!.opens!.transition,
            select: element,
          };
        }
        go({ page: "diagram", key: parent.key, scenario: null, element: null });
      },
    }));

  /**
   * The drill-down into a page from the page before it, when the address moved between two
   * diagrams one opens: down into the opened one, or up into the one that opens it.
   */
  const transitionInto = (entry: DiagramEntry, previous: Route | null): EnterTransition | null => {
    if (pending && pending.to === entry.key) {
      const enter = pending;
      pending = null;
      return enter;
    }
    pending = null;
    if (previous?.page !== "diagram") return null;
    const before = entries.get(previous.key);
    if (before?.kind !== "diagram" || before.key === entry.key) return null;
    const down = before.elements.find((e) => e.opens?.entry === entry.key);
    if (down?.opens) {
      return {
        fromKey: `from:${before.key}`,
        from: rootOf(before),
        element: down.id,
        direction: "down",
        transition: down.opens.transition,
        select: down.opens.element,
      };
    }
    const up = entry.elements.find((e) => e.opens?.entry === before.key);
    if (up?.opens) {
      return {
        fromKey: `from:${before.key}`,
        from: rootOf(before),
        element: up.id,
        direction: "up",
        transition: up.opens.transition,
        select: up.id,
      };
    }
    return null;
  };

  const mountDiagram = (
    host: HTMLElement,
    entry: DiagramEntry,
    route: Route,
    previous: Route | null,
  ) => {
    let index = Number(host.dataset.view ?? "0") || 0;
    const select = route.page === "diagram" ? route.element : null;
    const into = index === 0 ? transitionInto(entry, previous) : null;
    // The element of the address wins over the one a transition would select.
    let enter = into && select !== null ? { ...into, select } : into;
    const mount = () => {
      for (const player of players) player.destroy();
      const view = entry.views[index]!;
      const root = view.document.views[view.document.key]!;
      const hasEffects = root.plan.effects.length > 0;
      players = [
        mountPlayer(host, view.document, {
          summary: hasEffects,
          locale,
          ...(enter ? { enter } : { select }),
          targets: (_view, id) => hostTarget(entry, id),
          onNavigate: (target, origin) => {
            const opens = target.data as CatalogOpens;
            pending = {
              to: opens.entry,
              fromKey: `from:${entry.key}`,
              from: root,
              element: origin.id,
              direction: "down",
              transition: opens.transition,
              select: opens.element,
            };
            go({ page: "diagram", key: opens.entry, scenario: null, element: opens.element });
          },
          sections: (ref) => sectionsFor(entry, ref),
          trail: trailOf(entry),
        }),
      ];
      enter = null;
    };
    mount();
    main.querySelector<HTMLSelectElement>("#scenario")?.addEventListener("change", (event) => {
      index = Number((event.target as HTMLSelectElement).value);
      const scenario = entry.views[index]!.scenario;
      current = { page: "diagram", key: entry.key, scenario, element: null };
      history.replaceState(null, "", href(current));
      mount();
    });
    main.querySelector('[data-action="download-svg"]')?.addEventListener("click", () => {
      const view = entry.views[index]!;
      const suffix = view.scenario === null ? "" : `.${view.scenario}`;
      download(
        withFaces(players[0]?.svg ?? "", data, view.faces),
        `${stemOf(entry.file)}.${entry.id}${suffix}.svg`,
        "image/svg+xml",
      );
    });
  };

  /** The links the panel adds in a story: the element in the diagram it belongs to. */
  const storySections = (entry: StoryEntry, ref: DetailRef): PanelSection[] => {
    const diagram = entry.shows
      .map((key) => entries.get(key))
      .find(
        (e): e is DiagramEntry => e?.kind === "diagram" && e.id === ref.view.replace(/-\d+$/, ""),
      );
    if (!diagram) return [];
    const element = ref.role === "element" ? ref.id : null;
    return [
      {
        heading: t.entry.shows,
        items: [
          {
            label: titleOfEntry(diagram.key),
            href: href({ page: "diagram", key: diagram.key, scenario: null, element }),
          },
        ],
      },
    ];
  };

  const mountDrawing = (route: Route, previous: Route | null) => {
    const host = main.querySelector<HTMLElement>("#drawing");
    const entry = host ? entries.get(host.dataset.entry ?? "") : undefined;
    if (!host || !entry) return;
    if (entry.kind === "diagram") mountDiagram(host, entry, route, previous);
    else {
      const player = mountPlayer(host, entry.document, {
        locale,
        sections: (ref) => storySections(entry, ref),
      });
      players = [player];
      main
        .querySelector('[data-action="download-svg"]')
        ?.addEventListener("click", () =>
          download(
            withFaces(player.svg, data, entry.faces),
            `${stemOf(entry.file)}.${entry.id}.svg`,
            "image/svg+xml",
          ),
        );
    }
    main.querySelector('[data-action="download-source"]')?.addEventListener("click", () => {
      const text = data.sources?.[entry.file];
      if (text !== undefined) download(text, baseName(entry.file), "text/plain");
    });
    if (route.page === "diagram" && route.element !== null) {
      host.scrollIntoView({ block: "nearest" });
    }
  };

  const render = (route: Route, focus: boolean) => {
    clear();
    const previous = current;
    current = route;
    // A drill-down plays in the new page's drawing, which keeps the focus.
    const drilling = pending !== null && route.page === "diagram" && pending.to === route.key;
    const view = pageView(data, route, locale);
    main.innerHTML = view.html;
    nav.innerHTML = navView(data, route, locale);
    document.title = route.page === "home" ? data.title : `${view.title} · ${data.title}`;
    if (route.page === "search") {
      if (document.activeElement !== search) search.value = route.query;
      announce.textContent = main.querySelector("#search-status")?.textContent ?? "";
    } else {
      search.value = "";
      searchPushed = false;
    }
    mountThumbs();
    mountDrawing(route, previous);
    nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    const drawing = main.querySelector<HTMLElement>("#drawing");
    if (drilling && drawing) {
      drawing.scrollIntoView({ block: "nearest" });
      drawing.shadowRoot?.querySelector<HTMLElement>(".frame")?.focus({ preventScroll: true });
    } else if (focus) {
      window.scrollTo(0, 0);
      main.querySelector<HTMLElement>("h1")?.focus();
    }
  };

  window.addEventListener("hashchange", () => {
    const route = parseRoute(location.hash);
    if (route) render(route, true);
  });

  search.addEventListener("input", () => {
    const route: Route = { page: "search", query: search.value };
    if (current.page === "search") history.replaceState(null, "", href(route));
    else {
      history.pushState(null, "", href(route));
      searchPushed = true;
    }
    render(route, false);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      search.value = "";
      if (current.page !== "search") return;
      if (searchPushed) history.back();
      else go({ page: "home" });
    } else if (event.key === "ArrowDown") {
      const first = main.querySelector<HTMLElement>(".results a");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  search.form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const first = searchCatalog(data, search.value, locale)[0];
    if (first) location.hash = first.href;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.closest("input, textarea, select, [contenteditable]") || target.shadowRoot)
    ) {
      return;
    }
    event.preventDefault();
    search.focus();
    search.select();
  });

  render(parseRoute(location.hash) ?? { page: "home" }, false);
  (window as { meltemiCatalog?: unknown }).meltemiCatalog = {
    data,
    get route() {
      return current;
    },
    get players() {
      return players;
    },
    get selection() {
      return players[0]?.selection ?? null;
    },
    get trail() {
      return players[0]?.trail ?? [];
    },
    get pending() {
      return pending;
    },
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
