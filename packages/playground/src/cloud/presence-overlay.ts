// Other people's carets and selections over the code pane (`live-collaboration`, "Presence"): each
// caret a thin bar in the person's colour with their name on a flag that fades after two seconds
// of stillness, each selection a translucent band. A layer of the pane that takes no pointer and no
// selection, so it never gets in the way of typing and is never copied; the person's name is only
// ever set as text. Where things go is `presence-geometry.ts`; what is drawn is `presence-model.ts`.

import type { Timers } from "./binding.js";
import {
  TextPlace,
  lineStarts,
  visible,
  type Box,
  type Scroll,
  type TextMetrics,
} from "./presence-geometry.js";
import type { DrawnCaret } from "./presence-model.js";
import { messages } from "../messages/index.js";
import { h } from "../ui.js";

/** A name flag is shown this long after its caret moved, then fades. */
export const FLAG_FADE_MS = 2000;
/** The width of a caret bar, in pixels. */
export const CARET_WIDTH = 2;
/** The height of a name flag: on the first line it goes under the caret instead of above. */
export const FLAG_HEIGHT = 18;

/** What the overlay asks of the code pane. */
export interface OverlayHost {
  /** The layer over the text that the overlay draws in. */
  readonly layer: HTMLElement;
  /** The pane's measures now. */
  metrics(): TextMetrics;
  /** How far the text is scrolled. */
  scroll(): Scroll;
  /** The size of the text area that shows the text. */
  size(): { readonly width: number; readonly height: number };
}

/** What one person is drawn with. */
interface Drawing {
  readonly root: HTMLElement;
  readonly bands: HTMLElement;
  readonly caret: HTMLElement;
  readonly flag: HTMLElement;
  name: string;
}

/** Puts a box where it goes. */
function place(element: HTMLElement, box: Box): void {
  element.style.left = `${box.x}px`;
  element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

export class PresenceOverlay {
  private readonly drawings = new Map<string, Drawing>();
  private carets: readonly DrawnCaret[] = [];
  private text = "";
  /** The line starts of `text`, found once for every scroll that follows. */
  private starts: { readonly text: string; readonly starts: readonly number[] } | undefined;
  private fadeTimer: unknown;

  constructor(
    private readonly host: OverlayHost,
    private readonly timers: Timers,
    private readonly now: () => number,
  ) {}

  /** Draws these carets over this text, and forgets what was drawn before. */
  show(carets: readonly DrawnCaret[], text: string): void {
    this.carets = carets;
    this.text = text;
    this.draw();
  }

  /** Draws what was last shown again, where the pane's scroll and size put it now. */
  reposition(): void {
    this.draw();
  }

  /** Draws nothing. */
  clear(): void {
    this.show([], "");
  }

  /** Removes the layer's contents and stops fading. */
  destroy(): void {
    this.timers.clear(this.fadeTimer);
    this.fadeTimer = undefined;
    this.drawings.clear();
    this.host.layer.replaceChildren();
  }

  private make(id: string): Drawing {
    const flag = h("span", { class: "presence-flag" });
    const caret = h("div", { class: "presence-caret" }, flag);
    const bands = h("div", { class: "presence-bands" });
    const root = h("div", { class: "presence-peer", "data-peer": id }, bands, caret);
    this.host.layer.append(root);
    const drawing: Drawing = { root, bands, caret, flag, name: "" };
    this.drawings.set(id, drawing);
    return drawing;
  }

  private draw(): void {
    const keep = new Set<string>();
    if (this.carets.length > 0) {
      if (this.starts?.text !== this.text) {
        this.starts = { text: this.text, starts: lineStarts(this.text) };
      }
      const places = new TextPlace(
        this.text,
        this.host.metrics(),
        this.host.scroll(),
        this.starts.starts,
      );
      const { width, height } = this.host.size();
      for (const caret of this.carets) {
        keep.add(caret.id);
        const drawing = this.drawings.get(caret.id) ?? this.make(caret.id);
        drawing.root.style.setProperty("--presence", caret.colour);
        const bar = places.caret(caret.head, CARET_WIDTH);
        drawing.caret.hidden = !visible(bar, width, height);
        drawing.caret.style.left = `${bar.x}px`;
        drawing.caret.style.top = `${bar.y}px`;
        drawing.caret.style.height = `${bar.height}px`;
        drawing.caret.classList.toggle("below", bar.y < FLAG_HEIGHT);
        const named = caret.guest ? `${caret.name}\nguest` : caret.name;
        if (drawing.name !== named) {
          // The name is set as text, whatever characters it holds; a guest's flag says so.
          drawing.flag.replaceChildren(
            caret.name,
            ...(caret.guest
              ? [h("span", { class: "presence-flag-guest" }, messages().cloud.live.guestBadge)]
              : []),
          );
          drawing.name = named;
        }
        drawing.flag.classList.toggle("faded", this.now() - caret.movedAt >= FLAG_FADE_MS);
        const bands = places
          .band(caret.start, caret.end, height)
          .filter((box) => visible(box, width, height))
          .map((box) => {
            const band = h("div", { class: "presence-band" });
            place(band, box);
            return band;
          });
        drawing.bands.replaceChildren(...bands);
      }
    }
    for (const [id, drawing] of this.drawings) {
      if (keep.has(id)) continue;
      drawing.root.remove();
      this.drawings.delete(id);
    }
    this.fadeLater();
  }

  /** Fades the next flag that is still shown when its two seconds are up. */
  private fadeLater(): void {
    this.timers.clear(this.fadeTimer);
    this.fadeTimer = undefined;
    const now = this.now();
    let soonest = Infinity;
    for (const caret of this.carets) {
      const left = caret.movedAt + FLAG_FADE_MS - now;
      if (left > 0) soonest = Math.min(soonest, left);
    }
    if (soonest === Infinity) return;
    this.fadeTimer = this.timers.set(() => {
      this.fadeTimer = undefined;
      this.draw();
    }, soonest);
  }
}
