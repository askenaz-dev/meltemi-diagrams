import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { laserOf, presenceMessage } from "../src/canvas-host.js";
import { LISTED, presenceBar } from "../src/cloud/presence-bar.js";
import { FLAG_FADE_MS, PresenceOverlay, type OverlayHost } from "../src/cloud/presence-overlay.js";
import type { TextMetrics } from "../src/cloud/presence-geometry.js";
import type { DrawnCaret, Person } from "../src/cloud/presence-model.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { ManualTimers } from "./support/clock.js";
import {
  FakeElement,
  FakeText,
  elementsOf,
  installFakeDom,
  tagsOf,
  textNodesOf,
  withClass,
} from "./support/fake-dom.js";

let dom: ReturnType<typeof installFakeDom>;

beforeEach(() => {
  dom = installFakeDom();
});

afterEach(() => {
  dom.uninstall();
  setLocale("en");
});

const asElement = (element: unknown) => element as FakeElement;

// The header's list ------------------------------------------------------------------------------------

const person = (over: Partial<Person> = {}): Person => ({
  sub: "u_ben",
  name: "Ben",
  picture: undefined,
  colour: "#1c7ed6",
  guest: false,
  file: { id: "aaaaaaaaaaaaaaa2", path: "diagrams/api.meltemi" },
  connections: 1,
  ...over,
});

function bar() {
  const opened: string[] = [];
  const view = presenceBar({ open: (path) => opened.push(path) });
  return { view, opened, root: asElement(view.element) };
}

