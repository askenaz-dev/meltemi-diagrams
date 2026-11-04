/** A caret or selection, as offsets of the text. */
export interface Selection {
  readonly start: number;
  readonly end: number;
}

/** One file's change in a step: its text before and after, and where the caret was. */
export interface FileChange {
  readonly path: string;
  readonly before: string;
  readonly after: string;
  readonly selectionBefore?: Selection;
  readonly selectionAfter?: Selection;
}

interface Entry {
  before: string;
  after: string;
  /** The step made the file: undone, it goes; redone, it comes back. */
  readonly created?: boolean;
  selectionBefore?: Selection;
  selectionAfter?: Selection;
  /** Steps that changed several files share a group, undone and redone together. */
  readonly group: number;
  readonly typing: boolean;
  time: number;
}

/** Typing within this pause, and without a line break, is one step. */
export const TYPING_PAUSE = 700;

/** A file that moved in a step, from one path to another. */
export interface Move {
  readonly from: string;
  readonly to: string;
}

/**
 * What an undo or redo writes: the files to move first, in order, then the texts of the files (by
 * the path each has after the moves) and the caret of the file asked about.
 */
export interface Restored {
  readonly moves?: readonly Move[];
  readonly texts: ReadonlyMap<string, string>;
  /** Files an undo takes away: the step made them. */
  readonly deletes?: readonly string[];
  readonly selection?: Selection;
}

/**
 * The files a step moved, in the order they moved, or made (`creates`); the project's own stack
 * holds it, so an undo asked from any file takes it.
 */
interface Structure {
  readonly moves: readonly Move[];
  readonly creates?: readonly string[];
  readonly group: number;
}

/**
 * The undo history of a project: a stack of steps per file, where a step that changed several
 * files (a rename across the project) is undone and redone with all of them. Typing coalesces into
 * one step until a pause or a line break, so that code and canvas edits undo in order. Files that
 * move (and the imports that follow them) are a step of the project's own stack: an undo asked from
 * any file takes it when it is the latest step, as a cloud project's document does.
 */
export class History {
  private readonly undoStacks = new Map<string, Entry[]>();
  private readonly redoStacks = new Map<string, Entry[]>();
  private readonly structureUndo: Structure[] = [];
  private readonly structureRedo: Structure[] = [];
  private groups = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Forgets everything, for a new project. */
  clear(): void {
    this.undoStacks.clear();
    this.redoStacks.clear();
    this.structureUndo.length = 0;
    this.structureRedo.length = 0;
  }

  /** Forgets a file, after it was deleted; follows a rename. */
  forget(path: string, renamedTo?: string): void {
    const undo = this.undoStacks.get(path);
    const redo = this.redoStacks.get(path);
    this.undoStacks.delete(path);
    this.redoStacks.delete(path);
    if (renamedTo !== undefined) {
      if (undo) this.undoStacks.set(renamedTo, undo);
      if (redo) this.redoStacks.set(renamedTo, redo);
    }
  }

  /**
   * Records files that moved, with the texts the step changed (by the path each file has after the
   * moves), as one step. The stacks of the files that moved must already follow them
   * (`forget(from, to)`).
   */
  recordMoves(moves: readonly Move[], changes: readonly FileChange[] = []): void {
    if (moves.length === 0) return;
    const group = this.push(
      changes.filter((c) => c.before !== c.after),
      false,
    );
    this.structureUndo.push({ moves: [...moves], group });
    if (this.structureUndo.length > 500) this.structureUndo.shift();
    this.structureRedo.length = 0;
  }

  /**
   * Records files a step made, with their texts and the texts the step changed in other files, as
   * one step of the project's stack: undo takes the files away, redo writes them again.
   */
  recordCreates(
    created: readonly { readonly path: string; readonly text: string }[],
    changes: readonly FileChange[] = [],
  ): void {
    if (created.length === 0) {
      this.record(changes);
      return;
    }
    const group = this.push(
      [
        ...changes.filter((c) => c.before !== c.after),
        ...created.map((c) => ({ path: c.path, before: "", after: c.text, created: true })),
      ],
      false,
    );
    this.structureUndo.push({ moves: [], creates: created.map((c) => c.path), group });
    if (this.structureUndo.length > 500) this.structureUndo.shift();
    this.structureRedo.length = 0;
  }

  /** Records a step; `typing` steps may join the previous typing step of the same file. */
  record(changes: readonly FileChange[], typing = false): void {
    const real = changes.filter((c) => c.before !== c.after);
    if (real.length === 0) return;
    // A new edit forgets the moves that were undone.
    this.structureRedo.length = 0;
    const time = this.now();
    if (typing && real.length === 1) {
      const change = real[0]!;
      const stack = this.undoStacks.get(change.path) ?? [];
      const last = stack[stack.length - 1];
      const inserted = change.after.length >= change.before.length;
      const breaks = /\n/.test(added(change.before, change.after));
      if (
        last?.typing &&
        last.after === change.before &&
        time - last.time < TYPING_PAUSE &&
        inserted &&
        !breaks
      ) {
        last.after = change.after;
        last.selectionAfter = change.selectionAfter;
        last.time = time;
        this.redoStacks.delete(change.path);
        return;
      }
    }
    this.push(real, typing && real.length === 1);
  }

