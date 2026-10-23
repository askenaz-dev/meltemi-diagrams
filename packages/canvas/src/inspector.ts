import type {
  CanvasAction,
  ColorSwatch,
  InspectorField,
  InspectorModel,
  ThemePanelModel,
} from "@meltemi/diagrams-editor/canvas";
import { ICONS, clear, h, icon } from "./dom.js";
import { glyph, glyphName, type GlyphFamily } from "./glyphs.js";
import { messages } from "./messages/index.js";

const COLOR_TOKENS = [
  "accent",
  "accentEnd",
  "ink",
  "muted",
  "surface",
  "background",
  "line",
  "connector",
  "band",
  "bandLine",
  "tag",
  "tagText",
  "success",
  "warning",
  "danger",
  "info",
];

type Value = string | number | null;
type Send = (value: Value) => void;

/** What the inspector asks of the canvas besides writing a field. */
export interface InspectorActions {
  /** Writes a field of the selection (or of the diagram when nothing is selected). */
  commit(ids: readonly string[], field: string, value: Value): void;
  /**
   * Writes a slider's value as it is let go or stepped with the keys; while an edit is pending,
   * only the latest value is written, after it.
   */
  slide(ids: readonly string[], field: string, value: number): void;
  /**
   * Opens the canvas's icon picker under `anchor` for an icon field of the targets: `style.icon`,
   * or the `source` of an icon object.
   */
  pickIcon(ids: readonly string[], field: string, anchor: HTMLElement): void;
  /** Asks the id and place of a theme that extends `current`. */
  newTheme(current: string, project: boolean): void;
  /** Opens the theme panel on the diagram's theme. */
  editTheme(): void;
  /** Sends an action of a field's button, such as Convert to container. */
  act(action: CanvasAction): void;
}

const keyOf = (name: string) => `mdg-field-${name.replace(/\W/g, "-")}`;

/**
 * Whether a render must wait for the field being typed in: the focused text holds something not
 * written yet, which a redraw would lose. A field whose value was just written is redrawn.
 */
function holdsTyping(
  focused: HTMLElement | null,
  root: HTMLElement,
  fields: readonly InspectorField[],
  prefix = "",
): boolean {
  if (!focused || !root.contains(focused)) return false;
  // A slider stepped past the written value holds until the value it shows is written, so keys
  // held down step on from it; a colour picker writes when it closes and holds nothing.
  if (focused instanceof HTMLInputElement && focused.type === "range") {
    const field = fields.find((f) => prefix + f.name === focused.dataset.slider);
    return field?.range !== undefined && focused.value !== sliderValue(field);
  }
  const text =
    focused instanceof HTMLTextAreaElement ||
    (focused instanceof HTMLInputElement && focused.type !== "color");
  if (!text) return false;
  const field = fields.find((f) => keyOf(prefix + f.name) === focused.id);
  if (!field) return true;
  const written = field.value === null ? "" : String(field.value);
  return (focused as HTMLInputElement | HTMLTextAreaElement).value !== written;
}

/** Focuses the control a render replaced, with the caret at the end of a text. */
function refocus(root: HTMLElement, key: string | undefined): void {
  if (!key) return;
  const target =
    root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ??
    root.querySelector<HTMLElement>(`#${CSS.escape(key)}`);
  target?.focus();
  if (target instanceof HTMLInputElement && target.type === "text") {
    target.setSelectionRange(target.value.length, target.value.length);
  }
}

/** A colour the native picker accepts: `#rrggbb`. */
function pickerColor(color: string | undefined): string {
  if (!color) return "#000000";
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short)
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7).toLowerCase() : "#000000";
}

/** The colour a value stands for: a token's under the swatches, or the value itself. */
function colorOf(value: string | null | undefined, swatches: readonly ColorSwatch[] = []) {
  if (!value) return undefined;
  return (
    swatches.find((s) => s.token === value)?.color ?? (value.startsWith("#") ? value : undefined)
  );
}

/** The first option of a select: what applies when nothing is written. */
function defaultOption(field: InspectorField): string {
  const words = messages().inspector;
  if (field.mixed) return words.mixed;
  if (field.placeholder) return words.defaultOf(optionLabel(field.placeholder));
  return field.fromTheme ? words.defaultFromTheme : "—";
}

/** An option of a select as people read it: protocol words translated, code as written. */
function optionLabel(option: string): string {
  return messages().inspector.options[option] ?? option;
}

/** The placeholder of an input: what applies when nothing is written. */
function placeholderText(field: InspectorField): string {
  const words = messages().inspector;
  if (field.mixed) return words.mixed;
  return field.placeholder ?? (field.fromTheme ? words.theme : "");
}

/**
 * The control of one field, committed on Enter, blur or a new choice, never while typing; Escape
 * puts the written value back.
 */
