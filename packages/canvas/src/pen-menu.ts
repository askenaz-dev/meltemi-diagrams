import {
  DEFAULT_PEN_STROKE,
  DEFAULT_PEN_WIDTH,
  HIGHLIGHTER,
  PEN_WIDTHS,
  type ColorSwatch,
  type InspectorField,
} from "@meltemi/diagrams-editor/canvas";
import { ICONS, h, icon, s } from "./dom.js";
import { colorRow } from "./inspector.js";
import { messages } from "./messages/index.js";

/** The two tools of the pen button: the pen, and the highlighter. */
export type PenTool = "pen" | "highlighter";

/**
 * What the pen menu chooses, kept with the canvas's state (`PersistedState.pen`): the tool the pen
 * button arms, the pen's width, the pen's colour and the highlighter's colour. A colour is a token
 * written with `@` (`@ink`, `@danger`) or a colour of one's own (`#e03131`).
 */
export interface PenChoice {
  readonly tool: PenTool;
  readonly width: number;
  readonly colour: string;
  readonly highlightColour: string;
}

/** The widths the menu offers: the default (nothing written), then thin, medium and thick. */
const WIDTHS = [
  { name: "default", width: DEFAULT_PEN_WIDTH },
  { name: "thin", width: PEN_WIDTHS.thin },
  { name: "medium", width: PEN_WIDTHS.medium },
  { name: "thick", width: PEN_WIDTHS.thick },
] as const;

/** A colour as `createPen` takes one: `#` and 3, 4, 6 or 8 hex digits, or `@` and a token. */
const COLOUR =
  /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|@[A-Za-z][A-Za-z0-9]{0,63})$/;

/**
 * The choices kept with the canvas's state, or their defaults where they are absent or malformed
 * (a state written by another version, or by hand): the pen, 3 wide, in the theme's `ink`, and the
 * highlighter in the theme's `highlight`.
 */
export function readPenChoice(kept: unknown): PenChoice {
  const value = typeof kept === "object" && kept !== null ? (kept as Record<string, unknown>) : {};
  const colour = (v: unknown, fallback: string): string =>
    typeof v === "string" && COLOUR.test(v) ? v : fallback;
  const width = value.width;
  return {
    tool: value.tool === "highlighter" ? "highlighter" : "pen",
    width: WIDTHS.some((w) => w.width === width) ? (width as number) : DEFAULT_PEN_WIDTH,
    colour: colour(value.colour, DEFAULT_PEN_STROKE),
    highlightColour: colour(value.highlightColour, HIGHLIGHTER.stroke),
  };
}

/** The colour the chosen tool draws in: the pen's or the highlighter's. */
export function toolColour(choice: PenChoice): string {
  return choice.tool === "highlighter" ? choice.highlightColour : choice.colour;
}

/** The width the chosen tool draws with: the pen's, or the highlighter's 20. */
export function toolWidth(choice: PenChoice): number {
  return choice.tool === "highlighter" ? HIGHLIGHTER.width : choice.width;
}

/** How opaque the chosen tool draws: the highlighter at 35 %, the pen whole. */
export function toolOpacity(choice: PenChoice): number {
  return choice.tool === "highlighter" ? HIGHLIGHTER.opacity : 1;
}

