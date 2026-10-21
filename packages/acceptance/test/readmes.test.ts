import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const PACKAGES = join(REPO_ROOT, "packages");
const OUTPUT = join(REPO_ROOT, "packages", "acceptance", ".test-output", "readmes");

/** The public packages and the TypeScript examples of their READMEs. */
const readmes = readdirSync(PACKAGES)
  .filter((name) => {
    const manifest = JSON.parse(readFileSync(join(PACKAGES, name, "package.json"), "utf8")) as {
      private?: boolean;
    };
    return !manifest.private;
  })
  .map((name) => {
    const text = readFileSync(join(PACKAGES, name, "README.md"), "utf8");
    const examples = [...text.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!);
    return { name, text, examples };
  });

describe("package READMEs", () => {
  it.each(readmes.map((r) => [r.name, r] as const))(
    "%s has a README with its name, installation, use and licence",
    (_name, readme) => {
      const manifest = JSON.parse(
        readFileSync(join(PACKAGES, readme.name, "package.json"), "utf8"),
      ) as {
        name: string;
      };
      expect(readme.text.startsWith(`# ${manifest.name}\n`)).toBe(true);
      for (const heading of ["## Install", "## Use", "## Documentation", "## Licence"]) {
        expect(readme.text, heading).toContain(`\n${heading}\n`);
      }
    },
  );

  const runnable = readmes.flatMap((r) =>
    r.examples.map((code, i) => [`${r.name} #${i + 1}`, code] as const),
  );

  it.each(runnable)(
    "runs the example %s",
    async (label, code) => {
      mkdirSync(OUTPUT, { recursive: true });
      const file = join(OUTPUT, `${label.replace(/[^a-z0-9-]+/gi, "-")}.ts`);
      writeFileSync(file, `${code}\nexport {};\n`);
      const printed: unknown[][] = [];
      const log = console.log;
      console.log = (...args: unknown[]) => void printed.push(args);
      try {
        await import(/* @vite-ignore */ pathToFileURL(file).href);
      } finally {
        console.log = log;
      }
      // What an example prints next to `// true` is true.
      const expectations = [...code.matchAll(/console\.log\(([^\n]*)\); \/\/ true/g)].length;
      const trues = printed.filter((args) => args.length === 1 && args[0] === true).length;
      expect(trues, `${label} prints true where it says so`).toBe(expectations);
    },
    60_000,
  );
});
