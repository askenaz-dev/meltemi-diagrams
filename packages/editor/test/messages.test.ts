import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { KEY_BINDINGS } from "../src/canvas/keyboard.js";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
  type InspectorModel,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { keyMessages } from "../src/messages/keys.js";
import {
  buildCatalog,
  produceExport,
  profileRequest,
  ProjectSessions,
  type ExportContext,
  type ExportRequest,
} from "../src/node.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

const SHEET = [
  'language "0.2"',
  "",
  "theme brand {",
  '  extends "technical.light"',
  "}",
  "",
  "diagram checkout: flow {",
  '  theme "brand"',
  "  layout manual",
  "  node api",
  "  node db",
  "  api -> db as save",
  "  db -> api",
  "  animate save { effect dash }",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "  }",
  "}",
  "",
].join("\n");

/** A session on a text, keeping the messages of the last exchange. */
function open(text: string, diagram: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let shown: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      shown = [
        ...result.messages,
        ...session.update(analyzeDocument({ text: current, revision: rev })),
      ];
    } else if (result.messages.length > 0) {
      shown = [...result.messages];
    }
    return result;
  };
  send({ type: "pickDiagram", diagram });
  const find = <T extends HostMessage["type"]>(type: T) =>
    shown.find((m): m is Extract<HostMessage, { type: T }> => m.type === type);
  return {
    send,
    act: (action: CanvasAction) => send({ type: "action", revision: rev, action }),
    apply: (action: CanvasAction): string => {
      const result = send({ type: "action", revision: rev, action });
      if (!result.plan) throw new Error(JSON.stringify(result.messages));
      return current;
    },
    inspector: (): InspectorModel => find("inspector")!.model,
    panel: () => find("themePanel")?.panel ?? null,
    rejected: () => find("rejected")?.reason,
    status: () => find("status")?.message,
    empty: () => find("empty")?.message,
  };
}

const field = (model: InspectorModel, name: string) => model.fields.find((f) => f.name === name)!;

describe("the editor's catalogs", () => {
  it("have every English entry in Spanish", () => {
    // Words that are the same in both languages: abbreviations, letters and kinds.
    expect(untranslated(en, es, ["Id", "URL", "X", "Y", "Base", "actor", "control"])).toEqual([]);
    expect(untranslated(keyMessages("en"), keyMessages("es"))).toEqual([]);
  });

  it("are in English by default, as every other test expects", () => {
    expect(getLocale()).toBe("en");
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "select", ids: ["db"] });
    expect(canvas.inspector().title).toBe("node db");
    expect(field(canvas.inspector(), "style.fill").label).toBe("Fill");
    expect(KEY_BINDINGS.find((b) => b.command === "selectAll")!.description).toBe(
      "Select every element",
    );
  });
});

