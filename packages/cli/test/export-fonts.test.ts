import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { run } from "../src/index.js";

async function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

const ANNOTATIONS = "corpus/valid/edge/annotations.meltemi";

describe("meltemi-diagrams export --fonts", () => {
  it("embeds fonts by default", async () => {
    const { code, stdout } = await mdg("export", ANNOTATIONS, "--stdout");
    expect(code).toBe(0);
    expect(stdout.startsWith("<svg")).toBe(true);
    expect(stdout).toContain("@font-face{");
  });

  it("names fonts with the system policy and outlines with the outlined policy", async () => {
    const system = await mdg("export", ANNOTATIONS, "--stdout", "--fonts", "system");
    expect(system.stdout).not.toContain("<style");
    const outlined = await mdg("export", ANNOTATIONS, "--stdout", "--fonts", "outlined");
    expect(outlined.stdout).not.toContain("<text");
    expect(outlined.stdout).toContain("aria-label=");
  });

  it("rejects an unknown policy", async () => {
    const { code, stderr } = await mdg("export", ANNOTATIONS, "--stdout", "--fonts", "bogus");
    expect(code).toBe(2);
    expect(stderr).toContain("embedded, outlined, system");
  });
});
