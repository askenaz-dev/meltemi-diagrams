import { list, plural } from "@meltemi/diagrams-i18n";
import type { explorer as en } from "./explorer-en.js";

const files = (n: number) => `${n} ${plural("es", n, { one: "archivo", other: "archivos" })}`;

/** The words of the explorer in Spanish, entry for entry as in `explorer-en.ts`. */
export const explorer: typeof en = {
  pane: {
    label: "Explorador",
    files: "Archivos",
    tree: "Archivos del proyecto",
    show: "Mostrar el explorador (Ctrl+B)",
    hide: "Ocultar el explorador (Ctrl+B)",
    width: "Ancho del explorador",
    newDiagram: "Nuevo diagrama…",
    newFolder: "Nueva carpeta…",
    newFile: "Nuevo archivo…",
    collapseAll: "Contraer las carpetas",
    showAll: "Mostrar todos los archivos",
    showAllHint: "También lista project.json, el archivo de bloqueo, las fuentes y otros archivos",
    hiddenProblems: (n) =>
      n === 1 ? "1 archivo oculto tiene problemas" : `${n} archivos ocultos tienen problemas`,
    showHidden: "Mostrar",
    empty: "Aún no hay diagramas.",
    more: (name) => `Más acciones para ${name}`,
    counts: (errors, warnings) =>
      errors > 0
        ? `${errors} ${plural("es", errors, { one: "error", other: "errores" })}`
        : `${warnings} ${plural("es", warnings, { one: "advertencia", other: "advertencias" })}`,
    kinds: {
      folder: "Carpeta",
      flow: "Diagrama de flujo",
      free: "Composición libre",
      sequence: "Diagrama de secuencia",
      c4: "Vista C4",
      model: "Modelo",
      story: "Historia",
      theme: "Tema",
      image: "Imagen",
      settings: "Configuración del proyecto",
      file: "Archivo",
    },
  },

  menu: {
    label: (name) => `Acciones para ${name}`,
    root: "Acciones para el proyecto",
    open: "Abrir",
    newDiagram: "Nuevo diagrama…",
    newFolder: "Nueva carpeta…",
    newFile: "Nuevo archivo…",
    rename: "Cambiar el nombre",
    moveTo: "Mover a…",
    duplicate: "Duplicar",
    download: "Descargar",
    delete: "Eliminar",
  },

  actions: {
    newDiagramTitle: "Nuevo diagrama",
    newFolderTitle: "Nueva carpeta",
    newFileTitle: "Nuevo archivo",
    name: "Nombre",
    diagramHint: "El nombre del archivo; el diagrama lo toma como título.",
    folderHint:
      "La carpeta se lista hasta que salgas de la página; se queda en cuanto tiene un diagrama.",
    fileHint: "Como notas.md o datos.json.",
    kind: "Tipo",
    kinds: {
      flow: "Diagrama de flujo",
      free: "Composición libre",
      sequence: "Diagrama de secuencia",
    },
    where: (folder) => (folder === "" ? "En la raíz del proyecto" : `En ${folder}`),
    create: "Crear",
    renameLabel: (name) => `Nuevo nombre para ${name}`,
    moveTitle: (what) => `Mover ${what}`,
    moveMany: (n) => files(n),
    moveTo: "A la carpeta",
    root: "La raíz del proyecto",
    newFolder: "O una carpeta nueva dentro de ella",
    move: "Mover",
    deleteFileTitle: "¿Eliminar el archivo?",
    deleteFile: (path) => `${path} se quita del proyecto. Deshacer no lo recupera.`,
    deleteFolderTitle: "¿Eliminar la carpeta?",
    deleteFolder: (folder, n) =>
      `${folder} y sus ${files(n)} se quitan del proyecto. Deshacer no los recupera.`,
    deleteConfirm: "Eliminar",
    empty: "Ponle un nombre.",
    invalid: "Un nombre no puede empezar con un punto ni llevar /, \\ o :.",
    extension: "Mantén la extensión del archivo.",
    editable: "El playground edita archivos .meltemi, .json y .md.",
    exists: (path) => `${path} ya existe.`,
    itself: "Una carpeta no puede moverse dentro de sí misma.",
    created: (path) => `Se creó ${path}.`,
    madeFolder: (folder) => `Se creó la carpeta ${folder}. Agrega un diagrama para conservarla.`,
    renamed: (from, to) => `Se cambió el nombre de ${from} a ${to}.`,
    moved: (n, folder) =>
      `Se ${n === 1 ? "movió" : "movieron"} ${files(n)} a ${folder === "" ? "la raíz del proyecto" : folder}.`,
    importsFollow: (paths) => ` Se actualizaron las importaciones de ${list("es", paths)}.`,
    importsSkipped: (paths) =>
      ` ${list("es", paths)} no se ${paths.length === 1 ? "pudo" : "pudieron"} leer, así que sus importaciones no cambiaron.`,
    notMoved: (path) => `${path} ya existe; no se movió nada.`,
    duplicated: (path) => `Se hizo una copia: ${path}.`,
    deleted: (path) => `Se eliminó ${path}.`,
    deletedFolder: (folder, n) => `Se eliminó ${folder} con sus ${files(n)}.`,
    downloaded: (name) => `Se descargó ${name}.`,
    added: (paths) => `Se ${paths.length === 1 ? "agregó" : "agregaron"} ${list("es", paths)}.`,
    noneAdded: "Ninguno de los archivos se puede agregar al proyecto.",
  },

  switcher: {
    open: (name) => `Proyectos: ${name} está abierto`,
    rename: "Cambiar el nombre del proyecto",
    renameTitle: "Cambiar el nombre del proyecto",
    renameLabel: "Nombre",
    renamed: (name) => `El proyecto ahora se llama ${name}.`,
    untitled: "Proyecto sin nombre",
    browser: "Este navegador",
    viewOnly: "Solo lectura",
    settingsMissing: "El proyecto no tenía project.json; ahora tiene uno.",
  },

  panel: {
    title: "Proyectos",
    newProject: "Nuevo proyecto…",
    importProject: "Importar proyecto…",
    exportProject: "Exportar proyecto (.zip)",
    saveToCloud: "Guardar este proyecto en la nube",
    settings: "Configuración del proyecto",
    browser: "Este navegador",
    browserHint: "Se guarda solo en este navegador",
    openNow: "Abierto",
    openLocal: (name) => `Abrir ${name}, el proyecto de este navegador`,
    previous: "Proyecto anterior",
    previousHint: "Lo que reemplazó una plantilla, un archivo comprimido o un enlace",
    restore: "Restaurar",
    cloud: "En la nube",
    signInLine:
      "Inicia sesión para guardar proyectos en tu cuenta y abrirlos en cualquier dispositivo.",
    signIn: "Iniciar sesión",
    filter: "Filtrar los proyectos",
    noMatch: "Ningún proyecto coincide.",
    close: "Cerrar",
  },

  newProject: {
    title: "Nuevo proyecto",
    name: "Nombre",
    nameHint: "De 1 a 100 caracteres.",
    templates: "Empezar desde",
    where: "Dónde",
    inCloud: "En tu cuenta",
    inCloudHint: "Se abre en cualquier dispositivo y se puede compartir.",
    inBrowser: "En este navegador",
    inBrowserHint:
      "Reemplaza el proyecto de este navegador; tu trabajo ahí se guarda como el proyecto anterior.",
    create: "Crear el proyecto",
    created: (name) => `Se creó ${name}.`,
  },

  importProject: {
    title: "Importar un proyecto",
    summary: (archive, name, n) =>
      `${archive}: ${name === undefined ? "un proyecto" : `el proyecto ${name}`}, ${files(n)}.`,
    destination: "Adónde va",
    newCloud: "Un proyecto nuevo en tu cuenta",
    newCloudHint: "Se suben sus archivos, imágenes y fuentes, y el proyecto se abre.",
    browser: "Este navegador",
    browserHint:
      "Reemplaza el proyecto de este navegador; tu trabajo ahí se guarda como el proyecto anterior.",
    replace: (name) => `Reemplazar los archivos de ${name}`,
    replaceHint:
      "Cada archivo del proyecto abierto se reemplaza por los del archivo comprimido. Descarga el proyecto antes si quieres una copia.",
    name: "Nombre del proyecto nuevo",
    import: "Importar",
    choose: "Elige el archivo comprimido de un proyecto",
    noFiles: (archive) => `${archive} no contiene ningún archivo de un proyecto.`,
    imported: (archive, n) => `Se importó ${archive}: ${files(n)}.`,
  },
};
