// The caller starts its test Compose instance. Only a newly created acceptance project is edited.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD, ROOT } from "./settings.mjs";

const require = createRequire(join(CLOUD, "package.json"));
const { Client, StreamableHTTPClientTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/client")).href
);
const origin =
  process.env.MELTEMI_TEST_ORIGIN ?? `http://127.0.0.1:${process.env.MELTEMI_PORT ?? "8879"}`;
const output = join(ROOT, ".test-output/local-compose-lifecycle");
await mkdir(output, { recursive: true });
const composeProject = `meltemi-restore-${randomUUID().slice(0, 8)}`;
const archiveName = `proof-${randomUUID()}.meltemi-backup`;
const imageAlias = `meltemi-local-proof:${randomUUID()}`;
const override = join(output, "restore-compose.json");
const restoredCompose = [
  "compose",
  "-f",
  join(ROOT, "compose.yaml"),
  "-f",
  override,
  "-p",
  composeProject,
];
const report = { origin, startedAt: new Date().toISOString(), restoredProject: composeProject };

function docker(args) {
  const result = spawnSync("docker", args, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180000,
  });
  if (result.status !== 0)
    throw new Error(
      `Docker test command failed: ${args.join(" ")}\n${result.stderr}\n${result.stdout}`,
    );
  return result.stdout.trim();
}
async function ready() {
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${origin}/healthz`);
      if (r.ok) return await r.json();
    } catch {
      /* starting */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Compose instance did not become ready.");
}
async function connect() {
  const client = new Client({ name: "compose-lifecycle", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
  return client;
}
let client;
let snapshot;
let project;
let primaryStopped = false;
try {
  const before = await ready();
  assert.throws(
    () =>
      docker([
        "compose",
        "run",
        "--rm",
        "--no-deps",
        "app",
        "backup",
        "/tmp/must-not-back-up-live.meltemi-backup",
      ]),
    /in use/,
    "Another container must not copy live state across a PID namespace",
  );
  report.liveBackupRefused = true;
  client = await connect();
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result.structuredContent));
    return result.structuredContent;
  };
  project = (
    await call("create_project", { name: `Persistence ${randomUUID()}`, template: "flow" })
  ).id;
  let current = await call("read_files", { project });
  const path = Object.keys(current.files).find((name) => name.endsWith(".meltemi"));
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const uploaded = await call("upload_image", {
    project,
    path: "assets/pixel.png",
    data: image.toString("base64"),
  });
  current = await call("read_files", { project });
  await call("write_files", {
    project,
    files: { [path]: `${current.files[path]}\n// Persistent acceptance source\n` },
    binaries: { "assets/pixel.png": uploaded.hash },
    ifRevision: current.revision,
  });
  await call("create_version", { project, label: "Before restart" });
  snapshot = await call("read_files", { project });
  const versions = await call("list_versions", { project });
  const verify = async () => {
    const health = await ready();
    assert.deepEqual(health.defaultProject, before.defaultProject);
    const response = await client.callTool({ name: "read_files", arguments: { project } });
    assert.deepEqual(response.structuredContent, snapshot);
    const saved = await client.callTool({ name: "list_versions", arguments: { project } });
    assert.deepEqual(saved.structuredContent, versions);
    const bytes = new Uint8Array(
      await (await fetch(`${origin}/api/projects/${project}/blobs/${uploaded.hash}`)).arrayBuffer(),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), uploaded.hash);
  };
  await client.close();
  docker(["compose", "restart", "app"]);
  await ready();
  client = await connect();
  await verify();
  report.restart = "passed";
  await client.close();
  docker(["compose", "stop", "app"]);
  primaryStopped = true;
  const volume = `${output}:/backups`;
  const imageId = docker(["compose", "images", "-q", "app"]);
  docker(["image", "tag", imageId, imageAlias]);
  await writeFile(override, JSON.stringify({ services: { app: { image: imageAlias } } }));
  docker([
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    volume,
    "app",
    "backup",
    `/backups/${archiveName}`,
  ]);
  docker([
    ...restoredCompose,
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    volume,
    "app",
    "restore",
    `/backups/${archiveName}`,
  ]);
  docker([...restoredCompose, "up", "-d", "--no-build"]);
  await ready();
  client = await connect();
  await verify();
  report.restore = "passed";
  await client.close();
  client = undefined;
  docker([...restoredCompose, "down", "--volumes"]);
  docker(["compose", "up", "-d", "--no-build"]);
  primaryStopped = false;
  await ready();
  report.finishedAt = new Date().toISOString();
  report.project = project;
  console.log(
    "PASS: Compose restart and fresh-volume backup/restore preserve source, versions, room state and binary hashes.",
  );
} finally {
  if (client) await client.close();
  try {
    docker([...restoredCompose, "down", "--volumes"]);
  } catch {
    /* preserve original test failure */
  }
  if (primaryStopped) docker(["compose", "up", "-d", "--no-build"]);
  try {
    docker(["image", "rm", imageAlias]);
  } catch {
    /* no image was tagged before an early failure */
  }
  if (project)
    await fetch(`${origin}/api/projects/${project}`, {
      method: "DELETE",
      headers: { Origin: origin },
    });
  await writeFile(join(output, "summary.json"), JSON.stringify(report, null, 2));
}
