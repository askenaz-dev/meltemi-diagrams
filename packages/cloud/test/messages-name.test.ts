import { describe, expect, it } from "vitest";
import { messages } from "../src/messages/index.js";

const MARKER = "@@one@@";

/** The arguments a sentence is tried with: markers as strings, as lists and as counts. */
const ARGUMENTS: readonly (readonly unknown[])[] = [
  Array.from({ length: 6 }, () => MARKER),
  Array.from({ length: 6 }, () => [MARKER]),
  Array.from({ length: 6 }, () => 2),
];

/** Every entry of a catalogue as what it says, by its path. */
function texts(words: object): [string, string][] {
  const found: [string, string][] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") found.push([path, value]);
    else if (typeof value === "function") {
      let said = false;
      for (const args of ARGUMENTS) {
        try {
          const text = (value as (...args: unknown[]) => unknown)(...args);
          if (typeof text === "string") {
            found.push([path, text]);
            said = true;
          }
        } catch {
          // This kind of argument is not the sentence's; another one is.
        }
      }
      if (!said) throw new Error(`${path} could not be said with any argument`);
    } else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        walk(inner, path === "" ? key : `${path}.${key}`);
      }
    }
  };
  walk(words, "");
  return found;
}

describe("the Worker's pages", () => {
  it("call the app a playground in no entry, in either language", () => {
    const found: string[] = [];
    for (const language of ["en", "es"] as const) {
      for (const [path, text] of texts(messages(language))) {
        if (/playground/i.test(text)) found.push(`${path} (${language})`);
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });

  it("lead back to Meltemi Diagrams and name the account panel for tokens", () => {
    expect(messages("en").common.backToSite).toBe("Back to Meltemi Diagrams");
    expect(messages("es").common.backToSite).toBe("Volver a Meltemi Diagrams");
    const english = texts(messages("en").cliAuth).map(([, text]) => text);
    const spanish = texts(messages("es").cliAuth).map(([, text]) => text);
    expect(english.some((text) => text.includes("API tokens in your account panel"))).toBe(true);
    expect(spanish.some((text) => text.includes("tokens de API del panel de tu cuenta"))).toBe(
      true,
    );
  });
});
