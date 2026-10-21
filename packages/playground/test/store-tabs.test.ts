// The project the browser keeps is one slot shared by every tab of the page. A tab that has not
// edited since it loaded or kept the slot must not put its older copy over what another tab kept
// (opening a cloud project, signing in and changing the language all keep the project first).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STORE_KEYS,
  keepProject,
  keepProjectIfCurrent,
  keptByAnotherTab,
  keptProject,
} from "../src/store.js";

/** A `localStorage` of one browser, which every tab reads and writes. */
class Slots {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const KEY = STORE_KEYS.project;
const project = (text: string) => ({ open: "a.meltemi", files: new Map([["a.meltemi", text]]) });

/** What another tab does: it writes the slot without this tab hearing of it. */
function otherTabKeeps(slots: Slots, text: string): void {
  slots.setItem(KEY, JSON.stringify({ v: 1, open: "a.meltemi", files: { "a.meltemi": text } }));
}

const textOf = (slots: Slots): string | undefined => {
  const raw = slots.getItem(KEY);
  return raw
    ? (JSON.parse(raw) as { files: Record<string, string> }).files["a.meltemi"]
    : undefined;
};

describe("a project kept by two tabs", () => {
  const slots = new Slots();
  const original = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    slots.items.clear();
    (globalThis as { window?: unknown }).window = { localStorage: slots };
  });
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  it("is left as the other tab kept it by a tab that only keeps what it loaded", () => {
    expect(keepProject(KEY, project("first"))).toBe("kept");
    // This tab opens the project, as the page does when it starts.
    expect(keptProject(KEY, { loading: true })?.files.get("a.meltemi")).toBe("first");
    expect(keptByAnotherTab(KEY)).toBe(false);
    // The user edits in the other tab, which keeps it.
    otherTabKeeps(slots, "newer, from the other tab");
    expect(keptByAnotherTab(KEY)).toBe(true);
    // Opening a cloud project in this tab keeps its (older) project first: it changes nothing.
    expect(keepProjectIfCurrent(KEY, project("first"))).toBe("kept");
    expect(textOf(slots)).toBe("newer, from the other tab");
    // "Back to my project" then finds the newer work.
    expect(keptProject(KEY, { loading: true })?.files.get("a.meltemi")).toBe(
      "newer, from the other tab",
    );
  });

  it("keeps the project when nothing else wrote the slot, and after this tab's own write", () => {
    keepProject(KEY, project("first"));
    keptProject(KEY, { loading: true });
    expect(keepProjectIfCurrent(KEY, project("second"))).toBe("kept");
    expect(textOf(slots)).toBe("second");
    // Its own write is not another tab's.
    expect(keptByAnotherTab(KEY)).toBe(false);
    expect(keepProjectIfCurrent(KEY, project("third"))).toBe("kept");
    expect(textOf(slots)).toBe("third");
  });

  it("still lets a tab that edited keep its work over the slot", () => {
    keepProject(KEY, project("first"));
    keptProject(KEY, { loading: true });
    otherTabKeeps(slots, "from the other tab");
    // Typing is kept with `keepProject`: that tab's edits are its own.
    expect(keepProject(KEY, project("typed here"))).toBe("kept");
    expect(textOf(slots)).toBe("typed here");
    expect(keptByAnotherTab(KEY)).toBe(false);
  });

  it("sees a slot another tab filled when this tab loaded an empty one", () => {
    expect(keptProject(KEY, { loading: true })).toBeUndefined();
    otherTabKeeps(slots, "the other tab's");
    expect(keptByAnotherTab(KEY)).toBe(true);
    expect(keepProjectIfCurrent(KEY, project("template"))).toBe("kept");
    expect(textOf(slots)).toBe("the other tab's");
  });

  it("keeps the project again after the slot was emptied: there is no other tab's work to protect", () => {
    keepProject(KEY, project("first"));
    keptProject(KEY, { loading: true });
    slots.removeItem(KEY);
    expect(keptByAnotherTab(KEY)).toBe(false);
    expect(keepProjectIfCurrent(KEY, project("first"))).toBe("kept");
    expect(textOf(slots)).toBe("first");
  });

  it("compares with nothing when this tab never loaded the slot", () => {
    otherTabKeeps(slots, "the other tab's");
    expect(keptByAnotherTab(STORE_KEYS.previous)).toBe(false);
  });
});
