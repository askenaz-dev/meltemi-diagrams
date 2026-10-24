import { list, plural, seconds } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** Code inside a sentence, as the canvas shows it: `id`. */
const code = (text: string) => `\`${text}\``;

const KINDS: typeof en.kinds = {
  node: "nodo",
  decision: "decisión",
  data: "datos",
  group: "grupo",
  note: "nota",
  tag: "marca",
  box: "caja",
  text: "texto",
  icon: "icono",
  image: "imagen",
  participant: "participante",
  actor: "actor",
  boundary: "límite",
  control: "control",
  entity: "entidad",
  database: "base de datos",
  collections: "colecciones",
  queue: "cola",
  person: "persona",
  system: "sistema",
  container: "contenedor",
  datastore: "almacén de datos",
  component: "componente",
  message: "mensaje",
  activate: "activación",
  deactivate: "desactivación",
  create: "creación",
  destroy: "destrucción",
  fragment: "fragmento",
  divider: "separador",
  delay: "retraso",
};

const statements = (count: number) =>
  `${count} ${plural("es", count, { one: "instrucción", other: "instrucciones" })}`;

export const es: typeof en = {
  fields: {
    id: "Id",
    kind: "Tipo",
    label: "Etiqueta",
    description: "Descripción",
    classes: "Clases",
    icon: "Icono",
    imageFile: "Archivo de imagen",
    layer: "Capa",
    linkedTo: "Enlazado a",
    url: "URL",
    ports: "Puertos",
    x: "X",
    y: "Y",
    width: "Ancho",
    height: "Alto",
    from: "Origen",
    fromPort: "Puerto de origen",
    to: "Destino",
    toPort: "Puerto de destino",
    line: "Línea",
    labelAt: "Posición de la etiqueta (%)",
    title: "Título",
    direction: "Dirección",
    layout: "Disposición",
    layers: "Capas (de atrás hacia adelante)",
    routing: "Tipo de ruta",
    theme: "Tema",
    canvas: "Lienzo",
    inside: "Dentro de",
    convertToContainer: "Convertir en contenedor",
  },

  style: {
    fill: "Relleno",
    stroke: "Borde",
    color: "Color del texto",
    line: "Línea",
    width: "Ancho del borde",
    pattern: "Patrón",
    icon: "Icono",
    iconColor: "Color del icono",
    iconPosition: "Posición del icono",
    labelPosition: "Posición de la etiqueta",
    iconSize: "Tamaño del icono",
    arrowtail: "Punta inicial",
    arrowhead: "Punta final",
    routing: "Tipo de ruta",
    corners: "Esquinas",
    radius: "Radio de las esquinas",
    rotation: "Rotación",
    shape: "Forma",
    fontSize: "Tamaño del texto",
    fontWeight: "Grosor del texto",
    textAlign: "Alineación del texto",
  },

  placeholders: {
    none: "ninguno",
  },

  quick: {
    dark: "Oscuro",
    light: "Claro",
    auto: "Automático",
  },

  titles: {
    diagram: (id) => `Diagrama ${id}`,
    target: (kind, id) => (id === "" ? kind : `${kind} ${id}`),
    relation: (name) => `relación ${name}`,
    message: (name) => `mensaje ${name}`,
    selected: (count) =>
      `${count} ${plural("es", count, { one: "seleccionado", other: "seleccionados" })}`,
  },

  kinds: KINDS,

  effects: {
    flow: "Partículas",
    dash: "Trazo en movimiento",
    pulse: "Pulso",
    trace: "Recorrido",
  },

  effectFields: {
    duration: "duración (ms)",
    repeat: "repetir",
    delay: "retraso (ms)",
    direction: "dirección",
    particles: "partículas",
    colour: "color",
  },
  effectField: (effect, field) => `${effect}: ${field}`,

  themePanel: {
    groups: {
      base: "Base",
      colours: "Colores",
      fonts: "Fuentes",
      type: "Tipografía",
      spacing: "Espaciado",
      shapes: "Formas y líneas",
      icons: "Iconos",
      frame: "Marco",
      motion: "Movimiento",
      canvas: "Lienzo",
    },
    tokens: {
      extends: "Extiende",
      font: "Fuente del texto",
      mono: "Fuente del código",
      flowDuration: "Partículas (ms)",
      dashDuration: "Trazo en movimiento (ms)",
      pulseDuration: "Pulso (ms)",
      traceDuration: "Recorrido (ms)",
      selection: "Selección",
      guide: "Guías",
    },
  },

  sequence: {
    fields: {
      spaceBefore: "Espacio antes",
      gapBefore: "Separación antes",
      message: "Mensaje",
      text: "Texto",
      position: "Posición",
      over: "Sobre",
      of: "De",
      operator: "Operador",
      condition: "Condición",
      participant: "Participante",
      numberFrom: "Numerar los mensajes desde",
    },
    branchCondition: (keyword, branch) => `Condición (${keyword ?? "rama"} ${branch})`,
    reasons: {
      selectEvent: "Selecciona un mensaje, una nota, un fragmento o un evento.",
      selectMessage: "Selecciona el mensaje tras el cual el participante está activo.",
      addParticipant: "Agrega primero un participante.",
      pixels: "Escribe un número de píxeles, 0 o más.",
      messageKind: "Un mensaje es `call`, `reply` o `async`.",
    },
  },

  written: {
    divider: "Separador",
    condition: "Condición",
  },

  c4: {
    fields: {
      entity: "Entidad",
      localLabel: "Etiqueta en esta vista",
      modelLabel: "Etiqueta del modelo",
      technology: "Tecnología",
      external: "Externo",
      standsFor: "Representa",
      standsForLifted: "Representa (elevada)",
      level: "Nivel",
      scope: "Ámbito",
      model: "Modelo",
      modelFile: "Archivo del modelo",
    },
    kinds: {
      person: "persona",
      system: "sistema de software",
      container: "contenedor",
      datastore: "contenedor",
      component: "componente",
    },
    externalKinds: {
      person: "persona externa",
      system: "sistema de software externo",
      container: "contenedor externo",
      datastore: "contenedor externo",
      component: "componente externo",
    },
    reconnectCombination: (key, sources) =>
      `${code(key)} representa a ${sources.map(code).join(", ")}; cámbialas en el modelo.`,
    tools: {
      person: "Persona",
      system: "Sistema de software",
      container: "Contenedor",
      datastore: "Almacén de datos",
      component: "Componente",
    },
    kindNotDrawn: (kind, kinds) =>
      `Esta vista no dibuja ${code(kind)}; dibuja ${kinds.map(code).join(", ")}.`,
  },

  reasons: {
    noDiagram: (id) => `No hay ningún diagrama ${code(id)}.`,
    notInDiagram: (id, diagram) => `${code(id)} no está en el diagrama ${code(diagram)}.`,
    source: "Escribe el icono o la ruta de la imagen.",
    ports: "Escribe los puertos como `name side [n%]`, separados por comas.",
    number: "Escribe un número.",
    positive: "Escribe un número positivo.",
    percentage: "Escribe un porcentaje de 0 a 100.",
    between: (min, max) => `Escribe un número de ${min} a ${max}.`,
    wordOrBetween: (words, min, max) =>
      `Escribe ${words.map(code).join(" o ")} o un número de ${min} a ${max}.`,
    canvasChoice: (choices) => `El lienzo es uno de ${choices.map(code).join(", ")}.`,
    notFragment: "El portapapeles no contiene un fragmento de Meltemi Diagrams.",
  },

  named: (ids) =>
    ids.length === 1 ? `Se nombró ${code(ids[0]!)}.` : `Se nombraron ${list("es", ids.map(code))}.`,

  session: {
    noDiagramStories: "No hay ningún diagrama en este archivo: reproduce una de sus historias.",
    noDiagram:
      "No hay ningún diagrama que dibujar: agrega `diagram <id>: flow { }`, `diagram <id>: free { }` o `diagram <id>: sequence { }` al archivo.",
    cannotDraw: "No se puede dibujar el diagrama.",
    copied: "Copiado.",
    invalidId: (id) => `${code(id)} no es un id válido.`,
    notInProject:
      "Este archivo no está en un proyecto: crea el tema en el archivo o agrega un project.json.",
    builtInTheme:
      "El diagrama usa un tema integrado; crea un tema a partir de él para cambiar sus tokens.",
    storyNotDrawn: (story) =>
      `La historia ${code(story)} muestra un diagrama que no se puede dibujar; corrígelo primero en el texto.`,
    textChanged: "El texto cambió mientras editabas; el lienzo lo muestra de nuevo.",
    fixFirst: "Corrige los problemas del diagrama antes de editarlo en el lienzo.",
    scenario:
      "El lienzo muestra la vista previa de un escenario; elige “Todos los eventos” para editar el diagrama.",
    deleting: (count) => `Eliminar también quita ${statements(count)}.`,
    removingFromView: (count) => `Quitar de la vista también quita ${statements(count)}.`,
    convert: "Solo los diagramas de flujo que se dibujan se pueden convertir en composición libre.",
    cannotArrange: (problem) =>
      `Corrige los problemas del diagrama antes de organizarlo: ${problem}`,
    container: (id, children) =>
      children.length === 0
        ? `${code(id)} es ahora un contenedor.`
        : `${code(id)} es ahora un contenedor con ${list("es", children.map(code))}.`,
    stackedOn: (inner, outer) =>
      `${code(inner)} queda apilado sobre ${code(outer)}; convierte ${code(outer)} en contenedor para moverlos juntos.`,
    noIconTarget:
      "Los iconos van en nodos, decisiones, almacenes de datos y cajas; selecciona uno de ellos.",
  },

  c4Refused: {
    group:
      "El límite de una vista es su ámbito; los grupos pertenecen a los sistemas y contenedores del modelo.",
    ungroup: "El límite de una vista es su ámbito; cambia el ámbito en las propiedades.",
    reorder: "Las vistas C4 dibujan las entidades del modelo en su orden.",
    convert: "Solo los diagramas de flujo se convierten en composición libre.",
    addLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    renameLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    removeLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    moveLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    setLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    "move.parent":
      "Los elementos de una vista están donde sus entidades están en el modelo; muévelos entre sistemas y contenedores en el texto del modelo.",
    "connect.twoWay": "Las relaciones de las vistas C4 van en un solo sentido: `->`.",
  },

  layers: {
    notHere: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    noLayer: (layer) => `No hay ninguna capa ${code(layer)} sobre la que actuar.`,
    noMove: "Esa capa ya está en el extremo.",
  },

  sequenceRefused: {
    resize: "Los participantes de una secuencia toman el tamaño de su etiqueta.",
    setVia: "Los mensajes de una secuencia van en línea recta entre las líneas de vida.",
    setEnd:
      "Los mensajes de una secuencia no tienen puertos; cambia sus participantes en el inspector.",
    align:
      "Los diagramas de secuencia mantienen sus columnas y filas; arrastra los participantes para reordenarlos.",
    distribute: "Los diagramas de secuencia mantienen sus columnas y filas; usa `gap` y `space`.",
    arrange: "Los diagramas de secuencia se organizan según el orden de los eventos.",
    reorder: "Los diagramas de secuencia dibujan todo en orden; no hay orden de apilamiento.",
    convert: "Solo los diagramas de flujo se convierten en composición libre.",
    addLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    renameLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    removeLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    moveLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    setLayer: "Las capas pertenecen a los diagramas de flujo y a las composiciones libres.",
    paste: "Pega texto en el editor para copiar eventos de un diagrama de secuencia.",
    duplicate: "Copia y pega los eventos de un diagrama de secuencia en el editor de texto.",
    "move.parent":
      "Los participantes de una secuencia no se mueven entre grupos; arrástralos hacia los lados para reordenarlos.",
    "create.shape":
      "Los participantes de una secuencia dibujan su propia forma; las formas son para las cajas libres y los nodos de flujo.",
  },

  exports: {
    storyNotDrawn: (id) => `${code(id)} muestra un diagrama que no se puede dibujar.`,
    nothingToDraw: (id) => `${code(id)} no tiene nada que dibujar.`,
    cannotDraw: (id) => `No se puede dibujar ${code(id)}.`,
    notices: {
      defaultDuration: (id, ms) =>
        `Los efectos de ${code(id)} se repiten indefinidamente: el video dura ${seconds("es", ms)}, una vuelta de todos ellos.`,
      longestDuration: (id, ms) =>
        `Los efectos de ${code(id)} se repiten indefinidamente: el video dura ${seconds("es", ms)}, su ciclo más largo.`,
      stillDuration: (id, ms) =>
        `${code(id)} no tiene efectos que se muevan: el video dura ${seconds("es", ms)}.`,
      mp4Background: "MP4 no admite transparencia: se usó el fondo del tema.",
      clamped: (width, height, limit) =>
        `Hecho a ${width} × ${height} píxeles, lo más grande que cabe en el límite de ${limit} por lado.`,
    },
    profileProblems: "el perfil tiene problemas; corrígelos primero.",
    notExportable: (name) => `${code(name)} no es un diagrama ni una historia que exportar.`,
  },

  catalog: {
    hasErrors: "tiene errores",
    cannotDraw: "no se puede dibujar",
    storyNotDrawn: "muestra un diagrama que no se puede dibujar",
    excluded: (story, view) =>
      `${story} muestra ${view}, que está excluido; la historia lo dibuja de todos modos.`,
  },

  addIcons: {
    prefixEmpty: "Dale un prefijo al paquete.",
    prefixInvalid: (prefix) =>
      `${code(prefix)} no es un prefijo de paquete: usa minúsculas, dígitos y guiones.`,
    prefixBuiltIn: (prefix) => `${code(prefix)} es un paquete integrado; elige otro prefijo.`,
    prefixAlias: (prefix, target) =>
      `${code(prefix)} es un alias de ${code(target)} en project.json; elige otro prefijo.`,
    prefixPlugin: (prefix) => `${code(prefix)} es el paquete de un plugin; elige otro prefijo.`,
    prefixIconify: (prefix, file) =>
      `${code(prefix)} es el archivo de Iconify ${code(file)}; agrega los iconos allí, o elige otro prefijo.`,
    nameEmpty: "Dale al icono un nombre de letras o dígitos.",
    nameInvalid: (name) =>
      `${code(name)} no se puede escribir en una referencia: usa letras, dígitos, \`_\`, \`.\` y \`-\`.`,
    nameTaken: (reference) => `${code(reference)} ya existe; elige otro nombre.`,
    nameTwice: (name) => `Dos iconos se llaman ${code(name)}.`,
    notSvg: "Este archivo no es un icono SVG.",
    unsafe: (reason) => `Rechazado: ${reason}`,
    licenceMissing: "Elige la licencia del paquete nuevo.",
    licenceInvalid: (licence) =>
      `${code(licence)} no es un identificador SPDX ni un nombre \`LicenseRef-\`.`,
    needsProject:
      "Los iconos se agregan a un proyecto: abre el archivo en la carpeta de su proyecto.",
    added: (references) => `Se agregó ${references.map(code).join(", ")} al proyecto.`,
  },

  projects: {
    noManifest: "Este archivo no está en un proyecto: no hay project.json.",
    themeExists: (id) => `${code(`themes/${id}.meltemi`)} ya existe; elige otro id.`,
    unreadableManifest: "No se puede leer project.json; corrígelo primero.",
    notAFile: (path) => `${code(path)} no es un archivo del proyecto.`,
    staleStep: "Los pasos cambian dos veces un archivo; pídelo otra vez.",
    fileExists: (path) => `${code(path)} ya existe; no se escribió nada.`,
    unreadableJson: (path, reason) =>
      `No se puede cambiar ${code(path)} (${reason}); corrígelo primero.`,
  },
};
