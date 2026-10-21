import type { IconGeometry, Paint } from "./icon.js";
import { messages } from "./messages/index.js";
import { sanitizeSvg } from "./sanitize.js";

/** Raster and vector formats accepted for `image` objects. */
export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "svg";

/** Largest image file, in bytes. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Size of an SVG image that declares neither `width` and `height` nor a `viewBox`. */
export const UNKNOWN_IMAGE_SIZE = { width: 160, height: 120 } as const;

/** An image ready to embed: its format, pixel size and a `data:` URI. */
export interface ResolvedImage {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly href: string;
}

/** Resolves an image path written in a diagram, relative to its file. */
export interface ImageResolver {
  resolve(path: string): ResolvedImage | undefined;
}

export type ImageResult =
  | { readonly ok: true; readonly image: ResolvedImage }
  | { readonly ok: false; readonly message: string };

const MIME: Readonly<Record<ImageFormat, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Reads an image file: its format from the header, its pixel size, and a data URI. */
export function readImage(bytes: Uint8Array): ImageResult {
  // Problems are written in the interface language of the moment the file is read.
  const t = messages().images;
  if (bytes.length > IMAGE_MAX_BYTES) {
    return { ok: false, message: t.fileSize(IMAGE_MAX_BYTES / 1024 / 1024) };
  }
  const raster = rasterSize(bytes);
  if (raster) {
    if (!raster.ok) return raster;
    const { format, width, height } = raster;
    return {
      ok: true,
      image: { format, width, height, href: `data:${MIME[format]};base64,${base64(bytes)}` },
    };
  }
  const text = decodeUtf8(bytes);
  if (text !== undefined && /<svg[\s>]/.test(text.slice(0, 4096))) return svgImage(text);
  return { ok: false, message: t.format };
}

type RasterResult =
  | {
      readonly ok: true;
      readonly format: ImageFormat;
      readonly width: number;
      readonly height: number;
    }
  | { readonly ok: false; readonly message: string };

function u16be(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}

function u16le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8);
}

function u24le(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
}

function u32be(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
}

function ascii(b: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...b.subarray(start, start + length));
}

/** The format and size of a raster image, or undefined when the header is not a raster format. */
function rasterSize(b: Uint8Array): RasterResult | undefined {
  const broken = (format: string): RasterResult => ({
    ok: false,
    message: messages().images.brokenHeader(format),
  });
  const sized = (format: ImageFormat, width: number, height: number): RasterResult =>
    width > 0 && height > 0 ? { ok: true, format, width, height } : broken(format.toUpperCase());

  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") {
    if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return broken("PNG");
    return sized("png", u32be(b, 16), u32be(b, 20));
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return broken("JPEG");
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      const length = u16be(b, i + 2);
      const frame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (frame) return sized("jpeg", u16be(b, i + 7), u16be(b, i + 5));
      if (length < 2) return broken("JPEG");
      i += 2 + length;
    }
    return broken("JPEG");
  }
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) {
    if (b.length < 10) return broken("GIF");
    return sized("gif", u16le(b, 6), u16le(b, 8));
  }
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    if (b.length < 30) return broken("WebP");
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") return sized("webp", u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    if (chunk === "VP8L") {
      if (b[20] !== 0x2f) return broken("WebP");
      const b0 = b[21]!;
      const b1 = b[22]!;
      const b2 = b[23]!;
      const b3 = b[24]!;
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return sized("webp", width, height);
    }
    if (chunk === "VP8X") return sized("webp", 1 + u24le(b, 24), 1 + u24le(b, 27));
    return broken("WebP");
  }
  return undefined;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    // `ignoreBOM: false` is the default; the Workers typings of `TextDecoder` require it spelled out
    // (the cloud Worker compiles this package from source).
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Sanitises an SVG image with the icon sanitiser and writes it back as plain paths. */
function svgImage(text: string): ImageResult {
  const result = sanitizeSvg(text, IMAGE_MAX_BYTES);
  if (!result.ok)
    return { ok: false, message: messages().images.unsafeSvg(result.problem.message) };
  const size = svgSize(text) ?? {
    width: result.icon.viewBox.width,
    height: result.icon.viewBox.height,
  };
  const svg = geometrySvg(result.icon, size.width, size.height);
  return {
    ok: true,
    image: {
      format: "svg",
      width: size.width,
      height: size.height,
      href: `data:${MIME.svg};base64,${base64(new TextEncoder().encode(svg))}`,
    },
  };
}

