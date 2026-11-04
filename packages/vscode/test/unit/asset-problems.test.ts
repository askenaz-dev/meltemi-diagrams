import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { Workspace, createMemoryHost } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { assetProblems } from "../../src/extension/asset-problems.js";

const ICON = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';

function workspace(files: Record<string, string>): Workspace {
  const host = createMemoryHost({
    "/p/project.json": JSON.stringify({ name: "p", language: "0.2" }),
    ...Object.fromEntries(Object.entries(files).map(([path, text]) => [`/p/${path}`, text])),
  });
  return new Workspace(host, "/p", {
    toolVersion: "1.0.0",
    assets: { builtInPacks: createNodeIconPacks() },
  });
}

describe("the asset problems the Problems view shows", () => {
  it("names a pack without licence and an unsafe icon on their files", () => {
    const found = assetProblems(
      workspace({
        "assets/icons/brand/logo.svg": ICON,
        "assets/icons/brand/bad.svg": "<svg viewBox='0 0 1 1'><script/></svg>",
      }),
      new Set(),
    );
    expect(
      Object.fromEntries([...found.set].map(([path, list]) => [path, list.map((d) => d.code)])),
    ).toEqual({
      "/p/assets/icons/brand": ["asset.missing-license"],
      "/p/assets/icons/brand/bad.svg": ["asset.unsafe-svg"],
    });
    expect(found.clear).toEqual([]);
  });

  it("clears the files whose problems are gone", () => {
    const found = assetProblems(
      workspace({
        "assets/icons/brand/logo.svg": ICON,
        "assets/licenses.json": JSON.stringify({ icons: { brand: { license: "MIT" } } }),
      }),
      new Set(["/p/assets/icons/brand", "/p/assets/icons/brand/bad.svg"]),
    );
    expect(found.set.size).toBe(0);
    expect(found.clear).toEqual(["/p/assets/icons/brand", "/p/assets/icons/brand/bad.svg"]);
  });
});
