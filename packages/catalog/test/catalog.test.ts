import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { untranslated } from "@meltemi/diagrams-i18n";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import {
  compile,
  isChildView,
  type Compilation,
  type EntityKind,
  type FlowDiagram,
} from "@meltemi/diagrams-model";
import { storyViews, type LaidOutView } from "@meltemi/diagrams-player";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  CATALOG_POLICY,
  catalogData,
  catalogPage,
  href,
  kindLabel,
  navView,
  normalize,
  pageView,
  parseRoute,
  searchCatalog,
  type CatalogInput,
  type DiagramEntry,
  type DiagramInput,
  type LinkTarget,
  type OpensInput,
  type Route,
  type StoryEntry,
  type StoryInput,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { catalogScript } from "../src/node.js";

const engine = createElkEngine();
const fonts = createNodeFontLibrary();

function sheet(path: string): { file: string; compilation: Compilation } {
  return {
    file: path,
    compilation: compile(readFileSync(join(CORPUS_ROOT, "valid", path), "utf8")),
  };
}

/** Same-file links, as the host resolves them. */
function linksOf(file: string, diagram: FlowDiagram): Record<string, LinkTarget> {
  const links: Record<string, LinkTarget> = {};
  for (const element of diagram.elements) {
    if (element.entity) {
      links[element.id] = {
        kind: "entity",
        file,
        model: element.entity.model,
        path: element.entity.path,
      };
    }
  }
  for (const link of diagram.links) {
    if (link.target === "diagram") {
      links[link.owner] = { kind: "diagram", file, diagram: link.diagram, element: link.element };
    } else if (link.target === "model") {
      links[link.owner] = { kind: "entity", file, model: link.diagram, path: link.element };
    }
  }
  return links;
}

/** What each element opens, in the same file, as the host resolves it. */
function opensOf(
  file: string,
  compilation: Compilation,
  diagram: FlowDiagram,
): Record<string, OpensInput> {
  const opens: Record<string, OpensInput> = {};
  for (const element of diagram.elements) {
    if (element.entity && element.kind !== "group") {
      const entity = { kind: element.kind as EntityKind, path: element.entity.path };
      const child = compilation.document.diagrams.find(
        (d) => d.c4 && isChildView(d.c4, null, { file: null, id: element.entity!.model }, entity),
      );
      if (child) opens[element.id] = { file, diagram: child.id, element: null };
    }
  }
  for (const link of diagram.links) {
    if (link.target === "diagram")
      opens[link.owner] = { file, diagram: link.diagram, element: link.element };
  }
  return opens;
}

const lay = (compilation: Compilation, diagram: FlowDiagram, scenario?: string) =>
  layoutDiagram(compilation, diagram, {
    engine,
    measurer: fonts,
    ...(scenario !== undefined ? { scenario } : {}),
  });

function diagramInputs({ file, compilation }: ReturnType<typeof sheet>): DiagramInput[] {
  return compilation.document.diagrams.map((diagram) => ({
    file,
    diagram,
    views: [null, ...diagram.scenarios.map((s) => s.id)].map((scenario) => ({
      scenario,
      layout: lay(compilation, diagram, scenario ?? undefined),
    })),
    links: linksOf(file, diagram),
    opens: opensOf(file, compilation, diagram),
    c4: diagram.c4?.resolved
      ? {
          level: diagram.c4.level,
          scope: diagram.c4.scope,
          model: { file, id: diagram.c4.resolved.definition.id },
        }
      : null,
  }));
}

function storyInputs({ file, compilation }: ReturnType<typeof sheet>): StoryInput[] {
  return compilation.document.stories.map((story) => {
    const layouts = new Map<string, LaidOutView>();
    for (const [key, view] of storyViews(story)) {
      layouts.set(key, { diagram: view.diagram!, layout: lay(compilation, view.diagram!) });
    }
    return {
      file,
      story,
      layouts,
      shows: [...storyViews(story)].map(([key, v]) => ({ file, diagram: v.diagram!.id, key })),
    };
  });
}

