// Native skill+MCP plugins for the local image. Only its separate entry point supplies deps.local.
// Canonical reference files come from the image build; instance addresses are bound at request time.
import type { Ctx } from "./context.js";
import { PROJECT_ID } from "./ids.js";
import { json } from "./http.js";

const PREFIX = "/agent-setup/local/";
const PLUGIN = "meltemi-diagrams-local";
const TEXT = new TextEncoder();

export interface LocalPluginPayload {
  readonly version: string;
  readonly revision: string;
  readonly files: Readonly<Record<string, string>>;
}

/** A deterministic ZIP of UTF-8 text, stored without compression (also readable by Python/PowerShell). */
export function pluginZip(files: Readonly<Record<string, string>>): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;
  const crc = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const header = (size: number) => {
    const bytes = new Uint8Array(size);
    return { bytes, view: new DataView(bytes.buffer) };
  };
  const names = Object.keys(files).sort();
  for (const name of names) {
    if (!/^[\w./-]+$/.test(name) || name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error("An unsafe path reached the local plugin packager");
    }
    const path = TEXT.encode(name);
    const data = TEXT.encode(files[name]!);
    const checksum = crc(data);
    const local = header(30 + path.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(12, 33, true); // 1980-01-01, stable across builds.
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, path.length, true);
    local.bytes.set(path, 30);
    const entry = header(46 + path.length);
    entry.view.setUint32(0, 0x02014b50, true);
    entry.view.setUint16(4, 20, true);
    entry.view.setUint16(6, 20, true);
    entry.view.setUint16(8, 0x0800, true);
    entry.view.setUint16(14, 33, true);
    entry.view.setUint32(16, checksum, true);
    entry.view.setUint32(20, data.length, true);
    entry.view.setUint32(24, data.length, true);
    entry.view.setUint16(28, path.length, true);
    entry.view.setUint32(42, offset, true);
    entry.bytes.set(path, 46);
    chunks.push(local.bytes, data);
    central.push(entry.bytes);
    centralSize += entry.bytes.length;
    offset += local.bytes.length + data.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, names.length, true);
  end.view.setUint16(10, names.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.bytes.length);
  let at = 0;
  for (const chunk of [...chunks, ...central, end.bytes]) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

