import type {
  CanvasAction,
  ColorSwatch,
  InspectorField,
  InspectorModel,
  ThemePanelModel,
} from "@meltemi/diagrams-editor/canvas";
import { ICONS, ariaKeyshortcuts, clear, h, icon } from "./dom.js";
import { fontShown, rowFamily } from "./font-picker.js";
import { alignGlyph, glyph, glyphName, type GlyphFamily } from "./glyphs.js";
import { messages } from "./messages/index.js";
import { stickyColourName } from "./sticky.js";

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
  // The whiteboard's: highlighter strokes, and the paper and words of sticky notes.
  "highlight",
  "sticky",
  "stickyText",
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
  /**
   * Opens the canvas's font picker under `anchor` for the `style.font` of the targets, with the
   * written stack (null when nothing is written).
   */
  pickFont(
    ids: readonly string[],
    field: string,
    anchor: HTMLElement,
    current: string | null,
  ): void;
  /** Asks the id and place of a theme that extends `current`. */
  newTheme(current: string, project: boolean): void;
  /** Opens the theme panel on the diagram's theme. */
  editTheme(): void;
  /** Sends an action of a field's button, such as Convert to container. */
  act(action: CanvasAction): void;
  /** Folds the panel to its rail (the head's button) or unfolds it (the rail's button). */
  fold(collapsed: boolean): void;
}

/**
 * A button that folds the properties panel to its rail or unfolds it: the properties glyph, its
 * name, and the host's key for the fold in its title when the host has one.
 */
function foldButton(
  name: string,
  key: string,
  expanded: boolean,
  dataKey: string,
  run: () => void,
): HTMLButtonElement {
  const button = h(
    "button",
    {
      type: "button",
      class: "fold",
      "data-key": dataKey,
      "aria-label": name,
      title: key ? `${name} (${key})` : name,
      "aria-keyshortcuts": key ? ariaKeyshortcuts(key) : undefined,
      "aria-expanded": String(expanded),
      "aria-controls": "mdg-inspector",
    },
    icon(ICONS.inspector),
  );
  button.addEventListener("click", run);
  return button;
}

const keyOf = (name: string) => `mdg-field-${name.replace(/\W/g, "-")}`;

/** The chevron of a card's disclosure button: it points right when closed, down when open. */
const CHEVRON = "M6 4l4 4-4 4";

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
  // A checkbox writes as it is clicked, and holds nothing.
  const text =
    focused instanceof HTMLTextAreaElement ||
    (focused instanceof HTMLInputElement &&
      focused.type !== "color" &&
      focused.type !== "checkbox");
  if (!text) return false;
  // A tag's text just written (the field that adds one empties itself once it is added).
  const sent = focused.dataset.sent;
  if (sent !== undefined && (focused as HTMLInputElement).value === sent) return false;
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

/** The three fields of the strip's Text group. */
const TEXT_FIELDS: readonly string[] = ["style.font", "style.fontSize", "style.fontWeight"];

/** The bounds of a text size typed in the strip, as the language takes them. */
const FONT_SIZE_RANGE = { min: 6, max: 160 } as const;

/**
 * The button of a font field: the family it shows, in that family once the picker has its faces,
 * marked inherited, custom or mixed; a press opens the picker under it.
 */
function fontButton(
  field: InspectorField,
  current: string | null,
  open: (anchor: HTMLElement) => void,
): HTMLButtonElement {
  const words = messages().fontPicker;
  const shown = fontShown(current, field.placeholder, field.mixed === true, field.options);
  const name = h(
    "span",
    {
      class: "font-button-name",
      style: shown.family ? `font-family:"${rowFamily(shown.family)}", system-ui` : undefined,
    },
    shown.text,
  );
  const button = h(
    "button",
    {
      type: "button",
      class: `font-button ${shown.state}`,
      id: keyOf(field.name),
      "data-key": `${field.name}:pick`,
      "data-family": shown.family ?? "",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-label": words.button(field.label, shown.text),
      disabled: field.readonly,
    },
    name,
    icon(CHEVRON_DOWN),
  );
  button.addEventListener("click", () => open(button));
  button.addEventListener("keydown", (e) => e.stopPropagation());
  return button;
}

const CHEVRON_DOWN = "M4 6l4 4 4-4";

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

/** A sentence with code in backticks ("The block of `pay` activates `api`."), as nodes. */
function codeText(text: string): (Node | string)[] {
  return text
    .split("`")
    .map((part, i) => (i % 2 === 1 ? h("code", {}, part) : part))
    .filter((part) => part !== "");
}

