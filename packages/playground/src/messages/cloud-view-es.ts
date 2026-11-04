import type { viewing as en } from "./cloud-view-en.js";

/** Las palabras de ver un proyecto por su enlace, entrada por entrada como en `cloud-view-en.ts`. */
export const viewing: typeof en = {
  group: "Proyecto compartido",
  badge: "Solo lectura",
  badgeTitle: "Puedes mirar este proyecto, reproducirlo y exportarlo, pero no cambiarlo.",
  copy: "Hacer una copia",
  copyTitle: "Copia los archivos de este proyecto en este navegador como un proyecto propio",
  save: "Guardar una copia en mis proyectos",
  saveTitle: "Copia este proyecto a tu cuenta y abre la copia",
  staleHint: "Esta página lleva abierta un rato, así que el proyecto puede haber cambiado.",
  reload: "Recargar para ver los cambios",
  reloaded: "Se recargó el proyecto.",

  opened: (name) =>
    `Se abrió ${name} para verlo: puedes mirarlo, reproducirlo y exportarlo, pero no cambiarlo.`,
  openedLive: (name) =>
    `Se abrió ${name} para verlo. Los cambios de otras personas aparecen aquí al hacerse.`,
  notFound: "No se encontró el proyecto.",
  notFoundSignIn:
    "No se encontró el proyecto. Si lo compartieron contigo, inicia sesión y abre el enlace otra vez.",
  signInToAccept: "Inicia sesión para aceptar la invitación a este proyecto.",
  inviteInvalid: "Esta invitación no es válida.",
  inviteAccepted: (name, role) =>
    role === "viewer"
      ? `Invitación aceptada: puedes ver ${name}.`
      : `Invitación aceptada: puedes editar ${name}.`,

  readOnly: "Este proyecto es de solo lectura. Haz una copia para cambiarlo.",
  nothingToSave:
    "Este proyecto es de solo lectura, así que no hay nada que guardar. Haz una copia para quedarte con una versión tuya.",

  copyConfirmTitle: "¿Reemplazar el proyecto de este navegador?",
  copyConfirmMessage:
    "La copia reemplaza el proyecto que guarda este navegador. Ese proyecto queda disponible como el anterior, en el panel Proyectos.",
  copyConfirm: "Hacer la copia",
  copied: (name) => `Se hizo una copia de ${name} en este navegador. Ya puedes editarla.`,
  copyLoading: "El proyecto aún se está abriendo. Haz la copia cuando lleguen sus archivos.",
  savingCopy: (name) => `Guardando una copia de ${name} en tus proyectos…`,
  savedCopy: (name) => `Se guardó una copia de ${name} en tus proyectos y se abrió.`,

  access: {
    nowViewer: "Tu acceso cambió: puedes ver este proyecto, pero no cambiarlo.",
    nowEditor: "Tu acceso cambió: ya puedes editar este proyecto.",
  },

  sharedAs: (role) =>
    role === "viewer" ? "Compartido contigo: solo lectura" : "Compartido contigo: puedes editar",

  status: {
    label: "Proyecto compartido",
    connecting: "Conectando con el proyecto…",
    connected: "Siguiendo en vivo",
    reconnecting: "Reconectando… mientras tanto ves la última versión",
    offline: "Sin conexión: ves la última versión y los cambios aparecen cuando vuelvas",
    synced: "De nuevo en línea: ves la última versión.",
    dropped: "Se perdió la conexión. Reconectando…",
    gone: "Este proyecto ya no está disponible para ti",
    full: (most) => `Sala llena: ya hay ${most} personas en este proyecto. Reintentando…`,
    ended: "La sesión en vivo terminó",
    limited: "Demasiadas conexiones desde esta red",
    retry: "Reintentar",
  },
};
