import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Ctx } from "../../cloud/src/context.js";
import {
  localAgentSetup,
  localPluginFiles,
  pluginZip,
  type LocalPluginPayload,
} from "../../cloud/src/local-agent-setup.js";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const origin = "http://127.0.0.1:18788";
const project = { id: "localdefaultproject0", url: `${origin}/?project=localdefaultproject0` };
const payload: LocalPluginPayload = {
  version: "1.11.13",
  revision: "dc0a495",
  files: {
    "SKILL.md": readFileSync(join(repo, "skills/meltemi-diagrams/SKILL.md"), "utf8"),
    "reference/language.md": readFileSync(
      join(repo, "skills/meltemi-diagrams/reference/language.md"),
      "utf8",
    ),
    "examples/sequence.meltemi": readFileSync(
      join(repo, "skills/meltemi-diagrams/examples/sequence.meltemi"),
      "utf8",
    ),
  },
};
const installer = readFileSync(join(repo, "scripts/local-agent-install.py"), "utf8");
const python = process.platform === "win32" ? "python" : "python3";

function context(path: string, method = "GET", local = true): Ctx {
  const request = new Request(origin + path, { method });
  return {
    request,
    url: new URL(request.url),
    deps: {
      ...(local ? { local: { origin, defaultProject: project } } : {}),
      assets: {
        async fetch(request: Request) {
          if (new URL(request.url).pathname.endsWith("/plugin-files.json")) {
            return new Response(JSON.stringify(payload), {
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(installer);
        },
      },
    },
  } as unknown as Ctx;
}

describe("local native agent setup", () => {
  it("binds reproducible client-native bundles and hashes to the instance port without credentials", async () => {
    const response = await localAgentSetup(context("/agent-setup/local/manifest.json"));
    expect(response?.status).toBe(200);
    const manifest = await response!.json();
    expect(manifest.authentication).toBe("none");
    expect(manifest.mcpUrl).toBe(origin + "/mcp");
    expect(manifest.defaultProject).toEqual(project);
    expect(manifest.revision).toBe(payload.revision);
    for (const client of ["claude", "codex"] as const) {
      const zip = await localAgentSetup(context(`/agent-setup/local/${client}-plugin.zip`));
      const bytes = Buffer.from(await zip!.arrayBuffer());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        manifest.bundles[client].sha256,
      );
      expect(
        bytes.equals(Buffer.from(pluginZip(localPluginFiles(payload, origin, project, client)))),
      ).toBe(true);
      const dir = mkdtempSync(join(tmpdir(), "meltemi-plugin-zip-"));
      try {
        const archive = join(dir, "plugin.zip");
        writeFileSync(archive, bytes);
        const result = execFileSync(
          python,
          [
            "-c",
            `import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
root='plugins/meltemi-diagrams-local/'
mcp=json.loads(z.read(root+'.mcp.json')); assert mcp=={'mcpServers':{'meltemi':{'type':'http','url':sys.argv[2]+'/mcp'}}}
print(json.dumps({'names':z.namelist(),'language':z.read(root+'skills/meltemi-diagrams/reference/language.md').decode()}))`,
            archive,
            origin,
          ],
          { encoding: "utf8" },
        );
        const checked = JSON.parse(result);
        expect(checked.language).toBe(payload.files["reference/language.md"]);
        expect(checked.names).toContain(
          client === "claude"
            ? ".claude-plugin/marketplace.json"
            : ".agents/plugins/marketplace.json",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("does not expose setup outside the local entrypoint and refuses writes/internal payload paths", async () => {
    expect(
      (await localAgentSetup(context("/agent-setup/local/prompt.md", "GET", false)))?.status,
    ).toBe(404);
    expect((await localAgentSetup(context("/agent-setup/local/install.py", "POST")))?.status).toBe(
      405,
    );
    expect((await localAgentSetup(context("/agent-setup/local/plugin-files.json")))?.status).toBe(
      404,
    );
    expect(await localAgentSetup(context("/elsewhere"))).toBeUndefined();
    const head = await localAgentSetup(context("/agent-setup/local/claude-plugin.zip", "HEAD"));
    expect(await head!.text()).toBe("");
    expect(Number(head!.headers.get("Content-Length"))).toBeGreaterThan(1000);
  });

  it("keeps the selected project and distinguishes installation from active native tools", async () => {
    const selected = "abcdefghijklmnopqrst";
    const prompt = await (await localAgentSetup(
      context(`/agent-setup/local/prompt.md?project=${selected}`),
    ))!.text();
    expect(prompt).toContain(`Selected project: ${selected}`);
    expect(prompt).toContain("claude plugin install");
    expect(prompt).toContain("codex plugin add");
    expect(prompt).toContain("PowerShell");
    expect(prompt).toContain("new chat/session");
    expect(prompt).toContain("Do not substitute direct curl/HTTP");
    expect(
      (await localAgentSetup(context("/agent-setup/local/prompt.md?project=../../oops")))?.status,
    ).toBe(400);
  });

  it("rejects a ZIP path escape before writing any entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "meltemi-plugin-safe-"));
    try {
      const script = `import importlib.util,io,pathlib,sys,zipfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('installer',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
root=pathlib.Path(sys.argv[2]); b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:
 z.writestr('good.txt','must not be written'); z.writestr('../outside.txt','bad')
try: m.extract_bundle(b.getvalue(),root)
except ValueError: pass
else: raise Exception('unsafe ZIP accepted')
assert not (root/'good.txt').exists(); assert not (root.parent/'outside.txt').exists()
assert m.local_origin('http://127.0.0.1:18788')=='http://127.0.0.1:18788'
assert m.normalized_path('/workspace/plugin') != m.normalized_path('/workspace/plugin-other')
for value in ['http://evil.test:18788','https://127.0.0.1:18788','http://127.0.0.1:18788/path']:
 try: m.local_origin(value)
 except ValueError: pass
 else: raise Exception('unsafe origin accepted')
print('safe')`;
      expect(
        execFileSync(python, ["-c", script, join(repo, "scripts/local-agent-install.py"), dir], {
          encoding: "utf8",
        }).trim(),
      ).toBe("safe");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
