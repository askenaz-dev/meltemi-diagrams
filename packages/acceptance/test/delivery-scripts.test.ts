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
    const { deployConfig, parseJsonc, outputFor } = await script<{
      deployConfig(config: unknown, ids: { database?: string; store?: string }): unknown;
      parseJsonc(text: string): unknown;
      outputFor(file: string): string;
    }>("deploy-config.mjs");
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
        logs: { enabled: true, invocation_logs: true },
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
});
