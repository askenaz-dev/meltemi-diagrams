// The helpers of the browser suite, tested on their own: they are what the suite stands on, and a
// wrong one would make it pass for the wrong reason. Nothing here starts a process or a socket.

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { verifyEventSignature } from "@meltemi/identity";
import { testJwks, testKeys } from "@meltemi/identity/testing";
import { describe, expect, it } from "vitest";
import {
  TOKEN_SHAPE,
  assertBase32IsTheRfcs,
  base32,
  expectedCheck,
  outside,
  signedEvent,
  socketsOutside,
} from "./support.js";
import { ADMIN_SUB, CLOUD, IDENTITY, devVars, parseJsonc, testConfig } from "./worker.js";

describe("parseJsonc", () => {
  it("drops comments and trailing commas outside strings only", () => {
    const text = `{
      // a line comment
      "url": "https://example.com/a//b", /* a block comment */
      "text": "a \\" quote, and a comma,",
      "list": [1, 2, ],
      "nested": { "x": "/* not a comment */", },
    }`;
    expect(parseJsonc(text)).toEqual({
      url: "https://example.com/a//b",
      text: 'a " quote, and a comma,',
      list: [1, 2],
      nested: { x: "/* not a comment */" },
    });
  });

  it("drops a trailing comma that comments separate from the closing bracket", () => {
    const text = `{
      "a": [1, // one
        2, /* two */
        // nothing more
      ],
      "b": { "c": 3, // the last one
        /* and a block comment */ },
      // the last property of the file
    }`;
    expect(parseJsonc(text)).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it("reads the deployed configuration", () => {
    const deployed = parseJsonc(readFileSync(join(CLOUD, "wrangler.jsonc"), "utf8"));
    expect(deployed["main"]).toBe("src/worker.ts");
  });

  it("reads the configuration of the publish host, which ends with a note and no property", () => {
    const publish = parseJsonc(readFileSync(join(CLOUD, "wrangler.publish.jsonc"), "utf8"));
    expect(publish["main"]).toBe("src/publish-worker.ts");
  });
});

describe("testConfig", () => {
  const deployed = parseJsonc(readFileSync(join(CLOUD, "wrangler.jsonc"), "utf8"));
  const config = testConfig(deployed);
  const vars = config["vars"] as Record<string, unknown>;

  it("points at the Worker, the page's build and the migrations by absolute paths", () => {
    expect(isAbsolute(String(config["main"]))).toBe(true);
    expect(String(config["main"]).replaceAll("\\", "/")).toMatch(
      /\/packages\/cloud\/src\/worker\.ts$/,
    );
    const assets = config["assets"] as Record<string, unknown>;
    expect(isAbsolute(String(assets["directory"]))).toBe(true);
    expect(String(assets["directory"]).replaceAll("\\", "/")).toMatch(
      /\/packages\/playground\/dist$/,
    );
    expect(assets).toMatchObject({ binding: "ASSETS" });
    // The Worker runs first for its own paths only, as deployed: the rest is the assets platform's.
    expect(assets["run_worker_first"]).toEqual(
      (deployed["assets"] as Record<string, unknown>)["run_worker_first"],
    );
    expect(assets["run_worker_first"]).toContain("/api/*");
    const [database] = config["d1_databases"] as Record<string, unknown>[];
    expect(database).toMatchObject({ binding: "DB" });
    expect(isAbsolute(String(database?.["migrations_dir"]))).toBe(true);
  });

  it("serves the assets from the folder it is given, a copy of the build, and keeps the rest of them as they are", () => {
    const site = resolve(tmpdir(), "a-copy-of-the-build");
    const copied = testConfig(deployed, site);
    expect(copied["assets"]).toEqual({ ...(config["assets"] as object), directory: site });
    expect({ ...copied, assets: undefined }).toEqual({ ...config, assets: undefined });
  });

  it("keeps the rooms: the Durable Object binding and its SQLite migration, and the sources of the workspace packages by absolute paths", () => {
    expect(config["durable_objects"]).toEqual({
      bindings: [{ name: "ROOMS", class_name: "ProjectRoom" }],
    });
    expect(config["migrations"]).toEqual([{ tag: "v1", new_sqlite_classes: ["ProjectRoom"] }]);
    const alias = config["alias"] as Record<string, string>;
    expect(Object.keys(alias).length).toBeGreaterThan(0);
    for (const path of Object.values(alias)) expect(isAbsolute(path)).toBe(true);
    expect(alias["@meltemi/diagrams-project"]?.replaceAll("\\", "/")).toMatch(
      /\/packages\/project\/src\/index\.ts$/,
    );
  });

  it("has a name of its own, no development port and the local identity service as issuer", () => {
    expect(config["name"]).not.toBe(deployed["name"]);
    expect(config).not.toHaveProperty("dev");
    expect(config).not.toHaveProperty("$schema");
    expect(vars["IDENTITY_ISSUER"]).toBe(IDENTITY);
    expect(vars["IDENTITY_JWKS_URL"]).toBe(`${IDENTITY}/.well-known/jwks.json`);
    expect(vars["ORIGIN"]).toBe((deployed["vars"] as Record<string, unknown>)["ORIGIN"]);
  });

  it("never holds DEV or the key set: they belong to .dev.vars", () => {
    expect(Object.keys(vars)).not.toContain("DEV");
    expect(Object.keys(vars)).not.toContain("IDENTITY_JWKS");
    expect(() => testConfig({ ...deployed, vars: { ...(vars as object), DEV: "true" } })).toThrow(
      /DEV/,
    );
    expect(() =>
      testConfig({ ...deployed, vars: { ...(vars as object), IDENTITY_JWKS: "{}" } }),
    ).toThrow(/IDENTITY_JWKS/);
  });

  it("leaves the object it was made from as it was", () => {
    const text = readFileSync(join(CLOUD, "wrangler.jsonc"), "utf8");
    const fresh = parseJsonc(text);
    testConfig(fresh);
    expect(fresh).toEqual(parseJsonc(text));
  });
});

describe("devVars", () => {
  it("writes DEV, the identity settings, the secrets, the key set and the administrator, each quoted on one line", async () => {
    const keys = await testKeys();
    const lines = devVars(keys, "events-secret-for-the-test").trim().split("\n");
    const values = new Map(
      lines.map((line) => {
        const [, name, value] = /^([A-Z_]+)='(.*)'$/.exec(line) ?? [];
        return [name, value] as const;
      }),
    );
    expect([...values.keys()]).toEqual([
      "DEV",
      "IDENTITY_ISSUER",
      "IDENTITY_JWKS_URL",
      "IDENTITY_EVENTS_SECRET",
      "FORMS_SECRET",
      "IDENTITY_JWKS",
      "ADMIN_SUBS",
    ]);
    expect(values.get("DEV")).toBe("true");
    // One administrator, the sub the publishing scenarios take pages down with.
    expect(values.get("ADMIN_SUBS")).toBe(ADMIN_SUB);
    expect(values.get("IDENTITY_ISSUER")).toBe(IDENTITY);
    expect(values.get("IDENTITY_EVENTS_SECRET")).toBe("events-secret-for-the-test");
    expect(values.get("FORMS_SECRET")).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(JSON.parse(values.get("IDENTITY_JWKS") ?? "")).toEqual(testJwks(keys));
  });

  it("makes up a new forms secret each time", async () => {
    const keys = await testKeys();
    const forms = (text: string) => /FORMS_SECRET='(.*)'/.exec(text)?.[1];
    expect(forms(devVars(keys, "a"))).not.toBe(forms(devVars(keys, "a")));
  });
});

describe("the check of the approval page", () => {
  it("encodes with the vectors of RFC 4648", () => {
    expect(() => assertBase32IsTheRfcs()).not.toThrow();
    expect(base32(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]))).toBe("77777777");
    expect(base32(new Uint8Array([0, 0, 0, 0, 0]))).toBe("AAAAAAAA");
  });

  it("is the first six characters of the base32 of the SHA-256 of the state", () => {
    // SHA-256("abc") = ba7816bf…: 10111 01001 11100 00001 01101 01111 = X J 4 B N P.
    expect(expectedCheck("abc")).toBe("XJ4BNP");
    expect(expectedCheck("abc")).toHaveLength(6);
    expect(expectedCheck("abd")).not.toBe(expectedCheck("abc"));
  });
});

