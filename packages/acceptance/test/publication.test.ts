import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const { publishGithub, verifyGithubAssets } = await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts/publish-github.mjs")).href
);
const { publishNpm, NPM_PACKAGE_NAMES } = await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts/publish-npm.mjs")).href
);
const plan = {
  sha: "a".repeat(40),
  tag: "v1.10.1",
  version: "1.10.1",
  latest: true,
  repository: "askenaz-dev/meltemi-diagrams",
  packageSourceMetadata: 1,
};
const assets = [{ name: "file.vsix", bytes: Buffer.from("checked"), digest: "sha256:abc" }];
type Asset = { name: string; size: number; digest: string };
const listed = { name: "file.vsix", size: 7, digest: "sha256:abc" };

describe("GitHub draft publication", () => {
  it("rejects the real 1.10.17 rebuilt manifest before any publisher can use it", () => {
    const fixture = new URL("./fixtures/release-recovery/", import.meta.url);
    const original = readFileSync(new URL("1.10.17-original.json", fixture));
    const rebuilt = readFileSync(new URL("1.10.17-rebuilt.json", fixture));
    const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    expect(digest(original)).toBe(
      "sha256:f4b1a2697aaa925ec8b22d49fa0e69d74470f9102cc40cd6d056a528ed61585b",
    );
    const existing = {
      tag_name: "v1.10.17",
      draft: false,
      assets: [{ name: "manifest.json", size: original.length, digest: digest(original) }],
    };
    expect(() =>
      verifyGithubAssets(existing, { tag: "v1.10.17" }, [
        { name: "manifest.json", bytes: rebuilt, digest: digest(rebuilt) },
      ]),
    ).toThrow(/manifest.json differs/);
  });
  function fixture(draft: boolean, existing: Asset[], missing = false) {
    const state = { id: 5, tag_name: plan.tag, draft, assets: existing };
    const calls: { method: string; path: string; body: unknown }[] = [];
    const api = async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path === "/releases/latest") return { tag_name: "v1.10.2" };
      if (path.startsWith("/releases/tags/") && missing) return undefined;
      if (method === "UPLOAD") state.assets.push(listed);
      return state;
    };
    return { api, calls };
  }

  it("creates a draft, uploads and verifies missing assets before publishing, never moving latest backwards", async () => {
    const f = fixture(true, [], true);
    await publishGithub(plan, assets, "notes", f.api);
    expect(f.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      draft: true,
      make_latest: "false",
    });
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "POST", "UPLOAD", "GET", "GET", "PATCH"]);
    expect(f.calls.at(-1)?.body).toEqual({ draft: false, make_latest: "false" });
  });
  it("finishes an existing draft without replacing matching assets", async () => {
    const f = fixture(true, [listed]);
    await publishGithub(plan, assets, "notes", f.api);
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "PATCH"]);
  });
  it("verifies an already published release without writing anything", async () => {
    const f = fixture(false, [listed]);
    await publishGithub(plan, assets, "notes", f.api);
    expect(f.calls.map((c) => c.method)).toEqual(["GET"]);
  });
  it("fails for missing published assets or a digest collision instead of overwriting immutable content", async () => {
    const incomplete = fixture(false, []);
    await expect(publishGithub(plan, assets, "notes", incomplete.api)).rejects.toThrow(/missing/);
    expect(incomplete.calls).toHaveLength(1);
    const collision = fixture(true, [{ ...listed, digest: "sha256:other" }]);
    await expect(publishGithub(plan, assets, "notes", collision.api)).rejects.toThrow(/differs/);
    expect(collision.calls).toHaveLength(1);
  });
  it("propagates an authorization/API failure instead of assuming the release does not exist", async () => {
    const api = async () => {
      throw new Error("HTTP 403");
    };
    await expect(publishGithub(plan, assets, "notes", api)).rejects.toThrow("HTTP 403");
  });
});

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}meltemi-publish-`))
      throw new Error("Unsafe fixture cleanup.");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("npm partial publication", () => {
  function fixture(
    mismatch = false,
    source: "correct" | "wrong" | "missing" = "correct",
    legacy = false,
  ) {
    const directory = mkdtempSync(join(tmpdir(), "meltemi-publish-"));
    roots.push(directory);
    const checked = { ...plan, ...(legacy ? { packageSourceMetadata: undefined } : {}) };
    writeFileSync(join(directory, "delivery-plan.json"), JSON.stringify(checked));
    const bytes = Buffer.from("packed content");
    for (const name of NPM_PACKAGE_NAMES as string[])
      writeFileSync(
        join(directory, `${name.replace("@", "").replace("/", "-")}-${plan.version}.tgz`),
        bytes,
      );
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      if (args[0] === "view") {
        if (args[2] === "dist.integrity")
          return JSON.stringify(mismatch ? "sha512:wrong" : integrity);
        if (args[1]!.endsWith("@latest")) return '"1.10.2"';
        if (args[1]!.startsWith("@meltemi/diagrams-assets@")) return JSON.stringify(plan.version);
        throw { stdout: '{"error":{"code":"E404"}}' };
      }
      return "";
    };
    const unpack = (path: string) =>
      JSON.stringify({
        name: `@meltemi/${basename(path, `-${plan.version}.tgz`).replace(/^meltemi-/, "")}`,
        version: plan.version,
        ...(source === "missing"
          ? {}
          : {
              meltemiRelease: {
                repository: plan.repository,
                sha: source === "wrong" ? "b".repeat(40) : plan.sha,
                tag: plan.tag,
              },
            }),
      });
    return { directory, calls, run, unpack };
  }
  it("skips identical existing bytes, publishes missing packages and keeps a newer latest", () => {
    const f = fixture();
    publishNpm(f.directory, f.run, f.unpack);
    expect(f.calls.filter((c) => c[0] === "publish")).toHaveLength(19);
    expect(f.calls.filter((c) => c[0] === "dist-tag")).toHaveLength(0);
    for (const call of f.calls.filter((c) => c[0] === "publish"))
      expect(call).toContain("release-1.10.1");
  });
  it("checks a late existing conflict before publishing any earlier missing package", () => {
    const f = fixture();
    const run = (args: string[]) => {
      if (args[0] === "view" && args[1]!.startsWith("@meltemi/diagrams-render@"))
        return JSON.stringify(args[2] === "dist.integrity" ? "sha512:wrong" : plan.version);
      return f.run(args);
    };
    expect(() => publishNpm(f.directory, run, f.unpack)).toThrow(/different bytes/);
    expect(f.calls.some((args) => args[0] !== "view")).toBe(false);
  });
  it("refuses an existing version with different bytes before publishing missing packages", () => {
    const f = fixture(true);
    expect(() => publishNpm(f.directory, f.run, f.unpack)).toThrow(/different bytes/);
    expect(f.calls.filter((c) => c[0] === "publish")).toHaveLength(0);
  });
  it.each(["@other/package", "@meltemi/diagrams-assets"])(
    "rejects unknown or duplicated package identity %s before registry access",
    (name) => {
      const f = fixture();
      const unpack = (path: string) => JSON.stringify({ ...JSON.parse(f.unpack(path)), name });
      expect(() => publishNpm(f.directory, f.run, unpack)).toThrow(/package name or filename/);
      expect(f.calls).toHaveLength(0);
    },
  );
  it.each(["wrong", "missing"] as const)(
    "refuses %s product source before publishing",
    (source) => {
      const f = fixture(false, source);
      expect(() => publishNpm(f.directory, f.run, f.unpack)).toThrow(/source metadata/);
      expect(f.calls).toHaveLength(0);
    },
  );
  it("can recover an original artifact created before source metadata without repacking its bytes", () => {
    const f = fixture(false, "missing", true);
    publishNpm(f.directory, f.run, f.unpack);
    expect(f.calls.filter((c) => c[0] === "publish")).toHaveLength(19);
    expect(f.calls.filter((c) => c[0] === "dist-tag")).toHaveLength(0);
  });
});
