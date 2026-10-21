/** One picture to capture. */
export interface CaptureJob {
  readonly kind: "png" | "pdf";
  /** The SVG of the picture. */
  readonly svg: string;
  /** The size of the output in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** PNG: pixels per CSS pixel. */
  readonly scale?: number;
  /** A CSS colour, or `transparent` (the default). */
  readonly background?: string;
}

export interface CaptureOptions {
  /** The browser's executable; found when absent. */
  readonly browser?: string;
  /** How long the browser may take to answer, in milliseconds. */
  readonly timeout?: number;
}

/** The page a job is drawn on. */
export function capturePage(job: CaptureJob): string;

/** Captures the jobs in one browser session. */
export function capture(
  jobs: readonly CaptureJob[],
  options?: CaptureOptions,
): Promise<{ browser: string; results: Uint8Array[] }>;
