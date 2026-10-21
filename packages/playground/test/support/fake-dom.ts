// A document just big enough for the page's own small helpers (`h`, `icon`) to build elements
// in Node: elements with attributes, classes, a style, children and listeners, and text nodes.
// There is no layout and no events but the ones a test dispatches by hand. It is what lets a test
// look at what the page really builds (which elements, which text nodes) without a browser.

export class FakeText {
  parent: FakeElement | undefined;
  constructor(public data: string) {}
  get textContent(): string {
    return this.data;
  }
}

export type FakeNode = FakeElement | FakeText;

class FakeStyle {
  [name: string]: unknown;
  readonly properties = new Map<string, string>();
  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
  getPropertyValue(name: string): string {
    return this.properties.get(name) ?? "";
  }
}

export class FakeElement {
  readonly children: FakeNode[] = [];
  parent: FakeElement | undefined;
  readonly attributes = new Map<string, string>();
  readonly style = new FakeStyle();
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly classList = {
    add: (...names: string[]) => this.setClasses([...this.classes(), ...names]),
    remove: (...names: string[]) =>
      this.setClasses(this.classes().filter((name) => !names.includes(name))),
    contains: (name: string) => this.classes().includes(name),
    toggle: (name: string, force?: boolean): boolean => {
      const on = force ?? !this.classes().includes(name);
      if (on) this.classList.add(name);
      else this.classList.remove(name);
      return on;
    },
  };

  constructor(readonly tagName: string) {}

  private classes(): string[] {
    return (this.attributes.get("class") ?? "").split(/\s+/).filter(Boolean);
  }

  private setClasses(names: string[]): void {
    this.attributes.set("class", [...new Set(names)].join(" "));
  }

  get className(): string {
    return this.attributes.get("class") ?? "";
  }

  set className(value: string) {
    this.attributes.set("class", value);
  }

  get hidden(): boolean {
    return this.attributes.has("hidden");
  }

  set hidden(value: boolean) {
    if (value) this.attributes.set("hidden", "");
    else this.attributes.delete("hidden");
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  private adopt(nodes: readonly (FakeNode | string)[]): FakeNode[] {
    return nodes.map((node) => {
      const adopted = typeof node === "string" ? new FakeText(node) : node;
      adopted.parent?.detach(adopted);
      adopted.parent = this;
      return adopted;
    });
  }

  private detach(node: FakeNode): void {
    const at = this.children.indexOf(node);
    if (at >= 0) this.children.splice(at, 1);
    node.parent = undefined;
  }

  append(...nodes: (FakeNode | string)[]): void {
    this.children.push(...this.adopt(nodes));
  }

  prepend(...nodes: (FakeNode | string)[]): void {
    this.children.unshift(...this.adopt(nodes));
  }

  replaceChildren(...nodes: (FakeNode | string)[]): void {
    for (const child of [...this.children]) this.detach(child);
    this.append(...nodes);
  }

  remove(): void {
    this.parent?.detach(this);
  }

  replaceWith(node: FakeNode): void {
    const parent = this.parent;
    if (!parent) return;
    const at = parent.children.indexOf(this);
    parent.detach(this);
    node.parent?.detach(node);
    node.parent = parent;
    parent.children.splice(at, 0, node);
  }

  get textContent(): string {
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.replaceChildren(value);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((one) => one !== listener),
    );
  }

  /** Plays an event: calls the listeners the page added for it. */
  dispatch(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus(): void {}

  contains(node: unknown): boolean {
    for (let at = node as FakeNode | undefined; at; at = at.parent) if (at === this) return true;
    return false;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  getBoundingClientRect(): { left: number; right: number; top: number; bottom: number } {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
}

export class FakeDocument {
  activeElement: FakeElement | undefined;
  readonly documentElement = { clientWidth: 1024 };
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }
  createElementNS(_namespace: string, tag: string): FakeElement {
    return new FakeElement(tag);
  }
  createTextNode(data: string): FakeText {
    return new FakeText(data);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Puts a fake document where the page's helpers look for `document`; returns how to take it away. */
export function installFakeDom(): { document: FakeDocument; uninstall: () => void } {
  const holder = globalThis as unknown as { document?: unknown };
  const before = holder.document;
  const document = new FakeDocument();
  holder.document = document;
  return {
    document,
    uninstall: () => {
      if (before === undefined) delete holder.document;
      else holder.document = before;
    },
  };
}

// Looking at what was built ---------------------------------------------------------------------

/** An element and everything under it, in document order. */
export function elementsOf(root: FakeElement): FakeElement[] {
  const found: FakeElement[] = [root];
  for (const child of root.children) {
    if (child instanceof FakeElement) found.push(...elementsOf(child));
  }
  return found;
}

/** The text nodes under an element, in document order. */
export function textNodesOf(root: FakeElement): FakeText[] {
  const found: FakeText[] = [];
  for (const child of root.children) {
    if (child instanceof FakeText) found.push(child);
    else found.push(...textNodesOf(child));
  }
  return found;
}

/** The elements under (and including) `root` that carry a class. */
export function withClass(root: FakeElement, name: string): FakeElement[] {
  return elementsOf(root).filter((element) => element.classList.contains(name));
}

/** The tag names of everything under `root`, lowercase. */
export function tagsOf(root: FakeElement): string[] {
  return elementsOf(root).map((element) => element.tagName.toLowerCase());
}
