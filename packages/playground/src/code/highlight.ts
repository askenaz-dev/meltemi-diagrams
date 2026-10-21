import { semanticTokens, type DocumentAnalysis } from "@meltemi/diagrams-editor";
import { tokenize } from "@meltemi/diagrams-language";

/** The keyword lists of the TextMate grammar, by scope, which the build passes in. */
declare const __MELTEMI_WORDS__: readonly { readonly scope: string; readonly pattern: string }[];

/** A class for a range of the text. */
export interface Span {
  readonly start: number;
  readonly end: number;
  readonly cls: string;
}

/** Grammar scopes to classes, most specific first. */
const SCOPES: readonly [string, string][] = [
  ["keyword.control", "hl-keyword"],
  ["keyword.other", "hl-keyword"],
  ["storage.type", "hl-type"],
  ["support.type.property-name", "hl-property"],
  ["constant.language", "hl-constant"],
];

const WORDS: readonly { readonly cls: string; readonly re: RegExp }[] = (
  typeof __MELTEMI_WORDS__ === "undefined" ? [] : __MELTEMI_WORDS__
).flatMap(({ scope, pattern }) => {
  const cls = SCOPES.find(([prefix]) => scope.startsWith(prefix))?.[1];
  return cls ? [{ cls, re: new RegExp(`^(?:${pattern})$`) }] : [];
});

const wordClasses = new Map<string, string | null>();

/** The class of a word of the language (keyword, element type, property, value), if any. */
export function wordClass(word: string): string | undefined {
  let cls = wordClasses.get(word);
  if (cls === undefined) {
    cls = WORDS.find((w) => w.re.test(word))?.cls ?? null;
    wordClasses.set(word, cls);
  }
  return cls ?? undefined;
}

/** Comments, strings, numbers, arrows and the language's words of a `.meltemi` text. */
export function lexicalSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const token of tokenize(text).tokens) {
    for (const trivia of token.leadingTrivia) {
      if (trivia.kind === "LineComment" || trivia.kind === "BlockComment") {
        spans.push({ start: trivia.start, end: trivia.end, cls: "hl-comment" });
      }
    }
    if (token.end <= token.start) continue;
    let cls: string | undefined;
    switch (token.kind) {
      case "String":
        cls = /^"#[0-9A-Fa-f]{3,8}"$/.test(token.text) ? "hl-string hl-color" : "hl-string";
        break;
      case "Number":
        cls = "hl-number";
        break;
      case "Arrow":
      case "DashedArrow":
      case "BothArrow":
      case "DashedBothArrow":
        cls = "hl-arrow";
        break;
      case "LBrace":
      case "RBrace":
      case "LParen":
      case "RParen":
      case "LBracket":
      case "RBracket":
        cls = "hl-bracket";
        break;
      case "Identifier":
        cls = wordClass(token.text);
        break;
      case "Unknown":
        cls = "hl-invalid";
        break;
      default:
        cls = undefined;
    }
    if (cls) spans.push({ start: token.start, end: token.end, cls });
  }
  return spans;
}

/** Ids of elements, relations, groups, ports, classes and themes, from the analysis. */
export function semanticSpans(analysis: DocumentAnalysis): Span[] {
  return semanticTokens(analysis).map((t) => ({
    start: t.start,
    end: t.start + t.length,
    cls: `hl-${t.type}${t.declaration ? " hl-declaration" : ""}`,
  }));
}

/** The lexical spans with the semantic ones in place of words they cover. */
export function mergeSpans(lexical: readonly Span[], semantic: readonly Span[]): Span[] {
  if (semantic.length === 0) return [...lexical];
  const covered = new Map(semantic.map((s) => [s.start, s]));
  const merged = lexical.filter((s) => {
    const over = covered.get(s.start);
    return !over || s.cls.startsWith("hl-comment") || s.cls.startsWith("hl-string");
  });
  const starts = new Set(merged.map((s) => s.start));
  for (const span of semantic) if (!starts.has(span.start)) merged.push(span);
  return merged.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Writes `text` into an element with the spans as classed `<span>`s; overlapping spans keep the
 * first. A last empty line gets its height, as in the text area above it.
 */
export function paint(element: HTMLElement, text: string, spans: readonly Span[]): void {
  const fragment = document.createDocumentFragment();
  let at = 0;
  for (const span of spans) {
    if (span.start < at || span.end <= span.start) continue;
    if (span.start > at) fragment.append(text.slice(at, span.start));
    const node = document.createElement("span");
    node.className = span.cls;
    node.textContent = text.slice(span.start, span.end);
    fragment.append(node);
    at = span.end;
  }
  fragment.append(`${text.slice(at)}\n`);
  element.replaceChildren(fragment);
}
