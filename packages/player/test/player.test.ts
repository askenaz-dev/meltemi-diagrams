import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { untranslated } from "@meltemi/diagrams-i18n";
import { layoutDiagram, type PolylineItem, type Scene } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { sceneGroups, viewKey } from "@meltemi/diagrams-motion";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
// The times a video export captures its frames at.
import { frameTimes } from "../../capture/src/page.mjs";
import { frameScene } from "../src/frame.js";
import {
  PlayerController,
  commandForKey,
  effectsDocument,
  effectsSummary,
  formatTime,
  frameSvg,
  isPlayerDocument,
  playerData,
  playerFragment,
  PLAYER_POLICY,
  playerPage,
  storyDocument,
  storySummary,
  storyViews,
  type HostOpenTarget,
  type LaidOutView,
  type StoryPlayerDocument,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages } from "../src/messages/index.js";
import { playerScript } from "../src/node.js";
import { ViewerViewport, viewerCommandForKey } from "../src/viewport.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");
const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
const engine = createElkEngine();

/** The commerce context view with its container and component views bundled, as a host does. */
export function commerceDocument(locale: "en" | "es" = "en", source = commerce) {
  const compilation = compile(source);
  const laid = (id: string): LaidOutView => {
    const diagram = compilation.document.diagrams.find((d) => d.id === id)!;
    return { diagram, layout: layoutDiagram(compilation, diagram, { engine, locale }) };
  };
  return effectsDocument(laid("context"), {
    locale,
    drill: {
      root: "f#context",
      views: new Map([
        ["f#containers", laid("containers")],
        ["f#components", laid("components")],
      ]),
      opens: new Map<string, Record<string, HostOpenTarget>>([
        [
          "f#context",
          { shop: { view: "f#containers", element: null, transition: "morph" as const } },
        ],
        [
          "f#containers",
          {
            "shop.api": { view: "f#components", element: null, transition: "morph" as const },
            // A target outside the document is dropped.
            "shop.db": { view: "f#elsewhere", element: null, transition: "fade" as const },
          },
        ],
      ]),
    },
  })!;
}

function purchaseDocument(): StoryPlayerDocument {
  const compilation = compile(purchase);
  const story = compilation.document.stories[0]!;
  const layouts = new Map<string, LaidOutView>();
  for (const [key, view] of storyViews(story)) {
    const diagram = view.diagram!;
    layouts.set(key, { diagram, layout: layoutDiagram(compilation, diagram, { engine }) });
  }
  return storyDocument(story, layouts)!;
}

describe("player documents", () => {
  it("builds a story document as plain, versioned data", () => {
    const doc = purchaseDocument();
    expect(doc).toMatchObject({
      format: "meltemi-player",
      version: 2,
      kind: "story",
      id: "purchase",
    });
    expect(doc.timeline.durationMs).toBe(7400);
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    expect(doc.names.checkout!.labels).toMatchObject({ db: "PostgreSQL", request: "HTTPS" });
    expect(doc.fontFaces).toEqual([]);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    expect(isPlayerDocument(JSON.parse(playerData(doc)))).toBe(true);
    expect(isPlayerDocument({ format: "meltemi-player", version: 1, kind: "story" })).toBe(false);
  });

  it("needs every view of the story", () => {
    const compilation = compile(purchase);
    expect(storyDocument(compilation.document.stories[0]!, new Map())).toBeUndefined();
    expect(viewKey(compilation.document.stories[0]!.target)).toBe("checkout");
  });

  it("builds an effects document, without an end for effects that repeat forever", () => {
    const compilation = compile(purchase);
    const diagram = compilation.document.diagrams[0]!;
    const doc = effectsDocument({
      diagram,
      layout: layoutDiagram(compilation, diagram, { engine }),
    })!;
    expect(doc).toMatchObject({ kind: "effects", key: "checkout" });
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    expect(doc.views.checkout!.durationMs).toBeNull();
    expect(doc.details.checkout!.elements.api).toMatchObject({
      kind: "node",
      type: null,
      opens: null,
    });
    expect(doc.details.checkout!.parent).toBeNull();
    expect(effectsSummary(doc)).toEqual([
      "Flow particles along “HTTPS”: 1.2 s a cycle, without end",
    ]);
  });
});

