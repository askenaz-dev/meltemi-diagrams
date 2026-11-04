import type { CaptureJob } from "./capture.mjs";

export function cssColor(color: string | undefined): string;
export function capturePage(job: CaptureJob): string;
export function frameTimes(durationMs: number, fps: number): number[];
