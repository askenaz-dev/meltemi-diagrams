/**
 * The validation a push prints (`cli-cloud`, "Push"): the diagnostics of the folder's project as
 * `validate <folder>` prints them (the manifest, the limits, plugins, assets, every source with its
 * composition), in the same line format. They do not stop a push (the page shows them too) unless
 * `--strict` asks for it.
 */

import { ProjectSessions } from "@meltemi/diagrams-editor/node";
import { sortDiagnostics, type Diagnostic } from "@meltemi/diagrams-language";
import { toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { messages } from "./messages/index.js";

export interface ValidationResult {
  /** Files with diagnostics are listed; this is how many files were checked (sources and manifest). */
  readonly files: number;
  readonly errors: number;
  readonly warnings: number;
  /** The printed lines, in the order `validate` prints them. */
  readonly lines: readonly string[];
}

/** Diagnostics of `project.json`, of the project's plugins and of its assets, by file. */
function projectDiagnostics(workspace: Workspace): Map<string, readonly Diagnostic[]> {
  const manifest = workspace.manifest();
  const byPath = new Map<string, Diagnostic[]>();
  if (manifest.diagnostics.length > 0) byPath.set(manifest.path, [...manifest.diagnostics]);
  for (const [path, list] of [
    ...workspace.limits(),
    ...workspace.plugins().diagnostics,
    ...workspace.assets().diagnostics,
  ]) {
    byPath.set(path, [...(byPath.get(path) ?? []), ...list]);
  }
  return new Map([...byPath].map(([path, list]) => [path, sortDiagnostics(list)]));
}

/** Validates the project of a folder as `validate` does and returns what it would print. */
export function validateFolder(
  folder: string,
  options: { readonly toolVersion: string; readonly display: (path: string) => string },
): ValidationResult {
  const root = toProjectPath(folder);
  const projects = new ProjectSessions({
    toolVersion: options.toolVersion,
    host: createNodeHost(),
  });
  const workspace = projects.forFolder(root);
  const results = new Map<string, readonly Diagnostic[]>(projectDiagnostics(workspace));

  /** A file's diagnostics with the composition of its diagrams, as the editor shows them. */
  const withComposition = (diagnostics: readonly Diagnostic[], file: string): Diagnostic[] => {
    const layout = projects.analyze(file).diagnostics.filter((d) => d.code.startsWith("layout."));
    const seen = new Set(diagnostics.map((d) => `${d.code}@${d.range.start.offset}|${d.message}`));
    return sortDiagnostics([
      ...diagnostics,
      ...layout.filter((d) => !seen.has(`${d.code}@${d.range.start.offset}|${d.message}`)),
    ]);
  };
  const program = workspace.compileProject();
  let files = results.size;
  for (const [file, compiled] of program.files) {
    if (file !== root && !file.startsWith(`${root}/`)) continue;
    if (!results.has(file)) files++;
    results.set(file, withComposition(compiled.diagnostics, file));
  }

  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  for (const [path, diagnostics] of results) {
    for (const d of diagnostics) {
      if (d.severity === "error") errors++;
      else if (d.severity === "warning") warnings++;
      lines.push(
        `${options.display(path)}:${d.range.start.line}:${d.range.start.column}: ${d.severity} ${d.code} ${d.message}`,
      );
      for (const hint of d.hints ?? []) lines.push(`    ${messages().common.hint}: ${hint}`);
    }
  }
  return { files, errors, warnings, lines };
}
