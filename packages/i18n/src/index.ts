export const PACKAGE_NAME = "@meltemi/diagrams-i18n";

/** The languages of the product. */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
}

/**
 * The supported language of a language tag or a POSIX locale: `es`, `es-CL`, `es-419` and
 * `es_ES.UTF-8` give Spanish; any other language, or none, English.
 */
export function resolveLocale(tag: string | null | undefined): Locale {
  if (!tag) return DEFAULT_LOCALE;
  const language = tag
    .trim()
    .toLowerCase()
    .split(/[-_.@]/)[0];
  return language === "es" ? "es" : DEFAULT_LOCALE;
}

/**
 * The language that environment variables ask for, as command-line tools read them:
 * `MELTEMI_LANG`, then `LC_ALL`, `LC_MESSAGES` and `LANG`. `C` and `POSIX` say nothing.
 * Undefined when none is set.
 */
export function localeFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): Locale | undefined {
  for (const name of ["MELTEMI_LANG", "LC_ALL", "LC_MESSAGES", "LANG"]) {
    const value = env[name]?.trim();
    if (value && value !== "C" && value !== "POSIX" && !value.startsWith("C.")) {
      return resolveLocale(value);
    }
  }
  return undefined;
}

let current: Locale = DEFAULT_LOCALE;

/**
 * The language of the tool's own words in this process or page: the interface of the editor, the
 * messages of the command line. Content written to files takes an explicit locale instead.
 */
export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

/**
 * A catalog in both languages. The Spanish catalog has the English one's type, so a missing entry,
 * or a sentence with other parameters, does not compile. The result gives the catalog of a locale,
 * by default the interface's.
 */
export function catalog<T extends object>(en: T, es: NoInfer<T>): (locale?: Locale) => T {
  return (locale = current) => (locale === "es" ? es : en);
}

const rules = new Map<Locale, Intl.PluralRules>();

/** The form of a word for a count: `one` for 1 in both languages, `other` otherwise. */
export function plural(
  locale: Locale,
  count: number,
  forms: { readonly one: string; readonly other: string },
): string {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  return rule.select(count) === "one" ? forms.one : forms.other;
}

/** Items joined as the language writes a list: "A, B and C", "A, B y C"; or with "or", "o". */
export function list(
  locale: Locale,
  items: readonly string[],
  type: "conjunction" | "disjunction" = "conjunction",
): string {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}

/** A number with at most `digits` decimals, without grouping: "1.2" or "1,2". */
export function decimal(locale: Locale, value: number, digits = 1): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);
}

/** A time in seconds with one decimal: "1.2 s" or "1,2 s". */
export function seconds(locale: Locale, ms: number): string {
  return `${decimal(locale, ms / 1000)} s`;
}

/** A share as a percentage, as the language writes it: "55%" or "55 %". */
export function percent(locale: Locale, ratio: number): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    ratio,
  );
}

/**
 * The paths of the strings a Spanish catalog leaves as in English, for tests of completeness:
 * `["toolbar.undo"]` when both say "Undo". Functions are not compared; words or paths that are
 * rightly the same in both languages (`"SVG"`, `"toolbar.zoom"`) go in `same`.
 */
export function untranslated(en: object, es: object, same: readonly string[] = []): string[] {
  const found: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === "string") {
      if (a === b && a.trim() !== "" && !same.includes(a) && !same.includes(path)) found.push(path);
      return;
    }
    if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return;
    for (const [key, value] of Object.entries(a)) {
      walk(value, (b as Record<string, unknown>)[key], path === "" ? key : `${path}.${key}`);
    }
  };
  walk(en, es, "");
  return found;
}
