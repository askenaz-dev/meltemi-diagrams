// Real native client installation, in disposable configuration folders, without a model call.
// pnpm exec tsx --conditions=@meltemi/diagrams-source scripts/check-local-agent-plugins.ts
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { localAgentFiles } from "./local-agent-plugins.mjs";
import { localAgentSetup } from "../packages/cloud/src/local-agent-setup.js";
import type { Ctx } from "../packages/cloud/src/context.js";

const root = process.cwd();
const evidence = mkdtempSync(join(tmpdir(), "meltemi-native-plugin-"));
const installer = readFileSync(join(root, "scripts/local-agent-install.py"), "utf8");
const version = JSON.parse(
  readFileSync(join(root, "packages/playground/package.json"), "utf8"),
).version;
const payload = { version, revision: "dc0a495", files: localAgentFiles(root) };
let origin = "";
const server = createServer((request, out) => {
  void (async () => {
    const web = new Request(origin + request.url, { method: request.method });
    const ctx = {
      request: web,
      url: new URL(web.url),
      deps: {
        local: {
          origin,
          defaultProject: {
            id: "localdefaultproject0",
            url: origin + "/?project=localdefaultproject0",
          },
        },
        assets: {
          async fetch(request: Request) {
            return new Response(
              request.url.endsWith("plugin-files.json") ? JSON.stringify(payload) : installer,
            );
          },
        },
      },
    } as unknown as Ctx;
    const answer = await localAgentSetup(ctx);
    out.writeHead(answer?.status ?? 404, answer ? Object.fromEntries(answer.headers) : {});
    out.end(answer ? Buffer.from(await answer.arrayBuffer()) : undefined);
  })().catch((error) => {
    out.writeHead(500);
    out.end(String(error));
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
origin = `http://127.0.0.1:${address.port}`;
const execute = promisify(execFile);
const python = process.platform === "win32" ? "python" : "python3";
const results = [];
try {
  for (const client of ["codex", "claude"] as const) {
    const workspace = join(evidence, client);
    const codexHome = join(workspace, "codex-home");
    const claudeHome = join(workspace, "claude-home");
    mkdirSync(codexHome, { recursive: true });
    mkdirSync(claudeHome, { recursive: true });
    mkdirSync(join(workspace, ".claude"), { recursive: true });
    writeFileSync(
      join(codexHome, "config.toml"),
      '[mcp_servers.unrelated]\nurl = "http://127.0.0.1:1/mcp"\nenabled = false\n',
    );
    writeFileSync(
      join(workspace, ".claude/settings.local.json"),
      '{"permissions":{"deny":["Bash(do-not-change)"]}}\n',
    );
    const env = {
      ...process.env,
      CODEX_HOME: codexHome,
      CLAUDE_CONFIG_DIR: claudeHome,
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };
    const args = [
      join(root, "scripts/local-agent-install.py"),
      "--client",
      client,
      "--origin",
      origin,
      "--workspace",
      workspace,
    ];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await execute(python, args, { env, timeout: 120_000, maxBuffer: 1024 * 1024 });
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.installed, true);
      assert.equal(parsed.nativeClientState.enabled, true);
      writeFileSync(join(workspace, `attempt-${attempt}.json`), result.stdout);
    }
    assert.match(readFileSync(join(codexHome, "config.toml"), "utf8"), /mcp_servers.unrelated/);
    assert.deepEqual(
      JSON.parse(readFileSync(join(workspace, ".claude/settings.local.json"), "utf8")).permissions,
      { deny: ["Bash(do-not-change)"] },
    );
    // Preserve an explicit native disable, rather than silently enabling an existing installation.
    if (client === "codex") {
      const config = join(codexHome, "config.toml");
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(/enabled = true/g, "enabled = false"),
      );
    } else {
      const config = join(workspace, ".claude/settings.local.json");
      const settings = JSON.parse(readFileSync(config, "utf8"));
      settings.enabledPlugins[`meltemi-diagrams-local@meltemi-local-${address.port}`] = false;
      writeFileSync(config, JSON.stringify(settings));
    }
    await assert.rejects(
      () => execute(python, args, { env, timeout: 120_000 }),
      /existing Meltemi plugin is disabled/,
    );
    results.push({
      client,
      installed: true,
      repeat: "reused",
      unrelatedSettings: "preserved",
      disabledConflict: "preserved",
    });
  }
  writeFileSync(join(evidence, "summary.json"), JSON.stringify({ origin, results }, null, 2));
  console.log(JSON.stringify({ evidence, results }, null, 2));
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
