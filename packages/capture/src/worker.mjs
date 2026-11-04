// Runs captures for `captureSync`: reads `{ jobs, videos, browser, ffmpeg, timeout }` as JSON on
// stdin, writes each picture to its `out` path (videos are written by FFmpeg), and prints
// `{ browser, ffmpeg, frames }` as JSON. Plain JavaScript for a plain `node`.
import { readFileSync, writeFileSync } from "node:fs";
import { capture } from "./capture.mjs";
import { captureVideo } from "./video.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
const options = {
  browser: input.browser ?? undefined,
  ffmpeg: input.ffmpeg ?? undefined,
  timeout: input.timeout ?? undefined,
};
try {
  let browser = "";
  let ffmpeg = "";
  const frames = [];
  if (input.jobs?.length > 0) {
    const result = await capture(
      input.jobs.map(({ out: _out, ...job }) => job),
      options,
    );
    browser = result.browser;
    input.jobs.forEach((job, i) => writeFileSync(job.out, result.results[i]));
  }
  for (const video of input.videos ?? []) {
    const result = await captureVideo(video, options);
    browser = result.browser;
    ffmpeg = result.ffmpeg;
    frames.push(result.frames);
  }
  process.stdout.write(JSON.stringify({ browser, ffmpeg, frames }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