/** What the checkbox of a `boolean` field shows, and the sentence under it. */
export interface CheckboxState {
  /** The value is `on`. */
  readonly checked: boolean;
  /** The selection differs: neither checked nor clear. */
  readonly mixed: boolean;
  readonly disabled: boolean;
  /** Why it is as it is, under it (`InspectorField.note`): the reason a field is read-only. */
  readonly note: string | undefined;
}

/**
 * The checkbox of a `boolean` field (**Activates the receiver**): checked when its value is `on`,
 * mixed when the selection differs on it, disabled when it is read-only, with its note.
 */
export function checkboxState(
  field: Pick<InspectorField, "value" | "mixed" | "readonly" | "note">,
): CheckboxState {
  const checked = field.value === "on";
  return {
    checked,
    mixed: !checked && field.mixed === true,
    disabled: field.readonly === true,
    note: field.note,
  };
}

/**
 * A `boolean` field: the platform's checkbox with its label beside it, and the note under it (the
 * reason a field is read-only), which the checkbox names as its description. A click writes `on`
 * or `off` at once.
 */
function booleanField(field: InspectorField, send: Send): HTMLElement {
  const id = keyOf(field.name);
  const state = checkboxState(field);
  const noteId = `${id}-note`;
  const box = h("input", {
    id,
    type: "checkbox",
    checked: state.checked,
    disabled: state.disabled,
    "aria-describedby": state.note ? noteId : undefined,
  });
  box.indeterminate = state.mixed;
  box.addEventListener("change", () => send(box.checked ? "on" : "off"));
  box.addEventListener("keydown", (e) => e.stopPropagation());
  const element = h(
    "div",
    { class: "field check-field", "data-field": field.name },
    h("label", { class: "check", for: id }, box, h("span", {}, field.label)),
  );
  if (state.note) element.append(h("p", { class: "note", id: noteId }, ...codeText(state.note)));
  return element;
}

/** Whether a field is one of the **Tags** of a sequence message or participant: `tag.<n>`, `tag.new`. */
export const isTagField = (name: string): boolean => /^tag\.(\d+|new)$/.test(name);

/**
 * A part of the inspector's body: a field on its own, or a run of tag fields drawn as one list
 * under its heading, the tags in order (`tag.<n>`) and the field that adds one (`tag.new`).
 */
export type InspectorRow =
  | { readonly kind: "field"; readonly field: InspectorField }
  | {
      readonly kind: "tags";
      readonly tags: readonly InspectorField[];
      readonly add: InspectorField | undefined;
    };

/** The fields of the inspector's body in order, each run of tag fields as one list. */
export function inspectorRows(fields: readonly InspectorField[]): InspectorRow[] {
  const rows: InspectorRow[] = [];
  for (const field of fields) {
    if (!isTagField(field.name)) {
      rows.push({ kind: "field", field });
      continue;
    }
    const last = rows[rows.length - 1];
    const run = last?.kind === "tags" ? last : undefined;
    const tags = field.name === "tag.new" ? (run?.tags ?? []) : [...(run?.tags ?? []), field];
    const add = field.name === "tag.new" ? field : run?.add;
    const next: InspectorRow = { kind: "tags", tags, add };
    if (run) rows[rows.length - 1] = next;
    else rows.push(next);
  }
  return rows;
}

/**
 * The text box of a tag: committed on Enter or blur, Escape puts the written text back. What it
 * sent stays marked (`data-sent`), so the render that brings it is drawn though the field that adds
 * a tag comes back empty.
 */
