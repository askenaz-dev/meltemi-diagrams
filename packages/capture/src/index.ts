import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findBrowser, NO_BROWSER } from "./browser.mjs";
import { capture, capturePage, type CaptureJob, type CaptureOptions } from "./capture.mjs";
import {
  NO_FFMPEG,
  captureVideo,
  encoderArgs,
  ffmpegVersion,
  findFfmpeg,
  frameTimes,
  type VideoJob,
  type VideoOptions,
} from "./video.mjs";

export const PACKAGE_NAME = "@meltemi/diagrams-capture";

export { capture, capturePage, findBrowser, NO_BROWSER, type CaptureJob, type CaptureOptions };
export {
  NO_FFMPEG,
  captureVideo,
  encoderArgs,
  ffmpegVersion,
  findFfmpeg,
  frameTimes,
  type VideoJob,
  type VideoOptions,
};

/** A job of `captureSync`: where its file goes. */
export interface FileJob extends CaptureJob {
  readonly out: string;
}

/**
 * Captures the pictures and videos and writes their files, waiting for the browser and FFmpeg: the
 * same captures run in a child `node` process, for synchronous callers such as the command line.
 * Returns the browser's and FFmpeg's versions and each video's frame count; throws with their
 * message when one fails.
 */
export function captureSync(
  jobs: readonly FileJob[],
  options: CaptureOptions & {
    readonly videos?: readonly VideoJob[];
    readonly ffmpeg?: string;
  } = {},
): { browser: string; ffmpeg: string; frames: number[] } {
  const browser = options.browser ?? findBrowser();
  if (!browser) throw new Error(NO_BROWSER);
  const videos = options.videos ?? [];
  const ffmpeg = videos.length > 0 ? (options.ffmpeg ?? findFfmpeg()) : null;
  if (videos.length > 0 && !ffmpeg) throw new Error(NO_FFMPEG);
  const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [worker], {
    input: JSON.stringify({ jobs, videos, browser, ffmpeg, timeout: options.timeout ?? null }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || "The browser could not capture the picture.");
  return JSON.parse(result.stdout) as { browser: string; ffmpeg: string; frames: number[] };
}

/** The size and colour type of a PNG file, from its header. */
export function pngInfo(bytes: Uint8Array): { width: number; height: number; alpha: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((b, i) => bytes[i] !== b)) {
    throw new Error("Not a PNG file.");
  }
  const colorType = bytes[25]!;
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    alpha: colorType === 4 || colorType === 6,
  };
}

/**
 * The output size for a picture: `size` when given (the picture is fitted and centred in it), or
 * the picture's own size.
 */
export function outputSize(
  picture: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number } | null,
): { width: number; height: number } {
  return size
    ? { width: size.width, height: size.height }
    : { width: picture.width, height: picture.height };
}
