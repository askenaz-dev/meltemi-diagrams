import { isToken, type Range } from "@meltemi/diagrams-language";
import {
  BACKGROUND_WORDS,
  EXPORT_FORMATS,
  EXPORT_OPTIONS,
  type ExportProfile,
} from "@meltemi/diagrams-model";
import type { DocumentAnalysis } from "../analysis.js";
import { entryOf, serviceMessages } from "../messages/services.js";
import { tokenAt } from "../syntax.js";
import type { CompletionItem } from "./completion.js";
import type { SymbolNode } from "./navigation.js";

/** What an option of an `export` profile does, in the interface language, for hovers and completion. */
function exportDoc(word: string): string | undefined {
  return entryOf(serviceMessages().exportOptions, word);
}

const ID = "[A-Za-z_][A-Za-z0-9_]*";
const match = (prefix: string, pattern: string) => new RegExp(`^${pattern}$`).exec(prefix);

/** The profile whose block contains `offset`. */
export function profileAt(analysis: DocumentAnalysis, offset: number): ExportProfile | undefined {
  return analysis.compilation.document.exports.find(
    (p) => p.node.start <= offset && offset <= p.node.end,
  );
}

function words(
  values: readonly string[],
  kind: CompletionItem["kind"],
  range: CompletionItem["range"],
): CompletionItem[] {
  return values.map((label) => {
    const detail = exportDoc(label);
    return detail ? { label, kind, detail, range } : { label, kind, range };
  });
}

/** What a profile can export: the file's diagrams and stories, and the imported names. */
function targets(analysis: DocumentAnalysis, range: CompletionItem["range"]): CompletionItem[] {
  const t = serviceMessages().completion;
  const document = analysis.compilation.document;
  return [
    ...document.diagrams.map((d): CompletionItem => ({
      label: d.id,
      kind: "value",
      detail: t.diagram(d.type),
      range,
    })),
    ...document.stories.map((s): CompletionItem => ({
      label: s.id,
      kind: "value",
      detail: t.story,
      range,
    })),
    ...document.imports.flatMap((i) =>
      i.bindings.map((b): CompletionItem => ({
        label: i.form === "namespace" ? `${b.name}.` : b.name,
        kind: "value",
        detail: t.imported,
        range,
      })),
    ),
  ];
}

/** `export <id> for <target>` at the top level. */
export function profileHeaderCompletions(
  analysis: DocumentAnalysis,
  prefix: string,
  range: CompletionItem["range"],
): CompletionItem[] | undefined {
  if (match(prefix, `export\\s+${ID}\\s+\\w*`)) return words(["for"], "keyword", range);
  if (match(prefix, `export\\s+${ID}\\s+for\\s+[\\w.]*`)) return targets(analysis, range);
  return undefined;
}

/** Completion inside an `export` block: options, and the values of the option being written. */
export function profileCompletions(
  analysis: DocumentAnalysis,
  prefix: string,
  range: CompletionItem["range"],
  offset: number,
): CompletionItem[] {
  const profile = profileAt(analysis, offset);
  if (match(prefix, `format\\s+\\w*`)) return words(EXPORT_FORMATS, "value", range);
  if (match(prefix, `motion\\s+\\w*`)) return words(["static", "animated"], "value", range);
  if (match(prefix, `fonts\\s+\\w*`))
    return words(["embedded", "outlined", "system"], "value", range);
  if (match(prefix, `background\\s+\\w*`)) return words(BACKGROUND_WORDS, "value", range);
  if (match(prefix, `scenario\\s+\\w*`)) {
    return (profile?.target.diagram?.scenarios ?? []).map((s) => ({
      label: s.id,
      kind: "value" as const,
      detail: s.label,
      range,
    }));
  }
  if (prefix === "" || match(prefix, ID)) {
    // Options that apply to the profile's format, once it is written.
    const format = profile?.format;
    const written = new Set(profile?.options.map((o) => o.name) ?? []);
    const names = Object.entries(EXPORT_OPTIONS)
      .filter(
        ([name, option]) =>
          !written.has(name) && (!format || (option.formats as readonly string[]).includes(format)),
      )
      .map(([name]) => name);
    return words(names, "property", range);
  }
  return [];
}

/** Hovers inside a profile: the options, the profile and its target. */
export function profileHover(
  analysis: DocumentAnalysis,
  offset: number,
): { range: Range; markdown: string } | undefined {
  const profile = profileAt(analysis, offset);
  if (!profile) return undefined;
  const words = serviceMessages();
  const t = words.profile;
  const lines = analysis.compilation.parse.lines;
  if (profile.idRange.start.offset <= offset && offset <= profile.idRange.end.offset) {
    const facts = [
      profile.format ? profile.format.toUpperCase() : t.noFormat,
      t.target(profile.target.kind, profile.target.name),
      ...(profile.size ? [`${profile.size.width} × ${profile.size.height}`] : []),
      ...(profile.scale !== null ? [t.scale(profile.scale)] : []),
      ...(profile.background ? [t.background(profile.background.replace(/^@/, ""))] : []),
      ...(profile.atMs !== null ? [t.at(profile.atMs)] : []),
    ];
    return { range: profile.idRange, markdown: t.heading(profile.id, facts.join(", ")) };
  }
  const target = profile.node.target;
  if (target && target.kind === "QualifiedRef" && target.start <= offset && offset <= target.end) {
    const markdown =
      profile.target.kind === "story"
        ? `${words.headings.story(profile.target.name)}${profile.target.story?.title ? ` — ${profile.target.story.title}` : ""}`
        : profile.target.diagram
          ? `${words.headings.diagram(profile.target.diagram.type, profile.target.name)}${profile.target.file !== null ? words.imported : ""}`
          : t.notFound(profile.target.name);
    return { range: lines.range(target), markdown };
  }
  const token = tokenAt(analysis.compilation.parse.root, offset);
  if (!token || !isToken(token) || token.kind !== "Identifier") return undefined;
  const doc = exportDoc(token.text);
  return doc ? { range: lines.range(token), markdown: `**${token.text}** — ${doc}` } : undefined;
}

/** Profiles in the outline. */
export function profileSymbols(analysis: DocumentAnalysis): SymbolNode[] {
  const t = serviceMessages().profile;
  return analysis.compilation.document.exports.map((p) => ({
    name: p.id,
    detail: t.symbol(p.format ?? "?", p.target.name),
    kind: "export",
    range: p.range,
    selectionRange: p.idRange,
    children: [],
  }));
}

/** Where the target of the profile under the cursor is declared, in this file. */
export function profileDefinition(analysis: DocumentAnalysis, offset: number): Range | undefined {
  const profile = profileAt(analysis, offset);
  const target = profile?.node.target;
  if (
    !profile ||
    !target ||
    target.kind !== "QualifiedRef" ||
    offset < target.start ||
    offset > target.end
  ) {
    return undefined;
  }
  if (profile.target.story) return profile.target.story.idRange;
  return profile.target.file === null ? profile.target.diagram?.idRange : undefined;
}
