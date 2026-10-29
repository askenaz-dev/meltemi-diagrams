import type {
  ArrowKind,
  SceneActionKind,
  ShapeName,
  ZOrder,
} from "@meltemi/diagrams-editor/canvas";
import { list, percent, plural, seconds } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/**
 * Spanish names of the shapes of boxes and nodes. Most are nouns ("con forma de hexágono"); the
 * rounded one agrees with "forma", and the framed one is said with "con marco".
 */
const SHAPE_NAMES = {
  rounded: "redondeada",
  rectangle: "rectángulo",
  square: "cuadrado",
  ellipse: "elipse",
  circle: "círculo",
  diamond: "rombo",
  cylinder: "cilindro",
  pill: "píldora",
  triangle: "triángulo",
  parallelogram: "paralelogramo",
  trapezoid: "trapecio",
  pentagon: "pentágono",
  hexagon: "hexágono",
  octagon: "octágono",
  star: "estrella",
  cloud: "nube",
  document: "documento",
  callout: "bocadillo",
  arrow: "flecha",
  framed: "con marco",
  flag: "bandera",
  person: "persona",
  agent: "agente",
  icon: "icono",
} satisfies Record<ShapeName, string>;

const ARROW_NAMES = {
  "->": "flecha",
  "-->": "flecha discontinua",
  "--": "línea",
  "---": "línea discontinua",
  "<->": "flecha doble",
  "<-->": "flecha doble discontinua",
} satisfies Record<ArrowKind, string>;

/**
 * Spanish names of the kinds of elements and events, for the sentences that name a kind: its
 * article and the agreement of "seleccionado". A kind without a name here, such as one of a
 * declared type, is named as it is written.
 */
const NOUNS: Readonly<Record<string, { readonly name: string; readonly feminine?: true }>> = {
  node: { name: "nodo" },
  decision: { name: "decisión", feminine: true },
  data: { name: "almacén de datos" },
  group: { name: "grupo" },
  note: { name: "nota", feminine: true },
  tag: { name: "marca", feminine: true },
  box: { name: "caja", feminine: true },
  text: { name: "texto" },
  icon: { name: "icono" },
  image: { name: "imagen", feminine: true },
  pen: { name: "lápiz" },
  sticky: { name: "nota adhesiva", feminine: true },
  participant: { name: "participante" },
  actor: { name: "actor" },
  boundary: { name: "límite" },
  control: { name: "control" },
  entity: { name: "entidad", feminine: true },
  database: { name: "base de datos", feminine: true },
  collections: { name: "colección", feminine: true },
  queue: { name: "cola", feminine: true },
  person: { name: "persona", feminine: true },
  system: { name: "sistema de software" },
  container: { name: "contenedor" },
  datastore: { name: "almacén de datos" },
  component: { name: "componente" },
  message: { name: "mensaje" },
  activate: { name: "activación", feminine: true },
  deactivate: { name: "desactivación", feminine: true },
  create: { name: "creación", feminine: true },
  destroy: { name: "destrucción", feminine: true },
  fragment: { name: "fragmento" },
  divider: { name: "separador" },
  delay: { name: "retraso" },
};

function noun(kind: string): { name: string; feminine: boolean } {
  const known = Object.hasOwn(NOUNS, kind) ? NOUNS[kind] : undefined;
  return { name: known?.name ?? kind, feminine: known?.feminine === true };
}

/** "un nodo", "una nota". */
function indefinite(kind: string): string {
  const { name, feminine } = noun(kind);
  return `${feminine ? "una" : "un"} ${name}`;
}

