// The deployed configuration (`wrangler.jsonc`) and what the Worker reads of its environment.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, publishHostOf, readConfig, readIdentity } from "../src/config.js";
import { testEnv } from "./support/index.js";

const PACKAGE = new URL("../", import.meta.url);

/** `wrangler.jsonc` without trailing commas; comments are refused so a key cannot hide in one. */
function readJsonc(path: string): Record<string, unknown> {
  const text = readFileSync(new URL(path, PACKAGE), "utf8");
  // Strings may hold `/*` (the paths of `run_worker_first`); comments live outside them.
  const outsideStrings = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  expect(text, `${path} holds comments`).not.toBe("");
  expect(outsideStrings, `${path} holds comments`).not.toMatch(/^\s*\/\/|\/\*/m);
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

describe("wrangler.jsonc", () => {
  const wrangler = readJsonc("wrangler.jsonc");
  const vars = (wrangler["vars"] ?? {}) as Record<string, unknown>;

  it("defines neither DEV nor IDENTITY_JWKS, anywhere in the file", () => {
    const text = readFileSync(new URL("wrangler.jsonc", PACKAGE), "utf8");
    for (const key of ["DEV", "IDENTITY_JWKS"]) {
      expect(Object.keys(vars), `vars.${key}`).not.toContain(key);
      expect(text, `the file names ${key}`).not.toMatch(new RegExp(`"${key}"\\s*:`));
    }
  });

  it("defines no secret: the three are bindings of the family's Secrets Store", () => {
    for (const key of ["IDENTITY_EVENTS_SECRET", "FORMS_SECRET", "ADMIN_SUBS"]) {
      expect(Object.keys(vars)).not.toContain(key);
    }
    const stored = wrangler["secrets_store_secrets"] as Record<string, unknown>[];
    expect(stored.map((binding) => binding["secret_name"]).sort()).toEqual([
      "ADMIN_SUBS",
      "FORMS_SECRET",
      "IDENTITY_EVENTS_SECRET",
    ]);
    for (const binding of stored) {
      expect(binding["binding"]).toBe(`${String(binding["secret_name"])}_STORE`);
      expect(binding["store_id"]).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("runs first for its own paths only, with the page's build as assets, on port 8788", () => {
    expect(wrangler["main"]).toBe("src/worker.ts");
    expect(wrangler["assets"]).toEqual({
      directory: "../playground/dist",
      binding: "ASSETS",
      not_found_handling: "none",
      run_worker_first: [
        "/api/*",
        "/_identity/*",
        "/_published/*",
        "/cli-auth",
        "/cli-auth/*",
        "/p/*",
        "/rooms/*",
      ],
    });
    expect(wrangler["dev"]).toEqual({ port: 8788 });
  });

  it("runs first for every path the handler reserves, and only those", () => {
    const handler = readFileSync(new URL("src/handler.ts", PACKAGE), "utf8");
    const reserved = /const RESERVED = \/\^\\\/\(([^)]+)\)/.exec(handler)?.[1]?.split("|");
    expect(reserved, "RESERVED in handler.ts").toBeDefined();
    const first = (wrangler["assets"] as { run_worker_first: string[] }).run_worker_first;
    for (const name of reserved!) {
      expect(first, name).toContain(`/${name}/*`);
    }
    expect(first.filter((path) => !path.endsWith("/*"))).toEqual(["/cli-auth"]);
  });

  it("has no address but the Custom Domain the family's Terraform attaches", () => {
    expect(wrangler).not.toHaveProperty("routes");
    expect(wrangler).not.toHaveProperty("route");
    expect(wrangler).not.toHaveProperty("account_id");
    expect(wrangler["workers_dev"]).toBe(false);
    expect(wrangler["preview_urls"]).toBe(false);
  });

  it("binds the rooms as ROOMS, a Durable Object class with SQLite storage that this Worker exports", () => {
    expect(wrangler["durable_objects"]).toEqual({
      bindings: [{ name: "ROOMS", class_name: "ProjectRoom" }],
    });
    expect(wrangler["migrations"]).toEqual([{ tag: "v1", new_sqlite_classes: ["ProjectRoom"] }]);
    const entry = readFileSync(new URL("src/worker.ts", PACKAGE), "utf8");
    expect(entry).toMatch(/export \{ ProjectRoom \} from "\.\/room\.js";/);
  });

  it("binds the R2 bucket as BLOBS, the one place blobs and thumbnails are kept", () => {
    expect(wrangler["r2_buckets"]).toEqual([
      { binding: "BLOBS", bucket_name: "meltemi-diagrams-blobs" },
    ]);
  });

  it("builds the workspace packages of the project package's closure from their sources, so that no stale build is bundled", () => {
    const alias = (wrangler["alias"] ?? {}) as Record<string, string>;
    // Every package the Worker imports, and every workspace package those import in turn.
    const closure = new Set<string>();
    const visit = (name: string): void => {
      if (closure.has(name)) return;
      closure.add(name);
      const folder = name.replace("@meltemi/diagrams-", "");
      const manifest = JSON.parse(
        readFileSync(new URL(`../${folder}/package.json`, PACKAGE), "utf8"),
      ) as { dependencies?: Record<string, string> };
      for (const dependency of Object.keys(manifest.dependencies ?? {})) {
        if (dependency.startsWith("@meltemi/diagrams-")) visit(dependency);
      }
    };
    visit("@meltemi/diagrams-project");

    expect(Object.keys(alias).sort()).toEqual([...closure].sort());
    for (const [name, path] of Object.entries(alias)) {
      const folder = name.replace("@meltemi/diagrams-", "");
      expect(path, name).toBe(`../${folder}/src/index.ts`);
      expect(existsSync(new URL(path, PACKAGE)), name).toBe(true);
    }
  });

  it("binds the database as DB and names the identity service", () => {
    const databases = wrangler["d1_databases"] as { binding: string }[];
    expect(databases.map((d) => d.binding)).toEqual(["DB"]);
    expect(vars["IDENTITY_ISSUER"]).toBe("https://id.meltemi.dev");
    expect(vars["IDENTITY_JWKS_URL"]).toBe("https://id.meltemi.dev/.well-known/jwks.json");
    expect(vars["ORIGIN"]).toBe("https://diagrams.meltemi.dev");
  });

  it("publishes at meltemi.page, a host the service accepts", () => {
    const host = vars["PUBLISH_HOST"];
    expect(host).toBe("meltemi.page");
    const config = readConfig(
      testEnv({ PUBLISH_HOST: String(host) }),
      new Request("https://diagrams.meltemi.dev/"),
    );
    expect(() => publishHostOf(config)).not.toThrow();
  });

  it("is listed with every variable and secret in .dev.vars.example", () => {
    const example = readFileSync(new URL(".dev.vars.example", PACKAGE), "utf8");
    for (const name of [
      "DEV",
      "IDENTITY_ISSUER",
      "IDENTITY_JWKS_URL",
      "IDENTITY_EVENTS_SECRET",
      "FORMS_SECRET",
      "IDENTITY_JWKS",
      "ADMIN_SUBS",
      "PUBLISH_HOST",
    ]) {
      expect(example, name).toMatch(new RegExp(`^#?\\s*${name}=`, "m"));
    }
    expect(example).toContain("DEV=true");
  });
});

describe("readConfig", () => {
  const request = new Request("https://diagrams.meltemi.dev/");

  it("takes the origin from ORIGIN outside development", () => {
    const config = readConfig(testEnv({ ORIGIN: "https://diagrams.meltemi.dev/" }), request);
    expect(config.origin).toBe("https://diagrams.meltemi.dev");
    expect(config.host).toBe("diagrams.meltemi.dev");
    expect(config.dev).toBe(false);
  });

  it("takes the request's own origin in development, whatever ORIGIN says", () => {
    const config = readConfig(
      testEnv({
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787",
        IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
      }),
      new Request("http://localhost:8788/api/session"),
    );
    expect(config.origin).toBe("http://localhost:8788");
    expect(config.host).toBe("localhost:8788");
  });

  it.each(["1", "True", "yes", ""])("is not development for DEV=%j", (DEV) => {
    expect(readConfig(testEnv({ DEV }), request).dev).toBe(false);
  });

  it("refuses an address that is not https outside development", () => {
    expect(() => readConfig(testEnv({ ORIGIN: "http://diagrams.meltemi.dev" }), request)).toThrow(
      ConfigError,
    );
    expect(() =>
      readConfig(testEnv({ IDENTITY_ISSUER: "http://id.meltemi.dev" }), request),
    ).toThrow(/IDENTITY_ISSUER must be https/);
    expect(() => readConfig(testEnv({ IDENTITY_JWKS_URL: "nonsense" }), request)).toThrow(
      /IDENTITY_JWKS_URL is not an address/,
    );
  });

  it("accepts http addresses in development", () => {
    const config = readConfig(
      testEnv({
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787/",
        IDENTITY_JWKS_URL: "http://localhost:8787/.well-known/jwks.json",
      }),
      new Request("http://localhost:8788/"),
    );
    expect(config.issuer).toBe("http://localhost:8787");
  });

  it("reads the inline key set only in development", () => {
    const keys = '{"keys":[{"kid":"k"}]}';
    expect(readIdentity(testEnv({ IDENTITY_JWKS: keys })).inlineJwks).toBeUndefined();
    expect(readIdentity(testEnv({ IDENTITY_JWKS: keys, DEV: "false" })).inlineJwks).toBeUndefined();
    const dev = readIdentity(
      testEnv({
        IDENTITY_JWKS: keys,
        DEV: "true",
        IDENTITY_ISSUER: "http://localhost:8787",
        IDENTITY_JWKS_URL: "http://localhost:8787/jwks",
      }),
    );
    expect(dev.inlineJwks).toEqual({ keys: [{ kid: "k" }] });
  });

  it("refuses an inline key set that is not JSON, without repeating it", () => {
    const env = testEnv({
      DEV: "true",
      IDENTITY_JWKS: "secret-looking {",
      IDENTITY_ISSUER: "http://localhost:8787",
      IDENTITY_JWKS_URL: "http://localhost:8787/jwks",
    });
    expect(() => readIdentity(env)).toThrow("IDENTITY_JWKS is not JSON");
  });
});

describe("the administrators and the publish host", () => {
  const request = new Request("https://diagrams.meltemi.dev/");
  const configOf = (set: Parameters<typeof testEnv>[0] = {}) => readConfig(testEnv(set), request);

  it("lists nobody when ADMIN_SUBS is not set, or is empty or only separators", () => {
    for (const ADMIN_SUBS of [undefined, "", "  ", ",", " , ,, "]) {
      expect([...configOf(ADMIN_SUBS === undefined ? {} : { ADMIN_SUBS }).owners]).toEqual([]);
    }
  });

  it("lists the subs of ADMIN_SUBS, comma separated and trimmed, each exactly", () => {
    const { owners } = configOf({ ADMIN_SUBS: " u_7d3f ,u_9a1c,, u_7d3f , " });
    expect([...owners].sort()).toEqual(["u_7d3f", "u_9a1c"]);
    expect(owners.has("u_7d3")).toBe(false);
    expect(owners.has("U_7D3F")).toBe(false);
    expect(owners.has("")).toBe(false);
  });

  it("reads PUBLISH_HOST trimmed, and none when it is empty", () => {
    expect(configOf().publishHost).toBeUndefined();
    expect(configOf({ PUBLISH_HOST: "" }).publishHost).toBeUndefined();
    expect(configOf({ PUBLISH_HOST: "  " }).publishHost).toBeUndefined();
    expect(configOf({ PUBLISH_HOST: " meltemi.page " }).publishHost).toBe("meltemi.page");
  });

  it("does not stop the service for a PUBLISH_HOST it cannot use: only the address of a publication needs it", () => {
    expect(() => configOf({ PUBLISH_HOST: "not a host!" })).not.toThrow();
  });

  it.each(["meltemi.page", "pages.example.org", "a-b.c-d.example", "xn--bcher-kva.example", "a.b"])(
    "takes %s as the publish host",
    (PUBLISH_HOST) => {
      expect(publishHostOf(configOf({ PUBLISH_HOST }))).toBe(PUBLISH_HOST);
    },
  );

  it.each([
    ["none", undefined, /PUBLISH_HOST is not set/],
    ["an upper-case name", "Meltemi.Page", /not a host name/],
    ["a name with a scheme", "https://meltemi.page", /not a host name/],
    ["a name with a path", "meltemi.page/x", /not a host name/],
    ["a name with a port", "meltemi.page:8787", /not a host name/],
    ["a name with a space", "meltemi page", /not a host name/],
    ["a name with no dot", "localhost", /not a host name/],
    ["a name that starts with a hyphen", "-a.example", /not a host name/],
    ["a name with an empty label", "a..example", /not a host name/],
    ["a name of 254 characters", `${"a".repeat(250)}.com`, /not a host name/],
    ["the service's own host", "diagrams.meltemi.dev", /must not be a host of the service/],
    ["the family's domain, which holds the session cookie", "meltemi.dev", /family's domain/],
    ["a host under the family's domain", "pages.meltemi.dev", /family's domain/],
    ["a host deep under the family's domain", "a.b.meltemi.dev", /family's domain/],
  ])("refuses %s, naming the variable and never its value", (_name, PUBLISH_HOST, message) => {
    const config = configOf(PUBLISH_HOST === undefined ? {} : { PUBLISH_HOST });
    expect(() => publishHostOf(config)).toThrow(ConfigError);
    expect(() => publishHostOf(config)).toThrow(message);
    expect(() => publishHostOf(config)).toThrow(/PUBLISH_HOST/);
    if (PUBLISH_HOST !== undefined && PUBLISH_HOST.length > 0) {
      try {
        publishHostOf(config);
      } catch (error) {
        expect((error as Error).message).not.toContain(PUBLISH_HOST);
      }
    }
  });

  it("finds the family's domain from the identity service, not from a name fixed in the code", () => {
    // Another family: its cookie domain is the issuer's parent, whatever it is called.
    const other = configOf({
      IDENTITY_ISSUER: "https://id.example.org",
      IDENTITY_JWKS_URL: "https://id.example.org/jwks",
      ORIGIN: "https://app.example.org",
    });
    expect(() => publishHostOf({ ...other, publishHost: "pages.example.org" })).toThrow(
      /family's domain/,
    );
    expect(publishHostOf({ ...other, publishHost: "meltemi.dev" })).toBe("meltemi.dev");
  });
});