function tagInput(field: InspectorField, id: string, send: Send): HTMLInputElement {
  const input = h("input", {
    id,
    type: "text",
    class: "tag-text",
    placeholder: placeholderText(field),
    disabled: field.readonly,
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": field.label,
  });
  input.value = field.value === null ? "" : String(field.value);
  let sent = input.value;
  const commit = () => {
    if (input.value === sent) return;
    sent = input.value;
    input.dataset.sent = sent;
    send(sent);
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

// ------------------------------------------------------------------ text alignment

/** One cell of the alignment picker: a pair of alignments, its name, and how it is drawn. */
export interface AlignCell {
  /** `style.textAlign`'s value. */
  readonly across: string;
  /** `style.verticalAlign`'s value; absent in a free text's row. */
  readonly down: string | undefined;
  /** The pair in the interface language: "centre, bottom". */
  readonly name: string;
  /** The written pair (what applies standing in for a part not written). */
  readonly pressed: boolean;
  /** What applies when nothing is written: greyed in a dashed cell. */
  readonly inherited: boolean;
}

const ACROSS = ["left", "center", "right"];
const DOWN = ["top", "middle", "bottom"];

const positionName = (value: string): string => {
  const names: Readonly<Record<string, string>> = messages().positions;
  return Object.hasOwn(names, value) ? names[value]! : value;
};

/**
 * The cells of the alignment picker of a free box (`across` is `style.textAlign`, `down`
 * `style.verticalAlign`), row by row, or of a free text (`down` absent): three cells in a row.
 * The written pair is pressed, what applies stands in for a part that is not written, the pair
 * that applies is marked inherited when nothing is written, and a mixed selection has neither.
 */
export function alignCells(across: InspectorField, down: InspectorField | undefined): AlignCell[] {
  const words = messages().inspector;
  const mixed = across.mixed === true || down?.mixed === true;
  const written = across.value !== null || (down !== undefined && down.value !== null);
  const shownAcross =
    across.value !== null ? String(across.value) : (across.placeholder ?? "center");
  const shownDown =
    down === undefined
      ? undefined
      : down.value !== null
        ? String(down.value)
        : (down.placeholder ?? "middle");
  const rows: (string | undefined)[] = down ? [...(down.options ?? DOWN)] : [undefined];
  const columns = across.options ?? ACROSS;
  return rows.flatMap((row) =>
    columns.map((column) => {
      const matches = column === shownAcross && row === shownDown;
      return {
        across: column,
        down: row,
        name: words.alignCell(
          positionName(column),
          row === undefined ? undefined : positionName(row),
        ),
        pressed: !mixed && written && matches,
        inherited: !mixed && !written && matches,
      };
    }),
  );
}

/**
 * The fields a chosen cell writes: each alignment whose value changes, the one that applies
 * without a written value (the field's placeholder) written as nothing. Both may change, one, or
 * none; on a mixed selection every alignment of the cell is written.
 */
export function alignChanges(
  across: InspectorField,
  down: InspectorField | undefined,
  cell: Pick<AlignCell, "across" | "down">,
): { field: string; value: string | null }[] {
  const changes: { field: string; value: string | null }[] = [];
  const add = (field: InspectorField, chosen: string) => {
    const value = chosen === field.placeholder ? null : chosen;
    const current = field.value === null ? null : String(field.value);
    if (field.mixed === true || value !== current) changes.push({ field: field.name, value });
  };
  add(across, cell.across);
  if (down && cell.down !== undefined) add(down, cell.down);
  return changes;
}

/**
 * The fields the alignment picker's chip writes: every alignment written (or mixed) taken away,
 * so what applies is drawn again.
 */
export function alignCleared(
  across: InspectorField,
  down: InspectorField | undefined,
): { field: string; value: null }[] {
  return [across, ...(down ? [down] : [])]
    .filter((f) => f.value !== null || f.mixed === true)
    .map((f) => ({ field: f.name, value: null }));
}

/**
 * The alignment picker: "Text alignment" over a 3 × 3 grid of cells (a free text's row of three),
 * each a radio with the picture of its pair, the written pair pressed and what applies greyed in a
 * dashed cell; arrows move through the grid, Enter or Space chooses; the chip beside the heading
 * takes both alignments away. `write` gets the fields that change, `from` the cell the highlight
 * slides from (the one pressed before this drawing), if any.
 */
function alignField(
  across: InspectorField,
  down: InspectorField | undefined,
  write: (changes: readonly { field: string; value: string | null }[]) => void,
  from: number | undefined,
): { element: HTMLElement; pressed: number } {
  const words = messages().inspector;
  const id = keyOf(across.name);
  const labelId = `${id}-label`;
  const cells = alignCells(across, down);
  const mixed = across.mixed === true || down?.mixed === true;
  const pressed = cells.findIndex((c) => c.pressed);
  const marked = pressed >= 0 ? pressed : cells.findIndex((c) => c.inherited);
  const readonly = across.readonly === true || down?.readonly === true;
  const columns = (across.options ?? ACROSS).length;
  const buttons = cells.map((cell, i) => {
    const button = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: cell.inherited ? "align-cell inherit" : "align-cell",
        "aria-checked": String(cell.pressed),
        "aria-label": cell.name,
        title: cell.inherited ? words.byDefault(cell.name) : cell.name,
        tabindex: i === (marked >= 0 ? marked : 0) ? 0 : -1,
        "data-key": `${id}:${cell.across}-${cell.down ?? ""}`,
        "data-across": cell.across,
        ...(cell.down !== undefined ? { "data-down": cell.down } : {}),
        disabled: readonly,
      },
      alignGlyph(cell.across, cell.down),
    );
    button.addEventListener("click", () => {
      const changes = alignChanges(across, down, cell);
      if (changes.length > 0) write(changes);
    });
    return button;
  });
  // The pressed cell's highlight, which slides from the cell pressed before.
  const highlight = h("span", { class: "align-highlight", "aria-hidden": "true" });
  const place = (index: number) => {
    highlight.style.setProperty("--column", String(index % columns));
    highlight.style.setProperty("--row", String(Math.floor(index / columns)));
  };
  if (pressed >= 0) {
    place(from !== undefined && from >= 0 && from !== pressed ? from : pressed);
    if (from !== undefined && from >= 0 && from !== pressed) {
      requestAnimationFrame(() => requestAnimationFrame(() => place(pressed)));
    }
  } else highlight.hidden = true;
  const grid = h(
    "div",
    {
      class: down ? "align-grid" : "align-grid row",
      role: "radiogroup",
      "aria-labelledby": labelId,
      style: `--columns: ${columns}`,
    },
    highlight,
    ...buttons,
  );
  roving(grid, buttons, columns);
  const cleared = alignCleared(across, down);
  const inherit = h(
    "button",
    {
      type: "button",
      class: "chip inherit align-inherit",
      title: words.alignInherit,
      "aria-label": words.alignInherit,
      "data-key": `${id}:inherit`,
      disabled: readonly || cleared.length === 0,
    },
    words.themeChip,
  );
  inherit.addEventListener("click", () => {
    if (cleared.length > 0) write(cleared);
  });
  inherit.addEventListener("keydown", (e) => e.stopPropagation());
  const shown = cells[pressed >= 0 ? pressed : marked];
  const label = h(
    "div",
    { class: "row-label" },
    h("span", { id: labelId }, across.label),
    h(
      "span",
      { class: "value", "data-value": "" },
      mixed ? words.mixed : shown ? shownName(shown.name, shown.pressed) : words.defaultValue,
    ),
  );
  return {
    element: h(
      "div",
      { class: "field align-field", "data-field": across.name },
      label,
      h("div", { class: "align-row" }, grid, inherit),
    ),
    pressed,
  };
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
 * Inside a card the row shows `text` (the label without the effect's name the header shows) while
 * the group keeps the field's full label as its accessible name. With `inherit` null the row has
 * no "theme" chip: every chip is a colour, as in the pen menu, whose first chip is its default.
 */
export function colorRow(
  field: InspectorField,
  send: Send,
  inherit: string | null = messages().inspector.themeChip,
  text?: string,
): HTMLElement {
  const id = keyOf(field.name);
  const words = messages().inspector;
  const swatches = field.swatches ?? [];
  const value = field.value === null ? null : String(field.value);
  const mixed = value === null && field.mixed === true;
  // The written value, or what applies without one: an inherited value or the theme's.
  const inherited = field.placeholder;
  const shown =
    value ??
    (mixed ? words.mixed : inherited ? words.inherited(inherited) : (inherit ?? "").toLowerCase());
  const labelId = `${id}-label`;
  const group = h("div", {
    class: "chips",
    role: "radiogroup",
    ...(text === undefined ? { "aria-labelledby": labelId } : { "aria-label": field.label }),
  });
  // A sticky's fill row starts with the six colours of paper, which the session sends by their
  // hex: they are named by their colour ("Pink"), and drawn as paper apart from the tokens.
  const options: { value: string | null; label: string; color?: string; paper?: boolean }[] = [
    ...(inherit === null ? [] : [{ value: null, label: inherit }]),
    ...swatches.map((s) => {
      const paper = stickyColourName(s.token);
      return {
        value: s.token,
        label: paper ?? s.token,
        color: s.color,
        paper: paper !== undefined,
      };
    }),
  ];
  const checked = mixed ? -1 : options.findIndex((o) => o.value === value);
  const chips = options.map((option, i) => {
    const chip = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: option.color ? (option.paper ? "chip paper" : "chip") : "chip inherit",
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
    h("span", { id: labelId }, text ?? field.label),
    h("span", { class: "value", "data-value": "" }, shown),
    picker,
  );
  return h("div", { class: "field colors", "data-field": field.name }, label, group);
}

/** A toggle of the Effects row: an `effect.*` field of the strip that belongs to no card. */
const isToggle = (field: Pick<InspectorField, "name" | "group">): boolean =>
  field.name.startsWith("effect.") && field.group === undefined;

/** An effect's card in the strip: its toggle, its duration (shown in the header) and the rest. */
export interface EffectCard {
  readonly toggle: InspectorField;
  readonly duration: InspectorField | undefined;
  readonly fields: readonly InspectorField[];
}

/**
 * The cards of the strip: the toggles in their order, each with the fields whose `group` names it,
 * the duration apart since it goes in the card's header. A toggle without fields (an effect that
 * is off, or the toggles of a selection) draws no card.
 */
export function effectCards(strip: readonly InspectorField[]): EffectCard[] {
  return strip.filter(isToggle).map((toggle) => {
    const grouped = strip.filter((f) => f.group === toggle.name);
    const speed = `${toggle.name}.duration`;
    return {
      toggle,
      duration: grouped.find((f) => f.name === speed),
      fields: grouped.filter((f) => f.name !== speed),
    };
  });
}

/** What a card's control shows: its label without the effect's name, which the header shows once. */
export function cardLabel(header: string, label: string): string {
  const prefix = `${header}: `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

/**
 * The cards open for the next model of a target: the effects whose toggle was off (or absent) in
 * `previous` and is on in `next`, alone, when there are any (the card of an effect just turned on
 * opens and the others close); else its kept set minus the effects that are off. A target seen for
 * the first time (`previous` undefined) starts from its kept set, empty at first.
 */
export function openCards(
  previous: readonly Pick<InspectorField, "name" | "value" | "group">[] | undefined,
  next: readonly Pick<InspectorField, "name" | "value" | "group">[],
  kept: ReadonlySet<string>,
): Set<string> {
  const toggles = next.filter(isToggle);
  const wasOn = (name: string) => previous?.some((f) => f.name === name && f.value === "on");
  const turnedOn = toggles.filter((t) => t.value === "on" && previous && !wasOn(t.name));
  if (turnedOn.length > 0) return new Set(turnedOn.map((t) => t.name));
  const open = new Set(kept);
  for (const toggle of toggles) if (toggle.value !== "on") open.delete(toggle.name);
  return open;
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
 * The property inspector: the style strip first (colour chips, line, width, arrowhead, the effects
 * with a card of settings for each one that is on, the diagram's theme), then one control per field.
 */
export class Inspector {
  readonly element = h("aside", {
    class: "panel inspector",
    id: "mdg-inspector",
    "aria-label": messages().inspector.label,
    tabindex: -1,
  });
  /** The rail the panel folds to, one button that unfolds it; kept across renders. */
  private readonly rail = h("div", { class: "inspector-rail" });
  /** The host's key for the fold, shown in the titles of the fold buttons; "" when it has none. */
  private key = "";
  private collapsed = false;
  private model: InspectorModel | undefined;
  /** A canvas that only shows: every field is drawn disabled and nothing is committed. */
  private readOnly = false;
  /**
   * The effects whose cards are open, by target (its kind and ids): the card of an effect just
   * turned on opens, a card opened or closed by hand stays so while the canvas lasts; never kept.
   */
  private readonly cards = new Map<string, Set<string>>();

  constructor(private readonly actions: InspectorActions) {
    this.element.append(
      h(
        "datalist",
        { id: "mdg-color-tokens" },
        ...COLOR_TOKENS.map((t) => h("option", { value: t })),
      ),
      this.rail,
    );
    this.drawRail();
  }

  /** The rail's button, which has the focus when the panel folds from inside. */
  get railButton(): HTMLButtonElement {
    return this.rail.querySelector("button")!;
  }

  /** The host's key for the fold ("" for none), named in the titles of the fold buttons. */
  setKey(key: string): void {
    this.key = key;
    this.drawRail();
    this.element.querySelector(".panel-head .fold")?.replaceWith(this.foldHead());
  }

  /**
   * Folds the panel to its rail or unfolds it: the stylesheet narrows it and swaps its contents
   * for the rail, and both buttons say whether the panel is open.
   */
  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.element.dataset.collapsed = String(collapsed);
    for (const button of this.element.querySelectorAll<HTMLButtonElement>("button.fold")) {
      button.setAttribute("aria-expanded", String(!collapsed));
    }
  }

  private drawRail(): void {
    this.rail.replaceChildren(
      foldButton(
        messages().inspector.showPanel,
        this.key,
        !this.collapsed,
        "inspector:unfold",
        () => this.actions.fold(false),
      ),
    );
  }

  /** The head's button, which folds the panel. */
  private foldHead(): HTMLButtonElement {
    return foldButton(
      messages().inspector.hidePanel,
      this.key,
      !this.collapsed,
      "inspector:fold",
      () => this.actions.fold(true),
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
    const same = this.model !== undefined && sameTarget(this.model, model);
    // The cards open for this target: the card of an effect just turned on joins the kept ones.
    const targetKey = `${model.target.kind}|${model.target.ids.join()}`;
    const kept = this.cards.get(targetKey) ?? new Set<string>();
    const open = openCards(same ? this.model!.fields : undefined, model.fields, kept);
    const grown = [...open].filter((effect) => !kept.has(effect));
    this.cards.set(targetKey, open);
    if (same && holdsTyping(focused, this.element, model.fields)) {
      this.model = model;
      return;
    }
    const key = inside ? (focused!.dataset.key ?? focused!.id) : undefined;
    this.model = model;
    this.clearFields();
    this.rail.before(h("div", { class: "panel-head" }, h("h2", {}, model.title), this.foldHead()));
    // Read-only: the same fields, each one disabled, so the values can be read and nothing written.
    const fields: readonly InspectorField[] = this.readOnly
      ? model.fields.map((f) => ({ ...f, readonly: true }))
      : model.fields;
    const strip = fields.filter((f) => f.section === "strip");
    if (strip.length > 0) {
      // The style fields, then the effects side by side as toggles, then one card per effect that
      // is on with its settings.
      const cards = effectCards(strip);
      const toggles = cards.map((card) => card.toggle);
      const words = messages().inspector;
      const section = h("section", { class: "strip", "aria-label": words.strip });
      for (const field of strip) {
        // The two alignments are one control, drawn where the text alignment is.
        if (
          field.name === "style.verticalAlign" &&
          strip.some((f) => f.name === "style.textAlign")
        ) {
          continue;
        }
        if (field.name === "style.textAlign") {
          section.append(
            this.alignment(
              field,
              strip.find((f) => f.name === "style.verticalAlign"),
            ),
          );
          continue;
        }
        // The font, size and weight are one group, headed Text, drawn where the font is.
        if (TEXT_FIELDS.includes(field.name)) {
          if (field.name === strip.find((f) => TEXT_FIELDS.includes(f.name))!.name) {
            section.append(this.textGroup(strip.filter((f) => TEXT_FIELDS.includes(f.name))));
          }
          continue;
        }
        if (!isToggle(field) && field.group === undefined) section.append(this.stripField(field));
      }
      if (toggles.length > 0) {
        section.append(effectsRow(toggles, (f) => this.stripField(f)));
      }
      for (const card of cards) {
        if (card.duration || card.fields.length > 0) {
          section.append(this.effectCard(card, open, grown, targetKey));
        }
      }
      this.rail.before(section);
    }
    for (const row of inspectorRows(fields.filter((f) => f.section !== "strip"))) {
      if (row.kind === "field") this.rail.before(this.field(row.field));
      // A canvas that only shows has nothing to list for an owner without tags.
      else if (row.tags.length > 0 || !this.readOnly) {
        this.rail.before(this.tagList(row.tags, row.add));
      }
    }
    refocus(this.element, key);
  }

  /** Shows no properties: what a file without diagrams has. The next model draws them again. */
  clear(): void {
    this.model = undefined;
    this.cards.clear();
    this.clearFields();
  }

  /**
   * Removes the drawn fields, keeping the colour list and the rail where they are: a render that
   * comes while the rail is pressed never takes its button out from under the pointer.
   */
  private clearFields(): void {
    for (const child of [...this.element.children]) {
      if (child.tagName !== "DATALIST" && child !== this.rail) child.remove();
    }
  }

  /**
   * An effect's card under the Effects row: a header with the disclosure button (the effect's
   * name, named "<effect>: settings" so it never shares the toggle's name) and the duration beside
   * it, then the body with the other settings. Opening and closing by hand changes the card in
   * place, so it moves on the canvas's motion tokens, and is remembered for the target; a card that
   * appears because its effect was just turned on grows in (`data-grow`).
   */
  private effectCard(
    card: EffectCard,
    open: ReadonlySet<string>,
    grown: readonly string[],
    targetKey: string,
  ): HTMLElement {
    const words = messages().inspector;
    const effect = card.toggle.name;
    const name = card.toggle.label;
    const bodyId = `mdg-card-${effect.replace(/\W/g, "-")}`;
    const isOpen = open.has(effect);
    const head = h(
      "button",
      {
        type: "button",
        class: "card-head",
        "data-key": `${effect}:card`,
        "aria-expanded": String(isOpen),
        "aria-controls": bodyId,
        "aria-label": words.effectSettings(name),
      },
      icon(CHEVRON),
      h("span", { class: "card-name" }, name),
    );
    const element = h("div", {
      class: "effect-card",
      "data-effect": effect,
      "data-open": String(isOpen),
      "data-grow": grown.includes(effect) ? "true" : undefined,
    });
    head.addEventListener("click", () => {
      const now = element.dataset.open !== "true";
      element.dataset.open = String(now);
      delete element.dataset.grow;
      head.setAttribute("aria-expanded", String(now));
      const set = this.cards.get(targetKey);
      if (now) set?.add(effect);
      else set?.delete(effect);
    });
    head.addEventListener("keydown", (e) => e.stopPropagation());
    const header = h("div", { class: "card-header" }, head);
    if (card.duration) {
      const duration = card.duration;
      const input = fieldControl(duration, keyOf(duration.name), this.send(duration));
      input.setAttribute("aria-label", duration.label);
      header.append(
        h(
          "span",
          { class: "card-duration" },
          input,
          h("span", { class: "unit", "aria-hidden": "true" }, words.milliseconds),
        ),
      );
    }
    const body = h(
      "div",
      { class: "card-body", id: bodyId },
      h("div", { class: "card-fields" }, ...card.fields.map((f) => this.cardRow(name, f))),
    );
    element.append(header, body);
    return element;
  }

  /** A setting inside a card: the label without the effect's name, then its control. */
  private cardRow(header: string, field: InspectorField): HTMLElement {
    const send = this.send(field);
    const text = cardLabel(header, field.label);
    if (field.type === "color" && field.swatches) return colorRow(field, send, undefined, text);
    const id = keyOf(field.name);
    const control = fieldControl(field, id, send);
    control.setAttribute("aria-label", field.label);
    return h(
      "div",
      { class: "field card-row", "data-field": field.name },
      h("label", { for: id }, text),
      control,
    );
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

  /** The cell of the alignment picker pressed in the last drawing, by target. */
  private alignPressed: { readonly target: string; readonly index: number } | undefined;

  /**
   * The alignment picker of the selection: a cell writes the alignments that change, both in one
   * edit (one undo step) when both do; the highlight slides from the cell pressed before.
   */
  private alignment(across: InspectorField, down: InspectorField | undefined): HTMLElement {
    const ids = this.model!.target.ids;
    const target = `${this.model!.target.kind}:${ids.join()}`;
    const from = this.alignPressed?.target === target ? this.alignPressed.index : undefined;
    const { element, pressed } = alignField(
      across,
      down,
      (changes) => {
        if (this.readOnly) return;
        if (changes.length === 1) this.actions.commit(ids, changes[0]!.field, changes[0]!.value);
        else this.actions.act({ kind: "setFields", ids, fields: changes });
      },
      from,
    );
    this.alignPressed = { target, index: pressed };
    return element;
  }

  /** The strip's Text group: the font button, the size control and the weight chips. */
  private textGroup(fields: readonly InspectorField[]): HTMLElement {
    const words = messages().inspector;
    const group = h(
      "div",
      { class: "text-group", role: "group", "aria-labelledby": "mdg-text-group" },
      h("div", { class: "group-title", id: "mdg-text-group" }, words.text),
    );
    for (const field of fields) {
      if (field.name === "style.font") group.append(this.fontField(field));
      else if (field.name === "style.fontSize") group.append(this.sizeField(field));
      else group.append(this.stripField(field));
    }
    return group;
  }

  /**
   * A Font field: a button with the family written in that family, or the one that applies,
   * greyed; "custom" for a stack the picker does not list; it opens the font picker.
   */
  private fontField(field: InspectorField): HTMLElement {
    const ids = this.model!.target.ids;
    const current = field.value === null ? null : String(field.value);
    const button = fontButton(field, current, (anchor) =>
      this.actions.pickFont(ids, field.name, anchor, current),
    );
    return h(
      "div",
      { class: "field font-field", "data-field": field.name },
      h("label", { for: keyOf(field.name) }, field.label),
      button,
    );
  }

  /**
   * A Text size field: the size written, or the one that applies as placeholder, with the common
   * sizes listed; − and + step every selected item from the size it draws, as the keys do; a size
   * typed outside the property's bounds is refused in place; "theme" removes it.
   */
  private sizeField(field: InspectorField): HTMLElement {
    const send = this.send(field);
    const ids = this.model!.target.ids;
    const words = messages().inspector;
    const id = keyOf(field.name);
    const listId = `${id}-list`;
    const note = h("div", { class: "field-note", role: "alert", hidden: true });
    const input = h("input", {
      id,
      type: "text",
      inputmode: "decimal",
      class: "size-input",
      placeholder: field.mixed ? words.mixed : (field.placeholder ?? ""),
      list: listId,
      disabled: field.readonly,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": field.label,
    });
    input.value = field.value === null ? "" : String(field.value);
    let sent = input.value;
    const refuse = (on: boolean) => {
      input.toggleAttribute("aria-invalid", on);
      note.hidden = !on;
      note.textContent = on ? words.sizeRange(FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max) : "";
    };
    const commit = () => {
      if (input.value === sent) return;
      const text = input.value.trim().replace(/px$/, "");
      if (text === "") {
        sent = input.value;
        refuse(false);
        send(null);
        return;
      }
      const size = Number(text);
      if (!Number.isFinite(size) || size < FONT_SIZE_RANGE.min || size > FONT_SIZE_RANGE.max) {
        refuse(true);
        return;
      }
      sent = input.value;
      refuse(false);
      send(size);
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        input.value = field.value === null ? "" : String(field.value);
        refuse(false);
        input.blur();
      }
    });
    const step = (direction: 1 | -1, label: string, path: string) => {
      const button = h(
        "button",
        {
          type: "button",
          class: "step",
          "data-key": `${field.name}:${direction > 0 ? "larger" : "smaller"}`,
          "aria-label": label,
          title: label,
          disabled: field.readonly,
        },
        icon(path),
      );
      button.addEventListener("click", () => {
        if (this.readOnly) return;
        this.actions.act({ kind: "stepTextSize", ids, step: direction });
      });
      button.addEventListener("keydown", (e) => e.stopPropagation());
      return button;
    };
    const inherit = h(
      "button",
      {
        type: "button",
        class: "quick",
        "data-key": `${field.name}:theme`,
        title: words.inheritTitle,
        disabled: field.readonly || field.value === null,
      },
      words.themeChip,
    );
    inherit.addEventListener("click", () => send(null));
    inherit.addEventListener("keydown", (e) => e.stopPropagation());
    return h(
      "div",
      { class: "field size-field", "data-field": field.name },
      h("label", { for: id }, field.label),
      h(
        "div",
        { class: "row size-row" },
        step(-1, words.smaller, ICONS.minus),
        input,
        step(1, words.larger, ICONS.plus),
        inherit,
        h(
          "datalist",
          { id: listId },
          ...(field.list ?? []).map((size) => h("option", { value: String(size) })),
        ),
      ),
      note,
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

  /**
   * **Tags** of a sequence message or participant: one list under the heading, a text box per tag
   * in order with its **Remove** button (the field's action), then the box whose text adds a tag at
   * the end. A canvas that only shows lists the tags, without the buttons or the box that adds.
   */
  private tagList(tags: readonly InspectorField[], add: InspectorField | undefined): HTMLElement {
    const words = messages().inspector;
    const labelId = "mdg-tags-label";
    const list = h("ul", { class: "tag-list", "aria-labelledby": labelId });
    for (const field of tags) {
      const input = tagInput(field, keyOf(field.name), this.send(field));
      const row = h("li", { class: "tag-row", "data-field": field.name }, input);
      const button = field.button;
      if (button && !this.readOnly) {
        const text = field.value === null ? "" : String(field.value);
        const remove = h(
          "button",
          {
            type: "button",
            class: "choose small tag-remove",
            "data-key": `${field.name}:button`,
            title: words.removeTagTitle(text),
            "aria-label": words.removeTagTitle(text),
          },
          button.label,
        );
        remove.addEventListener("click", () => this.actions.act(button.action));
        remove.addEventListener("keydown", (e) => e.stopPropagation());
        row.append(remove);
      }
      list.append(row);
    }
    if (add && !this.readOnly) {
      list.append(
        h(
          "li",
          { class: "tag-row tag-add", "data-field": add.name },
          tagInput(add, keyOf(add.name), this.send(add)),
        ),
      );
    }
    return h(
      "div",
      { class: "field tags-field", "data-field": "tags" },
      h("span", { class: "field-label", id: labelId }, words.tags),
      list,
    );
  }

  private field(field: InspectorField): HTMLElement {
    const send = this.send(field);
    if (field.type === "boolean") return booleanField(field, send);
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
  /** Folds the properties to their rail, the theme panel with them. */
  fold(): void;
  /** Opens the font picker under `anchor` for a font token, with its written stack or null. */
  pickFont(token: string, anchor: HTMLElement, current: string | null): void;
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
  /** The host's key for the fold, named in the fold button's title; "" when it has none. */
  private key = "";

  constructor(private readonly actions: ThemePanelActions) {}

  /** The host's key for the fold ("" for none), named in the head's fold button. */
  setKey(key: string): void {
    this.key = key;
  }

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
    // The theme panel stands where the properties do: it folds with them, from its own head.
    const fold = foldButton(messages().inspector.hidePanel, this.key, true, "theme:fold", () =>
      this.actions.fold(),
    );
    this.element.append(
      h("div", { class: "panel-head" }, h("h2", {}, words.title(panel.id)), fold, close),
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
    if (field.type === "font") {
      const current = field.value === null ? null : String(field.value);
      const button = fontButton(named, current, (anchor) =>
        this.actions.pickFont(field.name, anchor, current),
      );
      return h(
        "div",
        { class: "field font-field", "data-field": named.name },
        h("label", { for: keyOf(named.name) }, field.label),
        button,
      );
    }
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
