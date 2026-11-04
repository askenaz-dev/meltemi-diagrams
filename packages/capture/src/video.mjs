// Videos of player documents: frames drawn in one browser page and encoded by the system FFmpeg.
// Plain JavaScript, so a plain `node` (the worker of `captureSync`) can run it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { findBrowser, NO_BROWSER } from "./browser.mjs";
import { PipeSession } from "./cdp.mjs";
import { frameTimes } from "./page.mjs";

export { frameTimes };

/** What to say when FFmpeg is not found. */
export const NO_FFMPEG =
  "Video exports need FFmpeg; install it (it is not bundled) or set MELTEMI_FFMPEG to the ffmpeg executable.";

/**
 * The FFmpeg executable: `MELTEMI_FFMPEG` when set, otherwise `ffmpeg` on the path or in the usual
 * install folders; null when there is none.
 */
export function findFfmpeg(env = process.env, platform = process.platform) {
  const chosen = env.MELTEMI_FFMPEG;
  if (chosen) return existsSync(chosen) ? chosen : null;
  const name = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const path = env.PATH ?? env.Path ?? "";
  for (const folder of path.split(delimiter)) {
    if (folder && existsSync(join(folder, name))) return join(folder, name);
  }
  const usual =
    platform === "win32"
      ? ["C:/ProgramData/chocolatey/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"]
      : ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"];
  return usual.find((p) => existsSync(p)) ?? null;
}

/** The version FFmpeg reports, such as `6.1.1`. */
export function ffmpegVersion(ffmpeg) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const match = /ffmpeg version (\S+)/.exec(result.stdout ?? "");
  return match ? match[1].replace(/-.*$/, "") : "unknown";
}

/**
 * The FFmpeg arguments that encode PNG frames read from standard input into `out` (decision
 * 0026): H.264 MP4, VP9 WebM (with alpha when transparent) or a looping GIF with its own palette.
 */
export function encoderArgs(format, { fps, transparent, out }) {
  const input = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-i",
    "-",
  ];
  if (format === "mp4") {
    return [
      ...input,
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      String(fps),
      out,
    ];
  }
  if (format === "webm") {
    return [
      ...input,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "32",
      "-row-mt",
      "1",
      ...(transparent ? ["-pix_fmt", "yuva420p", "-auto-alt-ref", "0"] : ["-pix_fmt", "yuv420p"]),
      "-r",
      String(fps),
      out,
    ];
  }
  return [
    ...input,
    "-filter_complex",
    "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    "-loop",
    "0",
    out,
  ];
}

/** Writes a buffer to a stream, waiting when it asks to. */
function write(stream, buffer) {
  return new Promise((resolve, reject) => {
    const ok = stream.write(buffer, (error) => (error ? reject(error) : undefined));
    if (ok) resolve();
    else stream.once("drain", resolve);
  });
}

/**
 * Captures a video: the frames page (`html`, which defines `__draw(t)`) at the output size, one
 * screenshot per frame time, piped to FFmpeg. `onFrame(done, total)` reports progress. Resolves to
 * the browser's and FFmpeg's versions and the number of frames.
 */
export async function captureVideo(job, options = {}) {
  const browser = options.browser ?? findBrowser();
  if (!browser) throw new Error(NO_BROWSER);
  const ffmpeg = options.ffmpeg ?? findFfmpeg();
  if (!ffmpeg) throw new Error(NO_FFMPEG);
  const transparent = job.background === "transparent";
  const times = frameTimes(job.durationMs, job.fps);
  const encoder = spawn(
    ffmpeg,
    encoderArgs(job.format, { fps: job.fps, transparent, out: job.out }),
    {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  let errors = "";
  encoder.stderr.setEncoding("utf8");
  encoder.stderr.on("data", (text) => (errors = (errors + text).slice(-4000)));
  const finished = new Promise((resolve, reject) => {
    encoder.once("error", reject);
    encoder.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg failed (exit code ${code}): ${errors.trim()}`)),
    );
  });
  const session = await PipeSession.launch(browser, { timeout: options.timeout ?? 30_000 });
  try {
    const { product } = await session.started();
    const { targetId } = await session.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await session.send("Target.attachToTarget", { targetId, flatten: true });
    await session.send("Page.enable", {}, sessionId);
    await session.send(
      "Emulation.setDeviceMetricsOverride",
      { width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    if (transparent) {
      await session.send(
        "Emulation.setDefaultBackgroundColorOverride",
        { color: { r: 0, g: 0, b: 0, a: 0 } },
        sessionId,
      );
    }
    const { frameTree } = await session.send("Page.getFrameTree", {}, sessionId);
    await session.send(
      "Page.setDocumentContent",
      { frameId: frameTree.frame.id, html: job.html },
      sessionId,
    );
    for (const [i, t] of times.entries()) {
      await session.send(
        "Runtime.evaluate",
        { expression: `__draw(${t})`, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      const { data } = await session.send(
        "Page.captureScreenshot",
        {
          format: "png",
          clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 },
          fromSurface: true,
          captureBeyondViewport: false,
        },
        sessionId,
      );
      await write(encoder.stdin, Buffer.from(data, "base64"));
      options.onFrame?.(i + 1, times.length);
    }
    encoder.stdin.end();
    await finished;
    return { browser: product, ffmpeg: ffmpegVersion(ffmpeg), frames: times.length };
  } catch (error) {
    encoder.kill();
    throw error;
  } finally {
    await session.close();
  }
}
