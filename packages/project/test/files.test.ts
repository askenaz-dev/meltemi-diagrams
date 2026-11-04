import { SOURCE_LIMITS } from "@meltemi/diagrams-model";
import { describe, expect, it } from "vitest";
import {
  CLOUD_LIMITS,
  CLOUD_TEXT_EXTENSIONS,
  PATH_SEGMENTS,
  PATH_SEGMENT_LENGTH,
  PROJECT_LIMITS,
  cleanPath,
  isCleanPath,
  isImagePath,
  isTextPath,
} from "../src/index.js";

describe("cleanPath", () => {
  it("keeps a relative path and normalises its separators", () => {
    expect(cleanPath("diagrams/overview.meltemi")).toBe("diagrams/overview.meltemi");
    expect(cleanPath("a\\b.meltemi")).toBe("a/b.meltemi");
    expect(cleanPath("./a//b/./c.json")).toBe("a/b/c.json");
    expect(cleanPath("Name with spaces (1)+@x-y.md")).toBe("Name with spaces (1)+@x-y.md");
  });

  it.each([
    "",
    ".",
    "..",
    "a/../b",
    "../a",
    ".git/config",
    "a/.hidden",
    ".meltemi",
    "a:b",
    "C:/x",
    "a\u0000b",
    "a\tb",
    "a\nb",
    "ñ.meltemi",
    "a|b",
    "a*b",
    `${"x".repeat(PATH_SEGMENT_LENGTH + 1)}.md`,
    Array.from({ length: PATH_SEGMENTS + 1 }, () => "d").join("/"),
  ])("refuses %j", (path) => {
    expect(cleanPath(path)).toBeUndefined();
    expect(isCleanPath(path)).toBe(false);
  });

  it("accepts the limits themselves: a segment of 100 characters, 12 segments", () => {
    const segment = "x".repeat(PATH_SEGMENT_LENGTH);
    expect(cleanPath(segment)).toBe(segment);
    const twelve = Array.from({ length: PATH_SEGMENTS }, () => "d").join("/");
    expect(cleanPath(twelve)).toBe(twelve);
  });
});

describe("isCleanPath", () => {
  it("is true only for a path that is already in its canonical form", () => {
    expect(isCleanPath("a/b.meltemi")).toBe(true);
    for (const path of ["a\\b.meltemi", "a//b", "./a", "a/./b", "/a", "a/", "a/..", "a:b"]) {
      expect(isCleanPath(path), path).toBe(false);
    }
  });
});

describe("file kinds", () => {
  it("knows the text files the code pane edits, whatever the case", () => {
    for (const extension of CLOUD_TEXT_EXTENSIONS) {
      expect(isTextPath(`a/b.${extension}`)).toBe(true);
      expect(isTextPath(`A/B.${extension.toUpperCase()}`)).toBe(true);
    }
    for (const path of ["a.png", "a.woff2", "a", "a.meltemi.bak", "meltemi", "dir.json/file"]) {
      expect(isTextPath(path), path).toBe(false);
    }
  });

  it("knows the pictures", () => {
    for (const path of ["a.png", "a.jpg", "a.JPEG", "a.gif", "a.webp", "a.svg"]) {
      expect(isImagePath(path), path).toBe(true);
    }
    for (const path of ["a.meltemi", "a.woff2", "a.png.txt", "png"]) {
      expect(isImagePath(path), path).toBe(false);
    }
  });
});

describe("CLOUD_LIMITS", () => {
  it("holds the numbers of the specification", () => {
    expect(CLOUD_LIMITS).toMatchObject({
      projects: 100,
      storageBytes: 200 * 1024 * 1024,
      files: 2000,
      documentBytes: 16 * 1024 * 1024,
      textCharacters: 2 * 1024 * 1024,
      binaryBytes: 10 * 1024 * 1024,
      versions: 200,
      unlabelledVersions: 100,
      clients: 20,
      message: 512 * 1024,
    });
  });

  it("keeps a file count equal to the project's, and a message below the platform's 1 MiB", () => {
    expect(CLOUD_LIMITS.files).toBe(PROJECT_LIMITS.files);
    expect(CLOUD_LIMITS.textCharacters).toBe(SOURCE_LIMITS.characters);
    expect(CLOUD_LIMITS.message).toBeLessThan(1024 * 1024);
    expect(CLOUD_LIMITS.unlabelledVersions).toBeLessThan(CLOUD_LIMITS.versions);
  });
});