/** The `width` and `height` of the root element when both are plain pixel numbers. */
function svgSize(text: string): { width: number; height: number } | undefined {
  const root = /<svg\b[^>]*>/.exec(text)?.[0];
  if (!root) return undefined;
  const read = (name: string) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(?:px)?\\s*["']`).exec(root);
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const width = read("width");
  const height = read("height");
  return width && height ? { width, height } : undefined;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function paint(value: Paint): string {
  switch (value.kind) {
    case "none":
      return "none";
    case "current":
      return "#000";
    case "color":
      return escapeAttribute(value.value);
    case "gradient":
      return `url(#${value.id})`;
  }
}

const n = (value: number) => String(Math.round(value * 1000) / 1000);

/** A standalone SVG made only of the sanitised paths and gradients of an image. */
export function geometrySvg(icon: IconGeometry, width: number, height: number): string {
  const { x, y, width: w, height: h } = icon.viewBox;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">`,
  ];
  if (icon.gradients.length > 0) {
    parts.push("<defs>");
    for (const gradient of icon.gradients) {
      const tag = gradient.kind === "linear" ? "linearGradient" : "radialGradient";
      const attributes = [
        `id="${escapeAttribute(gradient.id)}"`,
        `gradientUnits="${gradient.units}"`,
        `spreadMethod="${gradient.spread}"`,
        ...Object.entries(gradient.coordinates).map(([k, v]) => `${k}="${escapeAttribute(v)}"`),
      ];
      if (gradient.transform) {
        attributes.push(`gradientTransform="${escapeAttribute(gradient.transform)}"`);
      }
      parts.push(`<${tag} ${attributes.join(" ")}>`);
      for (const stop of gradient.stops) {
        parts.push(
          `<stop offset="${n(stop.offset)}" stop-color="${escapeAttribute(stop.color)}" stop-opacity="${n(stop.opacity)}"/>`,
        );
      }
      parts.push(`</${tag}>`);
    }
    parts.push("</defs>");
  }
  for (const path of icon.paths) {
    const attributes = [
      `d="${escapeAttribute(path.d)}"`,
      `fill="${paint(path.fill)}"`,
      `stroke="${paint(path.stroke)}"`,
    ];
    if (path.stroke.kind !== "none") {
      attributes.push(
        `stroke-width="${n(path.strokeWidth)}"`,
        `stroke-linecap="${path.lineCap}"`,
        `stroke-linejoin="${path.lineJoin}"`,
      );
    }
    if (path.fillRule !== "nonzero") attributes.push(`fill-rule="${path.fillRule}"`);
    if (path.transform) attributes.push(`transform="${escapeAttribute(path.transform)}"`);
    if (path.opacity !== 1) attributes.push(`opacity="${n(path.opacity)}"`);
    if (path.fillOpacity !== 1) attributes.push(`fill-opacity="${n(path.fillOpacity)}"`);
    if (path.strokeOpacity !== 1) attributes.push(`stroke-opacity="${n(path.strokeOpacity)}"`);
    parts.push(`<path ${attributes.join(" ")}/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 with padding. */
export function base64(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out.push(
      ALPHABET[v >> 18]! + ALPHABET[(v >> 12) & 63]! + ALPHABET[(v >> 6) & 63]! + ALPHABET[v & 63]!,
    );
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const v = bytes[i]! << 16;
    out.push(`${ALPHABET[v >> 18]!}${ALPHABET[(v >> 12) & 63]!}==`);
  } else if (rest === 2) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out.push(`${ALPHABET[v >> 18]!}${ALPHABET[(v >> 12) & 63]!}${ALPHABET[(v >> 6) & 63]!}=`);
  }
  return out.join("");
}

/** The default drawn size of an image: its pixel size, at most 640 wide, keeping the ratio. */
export function defaultImageSize(image: { width: number; height: number } | undefined): {
  width: number;
  height: number;
} {
  if (!image) return { ...UNKNOWN_IMAGE_SIZE };
  if (image.width <= 640)
    return { width: Math.round(image.width), height: Math.round(image.height) };
  return { width: 640, height: Math.round((image.height * 640) / image.width) };
}
