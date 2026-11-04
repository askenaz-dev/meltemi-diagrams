import { decimal, list, plural } from "@meltemi/diagrams-i18n";
import type { en } from "./en.js";

/** The assistance's words in Spanish. */
export const es: typeof en = {
  provider: {
    cannotReach: (origin, reason) => `No se puede conectar con ${origin}: ${reason}`,
    answered: (status, detail) => `El proveedor respondió con ${status}: ${detail}`,
    notJson: "La respuesta del proveedor no es JSON.",
    cutOff: "La respuesta se cortó al llegar a su límite de longitud; pide menos a la vez.",
    noText: "La respuesta del proveedor no tiene texto.",
  },
  config: {
    noProvider:
      "No hay ningún proveedor de IA configurado: define MELTEMI_AI_PROVIDER como anthropic (con ANTHROPIC_API_KEY) u openai-compatible (con MELTEMI_AI_BASE_URL y MELTEMI_AI_MODEL). La validación, la disposición y la exportación nunca lo necesitan.",
    anthropicKey: "Anthropic necesita una clave en ANTHROPIC_API_KEY.",
    baseUrl:
      "Un proveedor compatible con OpenAI necesita MELTEMI_AI_BASE_URL, como http://127.0.0.1:11434/v1.",
    model: "Un proveedor compatible con OpenAI necesita MELTEMI_AI_MODEL, el nombre del modelo.",
    unknownProvider: (provider, providers) =>
      `Proveedor de IA desconocido "${provider}"; usa ${list("es", providers, "disjunction")}.`,
  },
  disclosure: {
    goesTo: (provider, model, endpoint, remote) =>
      `Esta solicitud va a ${provider} (${model}) en ${endpoint}${remote ? "" : ", en este equipo"}, con:`,
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : `${decimal("es", bytes / 1024)} KB`),
    instruction: (characters) =>
      `tu solicitud (${characters} ${plural("es", characters, { one: "carácter", other: "caracteres" })})`,
    guide: "la guía del lenguaje",
    changes: "la lista de cambios",
  },
  reasons: {
    file: "el archivo",
    model: "un modelo del proyecto",
    themes: "temas del proyecto",
    importedByIt: "importado por el archivo",
    importedByImport: "importado por un archivo importado",
    changed: "modificado",
    review: "lo que encontró la revisión",
  },
  proposal: {
    noJsonObject: "La respuesta no contiene ningún objeto JSON.",
    notJsonObject: "La respuesta no es un objeto JSON.",
    notAsAsked: (reason) => `El asistente no respondió como se le pidió: ${reason}`,
    inferred: "Inferida",
    noItem: "No se aceptó ningún punto.",
    allChanged: "Todos los puntos aceptados cambiaron desde la propuesta.",
  },
};
