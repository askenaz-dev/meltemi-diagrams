import { isLocale, resolveLocale, type Locale } from "@meltemi/diagrams-i18n";

/** The interface languages a person can choose: the browser's (`auto`), or one of the product's. */
export const LANGUAGE_CHOICES = ["auto", "en", "es"] as const;
export type LanguageChoice = (typeof LANGUAGE_CHOICES)[number];

/** The name of each language in itself, as language switches list them. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { en: "English", es: "Español" };

/** The kept choice of language; a missing or unknown value is `auto`. */
export function languageChoice(value: unknown): LanguageChoice {
  return isLocale(value) ? value : "auto";
}

/**
 * The interface language of the page: the person's choice, else (`auto`) the browser's language,
 * English when the product does not speak it.
 */
export function interfaceLocale(choice: unknown, browser: string | null | undefined): Locale {
  const chosen = languageChoice(choice);
  return chosen === "auto" ? resolveLocale(browser) : chosen;
}
