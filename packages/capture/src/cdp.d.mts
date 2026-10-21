/** Arguments of the headless browser. */
export function browserArgs(profile: string): string[];

/** A DevTools protocol session with a browser over a pipe. */
export class PipeSession {
  static launch(executable: string, options?: { timeout?: number }): Promise<PipeSession>;
  // Replies and events are plain JSON objects shaped by the DevTools protocol.
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  waitFor(method: string, sessionId?: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}
