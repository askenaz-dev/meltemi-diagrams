import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "@meltemi/diagrams-cli";
import { REPO_ROOT } from "../src/corpus.js";

const SOURCE_CONDITION = "@meltemi/diagrams-source";

/** The public repository (decision 0046); every manifest, README and document names it. */
const REPOSITORY = "https://github.com/askenaz-dev/meltemi-diagrams";

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  exports?: unknown;
  repository?: { type: string; url: string; directory?: string };
  homepage?: string;
  bugs?: { url: string };
  engines?: { node?: string };
  publishConfig?: { access?: string; exports?: unknown };
}

const folders = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const manifest = (folder: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, "packages", folder, "package.json"), "utf8")) as Manifest;

/** An exports map without the development condition, as it is published. */
function withoutSource(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== SOURCE_CONDITION)
      .map(([key, v]) => [key, withoutSource(v)]),
  );
}

describe("one product version", () => {
  it.each(folders)("packages/%s carries the CLI's version", (folder) => {
    expect(manifest(folder).version).toBe(CLI_VERSION);
  });

  it("refuses a version that is not x.y.z", async () => {
    const script = (await import(
      /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts", "release-version.mjs")).href
    )) as { setVersion(version: string): string[] };
    expect(() => script.setVersion("1.0")).toThrow(/x\.y\.z/);
    expect(() => script.setVersion("v1.0.0")).toThrow(/x\.y\.z/);
  });
});

describe("publishable manifests", () => {
  const publics = folders.filter((folder) => !manifest(folder).private);

  it("covers the nineteen public packages", () => {
    expect(publics).toHaveLength(19);
  });

  it.each(publics)("packages/%s publishes publicly, without the source condition", (folder) => {
    const m = manifest(folder);
    expect(m.publishConfig?.access).toBe("public");
    expect(m.publishConfig?.exports, "update publishConfig.exports with exports").toEqual(
      withoutSource(m.exports),
    );
    expect(JSON.stringify(m.publishConfig?.exports)).not.toContain(SOURCE_CONDITION);
    expect(m.repository).toEqual({
      type: "git",
      url: `git+${REPOSITORY}.git`,
      directory: `packages/${folder}`,
    });
    expect(m.homepage).toBe(`${REPOSITORY}/tree/main/packages/${folder}#readme`);
    expect(m.bugs?.url).toBe(`${REPOSITORY}/issues`);
    expect(m.engines?.node).toBe(
      (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Manifest).engines?.node,
    );
  });
});

describe("the repository's address", () => {
  it("is the extension's repository too", () => {
    expect(manifest("vscode").repository).toEqual({ type: "git", url: REPOSITORY });
  });

  /** Every Markdown file a person reads: the root's, the packages' READMEs and the docs. */
  function readable(): string[] {
    const files = readdirSync(REPO_ROOT).filter((name) => name.endsWith(".md"));
    for (const folder of folders) {
      const readme = join("packages", folder, "README.md");
      try {
        readFileSync(join(REPO_ROOT, readme));
        files.push(readme);
      } catch {
        // A package without a README is checked by the manifests' test.
      }
    }
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".md")) files.push(path);
      }
    };
    walk("docs");
    return files;
  }

  it("is the one every README and document names: no placeholder address is left", () => {
    const offenders = readable().filter((file) =>
      /github\.com\/meltemi\/meltemi-diagrams|<(repository|placeholder)[^>]*>/.test(
        readFileSync(join(REPO_ROOT, file), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("names a repository that exists in every manifest that names one", () => {
    for (const folder of folders) {
      const url = manifest(folder).repository?.url;
      if (url) expect(url, folder).toContain("github.com/askenaz-dev/meltemi-diagrams");
    }
  });
});
