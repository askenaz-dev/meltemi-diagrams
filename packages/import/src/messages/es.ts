import { list, plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** Mermaid's classic shapes, as the Spanish sentences name them: "La forma de hexágono". */
const SHAPES: Readonly<Record<string, string>> = {
  rect: "rectangular",
  round: "redondeada",
  rhombus: "de rombo",
  cylinder: "de cilindro",
  stadium: "de estadio",
  subroutine: "de subrutina",
  circle: "de círculo",
  doublecircle: "de círculo doble",
  asymmetric: "asimétrica",
  hexagon: "de hexágono",
  lean_right: "inclinada a la derecha",
  lean_left: "inclinada a la izquierda",
  trapezoid: "de trapecio",
  inv_trapezoid: "de trapecio invertido",
};
const shapeName = (shape: string) => SHAPES[shape] ?? `\`${shape}\``;

/** The shapes an approximated Mermaid shape is drawn as: "se dibuja como un paralelogramo". */
const DRAWN: Readonly<Record<string, string>> = {
  circle: "un círculo",
  parallelogram: "un paralelogramo",
  trapezoid: "un trapecio",
};
const drawnAs = (shape: string) => DRAWN[shape] ?? `\`shape ${shape}\``;

/** The kinds of the language, as the subject of a sentence. */
const KINDS = {
  person: "Una persona",
  system: "Un sistema",
  container: "Un contenedor",
  datastore: "Un almacén de datos",
  component: "Un componente",
} as const;

/** PlantUML diagram types the importer leaves out, as "Los diagramas de clases". */
const PLANTUML_KINDS: Readonly<Record<string, string>> = {
  class: "de clases",
  activity: "de actividades",
  state: "de estados",
  object: "de objetos",
  timing: "de tiempos",
  data: "de datos",
};

const code = (ids: readonly string[]) =>
  list(
    "es",
    ids.map((id) => `\`${id}\``),
  );

/** The importers' words in Spanish. */
export const es: typeof en = {
  import: {
    stopped: (reason) => `El importador se detuvo: ${reason}`,
    unknownFormat:
      "El origen no se reconoce como Mermaid, PlantUML ni Markdown con bloques de diagramas.",
    unknownFormatHint:
      "Indica el formato: `--from mermaid`, `--from plantuml` o `--from markdown`.",
    noDiagramBlocks:
      "El archivo Markdown no tiene ningún bloque delimitado `mermaid`, `plantuml` ni `puml`.",
    selfCheck: (line, message) =>
      `La hoja importada tiene un error en su línea ${line}: ${message}`,
    partial: (count) =>
      count === 1
        ? "1 construcción esencial no se importó; la hoja está incompleta."
        : `${count} construcciones esenciales no se importaron; la hoja está incompleta.`,
    renamedId: (source, id) => `\`${source}\` no es un id válido; se escribe como \`${id}\`.`,
  },
  common: {
    cannotRead: (text) => `No se puede leer \`${text}\`.`,
    expected: (syntax) => `Se esperaba \`${syntax}\`.`,
    expectedEither: (first, second) => `Se esperaba \`${first}\` o \`${second}\`.`,
    css: (name) => `La propiedad CSS \`${name}\` no tiene equivalente.`,
    notImported: (word) => `\`${word}\` no se importa.`,
    sprites: "Los sprites no se importan.",
    endWithoutBlock: "`end` sin un bloque abierto.",
    blockNotClosed: "El bloque no se cierra con `end`.",
    noteNotClosed: "La nota no se cierra con `end note`.",
    nestedBoxes: "Las cajas no se pueden anidar.",
    invalidJson: (text) => `\`${text}\` no es un JSON válido.`,
  },
  merge: {
    typeChanged: (id, before, after) =>
      `\`${id}\` era un diagrama \`${before}\` y ahora es \`${after}\`; la nueva importación lo reemplaza.`,
    kept: (name) => `\`${name}\` no está en el origen; se conserva como estaba.`,
    droppedError: (what, message) => `Se descartó ${what}: ${message}`,
    adjustmentDropped: (statement, id) =>
      `Se descartó \`${statement}\` de \`${id}\`: \`${id}\` ya no está en el origen.`,
    dropped: (statement, ids) =>
      `Se descartó \`${statement}\`: ${code(ids)} ya no ${ids.length === 1 ? "está" : "están"} en el origen.`,
    targetsRemoved: (ids, keyword) =>
      `Se ${ids.length === 1 ? "quitó" : "quitaron"} ${code(ids)} de \`${keyword}\`: ya no ${ids.length === 1 ? "está" : "están"} en el origen.`,
  },
  mermaid: {
    config: "La configuración de Mermaid (temas, opciones de disposición) no se importa.",
    frontMatterField: (field) => `El campo \`${field}\` del front matter no se importa.`,
    frontMatterLine: "Esta línea del front matter no se importa.",
    frontMatterNotClosed: "El front matter no se cierra con `---`.",
    init: "Las directivas `%%{init}%%` (temas, configuración) no se importan.",
    noDiagram: "El origen de Mermaid no tiene ningún diagrama.",
    unsupported: (keyword) => `Los diagramas \`${keyword}\` de Mermaid no se importan.`,
    notADiagramType: (word) => `\`${word}\` no es un tipo de diagrama de Mermaid.`,
    supportedHint:
      "Se admiten: `flowchart`, `graph`, `sequenceDiagram`, `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `architecture-beta` y `block-beta`.",
    c4Description: "Las vistas C4 no tienen descripción; `accDescr` no se importa.",
    labelHtml: "El formato HTML de una etiqueta se conserva como texto sin formato.",
    labelMarkdown: "El énfasis de Markdown de una etiqueta se conserva como texto sin formato.",
    labelIcon: "Los iconos de Font Awesome de las etiquetas no se dibujan; el texto se conserva.",
    shape: (shape, drawn) => `La forma ${shapeName(shape)} se dibuja como ${drawnAs(drawn)}.`,
  },
  flowchart: {
    unknownDirection: (direction) => `Dirección desconocida \`${direction}\`.`,
    header: "El encabezado no es `flowchart <direction>`.",
    elk: "`flowchart-elk` se lee como un `flowchart`; Meltemi organiza todos los diagramas de flujo con ELK.",
    click: "Las interacciones (`click`) no se importan.",
    endWithoutSubgraph: "`end` sin un `subgraph` abierto.",
    subgraphDirection:
      "La dirección propia de un subgrafo no se conserva; la dirección del diagrama se aplica a sus hijos.",
    link: (statement) => `No se puede leer el enlace de \`${statement}\`.`,
    linkLabel: (statement) => `La etiqueta del enlace no se cierra en \`${statement}\`.`,
    target: (statement) => `No se puede leer el destino de \`${statement}\`.`,
    invisible: "Los enlaces invisibles solo orientan la disposición de Mermaid; no se importan.",
    namedShape: (name) => `La forma \`${name}\` se dibuja como un nodo.`,
    nodeAttribute: (key) => `El atributo de nodo \`${key}\` no se importa.`,
    linkAttribute: (key) => `El atributo de enlace \`${key}\` no se importa.`,
    subgraphNotClosed: "El subgrafo no se cierra con `end`.",
    notANode: (source) => `\`${source}\` no es un nodo ni un subgrafo.`,
    undefinedClass: (name) => `La clase \`${name}\` no está definida con \`classDef\`.`,
    noLink: (index) => `No hay ningún enlace número ${index}.`,
    storedData: "La forma de datos almacenados se dibuja como un almacén de datos.",
    textShape: "Una forma de texto o de comentario se convierte en una nota.",
  },
  sequence: {
    arrows: {
      cross: "Una cruz en el extremo se dibuja como una punta.",
      reply: "Una línea sin punta se dibuja como una respuesta.",
      call: "Una línea sin punta se dibuja como una llamada.",
    },
    links: "Los menús de participantes (`link`, `links`) no se importan.",
    properties: "Las propiedades de los participantes no se importan.",
    participantType: (type) => `El tipo \`${type}\` se dibuja como un participante.`,
    boxColour: "Los colores de las cajas no se conservan.",
    autonumberOff: "`autonumber off` no se conserva; la numeración recorre todo el diagrama.",
    autonumberStep: "El paso de la numeración no se conserva; los números aumentan de uno en uno.",
    sideNote: "Una nota lateral nombra a un solo participante; los demás se descartan.",
    branchOutside: (word) => `\`${word}\` fuera de un fragmento que lo admita.`,
  },
  architecture: {
    junction:
      "Un `junction` se convierte en un nodo pequeño sin texto en el que se unen sus conexiones.",
    icon: (name) => `El icono \`${name}\` no está en los paquetes del proyecto; no se dibuja.`,
    iconHint: "Agrega el paquete a los recursos del proyecto y vuelve a importar.",
    notAGroup: (parent, source) =>
      `\`${parent}\` no es un grupo; \`${source}\` se dibuja fuera de él.`,
    undeclared: (source) => `\`${source}\` no está declarado; la conexión no se importa.`,
    notInAGroup: (source) => `\`${source}\` no está en un grupo; la conexión lo une directamente.`,
  },
  block: {
    arrow: "La flecha de bloque se dibuja apuntando a la derecha.",
    undefinedClass: (source, name) => `\`${source}\` o \`${name}\` no está definido.`,
    notABlock: (source) => `\`${source}\` no es un bloque.`,
  },
  c4: {
    closeWithoutBoundary: "`}` sin un límite abierto.",
    needsAlias: (macro) => `\`${macro}\` necesita un alias.`,
    elementWithBody: "Un elemento con cuerpo se lee como un límite de su tipo.",
    notDrawn: (macro) => `\`${macro}\` no se dibuja; lo que contiene se conserva.`,
    boundaryTags: "Las marcas y los enlaces de los límites no se importan.",
    needsEnds: (macro) => `\`${macro}\` necesita un origen y un destino.`,
    bidirectional: "Una relación bidireccional se convierte en dos relaciones.",
    directions: "Las direcciones de las relaciones quedan a cargo de la disposición.",
    numbers: "Los números de las relaciones no se dibujan.",
    descriptions: "Las descripciones de las relaciones no se importan.",
    drawingOnly: (macro) => `\`${macro}\` solo cambia el dibujo; no se importa.`,
    deploymentNodes: "Los nodos de despliegue no se importan.",
    unknownMacro: (macro) => `\`${macro}\` no es una macro C4 que el importador conozca.`,
    boundaryNotClosed: "El límite no se cierra con `}`.",
    tags: "Las marcas no se importan.",
    links: "Los enlaces a URL no se importan.",
    containerBoundaryAsSystem:
      "Un límite de contenedor alrededor de contenedores se lee como el límite de su sistema.",
    systemInSystem: "Un límite de sistema dentro de otro sistema se dibuja como un sistema propio.",
    containerBoundaryOutside:
      "Un límite de contenedor fuera de un sistema se coloca en un sistema con el nombre del diagrama.",
    duplicate: (source) =>
      `\`${source}\` se declara dos veces; se conserva la primera declaración.`,
    containerInNamedSystem:
      "Un contenedor fuera de un límite de sistema se coloca en un sistema con el nombre del diagrama.",
    containerInScope: "Un contenedor fuera del límite se coloca en el sistema del alcance.",
    componentOutside: "Un componente fuera de un límite de contenedor se coloca en un contenedor.",
    nested: (kind) => `${KINDS[kind]} dentro de un límite se dibuja en el nivel superior.`,
    missingEnd: (source, boundary) =>
      `\`${source}\` no es un elemento del diagrama${boundary ? " (los límites que no se dibujan no se pueden relacionar)" : ""}; la relación no se importa.`,
    relationToParent: "Una relación entre un elemento y lo que lo contiene no se puede modelar.",
    componentScopes:
      "Una vista de componentes tiene un solo alcance; los demás límites de contenedor se dibujan como sus contenedores o sistemas.",
    componentNeedsContainer:
      "Una vista de componentes necesita un contenedor; el diagrama se dibuja en el nivel de contenedores.",
    containerScopes:
      "Una vista de contenedores tiene un solo alcance; los demás límites de sistema se dibujan como sus sistemas.",
    containerNeedsSystem:
      "Una vista de contenedores necesita un sistema; el diagrama se dibuja en el nivel de contexto.",
    dynamic: "Un diagrama dinámico se dibuja como una vista de contenedores sin números de paso.",
  },
  plantuml: {
    unsupportedStart: (kind) => `Los diagramas \`@start${kind}\` de PlantUML no se importan.`,
    supportedHint:
      "Se admiten diagramas de componentes, de despliegue, de casos de uso, de secuencia y de C4-PlantUML.",
    unsupportedC4: (name) => `Los diagramas \`${name}\` no se importan.`,
    c4LevelsHint:
      "Niveles de C4 admitidos: `C4_Context`, `C4_Container`, `C4_Component` y `C4_Dynamic`.",
    unsupportedKind: (kind) =>
      `Los diagramas ${PLANTUML_KINDS[kind] ?? `\`${kind}\``} de PlantUML no se importan.`,
    empty: "El bloque de PlantUML no tiene ningún diagrama.",
    blockNotClosed: (kind) => `El bloque no se cierra con \`@end${kind}\`.`,
    titleNotClosed: "El título no se cierra con `end title`.",
    skinparam: "Los estilos de `skinparam` no se importan.",
    style: "Los bloques `<style>` no se importan.",
    hide: "Los comandos `hide` y `show` no se importan.",
  },
  description: {
    containerNotClosed: "El contenedor no se cierra con `}`.",
    closeWithoutContainer: "`}` sin un contenedor abierto.",
    together: "`together` solo orienta la disposición de PlantUML; sus elementos se conservan.",
    ports: "Los puertos no se importan.",
    noName: (statement) => `\`${statement}\` no tiene nombre.`,
    stereotypes: "Los estereotipos se convierten en la descripción del elemento.",
    hidden: "Los enlaces ocultos solo orientan la disposición de PlantUML; no se importan.",
    directions: "Las direcciones de las flechas quedan a cargo de la disposición.",
    multiplicity: "Las etiquetas en los extremos de un enlace no se dibujan.",
    otherHeads:
      "Las puntas sin equivalente (`#`, `+`, `^`, sockets) se dibujan como puntas simples.",
    noteOnLink: "Las notas sobre enlaces no se importan.",
    unattachedNote: "La nota no está unida a ningún elemento.",
    containerShape: (keyword) => `Un elemento \`${keyword}\` con cuerpo se dibuja como un grupo.`,
  },
  plantumlSequence: {
    fragmentNotClosed: "El fragmento no se cierra con `end`.",
    space: "El espacio adicional entre mensajes queda a cargo de la disposición.",
    footbox: "`hide footbox` no se importa.",
    participantColours: "Los colores de los participantes no se importan.",
    participantStereotypes: "Los estereotipos de los participantes no se importan.",
    returnWithoutActivation: "`return` necesita una activación iniciada por un mensaje.",
    numberingControl: "Pausar o reanudar la numeración no se importa.",
    numberingFormat: "Los pasos y los formatos de la numeración no se conservan.",
    boxColours: "Los colores de las cajas no se importan.",
    endBoxWithoutBox: "`end box` sin `box`.",
    elseOutside: "`else` fuera de `alt`, `par` o `critical`.",
    endWithoutFragment: "`end` sin un fragmento abierto.",
    noteAcross:
      "Una nota a lo ancho del diagrama abarca a todos los participantes declarados hasta ese punto.",
    noteOnMessage: "Una nota sobre un mensaje se coloca junto a su participante.",
    noteWithoutParticipant: "La nota no nombra a ningún participante.",
    noteShapes: "Las notas hexagonales y en caja se dibujan como notas.",
    ref: "Un marco de referencia se dibuja como una nota sobre sus participantes.",
    gate: "Los mensajes desde o hacia fuera del diagrama pasan por un participante `outside`.",
    parallel: "Los mensajes paralelos (`&`) se dibujan uno después de otro.",
    twoHeads: "Un mensaje con dos puntas distintas se dibuja en un solo sentido.",
    heads:
      "Las puntas de media flecha, de mensaje perdido y de círculo se dibujan como puntas simples.",
    messageColours: "Los colores de los mensajes no se importan.",
  },
  preprocessor: {
    importArchives: "`!import` lee archivos comprimidos, que el importador no abre.",
    assertion: (text) => `Falló la aserción: ${text}`,
    themes: "Los temas de PlantUML no se importan.",
    pragma: "Los ajustes de `!pragma` no se importan.",
    unopened: (word) => `\`!${word}\` sin la directiva que lo abre.`,
    unknownDirective: (word) =>
      `\`!${word}\` no es una directiva del preprocesador que el importador conozca.`,
    tooManyLines: (max) => `El preprocesamiento produjo más de ${max} líneas.`,
    tooDeep: (name, max) =>
      `\`${name}\` se expande más de ${max} niveles de profundidad; puede que se llame a sí mismo sin fin.`,
    arguments: (name, count) =>
      `\`${name}\` admite ${count} ${plural("es", count, { one: "argumento", other: "argumentos" })}.`,
    callNotClosed: (name) => `La llamada a \`${name}\` no se cierra.`,
    notAFunction: (name) => `\`${name}\` no es una función.`,
    unknownBuiltin: (name) => `\`${name}\` no es una función integrada que el importador conozca.`,
    blockNotClosed: "El bloque no se cierra.",
    loop: (max) => `El bucle se repite más de ${max} veces.`,
    standardLibrary: (name) =>
      `La biblioteca estándar \`${name}\` no se lee; sus sprites y macros no se importan.`,
    remote: (path) => `\`${path}\` es una inclusión remota; el importador nunca descarga archivos.`,
    absolute: (path) => `\`${path}\` es una ruta absoluta; las inclusiones deben ser relativas.`,
    outside: (path) => `\`${path}\` está fuera de la carpeta que se importa.`,
    includesItself: (path) => `\`${path}\` se incluye a sí mismo.`,
    notFound: (path) => `No se encontró \`${path}\`.`,
    unreadable: (path) => `\`${path}\` no se puede leer aquí.`,
    noBlockNumber: (sub) => `El archivo no tiene ningún bloque número ${sub}.`,
    noSubpart: (sub) => `El archivo no tiene ningún \`!startsub ${sub}\`.`,
    unclosedString: (text) => `Cadena sin cerrar en \`${text}\`.`,
    unexpected: (what, text) => `\`${what}\` inesperado en \`${text}\`.`,
    unclosedJson: (text) => `JSON sin cerrar en \`${text}\`.`,
    expectedIn: (operator, text) => `Se esperaba \`${operator}\` en \`${text}\`.`,
    undefinedVariable: (name) => `\`${name}\` no está definido.`,
    incomplete: (text) => `La expresión \`${text}\` está incompleta.`,
    trailing: (text) => `Texto inesperado después de la expresión \`${text}\`.`,
  },
  content: {
    header: (from) => `Importado de ${from} con meltemi-diagrams.`,
    notImported: (text) => `No importado: ${text}`,
    system: "Sistema",
    components: "Componentes",
  },
  coverage: {
    syntax: "`import.syntax`.",
    syntaxEssential: "`import.syntax`, esencial.",
    syntaxKeptAsComment: "`import.syntax`, esencial; se conserva como comentario.",
    syntaxFirstKept: "`import.syntax`; se conserva la primera declaración.",
    unsupportedDiagram: "`import.unsupported-diagram`.",
    essential: "Esencial.",
    drawingOnly: "Solo afecta al dibujo.",
    c4Description: "Las vistas C4 no tienen descripción; allí se descarta.",
    lineBreaks: "`<br>` se convierte en un salto de línea.",
    classicShapes: "Los nombres de las formas clásicas se convierten como en las filas anteriores.",
    doubleRing: "El doble anillo no se dibuja.",
    mirrored: "La forma reflejada no se dibuja.",
    innermostSubgraph: "Un nodo pertenece al subgrafo más interno que lo menciona.",
    missingPacks: "Los iconos de paquetes que el proyecto no tiene se descartan.",
    sidesAsPorts: "Las posiciones quedan a cargo de ELK; los lados se conservan como puertos.",
    databaseSystem: "Un sistema de base de datos se dibuja como un sistema.",
    queueSystem: "Un sistema de cola se dibuja como un sistema.",
    queueContainer: "Un contenedor de cola se dibuja como un contenedor.",
    externalOnly: "Solo las personas y los sistemas se marcan como externos.",
    queueContainerExternal:
      "Un contenedor de cola se dibuja como un contenedor; solo las personas y los sistemas se marcan como externos.",
    databaseComponent: "Un componente de base de datos se dibuja como un componente.",
    queueComponent: "Un componente de cola se dibuja como un componente.",
    databaseComponentExternal:
      "Un componente de base de datos se dibuja como un componente; solo las personas y los sistemas se marcan como externos.",
    queueComponentExternal:
      "Un componente de cola se dibuja como un componente; solo las personas y los sistemas se marcan como externos.",
    containerBoundaryAsSystem:
      "Alrededor de contenedores sin componentes se lee como el límite de su sistema (aproximado).",
    boundaryType: 'Con `$type="system"` o `"container"` se lee como ese límite.',
    directions: "Las direcciones quedan a cargo de la disposición.",
    stepNumbers: "Los números de paso no se dibujan.",
    looseContainers:
      "Fuera de un límite de sistema va al sistema del alcance o a uno con el nombre del diagrama (aproximado).",
    deployment: "Esencial: los diagramas de despliegue no se importan.",
    passes: "Como máximo 1000 pasadas.",
    deterministic: "Las importaciones son deterministas: las fechas y el entorno quedan vacíos.",
    relativeIncludes:
      "Relativa al archivo que la incluye, dentro de la carpeta o el proyecto importados.",
    recognised: "Se reconoce, nunca se lee.",
    libraryMacros: "Sus macros no se importan.",
    neverFetches: "`import.include`, esencial: el importador nunca descarga archivos.",
    preprocessorEssential: "`import.preprocessor`, esencial.",
    unclosedBlock: "Un bloque sin cerrar es `import.syntax`.",
    elementsKept: "Sus elementos se conservan.",
  },
};
