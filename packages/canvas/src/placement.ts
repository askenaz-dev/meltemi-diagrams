import { h } from "./dom.js";
import { placementGlyph, type IconPlacement } from "./glyphs.js";
import { messages } from "./messages/index.js";

/**
 * The ways an icon is put on a diagram of a profile: free compositions also take the icon alone
 * (an `icon` object); flow diagrams have no such object.
 */
export function placementsFor(free: boolean): readonly IconPlacement[] {
  return free ? ["icon", "box", "only"] : ["icon", "box"];
}

/**
 * The placement a canvas offers: the one chosen, or the icon as the shape where the icon alone is
 * not offered (a flow diagram after a free one).
 */
export function placementIn(placement: IconPlacement, free: boolean): IconPlacement {
  return placementsFor(free).includes(placement) ? placement : "icon";
}

/**
 * The placement control of the icon picker and the Libraries panel: a segmented control, one
 * picture and name per way of putting an icon on the canvas, the current one checked. The arrows
 * move between them and choose, as radio buttons do; `change` hears every choice.
 */
export class PlacementControl {
  readonly element = h("div", {
    class: "placement",
    role: "radiogroup",
    "aria-label": messages().placement.label,
  });
  private current: IconPlacement = "icon";
  private free = false;

  constructor(private readonly change: (placement: IconPlacement) => void) {
    this.element.addEventListener("keydown", (e) => {
      const chips = this.chips();
      const index = chips.indexOf(document.activeElement as HTMLButtonElement);
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (step === 0 || index < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const next = chips[(index + step + chips.length) % chips.length]!;
      next.focus();
      this.choose(next.dataset.placement as IconPlacement);
    });
  }

  get value(): IconPlacement {
    return this.current;
  }

  /** Shows `current` checked among the placements of a free diagram or of a flow one. */
  set(current: IconPlacement, free: boolean): void {
    const focused = this.chips().find((chip) => chip === document.activeElement);
    this.current = placementIn(current, free);
    this.free = free;
    const words = messages().placement;
    const titles: Record<IconPlacement, string> = {
      icon: words.iconTitle,
      box: words.boxTitle,
      only: words.onlyTitle,
    };
    const chips = placementsFor(free).map((placement) => {
      const checked = placement === this.current;
      const chip = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "placement-choice",
          "aria-checked": String(checked),
          tabindex: checked ? 0 : -1,
          title: titles[placement],
          "data-placement": placement,
        },
        placementGlyph(placement),
        h("span", { class: "name" }, words[placement]),
      );
      chip.addEventListener("click", () => this.choose(placement));
      return chip;
    });
    this.element.replaceChildren(
      h("span", { class: "placement-label", "aria-hidden": "true" }, words.label),
      h("span", { class: "placement-choices" }, ...chips),
    );
    if (focused) chips.find((chip) => chip.dataset.placement === this.current)?.focus();
  }

  private chips(): HTMLButtonElement[] {
    return [...this.element.querySelectorAll<HTMLButtonElement>("button[data-placement]")];
  }

  private choose(placement: IconPlacement): void {
    if (placement === this.current) return;
    this.set(placement, this.free);
    this.change(placement);
  }
}
