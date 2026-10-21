import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run, type CliIo } from "../src/index.js";
import { TEMPLATES } from "../src/init-command.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { argumentsError, isYes } from "../src/messages/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-language-"));

async function mdg(args: string[], io: Partial<CliIo> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
    ...io,
  });
  return { code, stdout, stderr, last: stdout.trimEnd().split("\n").at(-1) };
}

/** A project with one flow diagram whose `api` has the label given. */
function project(name: string, label: string, manifest: Record<string, unknown> = {}): string {
  const root = join(scratch, name);
  mkdirSync(join(root, "diagrams"), { recursive: true });
  writeFileSync(
    join(root, "project.json"),
    JSON.stringify({ name: "shop", language: "0.2", ...manifest }),
  );
  writeFileSync(
    join(root, "diagrams", "checkout.meltemi"),
    `language "0.2"\n\ndiagram checkout: flow {\n  web["Web"]\n  api["${label}"]\n  web -> api\n}\n`,
  );
  return root;
}

project("before", "API");
project("after", "Orders API");
project("after-es", "Orders API", { locale: "es" });

afterEach(() => setLocale("en"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("the command line's catalog", () => {
  it("has every sentence in Spanish", () => {
    // Words that Spanish writes as English does: the table of `projects` has the column "ID" and
    // the role "editor" in both.
    expect(
      untranslated(en, es, ["cloud.projects.header.id", "cloud.projects.roles.editor"]),
    ).toEqual([]);
  });

  it("describes the templates as the project defines them", () => {
    expect(en.init.templates).toEqual(TEMPLATES);
    expect(Object.keys(es.init.templates)).toEqual(Object.keys(TEMPLATES));
  });

  it("accepts yes in both languages", () => {
    for (const answer of ["y", "Y", "yes", "YES", "s", "S", "si", "Si", "sí", "Sí", "SÍ", " s "]) {
      expect(isYes(answer), answer).toBe(true);
    }
    for (const answer of ["", "n", "no", "N", "oui", "sim", "yess", "sí, claro"]) {
      expect(isYes(answer), answer).toBe(false);
    }
  });

  it("keeps Node's argument errors in English and words them in Spanish", () => {
    const errorOf = (args: string[]) => {
      try {
        parseArgs({
          args,
          options: { diagram: { type: "string" }, check: { type: "boolean" } },
          allowPositionals: true,
          strict: true,
        });
      } catch (error) {
        return error as Error;
      }
      throw new Error("no error");
    };
    const unknown = errorOf(["--frob"]);
    const missing = errorOf(["--diagram"]);
    const value = errorOf(["--check=yes"]);
    expect(argumentsError(unknown)).toBe(unknown.message);
    expect(argumentsError(missing)).toBe(missing.message);
    setLocale("es");
    expect(argumentsError(unknown)).toMatch(/^la opción --frob no existe; /);
    expect(argumentsError(missing)).toBe("falta el valor de --diagram.");
    expect(argumentsError(value)).toBe("--check no lleva valor.");
  });
});

describe("the language of messages", () => {
  it("prints the summary of validate in Spanish with the same exit code", async () => {
    const english = await mdg(["validate", "corpus/valid"]);
    const spanish = await mdg(["validate", "corpus/valid", "--lang", "es"]);
    expect(spanish.code).toBe(english.code);
    expect(english.last).toMatch(/^Checked \d+ files: 0 errors, 0 warnings\.$/);
    expect(spanish.last).toMatch(/^Se revisaron \d+ archivos: 0 errores, 0 advertencias\.$/);
    expect(spanish.last!.match(/\d+/)![0]).toBe(english.last!.match(/\d+/)![0]);
  });

  it("keeps the codes and positions of diagnostics, and names hints in Spanish", async () => {
    const file = "corpus/invalid/ref.unknown-element.meltemi";
    const english = await mdg(["validate", file]);
    const spanish = await mdg(["validate", file, "--lang", "es"]);
    expect(spanish.code).toBe(english.code);
    const lines = spanish.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^corpus\/invalid\/ref\.unknown-element\.meltemi:6:11: error ref\./);
    expect(lines[1]).toMatch(/^ {4}pista: /);
    expect(spanish.last).toBe("Se revisó 1 archivo: 1 error, 0 advertencias.");
  });

  it("prints the help in Spanish when the environment asks for it", async () => {
    for (const env of [{ MELTEMI_LANG: "es" }, { LANG: "es_CL.UTF-8" }, { LC_ALL: "es_ES" }]) {
      const { code, stdout } = await mdg(["--help"], { env });
      expect(code).toBe(0);
      expect(stdout.startsWith("Uso: meltemi-diagrams <comando> [opciones]\nAlias: mdg\n")).toBe(
        true,
      );
      expect(stdout).toContain("Todos los comandos aceptan --lang en|es");
    }
    const system = await mdg(["--help"], { locale: "es-CL" });
    expect(system.stdout.startsWith("Uso: meltemi-diagrams")).toBe(true);
  });

  it("lets --lang and MELTEMI_LANG win over the machine", async () => {
    const english = await mdg(["--help"]);
    expect(english.stdout.startsWith("Usage: meltemi-diagrams <command> [options]\n")).toBe(true);
    expect((await mdg(["--help", "--lang", "en"], { env: { LANG: "es_CL.UTF-8" } })).stdout).toBe(
      english.stdout,
    );
    expect(
      (await mdg(["--help"], { env: { MELTEMI_LANG: "en", LANG: "es_CL.UTF-8" } })).stdout,
    ).toBe(english.stdout);
    expect((await mdg(["--help"], { env: { LANG: "C" }, locale: "en-US" })).stdout).toBe(
      english.stdout,
    );
  });

  it("prints the help of every command in Spanish", async () => {
    for (const command of [
      ["import"],
      ["review"],
      ["init"],
      ["assets"],
      ["plugins"],
      ["build"],
      ["preview"],
      ["assist"],
      ["validate"],
      ["format"],
      ["layout"],
      ["convert"],
    ]) {
      const english = await mdg([...command, "--help"]);
      const spanish = await mdg([...command, "--help", "--lang", "es"]);
      expect(spanish.code, command[0]).toBe(english.code);
      expect(english.stdout.startsWith("Usage: "), command[0]).toBe(true);
      expect(spanish.stdout.startsWith("Uso: "), command[0]).toBe(true);
    }
  });

  it("refuses another language with exit 2, in the machine's language", async () => {
    const english = await mdg(["validate", "corpus/valid", "--lang", "fr"]);
    expect(english.code).toBe(2);
    expect(english.stderr).toBe("meltemi-diagrams: --lang must be en or es.\n");
    const spanish = await mdg(["validate", "corpus/valid", "--lang", "fr"], {
      env: { MELTEMI_LANG: "es" },
    });
    expect(spanish.code).toBe(2);
    expect(spanish.stderr).toBe("meltemi-diagrams: --lang debe ser en o es.\n");
  });

  it("names an unknown command in both languages", async () => {
    const english = await mdg(["frobnicate"]);
    expect(english.stderr).toBe(
      'meltemi-diagrams: unknown command "frobnicate". Run "meltemi-diagrams --help".\n',
    );
    const spanish = await mdg(["frobnicate", "--lang", "es"]);
    expect(spanish.code).toBe(english.code);
    expect(spanish.stderr).toBe(
      'meltemi-diagrams: comando desconocido "frobnicate". Ejecuta "meltemi-diagrams --help".\n',
    );
  });

  it("explains usage errors in Spanish with the same exit code", async () => {
    const args = ["export", "corpus/valid/c4/commerce.meltemi", "--fps", "10"];
    const english = await mdg(args);
    const spanish = await mdg([...args, "--lang", "es"]);
    expect(english.code).toBe(2);
    expect(spanish.code).toBe(2);
    expect(spanish.stderr).toBe(
      "meltemi-diagrams export: --fps fija los fotogramas por segundo de las exportaciones MP4, WebM y GIF.\n",
    );
    const unknown = await mdg(["validate", "--frob", "--lang", "es"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toMatch(/^meltemi-diagrams validate: la opción --frob no existe; /);
  });

  it("lists templates in Spanish", async () => {
    const { stdout } = await mdg(["init", "--list", "--lang", "es"]);
    expect(stdout).toContain(`flow      ${es.init.templates.flow}\n`);
  });
});

describe("import in Spanish", () => {
  const source = join(scratch, "shapes.mmd");
  // A mirrored parallelogram has no shape of its own: it is drawn as the parallelogram.
  writeFileSync(source, "flowchart LR\n  a[\\Input\\] --> b[Box]\n");

  it("reports in Spanish with the same codes and status", async () => {
    const english = await mdg(["import", source, "--check"], { cwd: scratch });
    const spanish = await mdg(["import", source, "--check", "--lang", "es"], { cwd: scratch });
    expect(spanish.code).toBe(english.code);
    expect(english.code).toBe(0);
    const finding = (out: string) => out.split("\n").find((l) => l.includes("import.approximated"));
    expect(finding(spanish.stdout)).toMatch(/^shapes\.mmd:2:3: info import\.approximated /);
    expect(finding(spanish.stdout)).not.toBe(finding(english.stdout));
    expect(english.stdout).toContain("Would import shapes.mmd → shapes.meltemi (complete)");
    expect(spanish.stdout).toContain("Se importaría shapes.mmd → shapes.meltemi (completa)");
    const mapped = /: (\d+) mapped, 1 approximated, 0 dropped\n/.exec(english.stdout)?.[1];
    expect(mapped).toBeDefined();
    expect(spanish.stdout).toContain(`: ${mapped} convertidos, 1 aproximado, 0 omitidos\n`);
  });

  it("writes the sheet's words in the language of --lang, never in the machine's", async () => {
    const spanish = await mdg(["import", source, "--out", "es.meltemi", "--lang", "es"], {
      cwd: scratch,
    });
    expect(spanish.code).toBe(0);
    expect(readFileSync(join(scratch, "es.meltemi"), "utf8")).toContain("// Importado de ");
    const machine = await mdg(["import", source, "--out", "machine.meltemi"], {
      cwd: scratch,
      env: { LANG: "es_CL.UTF-8" },
    });
    expect(machine.code).toBe(0);
    expect(machine.stdout).toContain("Se importó shapes.mmd → machine.meltemi (completa)");
    expect(readFileSync(join(scratch, "machine.meltemi"), "utf8")).toContain("// Imported from ");
  });
});

describe("the review report", () => {
  const report = (folder: string) => readFileSync(join(scratch, folder, "index.html"), "utf8");

  it("is English on a Spanish machine, whose terminal speaks Spanish", async () => {
    const { code, stdout } = await mdg(
      ["review", "after", "--before", "before", "--out", "machine"],
      { cwd: scratch, env: { LANG: "es_CL.UTF-8" } },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("Se escribió machine/index.html\n");
    expect(stdout.trimEnd().split("\n").at(-1)).toBe(
      "1 archivo cambió: 0 agregados, 0 quitados, 0 renombrados, 1 cambiado.",
    );
    const html = report("machine");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Review</h1>");
    expect(html).toContain(
      "Compared before with after. 1 file changed: 0 added, 0 removed, 0 renamed, 1 changed.",
    );
    expect(html).toContain("<figcaption>Before</figcaption>");
    expect(html).not.toContain("Revisión");
  });

  it("is the same as on an English machine when nothing names a language", async () => {
    await mdg(["review", "after", "--before", "before", "--out", "english"], { cwd: scratch });
    expect(report("english")).toBe(report("machine"));
  });

  it("is Spanish with --lang es", async () => {
    const { code, stdout } = await mdg(
      ["review", "after", "--before", "before", "--out", "spanish", "--lang", "es"],
      { cwd: scratch },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("Se escribió spanish/index.html\n");
    const html = report("spanish");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<h1>Revisión</h1>");
    expect(html).toContain(
      "Comparación de before con after. 1 archivo cambió: 0 agregados, 0 quitados, 0 renombrados, 1 cambiado.",
    );
    expect(html).toContain("<figcaption>Antes</figcaption><img");
    expect(html).toContain("<h3>diagrama checkout</h3>");
  });

  it("follows the project's locale, and the terminal the interface", async () => {
    const { code, stdout } = await mdg(
      ["review", "after-es", "--before", "before", "--out", "project"],
      { cwd: scratch },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("Wrote project/index.html\n");
    expect(report("project")).toContain("<h1>Revisión</h1>");
  });

  it("prints Spanish lines and English JSON keys", async () => {
    const lines = await mdg(["review", "after", "--before", "before", "--lang", "es"], {
      cwd: scratch,
    });
    expect(lines.stdout.split("\n")[0]).toBe("~ diagrams/checkout.meltemi");
    const json = await mdg(["review", "after", "--before", "before", "--json", "--lang", "es"], {
      cwd: scratch,
    });
    const parsed = JSON.parse(json.stdout) as { compared: string; summary: object };
    expect(parsed.compared).toBe("Comparación de before con after");
    expect(parsed.summary).toEqual({ files: 1, added: 0, removed: 0, renamed: 0, changed: 1 });
  });
});

describe("confirmations in both languages", () => {
  let server: Server;
  let env: Record<string, string> = {};
  let requests = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        requests++;
        res.writeHead(200, { "content-type": "application/json" });
        const answer = { summary: "One label changed.", explanation: "The API is renamed." };
        res.end(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    env = {
      MELTEMI_AI_PROVIDER: "openai-compatible",
      MELTEMI_AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      MELTEMI_AI_MODEL: "local-model",
    };
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const explain = (answer: string, ...extra: string[]) => {
    const asked: string[] = [];
    return mdg(["assist", "explain", "after", "--before", "before", ...extra], {
      cwd: scratch,
      env,
      ask: async (question) => {
        asked.push(question);
        return answer;
      },
    }).then((result) => ({ ...result, asked }));
  };

  it("sends after s, sí or yes, and nothing after another answer", async () => {
    for (const answer of ["s", "sí", "SI", "yes", "y"]) {
      const before = requests;
      const { code, stdout } = await explain(answer);
      expect(code, answer).toBe(0);
      expect(stdout, answer).toBe("The API is renamed.\n");
      expect(requests, answer).toBe(before + 1);
    }
    const before = requests;
    const refused = await explain("n");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("nothing was sent; answer yes, or pass --yes.");
    expect(requests).toBe(before);
  });

  it("asks in Spanish and says in Spanish that nothing was sent", async () => {
    const accepted = await explain("s", "--lang", "es");
    expect(accepted.code).toBe(0);
    expect(accepted.asked).toEqual(["¿Enviarla? [s/N] "]);
    const refused = await explain("no", "--lang", "es");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain(
      "meltemi-diagrams assist: no se envió nada; responde que sí, o pasa --yes.\n",
    );
    const english = await explain("s");
    expect(english.asked).toEqual(["Send it? [y/N] "]);
  });
});
