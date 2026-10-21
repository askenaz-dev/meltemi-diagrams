import { quoteString } from "@meltemi/diagrams-edit";
import type { TextEdit } from "@meltemi/diagrams-language";
import {
  dirnamePath,
  normalizePath,
  relativePath,
  resolveImportPath,
} from "@meltemi/diagrams-project";
import type { ProjectSessions } from "./projects.js";

/** A file that moves, by the paths the compiler knows it by before and after. */
export interface FileMove {
  readonly from: string;
  readonly to: string;
}

/** What moving files changes in the texts of the project. */
export interface MoveEdits {
  /** The edits of each file, by the path the file has once the moves are made. */
  readonly edits: ReadonlyMap<string, readonly TextEdit[]>;
  /**
   * Files whose imports would change but that do not parse, by the path they have once the moves
   * are made: they are left as they are.
   */
  readonly skipped: readonly string[];
}

/**
 * The path an `import` of `file` writes for `target`, both absolute: relative to the file's folder,
 * starting with `./` or `../`, with `/` separators, as the language takes it.
 */
export function importSpec(file: string, target: string): string {
  const relative = relativePath(dirnamePath(file), target);
  return relative.startsWith("../") ? relative : `./${relative}`;
}

/**
 * The edits that keep every import of the project pointing at the same file when `moves` are made
 * (decision 0048): an import of a file that moves is rewritten relative to where the file goes, and
 * the imports of a file that moves are rewritten relative to where it goes, all in one pass, so a
 * folder that moves with files importing each other keeps them in step. Only the path strings
 * change; an import whose file moves nowhere and that names no file that moves keeps its text. The
 * paths are the compiler's (absolute) and every move belongs to one project.
 */
export function moveFileEdits(sessions: ProjectSessions, moves: readonly FileMove[]): MoveEdits {
  const moved = new Map(moves.map((m) => [normalizePath(m.from), normalizePath(m.to)] as const));
  const first = moves[0];
  if (!first) return { edits: new Map(), skipped: [] };
  const after = (path: string) => moved.get(path) ?? path;
  const program = sessions.forFile(first.from).compileProject();
  const edits = new Map<string, TextEdit[]>();
  const skipped: string[] = [];
  for (const [path, file] of program.files) {
    const moving = moved.has(path);
    const list: TextEdit[] = [];
    for (const declaration of file.compilation.document.imports) {
      if (declaration.path === null || declaration.pathRange === null) continue;
      const check = resolveImportPath(path, declaration.path);
      if (!check.ok) continue;
      if (!moving && !moved.has(check.path)) continue;
      const spec = importSpec(after(path), after(check.path));
      if (spec === declaration.path) continue;
      list.push({
        start: declaration.pathRange.start.offset,
        end: declaration.pathRange.end.offset,
        newText: quoteString(spec),
      });
    }
    if (list.length === 0) continue;
    const broken = file.compilation.parse.diagnostics.some((d) => d.severity === "error");
    if (broken) skipped.push(after(path));
    else edits.set(after(path), list);
  }
  return { edits, skipped };
}
