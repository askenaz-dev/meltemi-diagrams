import { afterEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TIMEOUT_MS, inPage, isObject, parseObject, send } from "../src/cloud/http.js";
import {
  fakeFetch,
  hangsUntilAborted,
  textResponse,
  unreadableResponse,
} from "./support/fake-fetch.js";

const URL_OF_CALL = "https://diagrams.meltemi.dev/api/anything";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("send", () => {
  it("gives the status and the body as text, whatever type the server says the body has", async () => {
    // A static server calls an extensionless file `application/octet-stream`; a proxy may say HTML.
    for (const type of ["application/json", "application/octet-stream", "text/html"]) {
      const { fetch } = fakeFetch(() => textResponse('{"a":1}', 201, type));
      expect(await send(fetch, URL_OF_CALL)).toEqual({ status: 201, text: '{"a":1}' });
    }
  });

  it("asks for the page's own origin with its cookie and no cache, whatever the caller passes", async () => {
    const { fetch, calls } = fakeFetch(() => textResponse("ok"));
    await send(fetch, URL_OF_CALL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
      cache: "force-cache",
    });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(URL_OF_CALL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe("{}");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("gives nothing, and throws nothing, when the service cannot be reached or read", async () => {
    const failures: [string, () => Response | Promise<Response>][] = [
      ["rejects", () => Promise.reject(new TypeError("Failed to fetch"))],
      ["rejects with a string", () => Promise.reject("offline")],
      [
        "throws at once",
        () => {
          throw new Error("boom");
        },
      ],
      ["answers a body that fails halfway", () => unreadableResponse()],
    ];
    for (const [label, answer] of failures) {
      const { fetch } = fakeFetch(answer);
      expect(await send(fetch, URL_OF_CALL), label).toBeUndefined();
    }
  });

  it("writes nothing to the console when it fails", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await send(fetch, URL_OF_CALL);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("gives up after the timeout and aborts the request", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch(({ init }) => hangsUntilAborted(init.signal));
    const pending = send(fetch, URL_OF_CALL);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(calls[0]!.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeUndefined();
    expect(calls[0]!.init.signal?.aborted).toBe(true);
  });

  it("takes the timeout the caller asks for", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch(({ init }) => hangsUntilAborted(init.signal));
    const pending = send(fetch, URL_OF_CALL, {}, 250);
    await vi.advanceTimersByTimeAsync(249);
    expect(calls[0]!.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeUndefined();
  });

  it("keeps the timer running while the body is read, and clears it when it is done", async () => {
    vi.useFakeTimers();
    // The headers arrive; the body never does until the request is aborted.
    const stalled = fakeFetch(({ init }) => {
      const response = textResponse("");
      vi.spyOn(response, "text").mockImplementation(async () => {
        await hangsUntilAborted(init.signal);
        return "";
      });
      return response;
    });
    const pending = send(stalled.fetch, URL_OF_CALL, {}, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBeUndefined();

    const prompt = fakeFetch(() => textResponse("done"));
    expect(await send(prompt.fetch, URL_OF_CALL)).toEqual({ status: 200, text: "done" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the call fails", async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await send(fetch, URL_OF_CALL)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("parseObject and isObject", () => {
  it("reads a JSON object", () => {
    expect(parseObject('{"user":null}')).toEqual({ user: null });
    expect(parseObject(' {"a": [1, 2], "b": {"c": true}} ')).toEqual({
      a: [1, 2],
      b: { c: true },
    });
    expect(parseObject("{}")).toEqual({});
  });

  it("gives nothing for any other JSON, for text that is not JSON and for nothing", () => {
    for (const text of [
      "[]",
      '[{"user":null}]',
      "null",
      "true",
      "0",
      '"text"',
      "",
      "   ",
      "{",
      '{"user":',
      "<!doctype html><title>x</title>",
      "undefined",
      "{'user': null}",
    ]) {
      expect(parseObject(text), JSON.stringify(text)).toBeUndefined();
    }
  });

  it("tells an object from everything else", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    for (const value of [null, undefined, [], [1], "x", 1, true, () => ({})]) {
      expect(isObject(value)).toBe(false);
    }
  });
});

describe("inPage", () => {
  it("puts an address beside the page, whatever its file, query or fragment", () => {
    expect(inPage("https://diagrams.meltemi.dev/", "api/session")).toBe(
      "https://diagrams.meltemi.dev/api/session",
    );
    expect(inPage("http://127.0.0.1:4173/index.html", "api/session")).toBe(
      "http://127.0.0.1:4173/api/session",
    );
    expect(inPage("https://host.example/play/index.html?project=abc", "api/tokens")).toBe(
      "https://host.example/play/api/tokens",
    );
    expect(inPage("https://host.example/play/", "api/tokens/t%2F1")).toBe(
      "https://host.example/play/api/tokens/t%2F1",
    );
  });

  it("throws for a page that is not an address, which the callers catch", () => {
    expect(() => inPage("not an address", "api/session")).toThrow();
  });
});
