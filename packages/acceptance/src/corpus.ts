import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { toProjectPath } from "@meltemi/diagrams-project";
import { REPO_ROOT } from "../../../test-support/corpus.js";

export { REPO_ROOT };

/** The version of the command line, which new projects pin and project sessions present. */
export const TOOL_VERSION = (
  JSON.parse(readFileSync(join(REPO_ROOT, "packages", "cli", "package.json"), "utf8")) as {
    version: string;
  }
).version;

/** The profiles the acceptance corpus covers, each in its folder of `corpus/acceptance/`. */
export const PROFILES = ["flow", "sequence", "c4", "free"] as const;
export type Profile = (typeof PROFILES)[number];

export const ACCEPTANCE_ROOT = join(REPO_ROOT, "corpus", "acceptance");

/** A sheet of the acceptance corpus. */
export interface Sheet {
  readonly profile: Profile;
  /** `<profile>/<file>` without `.meltemi`, such as `flow/cycles`. */
  readonly name: string;
  /** The absolute path in the project form (forward slashes). */
  readonly path: string;
  readonly text: string;
}

/** The `.meltemi` files below a folder, recursively, sorted. */
export function meltemiFiles(folder: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules" && !entry.startsWith(".")) visit(path);
      } else if (entry.endsWith(".meltemi")) out.push(toProjectPath(path));
    }
  };
  visit(folder);
  return out;
}

/** Every valid sheet of the acceptance corpus, by profile. */
export function acceptanceSheets(): Sheet[] {
  return PROFILES.flatMap((profile) =>
    meltemiFiles(join(ACCEPTANCE_ROOT, profile)).map((path) => ({
      profile,
      name: relative(ACCEPTANCE_ROOT, path)
        .split("\\")
        .join("/")
        .replace(/\.meltemi$/, ""),
      path,
      text: readFileSync(path, "utf8"),
    })),
  );
}

/** Project sessions over the local files, as the CLI uses them. */
export function projectSessions(): ProjectSessions {
  return new ProjectSessions({ toolVersion: TOOL_VERSION });
}

/**
 * Every sheet the label target covers: the valid corpus and projects, the acceptance corpus, the
 * templates of `init` and the examples.
 */
export function labelTargetFiles(): string[] {
  return [
    ...meltemiFiles(join(REPO_ROOT, "corpus", "valid")),
    ...meltemiFiles(join(REPO_ROOT, "corpus", "projects", "valid")),
    ...PROFILES.flatMap((p) => meltemiFiles(join(ACCEPTANCE_ROOT, p))),
    ...meltemiFiles(join(REPO_ROOT, "packages", "cli", "templates")),
    ...meltemiFiles(join(REPO_ROOT, "examples")),
    ...meltemiFiles(join(REPO_ROOT, "gallery")),
  ];
}
