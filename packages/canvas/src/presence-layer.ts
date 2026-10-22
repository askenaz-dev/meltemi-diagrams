import { clear, h, s } from "./dom.js";
import {
  TAG_HEIGHT,
  lineWidth,
  outlineBox,
  tagPlacement,
  type CursorMark,
  type PresenceMark,
} from "./presence.js";

/** How wide a tag grows before its name is cut with an ellipsis, in pixels. */
const TAG_MAX_WIDTH = 180;

/** The cursor's arrow, as in a pointer: its tip at (1, 1) of a 16 by 20 box. */
const ARROW = "M1 1 L1 16.5 L5.2 12.6 L8 18.8 L10.9 17.5 L8.2 11.4 L13.8 11.4 Z";

/** A cursor drawn, and the diagram point it was last drawn at. */
interface Drawn {
  readonly element: HTMLElement;
  readonly tag: HTMLElement;
  scene: { readonly x: number; readonly y: number };
}

/**
 * The layer that draws other people's selections and pointers over the scene (`live-collaboration`):
 * an outline in each person's colour around what they selected and a tag with their name, and a
 * cursor in their colour with the name at its tail where their pointer is. It is a sibling of the
 * scene and of the selection's overlay, never inside them, so it is not part of anything the canvas
 * copies, exports or posts; its nodes carry no `data-id` and no `data-role`, so no hit test can find
 * them, and the stylesheet gives them `pointer-events: none`. It is hidden from assistive technology:
 * who is here is the host's to say.
 *
 * A cursor is kept from one drawing to the next for the same person, so that it glides to where
 * their pointer went (200 ms, the stylesheet's) instead of jumping four times a second; when only the
 * view moved (a pan, a zoom) it follows at once, so that it stays on the point it shows.
 *
 * Names are the one thing a person controls, and they are only ever put in with `append(string)`,
 * which makes a text node: a name that looks like markup shows as its characters.
 */
export class PresenceLayer {
  readonly element = h("div", { class: "presence", "aria-hidden": "true" });
  private readonly outlines = s("svg", {
    class: "presence-outlines",
    "aria-hidden": "true",
    focusable: "false",
  });
  private readonly cursorLayer = h("div", { class: "presence-cursors" });
  private readonly cursors = new Map<string, Drawn>();

  /** How many marks are drawn: the canvas clears on every redraw, which is free when it is none. */
  private drawn = 0;

  constructor() {
    this.element.append(this.outlines, this.cursorLayer);
  }

  /** Removes every outline, tag and cursor. */
  clear(): void {
    this.clearMarks();
    if (this.cursors.size === 0) return;
    this.cursors.clear();
    clear(this.cursorLayer);
  }

  private clearMarks(): void {
    if (this.drawn === 0) return;
    this.drawn = 0;
    clear(this.outlines);
    for (const tag of this.element.querySelectorAll(".presence-tag")) tag.remove();
  }

  /** Draws the marks and the cursors, replacing whatever was drawn. */
  draw(marks: readonly PresenceMark[], cursors: readonly CursorMark[] = []): void {
    this.clearMarks();
    const tags = document.createDocumentFragment();
    for (const mark of marks) {
      this.outlines.append(this.outline(mark));
      if (mark.person.name !== "") tags.append(this.tag(mark));
    }
    this.element.insertBefore(tags, this.cursorLayer);
    this.drawn = marks.length;
    this.drawCursors(cursors);
  }

  /**
   * Moves each person's cursor to its tip: it glides when their pointer moved in the diagram, and
   * follows the view at once when only the view moved. Cursors of people no longer pointing go.
   */
  private drawCursors(cursors: readonly CursorMark[]): void {
    const kept = new Set<string>();
    for (const cursor of cursors) {
      kept.add(cursor.key);
      let drawn = this.cursors.get(cursor.key);
      const fresh = drawn === undefined;
      if (!drawn) {
        drawn = this.cursor(cursor);
        this.cursors.set(cursor.key, drawn);
        this.cursorLayer.append(drawn.element);
      }
      const moved = drawn.scene.x !== cursor.scene.x || drawn.scene.y !== cursor.scene.y;
      drawn.element.classList.toggle("gliding", !fresh && moved);
      drawn.scene = cursor.scene;
      // The arrow's tip is one pixel into its box.
      drawn.element.style.transform = `translate(${cursor.tip.x - 1}px, ${cursor.tip.y - 1}px)`;
      drawn.element.style.setProperty("--presence-colour", cursor.person.colour);
      drawn.tag.style.backgroundColor = cursor.person.colour;
      drawn.tag.style.color = cursor.person.text;
    }
    for (const [key, drawn] of this.cursors) {
      if (kept.has(key)) continue;
      this.cursors.delete(key);
      drawn.element.remove();
    }
  }

  private cursor(mark: CursorMark): Drawn {
    const arrow = s(
      "svg",
      {
        class: "presence-cursor-arrow",
        width: 16,
        height: 20,
        viewBox: "0 0 16 20",
        "aria-hidden": "true",
        focusable: "false",
      },
      s("path", { d: ARROW }),
    );
    // `h` appends the name as a string, which makes a text node.
    const tag = h("span", { class: "presence-cursor-tag" }, mark.person.name);
    tag.style.maxWidth = `${TAG_MAX_WIDTH}px`;
    tag.hidden = mark.person.name === "";
    const element = h("div", { class: "presence-cursor" }, arrow, tag);
    return { element, tag, scene: mark.scene };
  }

  private outline(mark: PresenceMark): SVGElement {
    const common = {
      class: "presence-outline",
      stroke: mark.person.colour,
      "data-target": mark.target,
    };
    if (mark.shape.kind === "line") {
      return s("polyline", {
        ...common,
        points: mark.shape.points.map((p) => `${p.x},${p.y}`).join(" "),
        "stroke-width": lineWidth(mark),
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      });
    }
    // The stroke is centred on the rectangle, which lies one pixel in, so two pixels of it are
    // inside the border of the box.
    const box = outlineBox(mark.shape.box, mark.rank);
    return s("rect", {
      ...common,
      x: box.x + 1,
      y: box.y + 1,
      width: Math.max(0, box.width - 2),
      height: Math.max(0, box.height - 2),
      rx: 3,
      "stroke-width": 2,
    });
  }

  private tag(mark: PresenceMark): HTMLElement {
    const at = tagPlacement(mark);
    // `h` appends the name as a string, which makes a text node.
    const tag = h("span", { class: "presence-tag", "data-target": mark.target }, mark.person.name);
    tag.style.left = `${at.x}px`;
    tag.style.top = `${at.y}px`;
    tag.style.height = `${TAG_HEIGHT}px`;
    tag.style.lineHeight = `${TAG_HEIGHT}px`;
    tag.style.maxWidth = `${TAG_MAX_WIDTH}px`;
    tag.style.backgroundColor = mark.person.colour;
    tag.style.color = mark.person.text;
    return tag;
  }
}
