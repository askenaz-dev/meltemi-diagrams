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
  selectionBefore?: Selection;
  selectionAfter?: Selection;
  /** Steps that changed several files share a group, undone and redone together. */
  readonly group: number;
  readonly typing: boolean;
  time: number;
}

/** Typing within this pause, and without a line break, is one step. */
export const TYPING_PAUSE = 700;

/** What an undo or redo writes: the texts of the files and the caret of the file asked about. */
export interface Restored {
  readonly texts: ReadonlyMap<string, string>;
  readonly selection?: Selection;
}

/**
 * The undo history of a project: a stack of steps per file, where a step that changed several
 * files (a rename across the project) is undone and redone with all of them. Typing coalesces into
 * one step until a pause or a line break, so that code and canvas edits undo in order.
 */
export class History {
  private readonly undoStacks = new Map<string, Entry[]>();
  private readonly redoStacks = new Map<string, Entry[]>();
  private groups = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Forgets everything, for a new project. */
  clear(): void {
    this.undoStacks.clear();
    this.redoStacks.clear();
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

  /** Records a step; `typing` steps may join the previous typing step of the same file. */
  record(changes: readonly FileChange[], typing = false): void {
    const real = changes.filter((c) => c.before !== c.after);
    if (real.length === 0) return;
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
    const group = ++this.groups;
    for (const change of real) {
      const stack = this.undoStacks.get(change.path) ?? [];
      stack.push({
        before: change.before,
        after: change.after,
        ...(change.selectionBefore ? { selectionBefore: change.selectionBefore } : {}),
        ...(change.selectionAfter ? { selectionAfter: change.selectionAfter } : {}),
        group,
        typing: typing && real.length === 1,
        time,
      });
      if (stack.length > 500) stack.shift();
      this.undoStacks.set(change.path, stack);
      this.redoStacks.delete(change.path);
    }
  }

  canUndo(path: string): boolean {
    return (this.undoStacks.get(path)?.length ?? 0) > 0;
  }

  canRedo(path: string): boolean {
    return (this.redoStacks.get(path)?.length ?? 0) > 0;
  }

  /**
   * Undoes the last step of a file, with the other files of its step whose last step it is;
   * `current` gives each file's text, and a file whose text is no longer the step's result is
   * left as it is.
   */
  undo(path: string, current: (path: string) => string | undefined): Restored | undefined {
    return this.move(path, current, this.undoStacks, this.redoStacks, "undo");
  }

  redo(path: string, current: (path: string) => string | undefined): Restored | undefined {
    return this.move(path, current, this.redoStacks, this.undoStacks, "redo");
  }

  private move(
    path: string,
    current: (path: string) => string | undefined,
    from: Map<string, Entry[]>,
    to: Map<string, Entry[]>,
    direction: "undo" | "redo",
  ): Restored | undefined {
    const top = from.get(path)?.at(-1);
    if (!top) return undefined;
    const texts = new Map<string, string>();
    let selection: Selection | undefined;
    for (const [file, stack] of from) {
      const entry = stack.at(-1);
      if (!entry || entry.group !== top.group) continue;
      const expected = direction === "undo" ? entry.after : entry.before;
      if (file !== path && current(file) !== expected) continue;
      stack.pop();
      const target = to.get(file) ?? [];
      target.push(entry);
      to.set(file, target);
      texts.set(file, direction === "undo" ? entry.before : entry.after);
      if (file === path) {
        selection = direction === "undo" ? entry.selectionBefore : entry.selectionAfter;
      }
    }
    return { texts, ...(selection ? { selection } : {}) };
  }
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
