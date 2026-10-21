import { clear, h, s } from "./dom.js";
import { TAG_HEIGHT, lineWidth, outlineBox, tagPlacement, type PresenceMark } from "./presence.js";

/** How wide a tag grows before its name is cut with an ellipsis, in pixels. */
const TAG_MAX_WIDTH = 180;

/**
 * The layer that draws other people's selections over the scene (`live-collaboration`): an outline
 * in each person's colour around what they selected and a tag with their name. It is a sibling of
 * the scene and of the selection's overlay, never inside them, so it is not part of anything the
 * canvas copies, exports or posts; its nodes carry no `data-id` and no `data-role`, so no hit test
 * can find them, and the stylesheet gives them `pointer-events: none`. It is hidden from assistive
 * technology: who is here is the host's to say.
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

  /** How many marks are drawn: the canvas clears on every redraw, which is free when it is none. */
  private drawn = 0;

  constructor() {
    this.element.append(this.outlines);
  }

  /** Removes every outline and tag. */
  clear(): void {
    if (this.drawn === 0) return;
    this.drawn = 0;
    clear(this.outlines);
    for (const tag of this.element.querySelectorAll(".presence-tag")) tag.remove();
  }

  /** Draws the marks, replacing whatever was drawn. */
  draw(marks: readonly PresenceMark[]): void {
    this.clear();
    const tags = document.createDocumentFragment();
    for (const mark of marks) {
      this.outlines.append(this.outline(mark));
      if (mark.person.name !== "") tags.append(this.tag(mark));
    }
    this.element.append(tags);
    this.drawn = marks.length;
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
