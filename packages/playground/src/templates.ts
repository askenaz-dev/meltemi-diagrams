import { TEMPLATE_CONTENT_KINDS, type TemplateContents } from "@meltemi/diagrams-project";
import { messages } from "./messages/index.js";

/** A template of `init`, as the build writes it into `templates.json`. */
export interface Template {
  readonly name: string;
  /** Its name in words, in English; `templateTitle` gives it in the interface language. */
  readonly title: string;
  readonly description: string;
  readonly contents: TemplateContents;
  /** Text of every file by project path, `project.json` included. */
  readonly files: Readonly<Record<string, string>>;
  /** The pictures of its card, light and dark, as addresses relative to the page. */
  readonly thumbnails: { readonly light: string; readonly dark: string };
}

export interface TemplateSet {
  readonly version: string;
  readonly templates: readonly Template[];
}

/** The file a template opens first: its first diagram. */
export function templateEntry(template: Template): string {
  const paths = Object.keys(template.files).sort();
  return (
    paths.find((p) => p.startsWith("diagrams/") && p.endsWith(".meltemi")) ??
    paths.find((p) => p.endsWith(".meltemi")) ??
    "project.json"
  );
}

/** A word of the catalog by template name, else what the template itself says. */
function byName(words: Readonly<Record<string, string>>, template: Template, own: string): string {
  return Object.hasOwn(words, template.name) ? words[template.name]! : own;
}

/**
 * What a template holds, in the interface language when the catalog knows the template, else as
 * the template says. Its name is the one `init --template` takes, the same in every language.
 */
export function templateDescription(template: Template): string {
  return byName(messages().templates.descriptions, template, template.description);
}

/** A template's title in the interface language, as its card names it. */
export function templateTitle(template: Template): string {
  return byName(messages().templates.titles, template, template.title);
}

/** What a template holds in words, the kinds it has in order: "1 model · 2 views". */
export function templateContents(template: Template): string {
  const held = TEMPLATE_CONTENT_KINDS.map(
    (kind) => [kind, template.contents[kind]] as const,
  ).filter(([, count]) => count > 0);
  return messages().templates.contents(held);
}

/** Whether the files are exactly a template's. */
export function isTemplate(
  files: ReadonlyMap<string, string | Uint8Array>,
  templates: readonly Template[],
): boolean {
  return templates.some((t) => {
    const entries = Object.entries(t.files);
    return (
      entries.length === files.size && entries.every(([path, text]) => files.get(path) === text)
    );
  });
}

export async function loadTemplates(url: string): Promise<TemplateSet> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(messages().page.templatesUnreadable(response.status));
  return (await response.json()) as TemplateSet;
}
