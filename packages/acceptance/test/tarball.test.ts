import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { tarballProblems } from "../src/release-check.js";
import { readTarball } from "../src/tarball.js";

/** A ustar header block for a file. */
function header(name: string, size: number, type = "0"): Buffer {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, "utf8");
  block.write(size.toString(8).padStart(11, "0"), 124, "ascii");
  block.write(type, 156, "ascii");
  block.write("ustar", 257, "ascii");
  return block;
}

/** A gzipped tar archive of the files, with GNU long names for long paths. */
function tarball(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  const pad = (data: Buffer) =>
    Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
  for (const [name, content] of Object.entries(files)) {
    if (name.length > 100) {
      const long = Buffer.from(`${name}\0`);
      blocks.push(header("././@LongLink", long.length, "L"), pad(long));
    }
    const data = Buffer.from(content);
    blocks.push(header(name, data.length), pad(data));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const manifest = (fields: Record<string, unknown>) =>
  JSON.stringify({
    name: "@meltemi/diagrams-x",
    version: "1.0.0",
    exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
    ...fields,
  });

describe("tarballs", () => {
  it("reads files, long names included", () => {
    const long = `package/dist/${"deep/".repeat(25)}file.js`;
    const files = readTarball(tarball({ "package/package.json": "{}", [long]: "x" }));
    expect([...files.keys()]).toEqual(["package/package.json", long]);
    expect(files.get(long)!.toString()).toBe("x");
  });

  it("accepts a complete package", () => {
    const files = readTarball(
      tarball({
        "package/package.json": manifest({ dependencies: { "@meltemi/diagrams-model": "1.0.0" } }),
        "package/dist/index.js": "",
        "package/dist/index.d.ts": "",
        "package/README.md": "# x",
        "package/LICENSE": "MIT",
      }),
    );
    expect(tarballProblems(files, "1.0.0")).toEqual([]);
  });

  it("names what a package is missing or should not ship", () => {
    const files = readTarball(
      tarball({
        "package/package.json": manifest({
          version: "0.9.0",
          dependencies: { "@meltemi/diagrams-model": "workspace:*" },
          exports: {
            ".": { "@meltemi/diagrams-source": "./src/index.ts", default: "./dist/index.js" },
          },
          bin: { mdg: "./dist/bin.js" },
        }),
        "package/dist/index.js": "",
        "package/src/index.ts": "",
      }),
    );
    expect(tarballProblems(files, "1.0.0")).toEqual([
      "version 0.9.0, not 1.0.0",
      "dependency @meltemi/diagrams-model is workspace:*",
      "exports name the source condition",
      "missing ./dist/bin.js",
      "no README.md",
      "no LICENSE",
      "ships package/src/index.ts",
    ]);
  });
});