describe("a Spanish interface", () => {
  beforeEach(() => setLocale("es"));
  afterEach(() => setLocale("en"));

  it("titles and labels the inspector of an element, a relation and several", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "select", ids: ["db"] });
    const node = canvas.inspector();
    expect(node.title).toBe("nodo db");
    expect(node.fields.filter((f) => f.section === "strip").map((f) => f.label)).toEqual(
      expect.arrayContaining(["Relleno", "Borde", "Color del texto"]),
    );
    expect(["style.fill", "style.stroke", "style.color"].map((n) => field(node, n).label)).toEqual([
      "Relleno",
      "Borde",
      "Color del texto",
    ]);
    expect(["kind", "label", "w", "h"].map((n) => field(node, n).label)).toEqual([
      "Tipo",
      "Etiqueta",
      "Ancho",
      "Alto",
    ]);
    // Values of the language stay as written.
    expect(field(node, "kind").value).toBe("node");

    canvas.send({ type: "select", ids: ["save"] });
    const relation = canvas.inspector();
    expect(relation.title).toBe("relación save");
    expect(["from", "to", "style.arrowhead"].map((n) => field(relation, n).label)).toEqual([
      "Origen",
      "Destino",
      "Punta final",
    ]);
    expect(field(relation, "effect.dash").label).toBe("Trazo en movimiento");
    expect(field(relation, "effect.dash.duration").label).toBe(
      "Trazo en movimiento: duración (ms)",
    );
    expect(field(relation, "effect.dash.repeat")).toMatchObject({
      label: "Trazo en movimiento: repetir",
      placeholder: "forever",
    });

    canvas.send({ type: "select", ids: ["api", "db"] });
    expect(canvas.inspector().title).toBe("2 seleccionados");
  });

  it("titles the diagram and offers the theme's counterpart in Spanish", () => {
    const canvas = open(SHEET.replace('  theme "brand"\n', ""), "checkout");
    const diagram = canvas.inspector();
    expect(diagram.title).toBe("Diagrama checkout");
    expect(field(diagram, "layout")).toMatchObject({
      label: "Disposición",
      value: "manual",
      placeholder: "auto",
    });
    expect(field(diagram, "canvas")).toMatchObject({ label: "Lienzo", placeholder: "fit" });
    expect(field(diagram, "theme").quick).toEqual([{ label: "Oscuro", value: "technical.dark" }]);
  });

  it("sizes the canvas in Spanish", () => {
    const sized = SHEET.replace("  layout manual\n", "  layout manual\n  canvas (800, 600)\n");
    const canvas = open(sized, "checkout");
    const diagram = canvas.inspector();
    expect(["canvas", "canvas.width", "canvas.height"].map((n) => field(diagram, n).label)).toEqual(
      ["Lienzo", "Ancho", "Alto"],
    );
    canvas.act({ kind: "setField", ids: [], field: "canvas.width", value: 50 });
    expect(canvas.rejected()).toBe("Escribe un número de 100 a 10000.");
    canvas.act({ kind: "setField", ids: [], field: "canvas", value: "poster" });
    expect(canvas.rejected()).toBe("El lienzo es uno de `fit`, `document`, `slide`, `custom`.");
  });

  it("groups the theme panel in Spanish", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "editTheme", open: true });
    const panel = canvas.panel()!;
    expect(panel.groups.map((g) => g.title)).toEqual([
      "Base",
      "Colores",
      "Fuentes",
      "Tipografía",
      "Espaciado",
      "Formas y líneas",
      "Iconos",
      "Marco",
      "Movimiento",
      "Lienzo",
    ]);
    const labels = panel.groups.flatMap((g) => g.fields.map((f) => f.label));
    expect(labels).toEqual(
      expect.arrayContaining([
        "Extiende",
        "Fuente del texto",
        "Partículas (ms)",
        "accent",
        "Selección",
        "Guías",
      ]),
    );
  });

  it("writes the labels of new notes and groups in Spanish, and new shapes empty", () => {
    const canvas = open(SHEET, "checkout");
    expect(canvas.apply({ kind: "create", elementKind: "node", at: { x: 200, y: 300 } })).toContain(
      '  node1[""]\n',
    );
    expect(canvas.apply({ kind: "create", elementKind: "note", at: { x: 500, y: 300 } })).toContain(
      'note note1 "Nota"',
    );
    expect(canvas.apply({ kind: "group", ids: ["api", "db"] })).toContain('group group1 "Grupo" {');
  });

  it("says what the session did and why it refuses, in Spanish", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "copy", ids: ["api"] });
    expect(canvas.status()).toBe("Copiado.");
    canvas.act({ kind: "setField", ids: ["api"], field: "x", value: "abc" });
    expect(canvas.rejected()).toBe("Escribe un número.");
    canvas.apply({ kind: "setField", ids: ["db->api#1"], field: "style.stroke", value: "accent" });
    expect(canvas.status()).toBe("Se nombró `db_api`.");
    const empty = open('language "0.2"\n', "none");
    expect(empty.empty()).toMatch(/^No hay ningún diagrama que dibujar: agrega `diagram <id>/);
  });

  it("names the fields of sequence diagrams and writes their starter texts in Spanish", () => {
    const canvas = open(payment, "payment");
    const api = { x: 300, y: 40 };
    expect(canvas.apply({ kind: "create", elementKind: "participant", at: api })).toContain(
      'participant participant1 "Participante"',
    );
    expect(canvas.apply({ kind: "insertEvent", eventKind: "note", ids: ["pay"] })).toContain(
      'note note1 over customer, api "Nota"',
    );
    const note = canvas.inspector();
    expect(note.title).toBe("nota note1");
    expect(["text", "position", "participants"].map((n) => field(note, n).label)).toEqual([
      "Texto",
      "Posición",
      "Sobre",
    ]);
    expect(canvas.apply({ kind: "insertEvent", eventKind: "divider", ids: [] })).toContain(
      'divider "Separador"',
    );
    expect(canvas.apply({ kind: "wrap", ids: ["declined"], operator: "loop" })).toContain(
      'loop loop1 "Condición" {',
    );
    canvas.send({ type: "select", ids: ["result"] });
    const fragment = canvas.inspector();
    expect(fragment.title).toBe("alt result");
    expect([field(fragment, "condition.0").label, field(fragment, "condition.1").label]).toEqual([
      "Condición",
      "Condición (else 1)",
    ]);
    canvas.send({ type: "select", ids: ["pay"] });
    expect(canvas.inspector().title).toBe("mensaje pay");
    expect(field(canvas.inspector(), "message").label).toBe("Mensaje");
    canvas.act({ kind: "resize", id: "api", box: { x: 0, y: 0, width: 10, height: 10 } });
    expect(canvas.rejected()).toBe(
      "Los participantes de una secuencia toman el tamaño de su etiqueta.",
    );
  });

  it("names C4 entities in Spanish but draws the type lines in the content language", () => {
    const context = open(commerce, "context");
    context.send({ type: "select", ids: ["bank"] });
    const bank = context.inspector();
    expect(bank.title).toBe("sistema bank");
    expect(field(bank, "id").label).toBe("Entidad");
    expect(field(bank, "kind").value).toBe("sistema de software externo");
    expect(field(bank, "entity.external").label).toBe("Externo");
    const containers = open(commerce, "containers");
    containers.send({ type: "select", ids: ["shop"] });
    expect(containers.inspector().title).toBe("límite shop");
    // Outside a project the drawing is in English, whatever the interface says.
    const view = analyzeDocument({ text: commerce }).diagrams.find((d) => d.id === "containers")!;
    expect(JSON.stringify(view.layout)).toContain("[Container: React]");
    expect(JSON.stringify(view.layout)).not.toContain("[Contenedor:");
  });

  it("describes the keys in Spanish", () => {
    expect(KEY_BINDINGS.find((b) => b.command === "selectAll")!.description).toBe(
      "Seleccionar todos los elementos",
    );
    expect(KEY_BINDINGS.find((b) => b.command === "zoomFit")!.description).toBe(
      "Ajustar el diagrama a la vista",
    );
    expect(KEY_BINDINGS.find((b) => b.command === "openShapes")!.description).toBe(
      "Abrir las formas: escribe un nombre y Enter la crea",
    );
    expect(keyMessages().selectBelow).toBe(
      "Seleccionar la forma que está debajo de la seleccionada",
    );
  });

  it("names the shape, the corner radius and the group around an element in Spanish", () => {
    const canvas = open(
      SHEET.replace("  node db\n", '  group g "G" {\n    node db\n  }\n'),
      "checkout",
    );
    canvas.send({ type: "select", ids: ["db"] });
    const node = canvas.inspector();
    expect(field(node, "style.shape").label).toBe("Forma");
    expect(field(node, "style.radius").label).toBe("Radio de las esquinas");
    expect(field(node, "inside")).toMatchObject({
      label: "Dentro de",
      value: "g",
      button: { label: "Convertir en contenedor" },
    });
    canvas.send({ type: "select", ids: ["api"] });
    expect(field(canvas.inspector(), "inside")).toMatchObject({
      value: null,
      placeholder: "ninguno",
    });
    canvas.act({ kind: "setField", ids: ["api"], field: "style.radius", value: 90 });
    expect(canvas.rejected()).toBe("Escribe un número de 0 a 64.");
  });

  it("says why sequence diagrams and C4 views refuse groups, shapes and two-way arrows", () => {
    const sequence = open(payment, "payment");
    sequence.act({
      kind: "create",
      elementKind: "participant",
      at: { x: 300, y: 40 },
      shape: "star",
    });
    expect(sequence.rejected()).toBe(
      "Los participantes de una secuencia dibujan su propia forma; las formas son para las cajas libres y los nodos de flujo.",
    );
    const context = open(commerce, "context");
    context.act({ kind: "connect", from: "customer", to: "shop", line: "solid", twoWay: true });
    expect(context.rejected()).toBe(
      "Las relaciones de las vistas C4 van en un solo sentido: `->`.",
    );
  });
});

describe("exports from a Spanish interface", () => {
  const root = mkdtempSync(join(tmpdir(), "mdg-editor-messages-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "diagrams"));
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ name: "p", language: "0.2", sources: ["diagrams"] }),
  );
  writeFileSync(join(root, "diagrams", "commerce.meltemi"), commerce);
  writeFileSync(
    join(root, "diagrams", "broken.meltemi"),
    'language "0.2"\n\ndiagram broken: flow {\n  a -> \n}\n',
  );
  writeFileSync(
    join(root, "diagrams", "profiles.meltemi"),
    'language "0.2"\n\ndiagram tiny: flow {\n  a -> b\n}\n\nexport bad for tiny {\n  format bmp\n}\n',
  );
  const project = (name: string) => join(root, "diagrams", name).split(sep).join("/");
  const path = project("commerce.meltemi");

  beforeEach(() => setLocale("es"));
  afterEach(() => setLocale("en"));

  /** The export context of a file of the project. */
  function contextOf(file: string): ExportContext {
    const projects = new ProjectSessions({ toolVersion: "1.0.0" });
    const workspace = projects.forFile(file);
    return {
      file: workspace.file(file)!,
      workspace,
      projects,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set(),
    };
  }

  function exportOf(format: ExportRequest["format"], options: Partial<ExportRequest> = {}) {
    const context = contextOf(path);
    const owner = context.file;
    const diagram = owner.compilation.document.diagrams.find((d) => d.id === "containers")!;
    const request: ExportRequest = {
      target: { kind: "diagram", diagram, owner },
      format,
      theme: null,
      fonts: "system",
      motion: "static",
      at: null,
      scenario: undefined,
      scale: 1,
      size: null,
      background: null,
      link: null,
      embed: false,
      autoplay: false,
      loop: false,
      fps: null,
      durationMs: null,
      out: null,
      ...options,
    };
    return produceExport(context, request);
  }

  it("says what an export chose, and why one cannot be made, in Spanish", () => {
    const png = exportOf("png", { scale: 100 });
    expect("job" in png && png.notices?.[0]).toMatch(
      /^Hecho a \d+ × \d+ píxeles, lo más grande que cabe en el límite de 16384 por lado\.$/,
    );
    const video = exportOf("mp4", { out: "out.mp4", background: "transparent" });
    expect("video" in video && video.notices).toEqual([
      "`containers` no tiene efectos que se muevan: el video dura 1 s.",
      "MP4 no admite transparencia: se usó el fondo del tema.",
    ]);
    const context = contextOf(project("profiles.meltemi"));
    const profile = context.file.compilation.document.exports.find((p) => p.id === "bad")!;
    expect(profileRequest(context, profile, "profiles", (name) => name)).toBe(
      "el perfil tiene problemas; corrígelos primero.",
    );
  });

  it("writes the drawings and pages in the content language, not the interface's", () => {
    const svg = exportOf("svg");
    expect("text" in svg && svg.text).toContain("[Container: React]");
    expect("text" in svg && svg.text).not.toContain("[Contenedor:");
    const spanish = exportOf("svg", { locale: "es" });
    expect("text" in spanish && spanish.text).toContain("[Contenedor: React]");
    const page = exportOf("html");
    expect("text" in page && page.text).toContain('<html lang="en">');
  });

  it("reports what the catalog leaves out in Spanish, with the page in the content language", () => {
    const projects = new ProjectSessions({ toolVersion: "1.0.0" });
    const build = buildCatalog(projects.forFile(path), projects, {
      generator: "Meltemi Diagrams 1.0.0",
      script: () => "",
    });
    expect(build.skipped.map((s) => [s.id, s.reason])).toEqual([["broken", "tiene errores"]]);
    expect(build.html).toContain('<html lang="en">');
  });
});
