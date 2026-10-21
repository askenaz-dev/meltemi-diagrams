import type { EditOperation } from "@meltemi/diagrams-edit";
import { BUNDLED_FAMILIES } from "@meltemi/diagrams-fonts";
import { resolveTheme, type Theme } from "@meltemi/diagrams-layout";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  THEME_CANVAS_TOKENS,
  THEME_COLOR_TOKENS,
  THEME_TOKENS,
  type ThemeDefinition,
} from "@meltemi/diagrams-model";
import type { DiagramView, DocumentAnalysis } from "./analysis.js";
import type { InspectorField, ThemePanelModel } from "./canvas/protocol.js";
import { messages } from "./messages/index.js";

/** Where the theme a diagram uses is written, when it is a block that can be edited. */
export interface ThemeLocation {
  /** The theme's id in its file. */
  readonly id: string;
  /** The name it resolves under: the id, or `<path>#<id>` inside a project. */
  readonly name: string;
  /** Another file of the project that holds the block; null when it is the document's own. */
  readonly file: string | null;
}

/** The theme a diagram is drawn with: its layout's, or the one its properties name. */
export function effectiveTheme(analysis: DocumentAnalysis, view: DiagramView): Theme {
  if (view.layout?.theme) return view.layout.theme;
  const name =
    view.diagram.properties.theme ?? analysis.layoutOptions.defaultTheme ?? DEFAULT_THEME;
  return resolveTheme(name, analysis.themes).theme;
}

const isBuiltIn = (name: string) => (BUILT_IN_THEMES as readonly string[]).includes(name);

/**
 * The editable theme of a diagram: a `theme` block of the document, or of another file of its
 * project (such as the project's default theme). Built-in themes cannot be edited: undefined.
 */
export function themeLocation(
  analysis: DocumentAnalysis,
  view: DiagramView,
  documentPath?: string,
): ThemeLocation | undefined {
  const name = effectiveTheme(analysis, view).name;
  if (isBuiltIn(name)) return undefined;
  const hash = name.lastIndexOf("#");
  if (hash >= 0) {
    const file = name.slice(0, hash);
    return { id: name.slice(hash + 1), name, file: file === documentPath ? null : file };
  }
  return analysis.compilation.document.themes.some((t) => t.id === name)
    ? { id: name, name, file: null }
    : undefined;
}

/** The name `extends` must write in the new theme's file to reach the current theme. */
export function baseName(analysis: DocumentAnalysis, view: DiagramView): string {
  const name = effectiveTheme(analysis, view).name;
  const hash = name.lastIndexOf("#");
  return hash >= 0 ? name.slice(hash + 1) : name;
}

/** The theme a definition extends, resolved, to show what a token inherits. */
function baseTheme(definition: ThemeDefinition, themes: readonly ThemeDefinition[]): Theme {
  const base = definition.extends ?? DEFAULT_THEME;
  if (isBuiltIn(base)) return resolveTheme(base).theme;
  const found = themes.find((t) => t.id === base || t.id.endsWith(`#${base}`));
  return resolveTheme(found ? found.id : base, themes).theme;
}

type ThemeWords = ReturnType<typeof messages>["themePanel"];

/**
 * The token groups of the theme panel, in the order the language reference lists them; their
 * titles are looked up when the panel is built.
 */
const GROUPS: readonly {
  readonly group: keyof ThemeWords["groups"];
  readonly tokens: readonly string[];
}[] = [
  { group: "base", tokens: ["extends"] },
  { group: "colours", tokens: [...THEME_COLOR_TOKENS] },
  { group: "fonts", tokens: ["font", "mono"] },
  {
    group: "type",
    tokens: [
      "labelSize",
      "descriptionSize",
      "groupTitleSize",
      "noteSize",
      "tagSize",
      "relationLabelSize",
      "frameSize",
      "labelWeight",
    ],
  },
  { group: "spacing", tokens: ["padding", "groupPadding", "groupHeader", "margin"] },
  {
    group: "shapes",
    tokens: ["radius", "groupRadius", "strokeWidth", "connectorWidth", "arrowhead", "arrowSize"],
  },
  { group: "icons", tokens: ["iconSize", "iconPosition"] },
  { group: "frame", tokens: ["frame", "brand", "mark"] },
  { group: "motion", tokens: ["flowDuration", "dashDuration", "pulseDuration", "traceDuration"] },
  { group: "canvas", tokens: [...THEME_CANVAS_TOKENS] },
];

