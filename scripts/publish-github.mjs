// Build a draft, verify every asset, and only then make the release public. Never overwrite bytes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canPromote } from "./automatic-release.mjs";

export function githubAssets(directory, plan) {
  return ["manifest.json", "provenance.json", `meltemi-diagrams-${plan.version}.vsix`].map(
    (name) => {
      const bytes = readFileSync(join(directory, name));
      return { name, bytes, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    },
  );
}

export function verifyGithubAssets(release, plan, assets) {
  if (!release) return;
  if (release.tag_name !== plan.tag) throw new Error("GitHub returned a different release tag.");
  for (const asset of assets) {
    const existing = release.assets.find((entry) => entry.name === asset.name);
    if (existing && (existing.digest !== asset.digest || existing.size !== asset.bytes.length)) {
      throw new Error(`Existing GitHub asset ${asset.name} differs; no bytes were overwritten.`);
    }
    if (!existing && !release.draft)
      throw new Error(`Published release is missing ${asset.name}; refusing to modify it.`);
  }
}

export async function publishGithub(plan, assets, notes, api) {
  let release = await api("GET", `/releases/tags/${plan.tag}`);
  verifyGithubAssets(release, plan, assets);
  if (!release) {
    release = await api("POST", "/releases", {
      tag_name: plan.tag,
      target_commitish: plan.sha,
      name: `Meltemi Diagrams ${plan.version}`,
      body: notes,
      draft: true,
      make_latest: "false",
    });
  }
  if (release.tag_name !== plan.tag) throw new Error("GitHub returned a different release tag.");
  for (const asset of assets) {
    const existing = release.assets.find((entry) => entry.name === asset.name);
    if (existing) {
      if (existing.digest !== asset.digest || existing.size !== asset.bytes.length) {
        throw new Error(`Existing GitHub asset ${asset.name} differs; no bytes were overwritten.`);
      }
    } else {
      if (!release.draft)
        throw new Error(`Published release is missing ${asset.name}; refusing to modify it.`);
      await api(
        "UPLOAD",
        `/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`,
        asset.bytes,
      );
    }
  }
  if (!release.draft) return;
  const verified = await api("GET", `/releases/${release.id}`);
  for (const asset of assets) {
    if (
      !verified.assets.some(
        (entry) =>
          entry.name === asset.name &&
          entry.digest === asset.digest &&
          entry.size === asset.bytes.length,
      )
    ) {
      throw new Error(
        `Uploaded GitHub asset ${asset.name} did not verify; release remains a draft.`,
      );
    }
  }
  const latest = await api("GET", "/releases/latest");
  const currentVersion = latest?.tag_name?.replace(/^v/, "");
  const promote = canPromote(plan.version, currentVersion, plan.latest);
  await api("PATCH", `/releases/${release.id}`, {
    draft: false,
    make_latest: promote ? "true" : "false",
  });
}

export async function releaseApi(method, path, body) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !process.env.GH_TOKEN) {
    throw new Error("GitHub publication requires repository and token.");
  }
  const base =
    method === "UPLOAD"
      ? "https://uploads.github.com"
      : (process.env.GITHUB_API_URL ?? "https://api.github.com");
  const response = await fetch(`${base}/repos/${repository}${path}`, {
    method: method === "UPLOAD" ? "POST" : method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": method === "UPLOAD" ? "application/octet-stream" : "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body === undefined ? undefined : method === "UPLOAD" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (
    response.status === 404 &&
    method === "GET" &&
    (path.startsWith("/releases/tags/") || path === "/releases/latest")
  )
    return undefined;
  if (!response.ok)
    throw new Error(
      `GitHub ${method} failed (HTTP ${response.status}); release state was not assumed.`,
    );
  return response.json();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const plan = JSON.parse(readFileSync("release/delivery-plan.json", "utf8"));
    const assets = githubAssets("release", plan);
    await publishGithub(plan, assets, readFileSync("release/notes.md", "utf8"), releaseApi);
    console.log("GitHub release and every required asset verified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