const c4 = sheet("c4/commerce.meltemi");
const free = sheet("free/converted.meltemi");
const sequence = sheet("sequence/payment.meltemi");
const stories = sheet("stories/purchase.meltemi");
const INPUT: CatalogInput = {
  title: "Corpus <catalog>",
  description: "Every profile & a story",
  generator: "Meltemi Diagrams 1.0.0",
  diagrams: [stories, sequence, c4, free].flatMap(diagramInputs),
  stories: storyInputs(stories),
  models: c4.compilation.document.models.map((model) => ({ file: c4.file, model })),
  sources: null,
  fonts,
};
const data = catalogData(INPUT);
const entry = (key: string) => data.entries.find((e) => e.key === key)!;

describe("catalog data", () => {
  it("lists entries by file, then in source order, with their folders", () => {
    expect(data.entries.map((e) => e.key)).toEqual([
      "c4/commerce/context",
      "c4/commerce/containers",
      "c4/commerce/components",
      "free/converted/grouped",
      "free/converted/grouped_free",
      "sequence/payment/payment",
      "stories/purchase/checkout",
      "stories/purchase/purchase",
    ]);
    expect(entry("c4/commerce/context")).toMatchObject({
      folder: "c4",
      file: "c4/commerce.meltemi",
      title: "Commerce en contexto",
      type: "c4",
    });
  });

  it("draws one view per sequence scenario", () => {
    const payment = entry("sequence/payment/payment") as DiagramEntry;
    expect(payment.views.map((v) => [v.scenario, v.label])).toEqual([
      [null, "As written"],
      ["approved", "Pago aprobado"],
      ["rejected", "Pago rechazado"],
    ]);
    expect(payment.relations.map((r) => r.label)).toContain("Autorizar");
  });

  it("follows links between diagrams both ways", () => {
    const grouped = entry("free/converted/grouped") as DiagramEntry;
    const copy = entry("free/converted/grouped_free") as DiagramEntry;
    expect(copy.linksTo).toEqual(["free/converted/grouped"]);
    expect(grouped.linkedFrom).toEqual(["free/converted/grouped_free"]);
    expect(copy.elements.find((e) => e.id === "api")!.target).toEqual({
      kind: "diagram",
      entry: "free/converted/grouped",
      element: "api",
    });
  });

  it("lists the entities views draw, with where", () => {
    const api = data.entities.find((e) => e.key === "c4/commerce/commerce/shop.api")!;
    expect(api).toMatchObject({ label: "API", kind: "container", technology: "HTTP" });
    expect(api.parent).toBe("c4/commerce/commerce/shop");
    expect(api.shownIn).toContainEqual({ entry: "c4/commerce/containers", element: "shop.api" });
    const bank = data.entities.find((e) => e.path === "bank")!;
    expect(bank.external).toBe(true);
  });

  it("ties stories to the diagrams they show", () => {
    const purchase = entry("stories/purchase/purchase") as StoryEntry;
    expect(purchase.kind).toBe("story");
    expect(purchase.shows).toEqual(["stories/purchase/checkout"]);
    expect((entry("stories/purchase/checkout") as DiagramEntry).stories).toEqual([
      "stories/purchase/purchase",
    ]);
  });

  it("embeds each font subset once and indexes the faces of every view", () => {
    expect(data.fontFaces.length).toBeGreaterThan(0);
    expect(new Set(data.fontFaces).size).toBe(data.fontFaces.length);
    for (const e of data.entries) {
      const faces = e.kind === "story" ? [e.faces] : e.views.map((v) => v.faces);
      for (const list of faces) {
        expect(list.length).toBeGreaterThan(0);
        for (const i of list) expect(data.fontFaces[i]).toMatch(/^@font-face\{/);
      }
      const documents = e.kind === "story" ? [e.document] : e.views.map((v) => v.document);
      for (const doc of documents) expect(doc.fontFaces).toEqual([]);
    }
  });

  it("gives the same data for the same input", () => {
    expect(JSON.stringify(catalogData(INPUT))).toBe(JSON.stringify(data));
  });

  it("says what each element opens, and the parent of each opened view", () => {
    expect(data.version).toBe(2);
    const context = entry("c4/commerce/context") as DiagramEntry;
    const containers = entry("c4/commerce/containers") as DiagramEntry;
    const components = entry("c4/commerce/components") as DiagramEntry;
    const element = (e: DiagramEntry, id: string) => e.elements.find((x) => x.id === id)!;
    expect(element(context, "shop").opens).toEqual({
      entry: "c4/commerce/containers",
      element: null,
      transition: "morph",
    });
    expect(element(context, "customer").opens).toBeNull();
    expect(element(containers, "shop.api").opens?.entry).toBe("c4/commerce/components");
    expect(element(containers, "shop.db").opens).toBeNull();
    expect(context.c4).toEqual({ level: "context", scope: null });
    expect(containers.c4).toEqual({ level: "container", scope: "c4/commerce/commerce/shop" });
    expect(containers.parent).toEqual({ entry: "c4/commerce/context", element: "shop" });
    expect(components.parent).toEqual({ entry: "c4/commerce/containers", element: "shop.api" });
    expect(context.parent).toBeNull();
    const shop = data.entities.find((e) => e.key === "c4/commerce/commerce/shop")!;
    expect(shop.views).toEqual(["c4/commerce/containers"]);
    // A link to another diagram opens it, with the element to select there.
    const copy = entry("free/converted/grouped_free") as DiagramEntry;
    expect(element(copy, "api").opens).toMatchObject({
      entry: "free/converted/grouped",
      element: "api",
    });
  });

  it("names the stories that show each element and relation, and the relations' ends", () => {
    const checkout = entry("stories/purchase/checkout") as DiagramEntry;
    expect(checkout.elements.find((e) => e.id === "db")!.stories).toEqual([
      "stories/purchase/purchase",
    ]);
    const save = checkout.relations.find((r) => r.key === "save")!;
    expect(save).toMatchObject({ fromId: "orders", toId: "db", from: "Pedidos" });
    expect(save.stories).toEqual(["stories/purchase/purchase"]);
    const context = entry("c4/commerce/context") as DiagramEntry;
    expect(context.elements.every((e) => e.stories.length === 0)).toBe(true);
  });
});

describe("routes", () => {
  it("writes and reads every page", () => {
    const routes: Route[] = [
      { page: "home" },
      { page: "diagram", key: "diagrams/año/checkout", scenario: "ok", element: "api" },
      { page: "diagram", key: "a/b", scenario: null, element: null },
      { page: "story", key: "stories/purchase/purchase" },
      { page: "entities" },
      { page: "entity", key: "models/commerce/commerce/shop.api" },
      { page: "search", query: "pedidos & pagos?" },
    ];
    for (const route of routes) expect(parseRoute(href(route))).toEqual(route);
    expect(href(routes[1]!)).toBe("#/diagram/diagrams/a%C3%B1o/checkout?scenario=ok&element=api");
  });

  it("keeps in-page anchors out and sends unknown pages to not found", () => {
    expect(parseRoute("#main")).toBeNull();
    expect(parseRoute("")).toEqual({ page: "home" });
    expect(parseRoute("#/unknown/x")).toEqual({ page: "missing" });
    expect(parseRoute("#/diagram/")).toEqual({ page: "missing" });
  });
});

describe("search", () => {
  it("ignores case and accents", () => {
    expect(normalize("  Pédidos  EN línea ")).toBe("pedidos en linea");
  });

  it("finds elements, ranks titles first and says where it matched", () => {
    const results = searchCatalog(data, "PEDIDOS");
    const keys = results.map((r) => r.key);
    expect(keys).toContain("stories/purchase/checkout");
    expect(keys).toContain("c4/commerce/containers");
    const checkout = results.find((r) => r.key === "stories/purchase/checkout")!;
    expect(checkout.matches).toContain("element “Pedidos”");
    expect(searchCatalog(data, "payment")[0]!.key).toBe("sequence/payment/payment");
  });

  it("requires every word and searches entities", () => {
    const results = searchCatalog(data, "pagos kotlin");
    expect(results.map((r) => r.key)).toContain("c4/commerce/commerce/shop.api.payments");
    expect(results.every((r) => r.kind !== "story")).toBe(true);
    expect(searchCatalog(data, "pagos zzz")).toEqual([]);
    expect(searchCatalog(data, "   ")).toEqual([]);
  });
});

describe("pages", () => {
  it("writes the overview by folder with escaped text", () => {
    const home = pageView(data, { page: "home" });
    expect(home.html).toContain('<h1 tabindex="-1">Corpus &lt;catalog&gt;</h1>');
    expect(home.html).toContain("Every profile &amp; a story");
    expect(home.html).toContain("7 diagrams · 1 story · 8 entities");
    for (const folder of ["c4", "free", "sequence", "stories"]) {
      expect(home.html).toContain(`>${folder}</h2>`);
    }
    expect(home.html).toContain('data-thumb="sequence/payment/payment"');
  });

  it("marks the current entry in the navigation", () => {
    const nav = navView(data, { page: "story", key: "stories/purchase/purchase" });
    expect(nav).toContain('href="#/story/stories/purchase/purchase" aria-current="page"');
    expect(nav.match(/aria-current/g)).toHaveLength(1);
  });

  it("writes a diagram page with its scenarios, elements and links", () => {
    const page = pageView(data, {
      page: "diagram",
      key: "sequence/payment/payment",
      scenario: "rejected",
      element: null,
    });
    expect(page.title).toBe("payment");
    expect(page.html).toContain('<option value="2" selected>Pago rechazado</option>');
    expect(page.html).toContain('data-view="2"');
    const copy = pageView(data, {
      page: "diagram",
      key: "free/converted/grouped_free",
      scenario: null,
      element: null,
    });
    expect(copy.html).toContain('href="#/diagram/free/converted/grouped?element=api"');
    const containers = pageView(data, {
      page: "diagram",
      key: "c4/commerce/containers",
      scenario: null,
      element: null,
    });
    expect(containers.html).toContain('Entity <a href="#/entity/c4/commerce/commerce/shop.api">');
    expect(containers.html).not.toContain("Download source");
    // What an element opens leads the cell, and the views above lead the breadcrumbs.
    expect(containers.html).toContain('Opens <a href="#/diagram/c4/commerce/components">');
    const components = pageView(data, {
      page: "diagram",
      key: "c4/commerce/components",
      scenario: null,
      element: null,
    });
    const crumbs = /<nav class="crumbs"[^>]*>(.*?)<\/nav>/.exec(components.html)![1]!;
    expect(crumbs).toContain('<a href="#/diagram/c4/commerce/context">Commerce en contexto</a>');
    expect(crumbs.indexOf("context")).toBeLessThan(crumbs.indexOf("containers"));
    const free = pageView(data, {
      page: "diagram",
      key: "free/converted/grouped",
      scenario: null,
      element: null,
    });
    const freeCrumbs = /<nav class="crumbs"[^>]*>(.*?)<\/nav>/.exec(free.html)![1]!;
    expect(freeCrumbs).toContain("grouped_free");
  });

  it("writes story, entities, entity, search and not-found pages", () => {
    const story = pageView(data, { page: "story", key: "stories/purchase/purchase" }).html;
    expect(story).toContain("Scenes");
    expect(story).toContain('href="#/diagram/stories/purchase/checkout"');
    expect(pageView(data, { page: "entities" }).html).toContain("Shown in");
    const api = pageView(data, { page: "entity", key: "c4/commerce/commerce/shop.api" });
    expect(api.title).toBe("API");
    expect(api.html).toContain('href="#/diagram/c4/commerce/containers?element=shop.api"');
    const shop = pageView(data, { page: "entity", key: "c4/commerce/commerce/shop" }).html;
    expect(shop).toContain("Views scoped to it");
    expect(shop).toContain('href="#/diagram/c4/commerce/containers"');
    expect(pageView(data, { page: "search", query: "banco" }).html).toMatch(/\d results? for/);
    expect(pageView(data, { page: "story", key: "nope" }).title).toBe("Not found");
  });
});

describe("page", () => {
  const page = catalogPage(data, "window.x = '</script>';");

  it("is one offline file with a policy that forbids the network", () => {
    expect(page).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${CATALOG_POLICY}">`,
    );
    expect(CATALOG_POLICY).toContain("default-src 'none'");
    expect(page).not.toMatch(/(src|href)="https?:/);
    expect(page.match(/<\/script>/g)).toHaveLength(2);
  });

  it("holds the data, readable back, and the first page without scripts", () => {
    const json = /<script type="application\/json" id="meltemi-catalog">(.*)<\/script>/.exec(
      page,
    )![1]!;
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(data)));
    expect(page).toContain('<nav class="side" id="nav" aria-label="Catalog">');
    expect(page).toContain('<h1 tabindex="-1">Corpus &lt;catalog&gt;</h1>');
    expect(page).toContain('<meta name="generator" content="Meltemi Diagrams 1.0.0">');
  });

  it("names no local path", () => {
    expect(page).not.toContain(CORPUS_ROOT.replace(/\\/g, "/"));
    expect(page).not.toContain(CORPUS_ROOT);
  });
});

