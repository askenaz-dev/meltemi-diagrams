import { gunzipSync } from "node:zlib";

const text = (block: Uint8Array, start: number, length: number) =>
  Buffer.from(block.subarray(start, start + length))
    .toString("utf8")
    .replace(/\0[\s\S]*$/, "");

/**
 * The files of a gzipped tar archive by path, as `npm pack` and `pnpm pack` write them: ustar
 * headers, with GNU long names and pax `path` records for long paths.
 */
export function readTarball(bytes: Uint8Array): Map<string, Buffer> {
  const data = gunzipSync(bytes);
  const files = new Map<string, Buffer>();
  let offset = 0;
  let nextName: string | undefined;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(text(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156]!);
    const prefix = text(header, 345, 155);
    const name = text(header, 0, 100);
    const body = data.subarray(offset + 512, offset + 512 + size);
    if (type === "L") {
      nextName = Buffer.from(body)
        .toString("utf8")
        .replace(/\0[\s\S]*$/, "");
    } else if (type === "x") {
      const path = /\d+ path=([^\n]*)\n/.exec(Buffer.from(body).toString("utf8"));
      if (path) nextName = path[1];
    } else {
      if (type === "0" || type === "\0") {
        files.set(nextName ?? (prefix ? `${prefix}/${name}` : name), Buffer.from(body));
      }
      nextName = undefined;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
