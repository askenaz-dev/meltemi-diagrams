import { list, plural } from "@meltemi/diagrams-i18n";
import type { cloud as en } from "./cloud-en.js";
import { publishing, sharing } from "./cloud-share-es.js";

/** Las palabras de los proyectos en la nube, entrada por entrada como en `cloud-en.ts`. */
export const cloud: typeof en = {
  projects: {
    loading: "Cargando tus proyectos…",
    listLabel: "Tus proyectos",
    none: "Aún no tienes proyectos en la nube. Crea uno, o guarda el proyecto que tienes abierto.",
    count: (held, most) => `${held} de ${most} proyectos`,
    updated: (when) => `Modificado ${when}`,
    neverChanged: "Sin cambios todavía",
    open: (name) => `Abrir ${name}`,
    openNow: "Abierto ahora",
    nameEmpty: "Ponle un nombre al proyecto.",
    nameLong: (most) => `El nombre admite como máximo ${most} caracteres.`,
    nameControl: "El nombre no puede tener caracteres de control.",
    creating: (name) => `Creando ${name}…`,
    created: (name) => `Se creó ${name}.`,

    saveTitle: "Guardar en la nube",
    saveLabel: "Nombre del proyecto en la nube",
    saveName: "Proyecto local",
    saving: (name) => `Guardando ${name} en la nube…`,
    uploading: (path, done, total) => `Subiendo ${path} (${done} de ${total})…`,
    saved: (name) => `Se guardó ${name} en la nube.`,
    openedLocal: "Se abrió el proyecto que guarda este navegador.",

    rename: (name) => `Renombrar ${name}`,
    renameTitle: "Renombrar el proyecto",
    renameLabel: "Nombre nuevo",
    renamed: (name) => `El proyecto ahora se llama ${name}.`,
    duplicate: (name) => `Duplicar ${name}`,
    duplicated: (name) => `Se hizo una copia: ${name}.`,
    delete: (name) => `Eliminar ${name}`,
    deleteTitle: "¿Eliminar el proyecto?",
    deleteMessage: (name) =>
      `${name} se elimina de tu cuenta junto con sus versiones. No se puede deshacer.`,
    deleteConfirm: "Eliminar el proyecto",
    deleted: (name) => `Se eliminó ${name}.`,
    copyLink: (name) => `Copiar el enlace a ${name}`,
    linkTitle: "Enlace al proyecto",
    linkLabel: "Enlace",
    linkHint: "Por ahora solo tú puedes abrirlo. Abre el proyecto en esta página.",
    linkCopied: "Se copió el enlace al proyecto.",
    linkSelect: "Selecciona el enlace y cópialo.",
  },

  usage: {
    label: "Uso",
    storage: (used, most) => `${used} de ${most} usados`,
  },

  versions: {
    button: "Versiones",
    buttonTitle: "Versiones de este proyecto",
    title: "Versiones",
    intro:
      "Una versión conserva los archivos del proyecto tal como están ahora. Ponle nombre a una antes de un cambio arriesgado. Al restaurar una versión, el estado que dejas se conserva como versión automática.",
    close: "Cerrar",
    loading: "Cargando las versiones…",
    listLabel: "Versiones de este proyecto",
    none: "Aún no hay versiones. Nombra esta versión para conservar el proyecto como está.",
    tryAgain: "Reintentar",
    count: (held, most) => `${held} de ${most} versiones`,

    nameTitle: "Nombrar esta versión",
    nameLabel: "Nombre",
    nameHint: (most) =>
      `Hasta ${most} caracteres. Déjalo vacío para conservar una versión sin nombre.`,
    nameButton: "Nombrar esta versión",
    nameLong: (most) => `El nombre admite como máximo ${most} caracteres.`,
    nameControl: "El nombre no puede tener caracteres de control.",
    creating: "Guardando la versión…",
    created: (number, label) =>
      label === null
        ? `Se guardó la versión ${number}.`
        : `Se guardó la versión ${number}: ${label}.`,

    number: (number) => `Versión ${number}`,
    automatic: "Automática",
    unnamed: "Sin nombre",
    changed: (count) =>
      count === 0
        ? "Ningún archivo cambió"
        : `${count} ${plural("es", count, { one: "archivo cambió", other: "archivos cambiaron" })}`,
    changedMore: (count) => `y ${count} más`,

    restore: "Restaurar",
    restoreLabel: (number) => `Restaurar la versión ${number}`,
    restoreTitle: "¿Restaurar esta versión?",
    restoreMessage: (number, when) =>
      `Los archivos del proyecto pasan a ser los de la versión ${number}, del ${when}. El estado que tienes ahora se conserva como versión automática, así que puedes volver a él.`,
    restoreConfirm: "Restaurar la versión",
    restoring: (number) => `Restaurando la versión ${number}…`,
    restored: (number) =>
      `Se restauró la versión ${number}. El estado anterior está en la lista como versión automática.`,
  },

  sharing,
  publishing,

  status: {
    label: "Proyecto en la nube",
    connecting: "Conectando con la nube…",
    connected: "Guardado en la nube",
    saving: "Guardando…",
    reconnecting: (kept) =>
      kept
        ? "Reconectando… tus cambios se conservan en este navegador"
        : "Reconectando… mantén esta página abierta para no perder tus cambios",
    offline: (kept) =>
      kept
        ? "Sin conexión: tus cambios se conservan en este navegador y se sincronizan cuando vuelvas"
        : "Sin conexión: este navegador no puede conservar tus cambios, así que mantén esta página abierta hasta que vuelvas",
    notKept: "Este navegador no conservará el proyecto sin conexión.",
    notKeptShort: "No se conserva sin conexión en este navegador.",
    synced: "De nuevo en línea: tus cambios están guardados.",
    dropped: "Se perdió la conexión. Reconectando…",
    gone: "Eliminado de la nube",
    full: (most) => `Sala llena: ya hay ${most} personas en este proyecto. Reintentando…`,
    retry: "Reintentar",
  },

  errors: {
    unreachable: "No se pudo contactar con el servicio. Revisa la conexión e inténtalo de nuevo.",
    unexpected: "El servicio respondió algo que la página no puede leer.",
    signedOut: "Cerraste la sesión. Vuelve a cargar la página e inicia sesión otra vez.",
    notFound: "No se encontró el proyecto.",
    versionNotFound: "No se encontró esa versión.",
    quotaProjects: (most) =>
      `Tu cuenta admite como máximo ${most} proyectos. Elimina uno que ya no uses e inténtalo de nuevo.`,
    quotaStorage: (mebibytes) =>
      `Tu cuenta usó sus ${mebibytes} MiB de almacenamiento. Elimina un proyecto o un archivo e inténtalo de nuevo.`,
    quotaFiles: (most) => `Un proyecto admite como máximo ${most} archivos.`,
    quotaBinary: (mebibytes) => `Una imagen o una fuente admite como máximo ${mebibytes} MiB.`,
    quotaVersions: (most) =>
      `Un proyecto guarda como máximo ${most} versiones, y este ya está lleno. Las versiones sin nombre se depuran solas; las que tienen nombre se conservan.`,
    docTooLarge: (mebibytes, characters) =>
      `El proyecto supera su límite de tamaño: ${mebibytes} MiB en total y ${characters} caracteres en un archivo.`,
    messageTooLarge: (kibibytes) =>
      `Un solo cambio supera los ${kibibytes} KiB. Hazlo en pasos más pequeños.`,
    pathInvalid:
      "Un nombre de archivo no se admite en un proyecto en la nube: usa una ruta relativa sin .., sin segmentos que empiecen con punto y sin barras invertidas ni dos puntos.",
    blobUnknown: "Falta subir un archivo que el proyecto menciona.",
    docInvalid: "El cambio no tiene la forma de un proyecto.",
    binaryInvalid:
      "Ese archivo no es una imagen ni una fuente que el servicio acepte (PNG, JPEG, GIF, WebP, SVG, WOFF2, TTF u OTF).",
    versionsRate: "Las versiones se hacen demasiado rápido. Espera un minuto e inténtalo de nuevo.",
    thumbnailRate: "Las vistas previas se actualizan demasiado rápido.",
    accessDenied: "No puedes modificar este proyecto.",
    roomFull: (most) =>
      `Ya hay ${most} personas conectadas a este proyecto. La página sigue intentándolo.`,
    failed: (message, code) => `${message} (${code})`,
    failedStatus: (status) => `El servicio respondió con el estado ${status}.`,
    other: (code) => `La sala rechazó el cambio (${code}).`,
  },

  refusal: {
    undone: (reason) =>
      `${reason} Tu último cambio no se conservó: el proyecto volvió a como lo tiene la sala.`,
  },

  open: {
    opening: "Abriendo el proyecto…",
    opened: (name) => `Se abrió ${name}.`,
    openedOffline: "Se abrió el proyecto desde este navegador. No tienes conexión.",
    notFound:
      "No se encontró el proyecto, o no es tuyo para abrirlo. Se abrió el proyecto de este navegador.",
    failed: "No se pudo abrir el proyecto. Revisa la conexión e inténtalo de nuevo.",
    signInToOpen: "Este enlace abre un proyecto en la nube. Inicia sesión para abrirlo.",
    unavailable: "No se pudo cargar el proyecto desde la nube.",
    full: (most) =>
      `La sala de este proyecto está llena: ya hay ${most} personas dentro. Vuelve a abrir el proyecto dentro de un momento para entrar.`,
  },

  project: {
    collisions: (shown) =>
      shown.length === 1
        ? `Dos archivos tenían el mismo nombre: uno lo conserva y el otro se muestra como ${list("es", shown)}.`
        : `Varios archivos tenían el mismo nombre: de cada nombre un archivo lo conserva y los demás se muestran como ${list("es", shown)}.`,
    binaryUnsupported: (path) => `${path} no se puede guardar en este proyecto.`,
    binaryUpload: (path, reason) => `No se subió ${path}: ${reason}`,
    binaryFetch: (path) => `No se pudo descargar ${path} desde la nube.`,
    gone: "Este proyecto se eliminó de tu cuenta o ya no se comparte contigo. La página deja de reconectar y conserva lo que tiene: descarga el proyecto para guardar una copia, porque ya no se puede guardar en la nube.",
    pathInvalid: (path) => `${path} no es un nombre de archivo que acepte un proyecto en la nube.`,
    internal:
      "Algo falló al mantener tus cambios al día. Vuelve a cargar la página si el proyecto se ve mal.",
    savedShortcut: "Guardado en la nube. Descarga el proyecto para tener una copia en otro lugar.",
  },
};
