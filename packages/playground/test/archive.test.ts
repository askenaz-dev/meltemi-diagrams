import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARE_LIMITS, decodeShare, encodeShare, shareLink, sharedValue } from "../src/share.js";
import { crc32, readZip, writeZip, ZipError } from "../src/zip.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("zip", () => {
  it("writes archives that it reads back, stored or deflated", async () => {
    const entries = [
      { path: "shop/project.json", data: encoder.encode('{ "name": "shop" }\n') },
      {
        path: "shop/diagrams/a.meltemi",
        data: encoder.encode("diagram a: flow {\n}\n".repeat(40)),
      },
      { path: "shop/diagrams/logo.png", data: new Uint8Array([137, 80, 78, 71, 0, 1, 2]) },
    ];
    const zip = await writeZip(entries, { date: new Date(2026, 9, 11, 12, 0, 0) });
    const read = await readZip(zip);
    // A single top folder is the project itself.
    expect(read.map((e) => e.path)).toEqual([
      "project.json",
      "diagrams/a.meltemi",
      "diagrams/logo.png",
    ]);
    expect(decoder.decode(read[1]!.data)).toBe(decoder.decode(entries[1]!.data));
    expect(read[2]!.data).toEqual(entries[2]!.data);
    // The repeated sheet was deflated.
    expect(zip.length).toBeLessThan(entries.reduce((n, e) => n + e.data.length, 0));
  });

  it("is read by the system's unzip when it has one", async () => {
    const tar = ["C:/Windows/System32/tar.exe", "/usr/bin/unzip", "/usr/bin/bsdtar"].find((p) =>
      existsSync(p),
    );
    if (!tar) return;
    const folder = mkdtempSync(join(tmpdir(), "pg-zip-"));
    try {
      const zip = await writeZip([
        { path: "p/project.json", data: encoder.encode("{}\n") },
        { path: "p/diagrams/ü.meltemi", data: encoder.encode("x\n".repeat(100)) },
      ]);
      writeFileSync(join(folder, "a.zip"), zip);
      if (tar.endsWith("unzip")) execFileSync(tar, ["-q", "a.zip"], { cwd: folder });
      else execFileSync(tar, ["-xf", "a.zip"], { cwd: folder });
      expect(readFileSync(join(folder, "p", "project.json"), "utf8")).toBe("{}\n");
      expect(readFileSync(join(folder, "p", "diagrams", "ü.meltemi"), "utf8")).toBe(
        "x\n".repeat(100),
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("refuses damaged and oversized archives", async () => {
    await expect(readZip(new Uint8Array(100))).rejects.toBeInstanceOf(ZipError);
    const zip = await writeZip([{ path: "a.txt", data: encoder.encode("a".repeat(1000)) }]);
    await expect(readZip(zip, { files: 10, bytes: 100 })).rejects.toThrow(/larger than allowed/);
    const damaged = zip.slice();
    damaged[40] = damaged[40]! ^ 0xff;
    await expect(readZip(damaged)).rejects.toBeInstanceOf(Error);
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("share links", () => {
  it("carries the text files and the open file in the fragment", async () => {
    const value = await encodeShare({
      open: "diagrams/a.meltemi",
      files: { "project.json": "{}\n", "diagrams/a.meltemi": "diagram a: flow {\n}\n" },
    });
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    const link = shareLink("https://example.test/playground/#old", value);
    expect(link).toBe(`https://example.test/playground/#p=${value}`);
    expect(sharedValue(new URL(link).hash)).toBe(value);
    expect(await decodeShare(value)).toEqual({
      open: "diagrams/a.meltemi",
      files: { "project.json": "{}\n", "diagrams/a.meltemi": "diagram a: flow {\n}\n" },
    });
  });

  it("refuses damaged links, unsafe paths and projects beyond 4 MiB", async () => {
    await expect(decodeShare("not base64!")).rejects.toThrow(/damaged/);
    await expect(decodeShare("AAAA")).rejects.toThrow(/damaged/);
    const unsafe = await encodeShare({ open: "", files: { "../x.meltemi": "x" } });
    await expect(decodeShare(unsafe)).rejects.toThrow(/cannot be opened/);
    const big = await encodeShare({
      open: "",
      files: { "a.meltemi": "x".repeat(SHARE_LIMITS.decompressed + 10) },
    });
    // Repeated text compresses to a short link that would expand beyond the limit.
    expect(big.length).toBeLessThan(20_000);
    await expect(decodeShare(big)).rejects.toThrow(/larger than 4 MiB/);
  });
});
