/** Arguments of the headless browser. */
export function browserArgs(profile: string): string[];

/** How long a starting browser may take to answer its first call (see `started`). */
export const STARTUP_TIMEOUT: number;

/** A DevTools protocol session with a browser over a pipe. */
export class PipeSession {
  static launch(executable: string, options?: { timeout?: number }): Promise<PipeSession>;
  /** The browser's version once it has started, with the longer startup timeout. */
  started(): Promise<Record<string, unknown>>;
  // Replies and events are plain JSON objects shaped by the DevTools protocol.
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeout?: number,
  ): Promise<Record<string, unknown>>;
  waitFor(method: string, sessionId?: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}
