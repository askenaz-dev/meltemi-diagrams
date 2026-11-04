import { plural } from "@meltemi/diagrams-i18n";
import type { live as en } from "./cloud-live-en.js";

/** Las palabras de las sesiones en vivo, entrada por entrada como en `cloud-live-en.ts`. */
export const live: typeof en = {
  guestName: (n) => `Invitado ${n}`,
  guestBadge: "Invitado",
  guestBadgeTitle: "Se unió sin cuenta",

  joined: (name, editing) =>
    editing
      ? `Te uniste a la sesión en vivo de ${name}: edítalo junto con los demás.`
      : `Te uniste a la sesión en vivo de ${name}: míralo mientras los demás editan.`,
  ended: "La sesión en vivo terminó.",
  endedViewing: (name) => `La sesión en vivo terminó. Sigues viendo ${name} en vivo, sin editar.`,
  endedFrozen:
    "La sesión en vivo terminó. Lo que ves se queda aquí, solo para ver: haz una copia para seguir trabajando en ello.",
  limited:
    "Hay demasiadas personas sin cuenta conectadas desde esta red. Cierra otra pestaña de este proyecto, o inicia sesión, y abre el enlace de nuevo.",
  snapshot: (name) =>
    `${name} se abrió desde una copia, porque el proyecto no respondió a tiempo. Puede estar desactualizado: recarga para ver los cambios.`,

  bar: {
    label: "Sesión en vivo",
    guest: (project) => `Estás en la sesión en vivo de ${project} como`,
    visitor: (project) => `Sigues ${project} en vivo como`,
    nameLabel: "Tu nombre",
    nameHint: "Los demás ven este nombre junto a tu cursor.",
    rename: "Cambiar nombre",
    renamed: (name) => `Ahora los demás te ven como ${name}.`,
    nameInvalid: "Un nombre tiene de 1 a 40 caracteres, sin caracteres de control.",
    copy: "Hacer una copia",
    copyTitle: "Copiar los archivos de este proyecto en este navegador como un proyecto tuyo",
    signIn: "Iniciar sesión",
    signInTitle:
      "Inicia sesión para guardar una copia en tus proyectos, añadir imágenes y guardar versiones",
    ends: (left) => `Termina en ${left}`,
  },

  needsAccount: {
    images: "Añadir imágenes y fuentes requiere una cuenta. Inicia sesión para añadirlas.",
    versions:
      "Las versiones requieren una cuenta. Inicia sesión para guardar versiones de tu propia copia.",
    share: "Compartir requiere una cuenta. Inicia sesión para compartir una copia tuya.",
    publish: "Publicar requiere una cuenta. Inicia sesión para publicar una copia tuya.",
  },

  section: {
    title: "Sesión en vivo",
    off: "Deja que cualquiera con un enlace se una a este proyecto y lo edite contigo mientras escribes, con o sin cuenta, durante 24 horas como máximo.",
    start: "Iniciar una sesión en vivo",
    starting: "Iniciando la sesión en vivo…",
    started: "La sesión en vivo está activa. Pasa su enlace a quien deba unirse.",
    guestsEdit: "Los invitados pueden editar",
    guestsEditHint: "Desactívalo para que los invitados solo miren.",
    linkLabel: "Enlace de la sesión en vivo",
    linkHint:
      "Cualquiera con este enlace se une mientras dure la sesión. Deja de funcionar cuando termina.",
    copy: "Copiar enlace",
    copyLabel: "Copiar el enlace de la sesión en vivo",
    copied: "Enlace de la sesión en vivo copiado.",
    guestsNow: (count) =>
      `${count} ${plural("es", count, { one: "invitado", other: "invitados" })} ahora`,
    ends: (left) => `Termina en ${left}`,
    end: "Terminar sesión",
    endTitle: "¿Terminar la sesión en vivo?",
    endMessage:
      "Todos los que se unieron con su enlace salen del proyecto ahora, y el enlace deja de funcionar. Los miembros conservan su acceso.",
    endConfirm: "Terminar sesión",
    ending: "Terminando la sesión en vivo…",
    endedDone: "La sesión en vivo terminó.",
    changing: "Cambiando lo que pueden hacer los invitados…",
    nowEdit: "Ahora los invitados pueden editar.",
    nowView: "Ahora los invitados solo pueden mirar.",
    loading: "Leyendo la sesión en vivo…",
  },

  left: (hours, minutes) =>
    hours > 0 ? `${hours} h ${minutes} min` : minutes > 0 ? `${minutes} min` : "menos de un minuto",

  chip: (guests) =>
    `En vivo · ${guests} ${plural("es", guests, { one: "invitado", other: "invitados" })}`,
  chipTitle:
    "Hay una sesión en vivo activa. Abre el diálogo de compartir para ver su enlace o terminarla.",

  anonymous: {
    text: "Una sesión en vivo, en la que otros editan contigo mientras escribes, requiere el proyecto en una cuenta.",
    save: "Guardar en mis proyectos",
    signIn: "Inicia sesión para iniciar una",
  },
};
