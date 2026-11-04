import { en, type Messages } from "./en.js";
import { es } from "./es.js";

export type { Messages } from "./en.js";

/** The words the pages speak. */
export type Lang = "en" | "es";

/** The catalog of a language. Look words up when a page is made, never at module load. */
export function messages(lang: Lang): Messages {
  return lang === "es" ? es : en;
}

/**
 * The language of a request: `?lang=en|es`, else the best of those two in `Accept-Language`
 * (highest weight; the first listed on a tie; a language weighted 0 or with a weight that is not a
 * number is not acceptable), else English. The identity service's rule, except that a weight that
 * is not a number refuses the language instead of counting as 1.
 */
export function resolveLang(url: URL, acceptLanguage: string | null): Lang {
  const asked = url.searchParams.get("lang");
  if (asked === "en" || asked === "es") return asked;
  let best: { lang: Lang; weight: number } | undefined;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const [tag = "", ...params] = part.trim().split(";");
    const primary = tag.trim().toLowerCase().split("-")[0];
    if (primary !== "en" && primary !== "es") continue;
    const given = params
      .map((p) => /^\s*q\s*=\s*(.*?)\s*$/i.exec(p)?.[1])
      .find((value) => value !== undefined);
    // A plain decimal is a weight; anything else ("high", "1.2.3", "0x10", "") refuses the language.
    const weight =
      given === undefined ? 1 : /^\d+(?:\.\d*)?$/.test(given) ? Number(given) : Number.NaN;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!best || weight > best.weight) best = { lang: primary, weight };
  }
  return best?.lang ?? "en";
}
