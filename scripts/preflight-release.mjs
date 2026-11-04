// Local integrity is shared; only recovery couples registry checks before channel writes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { packageSource } from "./package-source.mjs";
import { checkedNpmPackages, preflightNpm } from "./publish-npm.mjs";
import { githubAssets, releaseApi, verifyGithubAssets } from "./publish-github.mjs";

export function safeArtifactNames(names) {
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !/^[a-zA-Z0-9]/.test(name) || /[^a-zA-Z0-9.-]/.test(name))
  ) {
    throw new Error("Release artifact must contain unique flat filenames.");
  }
}

export function validateArtifact(directory, expected, unpack) {
  const names = readdirSync(directory);
  safeArtifactNames(names);
  if (names.some((name) => !lstatSync(join(directory, name)).isFile()))
    throw new Error("Release artifact must contain only regular files.");
  const json = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
  const plan = json("delivery-plan.json");
  const provenance = json("provenance.json");
  for (const key of ["sha", "version", "tag", "repository", "ciRun"]) {
    if (plan[key] !== expected[key] || provenance[key] !== expected[key])
      throw new Error(`Artifact ${key} differs from authorized source/CI.`);
  }
  if (plan.packageSourceMetadata !== expected.packageSourceMetadata)
    throw new Error("Artifact package source capability differs.");
  const manifest = json("manifest.json");
  if (manifest.version !== expected.version || !Array.isArray(manifest.files))
    throw new Error("Artifact manifest version or file list is invalid.");
  const source = expected.packageSourceMetadata === 1 ? packageSource(expected) : undefined;
  if (
    source
      ? Object.entries(source).some(([key, value]) => manifest.source?.[key] !== value)
      : manifest.source !== undefined
  )
    throw new Error("Artifact manifest source differs.");
  const listed = manifest.files.map((file) => file.file);
  safeArtifactNames(listed);
  const vsix = `meltemi-diagrams-${expected.version}.vsix`;
  if (
    listed.length !== 20 ||
    !listed.includes(vsix) ||
    listed.filter(
      (name) => name.endsWith(`-${expected.version}.tgz`) && name.startsWith("meltemi-diagrams-"),
    ).length !== 19
  )
    throw new Error("Artifact manifest must name nineteen packages and the versioned VSIX.");
  const expectedNames = [
    ...listed,
    "manifest.json",
    "provenance.json",
    "delivery-plan.json",
    "notes.md",
  ];
  if (names.length !== expectedNames.length || expectedNames.some((name) => !names.includes(name)))
    throw new Error("Artifact files differ from its checked manifest.");
  for (const file of manifest.files) {
    const bytes = readFileSync(join(directory, file.file));
    if (
      bytes.length !== file.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw new Error(`Artifact file ${file.file} differs from its checked manifest.`);
  }
  checkedNpmPackages(directory, unpack);
  return { plan, assets: githubAssets(directory, expected) };
}

export async function preflightRelease(directory, expected, unpack, npm, api) {
  const checked = validateArtifact(directory, expected, unpack);
  if (expected.existing) {
    verifyGithubAssets(
      await api("GET", `/releases/tags/${expected.tag}`),
      expected,
      checked.assets,
    );
    preflightNpm(directory, npm, unpack);
  }
}

export const unpackManifest = (path) =>
  execFileSync("tar", ["-xOzf", path, "package/package.json"], { encoding: "utf8" });

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const expected = JSON.parse(readFileSync(process.argv[2], "utf8"));
    await preflightRelease(
      process.argv[3],
      expected,
      unpackManifest,
      (args) => execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      releaseApi,
    );
    console.log("Artifact integrity and required recovery comparisons passed before publication.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
