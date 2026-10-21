// The hover card, the detail panel and the trail of the interactive player. Every text comes from
// the document and becomes a text node; links are re-checked before they are written.
import { el, icon, ICONS, safeUrl, urlHost } from "./dom.js";

/** The lines of a hover card. */
export interface CardContent {
  readonly title: string;
  /** Type, technology and "external", joined: "Container · HTTP". */
  readonly meta: string | null;
  /** A relation's ends: "Web → API". */
  readonly ends: string | null;
  readonly text: string | null;
  /** A relation's assumption, in words. */
  readonly note: string | null;
  readonly url: string | null;
}

/** A transient card next to what the pointer rests on. */
export class HoverCard {
  readonly element = el("div", {
    class: "card",
    role: "tooltip",
    "aria-hidden": "true",
    hidden: true,
  });

  get visible(): boolean {
    return !this.element.hidden;
  }

  /**
   * Shows the card under a box (above when it does not fit), or beside the pointer for lines and
   * boxes taller than most of the window, clamped inside the window.
   */
  show(content: CardContent, box: DOMRect | null, pointer: { x: number; y: number }): void {
    const card = this.element;
    const lines: Node[] = [el("div", { class: "title" }, content.title)];
    if (content.meta) lines.push(el("div", { class: "meta" }, content.meta));
    if (content.ends) lines.push(el("div", { class: "meta" }, content.ends));
    if (content.text) lines.push(el("p", { class: "text" }, content.text));
    if (content.note) lines.push(el("div", { class: "meta" }, content.note));
    const url = safeUrl(content.url);
    if (url) lines.push(el("div", { class: "link" }, urlHost(url)));
    card.replaceChildren(...lines);
    card.hidden = false;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const room = { width: window.innerWidth, height: window.innerHeight };
    let x: number;
    let y: number;
    let side = "bottom";
    if (box && box.height <= room.height * 0.6) {
      x = box.left + box.width / 2 - width / 2;
      y = box.bottom + 6;
      if (y + height > room.height - 4) {
        y = box.top - 6 - height;
        side = "top";
      }
    } else {
      x = pointer.x + 14;
      y = pointer.y + 14;
      if (x + width > room.width - 4) x = pointer.x - 14 - width;
      if (y + height > room.height - 4) {
        y = pointer.y - 14 - height;
        side = "top";
      }
    }
    x = Math.max(4, Math.min(room.width - width - 4, x));
    y = Math.max(4, Math.min(room.height - height - 4, y));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
    card.dataset.side = side;
  }

  hide(): void {
    this.element.hidden = true;
  }
}

/** A row of the panel's facts. */
export interface PanelFact {
  readonly term: string;
  readonly value: string;
  /** A link instead of text, re-checked. */
  readonly href?: string | null;
  readonly linkText?: string;
}

/** A clickable line of the panel: a relation, an end, a host's link. */
export interface PanelItem {
  readonly label: string;
  readonly href?: string;
  readonly action?: () => void;
}

export interface PanelSectionContent {
  readonly heading: string;
  readonly items: readonly PanelItem[];
  /** Shown when there is no item. */
  readonly empty?: string;
}

export interface PanelContent {
  /** The panel's accessible name. */
  readonly name: string;
  readonly title: string;
  readonly type: string | null;
  readonly facts: readonly PanelFact[];
  readonly description: string | null;
  /** The action that opens what the element holds. */
  readonly open: { readonly label: string; readonly title: string; run(): void } | null;
  readonly sections: readonly PanelSectionContent[];
}

/** The non-modal panel of the selected element or relation. */
export class DetailPanel {
  readonly element = el("aside", {
    class: "details",
    role: "region",
    tabindex: "-1",
    hidden: true,
  });
  private readonly heading = el("h3", { class: "title", tabindex: "-1" });
  private readonly kind = el("p", { class: "type" });
  private content = el("div", { class: "bodytext" });
  readonly close: HTMLButtonElement;
  private shown = "";

