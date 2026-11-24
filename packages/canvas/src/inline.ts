import { expandTabs, type Box, type Point, type TextPlace } from "@meltemi/diagrams-editor/canvas";
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
 * Where the editor of a text that wraps (a sticky note's) lies, its anchor already on the screen:
 * exactly as wide as the text's area at the zoom, so its lines break where the drawing's do, and
 * `height` tall (its lines, measured). The block grows from where it is drawn: about its middle,
 * but kept inside the area while it fits, so a block drawn at the top grows down and one drawn at
 * the bottom grows up; a block taller than the area starts at its top, as the drawing's does.
 */
export function wrappedFrame(
  place: TextPlace,
  zoom: number,
  anchor: Point,
  height: number,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const { area } = place;
  const left = anchor.x + (area.x - place.anchor.x) * zoom;
  const top = anchor.y + (area.y - place.anchor.y) * zoom;
  const room = area.height * zoom;
  const centred = anchor.y - height / 2;
  return {
    left,
    top: height >= room ? top : Math.min(Math.max(centred, top), top + room - height),
    width: area.width * zoom,
    height,
  };
}

/**
 * Where the editor of a label that wraps at its room and grows down lies (`TextPlace.wrap` `grow`:
 * a sequence message's whose participants are pulled closer), its anchor (the middle of the drawn
 * lines) already on the screen: exactly as wide as the room at the zoom, so its words break where
 * the drawing's do, its top where the first of the `drawn` lines is drawn, and `height` tall (its
 * lines, measured). The top stays as lines are added, so the block grows down, as the row will;
 * nothing shrinks.
 */
export function grownFrame(
  place: TextPlace,
  zoom: number,
  anchor: Point,
  height: number,
  drawn: number,
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const { area } = place;
  return {
    left: anchor.x + (area.x - place.anchor.x) * zoom,
    top: anchor.y - (Math.max(1, drawn) * place.line * zoom) / 2,
    width: area.width * zoom,
    height: Math.max(height, place.line * zoom),
  };
}

/** The smallest size a sticky note's words shrink to, in diagram units, as the layout's do. */
export const MIN_WRAPPED_SIZE = 8;

/**
 * The size a sticky note's words are typed at: from the size the card draws them at before they
 * shrink (`fullSize`, else the size they are drawn at), smaller by one unit at a time while `fits`
 * says the lines are taller than the card, down to `MIN_WRAPPED_SIZE`, as the layout steps them. A
 * long text edited down to a word is typed at the size the card will draw it, not the one it shrank
 * to. `fits` is asked last at the size returned.
 */
export function wrappedSize(place: TextPlace, fits: (size: number) => boolean): number {
  let size = Math.max(place.fullSize ?? place.size, MIN_WRAPPED_SIZE);
  while (!fits(size) && size > MIN_WRAPPED_SIZE) {
    size = Math.max(MIN_WRAPPED_SIZE, Math.round((size - 1) * 100) / 100);
  }
  return size;
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
 * The lines the drawing shows for a label: the label itself when it is drawn on one line, else its
 * lines broken at `\n`, each with its tabs as the spaces that reach their tab stops, as drawn.
 */
export function drawnTextLines(text: string, oneLine: boolean): string[] {
  return (oneLine ? [text] : text.split("\n")).map(expandTabs);
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

/**
 * Every line of text an element draws, in order: the lines of a sticky note, which the layout
 * wraps where the label has no line break, so they are not the label's lines. A line drawn as
 * glyph outlines is a path that carries its text.
 */
export function wrappedLines(svg: Element, id: string): Element[] {
  const selector = `g[data-id="${id.replace(/["\\]/g, "\\$&")}"][data-role="element"]`;
  return [...svg.querySelectorAll(selector)].flatMap((group) =>
    [...group.children]
      .flatMap((child) => (child.tagName.toLowerCase() === "a" ? [...child.children] : [child]))
      .filter((node) => {
        const tag = node.tagName.toLowerCase();
        return tag === "text" || (tag === "path" && node.hasAttribute("aria-label"));
      }),
  );
}

/**
 * Every line of a label group the drawing shows, in order: the lines of a sequence message's
 * label, which the layout wraps at the room between its lifelines where the label has no line
 * break, so they are not the label's lines. A line drawn as glyph outlines is a path that carries
 * its text.
 */
export function labelLines(svg: Element, id: string): Element[] {
  const selector = `g[data-id="${id.replace(/["\\]/g, "\\$&")}"][data-role="label"]`;
  return [...svg.querySelectorAll(selector)].flatMap((group) =>
    [...group.children].filter((node) => {
      const tag = node.tagName.toLowerCase();
      return tag === "text" || (tag === "path" && node.hasAttribute("aria-label"));
    }),
  );
}

/**
 * One change of a code note's editor (decision 0078): `text` replaces the characters from `from`
 * to `to` of the value, and the selection is then `start` to `end`.
 */
export interface CodeEdit {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** A code edit applied to a value: what the text area holds after it. */
export function applyCodeEdit(value: string, edit: CodeEdit): string {
  return value.slice(0, edit.from) + edit.text + value.slice(edit.to);
}

/**
 * The indentation a code note's text uses: a tab when a line starts with one, else the fewest
 * spaces an indented line starts with, else two spaces.
 */
export function indentUnit(text: string): string {
  const lines = text.split("\n");
  if (lines.some((line) => line.startsWith("\t"))) return "\t";
  let fewest = Infinity;
  for (const line of lines) {
    const spaces = /^ +/.exec(line)?.[0].length ?? 0;
    if (spaces > 0 && line.trim() !== "") fewest = Math.min(fewest, spaces);
  }
  return fewest === Infinity ? "  " : " ".repeat(fewest);
}

/** Where the line holding `offset` starts. */
const lineStart = (value: string, offset: number) => value.lastIndexOf("\n", offset - 1) + 1;

/** Where the line holding `offset` ends, before its line break. */
const lineEnd = (value: string, offset: number) => {
  const end = value.indexOf("\n", offset);
  return end === -1 ? value.length : end;
};

/**
 * Enter in a code note: a line break in place of the selection, followed by the spaces and tabs
 * the caret's line starts with, so the new line keeps its indentation.
 */
export function breakLine(value: string, start: number, end: number): CodeEdit {
  const first = lineStart(value, start);
  const leading = /^[ \t]*/.exec(value.slice(first, start))![0];
  const text = `\n${leading}`;
  return { from: start, to: end, text, start: start + text.length, end: start + text.length };
}

/** The lines a selection touches: from the start of its first to the end of its last. */
function touched(value: string, start: number, end: number) {
  const from = lineStart(value, start);
  // A selection that ends where a line starts leaves that line out.
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  return { from, to: lineEnd(value, last) };
}

/**
 * Tab in a code note: `unit` at the caret, or at the start of every line a selection touches,
 * empty lines left as they are; the selection keeps covering what it covered.
 */
export function indentLines(value: string, start: number, end: number, unit: string): CodeEdit {
  if (start === end) {
    const caret = start + unit.length;
    return { from: start, to: end, text: unit, start: caret, end: caret };
  }
  const { from, to } = touched(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const text = lines.map((line) => (line === "" ? line : unit + line)).join("\n");
  const firstAdded = lines[0] === "" ? 0 : unit.length;
  return { from, to, text, start: start + firstAdded, end: end + (text.length - (to - from)) };
}

/**
 * Shift+Tab in a code note: one `unit` taken from the start of the caret's line, or of every line
 * a selection touches: a leading tab, or up to a unit of leading spaces (four for a tab unit).
 */
export function outdentLines(value: string, start: number, end: number, unit: string): CodeEdit {
  const { from, to } = touched(value, start, end);
  const width = unit === "\t" ? 4 : unit.length;
  let firstRemoved = 0;
  const lines = value
    .slice(from, to)
    .split("\n")
    .map((line, i) => {
      const removed = line.startsWith("\t") ? 1 : Math.min(width, /^ */.exec(line)![0].length);
      if (i === 0) firstRemoved = removed;
      return line.slice(removed);
    });
  const text = lines.join("\n");
  // The caret moves back by what its line lost before it, never into the line before.
  const caret = start - Math.min(firstRemoved, start - from);
  const removed = to - from - text.length;
  return {
    from,
    to,
    text,
    start: caret,
    end: start === end ? caret : Math.max(caret, end - removed),
  };
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
  /**
   * How the drawing wraps the text in its area (`TextPlace.wrap`), which the editor does too:
   * `shrink`, a sticky note's words, wrapped at the area's width at the drawn size and shrunk as
   * the text outgrows the card; `grow`, a sequence message's label whose participants are pulled
   * closer, wrapped at the room's width at its size, its first line kept where it is drawn and its
   * block growing down as lines are added. Absent, the editor does not wrap.
   */
  readonly wrap?: "shrink" | "grow";
  /**
   * With `wrap` `grow`, how many lines the drawing shows for the text (at least one): the editor's
   * first line goes where the first of them is drawn.
   */
  readonly drawnLines?: number;
  /**
   * The text of a code note (`TextPlace.format` `code`), typed as code: Enter breaks the line and
   * keeps its indentation, Tab and Shift+Tab indent and outdent, Ctrl+Enter or a click outside
   * commits and Escape cancels.
   */
  readonly code?: boolean;
  readonly label: string;
  /** The keys, said to assistive technology. */
  readonly keys: string;
  readonly commit: () => void;
  readonly cancel: () => void;
  /**
   * Ctrl+Enter (Cmd+Enter on a Mac) on the text of a card of a list: keeps the text and adds the
   * next card after it, whose editor opens in turn. Without it, Ctrl+Enter commits as Enter does.
   */
  readonly next?: () => void;
}

/**
 * The editor of a label typed where it is drawn: a text area with no frame, autocomplete or
 * spelling, and no background but a relation's pill, in the drawing's font, size, weight, colour
 * and alignment at the zoom, which grows with its lines. Enter, Tab and a click outside commit;
 * Shift+Enter breaks a line of a label that has lines; Ctrl+Enter on a card of a list commits and
 * adds the next card; Escape cancels.
 */
export class InlineEditor {
  readonly element: HTMLTextAreaElement;
  private place: TextPlace | undefined;
  private zoom = 1;
  private anchor: Point = { x: 0, y: 0 };
  private done = false;

  constructor(readonly options: InlineOptions) {
    const area = h("textarea", {
      class:
        options.wrap === "grow"
          ? "inline wrapping growing"
          : options.wrap
            ? "inline wrapping"
            : "inline",
      "aria-label": options.label,
      "aria-description": options.keys,
      "aria-multiline": options.multiline ? "true" : "false",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false",
      wrap: options.wrap ? "soft" : "off",
      rows: 1,
    });
    area.value = options.value;
    area.dataset.id = options.id;
    area.dataset.rename = options.rename ? "true" : "";
    area.addEventListener("keydown", (e) => {
      e.stopPropagation();
      // A character still being composed takes its Enter.
      if (e.isComposing) return;
      if (options.code && !options.rename && this.codeKey(e)) return;
      if (e.key === "Enter" && e.shiftKey && options.multiline) {
        // The text area breaks the line itself; the editor grows on the input that follows.
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && options.next) {
        e.preventDefault();
        this.finish(options.next);
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

  /**
   * The keys of a code note's editor: Enter (with Shift too) breaks the line with its indentation,
   * Tab and Shift+Tab indent and outdent, Ctrl+Enter commits. True when the key was taken.
   */
  private codeKey(e: KeyboardEvent): boolean {
    const area = this.element;
    const { value, selectionStart: start, selectionEnd: end } = area;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.finish(this.options.commit);
      return true;
    }
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      this.apply(breakLine(value, start, end));
      return true;
    }
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const unit = indentUnit(value);
      this.apply(
        e.shiftKey ? outdentLines(value, start, end, unit) : indentLines(value, start, end, unit),
      );
      return true;
    }
    return false;
  }

  /**
   * Makes a code edit as typing does, so that the browser's own undo takes it back; where the
   * browser cannot insert text that way, by replacing the characters.
   */
  private apply(edit: CodeEdit): void {
    const area = this.element;
    const expected = applyCodeEdit(area.value, edit);
    area.setSelectionRange(edit.from, edit.to);
    const typed =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, edit.text);
    if (!typed || area.value !== expected) area.value = expected;
    area.setSelectionRange(edit.start, edit.end);
    this.fit();
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
    const frame =
      this.options.wrap === "grow"
        ? this.grown(place)
        : this.options.wrap
          ? this.wrapped(place)
          : this.unwrapped(place);
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

  /** The frame of a text drawn on its lines, as wide as its longest line or its room. */
  private unwrapped(place: TextPlace): InlineFrame {
    const area = this.element;
    const style = area.style;
    const lines = area.value.split("\n").length;
    style.fontSize = `${place.size * this.zoom}px`;
    style.lineHeight = `${place.line * this.zoom}px`;
    // The width the lines need: measured with the editor collapsed, as it draws them.
    style.width = "0px";
    return inlineFrame(place, this.zoom, this.anchor, { width: area.scrollWidth, lines });
  }

  /**
   * The frame of a text that wraps at its area's width: the lines measured from the size the card
   * draws its words at before they shrink and, while they are taller than the area, at a size
   * smaller by one unit at a time (the line height keeping its ratio) down to the smallest the
   * drawing uses, as the layout shrinks them (`wrappedSize`): the text grows back as it is cut. The
   * drawing redraws the text at the commit, so a size that differs by a step is never written.
   */
  private wrapped(place: TextPlace): ReturnType<typeof wrappedFrame> {
    const area = this.element;
    const style = area.style;
    const zoom = this.zoom;
    const room = place.area.height * zoom;
    const ratio = place.size > 0 ? place.line / place.size : 1.25;
    style.width = `${place.area.width * zoom}px`;
    let height = 0;
    wrappedSize(place, (size) => {
      style.fontSize = `${size * zoom}px`;
      style.lineHeight = `${size * ratio * zoom}px`;
      style.height = "0px";
      height = area.scrollHeight;
      return height <= room + 0.5;
    });
    return wrappedFrame(place, zoom, this.anchor, height);
  }

  /**
   * The frame of a label that wraps at its room and grows down (`grownFrame`): its lines measured
   * at the drawn size in the room's width, its first line where the drawing's first line is. The
   * height follows the lines at once, so the text is where the caret is; the commit redraws.
   */
  private grown(place: TextPlace): ReturnType<typeof grownFrame> {
    const area = this.element;
    const style = area.style;
    const zoom = this.zoom;
    style.fontSize = `${place.size * zoom}px`;
    style.lineHeight = `${place.line * zoom}px`;
    style.width = `${place.area.width * zoom}px`;
    style.height = "0px";
    return grownFrame(place, zoom, this.anchor, area.scrollHeight, this.options.drawnLines ?? 1);
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