function fieldControl(
  field: InspectorField,
  id: string,
  send: Send,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  switch (field.type) {
    case "enum": {
      const select = h("select", { id, disabled: field.readonly });
      select.append(h("option", { value: "" }, defaultOption(field)));
      for (const option of field.options ?? []) {
        select.append(
          h("option", { value: option, selected: option === field.value }, optionLabel(option)),
        );
      }
      select.addEventListener("change", () => send(select.value === "" ? null : select.value));
      control = select;
      break;
    }
    case "multiline": {
      const area = h("textarea", {
        id,
        placeholder: placeholderText(field),
        disabled: field.readonly,
      });
      area.value = field.value === null ? "" : String(field.value);
      area.addEventListener("change", () => send(area.value === "" ? null : area.value));
      control = area;
      break;
    }
    default: {
      const input = h("input", {
        id,
        type: field.type === "number" ? "number" : "text",
        placeholder: placeholderText(field),
        disabled: field.readonly,
        list: field.type === "color" ? "mdg-color-tokens" : undefined,
        spellcheck: "false",
      });
      input.value = field.value === null ? "" : String(field.value);
      // Enter writes, and the change that follows when the field loses the focus (Tab, a click,
      // the render drawing it anew) must not write the same text again with an older revision.
      let sent = input.value;
      const commit = () => {
        if (input.value === sent) return;
        sent = input.value;
        if (field.type === "number") send(input.value === "" ? null : Number(input.value));
        else send(input.value);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          input.value = field.value === null ? "" : String(field.value);
          input.blur();
        }
      });
      control = input;
    }
  }
  control.addEventListener("keydown", (e) => e.stopPropagation());
  return control;
}

/** Where the slider of a number with bounds stands: its written value, else what applies. */
function sliderValue(field: InspectorField): string {
  const range = field.range!;
  const written = field.value !== null && Number.isFinite(Number(field.value));
  const shown = written ? Number(field.value) : Number(field.placeholder);
  return String(
    Number.isFinite(shown) && !field.mixed
      ? Math.min(range.max, Math.max(range.min, shown))
      : range.min,
  );
}

/**
 * The text box of a number that may also be a word (the icon size, `auto` or a number): a number
 * typed is written as one, a word as it is typed (the session refuses the ones it does not take),
 * nothing removes the value. Committed on Enter or blur; Escape puts the written value back.
 */
function wordOrNumberControl(field: InspectorField, id: string, send: Send): HTMLInputElement {
  const input = h("input", {
    id,
    type: "text",
    inputmode: "numeric",
    placeholder: placeholderText(field),
    disabled: field.readonly,
    spellcheck: "false",
    autocomplete: "off",
  });
  input.value = field.value === null ? "" : String(field.value);
  // One write per edit: the change after an Enter (on Tab, a click, a render) writes nothing.
  let sent = input.value.trim();
  const commit = () => {
    const text = input.value.trim();
    if (text === sent) return;
    sent = text;
    send(text === "" ? null : /^\d+(\.\d+)?$/.test(text) ? Number(text) : text);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      input.value = field.value === null ? "" : String(field.value);
      input.blur();
    }
  });
  return input;
}

/**
 * A number with bounds (`InspectorField.range`, the corner radius, the icon size): the number and
 * a slider beside it. The slider shows the written value, or greyed what applies without one; it
 * writes (`slide`) when it is let go or stepped with the keys, and the number follows it as it
 * moves. A field with `quick` values (the icon size's **auto**) offers them beside its label, with
 * Clear, which takes the written value away.
 */
function rangeField(field: InspectorField, send: Send, slide: Send): HTMLElement {
  const range = field.range!;
  const id = keyOf(field.name);
  const quick = field.quick ?? [];
  const words = messages().inspector;
  const label = h("label", { for: id }, field.label);
  const number =
    quick.length > 0
      ? wordOrNumberControl(field, id, send)
      : (fieldControl(field, id, send) as HTMLInputElement);
  if (quick.length === 0) {
    number.min = String(range.min);
    number.max = String(range.max);
    number.step = String(range.step);
  }
  const written = field.value !== null && Number.isFinite(Number(field.value));
  const slider = h("input", {
    type: "range",
    class: written ? "slider" : "slider inherited",
    min: range.min,
    max: range.max,
    step: range.step,
    "aria-label": messages().inspector.slider(field.label),
    "data-key": `${id}:slider`,
    "data-slider": field.name,
    disabled: field.readonly,
  });
  slider.value = sliderValue(field);
  slider.addEventListener("input", () => {
    number.value = slider.value;
    slider.classList.remove("inherited");
  });
  slider.addEventListener("change", () => slide(Number(slider.value)));
  // The arrows step the slider, not the selection on the canvas.
  slider.addEventListener("keydown", (e) => e.stopPropagation());
  const row = h("div", { class: "row" }, number, slider);
  if (quick.length === 0) {
    return h("div", { class: "field range-field", "data-field": field.name }, label, row);
  }
  const chips = quick.map((choice) => {
    const button = h(
      "button",
      {
        type: "button",
        class: "quick small",
        "aria-pressed": String(field.value === choice.value),
        title: words.use(choice.value),
        "data-key": `${id}:quick:${choice.value}`,
        disabled: field.readonly,
      },
      choice.label,
    );
    button.addEventListener("click", () => send(choice.value));
    return button;
  });
  const clearButton = h(
    "button",
    {
      type: "button",
      class: "quick small",
      title: words.clearTitle,
      "data-key": `${id}:clear`,
      disabled: field.readonly || field.value === null,
    },
    words.clear,
  );
  clearButton.addEventListener("click", () => send(null));
  for (const button of [...chips, clearButton]) {
    button.addEventListener("keydown", (e) => e.stopPropagation());
  }
  return h(
    "div",
    { class: "field range-field", "data-field": field.name },
    h("div", { class: "field-head" }, label, h("span", { class: "quicks" }, ...chips, clearButton)),
    row,
  );
}

