import { describe, expect, it } from "vitest";
import { ariaKeyshortcuts } from "../src/dom.js";

describe("ariaKeyshortcuts", () => {
  it("writes a shown key as aria-keyshortcuts wants it", () => {
    expect(ariaKeyshortcuts("Ctrl+Alt+B")).toBe("Control+Alt+B");
    expect(ariaKeyshortcuts("Cmd+Alt+B")).toBe("Meta+Alt+B");
    expect(ariaKeyshortcuts("Mayús+1")).toBe("Shift+1");
    expect(ariaKeyshortcuts("L")).toBe("L");
  });

  it("names the other modifiers and the plus key", () => {
    expect(ariaKeyshortcuts("Shift+Alt+F")).toBe("Shift+Alt+F");
    expect(ariaKeyshortcuts("Ctrl+Mayús+Z")).toBe("Control+Shift+Z");
    expect(ariaKeyshortcuts("+")).toBe("Plus");
    expect(ariaKeyshortcuts("-")).toBe("-");
  });

  it("gives nothing for no key", () => {
    expect(ariaKeyshortcuts("")).toBe("");
  });
});