describe("tokens, events and origins", () => {
  it("recognises the shape of a token: mdg_ and 32 bytes in base64url", () => {
    expect(TOKEN_SHAPE.test(`mdg_${"A".repeat(43)}`)).toBe(true);
    expect(TOKEN_SHAPE.test(`mdg_${"A".repeat(42)}`)).toBe(false);
    expect(TOKEN_SHAPE.test(`xdg_${"A".repeat(43)}`)).toBe(false);
    expect(TOKEN_SHAPE.test(`mdg_${"+".repeat(43)}`)).toBe(false);
  });

  it("signs an event the way the reference verifier reads it", async () => {
    const event = { id: "evt_1", type: "user.deleted", sub: "u1", at: "2026-10-14T12:00:00.000Z" };
    const signed = signedEvent("the secret", event);
    expect(signed.body).toBe(JSON.stringify(event));
    expect(signed.headers["Meltemi-Event-Id"]).toBe("evt_1");
    const signature = signed.headers["Meltemi-Signature"] ?? null;
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(await verifyEventSignature("the secret", signed.body, signature)).toBe(true);
    expect(await verifyEventSignature("another secret", signed.body, signature)).toBe(false);
    expect(await verifyEventSignature("the secret", `${signed.body} `, signature)).toBe(false);
  });

  it("finds the requests that left the allowed origins", () => {
    const requests = [
      "http://localhost:8788/",
      "http://localhost:8788/api/session",
      "http://127.0.0.1:50000/?code=c",
      "https://elsewhere.example/a.png",
      "http://localhost:8789/",
    ];
    expect(outside(requests, ["http://localhost:8788"])).toEqual([
      "http://127.0.0.1:50000/?code=c",
      "https://elsewhere.example/a.png",
      "http://localhost:8789/",
    ]);
    expect(outside(requests, ["http://localhost:8788", "http://127.0.0.1:50000"])).toEqual([
      "https://elsewhere.example/a.png",
      "http://localhost:8789/",
    ]);
  });

  it("finds the sockets that were opened to another host than the Worker's", () => {
    const sockets = [
      "ws://localhost:8788/rooms/abc",
      "wss://localhost:8788/rooms/abc",
      "ws://localhost:8789/rooms/abc",
      "wss://evil.example/rooms/abc",
    ];
    expect(socketsOutside(sockets, "http://localhost:8788")).toEqual([
      "ws://localhost:8789/rooms/abc",
      "wss://evil.example/rooms/abc",
    ]);
    expect(socketsOutside([], "http://localhost:8788")).toEqual([]);
  });
});
