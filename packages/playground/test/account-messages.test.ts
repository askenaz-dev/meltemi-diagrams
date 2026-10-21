import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages } from "../src/messages/index.js";

afterEach(() => setLocale("en"));

const NAMESPACES = ["account", "tokens"] as const;
const FIRST = "@@one@@";
const SECOND = "@@two@@";

/** What an entry says: a string as it is, a sentence with its parameters filled with markers. */
function say(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (typeof entry === "function") {
    return (entry as (...args: string[]) => string)(...[FIRST, SECOND].slice(0, entry.length));
  }
  throw new Error(`Not a message: ${String(entry)}`);
}

/** Every entry of the account and tokens words in a language, by its path. */
function entries(words: typeof en): [string, unknown][] {
  return NAMESPACES.flatMap((name) =>
    Object.entries(words[name]).map(([key, entry]): [string, unknown] => [`${name}.${key}`, entry]),
  );
}

/**
 * English words that are no Spanish word at all: nothing that is also Spanish, such as "a", "no",
 * "me", "has", "use", "once" or "error".
 */
const ENGLISH = new Set(
  (
    "the your you yours and or of to is are was were be been will would cannot could must should " +
    "not with without for from this that these those it its at by have had never now " +
    "again try sign in out on off create created creating revoke revoked revoking last used " +
    "loading copy copied name account service page reload give most more than then longer any " +
    "all what such when where how why because but if else please wait done failed " +
    "signed answered reached connection check unreadable read select hold holds laptop"
  ).split(" "),
);

/** Common Spanish words; a sentence of several words has at least one of them. */
const SPANISH = new Set(
  (
    "el la los las de del un una unos unas que y o tu tus no se con por para en al ya como más " +
    "este esta ese esa lo le les su sus nunca todo alguno cuando donde aquí ahora puedes " +
    "tienes tendrás ha han hay es son está puede pueden"
  ).split(" "),
);

const wordsOf = (text: string): string[] =>
  text
    .replaceAll(FIRST, " ")
    .replaceAll(SECOND, " ")
    .split(/[^\p{L}]+/u)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());

describe("the account and tokens words", () => {
  it("are in Spanish entry for entry, with the same kind of entry and the same parameters", () => {
    const english = entries(en);
    const spanish = entries(es);
    expect(spanish.map(([path]) => path)).toEqual(english.map(([path]) => path));
    expect(english.length).toBeGreaterThan(40);
    for (const [index, [path, entry]] of english.entries()) {
      const other = spanish[index]![1];
      expect(typeof other, path).toBe(typeof entry);
      if (typeof entry === "function") {
        expect((other as () => string).length, `${path} takes the same parameters`).toBe(
          entry.length,
        );
      }
    }
  });

  it("use every parameter their sentence is given", () => {
    for (const words of [en, es]) {
      for (const [path, entry] of entries(words)) {
        if (typeof entry !== "function") continue;
        const text = say(entry);
        for (const marker of [FIRST, SECOND].slice(0, entry.length)) {
          expect(text, path).toContain(marker);
        }
      }
    }
  });

  it("are empty nowhere and have no blank at either end", () => {
    for (const words of [en, es]) {
      for (const [path, entry] of entries(words)) {
        expect(say(entry).trim(), path).not.toBe("");
        expect(say(entry), path).toBe(say(entry).trim());
      }
    }
  });

  it("differ between the languages, except a sentence that only joins its parts", () => {
    const english = entries(en);
    const spanish = entries(es);
    const same: string[] = [];
    for (const [index, [path, entry]] of english.entries()) {
      if (say(entry) === say(spanish[index]![1])) same.push(path);
    }
    // `message (code)` is the service's own message and its code in both languages.
    expect(same).toEqual(["tokens.failed"]);
  });

  it("have no English word in Spanish, proper nouns such as API apart", () => {
    const found: string[] = [];
    for (const [path, entry] of entries(es)) {
      const english = wordsOf(say(entry)).filter((word) => ENGLISH.has(word));
      if (english.length > 0) found.push(`${path}: ${english.join(", ")}`);
    }
    expect(found).toEqual([]);
  });

  it("say a sentence of several words with Spanish words", () => {
    const bare: string[] = [];
    for (const [path, entry] of entries(es)) {
      const words = wordsOf(say(entry));
      if (words.length >= 4 && !words.some((word) => SPANISH.has(word))) bare.push(path);
    }
    expect(bare).toEqual([]);
  });

  it("open a question as Spanish does, and only a question", () => {
    for (const words of [en, es]) {
      for (const [path, entry] of entries(words)) {
        const text = say(entry);
        if (words === es) expect(text.includes("¿"), path).toBe(text.includes("?"));
        else expect(text.includes("¿"), path).toBe(false);
      }
    }
  });

  it("name the account the way the identity service does", () => {
    expect(en.account).toMatchObject({
      signIn: "Sign in",
      menu: "Account",
      account: "Account",
      tokens: "API tokens",
      signOut: "Sign out",
    });
    expect(es.account).toMatchObject({
      signIn: "Iniciar sesión",
      menu: "Cuenta",
      account: "Cuenta",
      tokens: "Tokens de API",
      signOut: "Cerrar sesión",
    });
    expect(en.account.button("Ana")).toBe("Account: Ana");
    expect(es.account.button("Ana")).toBe("Cuenta: Ana");
    expect(en.account.signInTitle).toBe("Sign in with your Meltemi account");
    expect(es.account.signInTitle).toBe("Inicia sesión con tu cuenta de Meltemi");
  });

  it("name the tokens dialog's buttons and questions in both languages", () => {
    expect(en.tokens).toMatchObject({
      title: "API tokens",
      create: "Create",
      revoke: "Revoke",
      revokeTitle: "Revoke the token?",
      revokeConfirm: "Revoke the token",
      copy: "Copy the token",
      tryAgain: "Try again",
    });
    expect(es.tokens).toMatchObject({
      title: "Tokens de API",
      create: "Crear",
      revoke: "Revocar",
      revokeTitle: "¿Revocar el token?",
      revokeConfirm: "Revocar el token",
      copy: "Copiar el token",
      tryAgain: "Intentarlo de nuevo",
    });
    expect(en.tokens.revokeToken("laptop")).toBe("Revoke the token laptop");
    expect(es.tokens.revokeToken("laptop")).toBe("Revocar el token laptop");
    expect(en.tokens.count(3, 20)).toBe("3 of 20 tokens");
    expect(es.tokens.count(3, 20)).toBe("3 de 20 tokens");
    expect(en.tokens.made("CI")).toBe("Created the token CI.");
    expect(es.tokens.made("CI")).toBe("Se creó el token CI.");
  });

  it("warn that the token is shown once, in both languages", () => {
    expect(en.tokens.copyNow("CI")).toContain("will not be shown again");
    expect(es.tokens.copyNow("CI")).toContain("no se volverá a mostrar");
  });

  it("follow the interface's language", () => {
    expect(messages().account.signIn).toBe("Sign in");
    expect(messages().tokens.title).toBe("API tokens");
    setLocale("es");
    expect(messages().account.signIn).toBe("Iniciar sesión");
    expect(messages().account.signOut).toBe("Cerrar sesión");
    expect(messages().tokens.title).toBe("Tokens de API");
    setLocale("en");
    expect(messages().account.signOut).toBe("Sign out");
  });
});
