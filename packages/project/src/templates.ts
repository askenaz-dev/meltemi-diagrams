/** The templates of `init` and the playground, in the order they are listed (decision 0028). */
export const TEMPLATES = {
  flow: "A flow diagram to start from",
  c4: "An architecture model with a context view and a container view",
  sequence: "A sequence diagram with a scenario for each outcome",
  free: "A slide composed freely: text, boxes, an icon and a group",
  purchase:
    "The reference example: a model, its C4 views, a payment sequence, an executive slide, an animated story and export profiles",
} as const;

export type TemplateName = keyof typeof TEMPLATES;

/** The versions a new project pins. */
export interface TemplateVersions {
  readonly toolVersion: string;
  readonly languageVersion: string;
}

/** The `project.json` text of a new project made from a template. */
export function templateManifest(
  name: string,
  template: TemplateName,
  versions: TemplateVersions,
): string {
  const manifest: Record<string, unknown> = {
    name,
    language: versions.languageVersion,
    tools: { "meltemi-diagrams": `^${versions.toolVersion}` },
  };
  if (template === "purchase") {
    manifest.catalog = {
      title: "Purchase",
      description:
        "The reference purchase: architecture, payment sequence, executive slide and an animated walkthrough.",
    };
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
