import { plural } from "@meltemi/diagrams-i18n";
import type { publishing as publishingEn, sharing as sharingEn } from "./cloud-share-en.js";

/** Las palabras del diálogo de compartir, entrada por entrada como en `cloud-share-en.ts`. */
export const sharing: typeof sharingEn = {
  title: "Compartir",
  loading: "Cargando quién tiene acceso…",
  tryAgain: "Reintentar",

  linkLabel: "Enlace al proyecto",
  linkHint: "Abre el proyecto en el playground.",
  copy: "Copiar",
  copyLinkLabel: "Copiar el enlace al proyecto",
  linkCopied: "Se copió el enlace al proyecto.",
  selectIt: "Selecciona el enlace y cópialo.",

  levelLegend: "Quién puede abrir el enlace",
  changingLevel: "Cambiando quién puede abrir el enlace…",
  levels: {
    private: {
      label: "Solo las personas de la lista",
      text: "Solo las personas de la lista de abajo pueden abrir el proyecto.",
      done: "Ahora solo las personas de la lista pueden abrir el proyecto.",
    },
    view: {
      label: "Cualquiera con el enlace puede ver",
      text: "Cualquiera con el enlace puede ver y reproducir los diagramas, haya iniciado sesión o no, pero no cambiarlos.",
      done: "Ahora cualquiera con el enlace puede ver el proyecto.",
    },
    edit: {
      label: "Cualquiera con sesión iniciada y el enlace puede editar",
      text: "Quien abra el enlace con sesión iniciada puede editar el proyecto; los demás pueden verlo.",
      done: "Ahora cualquiera con sesión iniciada y el enlace puede editar el proyecto.",
    },
  },

  roles: { owner: "Propietario", editor: "Puede editar", viewer: "Puede ver" },
  youAre: {
    owner: "Este proyecto es tuyo.",
    editor: "Puedes editar este proyecto.",
    viewer: "Puedes ver este proyecto, pero no cambiarlo.",
  },

  peopleTitle: "Personas",
  noPeople: "Todavía no se agregó a nadie más.",
  count: (held, most) => `${held} de ${most} personas e invitaciones`,
  you: "tú",
  unnamed: "Alguien",
  roleOf: (name) => `Rol de ${name}`,
  changingRole: "Cambiando el rol…",
  roleChanged: (name, role) => `Se cambió el rol de ${name} a «${role}».`,
  remove: "Quitar",
  removeLabel: (name) => `Quitar a ${name}`,
  removeTitle: "¿Quitar a esta persona?",
  removeMessage: (name) =>
    `${name} pierde el acceso que se le dio por su nombre. Si el enlace la admite, conserva lo que este da.`,
  removeConfirm: "Quitar",
  removing: "Quitando…",
  removed: (name) => `Se quitó a ${name}.`,
  gone: "Esa persona o esa invitación ya no estaba. La lista está al día.",

  inviteTitle: "Invitar a alguien",
  emailLabel: "Correo electrónico",
  emailEmpty: "Escribe el correo electrónico de la persona.",
  emailInvalid: "Eso no es un correo electrónico.",
  roleLabel: "Rol",
  inviteButton: "Invitar",
  inviteHint:
    "No se envía ningún correo. Recibes un enlace para pasar; la persona obtiene este acceso al abrirlo con sesión iniciada, o al iniciar sesión con este correo.",
  inviting: "Creando la invitación…",
  invited: (email) =>
    `Se creó la invitación para ${email}. No se envió ningún correo: copia su enlace y envíalo tú.`,
  invitedAgain: (email, role) =>
    `${email} ya tenía una invitación. Ahora da «${role}»; su enlace está abajo.`,
  revealLabel: (email) => `Invitación para ${email}`,
  revealNote: "No se envió ningún correo. Copia este enlace y envíalo tú.",

  pendingTitle: "Invitaciones pendientes",
  noPending: "No hay invitaciones pendientes.",
  expires: (when) => `Vence el ${when}`,
  copyInvitation: "Copiar enlace",
  copyInvitationLabel: (email) => `Copiar el enlace de la invitación para ${email}`,
  invitationCopied: "Se copió el enlace de la invitación.",
  revoke: "Revocar",
  revokeLabel: (email) => `Revocar la invitación para ${email}`,
  revoking: "Revocando…",
  revoked: (email) => `Se revocó la invitación para ${email}.`,

  leaveTitle: "Salir de este proyecto",
  leaveHint:
    "Pierdes el acceso que se te dio por tu nombre. Si el enlace te admite, conservas lo que este da.",
  leave: "Salir",
  leaveConfirmTitle: "¿Salir del proyecto?",
  leaveMessage: (name) =>
    `${name} desaparece de tus proyectos. Solo podrás abrirlo de nuevo si la persona propietaria te invita o si su enlace te admite.`,
  leaveConfirm: "Salir del proyecto",
  leaving: "Saliendo…",
  left: "Saliste del proyecto.",

  publishTitle: "Publicar",
  publishText:
    "Publica los diagramas del proyecto como una página web que cualquiera puede abrir: la misma página del catálogo HTML.",
  publishButton: "Publicar…",

  errors: {
    quotaMembers: (most) =>
      `Un proyecto admite como máximo ${most} personas e invitaciones pendientes en conjunto. Quita a alguien o revoca una invitación antes.`,
    requestInvalid: "El servicio no aceptó eso. Revisa el correo electrónico y el rol.",
    inviteInvalid: "Esa invitación ya no es válida.",
    accessDenied: "Solo la persona propietaria del proyecto puede cambiar quién tiene acceso.",
  },
};