  constructor(labels: { close: string; closeTitle: string }, onClose: () => void) {
    this.close = el(
      "button",
      { type: "button", class: "close", "aria-label": labels.close, title: labels.closeTitle },
      icon(ICONS.close),
    );
    this.close.addEventListener("click", onClose);
    this.element.append(
      el("div", { class: "head" }, this.heading, this.close),
      this.kind,
      this.content,
    );
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  /** Shows the panel with a body; a new body fades in, the same one is kept. */
  show(content: PanelContent, key: string): void {
    this.element.setAttribute("aria-label", content.name);
    this.heading.textContent = content.title;
    this.kind.textContent = content.type ?? "";
    this.kind.hidden = !content.type;
    const body: Node[] = [];
    if (content.open) {
      const open = content.open;
      const button = el(
        "button",
        { type: "button", class: "action", title: open.title },
        icon(ICONS.open),
        open.label,
      );
      button.addEventListener("click", () => open.run());
      body.push(button);
    }
    if (content.facts.length > 0) {
      const list = el("dl");
      for (const fact of content.facts) {
        const href = fact.href === undefined ? null : safeUrl(fact.href);
        list.append(
          el("dt", {}, fact.term),
          el(
            "dd",
            {},
            href
              ? el(
                  "a",
                  { href, target: "_blank", rel: "noopener noreferrer" },
                  fact.linkText ?? fact.value,
                )
              : fact.value,
          ),
        );
      }
      body.push(list);
    }
    if (content.description) body.push(el("p", { class: "description" }, content.description));
    for (const section of content.sections) {
      body.push(el("h4", {}, section.heading));
      if (section.items.length === 0) {
        if (section.empty) body.push(el("p", {}, section.empty));
        continue;
      }
      const list = el("ul");
      for (const item of section.items) {
        if (item.href !== undefined) {
          list.append(el("li", {}, el("a", { href: item.href }, item.label)));
        } else {
          const button = el("button", { type: "button" }, item.label);
          if (item.action) button.addEventListener("click", item.action);
          list.append(el("li", {}, button));
        }
      }
      body.push(list);
    }
    if (key !== this.shown) {
      const fresh = el("div", { class: "bodytext" }, ...body);
      this.content.replaceWith(fresh);
      this.content = fresh;
    } else this.content.replaceChildren(...body);
    this.shown = key;
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
    this.shown = "";
  }

  /** Moves the focus to the panel's heading (opened from the keyboard). */
  focus(): void {
    this.heading.focus({ preventScroll: true });
  }
}

/** One crumb of the trail. */
export interface Crumb {
  readonly title: string;
  readonly go: () => void;
}

/** The views above the one on screen, and the way up. */
export class Trail {
  readonly element: HTMLElement;
  private readonly upButton: HTMLButtonElement;
  private readonly list = el("ol");
  private up: (() => void) | null = null;

  constructor(label: string) {
    this.upButton = el("button", { type: "button", class: "up" }, icon(ICONS.up));
    this.upButton.addEventListener("click", () => this.up?.());
    this.element = el(
      "nav",
      { class: "trail", "aria-label": label, hidden: true },
      this.upButton,
      this.list,
    );
  }

  /**
   * Shows the crumbs above the current view (outermost first) and the current one; hidden when
   * there is nothing above.
   */
  show(
    crumbs: readonly Crumb[],
    current: string,
    labels: { up: string; upTitle: string } | null,
  ): void {
    this.element.hidden = crumbs.length === 0;
    const last = crumbs[crumbs.length - 1];
    this.up = last?.go ?? null;
    this.upButton.disabled = !last;
    if (labels) {
      this.upButton.setAttribute("aria-label", labels.up);
      this.upButton.title = labels.upTitle;
    }
    const items = crumbs.map((crumb) => {
      const button = el("button", { type: "button" }, crumb.title);
      button.addEventListener("click", crumb.go);
      return el("li", {}, button);
    });
    items.push(el("li", {}, el("span", { "aria-current": "page" }, current)));
    this.list.replaceChildren(...items);
  }

  /** Goes up one view, as the Up button does; false at the top. */
  goUp(): boolean {
    if (!this.up) return false;
    this.up();
    return true;
  }
}