/** The paths of the sentences whose parameters differ between two catalogs. */
function otherParameters(a: object, b: object, path = ""): string[] {
  return Object.entries(a).flatMap(([key, value]) => {
    const other = (b as Record<string, unknown>)[key];
    const at = path === "" ? key : `${path}.${key}`;
    if (typeof value === "function") {
      return typeof other === "function" && other.length === value.length ? [] : [at];
    }
    return value !== null && typeof value === "object"
      ? otherParameters(value, other as object, at)
      : [];
  });
}

describe("the catalog in Spanish", () => {
  it("has every word in both languages, with the same parameters", () => {
    expect(untranslated(en, es, ["C4"])).toEqual([]);
    expect(otherParameters(en, es)).toEqual([]);
    expect(kindLabel("sequence", "es")).toBe("Secuencia");
    expect(kindLabel("sequence")).toBe("Sequence");
    expect(kindLabel("nope", "es")).toBeUndefined();
  });

  it("writes the page in the language it is given", () => {
    const spanish = catalogPage(data, "void 0", { lang: "es" });
    expect(spanish.startsWith('<!doctype html>\n<html lang="es">')).toBe(true);
    for (const text of [
      '<a class="skip" href="#main">Saltar al contenido</a>',
      '<label class="sr" for="search">Buscar en el catálogo</label>',
      'placeholder="Buscar (tecla /)"',
      '<nav class="side" id="nav" aria-label="Catálogo">',
      ">Vista general</a>",
      '<h2 class="nav-title">Carpetas</h2>',
      "7 diagramas · 1 historia · 8 entidades",
      "<noscript><p>Los dibujos, el reproductor y la búsqueda necesitan JavaScript",
      "<footer>Hecho con Meltemi Diagrams 1.0.0.</footer>",
    ]) {
      expect(spanish).toContain(text);
    }
    expect(spanish).not.toContain("Search");
    // English is the default: the same bytes with or without it.
    expect(catalogPage(data, "void 0", { lang: "en" })).toBe(catalogPage(data, "void 0"));
    expect(catalogPage(data, "void 0")).toContain('placeholder="Search (press /)"');
  });

  it("writes every page in Spanish", () => {
    const payment = pageView(
      data,
      { page: "diagram", key: "sequence/payment/payment", scenario: null, element: null },
      "es",
    ).html;
    expect(payment).toContain('<label for="scenario">Escenario</label>');
    expect(payment).toContain('<option value="0" selected>Tal como está escrito</option>');
    expect(payment).toContain('<option value="2">Pago rechazado</option>');
    expect(payment).toContain('<h2 id="elements">Elementos</h2>');
    expect(payment).toContain('<th scope="col">Origen</th><th scope="col">Destino</th>');
    expect(payment).toContain(">Descargar SVG</button>");
    expect(payment).toContain('<nav class="crumbs" aria-label="Ruta de navegación">');
    expect(payment).toMatch(/<code>payment<\/code> en <code>sequence\/payment.meltemi<\/code>/);
    const containers = pageView(
      data,
      { page: "diagram", key: "c4/commerce/containers", scenario: null, element: null },
      "es",
    ).html;
    expect(containers).toContain('Entidad <a href="#/entity/c4/commerce/commerce/shop.api">');
    const story = pageView(data, { page: "story", key: "stories/purchase/purchase" }, "es");
    expect(story.html).toContain('<h2 id="scenes">Escenas</h2>');
    expect(story.html).toContain('<span class="muted">desde 1,8 s</span>');
    expect(story.html).toContain(" · 7,4 s · 2 escenas</p>");
    expect(story.html).toContain('<h2 id="shows">Diagramas que muestra</h2>');
    const entities = pageView(data, { page: "entities" }, "es");
    expect(entities.title).toBe("Entidades");
    expect(entities.html).toContain('<th scope="col">Aparece en</th>');
    expect(entities.html).toContain(" (externa)");
    const api = pageView(data, { page: "entity", key: "c4/commerce/commerce/shop.api" }, "es");
    expect(api.html).toContain("<dt>Tecnología</dt><dd>HTTP</dd>");
    expect(api.html).toContain("<dt>Parte de</dt>");
    expect(api.html).toContain('<h2 id="shown">Aparece en</h2>');
    const missing = pageView(data, { page: "missing" }, "es");
    expect(missing.title).toBe("No encontrado");
    expect(missing.html).toContain('<a href="#/">Ir a la vista general</a>');
    const nav = navView(data, { page: "entities" }, "es");
    expect(nav).toContain('<a href="#/entities" aria-current="page">Entidades</a>');
    expect(nav).toContain('<span class="badge">Secuencia</span> payment');
  });

  it("searches and counts results in Spanish", () => {
    const results = searchCatalog(data, "PEDIDOS", "es");
    const checkout = results.find((r) => r.key === "stories/purchase/checkout")!;
    expect(checkout.label).toBe("Flujo");
    expect(checkout.matches).toContain("elemento “Pedidos”");
    expect(results.find((r) => r.kind === "entity")!.label).toBe("Entidad");
    // The kind is found by its Spanish name and by its keyword.
    for (const word of ["secuencia", "sequence"]) {
      expect(searchCatalog(data, word, "es").map((r) => r.key)).toContain(
        "sequence/payment/payment",
      );
    }
    expect(searchCatalog(data, "historia", "es").map((r) => r.key)).toContain(
      "stories/purchase/purchase",
    );
    expect(searchCatalog(data, "secuencia")).toEqual([]);
    const status = (query: string) =>
      /<p class="lead" id="search-status">([^<]*)<\/p>/.exec(
        pageView(data, { page: "search", query }, "es").html,
      )![1];
    expect(status("")).toBe("Escribe para buscar títulos, elementos, tecnología y descripciones.");
    expect(status("zzz")).toBe("Ningún resultado para “zzz”.");
    expect(status("PEDIDOS")).toBe(`${results.length} resultados para “PEDIDOS”.`);
    expect(pageView(data, { page: "search", query: "banco" }, "es").title).toBe("Búsqueda");
  });

  it("carries both languages in the runtime", () => {
    // The bundle is ASCII: words without accents are written as they are.
    const script = catalogScript();
    for (const word of ["Vista general", "Escribe para buscar", "Reproducir", "Resumen en texto"]) {
      expect(script).toContain(word);
    }
  });
});
