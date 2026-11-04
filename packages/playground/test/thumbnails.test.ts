import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMPLATES, templateManifest, type TemplateName } from "@meltemi/diagrams-project";
import { THUMBNAIL_LIMIT, darkCounterpart, templateThumbnails } from "../thumbnails.mjs";

const TEMPLATE_ROOT = fileURLToPath(new URL("../../cli/templates/", import.meta.url));

/** A template's files as the build gathers them, `project.json` included. */
function templateFiles(name: TemplateName): Record<string, string> {
  const root = join(TEMPLATE_ROOT, name);
  const files: Record<string, string> = {
    "project.json": templateManifest(name, name, { toolVersion: "1.9.0", languageVersion: "0.2" }),
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(root, path).split(sep).join("/")] = readFileSync(path, "utf8");
    }
  };
  walk(root);
  return files;
}

describe("the template thumbnails", () => {
  it("swaps a light theme for its dark counterpart and keeps any other", () => {
    expect(darkCounterpart("technical.light")).toBe("technical.dark");
    expect(darkCounterpart("stage.dark")).toBe("stage.dark");
    expect(darkCounterpart("company")).toBe("company");
  });

  it.each(Object.keys(TEMPLATES) as TemplateName[])(
    "draws the %s template's first diagram, light and dark, without fonts",
    (name) => {
      const { light, dark } = templateThumbnails(name, templateFiles(name), "1.9.0");
      for (const svg of [light, dark]) {
        expect(svg.startsWith("<svg")).toBe(true);
        expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(THUMBNAIL_LIMIT);
        expect(svg).not.toContain("@font-face");
      }
      expect(dark).not.toBe(light);
    },
    60_000,
  );

  it("draws a template in the theme its diagram names: the whiteboard by hand, light and dark", () => {
    const { light, dark } = templateThumbnails("whiteboard", templateFiles("whiteboard"), "1.9.0");
    // The sketch themes write the hand font first; the text falls back to the system's.
    for (const svg of [light, dark])
      expect(svg).toMatch(/^<svg[^>]*font-family="&quot;Patrick Hand/);
    const kanban = templateThumbnails("kanban", templateFiles("kanban"), "1.9.0");
    expect(kanban.light).not.toContain("Patrick Hand");
  });

  it("refuses a template without a diagram", () => {
    expect(() =>
      templateThumbnails("empty", { "project.json": "{}", "notes.md": "# Notes" }, "1.9.0"),
    ).toThrow(/no \.meltemi file/);
  });
});
