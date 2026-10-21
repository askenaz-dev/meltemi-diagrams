import { catalog } from "@meltemi/diagrams-i18n";
import { en } from "./en.js";
import { es } from "./es.js";

/**
 * The command line's words in a language: by default the interface's (`--lang`, else the
 * environment, else the system), set once per run; the review report passes the language of the
 * files the command writes.
 */
export const messages = catalog(en, es);

/**
 * The message of an error in the arguments, from Node's `parseArgs`, in the interface language;
 * English keeps Node's own text.
 */
export function argumentsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  const named = /'([^']*)'/.exec(message)?.[1] ?? "";
  const t = messages().common.arguments;
  switch (code) {
    case "ERR_PARSE_ARGS_UNKNOWN_OPTION":
      return t.unknownOption(message, named);
    case "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL":
      return t.unexpected(message, named);
    case "ERR_PARSE_ARGS_INVALID_OPTION_VALUE": {
      const option = named.replace(/ <value>$/, "");
      if (message.includes("argument missing")) return t.missingValue(message, option);
      if (message.includes("does not take an argument")) return t.noValue(message, option);
      if (message.includes("is ambiguous")) return t.ambiguous(message, option);
      return message;
    }
    default:
      return message;
  }
}

/** Whether the answer to a confirmation is yes, in either language: y, yes, s, si or sí. */
export function isYes(answer: string): boolean {
  return /^(y|yes|s|si|sí)$/i.test(answer.trim());
}