/** "el nodo", "la nota". */
function definite(kind: string): string {
  const { name, feminine } = noun(kind);
  return `${feminine ? "la" : "el"} ${name}`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const chosen = (feminine: boolean) => (feminine ? "seleccionada" : "seleccionado");

/**
 * How an element of a kind is said to have a shape: "con forma de hexágono", "con marco", and
 * "redondeada" or "redondeado" agreeing with the kind ("una caja redondeada", "un nodo redondeado").
 */
function withShape(kind: string, shape: string): string {
  if (shape === "rounded") return noun(kind).feminine ? "redondeada" : "redondeado";
  if (shape === "framed") return SHAPE_NAMES.framed;
  const name = Object.hasOwn(SHAPE_NAMES, shape) ? SHAPE_NAMES[shape as ShapeName] : shape;
  return `con forma de ${name}`;
}

/** Where a change of order puts the elements. */
const PLACES: Readonly<Record<ZOrder, string>> = {
  front: "al frente",
  back: "al fondo",
  forward: "adelante",
  backward: "atrás",
};

/** What each action of a scene does, as a verb. */
const VERBS: Readonly<Record<SceneActionKind, string>> = {
  reveal: "revelar",
  hide: "ocultar",
  highlight: "resaltar",
  focus: "enfocar",
  camera: "encuadrar",
  trace: "recorrer",
  draw: "dibujar",
  hold: "mantener",
};

/** The canvas's own words in Spanish: every entry of the English catalog, with its parameters. */
export const es: typeof en = {
  toolbar: {
    label: "Herramientas del lienzo",
    diagram: "Diagrama",
    scenario: "Escenario",
    scenarioTitle: "Ver un escenario en vista previa, de solo lectura, o todos los eventos",
    allEvents: "Todos los eventos",
    story: "Historia",
    storyTitle: "Reproducir una historia del archivo, de solo lectura, con su línea de tiempo",
    editDiagram: "Editar el diagrama",
    storyOption: (id, title) => (title ? `Historia: ${id} — ${title}` : `Historia: ${id}`),
    relation: "Relación: haz clic en el origen y luego en el destino",
    message: "Mensaje: haz clic en el emisor y luego en el receptor",
    relationTitle: (label) => `${label} (R; Mayús para una línea discontinua)`,
    relationKindsTitle: (label) =>
      `${label} (R; R otra vez para el siguiente tipo de flecha; Mayús alterna entre continua y discontinua)`,
    arrowMenu: "Tipos de flecha",
    arrowMenuKey: "R cambia",
    shapeMenu: "Más formas",
    groupMenu: "Grupo o contenedor",
    groupMenuLists: "Grupo, contenedor, columna o fila",
    groupKinds: { group: "Grupo", container: "Contenedor", column: "Columna", row: "Fila" },
    penMenu: "Lápiz y marcador: grosor y color",
    stickyMenu: "Color de las notas adhesivas nuevas",
    newDiagram: "Nuevo diagrama",
    connect: "Conectar el elemento seleccionado con…",
    moreParticipants: "Más participantes",
    note: "Nota sobre la selección",
    fragment: "Fragmento alrededor de los eventos seleccionados",
    divider: "Separador",
    delay: "Retraso",
    tag: "Marca",
    activate: "Activar el receptor",
    zoom: "Zoom",
    zoomOut: "Alejar",
    zoomIn: "Acercar",
    fitDiagram: "Ajustar el diagrama a la vista",
    fit: "Ajustar a la vista",
    selection: "Selección",
    percent: (zoom) => percent("es", zoom),
    pointer: "Puntero",
    grid: "Mostrar la cuadrícula",
    snap: "Ajustar a la cuadrícula y a las guías",
    minimap: "Mostrar el minimapa",
    inspector: "Mostrar las propiedades",
    layers: "Mostrar las capas",
    libraries: "Bibliotecas",
    arrange: "Organizar",
    playEffects: "Reproducir los efectos",
    pauseEffects: "Pausar los efectos",
  },

  commands: {
    addFromModel: "Agregar desde el modelo…",
    arrangeUnplaced: "Organizar los elementos sin colocar",
    recomputeLayout: "Recalcular la disposición",
    convertToFree: "Convertir en composición libre",
    exportSvg: "Exportar SVG",
  },

  keys: {
    shift: "Mayús",
    enter: "Entrar",
    delete: "Supr",
    up: "Arriba",
    down: "Abajo",
    altClick: "Alt+clic",
  },

  palette: {
    tools: {
      node: "Nodo",
      decision: "Decisión",
      data: "Almacén de datos",
      note: "Nota",
      tag: "Marca",
      box: "Caja",
      text: "Texto",
      sticky: "Nota adhesiva",
      icon: "Icono",
      image: "Imagen",
      participant: "Participante",
      actor: "Actor",
      group: "Grupo",
      boundary: "Límite",
      control: "Control",
      entity: "Entidad",
      database: "Base de datos",
      collections: "Colecciones",
      queue: "Cola",
      pen: "Lápiz",
      highlighter: "Marcador",
      eraser: "Borrador",
    },
    hint: (name) => `${name}: haz clic en el lienzo`,
    shaped: (name, shape) =>
      `${name}, ${Object.hasOwn(SHAPE_NAMES, shape) ? SHAPE_NAMES[shape as ShapeName] : shape}: haz clic en el lienzo`,
    shapedTool: (name, shape) =>
      `${name}, ${Object.hasOwn(SHAPE_NAMES, shape) ? SHAPE_NAMES[shape as ShapeName] : shape}`,
    declared: (name) => `${name}: haz clic en el lienzo`,
    icon: "Icono: busca uno para la selección o para colocarlo",
  },

  fragments: {
    alt: "alt: alternativas",
    opt: "opt: opcional",
    loop: "loop: repetido",
    par: "par: en paralelo",
    break: "break: termina la interacción",
    critical: "critical: atómico",
    region: "region: con etiqueta",
  },

  mode: {
    story: "historia",
    storyTitle: "Una historia de solo lectura; elige “Editar el diagrama” para editar.",
    sequence: "secuencia",
    sequenceTitle:
      "Arrastra un participante hacia un lado para reordenarlo, y un mensaje, una nota o un fragmento hacia abajo para darle espacio. Alt+Arriba y Alt+Abajo mueven el evento seleccionado.",
    preview: "vista previa del escenario",
    previewTitle:
      "Una vista previa de solo lectura de un escenario; elige “Todos los eventos” para editar.",
    layout: (mode) => `layout ${mode}`,
    auto: "ELK organiza este diagrama; mover una caja escribe todas las posiciones y cambia a assisted.",
    assisted: "Las cajas colocadas se mantienen; ELK organiza las demás.",
    manual: "Cada caja tiene una posición escrita.",
  },

  stage: {
    roleDescription: "lienzo de diagrama",
    label:
      "Lienzo del diagrama. Tab selecciona elementos, las flechas los mueven y Entrar edita la etiqueta.",
    minimap: "Minimapa",
    outOfDate: (count, message, line) =>
      `Desactualizado · ${count} ${plural("es", count, { one: "problema", other: "problemas" })}: ${message} (línea ${line})`,
    fixIt: (message, line) =>
      `${message}\nLínea ${line}. Corrígelo en el texto o usa allí la corrección rápida.`,
    element: (kind, label) => `${noun(kind).name} ${label}`,
    stroke: (id, count) =>
      `Trazo ${id}, ${count} ${plural("es", count, { one: "punto", other: "puntos" })}`,
    create: "Crear un diagrama",
  },

  diagrams: {
    flow: "Diagrama de flujo",
    free: "Composición libre",
    sequence: "Diagrama de secuencia",
  },

  announcements: {
    fixFirst: "Corrige los problemas del texto antes de editar en el lienzo.",
    effectsPaused: "Los efectos están en pausa; pulsa Reproducir los efectos para verlos.",
    nothingSelected: "No hay nada seleccionado.",
    selected: (count) =>
      `${count} ${plural("es", count, { one: "seleccionado", other: "seleccionados" })}.`,
    selectedElement: (kind, id, label) => {
      const { name, feminine } = noun(kind);
      return label === ""
        ? `${capital(name)} ${id} ${chosen(feminine)}.`
        : `${capital(name)} ${id}, ${label}, ${chosen(feminine)}.`;
    },
    selectedRelation: (from, to, message) =>
      message
        ? `Mensaje de ${from} a ${to} seleccionado.`
        : `Relación de ${from} a ${to} seleccionada.`,
    selectedStroke: (id, count) =>
      `Trazo ${id}, ${count} ${plural("es", count, { one: "punto", other: "puntos" })}, seleccionado.`,
    selectedEvent: (kind, key) => {
      const { name, feminine } = noun(kind);
      return `${capital(name)} ${key} ${chosen(feminine)}.`;
    },
    selectedBelow: (kind, id, label, index, count) => {
      const { name, feminine } = noun(kind);
      const named = label === "" ? "" : `, ${label},`;
      return `${capital(name)} ${id}${named} ${chosen(feminine)}: ${index} de ${count} bajo el puntero.`;
    },
    selectedOnFrame: (ids) => `Selección: ${list("es", ids)}.`,
    moved: (ids) =>
      ids.length === 1 ? `Se movió ${ids[0]}.` : `Se movieron ${ids.length} elementos.`,
    movedBy: (ids, dx, dy) =>
      ids.length === 1
        ? `Se movió ${ids[0]} en ${dx}, ${dy}.`
        : `Se movieron ${ids.length} elementos en ${dx}, ${dy}.`,
    movedInto: (ids, group) => {
      const where = group === null ? "al nivel superior" : `dentro de ${group}`;
      return ids.length === 1
        ? `Se movió ${ids[0]} ${where}.`
        : `Se movieron ${ids.length} elementos ${where}.`;
    },
    eventMoved: (key, distance) =>
      distance > 0 ? `${key} bajó ${distance}.` : `${key} subió ${-distance}.`,
    movedVertically: (id, direction) =>
      `Se movió ${id} hacia ${direction === "up" ? "arriba" : "abajo"}.`,
    movedSideways: (id, direction) =>
      `Se movió ${id} a la ${direction === "left" ? "izquierda" : "derecha"}.`,
    space: (id, space) => `Espacio sobre ${id}: ${space}.`,
    resized: (id, width, height) => `${id} mide ${width} × ${height}.`,
    reordered: (ids, to) => `Se movió ${ids.length === 1 ? ids[0] : "la selección"} ${PLACES[to]}.`,
    converted: "Se convirtió en una composición libre.",
    createdDiagram: (type) =>
      `Se creó ${{ flow: "un diagrama de flujo", free: "una composición libre", sequence: "un diagrama de secuencia" }[type]}.`,
    previewReadOnly:
      "Una vista previa de escenario es de solo lectura; elige “Todos los eventos” para editar.",
    connectFromFirst: "Primero selecciona el elemento desde el que conectar.",
    selectEventToMove: "Selecciona un mensaje, una nota, un fragmento o un evento para moverlo.",
    noEntities: "Todas las entidades que esta vista puede dibujar ya están en ella.",
    added: (path) => `Se agregó ${path} a la vista.`,
    created: (kind) => `Se creó ${indefinite(kind)}.`,
    createdShape: (kind, shape) => `Se creó ${indefinite(kind)} ${withShape(kind, shape)}.`,
    place: (kind) => `Haz clic en el lienzo para colocar ${definite(kind)}. Esc cancela.`,
    placeShape: (kind, shape) =>
      `Haz clic en el lienzo para colocar ${definite(kind)} ${withShape(kind, shape)}. Esc cancela.`,
    arrowKind: (kind) =>
      `${capital(Object.hasOwn(ARROW_NAMES, kind) ? ARROW_NAMES[kind as ArrowKind] : kind)} (${kind}).`,
    pickSender: "Haz clic en el participante que envía el mensaje. Esc cancela.",
    pickSource: "Haz clic en el elemento donde empieza la relación. Esc cancela.",
    pickTargetOf: (from) => `Haz clic en el elemento con el que conectar ${from}, o presiona Esc.`,
    pickStart: "Haz clic en un elemento para empezar la relación, o presiona Esc.",
    fromSender: (id) =>
      `Desde ${id}: haz clic en el receptor. Con Mayús es una respuesta (discontinua).`,
    fromSource: (id, dashed = false) =>
      `Desde ${id}: haz clic en el destino. Con Mayús es ${dashed ? "continua" : "discontinua"}.`,
    anotherElement: "Haz clic en otro elemento: una relación une dos.",
    connected: (from, to, dashed, heads = "end") =>
      `Se conectó ${from} con ${to}${heads === "both" ? " en ambos sentidos" : heads === "none" ? " con una línea" : ""}${dashed ? ", con línea discontinua" : ""}.`,
    noLabel: (kind) =>
      `${capital(indefinite(kind))} no tiene etiqueta; cámbia${noun(kind).feminine ? "la" : "lo"} en las propiedades.`,
    nothingToEdit: (kind) =>
      `${capital(indefinite(kind))} no tiene nada que editar aquí; consulta las propiedades.`,
    strokeHasNoText:
      "Un trazo no tiene texto; cambia su color, su ancho y sus puntas en las propiedades.",
    endPinned: (relation, element, port, position) =>
      position === undefined
        ? `${relation} ahora termina en ${element}.${port}.`
        : `${relation} ahora termina en ${element}, lado ${port} al ${position} %.`,
    endFree: (relation) => `La disposición coloca este extremo de ${relation}.`,
    drawingLine:
      "Dibujando una línea: suelta para colocarla. Mayús la mantiene a 45°, Esc cancela.",
    lineDrawn: (from, to) => `Se dibujó una línea de (${from.x}, ${from.y}) a (${to.x}, ${to.y}).`,
    lineTooShort: "Una línea necesita dos puntos distintos: arrastra más lejos.",
    lineCancelled: "No se dibujó ninguna línea.",
    pointerOn: "Puntero activado: arrastra para señalar el diagrama. Esc o K lo guardan.",
    pointerOff: "Puntero desactivado.",
    lineReshaped: (id) => `Se movió un punto de ${id}.`,
    lineBendAdded: (id) => `Se añadió un codo a ${id}.`,
    lineBendRemoved: (id) => `Se quitó un codo de ${id}.`,
    placeIcon: (label) =>
      `Haz clic en el lienzo para colocar ${label}, o en una forma para darle el icono. Esc cancela.`,
    iconSet: (label, ids) =>
      ids.length === 1
        ? `${label} es el icono de ${ids[0]}.`
        : `${label} es el icono de ${ids.length} elementos.`,
    iconAdded: (label) => `Se agregó ${label}.`,
    iconsRemoved: (ids) =>
      ids.length === 1
        ? `Se quitó el icono de ${ids[0]}.`
        : `Se quitó el icono de ${ids.length} elementos.`,
    penArmed:
      "Lápiz: arrastra en el lienzo para dibujar; Mayús mantiene recto el trazo. P o Esc lo guardan.",
    highlighterArmed: "Marcador: arrastra sobre lo que quieras resaltar. H o Esc lo guardan.",
    eraserArmed: "Borrador: arrastra sobre los trazos para borrarlos. E o Esc lo guardan.",
    penDrawn: (count) =>
      `Se dibujó un trazo de ${count} ${plural("es", count, { one: "punto", other: "puntos" })}.`,
    strokeCancelled: "No se dibujó ningún trazo.",
    erased: (count) => (count === 1 ? "Se borró 1 trazo." : `Se borraron ${count} trazos.`),
    nothingErased: "No se borró nada.",
    stickyColour: (name) =>
      name === null
        ? "Las notas adhesivas nuevas toman el color del tema."
        : `Color de las notas adhesivas nuevas: ${name.toLowerCase()}.`,
    createdList: (layout) => `Se creó una ${layout === "column" ? "columna" : "fila"}.`,
    addedSticky: (list) => `Se añadió una nota adhesiva a ${list}.`,
    addedColumn: (list) => `Se añadió una columna a ${list}.`,
    movedInList: (ids, list, position, count) =>
      ids.length === 1
        ? `Se movió ${ids[0]} a la posición ${position} de ${count} en ${list}.`
        : `Se movieron ${ids.length} elementos a la posición ${position} de ${count} en ${list}.`,
    movedPast: (id, neighbour, list, before) =>
      `Se movió ${id} ${before ? "antes de" : "después de"} ${neighbour} en ${list}.`,
    listEnd: (id, list, first) => `${id} ya está al ${first ? "principio" : "final"} de ${list}.`,
    noListToAdd: "Selecciona una lista, o una tarjeta de una lista, para añadirle algo.",
    noListToMove: "Selecciona una tarjeta de una lista para moverla entre sus vecinas.",
    activation: (participant, from, to) =>
      `Activación de ${participant} desde ${from ?? "el principio"} hasta ${to ?? "el final"} seleccionada.`,
    barEndAt: (participant, end, row) =>
      `${end === "start" ? "Empezar" : "Terminar"} la activación de ${participant} después de ${row}: suelta para moverla, Esc cancela.`,
    barEndMoved: (participant, end, row) =>
      `La activación de ${participant} ahora ${end === "start" ? "empieza" : "termina"} después de ${row}.`,
  },

  inline: {
    label: (id) => `Etiqueta de ${id}`,
    text: (id) => `Texto de ${id}`,
    newId: (id) => `Nuevo id de ${id}`,
    tag: (owner, index) => `Marca ${index} de ${owner}`,
    keys: (multiline) =>
      multiline
        ? "Entrar o Tab guarda el texto, Mayús+Entrar empieza una línea nueva, Esc cancela."
        : "Entrar o Tab guarda el texto, Esc cancela.",
    nextCard: "Ctrl+Entrar lo guarda y añade la tarjeta siguiente.",
  },

  menu: {
    label: "Acciones del lienzo",
    editLabel: "Editar la etiqueta",
    renameId: "Cambiar el id",
    connectTo: "Conectar con…",
    selectBelow: "Seleccionar la forma de debajo",
    routeKind: (routing) => `Tipo de ruta: ${routing}`,
    solidLine: "Línea continua",
    dashedLine: "Línea discontinua",
    dottedLine: "Línea punteada",
    cut: "Cortar",
    copy: "Copiar",
    paste: "Pegar",
    duplicate: "Duplicar",
    delete: "Eliminar",
    group: "Agrupar",
    ungroup: "Desagrupar",
    convertToContainer: "Convertir en contenedor",
    rotate90: "Girar 90°",
    resetRotation: "Quitar el giro",
    alignLeft: "Alinear a la izquierda",
    alignCentre: "Alinear al centro",
    alignRight: "Alinear a la derecha",
    alignTop: "Alinear arriba",
    alignMiddle: "Alinear al medio",
    alignBottom: "Alinear abajo",
    distributeHorizontally: "Distribuir horizontalmente",
    distributeVertically: "Distribuir verticalmente",
    bringToFront: "Traer al frente",
    bringForward: "Traer adelante",
    sendBackward: "Enviar atrás",
    sendToBack: "Enviar al fondo",
    showInText: "Mostrar en el texto",
    labelInView: "Etiquetar en esta vista",
    renameInModel: "Cambiar el nombre en el modelo",
    openModel: "Abrir el modelo",
    removeFromView: "Quitar de la vista",
    messageTo: "Mensaje a…",
    makeReply: "Convertir en respuesta",
    makeCall: "Convertir en llamada",
    moveUp: "Subir",
    moveDown: "Bajar",
    activateReceiver: "Activar el receptor",
    removeActivation: "Quitar la activación",
    editTag: "Editar la marca",
    removeTag: "Quitar la marca",
    nestInCall: "Anidar en la llamada",
    unnestCall: "Desanidar la llamada",
    addReturn: "Devolver a quien llama",
    addNote: "Agregar una nota",
    wrapInFragment: "Envolver en un fragmento…",
    addDivider: "Agregar un separador",
    addDelay: "Agregar un retraso",
    icon: "Icono…",
    removeIcon: "Quitar el icono",
  },

  inspector: {
    label: "Propiedades",
    hidePanel: "Ocultar el panel de propiedades",
    showPanel: "Mostrar el panel de propiedades",
    strip: "Estilo",
    effects: "Efectos",
    effectsOff: "ninguno",
    effectSettings: (effect) => `${effect}: ajustes`,
    milliseconds: "ms",
    mixed: "mixto",
    theme: "tema",
    defaultFromTheme: "predeterminado (tema)",
    defaultOf: (value) => `predeterminado (${value})`,
    themeChip: "Tema",
    inherit: (label) => `${label}: heredar`,
    inheritTitle: "Heredar del tema",
    inherited: (value) => `${value} (heredado)`,
    ownColour: (field) => `${field}: un color propio`,
    ownColourTitle: "Un color propio, que se mantiene cuando cambia el tema",
    defaultChip: "Predeterminado",
    defaultNamed: (name) => `Predeterminado: ${name}`,
    defaultValue: "predeterminado",
    byDefault: (name) => `${name} (predeterminado)`,
    use: (value) => `Usar ${value}`,
    slider: (label) => `${label}, control deslizante`,
    alignCell: (across, down) => (down ? `${across}, ${down}` : across),
    alignInherit: "Heredar la alineación: quitar las dos",
    newTheme: "Nuevo tema a partir de este…",
    editTheme: "Editar el tema…",
    chooseIcon: "Elegir un icono",
    choose: "Elegir…",
    remove: "Quitar",
    removeIcon: "Quitar el icono",
    noIcon: "Sin icono",
    iconMissing: (name) => `${name} (no encontrado)`,
    iconMissingTitle: (reference) =>
      `Ningún paquete tiene el icono ${reference}: revisa su nombre o elige otro.`,
    tags: "Marcas",
    removeTagTitle: (text) => `Quitar la marca ${text}`,
    clear: "Borrar",
    clearTitle: "Quitar el valor escrito: se aplica el predeterminado",
    options: {
      on: "activado",
      off: "desactivado",
      yes: "sí",
      no: "no",
      call: "llamada",
      reply: "respuesta",
      async: "asíncrono",
      fit: "ajustar al contenido",
      custom: "personalizado",
    },
  },

  glyphs: {
    solid: "continua",
    dashed: "discontinua",
    dotted: "punteada",
    auto: "automática",
    orthogonal: "en codo",
    polyline: "recta",
    bezier: "curva",
    sharp: "en ángulo",
    rounded: "redondeadas",
    none: "ninguna",
    light: "ligero",
    rough: "áspero",
    triangle: "triángulo",
    triangleOutline: "triángulo hueco",
    open: "abierta",
    diamond: "rombo",
    diamondOutline: "rombo hueco",
    circle: "círculo",
    circleOutline: "círculo hueco",
    bar: "barra",
    cross: "cruz",
    many: "muchos",
    oneOrMany: "uno o muchos",
    onlyOne: "solo uno",
    zeroOrOne: "cero o uno",
    zeroOrMany: "cero o muchos",
  },

  positions: {
    left: "izquierda",
    right: "derecha",
    top: "arriba",
    bottom: "abajo",
    center: "centro",
    middle: "en medio",
  },

  shapes: SHAPE_NAMES,

  arrowKinds: ARROW_NAMES,

  rotation: {
    handle: "Girar (Alt para cualquier ángulo)",
    degrees: (angle) => `${angle}°`,
    status: (angle) => `Giro de ${angle}°. Suelta para conservarlo; Escape cancela.`,
    done: (id, angle) => (angle === 0 ? `${id} vuelve a estar recto.` : `${id} girado ${angle}°.`),
  },

  bars: {
    start: "Inicio de la activación: arrástralo a otra fila",
    end: "Fin de la activación: arrástralo a otra fila",
  },

  pen: {
    label: "Lápiz y marcador",
    tools: "Herramienta",
    width: "Grosor",
    widths: { default: "Predeterminado", thin: "Fino", medium: "Medio", thick: "Grueso" },
    widthChip: (name, width) => `${name}, ${width} px`,
    pixels: (width) => `${width} px`,
    fixedWidth: (width) => `El marcador siempre tiene ${width} px de grosor.`,
    colour: { pen: "Color del lápiz", highlighter: "Color del marcador" },
  },

  sticky: {
    button: "Nota adhesiva: haz clic para añadir una o arrástrala al lienzo",
    coloured: (name) =>
      `Nota adhesiva, ${name.toLowerCase()}: haz clic para añadir una o arrástrala al lienzo`,
    shortColoured: (name) => `Nota adhesiva, ${name.toLowerCase()}`,
    themeColour: "Color del tema",
    colours: {
      yellow: "Amarillo",
      pink: "Rosa",
      green: "Verde",
      blue: "Azul",
      orange: "Naranja",
      purple: "Morado",
    },
  },

  lists: {
    addSticky: (list) => `Añadir una nota adhesiva a ${list}`,
    addColumn: (list) => `Añadir una columna a ${list}`,
  },

  shapeGrid: {
    label: "Formas",
    hint: "Escribe para buscar una forma",
    typed: (query) => `Buscar: ${query}`,
    none: (query) => `Ninguna forma se llama «${query}».`,
  },

  iconPicker: {
    label: "Iconos",
    search: "Buscar iconos: server, database, aws:lambda…",
    searchLabel: "Buscar iconos",
    results: "Iconos encontrados",
    recent: "Recientes",
    searching: "Buscando…",
    none: (query) => `Ningún icono coincide con «${query}».`,
    empty:
      "Aquí no hay iconos: los diagramas de secuencia y las vistas C4 dibujan sus propios tipos.",
    forTargets: (ids) =>
      ids.length === 1 ? `Icono de ${ids[0]}` : `Icono de ${ids.length} elementos`,
    hintApply: "Entrar o un clic lo aplica · Esc cierra",
    hintPlace: "Clic y luego colócalo · Entrar lo pone en el centro · O arrástralo sobre una forma",
    itemTitle: (label, reference) => (label === reference ? reference : `${label} · ${reference}`),
    add: "Agregar icono…",
    addTitle: "Agrega al proyecto iconos SVG propios",
  },

  addIcons: {
    title: "Agregar iconos al proyecto",
    prefix: "Paquete",
    prefixNew: (prefix) => `Un paquete nuevo, en assets/icons/${prefix}/.`,
    prefixExisting: (prefix) => `Los iconos se suman al paquete ${prefix}.`,
    licence: "Licencia del paquete nuevo",
    own: "Obra propia",
    other: "Otra…",
    otherPlaceholder: "id SPDX o nombre LicenseRef-",
    otherInvalid: "Un identificador SPDX, como MIT, o un nombre LicenseRef-.",
    files: "Iconos",
    name: (file) => `Nombre de ${file}`,
    reference: (reference) => `Se escribe ${reference}`,
    leftOut: "Se deja fuera",
    raster: "Las imágenes se agregan como imágenes, con la herramienta Imagen de la paleta.",
    tooLarge: (kilobytes) => `Más de ${kilobytes} KB, lo máximo que puede ocupar un icono.`,
    remove: (file) => `Dejar fuera ${file}`,
    checking: "Comprobando…",
    add: (count) => (count === 1 ? "Agregar 1 icono" : `Agregar ${count} iconos`),
    cancel: "Cancelar",
    none: "No se puede agregar ningún archivo: todos se dejan fuera.",
  },

  placement: {
    label: "Insertar como",
    icon: "Icono",
    box: "En una caja",
    only: "Solo el icono",
    iconTitle: "El icono es la forma, con su etiqueta debajo",
    boxTitle: "Una caja de la forma actual, con el icono junto a su etiqueta",
    onlyTitle: "El icono solo, sin etiqueta",
  },

  library: {
    label: "Bibliotecas de elementos",
    title: "Bibliotecas",
    search: "Buscar elementos, como lambda, postgres o pod",
    noResults: (query) => `Nada coincide con «${query}».`,
    none: "Este diagrama no tiene bibliotecas: los diagramas de secuencia y las vistas C4 dibujan sus propios tipos.",
    loading: "Cargando…",
    itemTitle: (label) =>
      `${label}: clic para agregarlo en el centro, arrástralo al lienzo, o sobre una forma para darle este icono`,
    created: (label, id) => `${label} agregado como ${id}.`,
  },

  layers: {
    label: "Capas",
    title: "Capas",
    add: "Agregar una capa",
    addShort: "Agregar",
    renameHint: "Doble clic para renombrar",
    rename: (layer) => `Renombrar la capa ${layer}`,
    hide: (layer) => `Ocultar la capa ${layer} en el lienzo`,
    show: (layer) => `Mostrar la capa ${layer}`,
    up: (layer) => `Traer la capa ${layer} adelante`,
    down: (layer) => `Enviar la capa ${layer} atrás`,
    remove: (layer) => `Quitar la capa ${layer}`,
    moveSelection: "Mover la selección a…",
    moved: (count, layer) =>
      `${count} ${plural("es", count, { one: "elemento", other: "elementos" })} a la capa ${layer}.`,
    removed: (layer, count) =>
      count > 0
        ? `Capa ${layer} quitada; ${count} ${plural("es", count, { one: "elemento volvió", other: "elementos volvieron" })} a main.`
        : `Capa ${layer} quitada.`,
  },

  themePanel: {
    label: "Tema",
    title: (id) => `Tema ${id}`,
    done: "Listo",
    doneTitle: "Cerrar el tema",
    thisFile: "este archivo",
    where: (file) => `Escrito en ${file}. Las clases y las reglas quedan en el código.`,
    chooseColour: (token) => `${token}: elegir un color`,
    inherit: "Heredar",
    inheritTitle: "Quitar el token: se aplica el color del tema base",
  },

  picker: {
    label: "Conectar con",
    placeholder: "Conectar con…",
    input: "Elemento con el que conectar",
    list: "Elementos",
  },

  dialogs: {
    deleteAll: "Eliminar todo",
    cancel: "Cancelar",
    newTheme: "Nuevo tema a partir de este",
    id: "Id",
    idPlaceholder: "mi-tema",
    extends: (theme) => `Extiende ${theme}.`,
    badId: "Un id empieza con una letra o _ y tiene letras, dígitos o _.",
    where: "Dónde se guarda",
    file: "Este archivo",
    fileNote: "El diagrama lo usa de inmediato.",
    project: "El proyecto",
    projectNote: "themes/<id>.meltemi, el tema predeterminado de cada diagrama sin tema propio.",
    noProject: "Necesita un archivo guardado en un proyecto con project.json.",
    create: "Crear",
  },

  story: {
    timeline: "Línea de tiempo de la historia",
    actionToAdd: "Acción para agregar",
    time: "Tiempo",
    play: "Reproducir la historia",
    pause: "Pausar la historia",
    addToScene: "Agregar a la escena",
    newScene: "Nueva escena después de esta",
    removeAction: "Quitar la acción seleccionada",
    exportPlayer: "Exportar la historia como reproductor HTML",
    exportHtml: "Exportar HTML",
    scene: (id, title) => `escena ${id}${title ? ` — ${title}` : ""}`,
    transition: (kind) => `transición ${kind}`,
    bar: (label, start, duration) => `${label} · ${start} durante ${duration}`,
    grip: "Arrastra para cambiar el tiempo",
    selectFirst: (action) => `Primero selecciona en el lienzo qué ${VERBS[action]}.`,
    seconds: (ms) => seconds("es", ms),
  },

  readOnly: {
    badge: "solo lectura",
    badgeTitle:
      "Solo lectura: puedes recorrer el diagrama, seleccionar, acercar, reproducir historias y exportar; aquí no se puede cambiar.",
    stage:
      "Lienzo de diagrama, solo lectura. Tab selecciona elementos; aquí no se puede cambiar el diagrama.",
    inspector: "Propiedades, solo lectura",
    entered:
      "Este lienzo es de solo lectura: puedes recorrerlo, seleccionar, acercar y reproducir historias.",
    refused: "Solo lectura: el diagrama no se puede cambiar aquí.",
  },
};
