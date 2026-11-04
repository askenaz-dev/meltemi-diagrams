import type { CanvasAction, CanvasProfile } from "@meltemi/diagrams-editor/canvas";
import { ICONS, clear, h, icon } from "./dom.js";
import { messages } from "./messages/index.js";

/** What the panel shows: the layers back to front, and what is on each. */
export interface LayersModel {
  readonly profile: CanvasProfile;
  /** Back to front, `main` included. */
  readonly layers: readonly string[];
  /** The layer of every element and relation, null for `main`. */
  readonly things: readonly { readonly id: string; readonly layer: string | null }[];
  readonly selection: readonly string[];
  readonly hidden: ReadonlySet<string>;
}

export interface LayersActions {
  act(action: CanvasAction): void;
  /** Hides or shows a layer on the canvas; nothing is written. */
  setHidden(layer: string, hidden: boolean): void;
  announce(text: string): void;
}

const MAIN = "main";

/**
 * The layers panel: the layers from front to back with how many things each holds; a layer is
 * added, renamed, removed, moved, hidden or shown, and the selection moved onto one.
 */
export class LayersPanel {
  readonly element = h("aside", {
    class: "panel layers",
    "aria-label": messages().layers.label,
    tabindex: -1,
    hidden: true,
  });
  private model: LayersModel | undefined;
  /** The layer whose name is being typed, kept across renders. */
  private renaming: string | undefined;
  /** A canvas that only shows: layers are hidden and shown, never added, renamed or moved. */
  private readOnly = false;

  constructor(private readonly actions: LayersActions) {}

  /** Turns read-only on or off; the panel is drawn again with or without its editing controls. */
  setReadOnly(on: boolean): void {
    if (this.readOnly === on) return;
    this.readOnly = on;
    this.renaming = undefined;
    this.element.toggleAttribute("data-readonly", on);
    if (this.model) this.show(this.model);
  }

  show(model: LayersModel): void {
    this.model = model;
    const words = messages().layers;
    // A render while a name is typed keeps the field; the panel itself may hold focus otherwise.
    const focused = document.activeElement;
    if (this.renaming && focused instanceof HTMLInputElement && this.element.contains(focused)) {
      return;
    }
    clear(this.element);
    const head = h("div", { class: "layers-head" }, h("h2", {}, words.title));
    if (!this.readOnly) {
      const add = h("button", { type: "button", title: words.add, "aria-label": words.add });
      add.append(icon(ICONS.plus), h("span", {}, words.addShort));
      add.addEventListener("click", () => this.actions.act({ kind: "addLayer" }));
      head.append(add);
    }
    this.element.append(head);
    const list = h("ul", { class: "layer-list", role: "list" });
    // Front to back, as a stack reads.
    const layers = [...model.layers].reverse();
    layers.forEach((layer, index) => list.append(this.row(layer, index, layers.length)));
    this.element.append(list);
    if (model.selection.length > 0 && !this.readOnly) {
      const move = h("div", { class: "field" });
      const select = h("select", { "aria-label": words.moveSelection });
      select.append(h("option", { value: "" }, words.moveSelection));
      for (const layer of layers) select.append(h("option", { value: layer }, layer));
      select.addEventListener("change", () => {
        if (select.value === "") return;
        const layer = select.value === MAIN ? null : select.value;
        this.actions.act({ kind: "setLayer", ids: [...model.selection], layer });
        this.actions.announce(words.moved(model.selection.length, select.value));
      });
      move.append(select);
      this.element.append(move);
    }
  }

  private row(layer: string, index: number, count: number): HTMLElement {
    const model = this.model!;
    const words = messages().layers;
    const onIt = model.things.filter((t) => (t.layer ?? MAIN) === layer).length;
    const hidden = model.hidden.has(layer);
    const row = h("li", { class: hidden ? "layer hidden" : "layer", "data-layer": layer });
    const eye = h("button", {
      type: "button",
      class: "eye",
      title: hidden ? words.show(layer) : words.hide(layer),
      "aria-label": hidden ? words.show(layer) : words.hide(layer),
      "aria-pressed": String(!hidden),
    });
    eye.append(icon(hidden ? ICONS.eyeOff : ICONS.eye));
    eye.addEventListener("click", () => this.actions.setHidden(layer, !hidden));
    row.append(eye);
    if (this.renaming === layer) {
      const input = h("input", { type: "text", value: layer, "aria-label": words.rename(layer) });
      const finish = (commit: boolean) => {
        const name = input.value.trim();
        this.renaming = undefined;
        if (commit && name !== "" && name !== layer) {
          this.actions.act({ kind: "renameLayer", layer, name });
        } else this.show(model);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
        e.stopPropagation();
      });
      input.addEventListener("blur", () => finish(true));
      row.append(input);
      queueMicrotask(() => {
        input.focus();
        input.select();
      });
    } else {
      const name = h("span", { class: "name" }, layer);
      if (layer !== MAIN && !this.readOnly) {
        name.setAttribute("title", words.renameHint);
        name.addEventListener("dblclick", () => {
          this.renaming = layer;
          this.show(model);
        });
      }
      row.append(name, h("span", { class: "count" }, String(onIt)));
    }
    // Moving, renaming and removing a layer write the document: not on a canvas that only shows.
    if (this.readOnly) return row;
    const tools = h("span", { class: "tools" });
    const button = (label: string, glyph: string, disabled: boolean, run: () => void) => {
      const b = h("button", { type: "button", title: label, "aria-label": label });
      b.append(icon(glyph));
      if (disabled) b.setAttribute("disabled", "");
      b.addEventListener("click", run);
      return b;
    };
    // Up is towards the front: the first row is the front.
    tools.append(
      button(words.up(layer), ICONS.up, index === 0, () =>
        this.actions.act({ kind: "moveLayer", layer, direction: "up" }),
      ),
      button(words.down(layer), ICONS.down, index === count - 1, () =>
        this.actions.act({ kind: "moveLayer", layer, direction: "down" }),
      ),
      button(words.remove(layer), ICONS.close, layer === MAIN, () => {
        this.actions.act({ kind: "removeLayer", layer });
        this.actions.announce(words.removed(layer, onIt));
      }),
    );
    row.append(tools);
    return row;
  }
}
