import { ARROW_KINDS, SHAPES, SHAPE_SIZES } from "@meltemi/diagrams-editor/canvas";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { glyphName, pictureBox } from "../src/glyphs.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages } from "../src/messages/index.js";
import { formatTime } from "../src/story.js";

afterEach(() => setLocale("en"));

/** The values the inspector draws as pictures: line styles, route kinds, corners and heads. */
const GLYPH_VALUES = [
  ...["solid", "dashed", "dotted"],
  ...["auto", "orthogonal", "polyline", "bezier"],
  ...["sharp", "rounded"],
  ...["triangle", "open", "none", "triangleOutline", "diamond", "diamondOutline", "circle"],
  ...["circleOutline", "bar", "cross", "many", "oneOrMany", "onlyOne", "zeroOrOne", "zeroOrMany"],
];

describe("the canvas catalog", () => {
  it("has every English entry in Spanish", () => {
    // Words that are rightly the same in both languages.
    expect(
      untranslated(en, es, [
        "Zoom",
        "Actor",
        "Control",
        "Id",
        "inspector.options.no",
        "inspector.milliseconds",
      ]),
    ).toEqual([]);
  });

  it("follows the interface language the host sets", () => {
    expect(messages().palette.tools.node).toBe("Node");
    setLocale("es");
    expect(messages().palette.tools.node).toBe("Nodo");
    expect(messages().toolbar.zoomIn).toBe("Acercar");
    expect(messages("en").toolbar.zoomIn).toBe("Zoom in");
  });

  it("keeps the English sentences as they were", () => {
    expect(en.stage.outOfDate(1, "Unknown word", 3)).toBe(
      "Out of date · 1 problem: Unknown word (line 3)",
    );
    expect(en.stage.outOfDate(2, "Unknown word", 3)).toBe(
      "Out of date · 2 problems: Unknown word (line 3)",
    );
    expect(en.announcements.movedBy(["api"], 14, 0)).toBe("Moved api by 14, 0.");
    expect(en.announcements.movedBy(["api", "db"], 0, -1)).toBe("Moved 2 elements by 0, -1.");
    expect(en.announcements.selectedElement("node", "api", "API")).toBe("node api, API, selected.");
    // An empty shape is said by its kind and id alone.
    expect(en.announcements.selectedElement("box", "box1", "")).toBe("box box1 selected.");
    expect(en.announcements.reordered(["api", "db"], "back")).toBe("Moved the selection back.");
    expect(en.toolbar.percent(1.25)).toBe("125%");
    expect(formatTime(1234)).toBe("1.234 s");
  });

  it("counts, agrees and lists in Spanish", () => {
    expect(es.stage.outOfDate(1, "Palabra desconocida", 3)).toBe(
      "Desactualizado · 1 problema: Palabra desconocida (línea 3)",
    );
    expect(es.stage.outOfDate(0, "Palabra desconocida", 3)).toBe(
      "Desactualizado · 0 problemas: Palabra desconocida (línea 3)",
    );
    expect(es.announcements.selected(1)).toBe("1 seleccionado.");
    expect(es.announcements.selected(3)).toBe("3 seleccionados.");
    expect(es.announcements.selectedElement("node", "api", "API")).toBe(
      "Nodo api, API, seleccionado.",
    );
    expect(es.announcements.selectedElement("note", "n1", "Ojo")).toBe(
      "Nota n1, Ojo, seleccionada.",
    );
    expect(es.announcements.selectedElement("box", "box1", "")).toBe("Caja box1 seleccionada.");
    expect(es.announcements.selectedRelation("api", "db", false)).toBe(
      "Relación de api a db seleccionada.",
    );
    expect(es.announcements.created("decision")).toBe("Se creó una decisión.");
    expect(es.announcements.place("image")).toBe(
      "Haz clic en el lienzo para colocar la imagen. Esc cancela.",
    );
    expect(es.announcements.noLabel("icon")).toBe(
      "Un icono no tiene etiqueta; cámbialo en las propiedades.",
    );
    expect(es.announcements.noLabel("image")).toBe(
      "Una imagen no tiene etiqueta; cámbiala en las propiedades.",
    );
    expect(es.announcements.selectedOnFrame(["client", "api", "db"])).toBe(
      "Selección: client, api y db.",
    );
    expect(es.announcements.reordered(["api"], "front")).toBe("Se movió api al frente.");
    expect(es.story.selectFirst("reveal")).toBe("Primero selecciona en el lienzo qué revelar.");
    // A kind of a declared type keeps its name.
    expect(es.announcements.created("view")).toBe("Se creó un view.");
  });

  it("writes times and zooms as Spanish does", () => {
    setLocale("es");
    expect(formatTime(1200)).toBe("1,2 s");
    expect(formatTime(800)).toBe("800 ms");
    expect(formatTime(0)).toBe("0 s");
    // Spanish writes a no-break space before the percent sign.
    expect(es.toolbar.percent(1)).toBe(`100${String.fromCharCode(0xa0)}%`);
    setLocale("en");
    expect(formatTime(1200)).toBe("1.2 s");
  });

  it("names every picture in both languages, and other values as written", () => {
    for (const value of GLYPH_VALUES) {
      expect(Object.hasOwn(en.glyphs, value), value).toBe(true);
    }
    expect(glyphName("polyline")).toBe("straight");
    expect(glyphName("dashed")).toBe("dashed");
    expect(glyphName("wavy")).toBe("wavy");
    expect(glyphName("constructor")).toBe("constructor");
    setLocale("es");
    expect(GLYPH_VALUES.map((value) => glyphName(value))).toEqual([
      ...["continua", "discontinua", "punteada"],
      ...["automática", "en codo", "recta", "curva"],
      ...["en ángulo", "redondeadas"],
      ...["triángulo", "abierta", "ninguna", "triángulo hueco", "rombo", "rombo hueco", "círculo"],
      ...["círculo hueco", "barra", "cruz", "muchos", "uno o muchos", "solo uno", "cero o uno"],
      "cero o muchos",
    ]);
    expect(glyphName("wavy")).toBe("wavy");
  });

  it("names the twenty-four shapes in both languages, as shapes and not as corners or heads", () => {
    expect(Object.keys(en.shapes)).toEqual([...SHAPES]);
    expect(Object.keys(es.shapes)).toEqual([...SHAPES]);
    // In English the name is the value, which the grid also searches.
    expect(SHAPES.map((shape) => glyphName(shape, "shape"))).toEqual([...SHAPES]);
    setLocale("es");
    expect(SHAPES.map((shape) => glyphName(shape, "shape"))).toEqual([
      ...["redondeada", "rectángulo", "cuadrado", "elipse", "círculo", "rombo", "cilindro"],
      ...["píldora", "triángulo", "paralelogramo", "trapecio", "pentágono", "hexágono"],
      ...["octágono", "estrella", "nube", "documento", "bocadillo", "flecha", "con marco"],
      ...["bandera", "persona", "agente", "icono"],
    ]);
    // The same value is a corner, a head or a shape by its family.
    expect(glyphName("rounded")).toBe("redondeadas");
    expect(glyphName("rounded", "corners")).toBe("redondeadas");
    expect(glyphName("rounded", "shape")).toBe("redondeada");
    expect(glyphName("diamond", "shape")).toBe("rombo");
    expect(glyphName("diamond", "arrowEnd")).toBe("rombo");
    expect(glyphName("diamondOutline", "arrowEnd")).toBe("rombo hueco");
    expect(glyphName("triangle", "shape")).toBe("triángulo");
    expect(glyphName("blob", "shape")).toBe("blob");
  });

  it("names the kinds of arrow in both languages", () => {
    expect(Object.keys(en.arrowKinds)).toEqual([...ARROW_KINDS]);
    expect(ARROW_KINDS.map((kind) => glyphName(kind, "arrow"))).toEqual([
      "arrow",
      "dashed arrow",
      "line",
      "dashed line",
      "two-way arrow",
      "dashed two-way arrow",
    ]);
    setLocale("es");
    expect(ARROW_KINDS.map((kind) => glyphName(kind, "arrow"))).toEqual([
      "flecha",
      "flecha discontinua",
      "línea",
      "línea discontinua",
      "flecha doble",
      "flecha doble discontinua",
    ]);
  });

  it("says what a shape and a kind of arrow do, in English", () => {
    expect(en.announcements.createdShape("box", "hexagon")).toBe("Created a hexagon box.");
    expect(en.announcements.createdShape("node", "ellipse")).toBe("Created an ellipse node.");
    expect(en.announcements.createdShape("box", "agent")).toBe("Created an agent box.");
    expect(en.announcements.placeShape("box", "star")).toBe(
      "Click on the canvas to place the star box. Escape cancels.",
    );
    expect(en.announcements.arrowKind("-->")).toBe("Dashed arrow (-->).");
    expect(en.announcements.arrowKind("<->")).toBe("Two-way arrow (<->).");
    expect(en.announcements.connected("api", "db", true, "both")).toBe(
      "Connected api to db, both ways, dashed.",
    );
    expect(en.announcements.arrowKind("--")).toBe("Line (--).");
    expect(en.announcements.arrowKind("---")).toBe("Dashed line (---).");
    expect(en.announcements.connected("api", "db", true, "none")).toBe(
      "Connected api to db with a line, dashed.",
    );
    expect(en.announcements.connected("api", "db", false)).toBe("Connected api to db.");
    expect(en.palette.shaped("Box", "hexagon", "B")).toBe(
      "Box, hexagon: click on the canvas, or press B",
    );
    expect(en.shapeGrid.none("blob")).toBe("No shape is called “blob”.");
    expect(en.inspector.slider("Corner radius")).toBe("Corner radius, slider");
  });

  it("agrees the shapes with the kind in Spanish", () => {
    expect(es.announcements.createdShape("box", "hexagon")).toBe(
      "Se creó una caja con forma de hexágono.",
    );
    expect(es.announcements.createdShape("node", "star")).toBe(
      "Se creó un nodo con forma de estrella.",
    );
    expect(es.announcements.createdShape("node", "framed")).toBe("Se creó un nodo con marco.");
    expect(es.announcements.createdShape("node", "agent")).toBe(
      "Se creó un nodo con forma de agente.",
    );
    expect(es.announcements.createdShape("box", "rounded")).toBe("Se creó una caja redondeada.");
    expect(es.announcements.createdShape("node", "rounded")).toBe("Se creó un nodo redondeado.");
    expect(es.announcements.placeShape("box", "cloud")).toBe(
      "Haz clic en el lienzo para colocar la caja con forma de nube. Esc cancela.",
    );
    expect(es.announcements.arrowKind("-->")).toBe("Flecha discontinua (-->).");
    expect(es.announcements.arrowKind("<-->")).toBe("Flecha doble discontinua (<-->).");
    expect(es.announcements.connected("api", "db", false, "both")).toBe(
      "Se conectó api con db en ambos sentidos.",
    );
    expect(es.announcements.arrowKind("---")).toBe("Línea discontinua (---).");
    expect(es.announcements.connected("api", "db", false, "none")).toBe(
      "Se conectó api con db con una línea.",
    );
    expect(es.palette.shaped("Caja", "diamond", "B")).toBe(
      "Caja, rombo: haz clic en el lienzo o presiona B",
    );
    expect(es.shapeGrid.typed("est")).toBe("Buscar: est");
    expect(es.shapeGrid.none("x")).toBe("Ninguna forma se llama «x».");
    expect(es.inspector.slider("Radio de las esquinas")).toBe(
      "Radio de las esquinas, control deslizante",
    );
  });

  it("names the kinds of diagram it creates, the menus of the split buttons and the Canvas choices", () => {
    expect(en.diagrams).toEqual({
      flow: "Flow diagram",
      free: "Free composition",
      sequence: "Sequence diagram",
    });
    expect(es.diagrams).toEqual({
      flow: "Diagrama de flujo",
      free: "Composición libre",
      sequence: "Diagrama de secuencia",
    });
    expect(en.announcements.createdDiagram("free")).toBe("Created a free composition.");
    expect(es.announcements.createdDiagram("flow")).toBe("Se creó un diagrama de flujo.");
    expect(es.announcements.createdDiagram("free")).toBe("Se creó una composición libre.");
    expect([en.toolbar.newDiagram, es.toolbar.newDiagram]).toEqual([
      "New diagram",
      "Nuevo diagrama",
    ]);
    expect([en.toolbar.shapeMenu, es.toolbar.shapeMenu]).toEqual([
      "More shapes (F)",
      "Más formas (F)",
    ]);
    expect([en.toolbar.arrowMenu, es.toolbar.arrowMenu]).toEqual([
      "Kinds of arrow (R cycles)",
      "Tipos de flecha (R cambia)",
    ]);
    expect([en.inspector.options.fit, es.inspector.options.fit]).toEqual([
      "fit to content",
      "ajustar al contenido",
    ]);
    expect([en.inspector.options.custom, es.inspector.options.custom]).toEqual([
      "custom",
      "personalizado",
    ]);
  });

  it("says where a drop puts the selection and what Alt+click selects, in both languages", () => {
    expect(en.announcements.movedInto(["c"], "g")).toBe("Moved c into g.");
    expect(en.announcements.movedInto(["c", "d"], null)).toBe("Moved 2 elements to the top level.");
    expect(en.announcements.selectedBelow("box", "middle", "Middle", 2, 3)).toBe(
      "box middle, Middle, selected: 2 of 3 under the pointer.",
    );
    expect(en.menu.selectBelow).toBe("Select the shape below");
    expect(en.keys.altClick).toBe("Alt+click");
    expect(es.announcements.movedInto(["c"], "g")).toBe("Se movió c dentro de g.");
    expect(es.announcements.movedInto(["c", "d"], null)).toBe(
      "Se movieron 2 elementos al nivel superior.",
    );
    expect(es.announcements.selectedBelow("box", "middle", "Medio", 2, 3)).toBe(
      "Caja middle, Medio, seleccionada: 2 de 3 bajo el puntero.",
    );
    expect(es.announcements.selectedBelow("group", "g", "Backend", 3, 3)).toBe(
      "Grupo g, Backend, seleccionado: 3 de 3 bajo el puntero.",
    );
    expect(es.announcements.selectedBelow("node", "node1", "", 1, 2)).toBe(
      "Nodo node1 seleccionado: 1 de 2 bajo el puntero.",
    );
    expect(en.announcements.selectedBelow("node", "node1", "", 1, 2)).toBe(
      "node node1 selected: 1 of 2 under the pointer.",
    );
    expect(es.menu.selectBelow).toBe("Seleccionar la forma de debajo");
    expect(es.keys.altClick).toBe("Alt+clic");
  });
});

