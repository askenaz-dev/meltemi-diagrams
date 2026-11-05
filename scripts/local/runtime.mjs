import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD, settings, lockInstance, validateInstanceMetadata } from "./settings.mjs";
import { maintain as dispatchMaintenance } from "./maintenance.mjs";

const cloudRequire = createRequire(join(CLOUD, "package.json"));

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const keep = (chunk) => {
      output = (output + chunk.toString()).slice(-16000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? done() : fail(new Error(`Local initialization failed (${code}): ${output}`)),
    );
  });
}

export async function startLocal(env = process.env) {
  const config = settings(env);
  const unlock = await lockInstance(config.data);
  let worker;
  let timer;
  let closing;
  let maintenance;
  let outbound;
  const readyFile = join(config.data, "ready.json");
  const stop = () =>
    (closing ??= (async () => {
      clearInterval(timer);
      await rm(readyFile, { force: true });
      try {
        await maintenance;
        if (worker) await worker.dispose();
        if (outbound) await outbound.close();
      } finally {
        await unlock();
      }
    })());
  try {
    // No inherited developer credential or dev-vars file is used by this separate configuration.
    for (const name of Object.keys(process.env))
      if (/^(CLOUDFLARE|CF)_/.test(name)) delete process.env[name];
    Object.assign(process.env, {
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_SEND_ERROR_REPORTS: "false",
      WRANGLER_HIDE_BANNER: "true",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
      CI: "1",
      WRANGLER_LOG_PATH: join(config.data, "runtime/logs"),
      WRANGLER_REGISTRY_PATH: join(config.data, "runtime/registry"),
    });
    const manifest = JSON.parse(await readFile(join(CLOUD, "package.json"), "utf8"));
    const metadataFile = join(config.data, "instance.json");
    let metadata;
    try {
      metadata = JSON.parse(await readFile(metadataFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (metadata !== undefined) validateInstanceMetadata(metadata);
    if (metadata && metadata.origin !== config.origin)
      throw new Error(
        "This volume belongs to another local origin. Use its original MELTEMI_PORT or restore to a fresh instance.",
      );
    const { experimental_readRawConfig, unstable_startWorker } = cloudRequire("wrangler");
    const wranglerRequire = createRequire(cloudRequire.resolve("wrangler"));
    const { MockAgent } = wranglerRequire("undici");
    outbound = new MockAgent();
    outbound.disableNetConnect();
    const original = experimental_readRawConfig({
      config: join(CLOUD, "wrangler.local.jsonc"),
    }).rawConfig;
    const local = {
      ...original,
      main: resolve(CLOUD, original.main),
      assets: { ...original.assets, directory: resolve(CLOUD, original.assets.directory) },
      alias: Object.fromEntries(
        Object.entries(original.alias ?? {}).map(([key, value]) => [key, resolve(CLOUD, value)]),
      ),
      d1_databases: original.d1_databases.map((db) => ({
        ...db,
        migrations_dir: resolve(CLOUD, db.migrations_dir ?? "migrations"),
      })),
      vars: { ...original.vars, ORIGIN: config.origin },
    };
    await mkdir(join(config.data, "runtime"), { recursive: true });
    const configPath = join(config.data, "runtime/wrangler.json");
    await writeFile(configPath, JSON.stringify(local));
    const state = join(config.data, "state");
    const wrangler = resolve(dirname(cloudRequire.resolve("wrangler")), "../bin/wrangler.js");
    await run(process.execPath, [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      state,
    ]);
    worker = await unstable_startWorker({
      config: configPath,
      envFiles: [],
      dev: {
        remote: false,
        persist: state,
        watch: false,
        liveReload: false,
        testScheduled: false,
        logLevel: "error",
        registry: undefined,
        server: { hostname: config.bind, port: config.port, secure: false },
        inspector: false,
        mockFetch: outbound,
      },
    });
    await worker.ready;
    const sessionResponse = await worker.fetch(`${config.origin}/api/session`);
    const session = await sessionResponse.json();
    if (
      !sessionResponse.ok ||
      session.mode !== "local-single-user" ||
      !session.defaultProject?.id
    ) {
      throw new Error("The local workspace did not initialize; readiness has not been published.");
    }
    await writeFile(
      metadataFile,
      JSON.stringify({ ...metadata, format: 1, origin: config.origin, version: manifest.version }),
    );
    await writeFile(
      readyFile,
      JSON.stringify({ origin: config.origin, port: config.port, version: manifest.version }),
    );
    const maintain = () =>
      (maintenance ??= dispatchMaintenance(configPath, state)
        .catch(() => console.error("Local maintenance failed; it will be retried."))
        .finally(() => {
          maintenance = undefined;
        }));
    await maintain();
    timer = setInterval(maintain, 7 * 24 * 60 * 60 * 1000);
    console.log(
      `\nMeltemi Diagrams ${manifest.version} is ready.\nEditor: ${config.origin}/\nMCP: ${config.origin}/mcp (no authentication)\n\nInstall the Meltemi Diagrams plugin and its local MCP using ${config.origin}/agent-setup/local/prompt.md, then diagram with me in project ${session.defaultProject.id}.\n`,
    );
    return { ...config, worker, session, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const app = await startLocal();
  process.once("SIGINT", () => void app.stop());
  process.once("SIGTERM", () => void app.stop());
}
