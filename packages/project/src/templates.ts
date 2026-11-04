/**
 * What a template holds, by kind: C4 views of a model are `views`, every other diagram is a
 * diagram, and stories walk through them.
 */
export interface TemplateContents {
  readonly diagrams: number;
  readonly models: number;
  readonly views: number;
  readonly stories: number;
}

/** A template as `init --list` and the playground's New project describe it. */
export interface TemplateInfo {
  /** Its name in words, for a person choosing it. */
  readonly title: string;
  readonly description: string;
  readonly contents: TemplateContents;
}

const contents = (counts: Partial<TemplateContents>): TemplateContents => ({
  diagrams: 0,
  models: 0,
  views: 0,
  stories: 0,
  ...counts,
});

/**
 * The templates of `init` and the playground, in the order they are listed (decision 0028), with
 * their titles, descriptions and contents in English. Hosts translate the titles and descriptions
 * by name; the contents are checked against the templates' files by the CLI's tests.
 */
export const TEMPLATES = {
  flow: {
    title: "Flow diagram",
    description: "A flow diagram to start from",
    contents: contents({ diagrams: 1 }),
  },
  c4: {
    title: "C4 model",
    description: "An architecture model with a context view and a container view",
    contents: contents({ models: 1, views: 2 }),
  },
  sequence: {
    title: "Sequence diagram",
    description: "A sequence diagram with a scenario for each outcome",
    contents: contents({ diagrams: 1 }),
  },
  free: {
    title: "Slide",
    description: "A slide composed freely: text, boxes, an icon and a group",
    contents: contents({ diagrams: 1 }),
  },
  kanban: {
    title: "Kanban board",
    description: "A board of columns and sticky cards",
    contents: contents({ diagrams: 1 }),
  },
  whiteboard: {
    title: "Whiteboard",
    description: "A sketched board with strokes, stickies and a story that draws them",
    contents: contents({ diagrams: 1, stories: 1 }),
  },
  purchase: {
    title: "Purchase example",
    description:
      "The reference example: a model, its C4 views, a payment sequence, an executive slide, an animated story and export profiles",
    contents: contents({ models: 1, views: 2, diagrams: 2, stories: 1 }),
  },
} as const satisfies Readonly<Record<string, TemplateInfo>>;

export type TemplateName = keyof typeof TEMPLATES;

/** The kinds of a template's contents in the order hosts list them. */
export const TEMPLATE_CONTENT_KINDS = ["models", "views", "diagrams", "stories"] as const;

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