/** A wavy stroke of a width, the picture of a width chip. */
function widthGlyph(width: number): SVGSVGElement {
  return s(
    "svg",
    { viewBox: "0 0 28 16", width: 28, height: 16, "aria-hidden": "true", focusable: "false" },
    s("path", {
      d: "M4 11c3.2-5.2 6.6-5.8 10-3s6.8 2.8 10-3",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 0.75 + width * 0.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

/** Arrow keys move the focus among `buttons` (a radio group's one tab stop), wrapping around. */
function roving(group: HTMLElement, buttons: readonly HTMLButtonElement[]): void {
  group.addEventListener("keydown", (e) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    const enabled = buttons.filter((b) => !b.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (step === 0 || index < 0) return;
    e.preventDefault();
    const next = enabled[(index + step + enabled.length) % enabled.length]!;
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
    next.focus();
  });
}

/**
 * The pen menu, behind the arrow of the pen button: the pen or the highlighter (a segmented
 * control whose highlight slides to the tool chosen), the pen's widths (the default, thin, medium
 * and thick; the highlighter's is fixed), and the colour of the tool chosen, as the strip's colour
 * row (the tool's own colour first, then the theme's tokens and a colour of one's own). Every
 * choice is kept and arms its tool at once, and the menu stays open, so a width and a colour are
 * chosen together; a press on the canvas closes it and draws. Escape closes it and gives the focus
 * back to the arrow.
 */
export class PenMenu {
  readonly element = h("div", {
    class: "pen-menu",
    id: "mdg-pen",
    role: "dialog",
    hidden: true,
    "aria-label": messages().pen.label,
  });
  private readonly tools = h("div", {
    class: "pen-segments pen-tools",
    role: "radiogroup",
    "aria-label": messages().pen.tools,
  });
  private readonly toolSlider = h("span", { class: "pen-slider", "aria-hidden": "true" });
  private readonly widthValue = h("span", { class: "value", "data-value": "" });
  private readonly widths = h("div", {
    class: "pen-segments pen-widths",
    role: "radiogroup",
    "aria-labelledby": "mdg-pen-width",
  });
  private readonly widthSlider = h("span", { class: "pen-slider", "aria-hidden": "true" });
  /**
   * The colour row, drawn again at every choice, and the ring that slides to the chip chosen: the
   * ring stays in the page meanwhile, so that it slides rather than appears.
   */
  private readonly ring = h("span", { class: "pen-ring", "aria-hidden": "true" });
  private readonly colourRow = h("div", { class: "pen-colour-row" });
  private readonly colours = h("div", { class: "pen-colours" }, this.ring, this.colourRow);
  private readonly toolButtons: HTMLButtonElement[];
  private readonly widthButtons: HTMLButtonElement[];
  private choice: PenChoice = readPenChoice(undefined);
  private swatches: readonly ColorSwatch[] = [];
  private change: ((choice: PenChoice) => void) | undefined;
  private opener: HTMLElement | undefined;
  private returnFocus: HTMLElement | null = null;
  /** A press elsewhere closes the menu; a press on its own arrow closes it through the arrow. */
  private readonly outside = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!this.element.contains(target) && !this.opener?.contains(target)) this.close(false);
  };

  constructor() {
    const words = messages().pen;
    const tools = messages().palette.tools;
    this.toolButtons = (["pen", "highlighter"] as const).map((tool) => {
      const key = tool === "pen" ? "P" : "H";
      const button = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "pen-segment pen-tool",
          "aria-label": tools[tool],
          title: `${tools[tool]} (${key})`,
          "aria-keyshortcuts": key,
          "data-pen-tool": tool,
        },
        icon(ICONS[tool]),
        h("span", { class: "name" }, tools[tool]),
        h("span", { class: "key", "aria-hidden": "true" }, key),
      );
      button.addEventListener("click", () => this.choose({ tool }));
      return button;
    });
    this.tools.append(this.toolSlider, ...this.toolButtons);
    roving(this.tools, this.toolButtons);
    this.widthButtons = WIDTHS.map(({ name, width }) => {
      const label = words.widthChip(words.widths[name], width);
      const button = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: name === "default" ? "pen-segment pen-width default" : "pen-segment pen-width",
          "aria-label": label,
          title: label,
          "data-width": width,
        },
        widthGlyph(width),
      );
      button.addEventListener("click", () => this.choose({ width }));
      return button;
    });
    this.widths.append(this.widthSlider, ...this.widthButtons);
    roving(this.widths, this.widthButtons);
    this.element.append(
      this.tools,
      h(
        "div",
        { class: "pen-field" },
        h(
          "div",
          { class: "row-label" },
          h("span", { id: "mdg-pen-width" }, words.width),
          this.widthValue,
        ),
        this.widths,
      ),
      this.colours,
    );
    // Escape and Tab first, before the colour row keeps its keys to itself.
    this.element.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.close(true);
        }
      },
      true,
    );
    // The canvas's keys stay out while the menu has the keyboard.
    this.element.addEventListener("keydown", (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /**
   * Opens the menu at `at` (in the coordinates of the element it lives in, kept inside `bounds`)
   * with `choice` shown and its tool focused; `change` gets every new choice. `opener`, the arrow
   * pressed, is marked expanded while the menu is open.
   */
  open(options: {
    readonly at: { readonly x: number; readonly y: number };
    readonly bounds: { readonly width: number; readonly height: number };
    readonly choice: PenChoice;
    readonly swatches: readonly ColorSwatch[];
    readonly change: (choice: PenChoice) => void;
    readonly opener?: HTMLElement;
  }): void {
    this.close(false);
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.change = options.change;
    this.swatches = options.swatches;
    this.opener = options.opener;
    this.opener?.setAttribute("aria-expanded", "true");
    this.element.hidden = false;
    // The highlights start where they belong, without sliding there from nowhere.
    this.element.classList.add("still");
    this.show(options.choice);
    const { at, bounds } = options;
    const x = Math.min(at.x, bounds.width - this.element.offsetWidth - 4);
    const y = Math.min(at.y, bounds.height - this.element.offsetHeight - 4);
    this.element.style.left = `${Math.max(0, x)}px`;
    this.element.style.top = `${Math.max(0, y)}px`;
    this.placeRing();
    requestAnimationFrame(() => this.element.classList.remove("still"));
    document.addEventListener("pointerdown", this.outside, true);
    this.toolButtons.find((b) => b.tabIndex === 0)?.focus();
  }

  /** Closes the menu; with `refocus`, the focus goes back to where it was opened from. */
  close(refocus = true): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    document.removeEventListener("pointerdown", this.outside, true);
    this.opener?.setAttribute("aria-expanded", "false");
    this.opener = undefined;
    this.change = undefined;
    if (refocus) this.returnFocus?.focus();
  }

  /** Shows a choice made elsewhere (P or H while the menu is open), and new theme colours. */
  sync(choice: PenChoice, swatches?: readonly ColorSwatch[]): void {
    if (!this.isOpen) return;
    if (swatches) this.swatches = swatches;
    this.show(choice);
    this.placeRing();
  }

  private choose(part: Partial<PenChoice>): void {
    const next = { ...this.choice, ...part };
    this.show(next);
    this.placeRing();
    this.change?.(next);
  }

  /** Draws `choice`: the tool and the width pressed, the colour row of the tool. */
  private show(choice: PenChoice): void {
    const words = messages().pen;
    this.choice = choice;
    const toolIndex = choice.tool === "pen" ? 0 : 1;
    this.toolButtons.forEach((button, i) => {
      button.setAttribute("aria-checked", String(i === toolIndex));
      button.tabIndex = i === toolIndex ? 0 : -1;
    });
    this.toolSlider.style.setProperty("--index", String(toolIndex));
    // The highlighter is always 20 wide: its widths are greyed and the row says why.
    const fixed = choice.tool === "highlighter";
    const widthIndex = fixed ? -1 : WIDTHS.findIndex((w) => w.width === choice.width);
    this.widthButtons.forEach((button, i) => {
      button.setAttribute("aria-checked", String(i === widthIndex));
      button.tabIndex = i === Math.max(0, widthIndex) ? 0 : -1;
      button.disabled = fixed;
    });
    this.widths.classList.toggle("fixed", fixed);
    this.widths.title = fixed ? words.fixedWidth(HIGHLIGHTER.width) : "";
    this.widthSlider.hidden = widthIndex < 0;
    this.widthSlider.style.setProperty("--index", String(Math.max(0, widthIndex)));
    this.widthValue.textContent = words.pixels(toolWidth(choice));
    this.drawColours(choice);
  }

  /** The colour row of the tool chosen, its own default first; the focus stays on its chip. */
  private drawColours(choice: PenChoice): void {
    const words = messages().pen;
    const focused = this.colours.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.key
      : undefined;
    const colour = toolColour(choice);
    const first = (choice.tool === "pen" ? DEFAULT_PEN_STROKE : HIGHLIGHTER.stroke).slice(1);
    const swatches = [
      ...this.swatches.filter((s) => s.token === first),
      ...this.swatches.filter((s) => s.token !== first),
    ];
    const field: InspectorField = {
      name: `pen.${choice.tool}`,
      label: words.colour[choice.tool],
      type: "color",
      value: colour.startsWith("@") ? colour.slice(1) : colour,
      swatches,
    };
    const row = colorRow(
      field,
      (value) => {
        if (typeof value !== "string" || value === "") return;
        const written = value.startsWith("#") ? value : `@${value}`;
        this.choose(choice.tool === "pen" ? { colour: written } : { highlightColour: written });
      },
      null,
    );
    this.colourRow.replaceChildren(row);
    if (focused) {
      this.colours.querySelector<HTMLElement>(`[data-key="${CSS.escape(focused)}"]`)?.focus();
    }
  }

  /** Puts the ring around the colour chosen, sliding from the one chosen before. */
  private placeRing(): void {
    const chip = this.colours.querySelector<HTMLElement>('button.chip[aria-checked="true"]');
    this.ring.hidden = chip === null;
    if (!chip) return;
    const base = this.colours.getBoundingClientRect();
    const box = chip.getBoundingClientRect();
    this.ring.style.transform = `translate(${box.left - base.left}px, ${box.top - base.top}px)`;
    this.ring.style.width = `${box.width}px`;
    this.ring.style.height = `${box.height}px`;
  }
}