  /** Puts changes on their files' stacks as one new group; answers the group. */
  private push(
    changes: readonly (FileChange & { readonly created?: boolean })[],
    typing: boolean,
  ): number {
    const group = ++this.groups;
    const time = this.now();
    for (const change of changes) {
      const stack = this.undoStacks.get(change.path) ?? [];
      stack.push({
        before: change.before,
        after: change.after,
        ...(change.created ? { created: true } : {}),
        ...(change.selectionBefore ? { selectionBefore: change.selectionBefore } : {}),
        ...(change.selectionAfter ? { selectionAfter: change.selectionAfter } : {}),
        group,
        typing,
        time,
      });
      if (stack.length > 500) stack.shift();
      this.undoStacks.set(change.path, stack);
      this.redoStacks.delete(change.path);
    }
    return group;
  }

  canUndo(path: string): boolean {
    return (this.undoStacks.get(path)?.length ?? 0) > 0 || this.structureUndo.length > 0;
  }

  canRedo(path: string): boolean {
    return (this.redoStacks.get(path)?.length ?? 0) > 0 || this.structureRedo.length > 0;
  }

  /**
   * Undoes the last step of a file, or the last move of files when it came later, with the other
   * files of its step whose last step it is; `current` gives each file's text (undefined when there
   * is no such file), and a file whose text is no longer the step's result is left as it is. A move
   * that can no longer be made back (a file went, or another took its old path) is dropped.
   */
  undo(path: string, current: (path: string) => string | undefined): Restored | undefined {
    return this.move(path, current, "undo");
  }

  redo(path: string, current: (path: string) => string | undefined): Restored | undefined {
    return this.move(path, current, "redo");
  }

  private move(
    path: string,
    current: (path: string) => string | undefined,
    direction: "undo" | "redo",
  ): Restored | undefined {
    const undo = direction === "undo";
    const from = undo ? this.undoStacks : this.redoStacks;
    const to = undo ? this.redoStacks : this.undoStacks;
    const structureFrom = undo ? this.structureUndo : this.structureRedo;
    const structureTo = undo ? this.structureRedo : this.structureUndo;
    const top = from.get(path)?.at(-1);
    const structure = structureFrom.at(-1);
    // Undo takes the later of the two steps; redo the earlier, which was undone last.
    const group =
      top && structure
        ? undo
          ? Math.max(top.group, structure.group)
          : Math.min(top.group, structure.group)
        : (top?.group ?? structure?.group);
    if (group === undefined) return undefined;
    const texts = new Map<string, string>();
    const deletes: string[] = [];
    let selection: Selection | undefined;
    for (const [file, stack] of from) {
      const entry = stack.at(-1);
      if (!entry || entry.group !== group) continue;
      const now = current(file);
      // A file the step made is not there before it: redo finds it gone.
      const matches =
        entry.created && !undo ? now === undefined : now === (undo ? entry.after : entry.before);
      if (file !== path && !matches) continue;
      stack.pop();
      const target = to.get(file) ?? [];
      target.push(entry);
      to.set(file, target);
      if (entry.created && undo) deletes.push(file);
      else texts.set(file, undo ? entry.before : entry.after);
      if (file === path) selection = undo ? entry.selectionBefore : entry.selectionAfter;
    }
    let moves: Move[] = [];
    if (structure?.group === group) {
      structureFrom.pop();
      // Undo moves the files back, the last that moved first.
      const wanted = undo
        ? [...structure.moves].reverse().map((m) => ({ from: m.to, to: m.from }))
        : [...structure.moves];
      if (canMove(wanted, current)) {
        structureTo.push(structure);
        moves = wanted;
        for (const m of moves) {
          this.forget(m.from, m.to);
          const text = texts.get(m.from);
          if (text !== undefined) {
            texts.delete(m.from);
            texts.set(m.to, text);
          }
        }
      }
    }
    if (texts.size === 0 && moves.length === 0 && deletes.length === 0) return undefined;
    return {
      ...(moves.length > 0 ? { moves } : {}),
      texts,
      ...(deletes.length > 0 ? { deletes } : {}),
      ...(selection ? { selection } : {}),
    };
  }
}

/** Whether the files can make these moves in order: each source there and each target free. */
function canMove(moves: readonly Move[], current: (path: string) => string | undefined): boolean {
  const exists = new Map<string, boolean>();
  const has = (path: string) => exists.get(path) ?? current(path) !== undefined;
  for (const m of moves) {
    if (!has(m.from) || has(m.to)) return false;
    exists.set(m.from, false);
    exists.set(m.to, true);
  }
  return true;
}

/** The text inserted between two versions, around their common start and end. */
function added(before: string, after: string): string {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return after.slice(start, after.length - end);
}
