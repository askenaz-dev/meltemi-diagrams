import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, mkdir, open, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const CLOUD = join(ROOT, "packages/cloud");

/** The public origin is independent of the container's private listening port. */
export function settings(env = process.env) {
  const given = env.MELTEMI_ORIGIN ?? "http://127.0.0.1:8879";
  const origin = new URL(given);
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    given.replace(/\/$/, "") !== origin.origin
  )
    throw new Error(
      "MELTEMI_ORIGIN must be http://127.0.0.1:<port>, without a path or credentials.",
    );
  const port = Number(env.MELTEMI_LISTEN_PORT ?? origin.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("MELTEMI_LISTEN_PORT must be an integer from 1024 to 65535.");
  }
  const bind = env.MELTEMI_BIND ?? "127.0.0.1";
  if (bind !== "0.0.0.0" && bind !== "127.0.0.1")
    throw new Error("Unsupported local listener address.");
  return {
    origin: origin.origin,
    port,
    bind,
    data: resolve(env.MELTEMI_DATA ?? join(ROOT, ".test-output/local-data")),
  };
}

/** Validate the persisted/archived contract before starting a runtime or writing restored state. */
export function validateInstanceMetadata(value) {
  const unsupported = () =>
    new Error(
      "Unsupported local instance metadata. Preserve the volume before attempting recovery.",
    );
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.format !== 1 ||
    typeof value.origin !== "string" ||
    typeof value.version !== "string"
  )
    throw unsupported();
  const version =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value.version,
    );
  if (!version || version[4]?.split(".").some((part) => /^0\d+$/.test(part))) throw unsupported();
  try {
    if (settings({ MELTEMI_ORIGIN: value.origin }).origin !== value.origin) throw unsupported();
  } catch {
    throw unsupported();
  }
  return value;
}

async function processIdentity(pid) {
  if (process.platform === "linux") {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    } catch {
      return undefined;
    }
  }
  try {
    process.kill(pid, 0);
    return String(pid);
  } catch {
    return undefined;
  }
}

function kernelLock(path) {
  return new Promise((resolveLock, reject) => {
    // flock belongs to the shared filesystem/kernel, independent of container PID namespaces.
    // Its child holds the descriptor until this launcher's pipe closes (also after a crash).
    const child = spawn(
      "flock",
      [
        "--nonblock",
        path,
        process.execPath,
        "--input-type=commonjs",
        "-e",
        "process.stdin.resume(); process.stdout.write('locked\\n'); process.stdin.once('end', () => process.exit(0));",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let acquired = false;
    const ended = new Promise((done) => child.once("close", done));
    child.once("error", reject);
    child.stdout.once("data", () => {
      acquired = true;
      resolveLock(async () => {
        child.stdin.end();
        await ended;
      });
    });
    child.once("exit", (code) => {
      if (!acquired)
        reject(
          new Error(
            code === 1
              ? "The local instance is in use. Stop it before backup, restore or another launcher."
              : "Could not acquire the shared-volume kernel lock.",
          ),
        );
    });
  });
}

/** Linux containers use a kernel lock; the PID fallback is only for native non-Linux development. */
export async function lockInstance(data) {
  await mkdir(data, { recursive: true });
  const path = join(data, ".instance-lock");
  if (process.platform === "linux") return kernelLock(path);
  const owner = { pid: process.pid, identity: await processIdentity(process.pid) };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, "wx", 0o600);
      await file.writeFile(JSON.stringify(owner));
      await file.close();
      return async () => {
        const current = JSON.parse(await readFile(path, "utf8"));
        if (current.pid === owner.pid && current.identity === owner.identity) await rm(path);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let current;
      try {
        current = JSON.parse(await readFile(path, "utf8"));
      } catch (cause) {
        throw new Error(
          "The instance lock is unreadable; preserve the volume and inspect it before retrying.",
          { cause },
        );
      }
      if (current.identity && (await processIdentity(current.pid)) === current.identity) {
        throw new Error(
          "The local instance is in use. Stop it before backup, restore or another launcher.",
          { cause: error },
        );
      }
      await rm(path);
    }
  }
  throw new Error("Could not acquire the instance lock.");
}

export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
