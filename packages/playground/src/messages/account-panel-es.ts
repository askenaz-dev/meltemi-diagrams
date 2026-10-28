import type { accountPanel as en } from "./account-panel-en.js";

/** Las palabras del panel de cuenta, entrada por entrada como en `account-panel-en.ts`. */
export const accountPanel: typeof en = {
  title: "Cuenta",
  close: "Cerrar",
  sections: {
    profile: "Perfil",
    signins: "Inicios de sesión",
    devices: "Dispositivos",
    tokens: "Tokens de API",
    usage: "Uso",
    danger: "Zona de peligro",
  },
  tabsLabel: "Secciones de la cuenta",

  profileIntro: "Una sola cuenta de Meltemi inicia sesión en todos los productos de Meltemi.",
  emailsLabel: "Correos de tus inicios de sesión",
  noEmail: "Sin correo",
  handleTitle: "Alias de publicación",
  handleIntro:
    "La primera parte de la dirección de cada página que publicas, como en meltemi.page/alias/pagina.",
  handleLabel: "Alias",
  handleHint: "De 3 a 30 letras minúsculas, dígitos o guiones.",
  handleSave: "Guardar",
  handleSaving: "Guardando el alias…",
  handleSaved: (handle) => `Tu alias es ${handle}.`,
  handleNone: "Todavía no has elegido un alias: al publicar por primera vez se te pide uno.",
  signOutTitle: "Cerrar sesión",
  signOutIntro: "Cierra tu sesión en este navegador. Tu trabajo se queda aquí.",
  accountIdTitle: "Identificador de la cuenta",
  accountIdIntro:
    "Con él te conoce este servicio. Un administrador puede pedírtelo para conceder algo a tu cuenta.",
  accountIdCopy: "Copiar",
  accountIdCopied: "Copiado.",
  accountIdSelect: "Selecciona el identificador y cópialo.",
  unbrandedTitle: "Exportaciones sin la marca de Meltemi",
  unbrandedOn:
    "Tu cuenta puede exportar sin la marca de Meltemi: el diálogo de exportación lo ofrece.",

  signinsIntro: "Las cuentas con las que inicias sesión. Necesitas al menos una.",
  provider: { github: "GitHub", google: "Google" },
  verified: "Verificado",
  linkedOn: (when) => `Vinculado el ${when}`,
  unlink: "Desvincular",
  unlinkLabel: (provider) => `Desvincular ${provider}`,
  unlinkTitle: "¿Desvincular el inicio de sesión?",
  unlinkMessage: (provider) =>
    `Ya no iniciarás sesión con ${provider}. Puedes volver a vincularlo cuando quieras.`,
  unlinkConfirm: "Desvincular",
  unlinked: (provider) => `Se desvinculó ${provider}.`,
  onlySignin: "Es tu único inicio de sesión. Vincula otro antes de desvincularlo.",
  linkTitle: "Vincular otro inicio de sesión",
  link: (provider) => `Vincular ${provider}`,
  linkHint:
    "Vas al proveedor y vuelves aquí. Tu trabajo se conserva en este navegador mientras tanto.",

  devicesIntro: "Dónde tienes la sesión iniciada en Meltemi.",
  thisDevice: "Este dispositivo",
  signedInOn: (when) => `Sesión iniciada el ${when}`,
  lastSeen: (when) => `Última actividad: ${when}`,
  signOutDevice: "Cerrar sesión",
  signOutDeviceLabel: (device) => `Cerrar la sesión de ${device}`,
  signOutDeviceTitle: "¿Cerrar la sesión de este dispositivo?",
  signOutDeviceMessage: (device) =>
    `Se cierra la sesión de ${device} en Meltemi. Puede seguir funcionando en este producto hasta una hora.`,
  signOutDeviceConfirm: "Cerrar la sesión del dispositivo",
  signedOutDevice: (device) => `Se cerró la sesión de ${device}.`,
  signOutOthers: "Cerrar sesión en los otros dispositivos",
  signOutOthersTitle: "¿Cerrar sesión en todos los otros dispositivos?",
  signOutOthersMessage:
    "Se cierra la sesión en cualquier otro navegador donde la tengas iniciada. En este sigues con la sesión iniciada.",
  signOutOthersConfirm: "Cerrar sesión en los otros dispositivos",
  signedOutOthers: "Se cerró la sesión en todos los otros dispositivos.",
  withinTheHour: "Los otros dispositivos pierden la sesión en menos de una hora.",
  deviceJoin: "en",
  otherBrowser: "Otro navegador",
  otherSystem: "otro sistema",

  usageIntro: "Lo que tu cuenta guarda en la nube, frente a sus límites.",
  limitsTitle: "Límites",
  limits: {
    files: "Archivos de un proyecto",
    documentBytes: "Tamaño de un proyecto",
    binaryBytes: "Tamaño de una imagen o una fuente",
    versions: "Versiones de un proyecto",
  },
  usageFailed: "No se pudo leer el uso.",

  dangerTitle: "Eliminar tu cuenta",
  dangerBody:
    "Al eliminar tu cuenta se borran en el servicio de identidad la cuenta, sus inicios de sesión y sus sesiones, y este producto elimina tus proyectos, versiones, tokens y páginas publicadas en un plazo de siete días. No se puede deshacer.",
  dangerHint:
    "Lo confirmas en la página del servicio de identidad y vuelves aquí sin sesión. Tu trabajo en este navegador se queda.",
  deleteAccount: "Eliminar la cuenta",

  loading: "Cargando…",
  unavailable: "No se pudo contactar con el servicio de identidad.",
  tryAgain: "Reintentar",
  openPage: "Abrir la página de la cuenta",
  identityLast: "Es tu único inicio de sesión. Vincula otro antes de desvincularlo.",
  sessionCurrent: "Es el dispositivo que estás usando. Cierra la sesión en su lugar.",
  sessionGone: "Ese dispositivo ya no tenía la sesión iniciada.",
  rateLimited: "Demasiados cambios en un minuto. Espera un poco y vuelve a intentarlo.",
  unreachable: "No se pudo contactar con el servicio. Comprueba la conexión y vuelve a intentarlo.",
  failed: (message, code) => `${message} (${code})`,
  failedStatus: (status) => `El servicio respondió con el estado ${status}.`,
};
