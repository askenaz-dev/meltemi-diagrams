import { describe, expect, it } from "vitest";
import { browserCommand } from "../src/open-url.js";

const URL_WITH_AMPERSAND = "https://diagrams.meltemi.dev/cli-auth?port=51234&state=abc_DEF-123";

describe("opening the browser", () => {
  it("passes the address as one argument, with no shell, on every platform", () => {
    expect(browserCommand(URL_WITH_AMPERSAND, "win32")).toEqual({
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", URL_WITH_AMPERSAND],
    });
    expect(browserCommand(URL_WITH_AMPERSAND, "darwin")).toEqual({
      command: "open",
      args: [URL_WITH_AMPERSAND],
    });
    expect(browserCommand(URL_WITH_AMPERSAND, "linux")).toEqual({
      command: "xdg-open",
      args: [URL_WITH_AMPERSAND],
    });
    // Never cmd.exe: its `&` would end the command, and its quotes would mean something.
    for (const platform of ["win32", "darwin", "linux", "freebsd"] as const) {
      const { command, args } = browserCommand(
        "http://127.0.0.1:8788/cli-auth?port=4000&state=x",
        platform,
      );
      expect(command).not.toMatch(/cmd|sh$/);
      expect(args).not.toContain("/c");
      expect(args.filter((a) => a.includes("&"))).toHaveLength(1);
    }
  });

  it("opens web addresses only", () => {
    for (const url of [
      "file:///C:/Windows/System32/calc.exe",
      "javascript:alert(1)",
      "ms-msdt:/id",
      "calc.exe",
    ]) {
      expect(() => browserCommand(url, "win32"), url).toThrow();
    }
  });
});
