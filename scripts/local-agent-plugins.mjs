// The local image carries the canonical skill's reference files, not another hand-maintained copy.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function localAgentFiles(repo) {
  const root = join(repo, "skills", "meltemi-diagrams");
  const files = {};
  function visit(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    )) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), name + "/");
      else if (entry.isFile()) files[name] = readFileSync(join(directory, entry.name), "utf8");
      else throw new Error(`A local plugin source is not a regular file: ${name}`);
    }
  }
  visit(root, "");
  return files;
}

export async function writeLocalAgentAssets({ repo, dist, version }) {
  const revision =
    process.env.MELTEMI_SOURCE_REVISION ||
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{7,64}$/i.test(revision)) throw new Error("Invalid local source revision");
  const destination = join(dist, "agent-setup", "local");
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    join(destination, "plugin-files.json"),
    JSON.stringify({ version, revision, files: localAgentFiles(repo) }) + "\n",
  );
  const installer = join(repo, "scripts", "local-agent-install.py");
  writeFileSync(join(destination, "install.py"), readFileSync(installer));
  return { destination: dirname(join(destination, "plugin-files.json")), version, revision };
}
