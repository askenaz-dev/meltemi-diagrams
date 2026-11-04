import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import type { CatalogData, CatalogEntity, CatalogEntry } from "./data.js";
import { messages } from "./messages/index.js";
import { href, type Route } from "./routes.js";

/**
 * How a diagram type (`flow`, `free`, `sequence`, `c4`), a story (`story`) or an entity (`entity`)
 * reads in the catalog, in a language: `Sequence`, `Secuencia`. Undefined for other kinds.
 */
export function kindLabel(kind: string, locale: Locale = DEFAULT_LOCALE): string | undefined {
  const labels: Readonly<Record<string, string>> = messages(locale).kinds;
  return Object.hasOwn(labels, kind) ? labels[kind] : undefined;
}

export interface SearchResult {
  readonly kind: "diagram" | "story" | "entity";
  readonly key: string;
  readonly title: string;
  readonly href: string;
  /** The folder of a diagram or story; the model of an entity. */
  readonly place: string;
  /** The kind in the catalog's language: `Flow`, `Sequence`, `C4`, `Free`, `Story` or `Entity`. */
  readonly label: string;
  /** Where the words matched besides the title, such as `element “Pedidos”`. */
  readonly matches: readonly string[];
  readonly score: number;
}

interface Field {
  readonly text: string;
  readonly weight: number;
  /** What the result says when the field matches; null for titles and ids. */
  readonly context: string | null;
}

/** Text for comparison: lower case, without accents, spaces collapsed. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The words a kind is found by: its label, and its keyword when the label reads otherwise. */
function kindFields(kind: string, locale: Locale): Field[] {
  const label = kindLabel(kind, locale) ?? kind;
  return (normalize(label) === kind ? [label] : [label, kind]).map((text) => ({
    text,
    weight: 1,
    context: null,
  }));
}

function entryFields(entry: CatalogEntry, locale: Locale): Field[] {
  const t = messages(locale).search;
  const fields: Field[] = [
    { text: entry.title ?? "", weight: 3, context: null },
    { text: entry.id, weight: 3, context: null },
    { text: entry.file, weight: 1, context: t.file(entry.file) },
    { text: entry.description ?? "", weight: 1, context: t.description },
  ];
  if (entry.kind === "story") {
    fields.push(...kindFields("story", locale));
    for (const scene of entry.document.timeline.scenes) {
      const title = scene.title ?? scene.id;
      fields.push({ text: title, weight: 2, context: t.scene(title) });
    }
    return fields;
  }
  fields.push(...kindFields(entry.type, locale));
  for (const element of entry.elements) {
    fields.push({ text: element.label, weight: 2, context: t.element(element.label) });
    if (element.id !== element.label) {
      fields.push({ text: element.id, weight: 2, context: t.element(element.label) });
    }
    if (element.technology) {
      fields.push({
        text: element.technology,
        weight: 1,
        context: t.technologyOf(element.label, element.technology),
      });
    }
    if (element.description) {
      fields.push({
        text: element.description,
        weight: 1,
        context: t.descriptionOf(element.label, element.description),
      });
    }
  }
  for (const relation of entry.relations) {
    if (relation.label) {
      fields.push({ text: relation.label, weight: 2, context: t.relation(relation.label) });
    }
    if (relation.technology) {
      fields.push({
        text: relation.technology,
        weight: 1,
        context: t.technology(relation.technology),
      });
    }
  }
  return fields;
}

function entityFields(entity: CatalogEntity, locale: Locale): Field[] {
  const t = messages(locale).search;
  return [
    { text: entity.label, weight: 3, context: null },
    { text: entity.path, weight: 3, context: null },
    { text: entity.kind, weight: 1, context: null },
    {
      text: entity.technology ?? "",
      weight: 1,
      context: entity.technology ? t.technology(entity.technology) : null,
    },
    { text: entity.description ?? "", weight: 1, context: t.description },
  ];
}

function score(
  words: readonly string[],
  fields: readonly Field[],
): { score: number; matches: string[] } | null {
  const normalized = fields.map((f) => ({ ...f, text: normalize(f.text) }));
  let total = 0;
  const matches: string[] = [];
  for (const word of words) {
    let best = 0;
    for (const field of normalized) {
      const at = field.text.indexOf(word);
      if (at < 0) continue;
      // A whole field weighs more than the start of a word, which weighs more than a part.
      const bonus =
        field.text === word ? 1 : at === 0 || /[\s._/-]/.test(field.text[at - 1]!) ? 0.5 : 0;
      best = Math.max(best, field.weight + bonus);
      if (field.context && !matches.includes(field.context)) matches.push(field.context);
    }
    if (best === 0) return null;
    total += best;
  }
  return { score: total, matches: matches.slice(0, 3) };
}

/**
 * The entries and entities that match every word of `query`, ignoring case and accents: titles and
 * ids first, then elements and relations, then descriptions (decision 0027). Labels and where the
 * words matched are in `locale`, whose kind names are searched too.
 */
export function searchCatalog(
  data: CatalogData,
  query: string,
  locale: Locale = DEFAULT_LOCALE,
): SearchResult[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const results: SearchResult[] = [];
  for (const entry of data.entries) {
    const found = score(words, entryFields(entry, locale));
    if (!found) continue;
    const route: Route =
      entry.kind === "story"
        ? { page: "story", key: entry.key }
        : { page: "diagram", key: entry.key, scenario: null, element: null };
    results.push({
      kind: entry.kind,
      key: entry.key,
      title: entry.title ?? entry.id,
      href: href(route),
      place: entry.folder,
      label: kindLabel(entry.kind === "story" ? "story" : entry.type, locale) ?? entry.kind,
      ...found,
    });
  }
  for (const entity of data.entities) {
    const found = score(words, entityFields(entity, locale));
    if (!found) continue;
    results.push({
      kind: "entity",
      key: entity.key,
      title: entity.label,
      href: href({ page: "entity", key: entity.key }),
      place: entity.model,
      label: messages(locale).kinds.entity,
      ...found,
    });
  }
  return results.sort(
    (a, b) =>
      b.score - a.score ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}
