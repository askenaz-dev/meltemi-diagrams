import { cssColor } from "@meltemi/diagrams-capture/page";
import { messages } from "../messages/index.js";

/**
 * The SVG with the given size on its root, so that its view box fits and centres the picture as
 * the CLI's capture page does, and with style rules (font faces) inside it: an SVG drawn as an
 * image sees nothing of the page.
 */
export function sizedSvg(svg: string, width: number, height: number, style = ""): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const sized = tag
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "")
      .replace(/<svg\b/, `<svg width="${width}" height="${height}"`);
    return style ? `${sized}<style>${style}</style>` : sized;
  });
}

/** Loads an SVG text as an image. */
export async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded image keeps its pixels; the address is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** A canvas of `width × height` pixels with the picture drawn over the background. */
export function canvasOf(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false })!;
  return { canvas, context };
}

/** Draws an image over a background (a CSS colour, or transparent) filling the canvas. */
export function drawOn(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  background: string | undefined,
): void {
  context.clearRect(0, 0, width, height);
  const color = cssColor(background);
  if (color !== "transparent") {
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error(messages().video.pictureFailed));
      else void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
    }, type);
  });
}

/**
 * A PNG of a capture job: its SVG at the job's size times its scale, on its background (none when
 * transparent), as the CLI's capture draws it.
 */
export async function pngOf(job: {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
  readonly background?: string;
}): Promise<Uint8Array> {
  const scale = job.scale ?? 1;
  const width = Math.max(1, Math.round(job.width * scale));
  const height = Math.max(1, Math.round(job.height * scale));
  const image = await svgImage(sizedSvg(job.svg, width, height));
  const { canvas, context } = canvasOf(width, height);
  drawOn(context, image, width, height, job.background);
  return canvasBlob(canvas);
}
