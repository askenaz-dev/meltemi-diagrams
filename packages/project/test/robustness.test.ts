import { describe, expect, it } from "vitest";
import { Workspace, createMemoryHost } from "../src/index.js";

/** Small deterministic generator so failures can be reproduced from the seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FILES: Record<string, string> = {
  "/p/project.json": '{ "name": "fuzz", "language": "0.2", "sources": ["."] }',
  "/p/themes/company.meltemi": 'theme base { tag "#111111" }\ntheme corporate { extends "base" }\n',
  "/p/a.meltemi":
    'import corporate from "./themes/company.meltemi"\nimport "./b.meltemi" as b\ndiagram a: flow {\n  theme "corporate"\n  x -> y\n}\n',
  "/p/b.meltemi": 'import "./a.meltemi" as a\ntheme y { extends "a.x" }\n',
};

const SNIPPETS = [
  "import ",
  '"./a.meltemi"',
  '"../escape.meltemi"',
  '"./themes/company.meltemi"',
  " as ",
  " from ",
  ", ",
  "{",
  "}",
  "\n",
  'theme t { extends "b.y" }\n',
  'theme "corporate"',
  "diagram z: flow { }\n",
  '"',
  "project",
  'language "0.1"\n',
];

describe("workspace robustness", () => {
  it("never throws and always terminates under random edits", () => {
    const next = random(20261010);
    const texts = new Map(Object.entries(FILES));
    const ws = new Workspace(createMemoryHost(FILES), "/p", { toolVersion: "1.0.0" });
    const paths = [...texts.keys()];
    for (let round = 0; round < 400; round++) {
      const path = paths[Math.floor(next() * paths.length)]!;
      let text = texts.get(path)!;
      const at = Math.floor(next() * (text.length + 1));
      if (next() < 0.5 && text.length > 0) {
        text =
          text.slice(0, at) + text.slice(Math.min(text.length, at + 1 + Math.floor(next() * 8)));
      } else {
        text = text.slice(0, at) + SNIPPETS[Math.floor(next() * SNIPPETS.length)] + text.slice(at);
      }
      texts.set(path, text);
      ws.setOverlay(path, text);
      expect(() => ws.compileProject(), `round ${round}`).not.toThrow();
      expect(() => ws.compileFile("/p/a.meltemi"), `round ${round}`).not.toThrow();
    }
  });
});
