// View mode as the page holds it (`project-sharing`, "Viewing by link"): whether the page is showing
// a project it may not change, which one, and how (a snapshot of the files, or the room followed
// live). The Studio refuses the edits (`Studio.setReadOnly`); this keeps what the header, the code
// pane and the canvas draw from. Nothing here touches a DOM.

import type { Studio } from "../studio.js";

/** The project the page is viewing. */
export interface ViewState {
  readonly id: string;
  readonly name: string;
  /** A signed-in viewer follows the room; an anonymous one reads the files as they were when the page opened. */
  readonly live: boolean;
  /** Whether a person is signed in: only then can the copy go to their projects. */
  readonly signedIn: boolean;
  /** A snapshot has been open for long enough that the project may have changed. */
  readonly stale: boolean;
  /**
   * The live session that let the page in ended and the link does not admit the person: the page
   * holds the files it showed, with no room and no snapshot behind them (`live-sessions`).
   */
  readonly frozen?: boolean;
}

/** What entering view mode takes: the project; the snapshot is fresh. */
export type ViewEntry = Omit<ViewState, "stale">;

export class ViewMode {
  private current: ViewState | undefined;
  private readonly listeners = new Set<(state: ViewState | undefined) => void>();

  constructor(private readonly studio: Pick<Studio, "setReadOnly">) {}

  /** The project being viewed, or undefined when the page is not in view mode. */
  get state(): ViewState | undefined {
    return this.current;
  }

  get active(): boolean {
    return this.current !== undefined;
  }

  /** Enters view mode (or changes the project viewed): the Studio refuses edits from now on. */
  enter(entry: ViewEntry): void {
    this.current = { ...entry, stale: false };
    this.studio.setReadOnly(true);
    this.notify();
  }

  /** The snapshot is old (or fresh again). */
  setStale(stale: boolean): void {
    const state = this.current;
    if (!state || state.stale === stale) return;
    this.current = { ...state, stale };
    this.notify();
  }

  /** The viewed project has another name (it was renamed). */
  rename(name: string): void {
    const state = this.current;
    if (!state || state.name === name) return;
    this.current = { ...state, name };
    this.notify();
  }

  /** Leaves view mode: the Studio takes edits again. */
  leave(): void {
    if (!this.current) return;
    this.current = undefined;
    this.studio.setReadOnly(false);
    this.notify();
  }

  /** Hears every change of the state (undefined: left view mode); returns how to stop. */
  listen(listener: (state: ViewState | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener(this.current);
  }
}
