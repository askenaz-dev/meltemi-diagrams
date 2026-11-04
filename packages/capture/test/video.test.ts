import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  captureSync,
  captureVideo,
  encoderArgs,
  findBrowser,
  findFfmpeg,
  frameTimes,
} from "../src/index.js";

const ffmpeg = findFfmpeg();
const ffprobe = ffmpeg
  ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
  : null;
const ready = findBrowser() !== null && ffprobe !== null && existsSync(ffprobe);
const scratch = mkdtempSync(join(tmpdir(), "mdg-video-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A page whose colour depends on the time: red, then blue from 500 ms. */
const PAGE = `<!doctype html><html><body style="margin:0;width:320px;height:180px">
<script>window.__draw = (t) => { document.body.style.background = t < 500 ? "#ff0000" : "#0000ff"; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };</script>
</body></html>`;

function probe(file: string): Record<string, string> {
  const result = spawnSync(
    ffprobe!,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=codec_name,width,height,pix_fmt,nb_read_frames,r_frame_rate:format=duration",
      "-of",
      "default=noprint_wrappers=1",
      file,
    ],
    { encoding: "utf8" },
  );
  return Object.fromEntries(
    result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("=") as [string, string]),
  );
}

describe("video encoding", () => {
  it("times frames on the clock and names the encoders", () => {
    expect(frameTimes(1000, 10)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(frameTimes(0, 30)).toEqual([0]);
    expect(encoderArgs("mp4", { fps: 30, transparent: false, out: "a.mp4" })).toEqual(
      expect.arrayContaining(["libx264", "yuv420p", "+faststart"]),
    );
    expect(encoderArgs("webm", { fps: 30, transparent: true, out: "a.webm" })).toEqual(
      expect.arrayContaining(["libvpx-vp9", "yuva420p"]),
    );
    expect(encoderArgs("gif", { fps: 15, transparent: false, out: "a.gif" }).join(" ")).toContain(
      "palettegen",
    );
  });

  it("finds FFmpeg through MELTEMI_FFMPEG", () => {
    expect(findFfmpeg({ MELTEMI_FFMPEG: join(scratch, "missing") })).toBeNull();
  });
});

describe.skipIf(!ready)("videos with the browser and FFmpeg", () => {
  it("writes MP4 and WebM frame by frame", async () => {
    const mp4 = join(scratch, "clip.mp4");
    const result = await captureVideo({
      format: "mp4",
      html: PAGE,
      width: 320,
      height: 180,
      fps: 10,
      durationMs: 1000,
      background: "#ffffff",
      out: mp4,
    });
    expect(result.frames).toBe(10);
    expect(result.ffmpeg).toMatch(/^\d/);
    expect(probe(mp4)).toMatchObject({
      codec_name: "h264",
      width: "320",
      height: "180",
      pix_fmt: "yuv420p",
      nb_read_frames: "10",
      r_frame_rate: "10/1",
    });
    expect(Number(probe(mp4).duration)).toBeCloseTo(1, 1);
    const webm = join(scratch, "clip.webm");
    await captureVideo({
      format: "webm",
      html: PAGE,
      width: 320,
      height: 180,
      fps: 10,
      durationMs: 500,
      background: "transparent",
      out: webm,
    });
    expect(probe(webm)).toMatchObject({ codec_name: "vp9", width: "320" });
  }, 120_000);

  it("writes GIF synchronously for the command line", () => {
    const gif = join(scratch, "clip.gif");
    const result = captureSync([], {
      videos: [
        {
          format: "gif",
          html: PAGE,
          width: 160,
          height: 90,
          fps: 5,
          durationMs: 1000,
          background: "#ffffff",
          out: gif,
        },
      ],
    });
    expect(result.frames).toEqual([5]);
    expect(probe(gif)).toMatchObject({ codec_name: "gif", width: "160", height: "90" });
  }, 120_000);
});
