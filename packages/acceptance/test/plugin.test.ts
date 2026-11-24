// `agent-plugin`: the public plugin's folder, the repository's marketplaces, one identity in both
// manifests, their versions, the MCP entry and its launcher.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { DIAGRAM_TYPES } from "@meltemi/diagrams-model";
import { REPO_ROOT } from "../src/corpus.js";

const PLUGIN = join(REPO_ROOT, "plugins", "meltemi-diagrams");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const claude = () => json(join(PLUGIN, ".claude-plugin", "plugin.json"));
const codex = () => json(join(PLUGIN, ".codex-plugin", "plugin.json"));
const LAUNCHER = join(PLUGIN, "bin", "mcp.mjs");

/** Relative paths of every file and link under a folder, sorted. */
function tree(dir: string): string[] {
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (lstatSync(path).isDirectory()) visit(path);
      else found.push(relative(dir, path).split("\\").join("/"));
    }
  };
  visit(dir);
  return found;
}

/** Every string value of a JSON value. */
const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

describe("the plugin's folder", () => {
  it("holds both manifests, the MCP entry, its launcher, a README and the canonical skill", () => {
    for (const path of [
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "bin/mcp.mjs",
      "README.md",
      "skills/meltemi-diagrams/SKILL.md",
    ]) {
      expect(existsSync(join(PLUGIN, path)), path).toBe(true);
    }
    const canonical = join(REPO_ROOT, "skills", "meltemi-diagrams");
    const copy = join(PLUGIN, "skills", "meltemi-diagrams");
    expect(tree(copy), "run pnpm skills:sync").toEqual(tree(canonical));
    for (const file of tree(canonical)) {
      expect(readFileSync(join(copy, file)), file).toEqual(readFileSync(join(canonical, file)));
    }
  });

  it("holds no link and names no path outside the folder", () => {
    for (const file of tree(PLUGIN)) {
      expect(lstatSync(join(PLUGIN, file)).isSymbolicLink(), file).toBe(false);
    }
    for (const manifest of [claude(), codex(), json(join(PLUGIN, ".mcp.json"))]) {
      for (const value of strings(manifest)) {
        expect(value, "a path that leaves the plugin").not.toMatch(/(^|[\\/])\.\.([\\/]|$)/);
      }
    }
  });
});

describe("the repository's marketplaces", () => {
  it("lists the plugin for Claude Code, from its folder, with an owner", () => {
    const market = json(join(REPO_ROOT, ".claude-plugin", "marketplace.json"));
    expect(market.name).toBe("meltemi");
    expect(market.owner?.name).toBeTruthy();
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual(["meltemi-diagrams"]);
    expect(market.plugins[0].source).toBe("./plugins/meltemi-diagrams");
  });

  it("lists the plugin for Codex, from the same folder", () => {
    const market = json(join(REPO_ROOT, ".agents", "plugins", "marketplace.json"));
    expect(market.name).toBe("meltemi");
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual(["meltemi-diagrams"]);
    expect(market.plugins[0].source).toEqual({
      source: "local",
      path: "./plugins/meltemi-diagrams",
    });
  });

  it("names sources that exist in the repository", () => {
    for (const source of ["./plugins/meltemi-diagrams"]) {
      expect(statSync(join(REPO_ROOT, source)).isDirectory()).toBe(true);
    }
  });
});

