// A small client of the Chrome DevTools protocol over a pipe (`--remote-debugging-pipe`): the
// browser reads commands on its fd 3 and writes replies and events on its fd 4, each message a JSON
// text ended by a NUL. Plain JavaScript, so a plain `node` can run it.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Arguments of a headless browser that does nothing but render what it is given. */
export function browserArgs(profile) {
  // Features that make the browser relaunch itself (and lose the pipe), call home or show screens.
  const disabled = [
    "AutoDeElevate",
    "msForceBrowserSignIn",
    "msEdgeUpdateLaunchServicesPreferredVersion",
    "Translate",
    "MediaRouter",
    "OptimizationHints",
    "DialMediaRouteProvider",
    "GlobalMediaControls",
    "PaintHolding",
  ];
  return [
    "--headless",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    // Edge relaunches itself on Windows without its file descriptors unless told not to.
    "--edge-skip-compat-layer-relaunch",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-service-autorun",
    "--disable-extensions",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-breakpad",
    "--disable-edgeupdater",
    "--disable-updater-scheduler",
    "--disable-search-engine-choice-screen",
    "--disable-field-trial-config",
    "--metrics-recording-only",
    "--password-store=basic",
    "--use-mock-keychain",
    `--disable-features=${disabled.join(",")}`,
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--export-tagged-pdf",
    ...(process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    "--no-startup-window",
  ];
}

/** How long a starting browser may take to answer its first call (see `started`). */
export const STARTUP_TIMEOUT = 120_000;

export class PipeSession {
  /** Starts the browser. */
  static async launch(executable, { timeout = 30_000 } = {}) {
    const profile = mkdtempSync(join(tmpdir(), "meltemi-capture-"));
    const child = spawn(executable, browserArgs(profile), {
      stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const session = new PipeSession(child, profile, timeout);
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    return session;
  }

  constructor(child, profile, timeout) {
    this.child = child;
    this.profile = profile;
    this.timeout = timeout;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.buffer = "";
    this.stderr = "";
    this.closed = false;
    child.stdio[2].setEncoding("utf8");
    child.stdio[2].on("data", (text) => {
      // Kept for error messages only; the browser logs little in headless mode.
      this.stderr = (this.stderr + text).slice(-4000);
    });
    child.stdio[4].setEncoding("utf8");
    child.stdio[4].on("data", (text) => this.receive(text));
    child.once("exit", (code) => {
      this.closed = true;
      const error = new Error(
        `The browser stopped (exit code ${code}).${this.stderr ? ` ${this.stderr.trim().split("\n").pop()}` : ""}`,
      );
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
  }

  receive(text) {
    this.buffer += text;
    let end;
    while ((end = this.buffer.indexOf("\0")) >= 0) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        continue;
      }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result ?? {});
      } else if (message.method) {
        for (const listener of [...this.listeners]) listener(message);
      }
    }
  }

  /**
   * Waits for the browser to have started: its version, once it answers. A first start builds the
   * browser's caches (fonts, profile), which on a fresh or busy machine takes far longer than any
   * later call, so it may take up to `STARTUP_TIMEOUT` (or the session's timeout, if longer).
   */
  started() {
    return this.send("Browser.getVersion", {}, undefined, Math.max(this.timeout, STARTUP_TIMEOUT));
  }

  /** Sends a command and waits for its result, for `timeout` ms (the session's by default). */
  send(method, params = {}, sessionId, timeout = this.timeout) {
    if (this.closed) return Promise.reject(new Error("The browser is closed."));
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The browser did not answer ${method} within ${timeout} ms.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdio[3].write(`${JSON.stringify(message)}\0`);
    });
  }

  /** Waits for an event of a session. */
  waitFor(method, sessionId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        reject(new Error(`The browser did not send ${method} within ${this.timeout} ms.`));
      }, this.timeout);
      const listener = (message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== listener);
        resolve(message.params);
      };
      this.listeners.push(listener);
    });
  }

  /** Closes the browser and removes its temporary profile. */
  async close() {
    if (!this.closed) {
      const exited = new Promise((resolve) => this.child.once("exit", resolve));
      await this.send("Browser.close").catch(() => undefined);
      const timer = new Promise((resolve) => setTimeout(resolve, 5000));
      await Promise.race([exited, timer]);
      if (!this.closed) this.child.kill();
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        rmSync(this.profile, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}