describe("the words of icons", () => {
  const POSITIONS = ["left", "right", "top", "bottom", "center"];

  it("names the places of an icon and of its label in both languages", () => {
    expect(POSITIONS.map((p) => glyphName(p, "iconPosition"))).toEqual([
      "left",
      "right",
      "top",
      "bottom",
      "centre",
    ]);
    expect(glyphName("top", "labelPosition")).toBe("top");
    // The same value is a place, a head or a shape by its family.
    expect(glyphName("center")).toBe("center");
    setLocale("es");
    expect(POSITIONS.map((p) => glyphName(p, "iconPosition"))).toEqual([
      "izquierda",
      "derecha",
      "arriba",
      "abajo",
      "centro",
    ]);
    expect(glyphName("bottom", "labelPosition")).toBe("abajo");
  });

  it("names the placement control and the picker in both languages", () => {
    expect([en.placement.label, en.placement.icon, en.placement.box, en.placement.only]).toEqual([
      "Insert as",
      "Icon",
      "In a box",
      "Only the icon",
    ]);
    expect([es.placement.label, es.placement.icon, es.placement.box, es.placement.only]).toEqual([
      "Insertar como",
      "Icono",
      "En una caja",
      "Solo el icono",
    ]);
    expect([en.iconPicker.label, es.iconPicker.label]).toEqual(["Icons", "Iconos"]);
    expect(en.iconPicker.forTargets(["api"])).toBe("Icon of api");
    expect(en.iconPicker.forTargets(["api", "db"])).toBe("Icon of 2 elements");
    expect(es.iconPicker.forTargets(["api", "db"])).toBe("Icono de 2 elementos");
    expect(en.iconPicker.none("blob")).toBe("No icon matches “blob”.");
    expect(es.iconPicker.none("blob")).toBe("Ningún icono coincide con «blob».");
    expect(en.iconPicker.itemTitle("server", "tabler:server")).toBe("server · tabler:server");
    expect(en.iconPicker.itemTitle("tabler:x", "tabler:x")).toBe("tabler:x");
    expect([en.menu.icon, en.menu.removeIcon, es.menu.icon, es.menu.removeIcon]).toEqual([
      "Icon…",
      "Remove icon",
      "Icono…",
      "Quitar el icono",
    ]);
    expect([en.toolbar.libraries, es.toolbar.libraries]).toEqual(["Libraries", "Bibliotecas"]);
    expect(en.palette.icon("I")).toBe("Icon: find one for the selection or to place, or press I");
  });

  it("says what an icon did, in both languages", () => {
    expect(en.announcements.iconSet("server", ["api", "db"])).toBe(
      "server is the icon of 2 elements.",
    );
    expect(en.announcements.iconSet("AWS Lambda", ["fn"])).toBe("AWS Lambda is the icon of fn.");
    expect(es.announcements.iconSet("AWS Lambda", ["fn"])).toBe("AWS Lambda es el icono de fn.");
    expect(en.announcements.iconsRemoved(["db"])).toBe("Removed the icon of db.");
    expect(es.announcements.iconsRemoved(["a", "b"])).toBe("Se quitó el icono de 2 elementos.");
    expect(en.announcements.placeIcon("server")).toBe(
      "Click on the canvas to place server, or on a shape to give it the icon. Escape cancels.",
    );
    expect(es.announcements.iconAdded("PostgreSQL")).toBe("Se agregó PostgreSQL.");
  });

  it("says where the cards of a list go, and what its + adds, in both languages", () => {
    expect(en.announcements.movedInList(["c"], "todo", 2, 3)).toBe("Moved c to 2 of 3 in todo.");
    expect(en.announcements.movedInList(["c", "d"], "todo", 1, 4)).toBe(
      "Moved 2 elements to 1 of 4 in todo.",
    );
    expect(en.announcements.movedPast("b", "a", "todo", true)).toBe("Moved b before a in todo.");
    expect(en.announcements.listEnd("b", "todo", false)).toBe("b is already last in todo.");
    expect(en.announcements.createdList("row")).toBe("Created a row.");
    expect(en.lists.addSticky("todo")).toBe("Add a sticky note to todo");
    expect(es.announcements.movedInList(["c"], "todo", 2, 3)).toBe(
      "Se movió c a la posición 2 de 3 en todo.",
    );
    expect(es.announcements.movedPast("b", "a", "todo", false)).toBe(
      "Se movió b después de a en todo.",
    );
    expect(es.announcements.listEnd("b", "todo", true)).toBe("b ya está al principio de todo.");
    expect(es.announcements.createdList("column")).toBe("Se creó una columna.");
    expect(es.lists.addColumn("board")).toBe("Añadir una columna a board");
    expect(es.toolbar.groupKinds).toEqual({
      group: "Grupo",
      container: "Contenedor",
      column: "Columna",
      row: "Fila",
    });
  });
});

