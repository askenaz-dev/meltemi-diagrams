import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run as cli } from "@meltemi/diagrams-cli";
import { templateManifest } from "@meltemi/diagrams-project";
import { REPO_ROOT, TOOL_VERSION } from "./corpus.js";

export { TOOL_VERSION };

/** The purchase reference example as a project in a scratch folder. */
export function purchaseProject(folder: string): string {
  const project = join(folder, "purchase");
  cpSync(join(REPO_ROOT, "packages", "cli", "templates", "purchase"), project, { recursive: true });
  writeFileSync(
    join(project, "project.json"),
    templateManifest("purchase", "purchase", { toolVersion: TOOL_VERSION, languageVersion: "0.2" }),
  );
  return project;
}

/** Runs the CLI and returns what it printed; throws on failure. */
export function mdg(...args: string[]): string {
  let out = "";
  const code = cli(args, { stdout: (t) => (out += t), stderr: (t) => (out += t), cwd: REPO_ROOT });
  if (code !== 0) throw new Error(`meltemi-diagrams ${args.join(" ")} exited ${code}:\n${out}`);
  return out;
}

/** The browser a CLI capture names, such as `Edg/155.0.4283.45`. */
export const browserOf = (output: string) =>
  /\(([^()]+\/[\d.]+)[^()]*\)/.exec(output)?.[1] ?? "unknown";
