/**
 * The tools of a folder (`mcp-local-server`, "A folder with no account" and "Paths of the folder"):
 * `validate` and `preview` over the files of a folder on disk, read again at each call, with no
 * account and no network. The folder is read as `push` would send it to a cloud project
 * (`readPushSet`: `project.json`, the `.meltemi` sources, themes and the other text files, and the
 * images and fonts; never dotfiles, `node_modules` or links), so a drawing has the same files here
 * as it would in the cloud, and is drawn by the same engine.
 *
 * A path is clean (the project's path rule) and resolves, its links followed, under the folder's
 * real path; any other is `path.invalid` before anything is read.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { FOLDER_TOOLS, Refusal, drawingBinaryPaths, type HandlersOf } from "@meltemi/diagrams-mcp";
import { isCleanPath, readManifest, toProjectPath } from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { checkAnswer, checkWidth, PATH_INVALID, previewAnswer } from "./mcp-drawing.js";
import type { DrawingEngine } from "./mcp-engine.js";
import { readPushSet } from "./push-set.js";

/** The folder's files as a drawing is given them. */
interface FolderFiles {
  readonly files: Record<string, string>;
  readonly binaries: Record<string, Uint8Array>;
  /**
   * A number that changes when the files do: the core's cache key in place of a revision, so a
   * folder drawn twice unchanged is answered from the cache, and an edited one drawn again.
   */
  readonly revision: number;
}

/** Refuses a path that is not clean, or that resolves outside the folder. */
function checkPath(root: string, path: string): void {
  if (!isCleanPath(path)) throw new Refusal("path.invalid", PATH_INVALID);
  const native = resolve(root, ...path.split("/"));
  if (!existsSync(native)) return;
  let real: string;
  try {
    real = realpathSync(native);
  } catch {
    throw new Refusal("path.invalid", PATH_INVALID);
  }
  if (real !== root && !real.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new Refusal("path.invalid", PATH_INVALID);
  }
}

/** Reads the folder as a cloud project would hold it, and the images and fonts a drawing uses. */
function readFolder(root: string, toolVersion: string): FolderFiles {
  const manifest = readManifest(createNodeHost(), toProjectPath(root), { toolVersion }).manifest;
  const set = readPushSet(root, manifest);
  const files = Object.fromEntries(set.texts);
  const hashes = Object.fromEntries([...set.binaries].map(([path, binary]) => [path, binary.hash]));
  const binaries: Record<string, Uint8Array> = {};
  for (const [path] of drawingBinaryPaths(files, hashes)) {
    try {
      binaries[path] = new Uint8Array(readFileSync(set.binaries.get(path)!.file));
    } catch {
      // A file that cannot be read now is left out, and the drawing reports the image it lacks.
    }
  }
  const content = createHash("sha256");
  for (const [path, text] of Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))) {
    content.update(`${path}\0${text}\0`);
  }
  for (const [path, hash] of Object.entries(hashes).sort(([a], [b]) => (a < b ? -1 : 1))) {
    content.update(`${path}\0${hash}\0`);
  }
  return { files, binaries, revision: content.digest().readUIntBE(0, 6) };
}

/** The handlers of `mdg mcp --folder <dir>`: `root` is the folder's real path. */
export function folderHandlers(
  root: string,
  engine: DrawingEngine,
  toolVersion: string,
): HandlersOf<typeof FOLDER_TOOLS> {
  return {
    inspect_story: async ({ path, story }) => {
      checkPath(root, path);
      const folder = readFolder(root, toolVersion);
      if (!Object.hasOwn(folder.files, path) || !path.endsWith(".meltemi"))
        throw new Refusal("request.invalid", `The folder has no .meltemi file ${path}.`);
      const result = await engine.inspectStory({
        revision: folder.revision,
        files: folder.files,
        file: path,
        story,
      });
      if (!result.ok)
        throw new Refusal(
          result.code,
          result.message,
          result.diagnostics ? { diagnostics: result.diagnostics } : {},
        );
      return { structured: result.inspection };
    },
    validate: async ({ path }) => {
      if (path !== undefined) checkPath(root, path);
      const folder = readFolder(root, toolVersion);
      if (path !== undefined && !Object.hasOwn(folder.files, path)) {
        throw new Refusal("request.invalid", `The folder has no text file ${path}.`);
      }
      const checked = await engine.validate({
        files: folder.files,
        ...(path !== undefined ? { paths: [path] } : {}),
      });
      return { structured: checkAnswer(checked) };
    },
    preview: async (args) => {
      const format = args.format ?? "png";
      checkWidth(format, args.width);
      checkPath(root, args.path);
      const folder = readFolder(root, toolVersion);
      if (!Object.hasOwn(folder.files, args.path) || !args.path.endsWith(".meltemi")) {
        throw new Refusal("request.invalid", `The folder has no .meltemi file ${args.path}.`);
      }
      const outcome = await engine.render({
        revision: folder.revision,
        files: folder.files,
        binaries: folder.binaries,
        file: args.path,
        format,
        ...(args.diagram !== undefined ? { diagram: args.diagram } : {}),
        ...(args.story !== undefined ? { story: args.story } : {}),
        ...(args.at !== undefined ? { at: args.at } : {}),
        ...(args.width !== undefined ? { width: args.width } : {}),
        ...(args.theme !== undefined ? { theme: args.theme } : {}),
      });
      return previewAnswer(outcome);
    },
  };
}

/** The folder's real path, or undefined when it is not a folder that exists. */
export function realFolder(path: string): string | undefined {
  try {
    const real = realpathSync(path);
    return statSync(real).isDirectory() ? real : undefined;
  } catch {
    return undefined;
  }
}