export function localPluginFiles(
  payload: LocalPluginPayload,
  origin: string,
  project: { id: string; url: string },
  client: "claude" | "codex",
): Record<string, string> {
  const port = new URL(origin).port || "80";
  const marketplace = `meltemi-local-${port}`;
  const root = `plugins/${PLUGIN}/`;
  const canonical = payload.files["SKILL.md"];
  if (!canonical?.includes("## Template"))
    throw new Error("The canonical Meltemi skill is missing");
  const files: Record<string, string> = {
    "bundle.json": pretty({
      client,
      origin,
      project,
      version: payload.version,
      revision: payload.revision,
    }),
    [root + ".mcp.json"]: pretty({
      mcpServers: { meltemi: { type: "http", url: `${origin}/mcp` } },
    }),
    [root + "README.md"]:
      `# Meltemi Diagrams locally\n\nThis plugin connects your coding agent to the Meltemi Diagrams instance already running at ${origin}. It bundles the diagramming skill, canonical language references and examples, and a native Streamable HTTP MCP connection. Read the current project, make revision-checked edits, validate and inspect previews together with the person in the browser. No account, credential, host CLI, hooks or second server is used.\n`,
    [root + (client === "claude" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json")]:
      pretty({
        name: PLUGIN,
        version: payload.version,
        description:
          "Draw together in the running local Meltemi Diagrams editor, without authentication.",
        author: { name: "Meltemi" },
        license: "MIT",
        skills: "./skills/",
        mcpServers: "./.mcp.json",
      }),
  };
  if (client === "claude") {
    files[".claude-plugin/marketplace.json"] = pretty({
      name: marketplace,
      metadata: {
        description: "The skill and native MCP connection of this local Meltemi instance.",
      },
      owner: { name: "Meltemi" },
      plugins: [
        {
          name: PLUGIN,
          source: `./plugins/${PLUGIN}`,
          description: "Local collaborative diagramming",
        },
      ],
    });
  } else {
    files[".agents/plugins/marketplace.json"] = pretty({
      name: marketplace,
      interface: { displayName: "Meltemi local" },
      plugins: [
        {
          name: PLUGIN,
          source: { source: "local", path: `./plugins/${PLUGIN}` },
          policy: { installation: "AVAILABLE", authentication: "ON_USE" },
          category: "Productivity",
        },
      ],
    });
  }
  for (const [path, content] of Object.entries(payload.files)) {
    if (path !== "SKILL.md") files[root + "skills/meltemi-diagrams/" + path] = content;
  }
  files[root + "skills/meltemi-diagrams/SKILL.md"] = `---
name: meltemi-diagrams
description: Create, edit and review diagrams as code together with the person in their running local Meltemi Diagrams editor. Use the plugin's native MCP tools for the same project the browser edits.
license: MIT
---

# Meltemi Diagrams, together locally

This plugin belongs to ${origin}, version ${payload.version}, source ${payload.revision}.
The initial project is ${project.id}, open at ${project.url}. Prefer the selected project in the
setup handoff receipt when the person selected another. Never create a replacement project merely
because this one already contains files. There is one local owner, no login, token or API key.

Use the plugin's native meltemi MCP tools. The server already runs at ${origin}/mcp over
Streamable HTTP. Do not start a second server, install a host CLI, run npx, authenticate, or write
duplicate diagram sources to the host filesystem. If native tools are absent, report the plugin
activation step and retain the project/task as a continuation. HTTP calls are not a substitute for
native plugin activation.

1. Call get_project and read_files for the selected project; retain the revision.
2. Understand the request and choose a supported diagram profile from the canonical references below.
3. Apply a small change with write_files, the revision as ifRevision, and one idempotencyKey per
   intended change. Reuse that key for a retry. A revision.mismatch requires reading and merging
   the person's changes, never a blind overwrite. The text remains the source of truth.
4. Call validate, fix errors and relevant warnings, then preview to inspect the actual drawing.
5. Return open_url so the person can see and edit it; their canvas/source edits are read_files'
   next input. Continue co-diagramming in this project.

Available: whoami, list_projects, create_project, get_project, rename_project, read_files,
write_files, validate, upload_image, list_versions, create_version, restore_version, open_url,
preview, inspect_story. For stories, inspect the compiled timeline and preview scene starts and
final-state instants, comparing revisions; preserve other stories and comments. Sharing,
invitations, guest live sessions and publishing are unavailable locally and
answer local.feature-unavailable. Ordinary browser/agent synchronization remains active.

The following template and language/layout rules are generated from the canonical skill. Its CLI
examples illustrate syntax only here: perform editing, validation and drawing through MCP.

${canonical.slice(canonical.indexOf("## Template"))}`;
  return files;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Undefined only for paths outside this local-only setup surface. */
export async function localAgentSetup(ctx: Ctx): Promise<Response | undefined> {
  const path = ctx.url.pathname;
  if (!path.startsWith(PREFIX)) return undefined;
  const local = ctx.deps.local;
  if (!local) return json({ code: "not-found" }, 404);
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD") {
    return json({ code: "request.method" }, 405, { Allow: "GET, HEAD" });
  }
  const name = path.slice(PREFIX.length);
  if (
    !["prompt.md", "manifest.json", "claude-plugin.zip", "codex-plugin.zip", "install.py"].includes(
      name,
    )
  ) {
    return json({ code: "not-found" }, 404);
  }
  const asset = await ctx.deps.assets.fetch(
    new Request(`${local.origin}${PREFIX}plugin-files.json`),
  );
  if (!asset.ok) return json({ code: "local.setup-unavailable" }, 503);
  const payload = (await asset.json()) as LocalPluginPayload;
  const origin = local.origin;
  const project = local.defaultProject;
  const bundles = {
    claude: pluginZip(localPluginFiles(payload, origin, project, "claude")),
    codex: pluginZip(localPluginFiles(payload, origin, project, "codex")),
  };
  const installer = await ctx.deps.assets.fetch(new Request(`${origin}${PREFIX}install.py`));
  if (!installer.ok) return json({ code: "local.setup-unavailable" }, 503);
  const installerBytes = new Uint8Array(await installer.arrayBuffer());
  const manifest = {
    schemaVersion: 1,
    version: payload.version,
    revision: payload.revision,
    origin,
    mcpUrl: `${origin}/mcp`,
    authentication: "none",
    plugin: PLUGIN,
    marketplace: `meltemi-local-${new URL(origin).port || "80"}`,
    defaultProject: project,
    bundles: {
      claude: { url: `${origin}${PREFIX}claude-plugin.zip`, sha256: await sha256(bundles.claude) },
      codex: { url: `${origin}${PREFIX}codex-plugin.zip`, sha256: await sha256(bundles.codex) },
    },
    installer: {
      url: `${origin}${PREFIX}install.py`,
      sha256: await sha256(installerBytes),
      runtime: "Python 3",
    },
    testedClients: { claude: "2.1.312", codex: "0.156.1" },
  };
  let body: Uint8Array<ArrayBuffer>;
  let contentType = "text/plain; charset=utf-8";
  if (name === "manifest.json") {
    body = new Uint8Array(TEXT.encode(pretty(manifest)));
    contentType = "application/json; charset=utf-8";
  } else if (name.endsWith(".zip")) {
    body = name === "claude-plugin.zip" ? bundles.claude : bundles.codex;
    contentType = "application/zip";
  } else if (name === "install.py") {
    body = installerBytes;
  } else {
    const selected = ctx.url.searchParams.get("project");
    if (selected !== null && !PROJECT_ID.test(selected))
      return json({ code: "request.invalid" }, 400);
    const id = selected ?? project.id;
    body = new Uint8Array(
      TEXT.encode(`# Install Meltemi Diagrams' native plugin and MCP connection

The person asked you to install the plugin, then co-diagram in their running local instance.
Instance: ${origin}; version ${payload.version}; source ${payload.revision}.
Selected project: ${id}; browser: ${origin}/?project=${id}.
No authentication, cookie, API token, model provider credential or host Node installation is needed.

1. Identify whether you are Claude Code or Codex. Fetch ${origin}${PREFIX}manifest.json. Inspect
   the instance, version and bundle's SHA-256. Stay on this loopback origin; do not follow redirects.
2. Download ${manifest.installer.url} to a temporary file, inspect it, and verify SHA-256
   ${manifest.installer.sha256}. Use Python 3 already installed on this machine (python3, python
   or py -3), when available. Do not install a package manager or runtime.
3. Run the downloaded script with --client claude (or codex), --origin ${origin},
   --workspace <the person's current project directory>, --project ${id}.
   It verifies the bundle, extracts it under .meltemi/agent-plugins, and registers a real native
   plugin through that client's own plugin CLI. Claude uses local scope; Codex registers the
   local marketplace through its supported CLI. It preserves unrelated configuration, existing
   native trust/approval policies and conflicting Meltemi installations. Never overwrite a conflict.
   If Python is absent, use existing terminal tools instead: download and verify the chosen ZIP
   against its manifest SHA-256, inspect its contents and safely extract to a new directory under
   .meltemi/agent-plugins/<client>. PowerShell has Invoke-WebRequest, Get-FileHash and Expand-Archive;
   macOS/Linux commonly have curl, shasum/sha256sum and unzip. Keep existing files unchanged.
   Read bundle.json and .mcp.json: they must name this exact instance and no credentials. Inspect
   the client's marketplace/plugin list first; an existing name with another source, version,
   endpoint or disabled state is a conflict. Register only this bundle's local marketplace:
   Claude: claude plugin marketplace add <extracted-root> --scope local --json
           claude plugin install ${PLUGIN}@${manifest.marketplace} --scope local --json
           claude plugin list --json
   Codex:  codex plugin marketplace add <extracted-root> --json
           codex plugin add ${PLUGIN}@${manifest.marketplace} --json
           codex plugin list --marketplace ${manifest.marketplace} --json
           codex mcp list --json
   Reuse an identical enabled installation instead of adding it again. Record the selected
   project ${id}, origin, version and bundle digest in a local continuation receipt.
4. Inspect the native installed/enabled result and the handoff. Installation
   alone does not prove the tools are active in this running chat. For Claude, use /reload-plugins
   when supported. Codex may need a new chat/session; retain this project id and the person's
   diagram request, and give the exact continuation instead of claiming active tools.
5. Only after the plugin's native MCP tools are visible, call whoami, get_project and read_files
   for ${id}. Report the plugin/version and actual connection. Then use the plugin's skill:
   write_files with ifRevision and idempotencyKey, validate, preview, open_url. The person can edit
   the same project in the browser. Do not create another project or write duplicate host files.

Do not substitute direct curl/HTTP calls for native plugin/MCP activation. Do not run npx, npm,
mdg login, codex mcp login or ask for a Meltemi token. A client-native plugin trust prompt is the
client's own control; keep it. Repeating setup reuses the identical plugin; a different instance,
version or endpoint is a preserved conflict requiring review. No model call is needed to install.
`),
    );
  }
  return new Response(ctx.request.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(name.endsWith(".zip") ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
