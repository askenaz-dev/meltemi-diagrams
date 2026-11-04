// Test support: an R2 bucket in memory (`R2Like`), which can be told to refuse writes, and which
// keeps every call it received so that a test can say what was written and in which order.

import type { R2Like, R2ListPageLike, R2ObjectBodyLike, R2ObjectLike } from "../../src/env.js";

/** What a call did: the operation, the key and whether the bucket refused it. */
export interface R2Call {
  readonly op: "put" | "get" | "head" | "delete" | "list";
  readonly key: string;
  readonly failed: boolean;
}

export interface FakeR2 extends R2Like {
  /** The bytes held, by key. */
  readonly objects: Map<string, Uint8Array>;
  /**
   * When each object was written, by key (the clock of the bucket when it was `put`). An object a
   * test set in `objects` directly has no entry, and is as old as the bucket's clock says it is now.
   * A test sets an entry to make an object old.
   */
  readonly uploaded: Map<string, Date>;
  /** Every call, in order. */
  readonly calls: R2Call[];
  /**
   * Decides which writes are refused: called with the key of every `put` and `delete`, a `true`
   * makes the call throw (as an R2 outage does) and writes nothing. `undefined` refuses nothing.
   */
  refuse: ((op: "put" | "delete", key: string) => boolean) | undefined;
  /** The keys held, sorted. */
  keys(): string[];
  /** The keys put so far, in order (every `put`, a failed one included). */
  puts(): string[];
  /** The text of an object, or undefined when there is none. */
  text(key: string): string | undefined;
}

function bodyOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice());
      controller.close();
    },
  });
}

/** `now` is the bucket's clock: what `uploaded` says of an object written now. */
export function fakeR2(now: () => Date = () => new Date()): FakeR2 {
  const objects = new Map<string, Uint8Array>();
  const uploaded = new Map<string, Date>();
  const calls: R2Call[] = [];
  const bucket: FakeR2 = {
    objects,
    uploaded,
    calls,
    refuse: undefined,
    keys: () => [...objects.keys()].sort(),
    puts: () => calls.filter((call) => call.op === "put").map((call) => call.key),
    text: (key) => {
      const bytes = objects.get(key);
      return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
    },
    async put(key, value) {
      const refused = bucket.refuse?.("put", key) ?? false;
      calls.push({ op: "put", key, failed: refused });
      if (refused) throw new Error("R2 refused the write");
      objects.set(key, typeof value === "string" ? new TextEncoder().encode(value) : value.slice());
      uploaded.set(key, now());
    },
    async get(key): Promise<R2ObjectBodyLike | null> {
      calls.push({ op: "get", key, failed: false });
      const bytes = objects.get(key);
      return bytes === undefined ? null : { size: bytes.length, body: bodyOf(bytes) };
    },
    async head(key): Promise<R2ObjectLike | null> {
      calls.push({ op: "head", key, failed: false });
      const bytes = objects.get(key);
      return bytes === undefined
        ? null
        : { size: bytes.length, uploaded: uploaded.get(key) ?? now() };
    },
    async delete(key) {
      const refused = bucket.refuse?.("delete", key) ?? false;
      calls.push({ op: "delete", key, failed: refused });
      if (refused) throw new Error("R2 refused the delete");
      objects.delete(key);
      uploaded.delete(key);
    },
    async list({ prefix = "", cursor, limit = 1000 }): Promise<R2ListPageLike> {
      calls.push({ op: "list", key: prefix, failed: false });
      // Key order, as R2 lists; the cursor is the last key of the page before.
      const keys = bucket
        .keys()
        .filter((key) => key.startsWith(prefix) && (cursor === undefined || key > cursor));
      const page = keys.slice(0, limit);
      const objectsOfPage = page.map((key) => ({ key, uploaded: uploaded.get(key) ?? now() }));
      const last = page[page.length - 1];
      return keys.length > page.length && last !== undefined
        ? { objects: objectsOfPage, truncated: true, cursor: last }
        : { objects: objectsOfPage, truncated: false };
    },
  };
  return bucket;
}
