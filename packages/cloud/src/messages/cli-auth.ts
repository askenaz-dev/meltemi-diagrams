// The words of the command line's approval page and of the refusals that go with it. Written by
// `routes/cli-auth.ts` through `pages/cli-auth.ts`. A word that precedes or follows a value (the
// port, the name) is a pair, so the page can set the value apart and escape it.

export const cliAuthEn = {
  title: "Allow the command line on this computer?",
  intro:
    "A program on this computer is asking to sign in to your Meltemi Diagrams account as the command line, mdg.",
  signedInAs: "You are signed in as",
  portBefore: "It is waiting for your answer on port",
  portAfter: "of this computer.",
  checkLabel: "Check",
  checkNote:
    "The terminal where you ran mdg login shows the same six characters. If they differ, this is not your request: do not approve it.",
  grantNote:
    "If you approve, the program gets an API token that can do what you can do in your account. You can revoke it at any time from API tokens in the playground.",
  approveButton: "Approve",
  cancelLink: "Cancel",

  invalidTitle: "This request from the command line cannot be used",
  invalidBody:
    "Its port or its state is missing or is not in the form this page accepts, so nothing was approved. Run the login command in your terminal again.",
  forbiddenTitle: "This request was refused",
  forbiddenBody:
    "It did not come from the approval page of this service, or your session changed after the page was shown, so nothing was approved. Run the login command in your terminal again.",
};

export const cliAuthEs: typeof cliAuthEn = {
  title: "¿Permitir la línea de comandos en este equipo?",
  intro:
    "Un programa de este equipo pide iniciar sesión en tu cuenta de Meltemi Diagrams como la línea de comandos, mdg.",
  signedInAs: "Has iniciado sesión como",
  portBefore: "Está esperando tu respuesta en el puerto",
  portAfter: "de este equipo.",
  checkLabel: "Comprobación",
  checkNote:
    "La terminal donde ejecutaste mdg login muestra los mismos seis caracteres. Si no coinciden, esta no es tu solicitud: no la apruebes.",
  grantNote:
    "Si la apruebas, el programa recibe un token de API que puede hacer lo mismo que tú en tu cuenta. Puedes revocarlo en cualquier momento desde los tokens de API del playground.",
  approveButton: "Aprobar",
  cancelLink: "Cancelar",

  invalidTitle: "No se puede usar esta solicitud de la línea de comandos",
  invalidBody:
    "Falta su puerto o su estado, o no tienen la forma que acepta esta página, así que no se aprobó nada. Vuelve a ejecutar el comando de inicio de sesión en tu terminal.",
  forbiddenTitle: "Se rechazó esta solicitud",
  forbiddenBody:
    "No venía de la página de aprobación de este servicio, o tu sesión cambió después de mostrar la página, así que no se aprobó nada. Vuelve a ejecutar el comando de inicio de sesión en tu terminal.",
};
