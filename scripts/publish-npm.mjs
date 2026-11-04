// Publish checked artifacts with authentic runner provenance and separate product source metadata.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { canPromote } from "./automatic-release.mjs";
import { packageSource } from "./package-source.mjs";

export const NPM_PACKAGE_NAMES = [
  "assets",
  "assist",
  "canvas",
  "capture",
  "catalog",
  "cli",
  "edit",
  "editor",
  "fonts",
  "i18n",
  "import",
  "language",
  "layout",
  "layout-elk",
  "model",
  "motion",
  "player",
  "project",
  "render",
].map((name) => `@meltemi/diagrams-${name}`);

export function registryVersion(query, run, field = "version") {
  try {
    const version = JSON.parse(run(["view", query, field, "--json"]));
    if (typeof version !== "string") throw new Error("Registry returned no single version.");
    return version;
  } catch (error) {
    // A timeout/authentication error is never evidence that a version does not exist.
    for (const text of [error.stdout, error.stderr]) {
      try {
        if (JSON.parse(String(text)).error?.code === "E404") return undefined;
      } catch {
        /* Not npm's structured error. */
      }
    }
    throw new Error(`Cannot verify npm version ${query}; publication stopped.`, { cause: error });
  }
}

export function publicationEnvironment(plan, env) {
  if (!/^[a-f0-9]{40}$/.test(plan.sha) || plan.tag !== `v${plan.version}`) {
    throw new Error("Invalid checked source provenance.");
  }
  // Sigstore's certificate binds the real runner SHA/ref. Substituting a product tag or an
  // older recovery source makes the statement disagree with that certificate (npm E422).
  return { ...env };
}

export function checkedNpmPackages(directory, unpack) {
  const plan = JSON.parse(readFileSync(join(directory, "delivery-plan.json"), "utf8"));
  const source = plan.packageSourceMetadata === 1 ? packageSource(plan) : undefined;
  const packages = readdirSync(directory)
    .filter((name) => name.endsWith(".tgz"))
    .sort()
    .map((file) => {
      const path = `${isAbsolute(directory) ? "" : "./"}${join(directory, file).replaceAll("\\", "/")}`;
      const manifest = JSON.parse(unpack(path));
      if (
        !NPM_PACKAGE_NAMES.includes(manifest.name) ||
        file !== `${manifest.name.replace("@", "").replace("/", "-")}-${plan.version}.tgz`
      )
        throw new Error("Tarball package name or filename is outside the checked package set.");
      if (manifest.version !== plan.version)
        throw new Error("Tarball version differs from checked plan.");
      if (
        source &&
        Object.entries(source).some(([key, value]) => manifest.meltemiRelease?.[key] !== value)
      ) {
        throw new Error("Tarball source metadata differs from checked plan.");
      }
      const integrity = `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;
      return { name: manifest.name, version: manifest.version, path, integrity };
    });
  if (packages.length !== 19 || new Set(packages.map((pkg) => pkg.name)).size !== 19)
    throw new Error("Expected nineteen distinct checked npm tarballs.");
  return { plan, packages };
}

export function preflightNpm(directory, run, unpack) {
  const checked = checkedNpmPackages(directory, unpack);
  for (const pkg of checked.packages) {
    pkg.exists = Boolean(registryVersion(`${pkg.name}@${pkg.version}`, run));
    if (
      pkg.exists &&
      registryVersion(`${pkg.name}@${pkg.version}`, run, "dist.integrity") !== pkg.integrity
    ) {
      throw new Error(
        `${pkg.name}@${pkg.version} exists with different bytes; refusing to replace it.`,
      );
    }
  }
  return checked;
}

export function publishNpm(directory, run, unpack) {
  // Complete every comparison before the first write, including conflicts late in the list.
  const { plan, packages } = preflightNpm(directory, run, unpack);
  for (const pkg of packages) {
    if (!pkg.exists) {
      run([
        "publish",
        pkg.path,
        "--access",
        "public",
        "--provenance",
        "--tag",
        `release-${pkg.version}`,
      ]);
    }
  }
  for (const pkg of packages) {
    const latest = registryVersion(`${pkg.name}@latest`, run);
    if (canPromote(pkg.version, latest, plan.latest)) {
      run(["dist-tag", "add", `${pkg.name}@${pkg.version}`, "latest"]);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (!process.env.NODE_AUTH_TOKEN) throw new Error("NPM_TOKEN is not configured.");
    const plan = JSON.parse(readFileSync("release/delivery-plan.json", "utf8"));
    const env = publicationEnvironment(plan, process.env);
    const run = (args) =>
      execFileSync("npm", args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    publishNpm("release", run, (path) =>
      execFileSync("tar", ["-xOzf", path, "package/package.json"], { encoding: "utf8" }),
    );
    console.log("npm packages are present; latest promoted only where safe.");
  } catch (error) {
    console.error(
      error.message.startsWith("Command failed")
        ? "npm publication failed; inspect registry configuration."
        : error.message,
    );
    process.exitCode = 1;
  }
}