/**
 * The label of a token: a readable one for tokens whose name says little on its own, else the
 * token's name, which is code.
 */
function tokenLabel(token: string): string {
  const labels: Readonly<Record<string, string>> = messages().themePanel.tokens;
  return Object.hasOwn(labels, token) ? labels[token]! : token;
}

/** The families a theme can use and exports embed: the bundled ones and the project's fonts. */
export function embeddableFamilies(analysis: DocumentAnalysis): string[] {
  const library = analysis.fonts as {
    projectFonts?: () => { family: string; restricted: boolean }[];
  };
  const project =
    library
      ?.projectFonts?.()
      .filter((f) => !f.restricted)
      .map((f) => f.family) ?? [];
  return [...new Set([...BUNDLED_FAMILIES.map((f) => f.family), ...project])];
}

/** The first family of a CSS font stack, without quotes. */
export function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/** The fields of one token: its written value, and what it inherits as placeholder. */
function tokenField(
  token: string,
  written: string | number | undefined,
  inherited: unknown,
  families: readonly string[],
  themes: readonly string[],
): InspectorField {
  const spec = THEME_TOKENS[token]!;
  const label = tokenLabel(token);
  const value = written === undefined ? null : written;
  const placeholder = inherited === undefined || inherited === null ? undefined : String(inherited);
  if (token === "extends") {
    return { name: token, label, type: "enum", value, placeholder: DEFAULT_THEME, options: themes };
  }
  if (token === "font" || token === "mono") {
    const shown = value === null ? null : firstFamily(String(value));
    const known = shown === null || families.includes(shown);
    return {
      name: token,
      label,
      type: "enum",
      value: known ? shown : "custom",
      ...(placeholder ? { placeholder: firstFamily(placeholder) } : {}),
      options: known ? families : [...families, "custom"],
    };
  }
  switch (spec.kind) {
    case "color":
      return { name: token, label, type: "color", value, ...(placeholder ? { placeholder } : {}) };
    case "enum":
      return {
        name: token,
        label,
        type: "enum",
        value,
        ...(placeholder ? { placeholder } : {}),
        options: spec.values,
      };
    case "number":
      if (spec.values) {
        return {
          name: token,
          label,
          type: "enum",
          value: value === null ? null : String(value),
          ...(placeholder ? { placeholder } : {}),
          options: spec.values.map(String),
        };
      }
      return { name: token, label, type: "number", value, ...(placeholder ? { placeholder } : {}) };
    case "time":
      return { name: token, label, type: "number", value, ...(placeholder ? { placeholder } : {}) };
    default:
      return { name: token, label, type: "text", value, ...(placeholder ? { placeholder } : {}) };
  }
}

/** The theme panel of an editable theme: its tokens by group, written or inherited. */
export function themePanel(
  analysis: DocumentAnalysis,
  location: ThemeLocation,
): ThemePanelModel | undefined {
  const definition = analysis.themes.find((t) => t.id === location.name);
  if (!definition) return undefined;
  const base = baseTheme(definition, analysis.themes) as unknown as Record<string, unknown>;
  const families = embeddableFamilies(analysis);
  const themes = [
    ...BUILT_IN_THEMES,
    ...analysis.themes
      .map((t) => {
        const hash = t.id.lastIndexOf("#");
        return hash >= 0 ? t.id.slice(hash + 1) : t.id;
      })
      .filter((id) => id !== location.id),
  ];
  const defaults: Readonly<Record<string, number>> = {
    flowDuration: 1200,
    dashDuration: 1000,
    pulseDuration: 1000,
    traceDuration: 1500,
  };
  const titles = messages().themePanel.groups;
  return {
    id: location.id,
    file: location.file,
    groups: GROUPS.map((group) => ({
      title: titles[group.group],
      fields: group.tokens.map((token) =>
        tokenField(
          token,
          token === "extends" ? (definition.extends ?? undefined) : definition.tokens[token],
          base[token] ?? defaults[token],
          families,
          [...new Set(themes)],
        ),
      ),
    })),
  };
}

/**
 * The operation that writes a token from the panel: a family is written as chosen (exports embed
 * it), a weight as a number, and `null` removes the token so the base theme's value applies.
 */
export function themeTokenOperation(
  location: ThemeLocation,
  token: string,
  value: string | number | null,
): EditOperation {
  if (value === null || value === "") {
    return { kind: "removeThemeToken", theme: location.id, token };
  }
  const written = token === "labelWeight" ? Number(value) : value;
  return { kind: "setThemeToken", theme: location.id, token, value: written };
}
