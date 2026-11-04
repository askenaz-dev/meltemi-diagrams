import type { InspectorField } from "@meltemi/diagrams-editor/canvas";
import { h } from "./dom.js";
import { messages } from "./messages/index.js";

export const PROPERTY_TABS = ["style", "text", "layout", "effects", "details"] as const;
export type PropertyTab = (typeof PROPERTY_TABS)[number];

const TEXT = new Set([
  "color",
  "font",
  "fontSize",
  "fontWeight",
  "textAlign",
  "verticalAlign",
  "labelPosition",
]);
const LAYOUT = new Set([
  "x",
  "y",
  "width",
  "height",
  "w",
  "h",
  "rotation",
  "direction",
  "layout",
  "routing",
  "layer",
  "layers",
  "canvas",
  "spacing",
  "align",
  "labelAt",
  "labelOffset.x",
  "labelOffset.y",
]);

/** Categories use protocol names, never the translated label or current field value. */
export function propertyTab(field: Pick<InspectorField, "name" | "section">): PropertyTab {
  const name = field.name;
  if (name.startsWith("effect.")) return "effects";
  if (name.startsWith("style.")) {
    const property = name.slice(6);
    if (TEXT.has(property)) return "text";
    return property === "rotation" || property === "routing" ? "layout" : "style";
  }
  if (LAYOUT.has(name) || name.startsWith("canvas.") || name.startsWith("route.")) return "layout";
  if (name === "theme" || field.section === "strip") return "style";
  return "details";
}

/** Theme tokens are partitioned too; text colours stay with the words they affect. */
export function themeTab(name: string): PropertyTab {
  if (
    /^(font|mono|ink|muted|tagText|stickyText|labelSize|descriptionSize|groupTitleSize|noteSize|tagSize|relationLabelSize|frameSize|labelWeight)$/.test(
      name,
    )
  )
    return "text";
  if (/^(flow|dash|pulse|trace)Duration$/.test(name)) return "effects";
  if (/^(padding|groupPadding|groupHeader|margin|frame|brand|mark|canvas|grid)/.test(name))
    return "layout";
  return "style";
}

export interface PropertyPanels {
  readonly navigation: HTMLElement;
  readonly panels: ReadonlyMap<PropertyTab, HTMLElement>;
  readonly active: PropertyTab;
}

/** Mounted panels preserve drafts when switching categories; only the active one is exposed. */
export function propertyPanels(
  prefix: string,
  available: ReadonlySet<PropertyTab>,
  preferred: PropertyTab,
  changed: (tab: PropertyTab) => void,
): PropertyPanels {
  const words = messages().inspector;
  const tabs = PROPERTY_TABS.filter((tab) => available.has(tab));
  let active = available.has(preferred) ? preferred : (tabs[0] ?? "details");
  const navigation = h("div", {
    class: "property-tabs",
    role: "tablist",
    "aria-label": words.categories,
  });
  const panels = new Map<PropertyTab, HTMLElement>();
  const buttons = new Map<PropertyTab, HTMLButtonElement>();
  const activate = (tab: PropertyTab, focus: boolean) => {
    active = tab;
    for (const [id, button] of buttons) {
      button.setAttribute("aria-selected", String(id === active));
      button.tabIndex = id === active ? 0 : -1;
      panels.get(id)!.hidden = id !== active;
    }
    changed(active);
    if (focus) buttons.get(active)!.focus();
  };
  for (const tab of tabs) {
    const id = `${prefix}-tab-${tab}`;
    const panelId = `${prefix}-panel-${tab}`;
    const button = h(
      "button",
      {
        type: "button",
        role: "tab",
        id,
        "data-key": id,
        "aria-controls": panelId,
        "aria-selected": String(tab === active),
        tabindex: tab === active ? 0 : -1,
      },
      words.tabs[tab],
    );
    button.addEventListener("click", () => activate(tab, false));
    button.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : undefined;
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      activate(tabs[next]!, true);
    });
    buttons.set(tab, button);
    panels.set(
      tab,
      h("section", {
        class: "property-panel",
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": id,
        hidden: tab !== active,
      }),
    );
    navigation.append(button);
  }
  return { navigation, panels, active };
}
