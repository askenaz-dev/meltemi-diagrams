// Run the built image with --network none: even bootstrap must work without an external route.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD, ROOT } from "./settings.mjs";
import { startLocal } from "./runtime.mjs";

const require = createRequire(join(CLOUD, "package.json"));
const { Client, StreamableHTTPClientTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/client")).href
);
const origin = "http://127.0.0.1:8788";
const app = await startLocal({
  ...process.env,
  MELTEMI_ORIGIN: origin,
  MELTEMI_LISTEN_PORT: "8788",
  MELTEMI_BIND: "127.0.0.1",
  MELTEMI_DATA: "/tmp/meltemi-offline-state",
});
const client = new Client({ name: "compose-offline-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.structuredContent)}`);
    return result;
  };
  assert.equal((await client.listTools()).tools.length, 27);
  const project = (await call("create_project", { name: "Offline proof", template: "flow" }))
    .structuredContent.id;
  const read = (await call("read_files", { project })).structuredContent;
  const path = Object.keys(read.files).find((name) => name.endsWith(".meltemi"));
  await call("write_files", {
    project,
    files: { [path]: `${read.files[path]}\n// Written without a network\n` },
    ifRevision: read.revision,
  });
  await call("validate", { project });
  for (const format of ["svg", "png"]) await call("preview", { project, path, format });
  // Exercise the newly delivered profile through the same local Worker and renderer, offline.
  const ganttPath = "diagrams/gantt.meltemi";
  const ganttSource = await readFile(
    join(ROOT, "skills/meltemi-diagrams/examples/gantt.meltemi"),
    "utf8",
  );
  const latest = (await call("read_files", { project })).structuredContent;
  await call("write_files", {
    project,
    files: { [ganttPath]: ganttSource },
    ifRevision: latest.revision,
  });
  assert.equal((await call("validate", { project, path: ganttPath })).structuredContent.errors, 0);
  const ganttSvg = await call("preview", { project, path: ganttPath, format: "svg" });
  const drawnGantt = ganttSvg.content.find((item) => item.type === "text")?.text ?? "";
  assert.match(drawnGantt, /^<svg/);
  assert.ok(drawnGantt.includes("Mobile app launch") && drawnGantt.includes("Market scan"));
  const ganttPng = await call("preview", { project, path: ganttPath, format: "png", width: 640 });
  const ganttImage = ganttPng.content.find((item) => item.type === "image");
  assert.equal(ganttImage?.mimeType, "image/png");
  assert.equal(Buffer.from(ganttImage.data, "base64").readUInt32BE(16), 640);
  const manifest = await (await fetch(`${origin}/agent-setup/local/manifest.json`)).json();
  assert.equal(manifest.origin, origin);
  for (const clientName of ["claude", "codex"]) {
    const response = await fetch(`${origin}/agent-setup/local/${clientName}-plugin.zip`);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 1000);
  }
  console.log(
    "PASS: network-none bootstrap, project write, validation, flow/Gantt SVG/PNG and both plugin bundles.",
  );
} finally {
  await client.close();
  await app.stop();
}
