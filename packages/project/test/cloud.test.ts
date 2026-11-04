import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import {
  CLOUD_PROJECT_ID,
  CLOUD_SETTINGS,
  MANIFEST_FIELDS,
  cloudHostOrigin,
  createMemoryHost,
  isLoopbackHost,
  parseCloudHost,
  readManifest,
} from "../src/index.js";

const TOOL = { toolVersion: "1.7.0" };
const ID = "k4c2w7x5q3y6m2n5r7d4";

afterEach(() => setLocale("en"));

/** The manifest of a project whose `cloud` field is the JSON text given (absent when undefined). */
const read = (cloud?: string) =>
  readManifest(
    createMemoryHost({
      "/p/project.json": `{ "name": "shop", "language": "0.2"${cloud === undefined ? "" : `, "cloud": ${cloud}`} }`,
    }),
    "/p",
    TOOL,
  );

describe("the cloud field", () => {
  it("is the last field of the manifest and of the schema", () => {
    expect(MANIFEST_FIELDS.at(-1)).toBe("cloud");
    const schema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "project.schema.json"), "utf8"),
    );
    expect(Object.keys(schema.properties).at(-1)).toBe("cloud");
    expect(Object.keys(schema.properties.cloud.properties)).toEqual([...CLOUD_SETTINGS]);
    expect(schema.properties.cloud.required).toEqual([...CLOUD_SETTINGS]);
    expect(schema.properties.cloud.additionalProperties).toBe(false);
  });

  it("is null when absent and holds the host and the project when written", () => {
    const absent = read();
    expect(absent.diagnostics).toEqual([]);
    expect(absent.manifest!.cloud).toBeNull();
    const written = read(`{ "host": "https://diagrams.meltemi.dev", "project": "${ID}" }`);
    expect(written.diagnostics).toEqual([]);
    expect(written.manifest!.cloud).toEqual({ host: "https://diagrams.meltemi.dev", project: ID });
    expect(written.spans["cloud"]).toBeDefined();
  });

  it("keeps the origin of the host: a trailing slash, a default port and the case go", () => {
    for (const host of [
      "https://diagrams.meltemi.dev/",
      "https://Diagrams.Meltemi.dev:443",
      "https://diagrams.meltemi.dev",
    ]) {
      expect(read(`{ "host": "${host}", "project": "${ID}" }`).manifest!.cloud!.host).toBe(
        "https://diagrams.meltemi.dev",
      );
    }
  });

  it("accepts http: on the loopback only", () => {
    for (const host of ["http://localhost:8788", "http://127.0.0.1:8788", "http://[::1]:8788"]) {
      const result = read(`{ "host": "${host}", "project": "${ID}" }`);
      expect(result.diagnostics, host).toEqual([]);
      expect(result.manifest!.cloud!.host).toBe(host);
    }
    const remote = read(`{ "host": "http://diagrams.example", "project": "${ID}" }`);
    expect(remote.diagnostics.map((d) => d.code)).toEqual(["project.invalid-value"]);
    expect(remote.manifest!.cloud).toBeNull();
  });

  it.each([
    ['"abc"', "a string"],
    ["null", "null"],
    ["[]", "an array"],
    [`{ "host": "https://diagrams.meltemi.dev" }`, "no project"],
    [`{ "project": "${ID}" }`, "no host"],
    ["{}", "an empty object"],
  ])("reports %s (%s) as an invalid value naming host and project", (cloud) => {
    const result = read(cloud);
    expect(result.manifest!.cloud).toBeNull();
    expect(result.diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual([
      "project.invalid-value:error",
    ]);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic!.message).toContain("`host`");
    expect(diagnostic!.message).toContain("`project`");
    expect(diagnostic!.hints![0]).toContain("`host`");
    expect(diagnostic!.hints![0]).toContain("`project`");
  });

  it.each([
    ["a host that is not a string", `{ "host": 3, "project": "${ID}" }`, "host"],
    ["a host with a path", `{ "host": "https://a.example/app", "project": "${ID}" }`, "host"],
    ["a host with a query", `{ "host": "https://a.example?x=1", "project": "${ID}" }`, "host"],
    ["a host with a login", `{ "host": "https://me:x@a.example", "project": "${ID}" }`, "host"],
    ["a host without a scheme", `{ "host": "a.example", "project": "${ID}" }`, "host"],
    ["a host that is mailto:", `{ "host": "mailto:a@a.example", "project": "${ID}" }`, "host"],
    ["an empty host", `{ "host": "", "project": "${ID}" }`, "host"],
    [
      "a project of 19 characters",
      `{ "host": "https://a.example", "project": "${ID.slice(1)}" }`,
      "project",
    ],
    [
      "a project in capitals",
      `{ "host": "https://a.example", "project": "${ID.toUpperCase()}" }`,
      "project",
    ],
    [
      "a project with a hyphen",
      `{ "host": "https://a.example", "project": "${ID.slice(1)}-" }`,
      "project",
    ],
    ["a project that is a number", `{ "host": "https://a.example", "project": 12 }`, "project"],
  ])("reports %s", (_name, cloud, key) => {
    const result = read(cloud);
    expect(result.manifest!.cloud).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual(["project.invalid-value"]);
    expect(result.diagnostics[0]!.message).toContain(`\`${key}\``);
    expect(result.diagnostics[0]!.hints![0]).toContain("`host`");
  });

  it("warns about an unknown setting and keeps the valid ones", () => {
    const result = read(`{ "host": "https://a.example", "project": "${ID}", "branch": "main" }`);
    expect(result.manifest!.cloud).toEqual({ host: "https://a.example", project: ID });
    expect(result.diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual([
      "project.unknown-field:warning",
    ]);
    expect(result.diagnostics[0]!.hints).toEqual(["Settings: host, project."]);
  });

  it("reports a setting written twice", () => {
    const result = read(
      `{ "host": "https://a.example", "host": "https://b.example", "project": "${ID}" }`,
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(["project.invalid-value"]);
    // As for the manifest's own fields, the first one stands.
    expect(result.manifest!.cloud).toEqual({ host: "https://a.example", project: ID });
  });

  it("puts every message in Spanish", () => {
    setLocale("es");
    const result = read('"abc"');
    expect(result.diagnostics[0]!.message).toBe(
      '`cloud` debe ser un objeto con `host` y `project`, como `{ "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }`.',
    );
    expect(result.diagnostics[0]!.hints![0]).toContain("`host`");
    expect(result.diagnostics[0]!.hints![0]).toContain("`project`");
    expect(
      read(`{ "host": "http://a.example", "project": "${ID}" }`).diagnostics[0]!.message,
    ).toContain("http: solo para 127.0.0.1");
  });
});