describe("the pictures of the shapes", () => {
  const glyph = { width: 32, height: 16 };

  it("keeps the default proportions: square shapes look square, wide ones fill the width", () => {
    for (const shape of SHAPES) {
      const box = pictureBox(shape, glyph, 28, 13);
      const size = SHAPE_SIZES[shape];
      expect(box.width / box.height, shape).toBeCloseTo(size.width / size.height, 6);
      expect(box.x, shape).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(box.x + box.width, shape).toBeLessThanOrEqual(30 + 1e-9);
      expect(box.y, shape).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(box.y + box.height, shape).toBeLessThanOrEqual(14.5 + 1e-9);
    }
    expect(pictureBox("square", glyph, 28, 13)).toEqual({ x: 9.5, y: 1.5, width: 13, height: 13 });
    expect(pictureBox("circle", glyph, 28, 13).width).toBe(13);
    const rectangle = pictureBox("rectangle", glyph, 28, 13);
    expect([rectangle.x, rectangle.width]).toEqual([2, 28]);
    expect(rectangle.height).toBeCloseTo(9.8, 9);
    // A value that is not a shape is placed as `rounded`.
    expect(pictureBox("blob", glyph, 28, 13)).toEqual(pictureBox("rounded", glyph, 28, 13));
  });
});
