import { h } from "./dom.js";

/** How long the pointer rests on a control before its tooltip shows, in milliseconds. */
export const TOOLTIP_DELAY = 400;

/**
 * The canvas's tooltips: the `title` of a button, chip or field shown in a bubble under it (over
 * it near the bottom of the window) after the pointer rests on it for `TOOLTIP_DELAY`, fading in.
 * While the pointer is on a control its `title` is kept aside in `data-tip`, so the browser draws
 * no tooltip of its own, and put back when the pointer leaves: the attribute stays what the code
 * and assistive technology read. A press, a key or the wheel hides the bubble.
 */
export class Tooltips {
  readonly element = h("div", {
    class: "tooltip",
    id: "mdg-tooltip",
    role: "tooltip",
    hidden: true,
  });
  private target: HTMLElement | undefined;
  private timer: number | undefined;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener("pointerover", (e) => this.over(e));
    root.addEventListener("pointerout", (e) => {
      const next = e.relatedTarget as Node | null;
      if (this.target && (!next || !this.target.contains(next))) this.leave();
    });
    for (const type of ["pointerdown", "keydown", "wheel"] as const) {
      root.addEventListener(type, () => this.hide(), { capture: true, passive: true });
    }
  }

  private over(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    const found = (e.target as Element).closest?.("[title], [data-tip]");
    const target = found instanceof HTMLElement && this.root.contains(found) ? found : undefined;
    if (target === this.target) return;
    this.leave();
    // The drawing's own titles (links, accessible names) are the drawing's.
    if (!target || target.closest(".content, .overlay")) return;
    const title = target.getAttribute("title");
    if (title) {
      target.dataset.tip = title;
      target.removeAttribute("title");
    }
    if (!target.dataset.tip) return;
    this.target = target;
    this.timer = window.setTimeout(() => this.show(), TOOLTIP_DELAY);
  }

  /** The pointer left the control: the bubble goes and the control has its title again. */
  private leave(): void {
    this.hide();
    const target = this.target;
    this.target = undefined;
    if (!target) return;
    // A title set while the pointer was there is the newer one.
    if (!target.hasAttribute("title") && target.dataset.tip) {
      target.setAttribute("title", target.dataset.tip);
    }
    delete target.dataset.tip;
  }

  private hide(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.element.hidden = true;
  }

  private show(): void {
    const target = this.target;
    if (!target?.isConnected || !target.dataset.tip) return;
    const tip = this.element;
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const rect = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const below = rect.bottom + 6 + height <= window.innerHeight - 4;
    const left = Math.max(
      4,
      Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 4),
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? rect.bottom + 6 : rect.top - 6 - height}px`;
    tip.dataset.side = below ? "bottom" : "top";
  }
}