describe("the header's who is here", () => {
  it("is hidden while nobody else is here, and shown with someone", () => {
    const { view, root } = bar();
    expect(root.hidden).toBe(true);
    view.update([person()]);
    expect(root.hidden).toBe(false);
    view.update([]);
    expect(root.hidden).toBe(true);
  });

  it("is a list a screen reader reads: a button for each person, named by who and where", () => {
    const { view, root } = bar();
    view.update([
      person(),
      person({ sub: "u_eva", name: "Eva", file: { id: "b", path: "diagrams/web.meltemi" } }),
    ]);
    const [list] = withClass(root, "presence-list");
    expect(list?.tagName).toBe("ul");
    expect(list?.getAttribute("role")).toBe("list");
    expect(list?.getAttribute("aria-label")).toBe(en.presence.group);
    const buttons = withClass(root, "presence-person");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Ben, in diagrams/api.meltemi",
      "Eva, in diagrams/web.meltemi",
    ]);
    expect(buttons.map((button) => button.parent?.tagName)).toEqual(["li", "li"]);
    expect(buttons[0]?.getAttribute("title")).toBe("Go to diagrams/api.meltemi");
  });

  it("shows each name in the person's colour, with the short name of their file", () => {
    const { view, root } = bar();
    view.update([person({ colour: "#c2255c" })]);
    const [button] = withClass(root, "presence-person");
    expect(button?.style.getPropertyValue("--presence")).toBe("#c2255c");
    expect(withClass(root, "presence-name")[0]?.textContent).toBe("Ben");
    expect(withClass(root, "presence-file")[0]?.textContent).toBe("api.meltemi");
  });

  it("opens the file a person has open when they are clicked", () => {
    const { view, root, opened } = bar();
    view.update([person()]);
    withClass(root, "presence-person")[0]?.dispatch("click");
    expect(opened).toEqual(["diagrams/api.meltemi"]);
  });

  it("does nothing for a person whose file the project does not have, and says so", () => {
    const { view, root, opened } = bar();
    view.update([person({ file: undefined })]);
    const [button] = withClass(root, "presence-person");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.getAttribute("title")).toBe(en.presence.noFile);
    expect(button?.getAttribute("aria-label")).toBe("Ben");
    button?.dispatch("click");
    expect(opened).toEqual([]);
    expect(withClass(root, "presence-file")).toEqual([]);
  });

  it("calls a person with no name by a word, not by nothing", () => {
    const { view, root } = bar();
    view.update([person({ name: "" })]);
    expect(withClass(root, "presence-name")[0]?.textContent).toBe(en.presence.unnamed);
    expect(withClass(root, "presence-person")[0]?.getAttribute("aria-label")).toBe(
      `${en.presence.unnamed}, in diagrams/api.meltemi`,
    );
  });

  it("shows a name that looks like markup as the characters it is, and makes no element from it", () => {
    const { view, root } = bar();
    view.update([person({ name: "<b>Ben</b>" })]);
    const name = withClass(root, "presence-name")[0]!;
    expect(name.children).toHaveLength(1);
    expect(name.children[0]).toBeInstanceOf(FakeText);
    expect((name.children[0] as FakeText).data).toBe("<b>Ben</b>");
    // Nothing in the list is an element the name could have made.
    expect(tagsOf(root)).not.toContain("b");
    // Not even the avatar's alternative text or the labels hold it as anything but an attribute.
    expect(withClass(root, "presence-person")[0]?.getAttribute("aria-label")).toContain(
      "<b>Ben</b>",
    );
  });

  it("shows a name that holds an image tag as characters too, in the overflow menu as well", () => {
    const { view, root } = bar();
    const many = Array.from({ length: LISTED + 1 }, (_, i) =>
      person({ sub: `u_${i}`, name: i === LISTED ? "<img src=x onerror=alert(1)>" : `P${i}` }),
    );
    view.update(many);
    const more = withClass(root, "presence-more")[0]!;
    const toggle = elementsOf(more).find((element) => element.tagName === "button")!;
    toggle.dispatch("click");
    const labels = withClass(more, "pg-menu-label");
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(tagsOf(root)).not.toContain("img");
  });

  it("draws a picture as an avatar by the account control's rule, and the outline without one", () => {
    const { view, root } = bar();
    view.update([person({ picture: "https://avatars.example/ben.png" }), person({ sub: "u_eva" })]);
    const images = elementsOf(root).filter((element) => element.tagName === "img");
    expect(images).toHaveLength(1);
    const [image] = images;
    expect(image?.getAttribute("src")).toBe("https://avatars.example/ben.png");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(
      withClass(root, "account-avatar").filter((e) => e.classList.contains("outline")),
    ).toHaveLength(1);
    // A picture that cannot be loaded gives way to the outline.
    image?.dispatch("error");
    expect(elementsOf(root).filter((element) => element.tagName === "img")).toEqual([]);
    expect(
      withClass(root, "account-avatar").filter((e) => e.classList.contains("outline")),
    ).toHaveLength(2);
  });

  it("lists the first few people and puts the rest in a menu that opens their files", () => {
    const { view, root, opened } = bar();
    view.update(
      Array.from({ length: LISTED + 2 }, (_, i) =>
        person({
          sub: `u_${i}`,
          name: `P${i}`,
          file: { id: `f${i}`, path: `diagrams/f${i}.meltemi` },
        }),
      ),
    );
    expect(withClass(root, "presence-person")).toHaveLength(LISTED);
    const more = withClass(root, "presence-more")[0]!;
    const toggle = elementsOf(more).find((element) => element.tagName === "button")!;
    expect(toggle.getAttribute("aria-label")).toBe(en.presence.moreName(2));
    expect(textNodesOf(toggle).map((text) => text.data)).toContain("+2");
    toggle.dispatch("click");
    const items = withClass(more, "pg-menu-item");
    expect(items).toHaveLength(2);
    expect(withClass(more, "pg-menu-label").map((label) => label.textContent)).toEqual([
      "P4",
      "P5",
    ]);
    expect(withClass(more, "pg-menu-detail").map((detail) => detail.textContent)).toEqual([
      "diagrams/f4.meltemi",
      "diagrams/f5.meltemi",
    ]);
    items[1]?.dispatch("click");
    expect(opened).toEqual(["diagrams/f5.meltemi"]);
    // Fewer people: the menu goes.
    view.update([person()]);
    expect(withClass(root, "presence-more")).toEqual([]);
  });

  it("speaks Spanish", () => {
    setLocale("es");
    const { view, root } = bar();
    view.update([person()]);
    expect(withClass(root, "presence-list")[0]?.getAttribute("aria-label")).toBe(es.presence.group);
    expect(withClass(root, "presence-person")[0]?.getAttribute("aria-label")).toBe(
      "Ben, en diagrams/api.meltemi",
    );
  });
});

