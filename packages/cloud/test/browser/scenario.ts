/**
 * What a scenario of the browser suite is given and what it is: shared by `run.ts`, which runs
 * them, and the modules that hold the scenarios of the cloud projects.
 */
import type { BrowserContext, Page } from "playwright-core";
import type { Answer, PersonOptions, Watch } from "./support.js";
import type { FakeIdentity } from "./identity.js";
import type { RunningWorker } from "./worker.js";

/** What the page asked `/api/session` and was answered. */
export interface SessionAnswer {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly json: Record<string, unknown>;
}

/** A person as the Worker knows them from Node: the cookie they hold and the calls they make. */
export interface Person {
  readonly sub: string;
  /** The session token: the value of the cookie a browser of theirs holds. */
  readonly token: string;
  /** The `Cookie` header of their session. */
  readonly cookie: Record<string, string>;
  /**
   * A call as the page makes it: with the session cookie and the page's own `Origin` (the Worker
   * refuses a changing request that does not carry it). An object body is JSON; a string or bytes
   * go as they are (give their `Content-Type` in `headers`).
   */
  api(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Answer>;
}

/** A browser of its own for the person a scenario signed in: a second device, a second window. */
export interface Device {
  readonly page: Page;
  readonly context: BrowserContext;
  /** Everything this device requested, opened and logged. */
  readonly seen: Watch;
}

/** Everything a scenario has: a page in a browser context of its own, and the Worker to ask from Node. */
export interface Run {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly worker: RunningWorker;
  /** The stand-in for the identity service, which the Worker asks whether a session is live. */
  readonly identity: FakeIdentity;
  /** The Worker's own origin, `http://localhost:<port>`. */
  readonly origin: string;
  /** Everything the browser requested and logged so far. */
  readonly seen: Watch;
  /** The `Cookie` header of the person the scenario signed in; empty when nobody is. */
  readonly cookie: Record<string, string>;
  /** The person the scenario signed in. Fails when nobody is. */
  readonly me: Person;
  /** Names another origin the browser may request in this scenario (the command line's listener). */
  allow(origin: string): void;
  /** Opens a path of the Worker, waits for the page and gives the session answer the page got. */
  open(path?: string): Promise<SessionAnswer>;
  /** Asks the Worker from Node, as a program would: the path is taken against its origin. */
  ask(path: string, init?: RequestInit): Promise<Answer>;
  /** A call as the person the scenario signed in (see `Person.api`). */
  api(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Answer>;
  /**
   * Another person, with a session of their own, for what one person must not reach of another's.
   * They are called "Ana" and have the verified email `<sub>@example.com`, unless `options` say otherwise.
   */
  person(sub: string, options?: PersonOptions): Promise<Person>;
  /**
   * A second browser: a context of its own. By default a second device of the person the scenario
   * signed in (their cookie and all); `as` gives it another person's session, or `null` no session at
   * all (somebody who is not signed in).
   */
  device(options?: { locale?: string; as?: Person | null }): Promise<Device>;
}

export interface Scenario {
  readonly name: string;
  /**
   * The person signed in when the scenario starts: the `sub` of a session minted for Ana. Each
   * scenario has its own, so what one leaves in the database never meets another.
   */
  readonly signedIn?: string;
  /** The browser's language (`en-US` by default). */
  readonly locale?: string;
  /**
   * Console errors the scenario provokes on purpose (the browser's note that a request answered 404,
   * or that a socket could not open). Any other error still fails it.
   */
  readonly allowedErrors?: readonly RegExp[];
  readonly run: (t: Run) => Promise<void>;
}
