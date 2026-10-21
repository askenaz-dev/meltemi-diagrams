// The secrets of the Worker: in production they are Secrets Store bindings named `<NAME>_STORE`,
// read once per isolate; in development and in the tests they are the strings of `.dev.vars`,
// which always win. `resolveSecrets` turns the first into the second at the Worker's entry.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetSecrets, resolveSecrets, type StoredSecret } from "../src/secrets.js";
import worker from "../src/worker-handler.js";
import { jsonOf, testEnv } from "./support/index.js";
import type { Env } from "../src/env.js";

/** A store binding that counts its calls, answering `value` or failing when it is undefined. */
function stored(value: string | undefined): StoredSecret & { calls: number } {
  const binding = {
    calls: 0,
    get() {
      binding.calls += 1;
      return value === undefined
        ? Promise.reject(new Error("secret not found"))
        : Promise.resolve(value);
    },
  };
  return binding;
}

let errors: string[];

beforeEach(() => {
  forgetSecrets();
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    errors.push(parts.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveSecrets", () => {
  it("returns a development string and never calls its binding", async () => {
    const binding = stored("from-the-store");
    const env = await resolveSecrets({
      FORMS_SECRET: "from-dev-vars",
      FORMS_SECRET_STORE: binding,
    });
    expect(env.FORMS_SECRET).toBe("from-dev-vars");
    expect(binding.calls).toBe(0);
  });

  it("reads each secret from its binding once in the isolate", async () => {
    const binding = stored("stored");
    for (let i = 0; i < 3; i++) {
      const env = await resolveSecrets<Record<string, unknown>>({
        IDENTITY_EVENTS_SECRET_STORE: binding,
      });
      expect(env["IDENTITY_EVENTS_SECRET"]).toBe("stored");
    }
    expect(binding.calls).toBe(1);
  });

  it("keeps the store's single space for nobody, which the administrators' list reads as empty", async () => {
    const env = await resolveSecrets<Record<string, unknown>>({ ADMIN_SUBS_STORE: stored(" ") });
    expect(env["ADMIN_SUBS"]).toBe(" ");
  });

  it("names a secret its binding cannot give, never a value, and asks again next time", async () => {
    const failing = stored(undefined);
    const env = await resolveSecrets<Record<string, unknown>>({ FORMS_SECRET_STORE: failing });
    expect(env["FORMS_SECRET"]).toBeUndefined();
    expect(errors.join("\n")).toContain("cloud: the secret FORMS_SECRET could not be read");
    await resolveSecrets<Record<string, unknown>>({ FORMS_SECRET_STORE: failing });
    expect(failing.calls).toBe(2);
  });
});

describe("the Worker's entry", () => {
  const SESSION = "https://diagrams.meltemi.dev/api/session";

  it("serves with the secrets of the store when no string is set", async () => {
    const env = {
      ...testEnv({ FORMS_SECRET: "", IDENTITY_EVENTS_SECRET: "" }),
      FORMS_SECRET_STORE: stored("forms"),
      IDENTITY_EVENTS_SECRET_STORE: stored("events"),
      ADMIN_SUBS_STORE: stored(" "),
    } as Env & Record<string, unknown>;
    const response = await worker.fetch(new Request(SESSION), env);
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toMatchObject({ user: null });
    expect(errors).toEqual([]);
  });

  it("answers what it can when a binding fails, and logs the secret's name only", async () => {
    const env = {
      ...testEnv({ ADMIN_SUBS: undefined }),
      ADMIN_SUBS_STORE: stored(undefined),
    } as Env & Record<string, unknown>;
    const response = await worker.fetch(new Request(SESSION), env);
    expect(response.status).toBe(200);
    expect(errors.join("\n")).toContain("ADMIN_SUBS");
  });
});
