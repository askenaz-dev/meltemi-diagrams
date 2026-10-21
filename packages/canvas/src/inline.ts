import type { Box, Point, TextPlace } from "@meltemi/diagrams-editor/canvas";
import { h } from "./dom.js";

/** Room for the caret after the last character. */
const CARET = 2;

/** The editor's frame on the stage, in screen pixels. */
export interface InlineFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly lineHeight: number;
}

/**
 * Where the editor lies over a text drawn at `place` (diagram coordinates) at a zoom, its anchor
 * already on the screen: at least as wide as the text's room from its anchor, wider around its
 * alignment point as the longest line needs (`content`, in screen pixels), and as tall as its
 * lines, centred on the middle of the drawn lines.
 */
export function inlineFrame(
  place: TextPlace,
  zoom: number,
  anchor: Point,
  content: { readonly width: number; readonly lines: number },
): InlineFrame {
  const { area } = place;
  const x = place.anchor.x;
  const room =
    place.align === "left"
      ? area.x + area.width - x
      : place.align === "right"
        ? x - area.x
        : 2 * Math.min(x - area.x, area.x + area.width - x);
  const fontSize = place.size * zoom;
  const lineHeight = place.line * zoom;
  // An empty editor keeps the width of a character, so its frame shows where typing goes.
  const width = Math.max(Math.max(0, room) * zoom, content.width + CARET, fontSize / 2);
  const height = Math.max(1, content.lines) * lineHeight;
  const left =
    place.align === "left"
      ? anchor.x
      : place.align === "right"
        ? anchor.x - width
        : anchor.x - width / 2;
  return { left, top: anchor.y - height / 2, width, height, fontSize, lineHeight };
}

/**
 * The place of a text the scene does not draw (an untitled group, an event without text): the
 * middle of its box, at the canvas's own size.
 */
export function boxPlace(box: Box, font: string): TextPlace {
  return {
    anchor: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    area: box,
    align: "center",
    font,
    size: 13,
    weight: 400,
    color: "var(--mdg-fg)",
    line: 16,
    lines: false,
  };
}

/**
 * The text an editor writes: a label keeps its line breaks but trailing ones, which would only
 * draw empty lines; a text drawn on one line, or an id, has none.
 */
export function inlineValue(value: string, multiline: boolean): string {
  const text = value.replace(/\r\n?/g, "\n");
  return multiline ? text.replace(/\n+$/, "") : text.replace(/\n/g, " ");
}

/**
 * The drawn lines of a label in the SVG of the stage: the texts of the groups of `id` and `roles`
 * that show `lines` in order (a fragment's condition in brackets). A line drawn as glyph outlines
 * is a path that carries its text; an empty one draws nothing and is passed over.
 */
export function drawnLines(
  svg: Element,
  id: string,
  roles: readonly string[],
  lines: readonly string[],
): Element[] {
  const found: Element[] = [];
  const same = (text: string | null, line: string) => text === line || text === `[${line}]`;
  for (const role of roles) {
    const selector = `g[data-id="${id.replace(/["\\]/g, "\\$&")}"][data-role="${role}"]`;
    for (const group of svg.querySelectorAll(selector)) {
      // An element with a link draws inside an `<a>`.
      const children = [...group.children].flatMap((child) =>
        child.tagName.toLowerCase() === "a" ? [...child.children] : [child],
      );
      let i = 0;
      for (const node of children) {
        const tag = node.tagName.toLowerCase();
        const text =
          tag === "text"
            ? node.textContent
            : tag === "path" && node.hasAttribute("aria-label")
              ? node.getAttribute("aria-label")
              : undefined;
        if (text === undefined || i >= lines.length) continue;
        let j = i;
        while (j < lines.length && !same(text, lines[j]!) && lines[j] === "") j++;
        if (j < lines.length && same(text, lines[j]!)) {
          found.push(node);
          i = j + 1;
        }
      }
    }
  }
  return found;
}

/** What an inline editor edits and how it says so. */
export interface InlineOptions {
  /** The element, relation key or event key. */
  readonly id: string;
  /** The editor renames the id. */
  readonly rename: boolean;
  readonly value: string;
  /** Whether Shift+Enter breaks a line: a label the drawing breaks at `\n`. */
  readonly multiline: boolean;
  readonly label: string;
  /** The keys, said to assistive technology. */
  readonly keys: string;
  readonly commit: () => void;
  readonly cancel: () => void;
}

