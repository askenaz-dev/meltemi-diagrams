import { createRequire } from "node:module";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { CLOUD } from "./settings.mjs";

const cloudRequire = createRequire(join(CLOUD, "package.json"));

/** The launcher owns this dispatch; no HTTP route or scheduling credential is exposed. */
export async function maintain(configPath, state) {
  const { getPlatformProxy } = cloudRequire("wrangler");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const maintenanceConfig = join(configPath, "../maintenance.json");
  await writeFile(
    maintenanceConfig,
    JSON.stringify({
      name: config.name,
      compatibility_date: config.compatibility_date,
      d1_databases: config.d1_databases,
      r2_buckets: config.r2_buckets,
    }),
  );
  const proxy = await getPlatformProxy({
    configPath: maintenanceConfig,
    // The CLI/startWorker append v3; getPlatformProxy accepts the resource root itself.
    persist: { path: join(state, "v3") },
    remoteBindings: false,
    envFiles: [],
  });
  try {
    const { maintainState } = await tsImport(
      pathToFileURL(join(CLOUD, "src/maintenance.ts")).href,
      import.meta.url,
    );
    await maintainState(proxy.env);
  } finally {
    await proxy.dispose();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await maintain(process.argv[2], process.argv[3]);
  console.log("Local maintenance completed.");
}