/** A labelled field: the label, a swatch for a colour written as one, and the control. */
function plainField(field: InspectorField, send: Send, extra: readonly HTMLElement[] = []) {
  const id = keyOf(field.name);
  const label = h("label", { for: id }, field.label);
  const color = typeof field.value === "string" ? colorOf(field.value) : undefined;
  if (field.type === "color" && color) {
    label.prepend(h("span", { class: "swatch", style: `background:${color}` }));
  }
  const control = fieldControl(field, id, send);
  if (extra.length === 0) return h("div", { class: "field" }, label, control);
  return h("div", { class: "field" }, label, h("div", { class: "row" }, control, ...extra));
}

/**
 * Arrow keys move the focus among `chips` (by one, or by a row of `columns`), keeping one tab
 * stop: the radio-group pattern.
 */
function roving(
  container: HTMLElement,
  chips: readonly HTMLElement[],
  columns = chips.length,
): void {
  container.addEventListener("keydown", (e) => {
    const index = chips.indexOf(document.activeElement as HTMLElement);
    const step =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowDown"
            ? columns
            : e.key === "ArrowUp"
              ? -columns
              : 0;
    if (step !== 0 && index >= 0) {
      e.preventDefault();
      const next = chips[(index + step + chips.length) % chips.length]!;
      for (const chip of chips) chip.tabIndex = chip === next ? 0 : -1;
      next.focus();
    }
    e.stopPropagation();
  });
}

/** What a picture field shows: its written value, else what applies without one. */
function shownValue(field: InspectorField): string | null {
  if (field.value !== null) return String(field.value);
  return field.mixed ? null : (field.placeholder ?? null);
}

/** Whether a field can go back to what applies without a written value. */
function canInherit(field: InspectorField): boolean {
  return field.placeholder !== undefined || field.fromTheme === true || field.mixed === true;
}

/** One picture chip of a value, a radio of its group. */
function glyphChip(
  field: InspectorField,
  family: GlyphFamily,
  value: string | null,
  checked: boolean,
  focusable: boolean,
): HTMLButtonElement {
  const id = keyOf(field.name);
  const words = messages().inspector;
  const inherited = field.mixed ? null : (field.placeholder ?? null);
  const name =
    value !== null
      ? glyphName(value, family)
      : inherited
        ? words.defaultNamed(glyphName(inherited, family))
        : words.defaultChip;
  const narrow = family === "iconPosition" || family === "labelPosition";
  // The default of where an icon or a label goes is a picture too, greyed in a dashed chip, so
  // that it and every place fit one row in any language: what applies, or, on a mixed selection,
  // a return to each one's own (its name, in its title, says it is the default).
  const pictured = value === null && narrow;
  const picture = (): Node => (inherited !== null ? glyph(family, inherited) : icon(ICONS.reset));
  const chip = h(
    "button",
    {
      type: "button",
      role: "radio",
      class:
        value === null
          ? pictured
            ? "chip glyph inherit narrow pictured"
            : "chip glyph inherit"
          : narrow
            ? "chip glyph narrow"
            : "chip glyph",
      "aria-checked": String(checked),
      "aria-label": name,
      title: name,
      tabindex: focusable ? 0 : -1,
      "data-key": `${id}:${value ?? ""}`,
      "data-value": value ?? "",
      disabled: field.readonly,
    },
    value !== null ? glyph(family, value) : pictured ? picture() : words.defaultChip,
  );
  return chip;
}

/** What a picture field says it shows: the value's name, marked when it is not written. */
function shownName(name: string, written: boolean): string {
  return written ? name : messages().inspector.byDefault(name);
}