describe("the manifests", () => {
  it("carry one identity, with a description that names the five profiles", () => {
    const keys = ["name", "description", "author", "license", "homepage", "repository", "keywords"];
    for (const key of keys) expect(codex()[key], key).toEqual(claude()[key]);
    expect(claude().name).toBe("meltemi-diagrams");
    expect(claude().license).toBe("MIT");
    const description: string = claude().description;
    expect(description.length).toBeLessThanOrEqual(500);
    for (const profile of DIAGRAM_TYPES) {
      expect(description.toLowerCase(), profile).toContain(profile.toLowerCase());
    }
  });

  it("give Claude Code no version and Codex the product's", () => {
    expect("version" in claude()).toBe(false);
    const cli = readFileSync(join(REPO_ROOT, "packages", "cli", "src", "cli.ts"), "utf8");
    const version = /export const CLI_VERSION = "([^"]+)";/.exec(cli)![1];
    expect(codex().version, "CLI_VERSION (pnpm release:version writes both)").toBe(version);
  });

  it("give Codex the skills and its interface, and no MCP server", () => {
    const manifest = codex();
    expect(manifest.skills).toBe("./skills/");
    for (const field of [
      "displayName",
      "shortDescription",
      "longDescription",
      "developerName",
      "category",
      "capabilities",
    ]) {
      expect(manifest.interface?.[field], field).toBeTruthy();
    }
    expect(manifest.mcpServers).toBeUndefined();
  });

  it("declare one stdio server for Claude Code, run by the launcher, with no address or secret", () => {
    const entry = json(join(PLUGIN, ".mcp.json"));
    expect(Object.keys(entry.mcpServers)).toEqual(["meltemi"]);
    const server = entry.mcpServers.meltemi;
    expect(server.command).toBe("node");
    expect(server.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/bin/mcp.mjs", "${CLAUDE_PROJECT_DIR}"]);
    expect(JSON.stringify(entry)).not.toMatch(/https?:|port|token|key|mdg_/i);
  });
});

describe("the launcher", () => {
  const load = async () =>
    (await import(pathToFileURL(LAUNCHER).href)) as {
      projectFolder(argument: string | undefined, cwd?: string): string;
      projectCommandLine(folder: string): string | undefined;
      plan(folder: string, own?: string, npx?: string): string[] | undefined;
      NOT_FOUND: string;
    };

  it("takes the folder given, or the working one for a placeholder", async () => {
    const launcher = await load();
    const cwd = join(tmpdir(), "work");
    expect(launcher.projectFolder("${CLAUDE_PROJECT_DIR}", cwd)).toBe(cwd);
    expect(launcher.projectFolder(undefined, cwd)).toBe(cwd);
    expect(launcher.projectFolder(join(cwd, "My diagrams"), cwd)).toBe(join(cwd, "My diagrams"));
  });

  it("prefers the project's command line, then npx, and says what to do with neither", async () => {
    const launcher = await load();
    expect(launcher.plan("/p", "/p/node_modules/cli/bin.js", "/n/npx-cli.js")).toEqual([
      "/p/node_modules/cli/bin.js",
      "mcp",
      "--stdio",
      "--folder",
      "/p",
    ]);
    expect(launcher.plan("/p", undefined, "/n/npx-cli.js")).toEqual([
      "/n/npx-cli.js",
      "-y",
      "@meltemi/diagrams-cli@latest",
      "mcp",
      "--stdio",
      "--folder",
      "/p",
    ]);
    expect(launcher.plan("/p", undefined, undefined)).toBeUndefined();
    expect(launcher.NOT_FOUND).toContain("npm install --global @meltemi/diagrams-cli");
  });

  it("runs the project's own command line in a folder with spaces, without a shell", () => {
    const project = join(mkdtempSync(join(tmpdir(), "plugin-")), "My diagrams");
    const cli = join(project, "node_modules", "@meltemi", "diagrams-cli");
    mkdirSync(cli, { recursive: true });
    writeFileSync(join(cli, "package.json"), JSON.stringify({ bin: { mdg: "bin.mjs" } }));
    writeFileSync(
      join(cli, "bin.mjs"),
      "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n",
    );
    const nested = join(project, "docs");
    mkdirSync(nested);
    const run = spawnSync(process.execPath, [LAUNCHER, nested], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const seen = JSON.parse(run.stdout);
    expect(seen.args).toEqual(["mcp", "--stdio", "--folder", nested]);
    expect(seen.cwd).toBe(nested);
  });
});