// The code pane's overlay ---------------------------------------------------------------------------------

// A pane whose characters are 10 pixels wide and lines 20 high, with 12 and 8 pixels of padding.
const METRICS: TextMetrics = { char: 10, line: 20, left: 12, top: 8, tab: 2 };
const TEXT = "hello world\nsecond line\nthird";

function overlay(now = { value: 0 }) {
  const timers = new ManualTimers();
  const layer = new FakeElement("div");
  const scroll = { left: 0, top: 0 };
  const host: OverlayHost = {
    layer: asElement(layer) as unknown as HTMLElement,
    metrics: () => METRICS,
    scroll: () => scroll,
    size: () => ({ width: 400, height: 200 }),
  };
  const view = new PresenceOverlay(host, timers, () => now.value + timers.now);
  return { view, layer, timers, scroll, now };
}

const caret = (over: Partial<DrawnCaret> = {}): DrawnCaret => ({
  id: "c1",
  name: "Ben",
  colour: "#1c7ed6",
  guest: false,
  head: 11,
  start: 6,
  end: 11,
  movedAt: 0,
  ...over,
});

describe("other people's carets over the code", () => {
  it("is a bar in the person's colour at the head of the selection, as tall as a line", () => {
    const { view, layer } = overlay();
    view.show([caret()], TEXT);
    const [bar] = withClass(layer, "presence-caret");
    expect(bar?.style["left"]).toBe(`${12 + 11 * 10}px`);
    expect(bar?.style["top"]).toBe("8px");
    expect(bar?.style["height"]).toBe("20px");
    expect(withClass(layer, "presence-peer")[0]?.style.getPropertyValue("--presence")).toBe(
      "#1c7ed6",
    );
  });

  it("is a translucent band for a selection, one for each line it covers", () => {
    const { view, layer } = overlay();
    view.show([caret({ head: 20, start: 6, end: 20 })], TEXT);
    const bands = withClass(layer, "presence-band");
    expect(
      bands.map((band) => [band.style["left"], band.style["top"], band.style["width"]]),
    ).toEqual([
      [`${12 + 60}px`, "8px", "60px"],
      [`${12}px`, "28px", "80px"],
    ]);
  });

  it("is a bar alone when there is no selection", () => {
    const { view, layer } = overlay();
    view.show([caret({ head: 3, start: 3, end: 3 })], TEXT);
    expect(withClass(layer, "presence-band")).toEqual([]);
    expect(withClass(layer, "presence-caret")).toHaveLength(1);
  });

  it("puts the name on a flag, as text, and draws every person", () => {
    const { view, layer } = overlay();
    view.show([caret(), caret({ id: "c2", name: "Eva", head: 2, start: 2, end: 2 })], TEXT);
    expect(withClass(layer, "presence-flag").map((flag) => flag.textContent)).toEqual([
      "Ben",
      "Eva",
    ]);
  });

  it("shows a name that looks like markup as the characters it is, and makes no element from it", () => {
    const { view, layer } = overlay();
    view.show([caret({ name: "<b>Ben</b><img src=x>" })], TEXT);
    const [flag] = withClass(layer, "presence-flag");
    expect(flag?.children).toHaveLength(1);
    expect((flag?.children[0] as FakeText).data).toBe("<b>Ben</b><img src=x>");
    expect(tagsOf(layer).every((tag) => tag === "div" || tag === "span")).toBe(true);
    expect(textNodesOf(layer).map((text) => text.data)).toEqual(["<b>Ben</b><img src=x>"]);
  });

  it("fades the flag after two seconds of stillness, and shows it again when the caret moves", () => {
    const { view, layer, timers } = overlay();
    view.show([caret({ movedAt: 0 })], TEXT);
    const [flag] = withClass(layer, "presence-flag");
    expect(flag?.classList.contains("faded")).toBe(false);
    timers.advance(FLAG_FADE_MS - 1);
    expect(flag?.classList.contains("faded")).toBe(false);
    timers.advance(1);
    expect(flag?.classList.contains("faded")).toBe(true);
    // The person moves: the flag is back for two seconds more.
    view.show([caret({ head: 14, start: 14, end: 14, movedAt: timers.now })], TEXT);
    expect(flag?.classList.contains("faded")).toBe(false);
    timers.advance(FLAG_FADE_MS);
    expect(flag?.classList.contains("faded")).toBe(true);
    // Nothing is left to fade: no timer waits.
    expect(timers.waiting).toBe(0);
  });

  it("draws the flag of a caret that has been still for long already faded", () => {
    const { view, layer, now } = overlay({ value: 10_000 });
    view.show([caret({ movedAt: 0 })], TEXT);
    expect(withClass(layer, "presence-flag")[0]?.classList.contains("faded")).toBe(true);
    expect(now.value).toBe(10_000);
  });

  it("keeps the flag under the caret on the first line, where there is no room above it", () => {
    const { view, layer } = overlay();
    view.show(
      [caret({ head: 3, start: 3, end: 3 }), caret({ id: "c2", head: 14, start: 14, end: 14 })],
      TEXT,
    );
    const [first, second] = withClass(layer, "presence-caret");
    expect(first?.classList.contains("below")).toBe(true);
    expect(second?.classList.contains("below")).toBe(false);
  });

  it("moves with the scroll, and leaves out what scrolled out of view", () => {
    const { view, layer, scroll } = overlay();
    view.show([caret({ head: 14, start: 14, end: 14 })], TEXT);
    const [bar] = withClass(layer, "presence-caret");
    expect(bar?.style["top"]).toBe("28px");
    scroll.top = 20;
    scroll.left = 10;
    view.reposition();
    expect(bar?.style["top"]).toBe("8px");
    expect(bar?.style["left"]).toBe(`${12 + 20 - 10}px`);
    scroll.top = 500;
    view.reposition();
    expect(bar?.hidden).toBe(true);
    scroll.top = 0;
    view.reposition();
    expect(bar?.hidden).toBe(false);
  });

  it("keeps a person's elements from one drawing to the next, and removes those who left", () => {
    const { view, layer } = overlay();
    view.show([caret(), caret({ id: "c2", name: "Eva" })], TEXT);
    const before = withClass(layer, "presence-peer");
    expect(before).toHaveLength(2);
    view.show([caret({ head: 5, start: 5, end: 5 })], TEXT);
    const after = withClass(layer, "presence-peer");
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before[0]);
  });

  it("draws nothing for nobody, and leaves nothing behind when it is taken away", () => {
    const { view, layer, timers } = overlay();
    view.show([caret()], TEXT);
    view.clear();
    expect(withClass(layer, "presence-peer")).toEqual([]);
    view.show([caret()], TEXT);
    view.destroy();
    expect(layer.children).toEqual([]);
    expect(timers.waiting).toBe(0);
  });
});

// What the canvas is told ---------------------------------------------------------------------------

describe("the presence message of the canvas", () => {
  it("names the colour of the person at this canvas when it is known, and no more", () => {
    expect(presenceMessage([], { colour: "#e03131" })).toEqual({
      type: "presence",
      people: [],
      me: { colour: "#e03131" },
    });
    // Without a colour of their own the canvas draws the trail in the theme's accent.
    expect(presenceMessage([])).toEqual({ type: "presence", people: [] });
    expect("me" in presenceMessage([])).toBe(false);
  });

  it("carries a person's batch to the canvas as it came", () => {
    const people = [
      {
        name: "Ben",
        colour: "#1c7ed6",
        selection: [],
        laser: { batch: 3, points: [{ x: 1, y: 2, t: 0 }] },
      },
    ];
    expect(presenceMessage(people)).toEqual({ type: "presence", people });
  });

  it("reads the points a canvas posted, and the diagram they are over", () => {
    const points = [{ x: 1, y: 2, t: 0 }];
    expect(laserOf({ type: "presenceLaser", points, diagram: "d" })).toEqual({
      points,
      diagram: "d",
    });
    expect(laserOf({ type: "presenceLaser", points })).toEqual({ points });
  });
});
