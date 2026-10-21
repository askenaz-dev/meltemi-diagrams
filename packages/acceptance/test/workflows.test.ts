// The repository's pipelines, read as text (decision 0046): what starts each one, where it runs,
// the order of its steps and which secrets it may name; and the scripts they run. Nothing here
// creates infrastructure or sets a Worker secret: that is the family's Terraform, in the Meltemi
// Web repository.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const DIR = join(REPO_ROOT, ".github", "workflows");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");

/** The names of the secrets a workflow reads, `${{ secrets.NAME }}`. */
const secretsOf = (text: string) =>
  [
    ...new Set([...text.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!)),
  ].sort();

/** The position of `needle` in `text`, failing the test when it is absent. */
function at(text: string, needle: string): number {
  const index = text.indexOf(needle);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
}

const script = async <T>(name: string) =>
  (await import(/* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts", name)).href)) as T;

describe("the workflows", () => {
  it("are the three of the delivery", () => {
    expect(readdirSync(DIR).sort()).toEqual(["ci.yml", "deploy.yml", "release.yml"]);
  });

  it("start from read-only permissions, never print a secret and never set a Worker secret", () => {
    for (const name of readdirSync(DIR)) {
      const text = read(name);
      expect(text, name).toMatch(/^permissions:\n {2}contents: read/m);
      expect(text, name).not.toMatch(/echo[^\n]*\$\{\{\s*secrets\./);
      expect(text, name).not.toMatch(/\bwrangler secret\b/);
      for (const worker of ["FORMS_SECRET", "IDENTITY_EVENTS_SECRET", "ADMIN_SUBS"]) {
        expect(text, `${name}: ${worker}`).not.toContain(worker);
      }
    }
  });
});

describe("ci.yml", () => {
  const text = read("ci.yml");

  it("runs on pushes to main and on pull requests, cancelling a superseded run", () => {
    expect(text).toMatch(/push:\n\s+branches: \[main\]\n\s+pull_request:/);
    expect(text).toMatch(/cancel-in-progress: true/);
  });

  it("checks the workspace on Node 22 and 24, on Linux and Windows", () => {
    expect(text).toMatch(/os: \[ubuntu-latest, windows-latest\]/);
    expect(text).toMatch(/node: \[22, 24\]/);
    for (const step of ["typecheck", "lint", "licenses:inventory --check", "test", "build"]) {
      at(text, `run: pnpm ${step}`);
    }
  });

  it("runs the browser suites and the cloud service's suite", () => {
    for (const suite of [
      "playground:test-browser",
      "player:test-browser",
      "catalog:test-browser",
      "vscode:test-webview",
    ]) {
      at(text, `run: pnpm ${suite}`);
    }
    expect(at(text, "run: pnpm playground:build")).toBeLessThan(
      at(text, "run: pnpm cloud:test-browser"),
    );
  });

  it("names no secret and no environment", () => {
    expect(secretsOf(text)).toEqual([]);
    expect(text).not.toMatch(/environment:/);
  });
});

describe("deploy.yml", () => {
  const text = read("deploy.yml");

  it("runs on every push to main, one at a time, never cancelled", () => {
    expect(text).toMatch(/push:\n\s+branches: \[main\]/);
    expect(text).toMatch(/group: deploy\n\s+cancel-in-progress: false/);
  });

  it("deploys from the production environment with the deploy token only", () => {
    expect(text).toMatch(/environment: production/);
    expect(secretsOf(text)).toEqual(["CLOUDFLARE_API_TOKEN"]);
    for (const variable of ["CLOUDFLARE_ACCOUNT_ID", "D1_DATABASE_ID", "SECRETS_STORE_ID"]) {
      at(text, `${variable}: \${{ vars.${variable} }}`);
    }
  });

  it("writes Terraform's ids, builds, migrates, then uploads the main Worker and then the publish Worker", () => {
    const config = at(
      text,
      "node scripts/deploy-config.mjs packages/cloud/wrangler.jsonc packages/cloud/wrangler.publish.jsonc",
    );
    const build = at(text, "run: pnpm playground:build");
    const migrate = at(text, "wrangler d1 migrations apply DB --remote -c wrangler.deploy.json");
    const main = at(text, "wrangler deploy -c wrangler.deploy.json");
    const publish = at(text, "wrangler deploy -c wrangler.publish.deploy.json");
    expect(config).toBeLessThan(build);
    expect(build).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(main);
    expect(main).toBeLessThan(publish);
  });

  it("rolls a Worker back instead when dispatched with a version", () => {
    at(text, "rollback_version:");
    at(text, 'pnpm exec wrangler rollback "$VERSION"');
  });
});

describe("release.yml", () => {
  const text = read("release.yml");

  it("runs on version tags and checks the tag before anything is published", () => {
    expect(text).toMatch(/tags: \["v\*"\]/);
    expect(at(text, "scripts/release-tag.mjs")).toBeLessThan(at(text, "pnpm release:check"));
    expect(at(text, "pnpm release:check")).toBeLessThan(at(text, "npm publish"));
  });

  it("publishes in jobs that each need the one before", () => {
    expect(text).toMatch(/npm:\n\s+needs: check/);
    expect(text).toMatch(/extension:\n\s+needs: npm/);
    expect(text).toMatch(/github:\n\s+needs: extension/);
  });

  it("publishes every tarball with provenance, skipping what npm already has", () => {
    expect(text).toMatch(/id-token: write/);
    expect(at(text, 'npm view "${name}@${version}" version')).toBeLessThan(
      at(text, 'npm publish "$tarball" --access public --provenance'),
    );
  });

  it("publishes the checked .vsix to both marketplaces, and the release with the changelog's section", () => {
    at(text, "@vscode/vsce@3.9.2 publish --packagePath");
    at(text, "ovsx@1.3.0 publish");
    at(text, "node scripts/changelog-section.mjs");
    at(text, "release/manifest.json");
  });

  it("names the three release tokens only", () => {
    expect(secretsOf(text)).toEqual(["NPM_TOKEN", "OVSX_PAT", "VSCE_PAT"]);
  });
});

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
    expect(deployed.match(new RegExp(ids.store, "g"))).toHaveLength(3);
    expect(JSON.stringify(deployConfig(publish, ids))).toContain(ids.database);
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
