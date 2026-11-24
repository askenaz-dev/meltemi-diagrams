#!/usr/bin/env node
// Starts the Meltemi Diagrams MCP server for the project a client runs this plugin in:
// `mdg mcp --stdio --folder <project>`, with the project's own command line when it has one, and
// with `npx -y @meltemi/diagrams-cli@latest` otherwise. Both run with this Node, without a shell, so
// the same entry works on every system and a folder with spaces needs no quoting. Standard input,
// output and error pass through: the client talks to the server directly (decision 0080).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** A variable the client left unexpanded, such as `${CLAUDE_PROJECT_DIR}`. */
const PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

/** The project's folder: the argument, unless it is missing or a placeholder, else the working one. */
export function projectFolder(argument, cwd = process.cwd()) {
  return resolve(cwd, argument && !PLACEHOLDER.test(argument) ? argument : ".");
}

/** The entry script of the project's own `@meltemi/diagrams-cli`, from the folder upwards. */
export function projectCommandLine(folder, exists = existsSync, read = readFileSync) {
  for (let dir = folder; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", "@meltemi", "diagrams-cli", "package.json");
    if (exists(manifest)) {
      const { bin } = JSON.parse(read(manifest, "utf8"));
      const entry = typeof bin === "string" ? bin : (bin?.mdg ?? bin?.["meltemi-diagrams"]);
      if (entry) return join(dirname(manifest), entry);
    }
    if (dirname(dir) === dir) return undefined;
  }
}

/** npm's own `npx`, installed beside the running Node (Windows, then Unix layouts). */
export function npxCommandLine(node = process.execPath, exists = existsSync) {
  const home = dirname(node);
  return [
    join(home, "node_modules", "npm", "bin", "npx-cli.js"),
    join(home, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ].find((path) => exists(path));
}

/** The arguments Node runs, or undefined when neither command line can be found. */
export function plan(folder, own, npx) {
  const args = ["mcp", "--stdio", "--folder", folder];
  if (own) return [own, ...args];
  if (npx) return [npx, "-y", "@meltemi/diagrams-cli@latest", ...args];
  return undefined;
}

export const NOT_FOUND =
  "meltemi-diagrams plugin: found neither the project's @meltemi/diagrams-cli nor npm's npx beside " +
  "this Node. Install the command line with `npm install --global @meltemi/diagrams-cli`, or add " +
  "@meltemi/diagrams-cli to the project's dependencies, then start the client again.";

function main() {
  const folder = projectFolder(process.argv[2]);
  const own = projectCommandLine(folder);
  const args = plan(folder, own, own ? undefined : npxCommandLine());
  if (!args) {
    process.stderr.write(`${NOT_FOUND}\n`);
    process.exit(1);
  }
  const child = spawn(process.execPath, args, { cwd: folder, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    process.stderr.write(`meltemi-diagrams plugin: ${error.message}\n${NOT_FOUND}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
