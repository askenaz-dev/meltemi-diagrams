// A stand-in for `fetch` for the tests of the page's calls to the cloud service: it answers as the
// test says and remembers what it was asked. Nothing here touches the network.

import type { Fetch } from "../../src/cloud/http.js";

/** One call the page made. */
export interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

export interface FakeFetch {
  readonly fetch: Fetch;
  /** Every call, in order. */
  readonly calls: Call[];
}

/** A `fetch` that answers each call with `answer(call)` and keeps the calls. */
export function fakeFetch(answer: (call: Call) => Response | Promise<Response>): FakeFetch {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (url, init = {}) => {
      const call = { url, init };
      calls.push(call);
      return Promise.resolve(answer(call));
    },
  };
}

/** A response with a JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A response with a text body of the given type (a page, a plain message). */
export function textResponse(body: string, status = 200, type = "text/plain"): Response {
  return new Response(body, { status, headers: { "content-type": type } });
}

/** An answer that never comes until the request is aborted, as the real `fetch` behaves. */
export function hangsUntilAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

/** A response whose body fails halfway, as a dropped connection does. */
export function unreadableResponse(status = 200): Response {
  return new Response(
    new ReadableStream({ start: (controller) => controller.error(new TypeError("terminated")) }),
    { status },
  );
}
