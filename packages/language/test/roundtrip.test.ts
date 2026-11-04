import { describe, expect, it } from "vitest";
import { corpusFiles, seededRandom } from "../../../test-support/corpus.js";
import { parse, toText } from "../src/index.js";

const all = [...corpusFiles("valid"), ...corpusFiles("invalid"), ...corpusFiles("edits")];

const MUTATIONS_PER_FILE = 200;
const INTERESTING = [
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ":",
  ";",
  ",",
  ".",
  '"',
  "\\",
  "/",
  "*",
  "-",
  ">",
  "->",
  "-->",
  "//",
  "/*",
  "*/",
  "\n",
  "\r\n",
  "\r",
  "\t",
  " ",
  "=",
  "#",
  "%",
  "ms",
  "0",
  "-1",
  "a",
  "_",
  "ñ",
  "\uFEFF",
  "😀",
];

function mutate(text: string, random: () => number): string {
  const pick = (n: number) => Math.floor(random() * n);
  const at = pick(text.length + 1);
  switch (pick(4)) {
    case 0: {
      const len = 1 + pick(6);
      return text.slice(0, at) + text.slice(at + len);
    }
    case 1:
      return text.slice(0, at) + INTERESTING[pick(INTERESTING.length)] + text.slice(at);
    case 2: {
      const from = pick(text.length + 1);
      const chunk = text.slice(from, from + 1 + pick(12));
      return text.slice(0, at) + chunk + text.slice(at);
    }
    default: {
      const len = 1 + pick(4);
      return text.slice(0, at) + INTERESTING[pick(INTERESTING.length)] + text.slice(at + len);
    }
  }
}

describe("lossless round trip", () => {
  it("covers the corpus", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all.map((f) => [f.name, f.text] as const))("%s round-trips", (_name, text) => {
    expect(toText(parse(text).root)).toBe(text);
  });

  it.each(all.map((f) => [f.name, f.text] as const))(
    "%s round-trips after random mutations",
    (name, text) => {
      const random = seededRandom([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
      let current = text;
      for (let i = 0; i < MUTATIONS_PER_FILE; i++) {
        // Mostly mutate the original, sometimes keep accumulating damage.
        current = mutate(random() < 0.7 ? text : current, random);
        const result = parse(current);
        if (toText(result.root) !== current) {
          expect.fail(
            `round trip failed for mutation ${i} of ${name}:\n${JSON.stringify(current)}`,
          );
        }
      }
    },
  );
});

describe("corpus syntax", () => {
  it.each(corpusFiles("valid").map((f) => [f.name, f.text] as const))(
    "%s has no syntax diagnostics",
    (_name, text) => {
      expect(parse(text).diagnostics).toEqual([]);
    },
  );
});
