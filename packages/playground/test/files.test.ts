import { describe, expect, it } from "vitest";
import { ProjectSessions } from "@meltemi/diagrams-editor";
import { createNodeFontReader } from "@meltemi/diagrams-fonts/node";
import { createNodeAssetReader } from "@meltemi/diagrams-assets/node";
import { MemoryHost, ROOT, cleanPath, isImagePath, isTextPath } from "../src/files.js";
import { History, TYPING_PAUSE } from "../src/history.js";
import { LazyFiles, settle } from "../src/lazy.js";

describe("memory host", () => {
  const host = new MemoryHost([
    ["project.json", '{ "name": "shop", "language": "0.2" }'],
    ["diagrams/a.meltemi", 'diagram a: flow {\n  x["X"]\n}\n'],
    ["diagrams/logo.png", new Uint8Array([137, 80, 78, 71])],
  ]);

  it("serves its files as a project folder", () => {
    expect(host.readDirectory("")).toEqual([{ name: "playground", kind: "directory" }]);
    expect(host.readDirectory(ROOT)).toEqual([
      { name: "diagrams", kind: "directory" },
      { name: "project.json", kind: "file" },
    ]);
    expect(host.readDirectory(`${ROOT}/diagrams`)).toEqual([
      { name: "a.meltemi", kind: "file" },
      { name: "logo.png", kind: "file" },
    ]);
    expect(host.readDirectory(`${ROOT}/missing`)).toBeUndefined();
    expect(host.readDirectory("/elsewhere")).toBeUndefined();
    expect(host.readFile(`${ROOT}/diagrams/a.meltemi`)).toContain("diagram a");
    expect(host.readBinary(`${ROOT}/diagrams/logo.png`)).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(host.readFile("/etc/passwd")).toBeUndefined();
  });

  it("compiles as a project with the libraries of the CLI", () => {
    const sessions = new ProjectSessions({
      toolVersion: "1.0.0",
      host,
      fontReader: createNodeFontReader(),
      assetReader: createNodeAssetReader(),
    });
    const analysis = sessions.analyze(`${ROOT}/diagrams/a.meltemi`);
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.diagrams[0]?.layout?.scene).toBeDefined();
    expect(sessions.forFile(`${ROOT}/diagrams/a.meltemi`).root).toBe(ROOT);
  });

  it("renames and deletes files, never over another", () => {
    const copy = new MemoryHost([
      ["a.meltemi", "x"],
      ["b.meltemi", "y"],
    ]);
    expect(copy.rename("a.meltemi", "b.meltemi")).toBe(false);
    expect(copy.rename("a.meltemi", "c.meltemi")).toBe(true);
    expect(copy.paths()).toEqual(["b.meltemi", "c.meltemi"]);
    expect(copy.delete("b.meltemi")).toBe(true);
    expect(copy.paths()).toEqual(["c.meltemi"]);
  });

  it("accepts only relative, visible paths", () => {
    expect(cleanPath("diagrams\\a.meltemi")).toBe("diagrams/a.meltemi");
    expect(cleanPath("./diagrams//a.meltemi")).toBe("diagrams/a.meltemi");
    expect(cleanPath("../a.meltemi")).toBeUndefined();
    expect(cleanPath(".git/config")).toBeUndefined();
    expect(cleanPath("a<b>.meltemi")).toBeUndefined();
    expect(cleanPath("")).toBeUndefined();
    expect(isTextPath("project.json")).toBe(true);
    expect(isTextPath("logo.png")).toBe(false);
    expect(isImagePath("logo.svg")).toBe(true);
  });
});

describe("history", () => {
  it("coalesces typing until a pause or a line break", () => {
    let now = 0;
    const history = new History(() => now);
    history.record([{ path: "a", before: "", after: "d" }], true);
    now += 100;
    history.record([{ path: "a", before: "d", after: "di" }], true);
    now += 100;
    history.record([{ path: "a", before: "di", after: "di\n" }], true);
    now += TYPING_PAUSE + 1;
    history.record([{ path: "a", before: "di\n", after: "di\nx" }], true);
    const texts: string[] = [];
    let current = "di\nx";
    for (;;) {
      const restored = history.undo("a", () => current);
      if (!restored) break;
      current = restored.texts.get("a")!;
      texts.push(current);
    }
    expect(texts).toEqual(["di\n", "di", ""]);
    expect(history.redo("a", () => current)?.texts.get("a")).toBe("di");
  });

  it("undoes a step of several files together, and per file otherwise", () => {
    const history = new History(() => 0);
    const files = new Map([
      ["a", "1"],
      ["b", "1"],
    ]);
    const apply = (restored: ReturnType<History["undo"]>) => {
      for (const [path, text] of restored!.texts) files.set(path, text);
    };
    history.record([
      { path: "a", before: "1", after: "2" },
      { path: "b", before: "1", after: "2" },
    ]);
    files.set("a", "2");
    files.set("b", "2");
    history.record([{ path: "a", before: "2", after: "3" }]);
    files.set("a", "3");
    apply(history.undo("a", (p) => files.get(p)));
    expect([...files.values()]).toEqual(["2", "2"]);
    apply(history.undo("a", (p) => files.get(p)));
    expect([...files.values()]).toEqual(["1", "1"]);
    expect(history.canUndo("b")).toBe(false);
    apply(history.redo("b", (p) => files.get(p)));
    expect([...files.values()]).toEqual(["2", "2"]);
  });
});

describe("lazy files", () => {
  it("reads synchronously what was fetched, fetches what was missed and says when it arrived", async () => {
    const fetched: string[] = [];
    const files = new LazyFiles("/assets/", async (url) => {
      fetched.push(url);
      return url.endsWith("missing.bin") ? undefined : new TextEncoder().encode(url);
    });
    let arrivals = 0;
    files.onArrive(() => arrivals++);
    expect(files.read("@fontsource/a b.woff2")).toBeUndefined();
    await files.idle();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toEqual(["/assets/@fontsource/a%20b.woff2"]);
    expect(files.text("@fontsource/a b.woff2")).toBe("/assets/@fontsource/a%20b.woff2");
    expect(arrivals).toBe(1);
    await files.load(["missing.bin"]);
    expect(files.read("missing.bin")).toBeUndefined();
    expect(files.known("missing.bin")).toBe(true);
  });

  it("settles work that reads files until nothing is missing", async () => {
    const files = new LazyFiles("", async (url) => new TextEncoder().encode(url));
    let renewed = 0;
    const result = await settle(
      [files],
      () => [files.text("a"), files.text("b")].join(","),
      () => renewed++,
    );
    expect(result).toBe("a,b");
    expect(renewed).toBe(1);
  });
});