/**
 * The editor of a label typed where it is drawn: a text area with no frame, autocomplete or
 * spelling, and no background but a relation's pill, in the drawing's font, size, weight, colour
 * and alignment at the zoom, which grows with its lines. Enter, Tab and a click outside commit;
 * Shift+Enter breaks a line of a label that has lines; Escape cancels.
 */
export class InlineEditor {
  readonly element: HTMLTextAreaElement;
  private place: TextPlace | undefined;
  private zoom = 1;
  private anchor: Point = { x: 0, y: 0 };
  private done = false;

  constructor(readonly options: InlineOptions) {
    const area = h("textarea", {
      class: "inline",
      "aria-label": options.label,
      "aria-description": options.keys,
      "aria-multiline": options.multiline ? "true" : "false",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false",
      wrap: "off",
      rows: 1,
    });
    area.value = options.value;
    area.dataset.id = options.id;
    area.dataset.rename = options.rename ? "true" : "";
    area.addEventListener("keydown", (e) => {
      e.stopPropagation();
      // A character still being composed takes its Enter.
      if (e.isComposing) return;
      if (e.key === "Enter" && e.shiftKey && options.multiline) {
        // The text area breaks the line itself; the editor grows on the input that follows.
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.finish(options.commit);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.finish(options.cancel);
      }
    });
    area.addEventListener("input", () => this.fit());
    area.addEventListener("blur", () => this.finish(options.commit));
    // The editor lies on the stage: a press in it places the caret, it does not leave it.
    for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"] as const) {
      area.addEventListener(type, (e) => e.stopPropagation());
    }
    this.element = area;
  }

  /** The text to write, line breaks cleaned up. */
  get value(): string {
    return inlineValue(this.element.value, this.options.multiline);
  }

  /** Puts the editor over a text drawn at `place`, its anchor at `anchor` on the screen. */
  show(place: TextPlace, zoom: number, anchor: Point): void {
    this.place = place;
    this.zoom = zoom;
    this.anchor = anchor;
    const style = this.element.style;
    style.fontFamily = place.font;
    style.fontWeight = String(place.weight);
    style.color = place.color;
    style.caretColor = place.color;
    style.textAlign = place.align;
    // A relation's label is typed on its pill, so the line does not cross the text.
    style.background = place.background ?? "";
    style.paddingLeft = style.paddingRight = place.background ? `${(place.size * zoom) / 2}px` : "";
    this.fit();
  }

  /**
   * Turns the editor with the element whose text it edits: `angle` degrees about `centre`, the
   * centre of the element's box on the screen. 0 leaves it level.
   */
  turn(angle: number, centre: Point): void {
    this.angle = angle;
    this.centre = centre;
    this.fit();
  }

  private angle = 0;
  private centre: Point = { x: 0, y: 0 };

  /** Sizes the editor to its text and keeps it on its anchor. */
  fit(): void {
    const place = this.place;
    if (!place) return;
    const area = this.element;
    const style = area.style;
    const lines = area.value.split("\n").length;
    style.fontSize = `${place.size * this.zoom}px`;
    style.lineHeight = `${place.line * this.zoom}px`;
    // The width the lines need: measured with the editor collapsed, as it draws them.
    style.width = "0px";
    const frame = inlineFrame(place, this.zoom, this.anchor, { width: area.scrollWidth, lines });
    style.left = `${frame.left}px`;
    style.top = `${frame.top}px`;
    style.width = `${frame.width}px`;
    style.height = `${frame.height}px`;
    style.borderRadius = place.background ? `${frame.height / 2}px` : "";
    // A turned element's text is edited turned with it, about the element's centre.
    style.transformOrigin = this.angle
      ? `${this.centre.x - frame.left}px ${this.centre.y - frame.top}px`
      : "";
    style.transform = this.angle ? `rotate(${this.angle}deg)` : "";
    area.scrollLeft = 0;
    area.scrollTop = 0;
  }

  /** Focuses the editor without scrolling the stage, its text selected. */
  focus(): void {
    this.element.focus({ preventScroll: true });
    this.element.select();
  }

  /** Commits or cancels once: the blur that follows a key does nothing more. */
  private finish(then: () => void): void {
    if (this.done) return;
    this.done = true;
    then();
  }

  /** Takes the editor away without committing. */
  remove(): void {
    this.done = true;
    this.element.remove();
  }
}
