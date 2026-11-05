import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const script = async <T>(name: string) =>
  (await import(/* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts", name)).href)) as T;
describe("the scripts", () => {
  it("release-tag accepts the tag of the manifests' version and refuses another, naming both", async () => {
    const { tagMismatch } = await script<{
      tagMismatch(tag: string, manifest: string): string | undefined;
    }>("release-tag.mjs");
    const manifest = readFileSync(join(REPO_ROOT, "packages", "cli", "package.json"), "utf8");
    const version = (JSON.parse(manifest) as { version: string }).version;
    expect(tagMismatch(`v${version}`, manifest)).toBeUndefined();
    expect(tagMismatch("v0.0.1", manifest)).toBe(
      `the tag v0.0.1 does not name the package's version ${version} (expected v${version})`,
    );
  });

  it("changelog-section gives the notes of a version and nothing for an unknown one", async () => {
    const { changelogSection } = await script<{
      changelogSection(text: string, version: string): string | undefined;
    }>("changelog-section.mjs");
    const text = "# Changelog\n\n## 1.8.0 (2026-10-20)\n\nShapes.\n\n## 1.7.0\n\nLayers.\n";
    expect(changelogSection(text, "1.8.0")).toBe("Shapes.");
    expect(changelogSection(text, "1.7.0")).toBe("Layers.");
    expect(changelogSection(text, "1.8")).toBeUndefined();
    expect(changelogSection(text, "1.9.0")).toBeUndefined();
  });

  it("deploy-config writes Terraform's ids into both Workers and refuses a placeholder", async () => {
    const { deployConfig, parseJsonc, outputFor } =
      await script<DeployConfigScript>("deploy-config.mjs");
    const cloud = join(REPO_ROOT, "packages", "cloud");
    const ids = {
      database: "6f1c2a52-8d1e-4f7a-9b3c-0a1b2c3d4e5f",
      store: "0123456789abcdef0123456789abcdef",
    };
    const main = parseJsonc(readFileSync(join(cloud, "wrangler.jsonc"), "utf8"));
    const publish = parseJsonc(readFileSync(join(cloud, "wrangler.publish.jsonc"), "utf8"));
    const deployed = JSON.stringify(deployConfig(main, ids));
    expect(deployed).toContain(ids.database);
    // One store for the four secrets of the main Worker.
    expect(deployed.match(new RegExp(ids.store, "g"))).toHaveLength(4);
    expect(JSON.stringify(deployConfig(publish, ids))).toContain(ids.database);
    for (const config of [main, publish]) {
      expect(deployConfig(config, ids)).toHaveProperty("observability", {
        enabled: true,
        // No request line: its URL can hold an invitation token or an access link (criterion 29).
        logs: { enabled: true, invocation_logs: false },
      });
    }
    expect(() => deployConfig(main, { store: ids.store })).toThrow(/^D1_DATABASE_ID is not set/);
    expect(() => deployConfig(main, { database: ids.database })).toThrow(
      /^SECRETS_STORE_ID is not set/,
    );
    expect(outputFor("packages/cloud/wrangler.jsonc")).toBe("packages/cloud/wrangler.deploy.json");
    expect(outputFor("packages/cloud/wrangler.publish.jsonc")).toBe(
      "packages/cloud/wrangler.publish.deploy.json",
    );
  });

  describe("deploy-config's two environments", () => {
    const cloud = join(REPO_ROOT, "packages", "cloud");
    const committed = async () => {
      const { parseJsonc } = await script<DeployConfigScript>("deploy-config.mjs");
      const parse = (name: string) => parseJsonc(readFileSync(join(cloud, name), "utf8")) as Config;
      return { main: parse("wrangler.jsonc"), publish: parse("wrangler.publish.jsonc") };
    };
    const ids = {
      database: "6f1c2a52-8d1e-4f7a-9b3c-0a1b2c3d4e5f",
      store: "0123456789abcdef0123456789abcdef",
    };
    const stagingIds = {
      database: "a1b2c3d4-0000-4000-8000-0123456789ab",
      store: ids.store,
      bucket: "meltemi-diagrams-staging-blobs",
      suffix: "_STAGING",
    };
    /** A configuration that binds a KV namespace, as the authorization server's once did (`OAUTH_KV`). */
    const withKv = (config: Config): Config => ({
      ...config,
      kv_namespaces: [{ binding: "OAUTH_KV", id: "00000000000000000000000000000000" }],
    });

    it("leaves production as committed but for the ids", async () => {
      const { deployConfig } = await script<DeployConfigScript>("deploy-config.mjs");
      const { main, publish } = await committed();
      expect(main["kv_namespaces"]).toBeUndefined();
      for (const config of [main, publish]) {
        const out = deployConfig(config, { ...ids, bucket: "meltemi-diagrams-blobs" }) as Config;
        // The committed file with each placeholder replaced, and nothing else.
        const expected = JSON.parse(
          JSON.stringify(config)
            .replaceAll("00000000-0000-0000-0000-000000000000", ids.database)
            .replaceAll("00000000000000000000000000000000", ids.store),
        ) as Config;
        expect(out).toEqual(expected);
      }
      // The Workers bind no KV namespace (the authorization server keeps its state in D1), and no
      // variable gives one's id: a configuration that binds one is refused.
      expect(() => deployConfig(withKv(main), ids)).toThrow(/binds a KV namespace/);
      // The staging environment's variables are refused in production, before anything is written.
      expect(() => deployConfig(main, { ...ids, suffix: "_STAGING" })).toThrow(
        /^SECRETS_SUFFIX is set/,
      );
      expect(() =>
        deployConfig(main, { ...ids, bucket: "meltemi-diagrams-staging-blobs" }),
      ).toThrow(/is not the committed bucket meltemi-diagrams-blobs/);
    });

    it("writes staging's names, hosts, product, bucket and its own secrets", async () => {
      const { deployConfig, STAGING } = await script<DeployConfigScript>("deploy-config.mjs");
      const { main, publish } = await committed();
      const staged = deployConfig(main, stagingIds, "staging") as Config;
      expect(staged["name"]).toBe("meltemi-diagrams-staging");
      expect(staged["d1_databases"]).toEqual([
        expect.objectContaining({
          binding: "DB",
          database_name: "meltemi-diagrams-staging",
          database_id: stagingIds.database,
          migrations_dir: "migrations",
        }),
      ]);
      expect(staged["r2_buckets"]).toEqual([
        { binding: "BLOBS", bucket_name: "meltemi-diagrams-staging-blobs" },
      ]);
      expect(staged["kv_namespaces"]).toBeUndefined();
      const secrets = (
        staged["secrets_store_secrets"] as {
          binding: string;
          secret_name: string;
          store_id: string;
        }[]
      ).map((s) => [s.binding, s.secret_name, s.store_id]);
      expect(secrets).toEqual([
        ["FORMS_SECRET_STORE", "FORMS_SECRET_STAGING", ids.store],
        ["IDENTITY_EVENTS_SECRET_STORE", "IDENTITY_EVENTS_SECRET_STAGING", ids.store],
        ["ADMIN_SUBS_STORE", "ADMIN_SUBS", ids.store],
        ["SPONSORS_WEBHOOK_SECRET_STORE", "SPONSORS_WEBHOOK_SECRET", ids.store],
      ]);
      expect(staged["vars"]).toMatchObject({
        ORIGIN: "https://staging.diagrams.meltemi.dev",
        PUBLISH_HOST: "staging.meltemi.page",
        PRODUCT_NAME: "diagrams-staging",
        IDENTITY_ISSUER: "https://id.meltemi.dev",
      });
      expect(STAGING.productName).toBe("diagrams-staging");
      // Everything else is production's: the same code, assets, Durable Objects, crons and limits.
      const production = deployConfig(main, ids) as Config;
      for (const key of Object.keys(production)) {
        if (["name", "d1_databases", "r2_buckets", "secrets_store_secrets", "vars"].includes(key))
          continue;
        expect(staged[key], key).toEqual(production[key]);
      }
      expect(staged["workers_dev"]).toBe(false);
      expect(staged["preview_urls"]).toBe(false);

      const publishStaged = deployConfig(publish, stagingIds, "staging") as Config;
      expect(publishStaged["name"]).toBe("meltemi-diagrams-publish-staging");
      expect(publishStaged["d1_databases"]).toEqual([
        {
          binding: "DB",
          database_name: "meltemi-diagrams-staging",
          database_id: stagingIds.database,
        },
      ]);
      expect(publishStaged["r2_buckets"]).toEqual([
        { binding: "BLOBS", bucket_name: "meltemi-diagrams-staging-blobs" },
      ]);
      expect(JSON.stringify(publishStaged)).not.toMatch(
        /"meltemi-diagrams"|"meltemi-diagrams-blobs"/,
      );
    });

    it("refuses a staging configuration that would reach production's resources", async () => {
      const { deployConfig } = await script<DeployConfigScript>("deploy-config.mjs");
      const { main } = await committed();
      const { suffix: _suffix, ...noSuffix } = stagingIds;
      expect(() => deployConfig(main, noSuffix, "staging")).toThrow(
        /^SECRETS_SUFFIX is not set: the staging/,
      );
      const { bucket: _bucket, ...noBucket } = stagingIds;
      expect(() => deployConfig(main, noBucket, "staging")).toThrow(/^R2_BUCKET_NAME is not set/);
      expect(() =>
        deployConfig(main, { ...stagingIds, bucket: "meltemi-diagrams-blobs" }, "staging"),
      ).toThrow(/is production's bucket/);
      expect(() => deployConfig(withKv(main), stagingIds, "staging")).toThrow(
        /binds a KV namespace/,
      );
      expect(() => deployConfig({ ...main, name: "another" }, stagingIds, "staging")).toThrow(
        /no twin of the Worker another/,
      );
      expect(() => deployConfig(main, stagingIds, "preview")).toThrow(
        /unknown environment preview/,
      );
    });

    it("reads the environment from its option", async () => {
      const { readArguments } = await script<DeployConfigScript>("deploy-config.mjs");
      expect(readArguments(["a.jsonc", "b.jsonc"])).toEqual({
        environment: "production",
        files: ["a.jsonc", "b.jsonc"],
      });
      expect(readArguments(["--environment", "staging", "a.jsonc"])).toEqual({
        environment: "staging",
        files: ["a.jsonc"],
      });
      expect(readArguments(["--environment=staging", "a.jsonc"]).environment).toBe("staging");
      expect(() => readArguments(["--environment", "prod", "a.jsonc"])).toThrow(
        /unknown environment prod/,
      );
      expect(() => readArguments(["--env", "staging"])).toThrow(/unknown option --env/);
    });
  });
});

type Config = Record<string, unknown>;

interface DeployConfigScript {
  deployConfig(
    config: unknown,
    ids: { database?: string; store?: string; bucket?: string; suffix?: string },
    environment?: string,
  ): unknown;
  parseJsonc(text: string): unknown;
  outputFor(file: string): string;
  readArguments(argv: readonly string[]): { environment: string; files: string[] };
  readonly STAGING: { readonly productName: string };
}
