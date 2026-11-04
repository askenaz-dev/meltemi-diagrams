import { statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { relativePath, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import { argumentsError, messages } from "./messages/index.js";

/** What the plugins command needs from the CLI. */
export interface PluginsContext {
  readonly name: string;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
  readonly display: (path: string) => string;
  readonly workspaceFor: (path: string, isDirectory: boolean) => Workspace;
  readonly printDiagnostics: (path: string, diagnostics: readonly Diagnostic[]) => void;
}

/** `meltemi-diagrams plugins`. */
export function pluginsCommand(args: readonly string[], context: PluginsContext): number {
  let values: { json: boolean; help: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      options: {
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    values = parsed.values as typeof values;
    positionals = parsed.positionals;
  } catch (error) {
    context.stderr(`${context.name} plugins: ${argumentsError(error)}\n`);
    return 2;
  }
  if (values.help) {
    context.stdout(messages().help.plugins);
    return 0;
  }
  const target = toProjectPath(resolve(context.cwd, positionals[0] ?? "."));
  let isDirectory: boolean;
  try {
    isDirectory = statSync(target).isDirectory();
  } catch {
    context.stderr(
      `${context.name} plugins: ${messages().common.pathNotFound(positionals[0] ?? ".")}\n`,
    );
    return 2;
  }
  const workspace = context.workspaceFor(target, isDirectory);
  const loaded = workspace.plugins();
  const installed = workspace.manifest().manifest?.plugins ?? [];
  const errors = [...loaded.diagnostics.values()].flat().some((d) => d.severity === "error");
  if (values.json) {
    context.stdout(
      `${JSON.stringify(
        {
          plugins: installed.map((setting) => {
            const plugin = loaded.plugins.find((p) => p.name === setting.name);
            return {
              name: setting.name,
              version: setting.version,
              path: setting.path,
              granted: setting.permissions,
              loaded: plugin !== undefined,
              ...(plugin
                ? {
                    description: plugin.description,
                    license: plugin.license,
                    homepage: plugin.homepage,
                    permissions: plugin.permissions,
                    types: plugin.types.map((t) => ({
                      type: t.type,
                      title: t.title,
                      kinds: Object.keys(t.elements),
                    })),
                    icons: plugin.icons === null ? null : plugin.name,
                    integrity: plugin.integrity,
                  }
                : {}),
            };
          }),
          problems: [...loaded.diagnostics].map(([path, list]) => ({
            path: relativePath(workspace.root, path),
            diagnostics: list.map((d) => ({
              code: d.code,
              severity: d.severity,
              message: d.message,
            })),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return errors ? 1 : 0;
  }
  const t = messages().plugins;
  if (installed.length === 0) context.stdout(`${t.none}\n`);
  for (const setting of installed) {
    const plugin = loaded.plugins.find((p) => p.name === setting.name);
    if (!plugin) {
      context.stdout(`${t.notLoaded(setting.name, setting.version)}\n`);
      continue;
    }
    context.stdout(
      `${plugin.name} ${plugin.version}${plugin.license ? ` (${plugin.license})` : ""}${plugin.description ? ` — ${plugin.description}` : ""}\n`,
    );
    if (plugin.homepage) context.stdout(`${t.from(plugin.homepage)}\n`);
    context.stdout(`${t.folder(setting.path, setting.permissions)}\n`);
    for (const type of plugin.types) {
      context.stdout(`${t.type(type.type, type.title, Object.keys(type.elements))}\n`);
    }
    if (plugin.icons) context.stdout(`${t.icons(plugin.name)}\n`);
  }
  for (const [path, list] of loaded.diagnostics) {
    context.printDiagnostics(context.display(path), list);
  }
  return errors ? 1 : 0;
}
