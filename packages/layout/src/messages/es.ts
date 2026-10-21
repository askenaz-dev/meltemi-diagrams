import { decimal, list } from "@meltemi/diagrams-i18n";
import type { AlignEdge } from "@meltemi/diagrams-model";
import type { en } from "./en.js";

const code = (value: string) => `\`${value}\``;
const ids = (values: readonly string[]) => list("es", values.map(code));
/** A number in prose, with the decimal comma. */
const n = (value: number) => decimal("es", value, 6);
/** "de `api`", or "del marco" for the frame. */
const of = (owner: string | null) => (owner === null ? "del marco" : `de ${code(owner)}`);

/** The edges constraints align, with their article. */
const EDGES: Readonly<Record<AlignEdge, string>> = {
  top: "el borde superior",
  middle: "el centro vertical",
  bottom: "el borde inferior",
  left: "el borde izquierdo",
  center: "el centro horizontal",
  right: "el borde derecho",
};

/** The layout's words in Spanish. */
export const es: typeof en = {
  drawing: {
    c4: {
      person: "Persona",
      system: "Sistema de software",
      container: "Contenedor",
      component: "Componente",
      externalPerson: "Persona externa",
      externalSystem: "Sistema de software externo",
      externalContainer: "Contenedor externo",
      externalComponent: "Componente externo",
    },
  },
  diagnostics: {
    overlap: (a, b) => `${code(a)} y ${code(b)} se superponen.`,
    crossesGroup: (shape, group) => `${code(shape)} cruza el borde de su grupo ${code(group)}.`,
    overlapsGroup: (shape, group) =>
      `${code(shape)} se superpone al grupo ${code(group)}, que no lo declara.`,
    containerMargin: (shape, group) =>
      `${code(shape)} está demasiado cerca del borde o de la banda del título de su grupo ${code(group)}.`,
    labelUnderConnector: (label, connector) =>
      `La etiqueta de ${code(label)} queda sobre el conector de ${code(connector)}.`,
    connectorOverlap: (a, b, length) =>
      `Los conectores de ${code(a)} y ${code(b)} se superponen a lo largo de ${n(length)} px.`,
    connectorCrossing: (relation, box) =>
      `El conector de ${code(relation)} atraviesa ${code(box)}.`,
    labelCut: (text, owner, overflow, by) =>
      `El texto "${text}" ${of(owner)} sobresale ${n(overflow)} px ${
        by === "picture" ? "del dibujo" : by === "background" ? "de su etiqueta" : "de su forma"
      }.`,
    labelOverlap: (text, owner, other) =>
      `El texto "${text}" ${of(owner)} se superpone ${
        other.kind === "text"
          ? `al texto "${other.text}" ${of(other.owner)}`
          : other.kind === "box"
            ? `a la caja de ${code(other.owner)}`
            : `al conector de ${code(other.owner)}`
      }.`,
    unknownTheme: (written, fallback) =>
      `Tema desconocido "${written}"; se dibuja con ${fallback}.`,
    groupWithoutPlace: (group) =>
      `El grupo ${code(group)} no tiene una instrucción \`place\`; en los diagramas libres, las posiciones de sus hijos son relativas a su interior.`,
    elementWithoutPlace: (element) =>
      `${code(element)} no tiene una instrucción \`place\`; \`layout manual\` necesita una posición para cada elemento.`,
    groupHalfPlaced: (group, written) =>
      `El grupo ${code(group)} tiene ${written === "place" ? "un `place` pero no un `size`" : "un `size` pero no un `place`"}; da los dos, o ninguno para que se ajuste a sus hijos.`,
    groupUnplaced: (group) =>
      `El grupo ${code(group)} no tiene hijos colocados ni un \`place\`/\`size\` propio.`,
    modeUnsupported: (mode, elements) =>
      `\`layout ${mode}\` necesita un motor de disposición para colocar ${ids(elements)}.`,
    placementIgnored:
      "`layout auto` organiza todos los elementos, así que se ignoran las instrucciones `place` y los puntos de paso de las rutas.",
    imageUnavailable: (source, element) =>
      `La imagen "${source}" de ${code(element)} no se puede dibujar; en su lugar se dibuja un marcador de posición.`,
    iconMissing: (element) =>
      `${code(element)} se dibuja como su icono, pero no tiene \`icon\`; en su lugar se dibuja un marcador de posición.`,
    labelPositionIgnored: (element) =>
      `El \`labelPosition\` de ${code(element)} no tiene efecto: su icono no ocupa el centro.`,
    labelPositionIgnoredByTheme: (element) =>
      `El \`labelPosition\` que el tema da a ${code(element)} y a los elementos con su mismo estilo no tiene efecto: en ninguno el icono ocupa el centro.`,
    iconTooSmall: (element, width, height, needsWidth, needsHeight) =>
      `${code(element)} mide ${n(width)} × ${n(height)} px, demasiado pequeño para dibujar su icono: necesita ${n(needsWidth)} × ${n(needsHeight)} px.`,
    engineFailed: (engine, reason) => `Falló el motor de disposición ${engine}: ${reason}`,
    alignConflict: (kind, elements, edge, worst, off, first) =>
      `${code(kind)} no se puede cumplir para ${ids(elements)}: ${EDGES[edge]} de ${code(worst)} está desplazado ${n(off)} px respecto de ${code(first)}.`,
    orderConflict: (elements, current, axis, previous) =>
      `\`order\` no se puede cumplir para ${ids(elements)}: ${code(current)} no está ${axis === "x" ? "a la derecha de" : "debajo de"} ${code(previous)}.`,
    distanceConflict: (a, b, gap, distance) =>
      `\`distance\` no se puede cumplir: ${code(a)} y ${code(b)} están a ${n(gap)} px, menos de ${n(distance)} px.`,
    unmeasuredFont: (fonts, characters) => {
      const parts: string[] = [];
      if (fonts.length > 0) {
        parts.push(
          fonts.length === 1
            ? `la fuente ${ids(fonts)} no está incluida`
            : `las fuentes ${ids(fonts)} no están incluidas`,
        );
      }
      if (characters.length > 0) {
        const covered = characters.length === 1 ? "está cubierto" : "están cubiertos";
        parts.push(`${characters.join(" ")} no ${covered} por las fuentes incluidas`);
      }
      return `Parte del texto se mide con estimaciones: ${parts.join("; ")}.`;
    },
    tooWideForDocument: (width, max) =>
      `El contenido mide ${n(width)} px de ancho; \`preset document\` se lee mejor hasta ${n(max)} px.`,
    tooLargeForSlide: (width, height, slideWidth, slideHeight) =>
      `El contenido mide ${n(width)} × ${n(height)} px; una diapositiva mide ${n(slideWidth)} × ${n(slideHeight)} px.`,
    tooLargeForCanvas: (width, height, canvasWidth, canvasHeight) =>
      `El contenido mide ${n(width)} × ${n(height)} px; el lienzo mide ${n(canvasWidth)} × ${n(canvasHeight)} px.`,
    textOverflow: (element, width, withIcon, text, needs) =>
      `${code(element)} mide ${n(width)} px de ancho, pero ${withIcon ? `su icono y su texto "${text}" necesitan` : `su texto "${text}" necesita`} ${n(needs)} px.`,
    textOverflowTall: (element, width, height, withIcon, text, needsWidth, needsHeight) =>
      `${code(element)} mide ${needsWidth === width ? `${n(height)} px de alto` : `${n(width)} × ${n(height)} px`}, pero ${withIcon ? `su icono y su texto "${text}" necesitan` : `su texto "${text}" necesita`} ${needsWidth === width ? n(needsHeight) : `${n(needsWidth)} × ${n(needsHeight)}`} px.`,
  },
  hints: {
    labelCutByPicture:
      "Dale espacio al diagrama: un `canvas` más grande, o mueve el elemento hacia dentro.",
    labelCut: "Acorta el texto o dale al elemento un `size` en el que quepa.",
    labelOnConnector:
      "Mueve uno de los dos, dale una `route` al conector o coloca la etiqueta con `label <relation> at <n>%`.",
    labelOverlap: "Separa uno de los dos o coloca la etiqueta con `label <relation> at <n>%`.",
    themes: (builtIn, inScope) =>
      `Temas integrados: ${builtIn.join(", ")}${inScope.length > 0 ? `; temas disponibles: ${inScope.join(", ")}` : ""}.`,
    addPlace: (id) => `Agrega \`place ${id} at (x, y)\` a un bloque \`placement\`.`,
    addPlaceAndSize: (id) => `Agrega \`place ${id} at (x, y)\` y \`size ${id} (w, h)\`.`,
    engine:
      "Las aplicaciones anfitrionas pasan un motor en `LayoutOptions.engine`; la línea de comandos usa ELK. O coloca cada elemento.",
    assisted: "Usa `layout assisted` para mantener los elementos colocados donde están.",
    imageFile:
      "Comprueba que el archivo existe en el proyecto y es una imagen PNG, JPEG, GIF, WebP o SVG.",
    imageHost:
      "Las aplicaciones anfitrionas pasan `LayoutOptions.images`; la línea de comandos y el editor leen las imágenes del proyecto.",
    iconMissing: (element) =>
      `Dale un icono a ${code(element)} con \`style ${element} { icon "<pack>:<name>" }\`, o elige otra forma.`,
    labelPositionIgnored:
      "Pon `iconPosition center` o `shape icon` para llevar la etiqueta a un borde, o quita `labelPosition`.",
    labelPositionNeverUsed:
      "Quita `labelPosition`: solo coloca la etiqueta de un nodo, una decisión, un almacén de datos o una caja cuyo icono ocupa el centro.",
    labelPositionIgnoredByTheme:
      "Pon `iconPosition center` o `shape icon` en los elementos, o quita `labelPosition` del tema.",
    iconTooSmall: (element, width, height) =>
      `Usa \`size ${element} (${width}, ${height})\` o quita su \`size\` para dibujar el icono a su \`iconSize\`.`,
    constraint: "Los elementos colocados nunca se mueven; cambia un `place` o la restricción.",
    bundledFonts:
      "Fuentes incluidas: Inter, IBM Plex Sans y Cascadia Mono. Deja espacio de más con `size` si hace falta.",
    tooLarge:
      "Divide el diagrama en vistas o en escenas de una historia; el texto nunca se reduce para que quepa en el lienzo.",
    textOverflow: (element, width, height) =>
      `Usa \`size ${element} (${width}, ${height})\` o acorta el texto.`,
    stackOrder: (outer, inner) =>
      `Declara ${code(outer)} antes de ${code(inner)} para dibujar una pila.`,
  },
};
