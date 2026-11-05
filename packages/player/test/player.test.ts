import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { untranslated } from "@meltemi/diagrams-i18n";
import { layoutDiagram, type PolylineItem, type Scene } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { sceneGroups, sceneStills, storyFrame, viewKey } from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { BROKEN_STORY, FLOWS_SOURCE } from "../../../test-support/flows.js";
// The times a video export captures its frames at.
import { frameTimes } from "../../capture/src/page.mjs";
import { frameScene } from "../src/frame.js";
import {
  PlayerController,
  commandForKey,
  detailsOf,
  effectsDocument,
  effectsSummary,
  formatTime,
  frameSvg,
  isPlayerDocument,
  playerData,
  playerFragment,
  PLAYER_POLICY,
  playerPage,
  readPlayerDocument,
  storiesDocument,
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
import {
  civilText,
  scheduleCard,
  schedulePanel,
  scheduleType,
  workingText,
} from "../src/schedule.js";
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

/** The laid-out views of every story of a source, by story id; a diagram with errors has none. */
function storyLayouts(source: string) {
  const compilation = compile(source);
  return compilation.document.stories.map((story) => {
    const layouts = new Map<string, LaidOutView>();
    for (const [key, view] of storyViews(story)) {
      const diagram = view.diagram!;
      if (diagram.hasErrors) continue;
      layouts.set(key, { diagram, layout: layoutDiagram(compilation, diagram, { engine }) });
    }
    return { story, layouts };
  });
}

/** The purchase and refund stories in one document, over the one `checkout` view. */
export function flowsDocument(): StoryPlayerDocument {
  return storiesDocument(storyLayouts(FLOWS_SOURCE)).document!;
}

describe("player documents", () => {
  it("builds a story document as plain, versioned data", () => {
    const doc = purchaseDocument();
    expect(doc).toMatchObject({
      format: "meltemi-player",
      version: 3,
      kind: "story",
      id: "purchase",
      title: "A purchase",
    });
    expect(doc.stories.map((s) => s.id)).toEqual(["purchase"]);
    expect(doc.stories[0]!.timeline.durationMs).toBe(7400);
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    expect(doc.names.checkout!.labels).toMatchObject({ db: "PostgreSQL", request: "HTTPS" });
    expect(doc.fontFaces).toEqual([]);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    expect(isPlayerDocument(JSON.parse(playerData(doc)))).toBe(true);
    expect(isPlayerDocument({ format: "meltemi-player", version: 1, kind: "story" })).toBe(false);
  });

  it("reads a version 2 document as one story of one, and refuses version 1", () => {
    const doc = purchaseDocument();
    const { stories, ...rest } = doc;
    const version2 = { ...rest, version: 2, timeline: stories[0]!.timeline };
    expect(isPlayerDocument(version2)).toBe(true);
    expect(readPlayerDocument(JSON.parse(JSON.stringify(version2)))).toEqual(doc);
    const effects = commerceDocument();
    expect(readPlayerDocument({ ...effects, version: 2 })).toEqual(effects);
    expect(readPlayerDocument(doc)).toBe(doc);
    for (const refused of [
      { ...version2, version: 1 },
      { ...rest, version: 2 },
      { ...doc, stories: [] },
      { ...doc, version: 4 },
      { ...doc, format: "other" },
      null,
      "meltemi-player",
    ]) {
      expect(isPlayerDocument(refused)).toBe(false);
      expect(readPlayerDocument(refused)).toBeUndefined();
    }
  });

  it("builds several stories into one document over the views they share", () => {
    const built = storiesDocument(storyLayouts(FLOWS_SOURCE));
    expect(built.left).toEqual([]);
    const doc = built.document!;
    expect(doc.stories.map((s) => [s.id, s.title, s.timeline.durationMs])).toEqual([
      ["purchase", "A purchase", 7400],
      ["refund", "Refund", 3400],
    ]);
    // The document is named by its first story, and `checkout` is embedded once.
    expect([doc.id, doc.title]).toEqual(["purchase", "A purchase"]);
    expect(Object.keys(doc.views)).toEqual(["checkout"]);
    expect(doc.stories.every((s) => s.timeline.views.join() === "checkout")).toBe(true);
    // The same inputs give the same document.
    expect(JSON.stringify(flowsDocument())).toBe(JSON.stringify(doc));
    expect(isPlayerDocument(JSON.parse(playerData(doc)))).toBe(true);
    // Each story draws as its own timeline does.
    for (const [index, story] of doc.stories.entries()) {
      for (const t of [0, 700, story.timeline.durationMs]) {
        const drawn = storyFrame(story.timeline, (key) => doc.views[key], t, {
          accent: doc.accent,
        })!;
        expect(frameSvg(doc, t, { story: index })).toBe(renderSvg(drawn, { fonts: "system" }));
      }
    }
    expect(frameSvg(doc, 700)).toBe(frameSvg(doc, 700, { story: 0 }));
    expect(frameSvg(doc, 700, { story: 1 })).not.toBe(frameSvg(doc, 700, { story: 0 }));
    // A single story builds the same document as `storyDocument`.
    expect(storiesDocument(storyLayouts(purchase)).document).toEqual(purchaseDocument());
  });

  it("leaves out a story whose view cannot be drawn, and makes nothing of it alone", () => {
    const stories = storyLayouts(`${FLOWS_SOURCE}${BROKEN_STORY}`);
    expect(stories.map((s) => s.story.id)).toEqual(["purchase", "refund", "outage"]);
    const built = storiesDocument([stories[2]!, stories[0]!, stories[1]!]);
    expect(built.left).toEqual(["outage"]);
    expect(built.document!.stories.map((s) => s.id)).toEqual(["purchase", "refund"]);
    expect(Object.keys(built.document!.views)).toEqual(["checkout"]);
    expect(storiesDocument([stories[2]!])).toEqual({ document: undefined, left: ["outage"] });
    expect(storyDocument(stories[2]!.story, stories[2]!.layouts)).toBeUndefined();
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

  it("draws a scene's final state at the instant of its still", () => {
    const doc = purchaseDocument();
    const player = new PlayerController(doc);
    const stills = sceneStills(doc.stories[0]!.timeline).map((s) => s.atMs);
    expect(stills).toEqual([1800 - 0.01, 7400]);
    expect([player.sceneEnd(0), player.sceneEnd(1), player.sceneEnd(2)]).toEqual([...stills, 0]);
  });

  it("goes to another story at its start, stopped, keeping the static view", () => {
    const doc = flowsDocument();
    const player = new PlayerController(doc, { autoplay: true });
    expect([player.story, player.storyTitle, player.duration]).toEqual([0, "A purchase", 7400]);
    player.tick(2000);
    player.goToStory(1);
    expect([player.story, player.time, player.playing]).toEqual([1, 0, false]);
    expect([player.storyTitle, player.duration, player.scenes.map((s) => s.id)]).toEqual([
      "Refund",
      3400,
      ["request", "refunded"],
    ]);
    expect(player.view).toBe("checkout");
    // In the static view, its first scene's final state.
    player.setStatic(true);
    player.goToStory(0);
    player.goToStory(1);
    expect([player.staticView, player.time]).toEqual([true, 1400 - 0.01]);
    player.goToStory(9);
    expect(player.story).toBe(1);
    // The story chosen first, by id; an unknown one gives the first.
    expect(new PlayerController(doc, { story: "refund" }).story).toBe(1);
    expect(new PlayerController(doc, { story: "tour" }).story).toBe(0);
    expect(new PlayerController(purchaseDocument(), { story: "refund" }).story).toBe(0);
    expect(storySummary(doc, "en", 1).map((s) => s.heading)).toEqual([
      "Scene 1: request (0 s to 1.4 s)",
      "Scene 2: refunded (1.4 s to 3.4 s)",
    ]);
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
    const times = frameTimes(data.stories[0]!.timeline.durationMs, 30);
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

describe("gantt charts in the player", () => {
  const roadmap = readFileSync(join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"), "utf8");
  /** The owner's chart with statements added before its closing brace, and a story about it. */
  const chart = (extra = "", story = "") => `${roadmap.replace(/\}\s*$/, `${extra}\n}\n`)}${story}`;

  function layoutOf(source: string, locale: "en" | "es" = "en") {
    const compilation = compile(source);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    return {
      compilation,
      diagram,
      layout: layoutDiagram(compilation, diagram, { engine, locale, today: "2026-10-29" }),
    };
  }
  function effectsOf(extra = "", locale: "en" | "es" = "en") {
    const { diagram, layout } = layoutOf(chart(extra), locale);
    return effectsDocument({ diagram, layout }, { locale })!;
  }
  function storyOf(story: string, locale: "en" | "es" = "en") {
    const source = chart("", `\nstory plan for hoja_de_ruta_genai {\n${story}\n}\n`);
    const { compilation, diagram, layout } = layoutOf(source, locale);
    const [definition] = compilation.document.stories;
    const layouts = new Map<string, LaidOutView>([["hoja_de_ruta_genai", { diagram, layout }]]);
    return storyDocument(definition!, layouts, { locale })!;
  }
  const label =
    (doc: { names: Record<string, { labels: Record<string, string> }> }) => (id: string) =>
      doc.names.hoja_de_ruta_genai!.labels[id] ?? id;

  it("carries the schedule of each element as plain data, and nothing of how it is written", () => {
    const doc = effectsOf(
      "milestone beta after tec2\nmarker freeze at 2026-06-10\n// internal: rotate keys on Friday",
    );
    const elements = doc.details.hoja_de_ruta_genai!.elements;
    expect(elements.tec1!.schedule).toEqual({
      start: "2026-06-08",
      end: "2026-06-19",
      workingSeconds: 10 * 86_400,
      status: null,
      critical: false,
      section: "tecnologia",
      after: ["tec0"],
    });
    // A task of one day starts and ends on it; a milestone and a marker have one date.
    expect(elements.tec2!.schedule).toMatchObject({ start: "2026-06-22", end: "2026-06-22" });
    expect(elements.beta!.schedule).toMatchObject({
      start: "2026-06-23",
      end: "2026-06-23",
      workingSeconds: null,
      after: ["tec2"],
    });
    expect(elements.freeze!.schedule).toMatchObject({ start: "2026-06-10", end: "2026-06-10" });
    // A section spans its tasks.
    expect(elements.tecnologia!.schedule).toEqual({
      start: "2026-06-01",
      end: "2026-06-22",
      workingSeconds: null,
      status: null,
      critical: false,
      section: null,
      after: [],
    });
    expect(elements.i_d!.schedule).toMatchObject({ start: "2026-07-01", end: "2026-08-28" });
    // Plain data, and never the clauses, the comments or the diagnostics.
    const json = JSON.stringify(doc);
    expect(JSON.parse(json)).toEqual(doc);
    expect(json).not.toContain("rotate keys");
    expect(json).not.toContain("for 10d");
    expect(json).not.toContain("after tec0");
    expect(json).not.toContain("diagnostic");
    expect(JSON.stringify(effectsOf())).toBe(JSON.stringify(effectsOf()));
  });

  it("writes the dates with their times, and the status and the critical mark", () => {
    const doc = effectsOf(
      'task night "Night" from 2026-09-01T22:30 for 90min done critical\ntask review "Review" after night for 1h active',
    );
    const { night, review } = doc.details.hoja_de_ruta_genai!.elements;
    expect(night!.schedule).toMatchObject({
      start: "2026-09-01T22:30",
      end: "2026-09-02T00:00",
      workingSeconds: 5400,
      status: "done",
      critical: true,
    });
    expect(review!.schedule).toMatchObject({
      start: "2026-09-02T00:00",
      end: "2026-09-02T01:00",
      status: "active",
    });
  });

  it("leaves the details of other diagrams as they were", () => {
    const doc = effectsDocument(layoutedPurchase())!;
    for (const element of Object.values(doc.details.checkout!.elements)) {
      expect("schedule" in element).toBe(false);
    }
  });

  it("writes a task's card in Spanish: section, dates, working days and what it follows", () => {
    const doc = effectsOf("", "es");
    const details = doc.details.hoja_de_ruta_genai!.elements.tec1!;
    const card = scheduleCard(details, details.schedule!, label(doc), "es");
    expect(card).toEqual({
      meta: "Tecnología",
      ends: "8 jun 2026 → 19 jun 2026 · 10 días hábiles",
      note: "Después de: Evaluar plataformas de agentes",
    });
    expect(doc.names.hoja_de_ruta_genai!.labels.tec1).toBe(
      "Prueba de concepto con el equipo de Arquitectura",
    );
    const english = scheduleCard(details, details.schedule!, label(doc), "en");
    expect(english).toEqual({
      meta: "Tecnología",
      ends: "8 Jun 2026 → 19 Jun 2026 · 10 working days",
      note: "After: Evaluar plataformas de agentes",
    });
  });

  it("writes a milestone's date, a marker's and a section's span, and the states of a task", () => {
    const doc = effectsOf(
      'milestone beta "Beta" after tec2 done\nmarker freeze "Freeze" at 2026-06-10\ntask hot "Hot" from 2026-09-01 for 2d active critical\ntask cold "Cold" after hot for 3d done',
    );
    const elements = doc.details.hoja_de_ruta_genai!.elements;
    const card = (id: string, locale: "en" | "es") =>
      scheduleCard(elements[id]!, elements[id]!.schedule!, label(doc), locale);
    expect(card("beta", "es")).toEqual({
      meta: "Hecho",
      ends: "23 jun 2026",
      note: "Después de: Presentar resultados al comité Arq",
    });
    expect(card("beta", "en").ends).toBe("23 Jun 2026");
    expect(card("freeze", "en")).toEqual({ meta: null, ends: "10 Jun 2026", note: null });
    expect(card("tecnologia", "es")).toEqual({
      meta: null,
      ends: "1 jun 2026 → 22 jun 2026",
      note: null,
    });
    expect(card("hot", "en")).toMatchObject({
      meta: "In progress · Critical",
      ends: "1 Sep 2026 → 2 Sep 2026 · 2 working days",
    });
    expect(card("hot", "es").meta).toBe("En curso · Crítica");
    expect(card("cold", "es")).toMatchObject({ meta: "Hecha", note: "Después de: Hot" });
    // Several predecessors are listed as the language lists things.
    const several = effectsOf('task join "Join" after tec0, flu0, sdlc1 for 1d');
    const join = several.details.hoja_de_ruta_genai!.elements.join!;
    expect(scheduleCard(join, join.schedule!, label(several), "en").note).toBe(
      "After: Evaluar plataformas de agentes, Propuesta de flujo ágil de evaluación and Workshops AI-SDLC",
    );
  });

  it("lists the panel's facts: section, dates, working time and state, and the kind", () => {
    const doc = effectsOf("", "es");
    const tec1 = doc.details.hoja_de_ruta_genai!.elements.tec1!;
    expect(schedulePanel(tec1, tec1.schedule!, label(doc), "es")).toEqual([
      { term: "Sección", value: "Tecnología" },
      { term: "Inicio", value: "8 jun 2026" },
      { term: "Fin", value: "19 jun 2026" },
      { term: "Tiempo hábil", value: "10 días hábiles" },
      { term: "Estado", value: "Prevista" },
    ]);
    expect(scheduleType(tec1, tec1.schedule!, "es")).toBe("Tarea");
    expect(schedulePanel(tec1, tec1.schedule!, label(doc), "en").map((f) => f.term)).toEqual([
      "Section",
      "Start",
      "End",
      "Working time",
      "Status",
    ]);
    const section = doc.details.hoja_de_ruta_genai!.elements.tecnologia!;
    expect(schedulePanel(section, section.schedule!, label(doc), "en")).toEqual([
      { term: "Start", value: "1 Jun 2026" },
      { term: "End", value: "22 Jun 2026" },
    ]);
    expect(scheduleType(section, section.schedule!, "en")).toBe("Section");
  });

  it("writes working time in days, a fraction of a day, hours, minutes and seconds", () => {
    expect(workingText(86_400, "en")).toBe("1 working day");
    expect(workingText(10 * 86_400, "en")).toBe("10 working days");
    expect(workingText(10 * 86_400, "es")).toBe("10 días hábiles");
    expect(workingText(86_400, "es")).toBe("1 día hábil");
    expect(workingText(2.5 * 86_400, "en")).toBe("2.5 working days");
    expect(workingText(2.5 * 86_400, "es")).toBe("2,5 días hábiles");
    expect(workingText(5400, "en")).toBe("1.5 h");
    expect(workingText(5400, "es")).toBe("1,5 h");
    expect(workingText(2700, "en")).toBe("45 min");
    expect(workingText(30, "es")).toBe("30 s");
    expect(civilText("2026-06-08T09:30", "es")).toBe("8 jun 2026 09:30");
    expect(civilText("2026-12-01", "en")).toBe("1 Dec 2026");
    expect(civilText("not a date", "en")).toBe("not a date");
  });

  it("says nothing of dates for a task in a loop, and its card shows only what it has", () => {
    const compilation = compile(chart("task x after y for 1d\ntask y after x for 1d"));
    const details = detailsOf(compilation.document.diagrams[0]!, "en");
    expect(details.elements.x!.schedule).toEqual({
      start: null,
      end: null,
      workingSeconds: null,
      status: null,
      critical: false,
      section: null,
      after: ["y"],
    });
    const x = details.elements.x!;
    expect(scheduleCard(x, x.schedule!, (id) => id, "en")).toEqual({
      meta: null,
      ends: null,
      note: "After: y",
    });
    expect(schedulePanel(x, x.schedule!, (id) => id, "en")).toEqual([
      { term: "Status", value: "Planned" },
    ]);
  });

  it("names the arrows of a chain and the bars drawn, in words, in both languages", () => {
    const doc = storyOf("  scene one {\n    draw tec0, tec1 over 2s\n    trace flu3 over 3s\n  }");
    expect(storySummary(doc).map((s) => s.items)).toEqual([
      [
        "Draw the bars of Evaluar plataformas de agentes and Prueba de concepto con el equipo de Arquitectura over 2 s",
        "Trace the dependencies of Marcha Blanca primeros casos de uso over 3 s",
      ],
    ]);
    expect(storySummary(doc, "es").map((s) => s.items)).toEqual([
      [
        "Dibujar las barras de Evaluar plataformas de agentes y Prueba de concepto con el equipo de Arquitectura en 2 s",
        "Recorrer las dependencias de Marcha Blanca primeros casos de uso en 3 s",
      ],
    ]);
    // A trace of one arrow into a task says the same of its task.
    const one = storyOf("  scene one {\n    trace tec1\n  }");
    expect(storySummary(one)[0]!.items).toEqual([
      "Trace the dependencies of Prueba de concepto con el equipo de Arquitectura over 1.2 s",
    ]);
  });

  it("names the arrow an effect runs along by the tasks it joins", () => {
    const doc = effectsOf("animate flu3 { effect flow; duration 2s; repeat 1 }");
    expect(effectsSummary(doc)).toEqual([
      "Flow particles along “Integración con LeanIX → Marcha Blanca primeros casos de uso”: 2 s a cycle, 1 time",
    ]);
    expect(effectsSummary(doc, "es")).toEqual([
      "Partículas a lo largo de “Integración con LeanIX → Marcha Blanca primeros casos de uso”: 2 s por ciclo, 1 vez",
    ]);
  });

  it("walks the sections, tasks and arrows, never the axis", () => {
    const player = new PlayerController(effectsOf("milestone beta after tec2"));
    const items = player.items();
    const elements = items.filter((i) => i.role === "element").map((i) => i.id);
    expect(elements).toEqual(
      expect.arrayContaining(["tecnologia", "tec0", "tec1", "i_d", "sdlc2", "beta"]),
    );
    expect(elements).not.toContain("axis");
    // The arrows are relations, named by their keys.
    expect(items.filter((i) => i.role === "relation").map((i) => i.id)).toContain("tec0->tec1#1");
    // A section comes before the tasks it holds.
    expect(elements.indexOf("tecnologia")).toBeLessThan(elements.indexOf("tec0"));
    expect(player.select({ role: "relation", id: "sdlc1->sdlc2#1" })).toBe(true);
  });

  it("draws a story's frames with the bars clipped, as the exporters draw them", () => {
    const doc = storyOf("  scene one {\n    draw tec0, tec1 over 2s\n  }");
    const data = JSON.parse(playerData(doc)) as StoryPlayerDocument;
    expect(isPlayerDocument(data)).toBe(true);
    expect(data.views.hoja_de_ruta_genai!.holders).toMatchObject({
      tec1: ["tecnologia"],
      sdlc2: ["i_d"],
    });
    // 250 ms: the first bar is a quarter drawn, and only it is under a clip.
    const svg = frameSvg(data, 250);
    expect(svg).toContain('id="mdg-draw-clip-tec0"');
    expect(svg).not.toContain('id="mdg-draw-clip-tec1"');
    const sameAgain = frameSvg(data, 250);
    expect(sameAgain).toBe(svg);
    expect(frameSvg(data, 2000)).not.toContain("mdg-draw-clip");
  });
});

/** The checkout diagram of the purchase story, laid out. */
function layoutedPurchase(): LaidOutView {
  const compilation = compile(purchase);
  const diagram = compilation.document.diagrams[0]!;
  return { diagram, layout: layoutDiagram(compilation, diagram, { engine }) };
}