/**
 * A field drawn as a row of pictures (line, route kind, corners): a "default" chip that inherits
 * again, when the field can inherit, and one chip per value.
 */
function glyphRow(field: InspectorField, send: Send): HTMLElement {
  const family = field.glyphs!;
  const id = keyOf(field.name);
  const labelId = `${id}-label`;
  const value = field.value === null ? null : String(field.value);
  const mixed = value === null && field.mixed === true;
  const options: (string | null)[] = [
    ...(canInherit(field) ? [null] : []),
    ...(field.options ?? []),
  ];
  const checked = mixed ? -1 : options.indexOf(value);
  const chips = options.map((option, i) =>
    glyphChip(field, family, option, i === checked, i === (checked >= 0 ? checked : 0)),
  );
  chips.forEach((chip, i) =>
    chip.addEventListener("click", () => {
      if (options[i] === value && !mixed) return;
      send(options[i] ?? null);
    }),
  );
  const group = h(
    "div",
    { class: "chips glyphs", role: "radiogroup", "aria-labelledby": labelId },
    ...chips,
  );
  roving(group, chips);
  const shown = shownValue(field);
  const words = messages().inspector;
  const label = h(
    "div",
    { class: "row-label" },
    h("span", { id: labelId }, field.label),
    h(
      "span",
      { class: "value", "data-value": "" },
      mixed
        ? words.mixed
        : shown === null
          ? words.defaultValue
          : shownName(glyphName(shown, family), value !== null),
    ),
  );
  return h("div", { class: "field glyph-row", "data-field": field.name }, label, group);
}

/** What a picture picker draws when nothing is written and nothing applies. */
const fallbackOf = (family: GlyphFamily) => (family === "shape" ? "rounded" : "none");

/**
 * A head or shape picker: a button showing the current value that opens a grid of every value
 * (and "default"); arrows move in the grid, Enter or Space chooses, Escape closes.
 */
function headPicker(field: InspectorField, send: Send): HTMLElement {
  const family = field.glyphs!;
  const id = keyOf(field.name);
  const labelId = `${id}-label`;
  const value = field.value === null ? null : String(field.value);
  const mixed = value === null && field.mixed === true;
  const shown = shownValue(field) ?? fallbackOf(family);
  const words = messages().inspector;
  const trigger = h(
    "button",
    {
      type: "button",
      class: "head-trigger",
      id,
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-labelledby": `${labelId} ${id}`,
      "aria-label": mixed ? words.mixed : glyphName(shown, family),
      title: mixed ? words.mixed : glyphName(shown, family),
      "data-key": `${id}:open`,
      disabled: field.readonly,
    },
    mixed ? words.mixed : glyph(family, shown),
    h("span", { class: "caret", "aria-hidden": "true" }, "▾"),
  );
  const options: (string | null)[] = [
    ...(canInherit(field) ? [null] : []),
    ...(field.options ?? []),
  ];
  const grid = h("div", {
    class: family === "shape" ? "head-grid shape-grid" : "head-grid",
    role: "radiogroup",
    "aria-labelledby": labelId,
    hidden: true,
  });
  const checked = mixed ? -1 : options.indexOf(value);
  const chips = options.map((option, i) =>
    glyphChip(field, family, option, i === checked, i === (checked >= 0 ? checked : 0)),
  );
  const close = (refocus: boolean) => {
    grid.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    if (refocus) trigger.focus();
  };
  const outside = (e: PointerEvent) => {
    if (!wrapper.contains(e.target as Node)) close(false);
  };
  chips.forEach((chip, i) =>
    chip.addEventListener("click", () => {
      close(true);
      if (options[i] === value && !mixed) return;
      send(options[i] ?? null);
    }),
  );
  grid.append(...chips);
  roving(grid, chips, 4);
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close(e.key === "Escape");
    }
  });
  trigger.addEventListener("click", () => {
    if (!grid.hidden) {
      close(true);
      return;
    }
    grid.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
    (chips.find((c) => c.tabIndex === 0) ?? chips[0])?.focus();
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && grid.hidden) {
      e.preventDefault();
      trigger.click();
    }
    e.stopPropagation();
  });
  const label = h(
    "div",
    { class: "row-label" },
    h("span", { id: labelId }, field.label),
    h(
      "span",
      { class: "value", "data-value": "" },
      mixed ? words.mixed : shownName(glyphName(shown, family), value !== null),
    ),
  );
  const wrapper = h(
    "div",
    { class: "field head-field", "data-field": field.name },
    label,
    trigger,
    grid,
  );
  return wrapper;
}

