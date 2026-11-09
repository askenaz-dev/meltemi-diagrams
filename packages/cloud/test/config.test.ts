// The deployed configuration (`wrangler.jsonc`) and what the Worker reads of its environment.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@meltemi/diagrams-mcp";
import { ConfigError, publishHostOf, readConfig, readIdentity } from "../src/config.js";
import { parseJsonc } from "./browser/worker.js";
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

  it("defines no secret: the four are bindings of the family's Secrets Store", () => {
    for (const key of [
      "IDENTITY_EVENTS_SECRET",
      "FORMS_SECRET",
      "ADMIN_SUBS",
      "SPONSORS_WEBHOOK_SECRET",
    ]) {
      expect(Object.keys(vars)).not.toContain(key);
    }
    const stored = wrangler["secrets_store_secrets"] as Record<string, unknown>[];
    expect(stored.map((binding) => binding["secret_name"]).sort()).toEqual([
      "ADMIN_SUBS",
      "FORMS_SECRET",
      "IDENTITY_EVENTS_SECRET",
      "SPONSORS_WEBHOOK_SECRET",
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
        "/.well-known/*",
        "/api/*",
        "/_identity/*",
        "/_published/*",
        "/_sponsors/*",
        "/cli-auth",
        "/cli-auth/*",
        "/mcp",
        "/mcp/*",
        "/oauth/*",
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
    expect(first.filter((path) => !path.endsWith("/*"))).toEqual(["/cli-auth", "/mcp"]);
  });

  it("has no address but the Custom Domain the family's Terraform attaches", () => {
    expect(wrangler).not.toHaveProperty("routes");
    expect(wrangler).not.toHaveProperty("route");
    expect(wrangler).not.toHaveProperty("account_id");
    expect(wrangler["workers_dev"]).toBe(false);
    expect(wrangler["preview_urls"]).toBe(false);
  });

  it("binds the rooms as ROOMS and the renderers as RENDERERS, Durable Object classes with SQLite storage that this Worker exports", () => {
    expect(wrangler["durable_objects"]).toEqual({
      bindings: [
        { name: "ROOMS", class_name: "ProjectRoom" },
        { name: "RENDERERS", class_name: "ProjectRenderer" },
      ],
    });
    // A migration is never edited once deployed: the renderer's class is a migration of its own.
    expect(wrangler["migrations"]).toEqual([
      { tag: "v1", new_sqlite_classes: ["ProjectRoom"] },
      { tag: "v2", new_sqlite_classes: ["ProjectRenderer"] },
    ]);
    const entry = readFileSync(new URL("src/worker.ts", PACKAGE), "utf8");
    expect(entry).toMatch(/export \{ ProjectRoom \} from "\.\/room\.js";/);
    expect(entry).toMatch(/export \{ ProjectRenderer \} from "\.\/renderer\.js";/);
  });

  it("loads the renderer's fonts as data and its JSON as text, and nothing else differently", () => {
    expect(wrangler["rules"]).toEqual([
      { type: "Data", globs: ["**/*.woff2", "**/*.woff"], fallthrough: true },
      { type: "Text", globs: ["**/*.json"], fallthrough: true },
    ]);
    // Text is right for every JSON module of the Worker: only the renderer's bundle imports any.
    const sources = readdirSync(new URL("src/", PACKAGE)).filter((f) => /\.(ts|js)$/.test(f));
    const importers = sources.filter((file) =>
      /\bimport\b[^;]*["'][^"']+\.json["']/.test(
        readFileSync(new URL(`src/${file}`, PACKAGE), "utf8"),
      ),
    );
    expect(importers).toEqual(["renderer-bundle.js"]);
  });

  it("binds the R2 bucket as BLOBS, the one place blobs and thumbnails are kept", () => {
    expect(wrangler["r2_buckets"]).toEqual([
      { binding: "BLOBS", bucket_name: "meltemi-diagrams-blobs" },
    ]);
  });

  it.each(["wrangler.jsonc", "wrangler.local.jsonc"])(
    "builds the workspace packages of the Worker's closure from their sources, so that no stale build is bundled (%s)",
    (configFile) => {
      const alias = (readJsonc(configFile)["alias"] ?? {}) as Record<string, string>;
      type Manifest = {
        dependencies?: Record<string, string>;
        exports?: Record<string, Record<string, string>>;
      };
      const manifestOf = (folder: string) =>
        JSON.parse(readFileSync(new URL(`../${folder}/package.json`, PACKAGE), "utf8")) as Manifest;
      // Every package the Worker imports, and every workspace package those import in turn.
      const closure = new Set<string>();
      const visit = (name: string): void => {
        if (closure.has(name)) return;
        closure.add(name);
        const manifest = manifestOf(name.replace("@meltemi/diagrams-", ""));
        for (const dependency of Object.keys(manifest.dependencies ?? {})) {
          if (dependency.startsWith("@meltemi/diagrams-")) visit(dependency);
        }
      };
      for (const dependency of Object.keys(
        (JSON.parse(readFileSync(new URL("package.json", PACKAGE), "utf8")) as Manifest)
          .dependencies ?? {},
      )) {
        if (dependency.startsWith("@meltemi/diagrams-")) visit(dependency);
      }
      // The subpaths their sources and the Worker's own import (`@meltemi/diagrams-layout/viewport`,
      // `@meltemi/diagrams-mcp/preview`): an alias of a package would make them
      // `<its index>/viewport`, so each has an alias of its own.
      const subpaths = new Set<string>();
      const scan = (folder: URL): void => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          if (entry.isDirectory()) scan(new URL(`${entry.name}/`, folder));
          else if (entry.name.endsWith(".ts")) {
            const text = readFileSync(new URL(entry.name, folder), "utf8");
            for (const match of text.matchAll(/from "(@meltemi\/diagrams-[a-z0-9-]+\/[a-z-]+)"/g)) {
              subpaths.add(match[1]!);
            }
          }
        }
      };
      for (const name of closure)
        scan(new URL(`../${name.replace("@meltemi/diagrams-", "")}/src/`, PACKAGE));
      scan(new URL("src/", PACKAGE));
      // `/node` entries are the Node hosts of packages the Worker gives its own readers to.
      const wanted = [...subpaths].filter((path) => !path.endsWith("/node"));

      expect(Object.keys(alias).sort()).toEqual([...closure, ...wanted].sort());
      for (const [name, path] of Object.entries(alias)) {
        const [, folder, sub] = /^@meltemi\/diagrams-([a-z0-9-]+?)(?:\/([a-z-]+))?$/.exec(name)!;
        const source = sub
          ? manifestOf(folder!).exports?.[`./${sub}`]?.["@meltemi/diagrams-source"]?.replace(
              /^\.\//,
              "",
            )
          : "src/index.ts";
        expect(path, name).toBe(`../${folder}/${source}`);
        expect(existsSync(new URL(path, PACKAGE)), name).toBe(true);
      }
    },
  );

  it("keeps the offline runtime's exact tool-count gate aligned with the registered catalogue", () => {
    const offline = readFileSync(new URL("../../scripts/local/check-offline.mjs", PACKAGE), "utf8");
    const count = /assert\.equal\(\(await client\.listTools\(\)\)\.tools\.length, (\d+)\);/.exec(
      offline,
    );
    expect(count, "the offline check must assert the complete catalogue size").not.toBeNull();
    expect(Number(count![1])).toBe(CATALOGUE.length);
    expect(CATALOGUE.some((tool) => tool.name === "inspect_story")).toBe(true);
  });

  it("binds the database as DB and names the identity service", () => {
    const databases = wrangler["d1_databases"] as { binding: string }[];
    expect(databases.map((d) => d.binding)).toEqual(["DB"]);
    expect(vars["IDENTITY_ISSUER"]).toBe("https://id.meltemi.dev");
    expect(vars["IDENTITY_JWKS_URL"]).toBe("https://id.meltemi.dev/.well-known/jwks.json");
    expect(vars["ORIGIN"]).toBe("https://diagrams.meltemi.dev");
  });

  it("signs its identity calls as the product diagrams, which PRODUCT_NAME names", () => {
    expect(vars["PRODUCT_NAME"]).toBe("diagrams");
    const config = (env: Parameters<typeof testEnv>[0]) =>
      readConfig(testEnv(env), new Request("https://diagrams.meltemi.dev/"));
    expect(config({}).productName).toBe("diagrams");
    expect(config({ PRODUCT_NAME: " diagrams-staging " }).productName).toBe("diagrams-staging");
    expect(config({ PRODUCT_NAME: "" }).productName).toBe("diagrams");
  });

  it("binds no KV namespace: the authorization server keeps its state in D1 (oauth_store)", () => {
    expect(wrangler["kv_namespaces"]).toBeUndefined();
    const publish = parseJsonc(
      readFileSync(new URL("wrangler.publish.jsonc", PACKAGE), "utf8"),
    ) as Record<string, unknown>;
    expect(publish["kv_namespaces"]).toBeUndefined();
    expect(readFileSync(new URL("migrations/0010_oauth_store.sql", PACKAGE), "utf8")).toMatch(
      /^CREATE TABLE oauth_store \(/m,
    );
  });

  it("keeps the Worker's own log lines and no invocation logs, in both Workers", () => {
    // An invocation log records every request's address, and some grant access
    // (`/api/invitations/<token>/accept`, a page opened with `?invite=` or `?live=`).
    const publish = parseJsonc(
      readFileSync(new URL("wrangler.publish.jsonc", PACKAGE), "utf8"),
    ) as Record<string, unknown>;
    for (const config of [wrangler, publish]) {
      expect(config["observability"]).toEqual({
        enabled: true,
        logs: { enabled: true, invocation_logs: false },
      });
    }
  });

  it("fetches client-id metadata documents strictly on the public internet", () => {
    expect(wrangler["compatibility_flags"]).toEqual(["global_fetch_strictly_public"]);
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

  it("ships with no sponsored account: no donation path until the owner's steps on GitHub are done", () => {
    // The owner sets the login (`askenaz`) once the Sponsors profile and its webhook exist
    // (docs/cloud.md, "Sponsorships"); until then the route answers 404 and the page shows nothing.
    expect(vars["SPONSORS_ACCOUNT"]).toBe("");
    const config = readConfig(
      testEnv({ SPONSORS_ACCOUNT: String(vars["SPONSORS_ACCOUNT"]) }),
      new Request("https://diagrams.meltemi.dev/"),
    );
    expect(config.sponsorsAccount).toBeUndefined();
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
      "SPONSORS_ACCOUNT",
      "SPONSORS_WEBHOOK_SECRET",
      "PRODUCT_NAME",
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

  it.each([
    [undefined, undefined],
    ["", undefined],
    ["  ", undefined],
    [" askenaz ", "askenaz"],
    ["Ana-Dev", "Ana-Dev"],
    ["https://github.com/askenaz", undefined],
    ["-ana", undefined],
    ["a".repeat(40), undefined],
  ])("reads SPONSORS_ACCOUNT %j as the sponsored account %j", (SPONSORS_ACCOUNT, account) => {
    const config = configOf(SPONSORS_ACCOUNT === undefined ? {} : { SPONSORS_ACCOUNT });
    expect(config.sponsorsAccount).toBe(account);
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
