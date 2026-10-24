import { list, plural } from "@meltemi/diagrams-i18n";
import { accountPanel } from "./account-panel-es.js";
import { cloud } from "./cloud-es.js";
import { explorer } from "./explorer-es.js";
import { presence } from "./cloud-presence-es.js";
import { viewing } from "./cloud-view-es.js";
import type { en } from "./en.js";

const counts = (errors: number, warnings: number) =>
  `${errors} ${plural("es", errors, { one: "error", other: "errores" })}, ${warnings} ${plural("es", warnings, { one: "advertencia", other: "advertencias" })}`;

/** The playground's words in Spanish, entry for entry as in `en.ts`. */
export const es: typeof en = {
  page: {
    title: "Playground de Meltemi Diagrams",
    description:
      "Playground de Meltemi Diagrams: escribe diagramas como código, ajústalos en un lienzo y expórtalos, en tu navegador. Sin necesidad de cuenta.",
    loading: "Cargando el playground…",
    failed: (reason) => `El playground no pudo iniciarse: ${reason}`,
    templatesUnreadable: (status) => `No se pudieron leer las plantillas (${status}).`,
  },

  header: {
    tag: "Playground",
    actions: "Playground",
    open: "Abrir",
    openTitle: "Abrir archivos o el .zip de un proyecto",
    import: "Importar",
    importTitle: "Importar Mermaid o PlantUML",
    undo: "Deshacer",
    redo: "Rehacer",
    format: "Dar formato al archivo (Mayús+Alt+F)",
    share: "Compartir",
    shareTitle: "Copiar un enlace al proyecto",
    export: "Exportar",
    exportTitle: "Exportar imágenes, reproductores y videos",
    download: "Descargar",
    theme: "Cambiar entre claro y oscuro",
    about: "Acerca del playground",
    views: "Vista",
    code: "Código",
    canvas: "Lienzo",
  },

  language: {
    menu: "Idioma",
    button: (name) => `Idioma: ${name}`,
    auto: "Automático",
    autoDetail: (browser) => `Sigue al navegador: ${browser === "es" ? "español" : "inglés"}`,
    unavailable:
      "No se puede cambiar el idioma: este navegador no guarda el proyecto ni los ajustes entre visitas. Descarga el proyecto para conservarlo.",
    confirmTitle: "¿Cambiar el idioma?",
    confirmMessage: (images) =>
      `La página se vuelve a cargar en el nuevo idioma. El navegador no guarda las imágenes grandes, así que tendrás que volver a agregar ${list("es", images)}.`,
    confirm: "Cambiar el idioma",
  },

  account: {
    signIn: "Iniciar sesión",
    signInTitle: "Inicia sesión con tu cuenta de Meltemi",
    button: (name) => `Cuenta: ${name}`,
    menu: "Cuenta",
    account: "Cuenta",
    tokens: "Tokens de API",
    signOut: "Cerrar sesión",
  },

  tokens: {
    title: "Tokens de API",
    intro:
      "Un token permite que la línea de comandos y tus scripts actúen como tú. Guárdalo con el mismo cuidado que una contraseña; puedes revocarlo aquí cuando quieras.",
    loading: "Cargando tus tokens…",
    listLabel: "Tus tokens",
    none: "Todavía no tienes tokens de API.",
    count: (held, most) => `${held} de ${most} tokens`,
    createdAt: (when) => `Creado el ${when}`,
    lastUsedAt: (when) => `Último uso: ${when}`,
    neverUsed: "Nunca se ha usado",
    revoke: "Revocar",
    revokeToken: (name) => `Revocar el token ${name}`,
    revokeTitle: "¿Revocar el token?",
    revokeMessage: (name) =>
      `Todo lo que use el token ${name} dejará de funcionar al instante. No se puede deshacer.`,
    revokeConfirm: "Revocar el token",
    revoked: (name) => `Se revocó el token ${name}.`,
    alreadyGone: "Ese token ya estaba revocado.",
    createTitle: "Crear un token",
    name: "Nombre",
    nameHint: "Para qué sirve el token, por ejemplo mi equipo o CI.",
    create: "Crear",
    creating: "Creando el token…",
    made: (name) => `Se creó el token ${name}.`,
    copyNow: (name) => `Copia el token ${name} ahora: no se volverá a mostrar.`,
    tokenLabel: "Token de API",
    copy: "Copiar el token",
    copied: "Se copió el token.",
    selectIt: "Selecciona el token y cópialo.",
    needName: "Escribe un nombre para el token.",
    nameTooLong: (most) => `El nombre admite como máximo ${most} caracteres.`,
    nameControl: "El nombre no puede contener caracteres de control.",
    tryAgain: "Intentarlo de nuevo",
    unreachable: "No se pudo contactar con el servicio. Revisa la conexión e inténtalo de nuevo.",
    unexpected: "El servicio respondió algo que la página no puede leer.",
    signedOut: "La sesión ya no está iniciada. Vuelve a cargar la página e inicia sesión de nuevo.",
    quota: (most) =>
      `Una cuenta admite como máximo ${most} tokens. Revoca alguno que ya no uses y crea este.`,
    failed: (message, code) => `${message} (${code})`,
    failedStatus: (status) => `El servicio respondió con el estado ${status}.`,
  },

  status: {
    privacy: "Se ejecuta en tu navegador; nada de lo que escribes se envía a ningún sitio.",
  },

  templates: {
    titles: {
      flow: "Diagrama de flujo",
      c4: "Modelo C4",
      sequence: "Diagrama de secuencia",
      free: "Diapositiva",
      purchase: "Ejemplo de compra",
    },
    contents: (counts) =>
      counts
        .map(([kind, n]) => {
          const [one, other] = {
            models: ["modelo", "modelos"],
            views: ["vista", "vistas"],
            diagrams: ["diagrama", "diagramas"],
            stories: ["historia", "historias"],
          }[kind];
          return `${n} ${plural("es", n, { one: one!, other: other! })}`;
        })
        .join(" · "),
    descriptions: {
      flow: "Un diagrama de flujo para empezar",
      c4: "Un modelo de arquitectura con una vista de contexto y una vista de contenedores",
      sequence: "Un diagrama de secuencia con un escenario para cada resultado",
      free: "Una diapositiva de composición libre: texto, cajas, un icono y un grupo",
      purchase:
        "El ejemplo de referencia: un modelo, sus vistas C4, una secuencia de pago, una diapositiva ejecutiva, una historia animada y perfiles de exportación",
    },
    confirmTitle: "¿Abrir la plantilla?",
    confirmMessage: (name) =>
      `La plantilla ${name} reemplaza el proyecto. Tu trabajo se guarda como el proyecto anterior, que el panel Proyectos restaura.`,
    confirm: "Abrir la plantilla",
    restored: "Se restauró el proyecto anterior.",
  },

  download: {
    source: "Archivo fuente",
    noFile: "Ningún archivo",
    project: "Proyecto (.zip)",
    projectDetail: "Todos los archivos, para la CLI y VS Code",
    model: "JSON del modelo",
    modelDetail: "Como lo escribe meltemi-diagrams convert",
    catalog: "Catálogo (HTML)",
    catalogDetail: "Todos los diagramas e historias, sin conexión",
    continue: "Continuar localmente…",
    continueDetail: "La CLI y la extensión de VS Code",
    downloaded: (name) => `Se descargó ${name}.`,
    projectDownloaded: (name) =>
      `Se descargó ${name}. Extráelo y ejecuta meltemi-diagrams validate en la carpeta.`,
    building: "Generando el catálogo…",
    catalogDownloaded: (name, entries, skipped) =>
      `Se descargó ${name}: ${entries} ${plural("es", entries, { one: "entrada", other: "entradas" })}.${skipped > 0 ? ` ${skipped} ${plural("es", skipped, { one: "no se pudo dibujar y quedó fuera", other: "no se pudieron dibujar y quedaron fuera" })}.` : ""}`,
  },

  project: {
    largeImages: (paths) => `No se guardaron las imágenes grandes: ${list("es", paths)}.`,
    openedShared:
      "Se abrió el proyecto compartido. Puedes restaurar tu trabajo anterior desde el panel Proyectos.",
    linkUnreadable: "No se pudo leer el enlace.",
    workUnchanged: (reason) => `${reason} Tu trabajo sigue como estaba.`,
    noRoom:
      "El navegador no tiene espacio para guardar este proyecto; descárgalo para conservarlo.",
    noStorage:
      "Este navegador no guarda los datos de las páginas; descarga el proyecto para conservarlo.",
    kept: "Guardado en este navegador.",
    keptHere: "Guardado en este navegador. Descarga el proyecto para conservarlo en otro lugar.",
    archiveUnreadable: (name) => `No se pudo leer ${name}.`,
    noneOpenable: "Ninguno de los archivos se puede abrir en el playground.",
    replaceTitle: "¿Reemplazar archivos?",
    replaceMessage: (paths) =>
      `Se ${plural("es", paths.length, { one: "reemplazará", other: "reemplazarán" })} ${list("es", paths)}.`,
    replace: "Reemplazar",
    added: (paths) =>
      `Se ${plural("es", paths.length, { one: "agregó", other: "agregaron" })} ${list("es", paths)}.`,
  },

  files: {
    preview: (path, kilobytes, name) =>
      `${path} · ${kilobytes} KB · las imágenes las usan los diagramas que están junto a ellas, por ejemplo, image "${name}".`,
    noFile: "ningún archivo",
  },

  code: {
    help: "Tab aplica sangría; presiona Escape y luego Tab para salir. Ctrl+Espacio sugiere, Ctrl+Punto ofrece correcciones, Mayús+Alt+F da formato, F2 cambia el nombre y F12 va a la definición.",
    width: "Ancho del código",
    show: "Mostrar el código (Ctrl+J)",
    hide: "Ocultar el código (Ctrl+J)",
    source: "Código fuente",
    sourceOf: (file) => `Código fuente de ${file}`,
    suggestions: "Sugerencias",
    quickFixes: "Correcciones rápidas",
    newName: "Nuevo nombre",
    noSuggestions: "No hay sugerencias aquí.",
    noFixes: "No hay correcciones rápidas aquí.",
    giveName: "Escribe un nombre nuevo.",
    syntaxErrors: "El archivo tiene errores de sintaxis; corrígelos para darle formato.",
    alreadyFormatted: "El archivo ya tiene formato.",
    formatted: "Se dio formato al archivo.",
    notAnalysed: "No se puede analizar el archivo.",
    noDefinition: "No hay ninguna definición aquí.",
    nothingToUndo: "No hay nada que deshacer en este archivo.",
    nothingToRedo: "No hay nada que rehacer en este archivo.",
    noModel: "Muestra una vista C4 cuyo modelo se resuelva para abrir el modelo.",
  },

  problems: {
    title: "Problemas",
    none: "Sin problemas",
    summary: (errors, warnings) => `Problemas: ${counts(errors, warnings)}`,
    counts,
    where: (code, line, column) => `${code} · línea ${line}:${column}`,
    others: "Otros archivos",
  },

  dialog: {
    cancel: "Cancelar",
    ok: "Aceptar",
    close: "Cerrar",
  },

  import: {
    title: "Importar Mermaid o PlantUML",
    intro:
      "Pega un diagrama de Mermaid (de flujo, de secuencia, C4, de arquitectura o de bloques), de PlantUML (de componentes, de despliegue, de casos de uso, de secuencia, C4) o Markdown con bloques de diagramas. La importación se convierte en un archivo nuevo, con la lista de lo que no pudo conservar.",
    placeholder: "flowchart LR\n  shop[Tienda] --> orders[(Pedidos)]",
    source: "Código fuente",
    name: "Nombre del nuevo archivo",
    chooseFile: "Elegir un archivo…",
    import: "Importar",
    empty: "Pega un diagrama o elige primero un archivo.",
    nothing: "No se pudo importar nada.",
    finding: (line, message, code) => `Línea ${line}: ${message} (${code})`,
    imported: (format, path, status, findings) =>
      `Se importó ${format} en ${path}: ${status}${findings ? `, ${findings} ${plural("es", findings, { one: "hallazgo", other: "hallazgos" })}` : ""}.`,
    importedInto: (path, status) => `Se importó en ${path} (${status}).`,
    downloadReport: "Descargar el informe",
    report: {
      title: (name) => `# Importación de ${name}`,
      format: (format, status) => `Formato: ${format ?? "desconocido"} · estado: ${status}`,
      diagram: (id, type, from, coverage) =>
        `- \`${id}\` (${type}, desde ${from})${coverage ? `: ${coverage.mapped} ${plural("es", coverage.mapped, { one: "convertido", other: "convertidos" })}, ${coverage.approximated} ${plural("es", coverage.approximated, { one: "aproximado", other: "aproximados" })}, ${coverage.dropped} ${plural("es", coverage.dropped, { one: "descartado", other: "descartados" })}` : ""}`,
      findings: "## Hallazgos",
      finding: (line, severity, code, message) =>
        `- línea ${line}: ${severity} \`${code}\` ${message}`,
    },
  },

  share: {
    title: "Compartir el proyecto",
    link: "Enlace",
    linkLabel: "Enlace al proyecto",
    holds: (files, bytes) =>
      `El enlace contiene ${files} ${plural("es", files, { one: "archivo de texto", other: "archivos de texto" })} del proyecto (${(bytes / 1024).toFixed(1).replace(".", ",")} KB). Va en la parte de la dirección que sigue a #, que los navegadores nunca envían a un servidor.`,
    images: (paths) =>
      `Las imágenes no viajan en los enlaces: ${list("es", paths)}. Descarga el proyecto para compartirlas.`,
    long: "El enlace es largo; algunos programas de chat y de correo cortan los enlaces largos. Si no se abre, descarga el proyecto.",
    copy: "Copiar el enlace",
    copied: "Se copió el enlace.",
    copiedStatus: "Se copió el enlace al proyecto.",
    selectIt: "Selecciona el enlace y cópialo.",
    damaged: "El enlace está dañado.",
    tooLarge: "El proyecto del enlace supera los 4 MiB; no se abre.",
    otherVersion: "El enlace se hizo con otra versión del playground.",
    tooMany: (files, most) => `El enlace contiene ${files} archivos; como máximo, ${most}.`,
    unopenable: (path) => `El enlace contiene un archivo que no se puede abrir: ${path}`,
  },

  about: {
    title: "Acerca del playground",
    loading: "Cargando la lista de componentes…",
    unreadable: "No se pudo leer la lista; consulta NOTICES.md.",
    text: (version) =>
      `**Meltemi Diagrams ${version}**: diagramas como código, un lienzo para componerlos y exportaciones para documentos, diapositivas y video.\n\nEl playground se ejecuta por completo en tu navegador. No hay cuenta, nada de lo que escribes se envía a ningún sitio y tu trabajo se queda en este navegador hasta que lo descargas.\n\nMeltemi Diagrams tiene licencia MIT. El playground incluye los componentes siguientes con sus propias licencias: las fuentes con la SIL Open Font License 1.1, elkjs con la Eclipse Public License 2.0 (código fuente en github.com/kieler/elkjs) y los demás según se indica.`,
    notices: "Leer todas las licencias (NOTICES.md)",
  },

  continue: {
    title: "Continuar localmente",
    text: (folder) =>
      `Descarga el proyecto y extráelo en una carpeta llamada ${folder}. Es un proyecto normal: Git guarda su historial, la línea de comandos lo valida y lo exporta, y la extensión de VS Code (Meltemi Diagrams) lo edita con el mismo lienzo.`,
    download: "Descargar el proyecto (.zip)",
    install: "Instalar la línea de comandos",
    validate: "Comprobar el proyecto",
    export: "Exportar todos los perfiles",
    catalog: "Generar el catálogo",
    init: "Empezar un proyecto nuevo a partir de una plantilla",
  },

  exports: {
    title: "Exportar",
    export: "Exportar",
    what: "Qué",
    format: "Formato",
    theme: "Tema",
    language: "Idioma",
    languageHint:
      "Las palabras que la herramienta agrega a la imagen o a la página, como las líneas de tipo de las vistas C4 y los controles del reproductor.",
    formats: {
      svg: "Imagen SVG",
      png: "Imagen PNG",
      pdf: "PDF (imprimir en PDF)",
      html: "Reproductor HTML",
      gif: "Animación GIF",
      webm: "Video WebM",
      mp4: "Video MP4",
    },
    diagram: (id, title) => `Diagrama ${id}${title ? ` · ${title}` : ""}`,
    story: (id, title) => `Historia ${id}${title ? ` · ${title}` : ""}`,
    ownTheme: "El tema del diagrama",
    everyMessage: "Todos los mensajes",
    fontPolicies: {
      embedded: "Incrustadas (la imagen lleva sus fuentes)",
      outlined: "En contornos (el texto como formas)",
      system: "Del sistema (solo los nombres)",
    },
    motions: {
      static: "Estático",
      animated: "Animado (efectos CSS)",
    },
    atPlaceholder: "por ejemplo, 1.5s",
    sizePlaceholder: "el de la imagen, por ejemplo, 1920x1080",
    backgroundPlaceholder: "el del tema; transparent, un token o un color",
    durationPlaceholder: "la de la historia o la de los efectos",
    durationStory: (time) => `${time}, lo que dura la historia`,
    durationFinite: (time) => `${time}, cuando terminan los efectos`,
    durationLoop: (time) => `${time}, una vuelta de los efectos`,
    webmBackground:
      "Este navegador graba WebM sin transparencia: se usó el fondo del tema; la línea de comandos la conserva (meltemi-diagrams export --format webm --background transparent).",
    durationLongest: (time) => `${time}, el ciclo más largo de los efectos`,
    durationStill: (time) => `${time}, sin efectos que se muevan`,
    scenario: "Escenario",
    fonts: "Fuentes",
    effects: "Efectos",
    instant: "Instante",
    instantHint: "Dibuja la imagen en este momento de los efectos o de la historia.",
    scale: "Escala",
    scaleHint: "Píxeles por punto, de 1 a 8.",
    size: "Tamaño",
    sizeHint: "Ancho × alto; la imagen se ajusta y se centra.",
    background: "Fondo",
    link: "Enlace",
    linkHint: "Toda la imagen enlaza a esta dirección.",
    embed: "Un fragmento para pegar en una página",
    autoplay: "Se reproduce al abrirse",
    loop: "Se repite en bucle",
    fps: "Fotogramas por segundo",
    duration: "Duración",
    commandLine: (reason, format) =>
      `${reason} La línea de comandos lo genera: meltemi-diagrams export --format ${format}.`,
    pdfHint:
      'PDF abre el diálogo de impresión del navegador; elige "Guardar como PDF" para conservar la imagen como vectores.',
    profiles: "Perfiles del archivo",
    profilesHint:
      "Cada uno genera la salida que describe su bloque export, como lo hace meltemi-diagrams export --profile.",
    profile: (format, target) => `${format} de ${target}`,
    exportProfile: (id) => `Exportar el perfil ${id}`,
    catalog: "Catálogo del proyecto",
    catalogHint:
      "Todos los diagramas e historias del proyecto en una página que funciona sin conexión, como la escribe meltemi-diagrams build catalog.",
    exportCatalog: "Exportar el catálogo del proyecto",
    drawing: "Dibujando los fotogramas…",
    frame: (done, total) => `Fotograma ${done} de ${total}`,
    downloaded: (name) => `Se descargó ${name}.`,
    downloadedVideo: (name, width, height, fps) =>
      `Se descargó ${name} (${width} × ${height}, ${fps} fps).`,
    printing: (name) =>
      `El diálogo de impresión muestra ${name}; elige "Guardar como PDF" para conservarlo como vectores.`,
    cancelled: "Se canceló la exportación.",
    openSource: "Abre un archivo .meltemi para exportarlo.",
    nothingToDraw:
      "El archivo no tiene ningún diagrama que se pueda dibujar; corrige primero sus problemas.",
    noStory: (id) => `No hay ninguna historia llamada ${id}.`,
    noDiagram: (id) => `No hay ningún diagrama llamado ${id}.`,
    badInstant: (value) => `El instante admite un tiempo como 600ms o 1.5s, no "${value}".`,
    badScale: "La escala admite de 1 a 8.",
    badSize: (most) => `El tamaño admite ANCHOxALTO de 16 a ${most}, por ejemplo, 1920x1080.`,
    badBackground: "El fondo admite transparent, un token de color o un color CSS.",
    badLink: "El enlace admite una dirección https:, http: o mailto:, o una relativa.",
    badFps: "Fotogramas por segundo admite un número entero de 1 a 60.",
    badDuration: "La duración admite un tiempo de hasta 600s, por ejemplo, 5s.",
    profileGone: (id) => `El perfil ${id} ya no existe.`,
    playerUnreadable: "No se pudo leer el entorno de ejecución del reproductor.",
    printTitle: "Imagen para imprimir",
  },

  video: {
    noEncoder: "Este navegador no tiene un codificador de video (WebCodecs).",
    vp: "VP9 o VP8",
    cannotEncode: (codec) => `Este navegador no puede codificar video ${codec}.`,
    commandLineCan: (codec, format) =>
      `Este navegador no puede codificar video ${codec}; la línea de comandos sí puede (meltemi-diagrams export --format ${format}).`,
    transparent:
      "El video transparente lo genera la línea de comandos (meltemi-diagrams export --format webm --background transparent).",
    noDecoderConfig:
      "El codificador H.264 del navegador no dio una configuración de decodificador.",
    pictureFailed: "El navegador no pudo generar la imagen.",
    mp4TooLarge: "El video es demasiado grande para este generador de MP4.",
    webmTooLarge: "El video es demasiado grande para WebM.",
  },

  archive: {
    tooLarge: "El contenido supera el tamaño permitido.",
    notZip: "El archivo no es un ZIP.",
    tooMany: (files, most) =>
      `El archivo comprimido contiene ${files} archivos; se leen como máximo ${most}.`,
    directoryDamaged: "El directorio del archivo comprimido está dañado.",
    encrypted: (name) => `${name} está cifrado.`,
    filesTooLarge: "El contenido del archivo comprimido supera el tamaño permitido.",
    damaged: (name) => `${name} está dañado.`,
    compression: (name) => `${name} usa una compresión que esta página no lee.`,
  },

  studio: {
    noFiles: "El proyecto no tiene archivos; agrega uno o abre una plantilla.",
    manifest: "project.json describe el proyecto; abre un archivo .meltemi para ver sus diagramas.",
    openSource: "Abre un archivo .meltemi para ver sus diagramas.",
    stale: "El texto cambió; el lienzo lo vuelve a mostrar.",
    themeCreated: (theme) =>
      `Se creó el tema \`${theme}\` del proyecto en themes/${theme}.meltemi.`,
    notInProject: (file) => `\`${file}\` no es un archivo del proyecto.`,
    filesChanged: (files) => `Cambios en ${files.join(", ")}.`,
  },

  explorer,
  cloud,
  viewing,
  presence,
  accountPanel,
};
