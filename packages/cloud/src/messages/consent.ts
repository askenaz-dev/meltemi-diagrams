// The words of the authorization server's consent page (`mcp-authorization`, "Clients and
// consent") and of the refusals that go with it. Written by `routes/oauth.ts` through
// `pages/consent.ts`. A word that precedes or follows a value (the client's name, a host) is a pair,
// so the page can set the value apart and escape it.

/** What each scope lets an app do, as the consent page and Connected apps name it. */
export interface ScopeWords {
  readonly title: string;
  readonly detail: string;
}

export const consentEn = {
  titleBefore: "Allow",
  titleAfter: "to use your Meltemi Diagrams account?",
  /** The page's title in the browser's tab, without the client's name. */
  tabTitle: "Connect an app",
  intro: "An app is asking to work with your Meltemi Diagrams account through its MCP endpoint.",
  signedInAs: "You are signed in as",
  publishedBy: "Published by",
  unverified: "This app registered itself: its name is not verified.",
  /** Before the host the access is sent to; the page ends the sentence. */
  sentTo: "If you approve, access is sent to",
  loopbackTitle: "An app on this computer",
  loopbackBody:
    "Access goes to a program listening on this computer. Approve only if you just started connecting it yourself.",
  scopesTitle: "It will be able to",
  scopes: {
    "projects:read": {
      title: "Read your projects",
      detail: "List your projects and read their files, versions and previews.",
    },
    "projects:write": {
      title: "Change your projects",
      detail: "Create projects, write files, upload images, make and restore versions.",
    },
    sharing: {
      title: "Share your projects",
      detail: "Set who can open a project by its link, invite people and manage members.",
    },
    live: {
      title: "Run live sessions",
      detail: "Start and end live sessions in which guests edit a project with you.",
    },
    publish: {
      title: "Publish catalogs",
      detail: "Publish a project's catalog at a public address, and take it down.",
    },
    offline_access: {
      title: "Stay connected",
      detail: "Keep its access for thirty days without asking you again.",
    },
  } satisfies Record<string, ScopeWords>,
  rolesNote:
    "It acts as you, and only where your role in a project allows it: what you may only read, it may only read.",
  revokeNote: "You can revoke its access at any time from Connected apps in your account panel.",
  approveButton: "Approve",
  denyButton: "Deny",

  invalidTitle: "This request to connect an app cannot be used",
  invalidBody:
    "It does not name a client this service knows, or its address, its scopes or its PKCE challenge are not in the form this page accepts, so nothing was approved. Start connecting again from the app.",
  unverifiedTitle: "This app could not be verified",
  unverifiedBody:
    "The document that describes it could not be read from its address, so nothing was approved. Try again in a moment, from the app.",
  forbiddenTitle: "This request was refused",
  forbiddenBody:
    "It did not come from the consent page of this service, or your session changed after the page was shown, so nothing was approved. Start connecting again from the app.",
  expiredTitle: "This page expired",
  expiredBody:
    "A consent page works once, for ten minutes, in the browser that opened it, so nothing was approved. Start connecting again from the app.",
};

export const consentEs: typeof consentEn = {
  titleBefore: "¿Permitir que",
  titleAfter: "use tu cuenta de Meltemi Diagrams?",
  tabTitle: "Conectar una aplicación",
  intro:
    "Una aplicación pide trabajar con tu cuenta de Meltemi Diagrams a través de su endpoint MCP.",
  signedInAs: "Has iniciado sesión como",
  publishedBy: "Publicada por",
  unverified: "Esta aplicación se registró sola: su nombre no está verificado.",
  sentTo: "Si la apruebas, el acceso se envía a",
  loopbackTitle: "Una aplicación de este equipo",
  loopbackBody:
    "El acceso va a un programa que escucha en este equipo. Apruébalo solo si acabas de empezar a conectarlo tú.",
  scopesTitle: "Podrá",
  scopes: {
    "projects:read": {
      title: "Leer tus proyectos",
      detail: "Listar tus proyectos y leer sus archivos, versiones y vistas previas.",
    },
    "projects:write": {
      title: "Cambiar tus proyectos",
      detail: "Crear proyectos, escribir archivos, subir imágenes, crear y restaurar versiones.",
    },
    sharing: {
      title: "Compartir tus proyectos",
      detail:
        "Decidir quién abre un proyecto con su enlace, invitar a personas y gestionar miembros.",
    },
    live: {
      title: "Llevar sesiones en vivo",
      detail:
        "Iniciar y terminar sesiones en vivo en las que invitados editan un proyecto contigo.",
    },
    publish: {
      title: "Publicar catálogos",
      detail: "Publicar el catálogo de un proyecto en una dirección pública, y retirarlo.",
    },
    offline_access: {
      title: "Seguir conectada",
      detail: "Conservar su acceso durante treinta días sin volver a preguntarte.",
    },
  },
  rolesNote:
    "Actúa como tú, y solo donde tu rol en un proyecto lo permite: lo que tú solo puedes leer, la aplicación solo puede leerlo.",
  revokeNote:
    "Puedes revocar su acceso en cualquier momento desde Aplicaciones conectadas en el panel de tu cuenta.",
  approveButton: "Aprobar",
  denyButton: "Denegar",

  invalidTitle: "No se puede usar esta solicitud para conectar una aplicación",
  invalidBody:
    "No nombra un cliente que este servicio conozca, o su dirección, sus permisos o su desafío PKCE no tienen la forma que acepta esta página, así que no se aprobó nada. Vuelve a empezar la conexión desde la aplicación.",
  unverifiedTitle: "No se pudo verificar esta aplicación",
  unverifiedBody:
    "No se pudo leer el documento que la describe en su dirección, así que no se aprobó nada. Vuelve a intentarlo en un momento, desde la aplicación.",
  forbiddenTitle: "Se rechazó esta solicitud",
  forbiddenBody:
    "No venía de la página de consentimiento de este servicio, o tu sesión cambió después de mostrar la página, así que no se aprobó nada. Vuelve a empezar la conexión desde la aplicación.",
  expiredTitle: "Esta página caducó",
  expiredBody:
    "Una página de consentimiento sirve una vez, durante diez minutos, en el navegador que la abrió, así que no se aprobó nada. Vuelve a empezar la conexión desde la aplicación.",
};
