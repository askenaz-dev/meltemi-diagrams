import { describe, expect, it } from "vitest";
import { renderDiagram } from "@meltemi/diagrams-editor";
import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { CLI_VERSION, run } from "../src/index.js";

describe("the editor and the command line", () => {
  it("render the same bytes", () => {
    const sessions = new ProjectSessions({ toolVersion: CLI_VERSION });
    for (const file of ["corpus/valid/edge/annotations.meltemi", "corpus/valid/checkout.meltemi"]) {
      const analysis = sessions.analyze(`${REPO_ROOT.split("\\").join("/")}/${file}`);
      const rendered = renderDiagram(analysis, analysis.diagrams[0]!.id)!;
      let cli = "";
      run(["export", file, "--stdout"], {
        stdout: (t) => (cli += t),
        stderr: () => undefined,
        cwd: REPO_ROOT,
      });
      expect(rendered.svg).toBe(cli);
      expect(rendered.geometry.boxes.size).toBeGreaterThan(0);
    }
  });
});
