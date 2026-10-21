import { list, plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** The files a command wrote, by name. */
const wrote = (names: readonly string[]) =>
  names.length === 1 ? `Se escribió ${names[0]}.` : `Se escribieron ${list("es", names)}.`;

/** The words of the extension at run time, in Spanish. */
export const es: typeof en = {
  common: {
    openMeltemiFirst: "Abre primero un archivo .meltemi.",
    saveBeforeExporting: "Guarda el archivo antes de exportarlo.",
    noDiagramToExport: "El archivo no tiene ningún diagrama que exportar.",
    showProblems: "Mostrar los problemas",
    wrote,
  },
  canvas: {
    title: "Lienzo de Meltemi",
    textChanged: "El texto cambió; el lienzo lo muestra de nuevo.",
    saveBeforeImages: "Guarda el archivo antes de agregarle imágenes.",
    saveBeforeProjectThemes:
      "Guarda el archivo en un proyecto antes de editar los temas del proyecto.",
    projectNotWritten: "No se pudieron escribir los archivos del proyecto.",
    themeCreated: (theme) =>
      `Se creó el tema \`${theme}\` del proyecto en themes/${theme}.meltemi.`,
    fileNotChanged: (file) => `No se pudo cambiar ${file}.`,
    themeChanged: (file) => `Se cambió el tema en ${file}.`,
  },
  pickers: {
    useImage: "Usar la imagen",
    images: "Imágenes",
    imageOutside: (root) =>
      `La imagen debe estar dentro de la carpeta del proyecto (${root}); cópiala allí primero.`,
  },
  exports: {
    allEvents: "Todos los eventos",
    allEventsDetail: "cada rama y una pasada por cada bucle",
    exportDiagram: (diagram) => `Exportar ${diagram}`,
    scenarioPlaceholder: "Exportar todos los eventos o un escenario",
    notExported: (skipped, written) =>
      `${skipped.length === 1 ? "No se exportó" : "No se exportaron"} por problemas: ${list("es", skipped)}.${written.length > 0 ? ` ${wrote(written)}` : ""}`,
    player: "Exportar el reproductor HTML",
    playerPlaceholder: "La historia o el diagrama que reproducir",
    story: "Historia",
    diagramAndEffects: "Diagrama y sus efectos",
    nothingToPlay: "El archivo no tiene ninguna historia ni ningún diagrama que exportar.",
    cannotDraw: (id) => `\`${id}\` no se puede dibujar porque tiene problemas.`,
    noBrowser:
      "Las exportaciones PNG y PDF necesitan Edge, Chrome o Chromium instalado; si está en otro lugar, define MELTEMI_BROWSER con el ejecutable del navegador.",
    noFfmpeg:
      "Las exportaciones de video necesitan FFmpeg; instálalo (no viene incluido) o define MELTEMI_FFMPEG con el ejecutable de ffmpeg.",
    recording: (file) => `Grabando ${file}`,
    frame: (done, total) => `fotograma ${done} de ${total}`,
    videoFailed: (reason) => `Falló la exportación del video: ${reason}`,
    exportingWithBrowser: "Exportando con el navegador…",
    failed: (reason) => `Falló la exportación: ${reason}`,
    video: "Exportar video",
    formatPlaceholder: "El formato",
    storyDescription: "historia",
    diagramEffects: (type) => `diagrama ${type} y sus efectos`,
    videoPlaceholder: "La historia o el diagrama",
    durationPrompt: "Los efectos se repiten sin fin (o no hay ninguno); ¿cuánto dura el video?",
    durationInvalid: "Un tiempo como 5s o 2500ms",
    noProfile:
      "El archivo no tiene ningún perfil de exportación; escribe `export <id> for <diagram> { format png }`.",
    allProfiles: "Todos los perfiles",
    profileOf: (format, target) => `${format} de ${target}`,
    profile: "Ejecutar un perfil de exportación",
    profilePlaceholder: "El perfil que escribir",
  },
  catalog: {
    openProjectFirst: "Abre primero un archivo .meltemi o una carpeta de un proyecto.",
    building: "Generando el catálogo",
    failed: (reason) => `No se pudo generar el catálogo: ${reason}`,
    skipped: (file, id, reason) => `Se omitió ${file}#${id}: ${reason}.`,
    empty: "El proyecto no tiene ningún diagrama ni ninguna historia que catalogar.",
    written: (path, diagrams, stories) =>
      `Se escribió ${path} (${diagrams} ${plural("es", diagrams, { one: "diagrama", other: "diagramas" })}, ${stories} ${plural("es", stories, { one: "historia", other: "historias" })}).`,
    openInBrowser: "Abrir en el navegador",
  },
  commands: {
    fixBeforeArranging: "Corrige los problemas del diagrama antes de organizarlo.",
    positionsWritten: "Todas las posiciones ya están escritas.",
    noModelView: "Para abrir el modelo, muestra una vista C4 cuyo modelo se pueda resolver.",
    noFlowDiagram: "Muestra un diagrama de flujo sin problemas para convertirlo.",
  },
  assist: {
    openSettings: "Abrir los ajustes",
    setKey: "Establecer la clave de IA",
    send: "Enviar",
    nothingToChange: (summary) => `Nada que cambiar${summary ? `: ${summary}` : "."}`,
    proposal: (name) => `Propuesta: ${name}`,
    choose: (summary, problems) => `${summary || "Propuesta"}${problems ? " (con problemas)" : ""}`,
    choosePlaceholder: "Elige los cambios que aplicar",
    leftOut: (items) =>
      items.length === 1
        ? `El punto ${items[0]} cambió desde la propuesta y se dejó fuera.`
        : `Los puntos ${list("es", items.map(String))} cambiaron desde la propuesta y se dejaron fuera.`,
    notApplied: (problems) => `No se aplicó la propuesta: ${problems.join("; ")}`,
    openSavedFirst: "Abre primero un archivo .meltemi guardado.",
    modify: "Modificar con IA",
    modifyPrompt:
      "¿Qué debe cambiar? Por ejemplo: agrega una caché entre la API y la base de datos",
    asking: (model) => `Consultando a ${model}`,
    failed: (reason) => `El asistente falló: ${reason}`,
    generate: "Generar un diagrama con IA",
    generatePrompt:
      "Describe el diagrama, por ejemplo: el proceso de compra de una tienda en línea, con pagos",
    startFrom: "Partir de",
    profiles: {
      flow: "Cajas y flechas",
      c4: "Un modelo y sus vistas",
      sequence: "Mensajes en el tiempo",
      free: "Una diapositiva compuesta libremente",
    },
    openProjectFirst: "Abre primero un archivo o una carpeta de un proyecto.",
    commandLine: "la línea de comandos",
    nothingChanged: "No hay cambios desde el último commit.",
    changesSince: (base) => `Cambios desde ${base}`,
    key: "Clave de IA",
    keyPrompt:
      "La clave del proveedor de IA; se guarda en el almacenamiento de secretos de VS Code, nunca en archivos",
    keyStored: "Se guardó la clave de IA.",
    keyRemoved: "Se eliminó la clave de IA.",
  },
  importer: {
    channel: "Importación de Meltemi",
    filter: "Mermaid, PlantUML y Markdown",
    import: "Importar",
    importFile: "Importar desde Mermaid o PlantUML",
    cannotRead: (path, reason) => `No se puede leer ${path}: ${reason}`,
    selectFirst: "Selecciona primero un texto de Mermaid o PlantUML.",
    importSelection: "Importar la selección como diagrama de Meltemi",
    selectionLanguage: "¿En qué lenguaje está escrita la selección?",
    saveSheet: "Guardar la hoja importada",
    nothingImported: (file, reason) => `No se pudo importar nada de ${file}: ${reason}`,
    unknownError: "error desconocido",
    exists: (file) => `${file} ya existe.`,
    mergeOrReplace:
      "Combinar conserva sus posiciones, estilos y demás retoques; Reemplazar vuelve a empezar desde el archivo de origen.",
    merge: "Combinar",
    replace: "Reemplazar",
    partial: (file) => `${file} se importó en parte: algo esencial no se pudo importar.`,
    showFindings: "Mostrar los hallazgos",
    report: (source, target, status) => `Importación de ${source} → ${target}: ${status}`,
    coverage: (diagram, mapped, approximated, dropped) =>
      `${diagram}: ${mapped} ${plural("es", mapped, { one: "convertido", other: "convertidos" })}, ${approximated} ${plural("es", approximated, { one: "aproximado", other: "aproximados" })}, ${dropped} ${plural("es", dropped, { one: "descartado", other: "descartados" })}`,
  },
  problems: {
    hint: (hint) => `Pista: ${hint}`,
  },
};
