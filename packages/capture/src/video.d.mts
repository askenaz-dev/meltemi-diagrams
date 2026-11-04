/** One video to capture and encode. */
export interface VideoJob {
  readonly format: "mp4" | "webm" | "gif";
  /** The frames page: it defines `__draw(t)`. */
  readonly html: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationMs: number;
  /** `transparent`, or a CSS colour. */
  readonly background: string;
  /** Where FFmpeg writes the video. */
  readonly out: string;
}

export interface VideoOptions {
  readonly browser?: string;
  readonly ffmpeg?: string;
  readonly timeout?: number;
  readonly onFrame?: (done: number, total: number) => void;
}

export const NO_FFMPEG: string;
export function findFfmpeg(
  env?: Record<string, string | undefined>,
  platform?: string,
): string | null;
export function ffmpegVersion(ffmpeg: string): string;
export function encoderArgs(
  format: "mp4" | "webm" | "gif",
  options: { fps: number; transparent: boolean; out: string },
): string[];
export function frameTimes(durationMs: number, fps: number): number[];
export function captureVideo(
  job: VideoJob,
  options?: VideoOptions,
): Promise<{ browser: string; ffmpeg: string; frames: number }>;