describe("cloud hosts", () => {
  it("tells an insecure host from one that is not an origin", () => {
    expect(parseCloudHost("https://diagrams.meltemi.dev")).toEqual({
      ok: true,
      origin: "https://diagrams.meltemi.dev",
    });
    expect(parseCloudHost("http://localhost:8788")).toEqual({
      ok: true,
      origin: "http://localhost:8788",
    });
    expect(parseCloudHost("http://diagrams.example")).toEqual({ ok: false, reason: "insecure" });
    expect(parseCloudHost("http://127.0.0.2")).toEqual({ ok: false, reason: "insecure" });
    for (const bad of [
      "",
      "diagrams.meltemi.dev",
      "ftp://a.example",
      "https://a.example/x",
      "https://a.example?x",
      "https://a.example#x",
      "https://u:p@a.example",
      " https://a.example",
      "https://a.example\\x",
      "https://",
    ]) {
      expect(parseCloudHost(bad), bad).toEqual({ ok: false, reason: "invalid" });
      expect(cloudHostOrigin(bad), bad).toBeNull();
    }
  });

  it("knows the loopback names and the shape of a project id", () => {
    expect(["127.0.0.1", "localhost", "[::1]"].every(isLoopbackHost)).toBe(true);
    expect(["127.0.0.2", "::1", "localhost.example", "0.0.0.0"].some(isLoopbackHost)).toBe(false);
    expect(CLOUD_PROJECT_ID.test(ID)).toBe(true);
    expect(CLOUD_PROJECT_ID.test(`${ID}0`)).toBe(false);
  });

  it("is described by the schema's patterns as the reader reads it", () => {
    const schema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "project.schema.json"), "utf8"),
    );
    const host = new RegExp(schema.properties.cloud.properties.host.pattern);
    const project = new RegExp(schema.properties.cloud.properties.project.pattern);
    for (const value of [
      "https://diagrams.meltemi.dev",
      "https://diagrams.meltemi.dev/",
      "http://localhost:8788",
      "http://127.0.0.1:8788/",
      "http://[::1]:8788",
      "http://diagrams.example",
      "https://a.example/app",
      "https://u:p@a.example",
      "https://a.example?x",
      "a.example",
    ]) {
      expect(host.test(value), value).toBe(parseCloudHost(value).ok);
    }
    expect(project.test(ID)).toBe(true);
    expect(project.test(ID.slice(1))).toBe(false);
  });
});