/** A field with pictures: a grid for heads and shapes, a row for the others. */
function glyphField(field: InspectorField, send: Send): HTMLElement {
  return field.glyphs === "arrowStart" || field.glyphs === "arrowEnd" || field.glyphs === "shape"
    ? headPicker(field, send)
    : glyphRow(field, send);
}

/**
 * A row of colour chips: "theme" (inherit), then the theme's tokens with their colours; arrows move
 * between them, Enter or Space chooses. A native picker beside the row writes a colour of one's own.
 */
function colorRow(
  field: InspectorField,
  send: Send,
  inherit = messages().inspector.themeChip,
): HTMLElement {
  const id = keyOf(field.name);
  const words = messages().inspector;
  const swatches = field.swatches ?? [];
  const value = field.value === null ? null : String(field.value);
  const mixed = value === null && field.mixed === true;
  // The written value, or what applies without one: an inherited value or the theme's.
  const inherited = field.placeholder;
  const shown =
    value ?? (mixed ? words.mixed : inherited ? words.inherited(inherited) : inherit.toLowerCase());
  const labelId = `${id}-label`;
  const group = h("div", {
    class: "chips",
    role: "radiogroup",
    "aria-labelledby": labelId,
  });
  const options: { value: string | null; label: string; color?: string }[] = [
    { value: null, label: inherit },
    ...swatches.map((s) => ({ value: s.token, label: s.token, color: s.color })),
  ];
  const checked = mixed ? -1 : options.findIndex((o) => o.value === value);
  const chips = options.map((option, i) => {
    const chip = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: option.color ? "chip" : "chip inherit",
        "aria-checked": String(i === checked),
        "aria-label": option.color
          ? `${option.label} ${option.color}`
          : words.inherit(option.label),
        title: option.color ? `${option.label} · ${option.color}` : words.inheritTitle,
        tabindex: i === (checked >= 0 ? checked : 0) ? 0 : -1,
        "data-key": `${id}:${option.value ?? ""}`,
        "data-token": option.value ?? "",
        style: option.color ? `--chip:${option.color}` : undefined,
        disabled: field.readonly,
      },
      option.color ? "" : option.label,
    );
    chip.addEventListener("click", () => {
      if (option.value === value && !mixed) return;
      send(option.value);
    });
    return chip;
  });
  group.append(...chips);
  group.addEventListener("keydown", (e) => {
    const index = chips.indexOf(document.activeElement as HTMLButtonElement);
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step !== 0 && index >= 0) {
      e.preventDefault();
      const next = chips[(index + step + chips.length) % chips.length]!;
      for (const chip of chips) chip.tabIndex = chip === next ? 0 : -1;
      next.focus();
    }
    e.stopPropagation();
  });
  const picker = h("input", {
    type: "color",
    class: "picker-input",
    "aria-label": words.ownColour(field.label),
    title: words.ownColourTitle,
    "data-key": `${id}:picker`,
    disabled: field.readonly,
  });
  picker.value = pickerColor(colorOf(value, swatches) ?? colorOf(field.placeholder, swatches));
  picker.addEventListener("change", () => send(picker.value.toUpperCase()));
  picker.addEventListener("keydown", (e) => e.stopPropagation());
  const label = h(
    "div",
    { class: "row-label" },
    h("span", { id: labelId }, field.label),
    h("span", { class: "value", "data-value": "" }, shown),
    picker,
  );
  return h("div", { class: "field colors", "data-field": field.name }, label, group);
}

/** An effect as a toggle: pressed when on, "mixed" when only some of the selection have it. */
function effectToggle(field: InspectorField, send: Send): HTMLElement {
  const on = field.value === "on";
  const mixed = !on && field.mixed === true;
  const button = h(
    "button",
    {
      type: "button",
      class: "toggle",
      id: keyOf(field.name),
      "aria-pressed": on ? "true" : mixed ? "mixed" : "false",
      disabled: field.readonly,
    },
    field.label,
  );
  button.addEventListener("click", () => send(on ? "off" : "on"));
  button.addEventListener("keydown", (e) => e.stopPropagation());
  return button;
}

/**
 * What the Effects row says at its right: "mixed" when the selection differs on an effect, the
 * names of the effects that are on, or "off".
 */
export function effectsSummary(
  toggles: readonly Pick<InspectorField, "label" | "value" | "mixed">[],
): string {
  const words = messages().inspector;
  if (toggles.some((f) => f.value !== "on" && f.mixed === true)) return words.mixed;
  const on = toggles.filter((f) => f.value === "on").map((f) => f.label);
  return on.length > 0 ? on.join(", ") : words.effectsOff;
}

/**
 * The effects as a row of the strip, headed like the route kind's and the corners': "Effects" and
 * what is on at the top, the toggles beneath.
 */
