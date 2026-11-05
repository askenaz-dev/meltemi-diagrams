import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

// Operational helpers execute inside the distribution, without a host Node or database client.
const operations = await import("../../../scripts/local/operations.mjs");
const { settings, lockInstance, validateInstanceMetadata } =
  await import("../../../scripts/local/settings.mjs");

describe("the local distribution's operational boundary", () => {
  it("accepts a loopback origin and refuses unsafe or inconsistent origin input", () => {
    expect(settings({ MELTEMI_ORIGIN: "http://127.0.0.1:8788" }).origin).toBe(
      "http://127.0.0.1:8788",
    );
    for (const value of [
      "http://0.0.0.0:8788",
      "http://192.168.1.1:8788",
      "https://example.com",
      "http://127.0.0.1:8788/x",
      "http://u:p@127.0.0.1:8788",
    ]) {
      expect(() => settings({ MELTEMI_ORIGIN: value })).toThrow();
    }
  });

  it("does not back up a live instance and releases the lock after stop", async () => {
    const folder = await mkdtemp(join(tmpdir(), "meltemi-operations-lock-"));
    const unlock = await lockInstance(folder);
    await expect(lockInstance(folder)).rejects.toThrow("in use");
    await unlock();
    await (
      await lockInstance(folder)
    )();
  });

  it("validates exact loopback origins and SemVer in the shared instance metadata contract", () => {
    const valid = { format: 1, origin: "http://127.0.0.1:8879", version: "1.11.0-rc.1+source.abc" };
    expect(validateInstanceMetadata(valid)).toEqual(valid);
    for (const version of ["", "1.11", "01.11.0", "1.11.0-01", "1.11.0-"]) {
      expect(() => validateInstanceMetadata({ ...valid, version })).toThrow("metadata");
    }
    expect(() => validateInstanceMetadata({ ...valid, origin: valid.origin + "/" })).toThrow(
      "metadata",
    );
  });

  it.each([
    { format: 1 },
    { format: 1, origin: "http://192.168.1.1:8879", version: "1.11.0" },
    { format: 1, origin: "http://127.0.0.1:8879", version: "not-a-version" },
  ])(
    "refuses valid-hash archives with malformed instance metadata %j before touching the target",
    async (metadata) => {
      const folder = await mkdtemp(join(tmpdir(), "meltemi-operations-metadata-"));
      const staged = join(folder, "archive");
      const archive = join(folder, "bad-metadata.meltemi-backup");
      const target = join(folder, "target");
      await mkdir(join(staged, "state"), { recursive: true });
      const instance = JSON.stringify(metadata);
      const state = "preserved source and room state";
      await writeFile(join(staged, "instance.json"), instance);
      await writeFile(join(staged, "state/project.sqlite"), state);
      const entry = (body: string) => ({
        bytes: Buffer.byteLength(body),
        sha256: createHash("sha256").update(body).digest("hex"),
      });
      await writeFile(
        join(staged, "manifest.json"),
        JSON.stringify({
          format: 1,
          metadata,
          files: { "instance.json": entry(instance), "state/project.sqlite": entry(state) },
        }),
      );
      execFileSync("tar", ["-czf", archive, "-C", staged, "."]);
      const original = await readFile(archive);
      await expect(operations.restore(target, archive)).rejects.toThrow("metadata");
      expect((await readdir(target)).filter((name) => name !== ".instance-lock")).toEqual([]);
      expect(await readFile(archive)).toEqual(original);
      await expect(
        operations.backup(staged, join(folder, "must-not-save.meltemi-backup")),
      ).rejects.toThrow("metadata");
    },
  );

  it("preserves complete state through a verified backup and rejects nonempty restore", async () => {
    const folder = await mkdtemp(join(tmpdir(), "meltemi-operations-roundtrip-"));
    const data = join(folder, "source");
    const restored = join(folder, "restored");
    await mkdir(join(data, "state/rooms"), { recursive: true });
    await mkdir(join(data, "state/blobs"), { recursive: true });
    await writeFile(
      join(data, "instance.json"),
      JSON.stringify({ format: 1, version: "1.11.0", origin: "http://127.0.0.1:8788" }),
    );
    await writeFile(join(data, "state/rooms/project.sqlite"), "room source and versions");
    await writeFile(join(data, "state/blobs/image"), new Uint8Array([0, 1, 255, 30]));
    const archive = join(folder, "instance.meltemi-backup");
    await operations.backup(data, archive);
    await operations.restore(restored, archive);
    expect(await readFile(join(restored, "state/rooms/project.sqlite"), "utf8")).toBe(
      "room source and versions",
    );
    expect(await readFile(join(restored, "state/blobs/image"))).toEqual(
      Buffer.from([0, 1, 255, 30]),
    );
    await expect(operations.restore(restored, archive)).rejects.toThrow("fresh empty volume");
    await expect(operations.backup(data, archive)).rejects.toThrow("already exists");
  });

  it("refuses an invalid archive without leaving data in the fresh target", async () => {
    const folder = await mkdtemp(join(tmpdir(), "meltemi-operations-invalid-"));
    const archive = join(folder, "bad.meltemi-backup");
    const target = join(folder, "target");
    await writeFile(archive, "not a backup archive");
    await expect(operations.restore(target, archive)).rejects.toThrow("Archive operation failed");
    expect((await readdir(target)).filter((name) => name !== ".instance-lock")).toEqual([]);
    expect(await readFile(archive, "utf8")).toBe("not a backup archive");
  });
});