describe("player documents with bundled views", () => {
  it("keys views by diagram id and says what each element opens", () => {
    const doc = commerceDocument();
    expect(doc.key).toBe("context");
    expect(Object.keys(doc.views)).toEqual(["context", "containers", "components"]);
    expect(doc.details.context!.elements.shop!.opens).toEqual({
      view: "containers",
      element: null,
      transition: "morph",
    });
    expect(doc.details.context!.elements.customer!.opens).toBeNull();
    expect(doc.details.containers!.elements["shop.db"]!.opens).toBeNull();
    expect(doc.details.containers!.parent).toEqual({ view: "context", element: "shop" });
    expect(doc.details.components!.parent).toEqual({ view: "containers", element: "shop.api" });
    expect(doc.details.context!.parent).toBeNull();
    expect(doc.details.containers!.c4).toEqual({ level: "container", scope: "shop" });
  });

  it("writes the C4 type words in the content language and the relations' fields", () => {
    const en = commerceDocument();
    expect(en.details.containers!.elements["shop.api"]).toMatchObject({
      kind: "container",
      type: "Container",
      technology: "HTTP",
      entity: "shop.api",
    });
    expect(en.details.context!.elements.bank!).toMatchObject({
      type: "External Software System",
      external: true,
      description: "Autoriza tarjetas",
    });
    expect(en.details.containers!.relations.request).toMatchObject({
      label: "HTTPS",
      technology: "JSON/HTTPS",
      derived: false,
      sources: ["request"],
    });
    expect(commerceDocument("es").details.containers!.elements["shop.api"]!.type).toBe(
      "Contenedor",
    );
  });

  it("is plain data, the same twice, and never carries a comment", () => {
    const secret = commerce.replace(
      "diagram context: c4 using commerce {",
      "// internal: rotate keys on Friday\ndiagram context: c4 using commerce {",
    );
    const doc = commerceDocument("en", secret);
    expect(JSON.stringify(doc)).not.toContain("rotate keys");
    expect(JSON.stringify(commerceDocument())).toBe(JSON.stringify(commerceDocument()));
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe("player controller", () => {
  it("plays to the end, or loops", () => {
    const doc = purchaseDocument();
    const player = new PlayerController(doc, { autoplay: true });
    expect(player.playing).toBe(true);
    expect(player.tick(5000)).toBe(false);
    expect(player.sceneIndex).toBe(1);
    expect(player.announcement()).toBe("Scene 2 of 2: processing");
    expect(player.tick(5000)).toBe(true);
    expect([player.time, player.playing]).toEqual([7400, false]);
    player.play();
    expect(player.time).toBe(0);
    const looping = new PlayerController(doc, { autoplay: true, loop: true });
    looping.tick(7500);
    expect([looping.time, looping.playing]).toEqual([100, true]);
  });

  it("navigates scenes and steps with the keyboard", () => {
    const player = new PlayerController(purchaseDocument());
    player.run(commandForKey("PageDown")!);
    expect(player.time).toBe(1800);
    player.run(commandForKey("ArrowRight")!);
    expect(player.time).toBe(2800);
    player.run(commandForKey(",")!);
    expect(player.time).toBe(2700);
    // Page Up goes to the start of the scene first, then to the previous one.
    player.run("previousScene");
    expect(player.time).toBe(1800);
    player.run("previousScene");
    expect(player.time).toBe(0);
    player.run(commandForKey("End")!);
    expect(player.time).toBe(7400);
    expect(commandForKey("x")).toBeUndefined();
    expect(commandForKey(" ")).toBe("toggle");
  });

  it("shows final states in the static view and honours reduced motion", () => {
    const doc = purchaseDocument();
    const reduced = new PlayerController(doc, { autoplay: true, reducedMotion: true });
    expect([reduced.playing, reduced.staticView, reduced.canPlay]).toEqual([false, true, false]);
    // The final state of the first scene, just before the second starts.
    expect(reduced.time).toBeCloseTo(1800, 1);
    expect(reduced.sceneIndex).toBe(0);
    reduced.run("nextScene");
    expect(reduced.time).toBe(7400);
    reduced.seek(100);
    expect(reduced.sceneIndex).toBe(0);
    reduced.run("toggleStatic");
    expect(reduced.canPlay).toBe(true);
  });

  it("summarises the story with labels", () => {
    const [overview, processing] = storySummary(purchaseDocument());
    expect(overview).toEqual({
      heading: "Scene 1: overview (0 s to 1.8 s)",
      items: ["Reveal Cliente, API Gateway, Pedidos and PostgreSQL over 800 ms", "Hold 1 s"],
    });
    expect(processing!.items).toEqual([
      "Trace “HTTPS” from Cliente to API Gateway over 1.2 s",
      "Trace “Crear pedido” from API Gateway to Pedidos over 1.2 s",
      "At the same time: Trace “Persistir” from Pedidos to PostgreSQL over 1.2 s; Highlight PostgreSQL for 1.2 s",
      "Hold 2 s",
    ]);
  });
});

describe("player HTML", () => {
  it("keeps data and code inside their script elements", () => {
    const doc = { ...purchaseDocument(), title: "</script><b>x</b>", description: "a & b" };
    const data = playerData(doc);
    expect(data).not.toContain("<");
    expect(JSON.parse(data).title).toBe("</script><b>x</b>");
    const page = playerPage(doc, 'console.log("</script>")');
    expect(page).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${PLAYER_POLICY}">`,
    );
    expect(PLAYER_POLICY).toContain("default-src 'none'");
    expect(page.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(page).toContain("<title>&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;</title>");
    expect(page).toContain('<meta name="description" content="a &amp; b">');
    expect(page).toContain('console.log("<\\/script>")');
    expect(page.match(/<\/script>/g)).toHaveLength(2);
  });

  it("writes fragments with the element's options", () => {
    const fragment = playerFragment(purchaseDocument(), "void 0", {
      autoplay: true,
      controls: false,
    });
    expect(fragment).toMatch(
      /^<meltemi-player autoplay controls="false"><script type="application\/json">/,
    );
    expect(fragment).toContain("<script>void 0</script>");
  });

  it("bundles the runtime into one script", () => {
    const script = playerScript();
    expect(script).toContain("meltemi-player");
    expect(script).not.toMatch(/\bimport\s*\(/);
    expect(playerScript()).toBe(script);
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

/** A story through every action and transition, in one file. */
const TOUR = `language "0.2"

diagram one: flow {
  title "One"
  a["Alpha"]
  b["Beta"]
  c["Gamma"]
  a -> b: "Call" as call
  b -> c as save
}

diagram two: flow {
  a["Alpha"]
  b["Beta"]
}

story tour for one {
  scene first "First steps" {
    reveal a, b over 600ms
    hide c
    highlight call
    focus a, b
    hold 1s
  }
  scene second {
    focus all
    camera a
    camera all
    trace call over 1250ms
  }
  scene third {
    view two
    transition fade over 400ms
    reveal a
  }
  scene fourth {
    view one
    transition morph over 900ms
    hold 500ms
  }
  scene fifth {
    view two
    transition cut
    hold 1s
  }
}
`;

function tourDocument(): StoryPlayerDocument {
  const compilation = compile(TOUR);
  const story = compilation.document.stories[0]!;
  const layouts = new Map<string, LaidOutView>();
  for (const [key, view] of storyViews(story)) {
    const diagram = view.diagram!;
    layouts.set(key, { diagram, layout: layoutDiagram(compilation, diagram, { engine }) });
  }
  return storyDocument(story, layouts)!;
}

describe("the player in Spanish", () => {
  it("has every word in both languages, with the same parameters", () => {
    expect(untranslated(en, es, ["Zoom"])).toEqual([]);
    expect(otherParameters(en, es)).toEqual([]);
    expect(messages("es").controls.play).toBe("Reproducir");
    expect(messages().controls.play).toBe("Play");
    expect(messages("es").effects.times(1)).toBe("1 vez");
    expect(messages("es").effects.times(4)).toBe("4 veces");
  });

  it("writes times with the language's decimal mark", () => {
    expect(formatTime(1200, "es")).toBe("1,2 s");
    expect(formatTime(1250, "es")).toBe("1,25 s");
    expect(formatTime(7400, "es")).toBe("7,4 s");
    expect(formatTime(800, "es")).toBe("800 ms");
    expect(formatTime(0, "es")).toBe("0 s");
    expect(formatTime(12000, "es")).toBe("12 s");
    expect([formatTime(1200), formatTime(1250), formatTime(800)]).toEqual([
      "1.2 s",
      "1.25 s",
      "800 ms",
    ]);
  });

  it("summarises a story in Spanish", () => {
    const [overview, processing] = storySummary(purchaseDocument(), "es");
    expect(overview).toEqual({
      heading: "Escena 1: overview (de 0 s a 1,8 s)",
      items: ["Mostrar Cliente, API Gateway, Pedidos y PostgreSQL en 800 ms", "Esperar 1 s"],
    });
    expect(processing!.heading).toBe("Escena 2: processing (de 1,8 s a 7,4 s)");
    expect(processing!.items).toEqual([
      "Recorrer “HTTPS” de Cliente a API Gateway en 1,2 s",
      "Recorrer “Crear pedido” de API Gateway a Pedidos en 1,2 s",
      "Al mismo tiempo: Recorrer “Persistir” de Pedidos a PostgreSQL en 1,2 s; Resaltar PostgreSQL durante 1,2 s",
      "Esperar 2 s",
    ]);
  });

  it("names every action and change of view in both languages", () => {
    const doc = tourDocument();
    expect(storySummary(doc, "es").map((s) => [s.heading, ...s.items])).toEqual([
      [
        "Escena 1: First steps (de 0 s a 3,8 s)",
        "Mostrar Alpha y Beta en 600 ms",
        "Ocultar Gamma en 600 ms",
        "Resaltar Call durante 1 s",
        "Enfocar Alpha y Beta",
        "Esperar 1 s",
      ],
      [
        "Escena 2: second (de 3,8 s a 7,25 s)",
        "Quitar el foco",
        "Encuadrar Alpha",
        "Encuadrar toda la vista",
        "Recorrer “Call” de Alpha a Beta en 1,25 s",
      ],
      [
        "Escena 3: third (de 7,25 s a 8,25 s)",
        "Cambiar a two con un fundido de 400 ms",
        "Mostrar Alpha en 600 ms",
      ],
      [
        "Escena 4: fourth (de 8,25 s a 9,65 s)",
        "Cambiar a One con una transformación de 900 ms",
        "Esperar 500 ms",
      ],
      ["Escena 5: fifth (de 9,65 s a 10,65 s)", "Cambiar a two con un corte", "Esperar 1 s"],
    ]);
    expect(storySummary(doc).flatMap((s) => s.items)).toEqual(
      expect.arrayContaining([
        "Hide Gamma over 600 ms",
        "Focus on Alpha and Beta",
        "Clear the focus",
        "Frame the whole view",
        "Fade to two over 400 ms",
        "Morph to One over 900 ms",
        "Cut to two",
      ]),
    );
  });

  it("summarises effects in Spanish", () => {
    const compilation = compile(
      readFileSync(join(CORPUS_ROOT, "valid", "motion", "effects.meltemi"), "utf8"),
    );
    const [checkout, payment] = compilation.document.diagrams.map((diagram) =>
      effectsDocument({ diagram, layout: layoutDiagram(compilation, diagram, { engine }) })!,
    );
    expect(effectsSummary(checkout!, "es")).toEqual(
      expect.arrayContaining([
        "Partículas a lo largo de “HTTPS”: 1,2 s por ciclo, sin fin",
        "Un trazo en movimiento a lo largo de “OrderCreated”: 1 s por ciclo, 4 veces tras 300 ms",
        "Un pulso en “Orders DB”: 1,5 s por ciclo, sin fin",
      ]),
    );
    expect(effectsSummary(payment!, "es")).toContain("Un pulso en “API”: 1 s por ciclo, 2 veces");
  });

  it("announces scenes in the player's language", () => {
    const player = new PlayerController(purchaseDocument(), { autoplay: true, locale: "es" });
    player.tick(5000);
    expect(player.announcement()).toBe("Escena 2 de 2: processing");
    expect(player.locale).toBe("es");
    expect(new PlayerController(purchaseDocument()).locale).toBe("en");
  });

  it("writes the language into pages, and into fragments that are not in English", () => {
    const doc = purchaseDocument();
    const page = playerPage(doc, "void 0", { lang: "es" });
    expect(page.startsWith('<!doctype html>\n<html lang="es">')).toBe(true);
    // The page's language is the player's; the element does not repeat it.
    expect(page).toContain('<meltemi-player><script type="application/json">');
    expect(playerFragment(doc, "void 0", { lang: "es", autoplay: true })).toMatch(
      /^<meltemi-player lang="es" autoplay><script type="application\/json">/,
    );
    expect(playerFragment(doc, "void 0", { lang: "es-CL" })).toMatch(
      /^<meltemi-player lang="es-CL">/,
    );
    // English, the default, adds nothing: the same bytes with or without it.
    expect(playerFragment(doc, "void 0", { lang: "en", loop: true })).toBe(
      playerFragment(doc, "void 0", { loop: true }),
    );
    expect(playerPage(doc, "void 0", { lang: "en" })).toBe(playerPage(doc, "void 0"));
  });

  it("carries both languages in the runtime", () => {
    const script = playerScript();
    for (const word of ["Reproducir", "Pausar", "Escena anterior", "Resumen en texto"]) {
      expect(script).toContain(word);
    }
  });
});

describe("viewer viewport", () => {
  it("fits the drawing whole, never above actual size", () => {
    const small = new ViewerViewport({ width: 480, height: 300 }, { width: 480, height: 300 });
    expect(small.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect([small.atFit, small.pannable, small.percent]).toEqual([true, false, 100]);
    const big = new ViewerViewport({ width: 960, height: 600 }, { width: 480, height: 300 });
    expect(big.zoom).toBe(0.5);
    expect(big.limits).toEqual({ min: 0.1, max: 8 });
    const huge = new ViewerViewport({ width: 20000, height: 100 }, { width: 500, height: 300 });
    expect(huge.limits.min).toBeCloseTo(0.025);
  });

  it("zooms around a point, clamps the zoom and the pan", () => {
    const view = new ViewerViewport({ width: 480, height: 300 }, { width: 480, height: 300 });
    view.zoomBy(Math.exp(0.24), { x: 100, y: 100 });
    expect(view.zoom).toBeCloseTo(Math.exp(0.24));
    expect(view.toScreen(view.toContent({ x: 100, y: 100 }))).toEqual({ x: 100, y: 100 });
    expect([view.fitted, view.pannable]).toEqual([false, true]);
    view.setZoom(100);
    expect([view.zoom, view.atMax]).toEqual([8, true]);
    view.panBy(10_000, 10_000);
    expect(view.viewport.x).toBe(0);
    expect(view.viewport.y).toBe(0);
    expect(view.canPan(10, 0)).toBe(false);
    expect(view.canPan(-10, 0)).toBe(true);
    view.fit();
    expect([view.zoom, view.atFit, view.fitted]).toEqual([1, true, true]);
    view.zoomOut();
    expect(view.zoom).toBe(0.75);
    // A smaller drawing is centred and cannot move.
    expect(view.viewport.x).toBe(60);
    expect(view.canPan(10, 0)).toBe(false);
  });

  it("refits on resize while fitted, else keeps the zoom and the centre", () => {
    const view = new ViewerViewport({ width: 960, height: 600 }, { width: 480, height: 300 });
    view.resize({ width: 960, height: 600 });
    expect(view.zoom).toBe(1);
    view.zoomIn();
    const zoom = view.zoom;
    const centre = view.toContent({ x: 480, y: 300 });
    view.resize({ width: 480, height: 300 });
    expect(view.zoom).toBe(zoom);
    const after = view.toContent({ x: 240, y: 150 });
    expect(after.x).toBeCloseTo(centre.x);
    expect(after.y).toBeCloseTo(centre.y);
    view.resize({ width: 0, height: 0 });
    expect(view.stage).toEqual({ width: 480, height: 300 });
  });

  it("maps keys and pans by an eighth of the stage", () => {
    expect(["+", "=", "-", "0", "1"].map((k) => viewerCommandForKey(k, false))).toEqual([
      "zoomIn",
      "zoomIn",
      "zoomOut",
      "zoomFit",
      "zoomActual",
    ]);
    expect(viewerCommandForKey("ArrowLeft", false)).toBeUndefined();
    expect(viewerCommandForKey("ArrowLeft", true)).toBe("panLeft");
    expect(viewerCommandForKey("s", false)).toBeUndefined();
    const view = new ViewerViewport({ width: 800, height: 400 }, { width: 400, height: 200 });
    view.setZoom(1);
    const x = view.viewport.x;
    view.run("panRight");
    expect(view.viewport.x).toBe(x - 50);
    view.run("panLeft");
    expect(view.viewport.x).toBe(x);
  });

  it("reveals a box of the drawing", () => {
    const view = new ViewerViewport({ width: 800, height: 400 }, { width: 400, height: 200 });
    view.setZoom(1, { x: 0, y: 0 });
    view.reveal({ x: 700, y: 10, width: 60, height: 40 });
    expect(view.toScreen({ x: 760, y: 0 }).x).toBeLessThanOrEqual(400 - 16 + 1e-9);
  });
});

describe("selection, the keyboard walk and drill-downs in the controller", () => {
  it("lists the elements and relations of the view on screen in drawing order", () => {
    const player = new PlayerController(commerceDocument());
    const items = player.items();
    expect(items.filter((i) => i.role === "element").map((i) => i.id)).toEqual(
      expect.arrayContaining(["customer", "shop", "bank"]),
    );
    expect(items.some((i) => i.role === "relation")).toBe(true);
    const first = items.findIndex((i) => i.role === "relation");
    expect(items.slice(first).every((i) => i.role === "relation")).toBe(true);
  });

  it("walks the items with wrapping, and selects only items of the view", () => {
    const player = new PlayerController(commerceDocument());
    const items = player.items();
    expect(player.moveFocus(1)).toEqual(items[0]);
    expect(player.moveFocus(-1)).toEqual(items[items.length - 1]);
    expect(player.moveFocus(1)).toEqual(items[0]);
    expect(player.moveFocus(1, (i) => i.id === "bank")).toEqual({ role: "element", id: "bank" });
    expect(player.select({ role: "element", id: "nope" })).toBe(false);
    expect(player.selection).toBeNull();
    expect(player.select({ role: "element", id: "shop" })).toBe(true);
    expect(player.selection).toEqual({ role: "element", id: "shop" });
    expect(player.select(null)).toBe(true);
    expect(player.selection).toBeNull();
  });

  it("opens a child view with a camera move and a morph, and announces it", () => {
    const player = new PlayerController(commerceDocument());
    expect(player.canOpen("customer")).toBeNull();
    expect(player.open("customer")).toBe(false);
    expect(player.canOpen("shop")).toEqual({
      view: "containers",
      element: null,
      transition: "morph",
    });
    expect(player.open("shop")).toBe(true);
    expect(player.drill?.spec).toMatchObject({
      from: "context",
      to: "containers",
      element: "shop",
      direction: "down",
      cameraMs: 320,
      transitionMs: 480,
    });
    // Nothing opens during a drill-down.
    expect(player.canOpen("shop")).toBeNull();
    player.tick(400);
    expect(player.drill).not.toBeNull();
    player.tick(400);
    expect(player.drill).toBeNull();
    expect(player.view).toBe("containers");
    expect(player.trail).toEqual([{ view: "context", element: "shop" }]);
    expect(player.takeSettled()).toBe("Opened containers");
    expect(player.takeSettled()).toBeNull();
  });

  it("goes up with the reverse move, selecting the element it came from", () => {
    const player = new PlayerController(commerceDocument());
    player.open("shop");
    player.tick(800);
    player.open("shop.api");
    player.tick(800);
    expect(player.view).toBe("components");
    expect(player.trail.map((s) => s.view)).toEqual(["context", "containers"]);
    expect(player.up()).toBe(true);
    expect(player.drill?.spec).toMatchObject({
      from: "components",
      to: "containers",
      direction: "up",
    });
    player.tick(800);
    expect(player.view).toBe("containers");
    expect(player.selection).toEqual({ role: "element", id: "shop.api" });
    expect(player.takeSettled()).toBe("Back in containers");
    // A crumb jumps several levels at once.
    player.open("shop.api");
    player.tick(800);
    expect(player.up(0)).toBe(true);
    player.tick(800);
    expect(player.view).toBe("context");
    expect(player.trail).toEqual([]);
    expect(player.up()).toBe(false);
  });

  it("cuts under reduced motion and plays a host's entering move", () => {
    const reduced = new PlayerController(commerceDocument(), { reducedMotion: true });
    reduced.open("shop");
    expect(reduced.drill).toBeNull();
    expect(reduced.view).toBe("containers");
    const doc = commerceDocument();
    const entering = new PlayerController(doc);
    entering.enter({ key: "from:x", view: doc.views.containers! }, "shop.api", "down", "fade");
    expect(entering.drill?.spec).toMatchObject({ cameraMs: 0, transitionMs: 480, to: "context" });
    entering.tick(480);
    expect(entering.view).toBe("context");
  });

  it("offers nothing to open in a story", () => {
    const player = new PlayerController(purchaseDocument());
    expect(player.canOpen("api")).toBeNull();
    expect(player.up()).toBe(false);
    expect(player.items().length).toBeGreaterThan(0);
  });
});

describe("drawn whiteboards", () => {
  const BOARD = `language "0.2"
diagram board: free {
  pen title [(0, 0), (60, 20), (120, 0), (180, 20)]
  pen arrow [(0, 60), (180, 60)]
  style arrow { arrowhead triangle }
}
story walk for board {
  scene one {
    draw title over 1s
    hold 1s
  }
  scene two {
    draw title, arrow over 2s
  }
}
`;

  function boardDocument(): StoryPlayerDocument {
    const compilation = compile(BOARD);
    expect(compilation.diagnostics).toEqual([]);
    const story = compilation.document.stories[0]!;
    const layouts = new Map<string, LaidOutView>();
    for (const [key, view] of storyViews(story)) {
      const diagram = view.diagram!;
      layouts.set(key, { diagram, layout: layoutDiagram(compilation, diagram, { engine }) });
    }
    return storyDocument(story, layouts)!;
  }
  const groupOf = (scene: Scene, id: string) =>
    sceneGroups(scene.items).find((g) => g.role === "element" && g.id === id)!;

  it("draws half of a stroke at 500 ms and the whole of it at 1500 ms of a video", () => {
    // The page a video is captured from parses the document's data and draws each frame time.
    const data = JSON.parse(playerData(boardDocument())) as StoryPlayerDocument;
    const times = frameTimes(data.timeline.durationMs, 30);
    expect([times[15], times[45]]).toEqual([500, 1500]);
    const half = frameScene(data, times[15]!)!;
    const [stroke, ...rest] = groupOf(half, "title").items as PolylineItem[];
    expect(rest).toEqual([]);
    expect(stroke!.dash!.offset).toBeCloseTo(stroke!.dash!.array[0]! / 2, 1);
    expect(frameSvg(data, times[15]!)).toContain(`stroke-dasharray="${stroke!.dash!.array[0]}`);
    // The arrow is drawn in the second scene: hidden until then.
    expect(groupOf(half, "arrow").opacity).toBe(0);
    const whole = frameScene(data, times[45]!)!;
    expect(groupOf(whole, "title")).toEqual(groupOf(data.views.board!.scene, "title"));
  });

  it("says what a draw does in both languages", () => {
    const doc = boardDocument();
    expect(storySummary(doc).map((s) => s.items)).toEqual([
      ["Draw title stroke by stroke over 1 s", "Hold 1 s"],
      ["Draw title and arrow stroke by stroke over 2 s"],
    ]);
    expect(storySummary(doc, "es")[1]!.items).toEqual([
      "Dibujar title y arrow trazo a trazo en 2 s",
    ]);
  });
});
