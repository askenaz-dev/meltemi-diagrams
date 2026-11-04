import type { Diagnostic } from "@meltemi/diagrams-language";
import type { Workspace } from "@meltemi/diagrams-project";

/**
 * What the Problems view shows of a project's assets: the diagnostics of `Workspace.assets()` by
 * the file or folder they concern, and the paths it showed before that have none now, to clear.
 */
export function assetProblems(
  workspace: Workspace,
  shown: ReadonlySet<string>,
): { readonly set: ReadonlyMap<string, readonly Diagnostic[]>; readonly clear: readonly string[] } {
  const set = new Map(
    [...workspace.assets().diagnostics].filter(([, diagnostics]) => diagnostics.length > 0),
  );
  return { set, clear: [...shown].filter((path) => !set.has(path)) };
}
