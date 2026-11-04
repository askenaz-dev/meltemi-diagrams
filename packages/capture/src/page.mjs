// What a capture draws, without the browser that draws it: the page of a picture and the times of
// a video's frames. Plain JavaScript with no Node module, so pages in a browser use it too.

/** A CSS colour as written by a profile, or transparent when it is not a plain colour. */
export function cssColor(color) {
  if (!color || color === "transparent") return "transparent";
  return /^[#\w(),.%\s-]+$/.test(color) ? color : "transparent";
}

/**
 * The page a job is drawn on: the SVG at the job's size (its view box keeps the picture's ratio,
 * centred), on the job's background, and a printed page of the same size.
 */
export function capturePage(job) {
  const width = Math.round(job.width * 100) / 100;
  const height = Math.round(job.height * 100) / 100;
  const background = cssColor(job.background);
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8"><style>',
    `@page { size: ${width}px ${height}px; margin: 0; }`,
    `html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${background}; }`,
    `body > svg { display: block; width: ${width}px; height: ${height}px; }`,
    "</style></head><body>",
    job.svg,
    "</body></html>",
  ].join("\n");
}

/** The times of the frames of a video of `durationMs` at `fps`, in milliseconds. */
export function frameTimes(durationMs, fps) {
  const count = Math.max(1, Math.round((durationMs * fps) / 1000));
  return Array.from({ length: count }, (_, i) => (i * 1000) / fps);
}
