/** `meltemi.canvas.openWithText`. */
export type OpenWithText = "remember" | "always" | "never";

/** The key of the remembered choice in the extension's global state. */
export const REMEMBER_KEY = "meltemi.canvas.openBeside";

/** How long after a canvas closes the close counts as the user's choice, in milliseconds. */
export const CLOSE_DELAY = 500;

export interface FlagStore {
  get(): boolean;
  set(value: boolean): void | PromiseLike<void>;
}

/**
 * Whether the canvas opens beside the code. In `remember` mode a closed canvas stays closed, in
 * this and the next sessions, until the user opens one again.
 */
export class CanvasOpening {
  /** Documents whose canvas the user closed in this session; their text reopening clears them. */
  private readonly closed = new Set<string>();

  constructor(
    private readonly flag: FlagStore,
    private readonly setting: () => OpenWithText,
  ) {}

  /** Whether the canvas should open beside the text of a document now. */
  shouldOpen(document: string): boolean {
    const mode = this.setting();
    if (mode === "never" || this.closed.has(document)) return false;
    return mode === "always" || this.flag.get();
  }

  /** The user closed a canvas while its text stayed visible. */
  userClosed(document: string): void {
    this.closed.add(document);
    if (this.setting() === "remember") void this.flag.set(false);
  }

  /** The user opened a canvas by command or button. */
  userOpened(document: string): void {
    this.closed.delete(document);
    void this.flag.set(true);
  }

  /** The text of a document was closed: a new opening starts afresh. */
  documentClosed(document: string): void {
    this.closed.delete(document);
  }
}
