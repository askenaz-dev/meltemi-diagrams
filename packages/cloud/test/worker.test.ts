// The Cloudflare entry. It builds the verifier from the environment before `cloud()` runs, so an
// identity setting the service cannot use must still be answered the way the handler answers a
// configuration it cannot use: an internal error with no detail, and a log line that names the
// setting and never its value.

import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker-handler.js";
import { jsonOf, testEnv } from "./support/index.js";

const SESSION = "https://diagrams.meltemi.dev/api/session";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Worker entry", () => {
  it("hands a request to the handler when the configuration is good", async () => {
    const response = await worker.fetch(new Request(SESSION), testEnv());
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({ user: null });
  });

  it.each([
    [
      "an issuer that is not https",
      { IDENTITY_ISSUER: "http://id.meltemi.dev" },
      "IDENTITY_ISSUER",
    ],
    ["a key set address that is not one", { IDENTITY_JWKS_URL: "nonsense" }, "IDENTITY_JWKS_URL"],
    [
      "an inline key set that is not JSON",
      {
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787",
        IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
        IDENTITY_JWKS: "secret-looking {",
      },
      "IDENTITY_JWKS",
    ],
  ])(
    "answers %s as an internal error, naming the setting only in the log",
    async (_name, set, name) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await worker.fetch(new Request(SESSION), testEnv(set));
      expect(response.status).toBe(500);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(await jsonOf(response)).toEqual({
        code: "internal",
        message: "Something went wrong.",
      });
      expect(logged).toHaveBeenCalledTimes(1);
      const line = String(logged.mock.calls[0]?.[0]);
      expect(line).toContain(name);
      expect(line).not.toContain("secret-looking");
    },
  );

  it("builds the verifier again once the settings are fixed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = testEnv({ IDENTITY_ISSUER: "http://id.meltemi.dev" });
    expect((await worker.fetch(new Request(SESSION), broken)).status).toBe(500);
    const fixed = testEnv();
    expect((await worker.fetch(new Request(SESSION), fixed)).status).toBe(200);
  });
});
