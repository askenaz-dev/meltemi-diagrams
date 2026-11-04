import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { buildCatalog, ProjectSessions } from "../src/node.js";

/** The architecture project of the corpus: diagrams, views and a story to catalogue. */
const ARCHITECTURE = join(CORPUS_ROOT, "projects", "valid", "architecture", "project.json")
  .split("\\")
  .join("/");

function catalog(frame?: "none"): string {
  const projects = new ProjectSessions({ toolVersion: "1.0.0" });
  return buildCatalog(projects.forFile(ARCHITECTURE), projects, {
    generator: "Meltemi Diagrams 1.0.0",
    script: () => "",
    ...(frame ? { frame } : {}),
  }).html;
}

describe("a catalog without the branding", () => {
  // The catalog holds its pictures as data: the frame is a group whose role says so.
  const framed = /"role":"frame"/;

  it("draws its pictures without the frame and keeps its footer and generator", () => {
    const branded = catalog();
    const plain = catalog("none");
    expect(branded).toMatch(framed);
    expect(plain).not.toMatch(framed);
    expect(plain).not.toContain("meltemi-wind");
    expect(plain).toContain("Meltemi Diagrams 1.0.0");
  });

  it("is the same catalog when nothing is asked", () => {
    expect(catalog()).toBe(catalog());
  });
});
