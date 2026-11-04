import { isIdentifierText, type TextEdit } from "@meltemi/diagrams-language";
import type { EntityReference, ModelDefinition, TargetKind } from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";
import { importedModel, type FileCompilation, type Program } from "./program.js";

/** A model of the project: its file and id. */
export interface ModelLocation {
  readonly file: string;
  readonly id: string;
}

export type ProjectRename =
  | { readonly ok: true; readonly edits: ReadonlyMap<string, readonly TextEdit[]> }
  | { readonly ok: false; readonly reason: string };

/** The model a name written in a file leads to, local or imported. */
export function modelOf(file: FileCompilation, name: string): ModelLocation | undefined {
  const local = file.compilation.document.models.find((m) => m.id === name);
  if (local) return { file: file.path, id: local.id };
  const imported = importedModel(file, name);
  return imported && imported.file !== null
    ? { file: imported.file, id: imported.definition.id }
    : undefined;
}

/**
 * The references of a file to the entities of a model: in the model itself, views, links and
 * story targets in views of the model.
 */
export function referencesTo(file: FileCompilation, model: ModelLocation): EntityReference[] {
  const found: EntityReference[] = [];
  if (file.path === model.file) {
    const definition = file.compilation.document.models.find((m) => m.id === model.id);
    if (definition) found.push(...definition.references);
  }
  for (const diagram of file.compilation.document.diagrams) {
    const c4 = diagram.c4;
    const viewModel = c4?.resolved
      ? { file: c4.resolved.file ?? file.path, id: c4.resolved.definition.id }
      : undefined;
    for (const reference of diagram.entityReferences) {
      const target = reference.role === "link" ? modelOf(file, reference.model) : viewModel;
      if (target && target.file === model.file && target.id === model.id) found.push(reference);
    }
  }
  for (const story of file.compilation.document.stories) {
    for (const reference of story.entityReferences) {
      const resolved = reference.view.diagram?.c4?.resolved;
      const viewFile = reference.view.file ?? file.path;
      if (
        resolved &&
        (resolved.file ?? viewFile) === model.file &&
        resolved.definition.id === model.id
      ) {
        found.push(reference);
      }
    }
  }
  return found;
}

/** The definition of a model of the project. */
export function modelDefinition(
  program: Program,
  model: ModelLocation,
): ModelDefinition | undefined {
  return program.files.get(model.file)?.compilation.document.models.find((m) => m.id === model.id);
}

/**
 * Renames an entity in its model and everywhere the project names it: views and links of every
 * file of the program, by token.
 */
export function renameEntityInProject(
  program: Program,
  model: ModelLocation,
  path: string,
  newId: string,
): ProjectRename {
  // The reasons are written in the interface language of the moment the rename is asked for.
  const t = messages().rename;
  const definition = modelDefinition(program, model);
  const entity = definition?.entitiesByPath.get(path);
  if (!definition || !entity) return { ok: false, reason: t.noEntity(model.id, path) };
  if (!isIdentifierText(newId)) return { ok: false, reason: t.invalidId(newId) };
  const sibling = entity.parent ? `${entity.parent}.${newId}` : newId;
  if (newId !== entity.id && definition.entitiesByPath.has(sibling)) {
    return { ok: false, reason: t.taken(sibling, model.id) };
  }
  const edits = new Map<string, TextEdit[]>();
  if (newId === entity.id) return { ok: true, edits };
  for (const file of program.files.values()) {
    const tokens = new Map<number, { start: number; end: number }>();
    for (const reference of referencesTo(file, model)) {
      if (reference.path === path) tokens.set(reference.token.start, reference.token);
    }
    if (tokens.size === 0) continue;
    edits.set(
      file.path,
      [...tokens.values()]
        .sort((a, b) => a.start - b.start)
        .map((t) => ({ start: t.start, end: t.end, newText: newId })),
    );
  }
  return { ok: true, edits };
}

/**
 * Edits that rename an id of a diagram of `file` in the stories of the other files of the program,
 * which name it through an import of the diagram. A rename planned in `file` covers its own
 * stories.
 */
export function renameInImportingStories(
  program: Program,
  file: string,
  diagram: string,
  id: string,
  newId: string,
  kind?: TargetKind,
): Map<string, TextEdit[]> {
  const edits = new Map<string, TextEdit[]>();
  for (const other of program.files.values()) {
    if (other.path === file) continue;
    const found = other.compilation.document.stories.flatMap((story) =>
      story.references
        .filter(
          (r) =>
            r.file === file &&
            r.diagram === diagram &&
            r.id === id &&
            (kind === undefined || r.kind === kind),
        )
        .map((r) => ({ start: r.range.start.offset, end: r.range.end.offset, newText: newId })),
    );
    if (found.length > 0) edits.set(other.path, found);
  }
  return edits;
}