/** Las palabras del diálogo de publicar, entrada por entrada como en `cloud-share-en.ts`. */
export const publishing: typeof publishingEn = {
  title: "Publicar",
  intro:
    "Publica los diagramas del proyecto como una página web que cualquiera puede abrir: la misma página que la descarga del catálogo HTML. Vuelve a publicar para actualizarla.",
  loading: "Cargando lo que está publicado…",
  tryAgain: "Reintentar",
  close: "Cerrar",
  defaultSlug: "proyecto",

  handleLabel: "Alias",
  handleHint:
    "Forma parte de la dirección de cada página que publicas: de 3 a 30 letras minúsculas, dígitos o guiones. No puede cambiar mientras tengas una página publicada.",
  handleEmpty: "Elige un alias.",
  handleShort: (least) => `El alias admite al menos ${least} caracteres.`,
  handleLong: (most) => `El alias admite como máximo ${most} caracteres.`,
  handleChars: "Usa solo letras minúsculas, dígitos y guiones.",
  handleTaken: "Ese alias ya está en uso. Prueba con otro.",
  handleInvalid: "El servicio no aceptó ese alias.",
  handleLocked: "Tu alias no puede cambiar mientras tengas páginas publicadas.",
  handleInAccount: (handle) => `Tu alias es ${handle}; puedes cambiarlo en Cuenta.`,
  choosingHandle: "Eligiendo tu alias…",

  slugLabel: "Nombre de la página",
  slugHint:
    "La última parte de la dirección: letras minúsculas, dígitos y guiones, hasta 60 caracteres.",
  slugEmpty: "Dale un nombre a la página.",
  slugLong: (most) => `El nombre admite como máximo ${most} caracteres.`,
  slugChars: "Usa solo letras minúsculas, dígitos y guiones.",
  addressEnd: (handle, slug) => `La dirección termina en /${handle}/${slug}/`,

  publishButton: "Publicar",
  building: "Construyendo la página…",
  uploading: "Publicando…",
  published: (slug) => `Se publicó ${slug}.`,
  skipped: (count) =>
    `${count} ${plural("es", count, { one: "diagrama no se pudo dibujar y quedó", other: "diagramas no se pudieron dibujar y quedaron" })} fuera.`,
  addressLabel: (slug) => `Dirección de ${slug}`,
  copy: "Copiar",
  copyLabel: (slug) => `Copiar la dirección de ${slug}`,
  copied: "Se copió la dirección.",
  selectIt: "Selecciona la dirección y cópiala.",
  open: "Abrir",
  openLabel: (slug) => `Abrir ${slug} en una pestaña nueva`,

  listTitle: "Páginas publicadas",
  listLabel: "Páginas publicadas desde este proyecto",
  none: "Todavía no hay nada publicado desde este proyecto.",
  publishedAt: (when) => `Publicada el ${when}`,
  republish: "Publicar de nuevo",
  republishLabel: (slug) => `Publicar ${slug} de nuevo`,
  unpublish: "Despublicar",
  unpublishLabel: (slug) => `Despublicar ${slug}`,
  unpublishTitle: "¿Despublicar esta página?",
  unpublishMessage: (slug) =>
    `${slug} deja de estar disponible en su dirección. Puedes volver a publicarla más tarde.`,
  unpublishConfirm: "Despublicar",
  unpublishing: "Despublicando…",
  unpublished: (slug) => `Se despublicó ${slug}.`,
  gone: (slug) => `${slug} ya no estaba publicada.`,

  removedTitle: "Retiradas por el servicio",
  removedByService: (slug, when) =>
    when === ""
      ? `${slug}: retirada por el servicio.`
      : `${slug}: retirada por el servicio el ${when}.`,
  removedReason: (reason) => `Motivo: ${reason}`,

  errors: {
    tooLarge: (mebibytes) =>
      `La página supera los ${mebibytes} MiB, lo máximo que admite el servicio. Quita algunas imágenes o diagramas e inténtalo de nuevo.`,
    rate: "Este proyecto se publicó demasiadas veces en la última hora. Inténtalo más tarde.",
    taken: "Otro de tus proyectos ya publica una página con ese nombre. Elige otro nombre.",
    invalid: "El servicio no aceptó la página.",
    accessDenied: "Solo la persona propietaria del proyecto puede publicarlo.",
    handleRequired: "Elige un alias primero.",
    nothing: "El proyecto no tiene diagramas que publicar.",
    buildFailed: "No se pudo construir la página.",
  },
};