function effectsRow(
  toggles: readonly InspectorField[],
  draw: (field: InspectorField) => HTMLElement,
): HTMLElement {
  const words = messages().inspector;
  const labelId = "mdg-effects-label";
  const label = h(
    "div",
    { class: "row-label" },
    h("span", { id: labelId }, words.effects),
    h("span", { class: "value", "data-value": "" }, effectsSummary(toggles)),
  );
  const group = h(
    "div",
    { class: "effects", role: "group", "aria-labelledby": labelId },
    ...toggles.map(draw),
  );
  return h("div", { class: "field effects-row", "data-field": "effects" }, label, group);
}

/**
 * The property inspector: the style strip first (colour chips, line, width, arrowhead, effects and
 * their speed, the diagram's theme), then one control per field.
 */
export class Inspector {
  readonly element = h("aside", {
    class: "panel inspector",
    "aria-label": messages().inspector.label,
    tabindex: -1,
  });
  private model: InspectorModel | undefined;
  /** A canvas that only shows: every field is drawn disabled and nothing is committed. */
  private readOnly = false;

  constructor(private readonly actions: InspectorActions) {
    this.element.append(
      h(
        "datalist",
        { id: "mdg-color-tokens" },
        ...COLOR_TOKENS.map((t) => h("option", { value: t })),
      ),
    );
  }

  /**
   * Turns read-only on or off: the properties of the selection stay, drawn with every control
   * disabled (and no theme to create or edit), and the panel says so. The fields are drawn again.
   */
  setReadOnly(on: boolean): void {
    if (this.readOnly === on) return;
    this.readOnly = on;
    const words = messages();
    this.element.toggleAttribute("data-readonly", on);
    this.element.setAttribute("aria-label", on ? words.readOnly.inspector : words.inspector.label);
    const model = this.model;
    if (!model) return;
    // Forget the model so that a field with unwritten typing is drawn again too.
    this.model = undefined;
    this.show(model);
  }

  show(model: InspectorModel): void {
    // Keep the field being typed in: a render while typing must not steal focus.
    const focused = document.activeElement as HTMLElement | null;
    const inside = !!focused && this.element.contains(focused);
    if (
      this.model &&
      sameTarget(this.model, model) &&
      holdsTyping(focused, this.element, model.fields)
    ) {
      this.model = model;
      return;
    }
    const key = inside ? (focused!.dataset.key ?? focused!.id) : undefined;
    this.model = model;
    const datalist = this.element.querySelector("datalist")!;
    clear(this.element);
    this.element.append(datalist, h("h2", {}, model.title));
    // Read-only: the same fields, each one disabled, so the values can be read and nothing written.
    const fields: readonly InspectorField[] = this.readOnly
      ? model.fields.map((f) => ({ ...f, readonly: true }))
      : model.fields;
    const strip = fields.filter((f) => f.section === "strip");
    if (strip.length > 0) {
      // The effects side by side as toggles, then the speed of each one that is on.
      const toggles = strip.filter((f) => /^effect\.(flow|dash|pulse|trace)$/.test(f.name));
      const speeds = strip.filter((f) => /^effect\.\w+\.duration$/.test(f.name));
      const words = messages().inspector;
      const section = h("section", { class: "strip", "aria-label": words.strip });
      for (const field of strip) {
        if (!toggles.includes(field) && !speeds.includes(field)) {
          section.append(this.stripField(field));
        }
      }
      if (toggles.length > 0) {
        section.append(effectsRow(toggles, (f) => this.stripField(f)));
      }
      for (const field of speeds) section.append(this.stripField(field));
      this.element.append(section);
    }
    for (const field of fields) {
      if (field.section !== "strip") this.element.append(this.field(field));
    }
    refocus(this.element, key);
  }

  /** Shows no properties: what a file without diagrams has. The next model draws them again. */
  clear(): void {
    this.model = undefined;
    const datalist = this.element.querySelector("datalist")!;
    clear(this.element);
    this.element.append(datalist);
  }

  private send(field: InspectorField): Send {
    const ids = this.model!.target.ids;
    return (value) => {
      if (this.readOnly) return;
      if (value === field.value || (value === "" && field.value === null)) return;
      this.actions.commit(ids, field.name, value);
    };
  }

  /**
   * A slider's writer: every step goes to the canvas, which compares it with what is written then
   * (the field drawn may be older while steps are pending).
   */
  private slide(field: InspectorField): Send {
    const ids = this.model!.target.ids;
    return (value) => {
      if (this.readOnly || typeof value !== "number") return;
      this.actions.slide(ids, field.name, value);
    };
  }

  /** The written value of a field of the targets shown; undefined when other targets are shown. */
  writtenValue(ids: readonly string[], name: string): Value | undefined {
    const model = this.model;
    if (!model || model.target.ids.join() !== ids.join()) return undefined;
    return model.fields.find((f) => f.name === name)?.value;
  }

