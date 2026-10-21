import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

const scratch = mkdtempSync(join(tmpdir(), "mdg-import-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

function folder(name: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("meltemi-diagrams import", () => {
  it("writes <stem>.meltemi beside the source", () => {
    const dir = folder("default");
    const docs = join(dir, "docs");
    mkdirSync(docs);
    writeFileSync(join(docs, "checkout.mmd"), "flowchart LR\n  cart --> pay\n");
    const result = mdg(dir, "import", "docs/checkout.mmd");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Imported docs/checkout.mmd → docs/checkout.meltemi (complete)",
    );
    expect(result.stdout).toContain("checkout: 4 mapped, 0 approximated, 0 dropped");
    expect(readFileSync(join(docs, "checkout.meltemi"), "utf8")).toContain(
      "diagram checkout: flow {",
    );
    expect(readFileSync(join(docs, "checkout.mmd"), "utf8")).toBe("flowchart LR\n  cart --> pay\n");
    expect(mdg(dir, "validate", "docs/checkout.meltemi").code).toBe(0);
  });

  it("refuses to overwrite without --force or --merge", () => {
    const dir = folder("existing");
    writeFileSync(join(dir, "checkout.mmd"), "flowchart LR\n  a --> b\n");
    writeFileSync(join(dir, "checkout.meltemi"), "// mine\n");
    const result = mdg(dir, "import", "checkout.mmd");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--merge");
    expect(result.stderr).toContain("--force");
    expect(readFileSync(join(dir, "checkout.meltemi"), "utf8")).toBe("// mine\n");
    expect(mdg(dir, "import", "checkout.mmd", "--force").code).toBe(0);
    expect(readFileSync(join(dir, "checkout.meltemi"), "utf8")).toContain("a -> b");
  });

  it("merges into an existing sheet", () => {
    const dir = folder("merge");
    writeFileSync(join(dir, "flow.mmd"), "flowchart LR\n  a --> b\n");
    expect(mdg(dir, "import", "flow.mmd").code).toBe(0);
    const sheet = join(dir, "flow.meltemi");
    writeFileSync(
      sheet,
      readFileSync(sheet, "utf8")
        .replace("layout auto", "layout assisted")
        .replace(/\n}\n$/, "\n  placement {\n    place a at (100, 100)\n  }\n}\n"),
    );
    writeFileSync(join(dir, "flow.mmd"), "flowchart LR\n  a --> b\n  b --> c\n");
    const result = mdg(dir, "import", "flow.mmd", "--merge");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("(complete, merged)");
    const merged = readFileSync(sheet, "utf8");
    expect(merged).toContain("place a at (100, 100)");
    expect(merged).toContain("node c");
  });

  it("reports partial imports with source positions and exit 1", () => {
    const dir = folder("partial");
    writeFileSync(
      join(dir, "x.puml"),
      "@startuml\n[A] --> [B]\nthis is not plantuml at all ???\n@enduml\n",
    );
    const result = mdg(dir, "import", "x.puml");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("x.puml:3:1: warning import.syntax");
    expect(existsSync(join(dir, "x.meltemi"))).toBe(true);
  });

  it("writes nothing with --check", () => {
    const dir = folder("check");
    writeFileSync(join(dir, "c.mmd"), "flowchart LR\n  a --> b\n");
    const result = mdg(dir, "import", "c.mmd", "--check");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Would import c.mmd → c.meltemi (complete)");
    expect(existsSync(join(dir, "c.meltemi"))).toBe(false);
  });

  it("prints JSON", () => {
    const dir = folder("json");
    writeFileSync(join(dir, "s.mmd"), "sequenceDiagram\n  A->>B: hi\n");
    const result = mdg(dir, "import", "s.mmd", "--json", "--out", "out.meltemi");
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toMatchObject({
      source: "s.mmd",
      output: "out.meltemi",
      status: "complete",
      written: true,
    });
    expect(json.diagrams[0].type).toBe("sequence");
    expect(existsSync(join(dir, "out.meltemi"))).toBe(true);
  });

  it("reads includes inside the folder and forces the format", () => {
    const dir = folder("includes");
    cpSync(join(REPO_ROOT, "corpus/import/plantuml"), dir, { recursive: true });
    const result = mdg(dir, "import", "deployment.puml", "--out", "deploy.meltemi");
    expect(result.code).toBe(0);
    expect(readFileSync(join(dir, "deploy.meltemi"), "utf8")).toContain(
      'data ordersdb "Orders DB"',
    );
    const missing = mdg(dir, "import", "include-missing.puml", "--out", "missing.meltemi");
    expect(missing.code).toBe(1);
    expect(missing.stdout).toContain("import.include");
    // A Markdown name with raw Mermaid inside: the extension says Markdown, --from corrects it.
    writeFileSync(join(dir, "notes.md"), "flowchart LR\n  a --> b\n");
    expect(mdg(dir, "import", "notes.md").code).toBe(2);
    expect(mdg(dir, "import", "notes.md", "--from", "mermaid").code).toBe(0);
  });

  it("refuses unsupported input and bad options with exit 2", () => {
    const dir = folder("usage");
    writeFileSync(join(dir, "c.mmd"), "classDiagram\n  A <|-- B\n");
    const unsupported = mdg(dir, "import", "c.mmd");
    expect(unsupported.code).toBe(2);
    expect(unsupported.stdout).toContain("import.unsupported-diagram");
    expect(existsSync(join(dir, "c.meltemi"))).toBe(false);
    expect(mdg(dir, "import").code).toBe(2);
    expect(mdg(dir, "import", "c.mmd", "--from", "dot").code).toBe(2);
    expect(mdg(dir, "import", "c.mmd", "--force", "--merge").code).toBe(2);
    expect(mdg(dir, "import", "missing.mmd").code).toBe(2);
    expect(mdg(dir, "import", "--help").stdout).toContain("Usage: import <file or folder>");
  });
});

describe("meltemi-diagrams import of a folder", () => {
  const sources = (name: string) => {
    const dir = folder(name);
    mkdirSync(join(dir, "flows"), { recursive: true });
    mkdirSync(join(dir, "sequences", "includes"), { recursive: true });
    mkdirSync(join(dir, ".hidden"), { recursive: true });
    writeFileSync(join(dir, "flows", "checkout.mmd"), "flowchart LR\n  a[Client] --> b[API]\n");
    writeFileSync(join(dir, "README.md"), "# Notes\n\nNo diagrams here.\n");
    writeFileSync(
      join(dir, "sequences", "includes", "people.iuml"),
      "actor Customer\nparticipant API\n",
    );
    writeFileSync(
      join(dir, "sequences", "pay.puml"),
      "@startuml\n!include includes/people.iuml\nCustomer -> API: Pay\n@enduml\n",
    );
    writeFileSync(join(dir, ".hidden", "skip.mmd"), "flowchart LR\n  x --> y\n");
    return dir;
  };

  it("imports every diagram file below it, keeping folders under --out", () => {
    const dir = sources("tree");
    const { code, stdout } = mdg(dir, "import", ".", "--out", "sheets");
    expect(code).toBe(0);
    expect(stdout).toContain(
      "Imported 2 files from .: 2 complete, 0 partial, 1 without diagrams\n",
    );
    expect(existsSync(join(dir, "sheets", "flows", "checkout.meltemi"))).toBe(true);
    const pay = readFileSync(join(dir, "sheets", "sequences", "pay.meltemi"), "utf8");
    expect(pay).toContain("diagram pay: sequence");
    expect(existsSync(join(dir, "sheets", "sequences", "includes"))).toBe(false);
    expect(existsSync(join(dir, "sheets", "README.meltemi"))).toBe(false);
    expect(existsSync(join(dir, "sheets", ".hidden"))).toBe(false);
  });

  it("refuses to replace sheets, merges on request, and reports JSON", () => {
    const dir = sources("again");
    expect(mdg(dir, "import", ".").code).toBe(0);
    expect(existsSync(join(dir, "flows", "checkout.meltemi"))).toBe(true);
    const again = mdg(dir, "import", ".");
    expect(again.code).toBe(2);
    expect(again.stdout).toContain("2 not replaced");
    expect(mdg(dir, "import", ".", "--merge").code).toBe(0);
    const json = JSON.parse(mdg(dir, "import", ".", "--check", "--json").stdout);
    expect(json.files.map((f: { source: string }) => f.source)).toEqual([
      "flows/checkout.mmd",
      "sequences/pay.puml",
    ]);
    expect(json.skipped).toBe(1);
    expect(mdg(dir, "import", ".", "--from", "mermaid").code).toBe(2);
    expect(mdg(folder("none"), "import", ".").code).toBe(2);
  });
});
