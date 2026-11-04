import { describe, expect, it, vi } from "vitest";

// What `preview --open` runs: the opener `login` uses, which starts no shell. The module is
// replaced here so that no browser is started; `open-url.test.ts` checks the command it would run.
const openUrl = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()));
vi.mock("../src/open-url.js", () => ({ openUrl }));

const { openInBrowser } = await import("../src/preview.js");

describe("preview --open", () => {
  it("opens the address with the opener login uses, whole, whatever characters it has", () => {
    openUrl.mockClear();
    // `cmd /c start` ended the command at the first `&`.
    for (const url of [
      "http://127.0.0.1:4317/",
      "http://127.0.0.1:4317/#/diagram/diagrams/a%20b/flow",
      "http://127.0.0.1:4317/?a=1&b=2#/diagram/x&y",
      'http://127.0.0.1:4317/#/diagram/q"uote',
    ]) {
      openInBrowser(url);
      expect(openUrl).toHaveBeenLastCalledWith(url);
    }
    expect(openUrl).toHaveBeenCalledTimes(4);
  });

  it("is not an error when the opener cannot start: the address was printed", async () => {
    openUrl.mockClear();
    openUrl.mockRejectedValueOnce(new Error("spawn xdg-open ENOENT"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() => openInBrowser("http://127.0.0.1:4317/")).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    // And an opener that refuses the address at once.
    openUrl.mockImplementationOnce(() => {
      throw new Error("Refusing to open file: addresses.");
    });
    expect(() => openInBrowser("file:///C:/Windows/System32/calc.exe")).not.toThrow();
  });

  it("takes another opener when one is given", () => {
    openUrl.mockClear();
    const opened: string[] = [];
    openInBrowser("http://127.0.0.1:4317/?a=1&b=2", (url) => {
      opened.push(url);
      return Promise.resolve();
    });
    expect(opened).toEqual(["http://127.0.0.1:4317/?a=1&b=2"]);
    expect(openUrl).not.toHaveBeenCalled();
  });
});
