import type { VideoJob } from "@meltemi/diagrams-capture";
import { cssColor, frameTimes } from "@meltemi/diagrams-capture/page";
import { frameSvg, type PlayerDocument } from "@meltemi/diagrams-player";
import { GifWriter, Histogram, Quantizer, gifDelays, medianCut } from "../encode/gif.js";
import { writeMp4 } from "../encode/mp4.js";
import { writeWebm, type EncodedFrame } from "../encode/webm.js";
import { messages } from "../messages/index.js";
import { canvasOf, sizedSvg, svgImage } from "./raster.js";

/** Frames sampled for the GIF's palette, evenly over the animation. */
const PALETTE_SAMPLES = 24;

export class VideoCancelled extends Error {}

/** The codecs a format's video needs, as people know them. */
const codecs = (format: "mp4" | "webm") => (format === "mp4" ? "H.264" : messages().video.vp);

/** Why the browser cannot make a format, or undefined when it can. */
export async function videoSupport(format: "mp4" | "webm" | "gif"): Promise<string | undefined> {
  if (format === "gif") return undefined;
  if (typeof VideoEncoder === "undefined") return messages().video.noEncoder;
  const config = await videoConfig(format, 1920, 1080, 30);
  return config ? undefined : messages().video.cannotEncode(codecs(format));
}

interface Chosen {
  readonly config: VideoEncoderConfig;
  readonly codec: "V_VP9" | "V_VP8" | "avc";
}

/** The first encoder configuration the browser supports, software encoders first. */
async function videoConfig(
  format: "mp4" | "webm",
  width: number,
  height: number,
  fps: number,
): Promise<Chosen | undefined> {
  const bitrate = Math.round(width * height * fps * 0.12);
  const candidates: Chosen[] =
    format === "webm"
      ? [
          {
            codec: "V_VP9",
            config: { codec: "vp09.00.40.08", width, height, bitrate, framerate: fps },
          },
          {
            codec: "V_VP9",
            config: { codec: "vp09.00.10.08", width, height, bitrate, framerate: fps },
          },
          { codec: "V_VP8", config: { codec: "vp8", width, height, bitrate, framerate: fps } },
        ]
      : ["avc1.640033", "avc1.640028", "avc1.4d0033", "avc1.4d0028", "avc1.42e01f"].map(
          (codec) => ({
            codec: "avc" as const,
            config: {
              codec,
              width,
              height,
              bitrate,
              framerate: fps,
              avc: { format: "avc" as const },
            },
          }),
        );
  for (const candidate of candidates) {
    for (const hardwareAcceleration of ["prefer-software", "no-preference"] as const) {
      const config = { ...candidate.config, hardwareAcceleration, latencyMode: "quality" as const };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return { codec: candidate.codec, config };
      } catch {
        // An unknown codec string: try the next.
      }
    }
  }
  return undefined;
}

export interface VideoResult {
  readonly data: Uint8Array;
  readonly type: string;
}

/**
 * Records a video job in the browser: the frames of the player document at `i × 1000 / fps`
 * milliseconds, drawn at the output size on the background, then encoded as GIF (by this page),
 * or WebM and MP4 (by the browser's encoder, written into their containers by this page).
 */
export async function recordVideo(
  job: VideoJob,
  document: PlayerDocument,
  progress: (done: number, total: number) => void,
  signal: AbortSignal,
  application: string,
): Promise<VideoResult> {
  const m = messages();
  const background = cssColor(job.background);
  if (job.format !== "gif" && background === "transparent") {
    throw new Error(m.video.transparent);
  }
  // H.264 needs even sides; the picture is padded as the CLI pads it.
  const width = job.format === "mp4" ? Math.ceil(job.width / 2) * 2 : job.width;
  const height = job.format === "mp4" ? Math.ceil(job.height / 2) * 2 : job.height;
  const times = frameTimes(job.durationMs, job.fps);
  const style = document.fontFaces.join("\n");
  const { canvas, context } = canvasOf(width, height);
  const draw = async (t: number) => {
    if (signal.aborted) throw new VideoCancelled(m.exports.cancelled);
    const svg = sizedSvg(
      frameSvg(document, t, { background: job.background }),
      job.width,
      job.height,
      style,
    );
    const image = await svgImage(svg);
    context.clearRect(0, 0, width, height);
    if (background !== "transparent") {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    // The frame is centred when the sides were padded.
    context.drawImage(
      image,
      Math.floor((width - job.width) / 2),
      Math.floor((height - job.height) / 2),
      job.width,
      job.height,
    );
  };

  if (job.format === "gif") {
    const histogram = new Histogram();
    const step = Math.max(1, Math.floor(times.length / PALETTE_SAMPLES));
    const sampled = times.filter((_, i) => i % step === 0);
    for (const [i, t] of sampled.entries()) {
      await draw(t);
      histogram.add(context.getImageData(0, 0, width, height).data, 2);
      progress(Math.round((i / sampled.length) * times.length * 0.2), times.length);
    }
    const transparent = background === "transparent";
    const palette = medianCut(histogram, 256, transparent);
    const quantizer = new Quantizer(palette, transparent);
    const writer = new GifWriter(width, height, palette, transparent);
    const delays = gifDelays(times.length, job.fps);
    for (const [i, t] of times.entries()) {
      await draw(t);
      writer.add(
        quantizer.map(context.getImageData(0, 0, width, height).data, width, height),
        delays[i]!,
      );
      progress(i + 1, times.length);
    }
    return { data: writer.finish(), type: "image/gif" };
  }

  const chosen = await videoConfig(job.format, width, height, job.fps);
  if (!chosen) throw new Error(m.video.commandLineCan(codecs(job.format), job.format));
  const frames: EncodedFrame[] = [];
  let description: Uint8Array | undefined;
  let failure: Error | undefined;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push({ data, timestamp: chunk.timestamp, key: chunk.type === "key" });
      const config = metadata?.decoderConfig?.description;
      if (config && !description) {
        description = ArrayBuffer.isView(config)
          ? new Uint8Array(config.buffer, config.byteOffset, config.byteLength).slice()
          : new Uint8Array(config).slice();
      }
    },
    error: (error) => (failure = error instanceof Error ? error : new Error(String(error))),
  });
  encoder.configure(chosen.config);
  const frameDuration = Math.round(1_000_000 / job.fps);
  try {
    for (const [i, t] of times.entries()) {
      await draw(t);
      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDuration,
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
      frame.close();
      // Keep the encoder's queue short, so memory stays small for long videos.
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5));
      if (failure) throw failure;
      progress(i + 1, times.length);
    }
    await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  if (failure) throw failure;
  if (chosen.codec === "avc") {
    if (!description) throw new Error(m.video.noDecoderConfig);
    return {
      data: writeMp4(frames, { width, height, fps: job.fps, avcc: description, application }),
      type: "video/mp4",
    };
  }
  return {
    data: writeWebm(frames, {
      codec: chosen.codec,
      width,
      height,
      durationMs: job.durationMs,
      application,
    }),
    type: "video/webm",
  };
}
