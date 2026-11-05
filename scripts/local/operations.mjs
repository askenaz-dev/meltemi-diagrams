import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { settings, lockInstance, validateInstanceMetadata } from "./settings.mjs";

function tar(args) {
  return new Promise((done, fail) => {
    const child = spawn("tar", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let errors = "";
    child.stdout.on("data", (bytes) => {
      output += bytes;
    });
    child.stderr.on("data", (bytes) => {
      errors += bytes;
    });
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? done(output) : fail(new Error(`Archive operation failed: ${errors.trim()}`)),
    );
  });
}

async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

async function inventory(root, prefix = "") {
  const entries = {};
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = join(root, prefix, name);
    const key = [...prefix.split(/[\\/]/).filter(Boolean), name].join("/");
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || /[\r\n]/.test(name))
      throw new Error("Backup state contains an unsupported link or filename.");
    if (stat.isDirectory()) Object.assign(entries, await inventory(root, key));
    else if (stat.isFile()) entries[key] = { bytes: stat.size, sha256: await fileHash(path) };
    else throw new Error("Backup state contains an unsupported special file.");
  }
  return entries;
}

/** Only delete a task-created staging directory strictly inside the system temporary folder. */
async function removeStage(path) {
  const target = resolve(path);
  const parent = resolve(tmpdir());
  const rel = relative(parent, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !rel.startsWith("meltemi-local-")) {
    throw new Error("Refusing to remove a directory outside the backup staging area.");
  }
  await rm(target, { recursive: true, force: true });
}

export async function backup(data, archive) {
  const unlock = await lockInstance(data);
  const stage = await mkdtemp(join(tmpdir(), "meltemi-local-backup-"));
  const output = resolve(archive);
  let temporary;
  try {
    const metadata = validateInstanceMetadata(
      JSON.parse(await readFile(join(data, "instance.json"), "utf8")),
    );
    await cp(join(data, "state"), join(stage, "state"), { recursive: true, dereference: false });
    await writeFile(join(stage, "instance.json"), JSON.stringify(metadata));
    const files = await inventory(stage);
    await writeFile(
      join(stage, "manifest.json"),
      JSON.stringify({ format: 1, createdAt: new Date().toISOString(), metadata, files }),
    );
    await mkdir(dirname(output), { recursive: true });
    try {
      await lstat(output);
      throw new Error("Backup destination already exists; choose a new filename.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    temporary = `${output}.${process.pid}.partial`;
    await tar(["-czf", temporary, "-C", stage, "."]);
    await rename(temporary, output);
    temporary = undefined;
    return { archive: output, files: Object.keys(files).length };
  } finally {
    if (temporary) await rm(temporary, { force: true });
    await removeStage(stage);
    await unlock();
  }
}

export async function restore(data, archive) {
  const unlock = await lockInstance(data);
  const stage = await mkdtemp(join(tmpdir(), "meltemi-local-restore-"));
  try {
    const existing = (await readdir(data)).filter((name) => name !== ".instance-lock");
    if (existing.length)
      throw new Error("Restore requires a fresh empty volume; existing data was not changed.");
    const source = resolve(archive);
    const names = (await tar(["-tzf", source])).split(/\r?\n/).filter(Boolean);
    if (
      names.some(
        (name) =>
          name.includes("\\") ||
          name.startsWith("/") ||
          /^[A-Za-z]:/.test(name) ||
          name.split("/").includes(".."),
      )
    ) {
      throw new Error("Backup archive contains an unsafe path.");
    }
    const listing = (await tar(["-tvzf", source])).split(/\r?\n/).filter(Boolean);
    if (listing.some((line) => !["-", "d"].includes(line[0])))
      throw new Error("Backup archive contains links or special files.");
    await tar(["-xzf", source, "-C", stage]);
    const manifest = JSON.parse(await readFile(join(stage, "manifest.json"), "utf8"));
    if (manifest.format !== 1 || !manifest.files || typeof manifest.files !== "object") {
      throw new Error("Backup metadata is not supported.");
    }
    validateInstanceMetadata(manifest.metadata);
    const meta = validateInstanceMetadata(
      JSON.parse(await readFile(join(stage, "instance.json"), "utf8")),
    );
    if (JSON.stringify(meta) !== JSON.stringify(manifest.metadata))
      throw new Error("Backup instance metadata differs from its manifest.");
    const actual = await inventory(stage);
    delete actual["manifest.json"];
    if (JSON.stringify(actual) !== JSON.stringify(manifest.files))
      throw new Error("Backup file hashes or contents differ from the manifest.");
    if (!Object.keys(actual).some((name) => name.startsWith("state/")))
      throw new Error("The backup has no instance state.");
    // All paths, metadata and hashes are checked before the empty target is touched.
    await cp(join(stage, "state"), join(data, "state"), { recursive: true });
    await cp(join(stage, "instance.json"), join(data, "instance.json"));
    return { archive: source, files: Object.keys(actual).length };
  } finally {
    await removeStage(stage);
    await unlock();
  }
}

export async function operate(operation, args, env = process.env) {
  if (args.length !== 1 || !args[0])
    throw new Error(`Usage: ${operation} <archive.meltemi-backup>`);
  const { data } = settings(env);
  const result = await (operation === "backup" ? backup(data, args[0]) : restore(data, args[0]));
  console.log(
    `${operation === "backup" ? "Saved" : "Restored"} ${result.files} verified files: ${result.archive}`,
  );
}
