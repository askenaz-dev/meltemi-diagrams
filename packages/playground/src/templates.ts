import { messages } from "./messages/index.js";

/** A template of `init`, as the build writes it into `templates.json`. */
export interface Template {
  readonly name: string;
  readonly description: string;
  /** Text of every file by project path, `project.json` included. */
  readonly files: Readonly<Record<string, string>>;
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

/**
 * What a template holds, in the interface language when the catalog knows the template, else as
 * the template says. Its name is the one `init --template` takes, the same in every language.
 */
export function templateDescription(template: Template): string {
  const descriptions: Readonly<Record<string, string>> = messages().templates.descriptions;
  return Object.hasOwn(descriptions, template.name)
    ? descriptions[template.name]!
    : template.description;
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
