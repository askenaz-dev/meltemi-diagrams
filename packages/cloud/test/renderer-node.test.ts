// The local server's engine against the renderer object's (`mcp-local-server`, "The drawing and the
// checking on the machine"): `@meltemi/diagrams-mcp/node` reads the fonts, icons and raster faces
// from the installed packages, the Worker's object from its bundle (`support/renderer.ts` reads the
// bundle's own files). For the same request both answer the same bytes, so a picture an agent sees
// through `mdg mcp` is the one it would see through the endpoint.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { nodeRenderer as localRenderer, nodeEngine } from "@meltemi/diagrams-mcp/node";
import {
  RendererCore,
  memoryPreviewCache,
  type RenderOutcome,
} from "@meltemi/diagrams-mcp/preview";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { TOOL_VERSION, nodeRenderer as bundleRenderer } from "./support/renderer.js";

const ACCEPTANCE = join(REPO_ROOT, "corpus", "acceptance");

function folderFiles(folder: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(folder)
      .filter((name) => name.endsWith(".meltemi"))
      .map((name) => [name, readFileSync(join(folder, name), "utf8")]),
  );
}

function bytesOf(outcome: RenderOutcome): Uint8Array {
  if (!outcome.ok) throw new Error(`not drawn: ${outcome.code} ${outcome.message}`);
  return outcome.bytes;
}

describe("the local engine draws what the renderer object draws", () => {
  const local = localRenderer({ toolVersion: TOOL_VERSION });
  const bundled = bundleRenderer();

  it.each([
    ["flow", "thirty.meltemi", "png", 1280],
    ["flow", "thirty.meltemi", "svg", undefined],
    ["sequence", "thirty.meltemi", "png", 2048],
    ["c4", "cycles.meltemi", "png", 800],
  ] as const)(
    "%s/%s as %s",
    async (folder, file, format, width) => {
      const files = folderFiles(join(ACCEPTANCE, folder));
      expect(Object.keys(files)).toContain(file);
      const request = {
        revision: 1,
        files,
        file,
        format,
        ...(width !== undefined ? { width } : {}),
      };
      const [mine, theirs] = await Promise.all([local.render(request), bundled.render(request)]);
      expect(Buffer.from(bytesOf(mine)).equals(Buffer.from(bytesOf(theirs)))).toBe(true);
      if (mine.ok && theirs.ok) expect(mine.report).toEqual(theirs.report);
    },
    60_000,
  );

  it("checks a project without starting the rasteriser", async () => {
    const core = new RendererCore({
      cache: memoryPreviewCache(),
      engine: () => nodeEngine({ toolVersion: TOOL_VERSION }),
      rasterFonts: () => {
        throw new Error("a check started the rasteriser");
      },
    });
    const checked = await core.validate({ files: folderFiles(join(ACCEPTANCE, "flow")) });
    expect(checked.ok).toBe(true);
  });
});
