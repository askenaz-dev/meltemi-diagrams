// The preview tool (`mcp-previews`): a picture of the project as it is now, drawn by its renderer
// object with the command line's engine, with the report beside it; the width and the rate it
// refuses, and what a file with an error answers. The renderer's core runs in Node with the files
// the Worker bundles (`support/renderer.ts`), one object per project as the binding gives.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { run } from "@meltemi/diagrams-cli";
import type { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { PREVIEWS_PER_MINUTE } from "../src/mcp/tool.js";
import { call, mcp, ok, refused, type CallResult, type Mcp } from "./support/mcp.js";
import { pngSize } from "./support/renderer.js";

const ANA = "u-ana";
const ACCEPTANCE = join(REPO_ROOT, "corpus", "acceptance");

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** The `.meltemi` files of a folder, by name. */
function folderFiles(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(folder)
    .filter((n) => n.endsWith(".meltemi"))
    .sort()) {
    files[name] = readFileSync(join(folder, name), "utf8");
  }
  return files;
}

/** The command line's export to standard output, in this process. */
async function mdg(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

async function projectOf(
  files: Record<string, string>,
): Promise<{ m: Mcp; client: Client; id: string }> {
  const m = await mcp();
  const client = await m.connect(await m.token(ANA));
  const { id } = ok<{ id: string }>(
    await call(client, "create_project", { name: "Previewed", files }),
  );
  return { m, client, id };
}

const textItems = (result: CallResult) => result.content.filter((item) => item.type === "text");

describe("a preview", () => {
  it("is, as SVG, what export --fonts system writes for the same files", async () => {
    const folder = join(ACCEPTANCE, "flow");
    const { client, id } = await projectOf(folderFiles(folder));
    const cli = await mdg(
      "export",
      join(folder, "cycles.meltemi"),
      "--fonts",
      "system",
      "--stdout",
    );
    expect(cli.code, cli.stderr).toBe(0);

    const result = await call(client, "preview", {
      project: id,
      path: "cycles.meltemi",
      format: "svg",
    });

    expect(result.isError).toBeFalsy();
    const [svg, report] = textItems(result);
    expect(svg?.text).toBe(cli.stdout);
    expect(JSON.parse(report!.text!)).toEqual(result.structuredContent);
    expect(result.structuredContent).toMatchObject({ format: "svg", revision: 1, cached: false });
  }, 60_000);

  it("is by default a PNG 1280 pixels wide, with a report of the revision, the elements and the relations", async () => {
    const { client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const result = await call(client, "preview", { project: id, path: "parallel.meltemi" });

    const images = result.content.filter((item) => item.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/png");
    const png = new Uint8Array(Buffer.from(images[0]!.data!, "base64"));
    expect(pngSize(png)?.width).toBe(1280);
    const report = ok<Record<string, unknown>>(result);
    expect(report).toMatchObject({ format: "png", width: 1280, revision: 1, estimatedFonts: [] });
    expect(report["elements"]).toBeGreaterThan(0);
    expect(report["relations"]).toBeGreaterThan(0);
    expect(
      (report["diagnostics"] as { severity: string }[]).filter((d) => d.severity === "error"),
    ).toEqual([]);
  }, 60_000);

  it("draws a story's frame at the time asked, as export --story --at does", async () => {
    const folder = join(REPO_ROOT, "corpus", "valid", "stories");
    const { client, id } = await projectOf(folderFiles(folder));
    const cli = await mdg(
      "export",
      join(folder, "purchase.meltemi"),
      "--story",
      "purchase",
      "--at",
      "2.4s",
      "--fonts",
      "system",
      "--stdout",
    );
    expect(cli.code, cli.stderr).toBe(0);
    const result = await call(client, "preview", {
      project: id,
      path: "purchase.meltemi",
      story: "purchase",
      at: "2.4s",
      format: "svg",
    });
    expect(textItems(result)[0]?.text).toBe(cli.stdout);
  }, 60_000);

  it("answers a file with an error as diagram.invalid with its diagnostics, and no picture", async () => {
    const { m, client, id } = await projectOf({
      "bad.meltemi": "diagram x: flow {\n  element a ->\n}\n",
    });
    const result = await call(client, "preview", { project: id, path: "bad.meltemi" });
    const error = refused(result);
    expect(error["code"]).toBe("diagram.invalid");
    expect(
      (error["diagnostics"] as { severity: string; line: number }[]).some(
        (d) => d.severity === "error" && d.line >= 1,
      ),
    ).toBe(true);
    expect(result.content.some((item) => item.type === "image")).toBe(false);
    expect((await m.renderers.stats(id)).renders).toBe(0);
  }, 60_000);

  it("reports a layout warning with its line, and draws the picture", async () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const { client, id } = await projectOf({
      "board.meltemi": `language "0.2"\n\ndiagram ideas: free {\n  sticky crowded "${words}"\n\n  placement {\n    place crowded at (120, 120)\n    size crowded (60, 60)\n  }\n}\n`,
    });
    const report = ok<{ diagnostics: { code: string; line: number; severity: string }[] }>(
      await call(client, "preview", { project: id, path: "board.meltemi", format: "svg" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "layout.text-overflow",
        severity: "warning",
        path: "board.meltemi",
      }),
    );
  }, 60_000);

  it("draws a Fontsource family with the fallback and names it", async () => {
    const { client, id } = await projectOf({
      "hand.meltemi": [
        'language "0.2"',
        "",
        "diagram hand: flow {",
        '  web["Web shop"]',
        '  api["Orders API"]',
        "  web -> api",
        "",
        '  style web { font "Caveat" }',
        "}",
        "",
      ].join("\n"),
    });
    const report = ok<{ estimatedFonts: string[] }>(
      await call(client, "preview", { project: id, path: "hand.meltemi" }),
    );
    expect(report.estimatedFonts).toContain("Caveat");
  }, 60_000);

  it("answers the same preview of an unchanged revision from the object's cache, byte-equal", async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const first = await call(client, "preview", { project: id, path: "cycles.meltemi" });
    const renders = (await m.renderers.stats(id)).renders;
    const second = await call(client, "preview", { project: id, path: "cycles.meltemi" });
    expect(second.content[0]?.data).toBe(first.content[0]?.data);
    expect(ok(second)).toMatchObject({ cached: true });
    expect((await m.renderers.stats(id)).renders).toBe(renders);
  }, 60_000);
});

describe("the limits of previews", () => {
  it("refuses a width over 2048 as request.invalid naming the limit, and draws nothing", async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    const result = refused(
      await call(client, "preview", { project: id, path: "cycles.meltemi", width: 4096 }),
    );
    expect(result).toMatchObject({ code: "request.invalid", limit: 2048 });
    expect(String(result["message"])).toContain("2048");
    expect((await m.renderers.stats(id)).renders).toBe(0);
  });

  it("refuses a file that is not one of the project's .meltemi files", async () => {
    const { client, id } = await projectOf({ "notes.md": "# notes" });
    for (const path of ["notes.md", "nothing.meltemi"]) {
      expect(refused(await call(client, "preview", { project: id, path }))["code"]).toBe(
        "request.invalid",
      );
    }
  });

  it(`answers the ${PREVIEWS_PER_MINUTE + 1}st preview of a minute with rate.limited, and draws no picture`, async () => {
    const { m, client, id } = await projectOf(folderFiles(join(ACCEPTANCE, "flow")));
    for (let n = 0; n < PREVIEWS_PER_MINUTE; n++) {
      ok(await call(client, "preview", { project: id, path: "cycles.meltemi", format: "svg" }));
    }
    const renders = (await m.renderers.stats(id)).renders;
    const limited = refused(
      await call(client, "preview", { project: id, path: "nested.meltemi", format: "svg" }),
    );
    expect(limited).toMatchObject({ code: "rate.limited" });
    expect(limited["retryAfter"]).toBeGreaterThan(0);
    expect((await m.renderers.stats(id)).renders).toBe(renders);
    // Other tools are not previews: they go on.
    ok(await call(client, "read_files", { project: id, paths: ["cycles.meltemi"] }));
  }, 60_000);
});