  /**
   * An icon field (`style.icon`, an icon object's `source`): the icon's thumbnail and name, greyed
   * when it applies without being written (a class's or a rule's), and Choose…, which opens the
   * icon picker under it, and Remove, which takes the written icon away (an icon object keeps its
   * icon). A canvas that only shows draws the icon without the buttons.
   */
  private iconField(field: InspectorField, send: Send): HTMLElement {
    const words = messages().inspector;
    const id = keyOf(field.name);
    const written = field.value !== null;
    const shown = written ? String(field.value) : field.mixed ? null : (field.placeholder ?? null);
    const thumbnail = field.thumbnail;
    // An icon no pack has is marked so for good; one whose pack is on its way shimmers until the
    // render that brings it.
    const missing = shown !== null && thumbnail?.missing === true;
    const picture = h("span", {
      class: written ? "icon-thumb" : "icon-thumb inherited",
      "aria-hidden": "true",
    });
    if (thumbnail?.svg) picture.innerHTML = thumbnail.svg;
    else if (missing) {
      picture.classList.add("missing");
      picture.append(icon(ICONS.missing));
    } else picture.classList.add(shown === null ? "none" : "loading");
    const name = field.mixed
      ? words.mixed
      : shown === null
        ? words.noIcon
        : (thumbnail?.label ?? shown);
    const text = h(
      "span",
      { class: "icon-text" },
      h(
        "span",
        { class: "icon-name" },
        missing
          ? words.iconMissing(name)
          : written || shown === null
            ? name
            : words.byDefault(name),
      ),
    );
    if (shown !== null && name !== shown) {
      text.append(h("span", { class: "icon-reference" }, shown));
    }
    const labelId = `${id}-label`;
    const value = h(
      "div",
      {
        class: "icon-value",
        id,
        role: "group",
        "aria-labelledby": labelId,
        "data-value": shown ?? "",
      },
      picture,
      text,
    );
    const buttons = h("span", { class: "quicks" });
    if (!field.readonly) {
      const ids = this.model!.target.ids;
      const choose = h(
        "button",
        {
          type: "button",
          class: "choose small",
          "data-key": `${field.name}:choose`,
          title: words.chooseIcon,
          "aria-haspopup": "dialog",
        },
        words.choose,
      );
      choose.addEventListener("click", () => this.actions.pickIcon(ids, field.name, choose));
      buttons.append(choose);
      // An icon object is its icon: it is changed, never taken away.
      if (field.name !== "source") {
        const remove = h(
          "button",
          {
            type: "button",
            class: "choose small",
            "data-key": `${field.name}:remove`,
            title: words.removeIcon,
            disabled: !written,
          },
          words.remove,
        );
        remove.addEventListener("click", () => send(null));
        buttons.append(remove);
      }
      for (const button of buttons.children) {
        button.addEventListener("keydown", (e) => e.stopPropagation());
      }
    }
    if (missing) value.title = words.iconMissingTitle(shown);
    return h(
      "div",
      {
        class: missing ? "field icon-field missing" : "field icon-field",
        "data-field": field.name,
      },
      h(
        "div",
        { class: "field-head" },
        h("span", { class: "field-label", id: labelId }, field.label),
        buttons,
      ),
      h("div", { class: "row icon-row" }, value),
    );
  }

  private stripField(field: InspectorField): HTMLElement {
    const send = this.send(field);
    if (field.type === "color" && field.swatches) return colorRow(field, send);
    if (/^effect\.(flow|dash|pulse|trace)$/.test(field.name)) return effectToggle(field, send);
    if (field.name === "theme") return this.themeRow(field, send);
    if (field.glyphs && field.options) return glyphField(field, send);
    if (field.type === "number" && field.range) return rangeField(field, send, this.slide(field));
    return plainField(field, send);
  }

  /** The diagram's theme: the choice, its light or dark counterpart, and new or edit. */
  private themeRow(field: InspectorField, send: Send): HTMLElement {
    const current = String(field.value ?? field.placeholder ?? "");
    const words = messages().inspector;
    const extra: HTMLElement[] = (field.quick ?? []).map((quick) => {
      const button = h(
        "button",
        {
          type: "button",
          class: "quick",
          title: words.use(quick.value),
          disabled: this.readOnly,
        },
        quick.label,
      );
      button.addEventListener("click", () => send(quick.value));
      return button;
    });
    const wrapper = plainField(field, send, extra);
    // Creating or editing a theme writes files: not on a canvas that only shows.
    if (this.readOnly) return wrapper;
    const create = h(
      "button",
      { type: "button", class: "link", "data-key": "theme:new" },
      words.newTheme,
    );
    create.addEventListener("click", () =>
      this.actions.newTheme(current, field.themes?.project ?? false),
    );
    const actions = h("div", { class: "theme-actions" }, create);
    if (field.themes?.editable) {
      const edit = h(
        "button",
        { type: "button", class: "link", "data-key": "theme:edit" },
        words.editTheme,
      );
      edit.addEventListener("click", () => this.actions.editTheme());
      actions.append(edit);
    }
    wrapper.append(actions);
    return wrapper;
  }

