import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

const annotations = "corpus/valid/edge/annotations.meltemi";

describe("meltemi-diagrams export --theme", () => {
  it("renders with a built-in override", () => {
    const { code, stdout } = mdg("export", annotations, "--theme", "technical.dark", "--stdout");
    expect(code).toBe(0);
    expect(stdout).toContain('fill="#07111F"');
    expect(stdout).toContain("meltemi-wind");
  });

  it("warns on an unknown theme and still exports", () => {
    const { code, stdout, stderr } = mdg("export", annotations, "--theme", "corporate", "--stdout");
    expect(code).toBe(0);
    expect(stderr).toContain("warning layout.unknown-theme");
    expect(stdout.startsWith("<svg")).toBe(true);
  });

  it("resolves a theme defined in the exported file", () => {
    const { code, stdout } = mdg("export", "corpus/valid/edge/themed.meltemi", "--stdout");
    expect(code).toBe(0);
    expect(stdout).toContain("Konfío · Meltemi Diagrams");
    expect(stdout).toContain('stop-color="#6a4fd0"');
  });

  it("uses the project's default theme for diagrams without one", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/projects/valid/commerce/diagrams/overview.meltemi",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).not.toContain("warning");
    expect(stdout.startsWith("<svg")).toBe(true);
    expect(stdout).toContain('fill="#07111F"');
    expect(stdout).toContain(">Commerce · Meltemi Diagrams</text>");
    expect(stdout).toContain('stroke-dasharray="5 4"');
    expect(stdout).toContain("<pattern ");
  });

  it("keeps a diagram's own theme over the project's", () => {
    const { code, stdout } = mdg(
      "export",
      "corpus/projects/valid/commerce/diagrams/payment.meltemi",
      "--stdout",
      "--fonts",
      "system",
    );
    expect(code).toBe(0);
    expect(stdout).toContain(">Meltemi Diagrams</text>");
  });

  it("lists the option in the help", () => {
    expect(mdg("--help").stdout).toContain("--theme <name>");
  });
});