  private field(field: InspectorField): HTMLElement {
    const send = this.send(field);
    if (field.type === "icon") return this.iconField(field, send);
    if (field.glyphs && field.options) return glyphField(field, send);
    if (field.type === "number" && field.range) return rangeField(field, send, this.slide(field));
    const button = field.button;
    if (button && !this.readOnly) {
      const press = h(
        "button",
        { type: "button", class: "choose", "data-key": `${field.name}:button` },
        button.label,
      );
      press.addEventListener("click", () => this.actions.act(button.action));
      return plainField(field, send, [press]);
    }
    return plainField(field, send);
  }
}

function sameTarget(a: InspectorModel, b: InspectorModel): boolean {
  return a.target.kind === b.target.kind && a.target.ids.join() === b.target.ids.join();
}

/** What the theme panel asks of the canvas. */
export interface ThemePanelActions {
  token(token: string, value: Value): void;
  close(): void;
}

/**
 * The theme panel: the tokens of the diagram's theme by group, each written or inherited from the
 * base theme. It takes the inspector's place while open.
 */
export class ThemePanel {
  readonly element = h("aside", {
    class: "panel theme-panel",
    "aria-label": messages().themePanel.label,
    tabindex: -1,
    hidden: true,
  });
  private panel: ThemePanelModel | undefined;

  constructor(private readonly actions: ThemePanelActions) {}

  get open(): boolean {
    return this.panel !== undefined;
  }

  show(panel: ThemePanelModel): void {
    const focused = document.activeElement as HTMLElement | null;
    const inside = !!focused && this.element.contains(focused);
    const opening = this.panel === undefined || this.panel.id !== panel.id;
    const fields = panel.groups.flatMap((g) => g.fields);
    if (!opening && holdsTyping(focused, this.element, fields, "theme.")) {
      this.panel = panel;
      return;
    }
    const key = inside ? (focused!.dataset.key ?? focused!.id) : undefined;
    this.panel = panel;
    clear(this.element);
    const words = messages().themePanel;
    const close = h(
      "button",
      { type: "button", class: "close", title: words.doneTitle, "data-key": "theme:close" },
      words.done,
    );
    close.addEventListener("click", () => this.actions.close());
    const where =
      panel.file === null ? words.thisFile : panel.file.slice(panel.file.lastIndexOf("/") + 1);
    this.element.append(
      h("div", { class: "panel-head" }, h("h2", {}, words.title(panel.id)), close),
      h("p", { class: "where" }, words.where(where)),
    );
    for (const group of panel.groups) {
      const section = h(
        "section",
        { class: "group", "aria-label": group.title },
        h("h3", {}, group.title),
      );
      for (const field of group.fields) section.append(this.field(field));
      this.element.append(section);
    }
    this.element.hidden = false;
    if (opening && !inside) this.element.focus();
    else refocus(this.element, key);
  }

  hide(): void {
    this.panel = undefined;
    this.element.hidden = true;
    clear(this.element);
  }

  private field(field: InspectorField): HTMLElement {
    const named = { ...field, name: `theme.${field.name}` };
    const send: Send = (value) => {
      if (value === field.value || (value === "" && field.value === null)) return;
      this.actions.token(field.name, value === "" ? null : value);
    };
    if (field.type !== "color") return plainField(named, send);
    // A colour of the theme: its resolved colour, the value, a picker and "inherit".
    const id = keyOf(named.name);
    const words = messages().themePanel;
    const resolved = typeof field.value === "string" ? field.value : field.placeholder;
    const label = h(
      "label",
      { for: id },
      h("span", { class: "swatch", style: `background:${resolved ?? "transparent"}` }),
      field.label,
    );
    const input = fieldControl({ ...named, type: "text" }, id, send);
    const picker = h("input", {
      type: "color",
      class: "picker-input",
      "aria-label": words.chooseColour(field.label),
      "data-key": `${id}:picker`,
    });
    picker.value = pickerColor(resolved);
    picker.addEventListener("change", () => send(picker.value.toUpperCase()));
    picker.addEventListener("keydown", (e) => e.stopPropagation());
    const inherit = h(
      "button",
      {
        type: "button",
        class: "quick",
        "data-key": `${id}:inherit`,
        title: words.inheritTitle,
        disabled: field.value === null,
      },
      words.inherit,
    );
    inherit.addEventListener("click", () => send(null));
    return h("div", { class: "field" }, label, h("div", { class: "row" }, input, picker, inherit));
  }
}
