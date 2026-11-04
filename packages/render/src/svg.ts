import type {
  GroupItem,
  Scene,
  SceneGradient,
  SceneItem,
  ScenePattern,
  TextItem,
} from "@meltemi/diagrams-layout";
import { sketchItems } from "./sketch.js";

const DASH = "5 4";

/** How text reaches the viewer: font names, embedded fonts, or glyph outlines. */
export type FontPolicy = "system" | "embedded" | "outlined";

/** A font file to embed, limited by `unicodeRange` to the characters used (empty: whole font). */
export interface EmbeddableFace {
  readonly family: string;
  readonly weight: number;
  /**
   * The heaviest weight this file stands for, when the family has no heavier face: the rule then
   * covers `weight` to `weightTo`, so a browser draws heavier text with this file as it is
   * measured and outlined, not in a synthesized bold.
   */
  readonly weightTo?: number;
  readonly subset: string;
  readonly format: "woff2" | "woff" | "truetype" | "opentype";
  readonly data: Uint8Array;
  readonly unicodeRange: string;
}

const FONT_MIME: Readonly<Record<EmbeddableFace["format"], string>> = {
  woff2: "font/woff2",
  woff: "font/woff",
  truetype: "font/ttf",
  opentype: "font/otf",
};

/** Fonts for the `embedded` and `outlined` policies, such as `@meltemi/diagrams-fonts`. */
export interface FontProvider {
  /** The provider's family for a CSS font stack, or undefined when it has none. */
  family(fontStack: string): string | undefined;
  faces(family: string, weight: number, text: string): readonly EmbeddableFace[];
  /** Text as a path in pixels, baseline at y = 0, starting at x = 0. */
  outline(text: string, family: string, weight: number, size: number): { d: string; width: number };
  /** False when a family's licence forbids embedding or outlining; such text stays `<text>`. */
  embeddable?(family: string): boolean;
}

export interface RenderOptions {
  /** Defaults to `system`. */
  readonly fonts?: FontPolicy;
  readonly provider?: FontProvider;
}

function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Escapes text for element content and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialises a scene to standalone SVG. Portable by construction: inline presentation attributes,
 * linear gradients and patterns in `<defs>` only when the scene declares them, a `<clipPath>` in
 * the group of a sticky whose text it clips, no markers, no `dominant-baseline`, and no CSS except
 * the `@font-face` rules of the `embedded` font policy.
 */
export function renderSvg(scene: Scene, options: RenderOptions = {}): string {
  const policy = options.fonts ?? "system";
  if (policy !== "system" && !options.provider) {
    throw new Error(`The "${policy}" font policy needs a font provider.`);
  }
  const fonts = policy === "system" ? null : { policy, provider: options.provider! };
  const out: string[] = [];
  const w = n(scene.width);
  const h = n(scene.height);
  const box = scene.viewBox
    ? `${n(scene.viewBox.x)} ${n(scene.viewBox.y)} ${n(scene.viewBox.width)} ${n(scene.viewBox.height)}`
    : `0 0 ${w} ${h}`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box}" font-family="${escapeXml(scene.fonts.body)}">`,
  );
  if (scene.title !== null) out.push(`  <title>${escapeXml(scene.title)}</title>`);
  if (scene.description !== null) out.push(`  <desc>${escapeXml(scene.description)}</desc>`);
  if (scene.styleSheet) {
    // The animated profile: CSS only, no scripts; `]]>` cannot occur in the generated rules.
    out.push("  <style><![CDATA[");
    for (const line of scene.styleSheet.split("\n")) out.push(line === "" ? "" : `    ${line}`);
    out.push("  ]]></style>");
  }
  const fontFaces = fonts?.policy === "embedded" ? fontFaceRules(scene, fonts.provider) : [];
  if (scene.gradients.length > 0 || scene.patterns.length > 0 || fontFaces.length > 0) {
    out.push("  <defs>");
    if (fontFaces.length > 0) {
      out.push("    <style>");
      for (const rule of fontFaces) out.push(`      ${rule}`);
      out.push("    </style>");
    }
    for (const gradient of scene.gradients) out.push(...gradientDef(gradient));
    for (const pattern of scene.patterns) out.push(...patternDef(pattern));
    out.push("  </defs>");
  }
  out.push(
    `  <rect x="0" y="0" width="${w}" height="${h}" fill="${escapeXml(scene.background)}"/>`,
  );
  const outline = fonts?.policy === "outlined" ? fonts.provider : null;
  // A sketch theme's strokes are painted by hand here, over the clean scene everyone else reads.
  const items = scene.sketch ? sketchItems(scene.items, scene.sketch) : scene.items;
  // A picture that links somewhere is one link around everything drawn.
  if (scene.link) {
    out.push(`  <a href="${escapeXml(scene.link)}">`);
    for (const item of items) emit(item, out, "    ", scene, outline);
    out.push("  </a>");
  } else {
    for (const item of items) emit(item, out, "  ", scene, outline);
  }
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

/**
 * The dash of a pen's stroke, which is round-capped: each dash grows by half the width at both
 * ends, so a fixed `5 4` closes from width 4. The dash is at least twice the width and the gap the
 * width plus room for the caps, so a gap of at least 4 (or of the width) stays visible.
 */
function penDash(width: number): string {
  return `${n(Math.max(5, 2 * width))} ${n(Math.max(4, width) + width)}`;
}

/**
 * The dash of a stroke: an explicit pattern and offset, the default dash, round dots, or none.
 * Dots are dashes of length 0 with round caps, spaced by the line's width; `roundCaps` says the
 * element already writes them. `freehand` says the stroke is a pen's (`GroupItem.freehand`),
 * whose dashes scale with its width.
 */
function dashOf(
  item: {
    readonly dashed: boolean | "dotted";
    readonly strokeWidth: number;
    readonly dash?: { readonly array: readonly number[]; readonly offset: number };
  },
  roundCaps = false,
  freehand = false,
): string {
  if (item.dash) {
    return ` stroke-dasharray="${item.dash.array.map(n).join(" ")}" stroke-dashoffset="${n(item.dash.offset)}"`;
  }
  if (item.dashed === "dotted") {
    const caps = roundCaps ? "" : ' stroke-linecap="round"';
    return ` stroke-dasharray="0 ${n(1.5 * item.strokeWidth + 3)}"${caps}`;
  }
  if (!item.dashed) return "";
  return ` stroke-dasharray="${freehand ? penDash(item.strokeWidth) : DASH}"`;
}

function opacityOf(opacity: number | undefined): string {
  return opacity !== undefined ? ` opacity="${n(opacity)}"` : "";
}

/**
 * The opacity a group is drawn at: a story's `opacity` times its style's `styleOpacity`, or
 * undefined when neither is set.
 */
function groupOpacity(group: GroupItem): number | undefined {
  if (group.opacity === undefined) return group.styleOpacity;
  if (group.styleOpacity === undefined) return group.opacity;
  return group.opacity * group.styleOpacity;
}

function classOf(item: { readonly className?: string }): string {
  return item.className ? ` class="${escapeXml(item.className)}"` : "";
}

/** A coordinate written as a number or kept as written (`50%`). */
const coordinate = (value: number | string) =>
  typeof value === "number" ? n(value) : escapeXml(value);

/** A `<linearGradient>` or `<radialGradient>` with its units, transform, spread and stops. */
function gradientDef(gradient: SceneGradient): string[] {
  const element = gradient.kind === "linear" ? "linearGradient" : "radialGradient";
  const attributes: string[] = [`id="${escapeXml(gradient.id)}"`];
  if (gradient.units) attributes.push(`gradientUnits="${gradient.units}"`);
  const keys =
    gradient.kind === "linear"
      ? (["x1", "y1", "x2", "y2"] as const)
      : (["cx", "cy", "r", "fx", "fy"] as const);
  for (const key of keys) {
    const value = (gradient as unknown as Record<string, number | string | undefined>)[key];
    if (value !== undefined) attributes.push(`${key}="${coordinate(value)}"`);
  }
  if (gradient.transform) attributes.push(`gradientTransform="${escapeXml(gradient.transform)}"`);
  if (gradient.spread) attributes.push(`spreadMethod="${gradient.spread}"`);
  const lines = [`    <${element} ${attributes.join(" ")}>`];
  for (const stop of gradient.stops) {
    const opacity = stop.opacity !== undefined ? ` stop-opacity="${n(stop.opacity)}"` : "";
    lines.push(
      `      <stop offset="${n(stop.offset)}" stop-color="${escapeXml(stop.color)}"${opacity}/>`,
    );
  }
  lines.push(`    </${element}>`);
  return lines;
}

/** Opacity of pattern strokes and dots, so the fill below stays readable. */
const PATTERN_OPACITY = 0.35;

/** A `<pattern>` tile: diagonal lines (`hatch`), a dot grid (`dots`) or a diagonal grid (`cross`). */
function patternDef(pattern: ScenePattern): string[] {
  const size = n(pattern.size);
  const color = escapeXml(pattern.color);
  const rotate = pattern.kind === "dots" ? "" : ' patternTransform="rotate(45)"';
  const open = `    <pattern id="${escapeXml(pattern.id)}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${rotate}>`;
  let shape: string;
  if (pattern.kind === "dots") {
    const c = n(pattern.size / 2);
    shape = `      <circle cx="${c}" cy="${c}" r="${n(pattern.size * 0.15)}" fill="${color}" fill-opacity="${PATTERN_OPACITY}"/>`;
  } else {
    const d = pattern.kind === "hatch" ? `M0 0V${size}` : `M0 0V${size}M0 0H${size}`;
    shape = `      <path d="${d}" stroke="${color}" stroke-width="1.5" stroke-opacity="${PATTERN_OPACITY}" fill="none"/>`;
  }
  return [open, shape, "    </pattern>"];
}

/** The scene's stack of a text's role: the theme's body or mono font. */
function roleStack(item: TextItem, scene: Scene): string {
  return item.font === "mono" ? scene.fonts.mono : scene.fonts.body;
}

/**
 * The stack a text is embedded and outlined with: the one its style writes, alone, so that a
 * written family nobody has is left to the viewer rather than drawn in the theme's font; else
 * its role's.
 */
function stackOf(item: TextItem, scene: Scene): string {
  return item.stack ?? roleStack(item, scene);
}

function textItems(items: readonly SceneItem[]): TextItem[] {
  return items.flatMap((item) =>
    item.kind === "text" ? [item] : item.kind === "group" ? textItems(item.items) : [],
  );
}

/**
 * The font faces the text of `scenes` needs, each subset once, ordered by family, weight and subset;
 * a face's `unicodeRange` covers the characters of every scene.
 */
export function embeddableFaces(
  scenes: readonly Scene[],
  provider: FontProvider,
): EmbeddableFace[] {
  const texts = new Map<string, { family: string; weight: number; text: string }>();
  for (const scene of scenes) {
    for (const item of textItems(scene.items)) {
      const family = provider.family(stackOf(item, scene));
      if (!family) continue;
      const key = `${family}|${item.weight}`;
      const entry = texts.get(key) ?? { family, weight: item.weight, text: "" };
      entry.text += item.text;
      texts.set(key, entry);
    }
  }
  // A family without the weight asked for gives the same file for several weights: it is embedded
  // once, limited to the characters of them all.
  const merged = new Map<string, EmbeddableFace>();
  for (const face of [...texts.values()].flatMap((entry) =>
    provider.faces(entry.family, entry.weight, entry.text),
  )) {
    const key = `${face.family}|${face.weight}|${face.subset}`;
    const known = merged.get(key);
    merged.set(
      key,
      known
        ? {
            ...known,
            unicodeRange:
              known.unicodeRange === "" || face.unicodeRange === ""
                ? ""
                : `${known.unicodeRange},${face.unicodeRange}`,
          }
        : face,
    );
  }
  const faces = [...merged.values()];
  return faces.sort(
    (a, b) =>
      (a.family < b.family ? -1 : a.family > b.family ? 1 : 0) ||
      a.weight - b.weight ||
      (a.subset < b.subset ? -1 : a.subset > b.subset ? 1 : 0),
  );
}

/** The `@font-face` rule of a face, with its file inline. */
export function fontFaceRule(face: EmbeddableFace): string {
  const range = face.unicodeRange === "" ? "" : `;unicode-range:${face.unicodeRange}`;
  const weight =
    face.weightTo !== undefined && face.weightTo > face.weight
      ? `${face.weight} ${face.weightTo}`
      : String(face.weight);
  return `@font-face{font-family:"${face.family}";font-weight:${weight};src:url(data:${FONT_MIME[face.format]};base64,${base64(face.data)}) format("${face.format}")${range}}`;
}

/** `@font-face` rules for the faces the scene's text needs, ordered by family, weight, subset. */
export function fontFaceRules(scene: Scene, provider: FontProvider): string[] {
  return embeddableFaces([scene], provider).map(fontFaceRule);
}

/** Base64 without `Buffer`, so the renderer runs in browsers too. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Writes one scene item. `clip` is the id of the `<clipPath>` the item is drawn through when it is
 * a text of a group with a `textClip`; `freehand` says the item is drawn by a pen's group.
 */
function emit(
  item: SceneItem,
  out: string[],
  indent: string,
  scene: Scene,
  outline: FontProvider | null,
  clip?: string,
  freehand = false,
): void {
  switch (item.kind) {
    case "group": {
      const transform = item.transform ? ` transform="${escapeXml(item.transform)}"` : "";
      const layer = item.layer ? ` data-layer="${escapeXml(item.layer)}"` : "";
      // A sequence tag's pill says which of its owner's tags it is.
      const tag = item.tag !== undefined ? ` data-tag="${item.tag}"` : "";
      out.push(
        `${indent}<g data-id="${escapeXml(item.id)}" data-role="${item.role}"${tag}${layer}${transform}${opacityOf(groupOpacity(item))}${classOf(item)}>`,
      );
      // A sticky's text that does not fit is clipped to its card, in the group's own coordinates;
      // its own texts take the clip, nested groups (its icon) do not.
      const textClip = item.textClip?.id;
      // A pen's stroke, and its drawing so far in a story, dash by its width.
      const pen = freehand || item.freehand === true;
      if (item.textClip) {
        const { x, y, width, height, radius } = item.textClip;
        out.push(
          `${indent}  <clipPath id="${escapeXml(item.textClip.id)}"><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(radius)}"/></clipPath>`,
        );
      }
      if (item.href) {
        // The element's drawing is a link; its group keeps its identity for tools.
        out.push(`${indent}  <a href="${escapeXml(item.href)}">`);
        for (const child of item.items) {
          emit(child, out, `${indent}    `, scene, outline, textClip, pen);
        }
        out.push(`${indent}  </a>`);
      } else {
        for (const child of item.items) {
          emit(child, out, `${indent}  `, scene, outline, textClip, pen);
        }
      }
      out.push(`${indent}</g>`);
      return;
    }
    case "rect":
      out.push(
        `${indent}<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" rx="${n(item.radius)}" fill="${escapeXml(item.fill)}" stroke="${escapeXml(item.stroke)}" stroke-width="${n(item.strokeWidth)}"${dashOf(item)}${opacityOf(item.opacity)}${classOf(item)}/>`,
      );
      return;
    case "path": {
      const rounded = item.rounded ? ' stroke-linecap="round" stroke-linejoin="round"' : "";
      const extra = [
        item.transform ? ` transform="${escapeXml(item.transform)}"` : "",
        item.opacity !== undefined ? ` opacity="${n(item.opacity)}"` : "",
        item.fillOpacity !== undefined ? ` fill-opacity="${n(item.fillOpacity)}"` : "",
        item.strokeOpacity !== undefined ? ` stroke-opacity="${n(item.strokeOpacity)}"` : "",
        item.fillRule === "evenodd" ? ' fill-rule="evenodd"' : "",
      ].join("");
      out.push(
        `${indent}<path d="${escapeXml(item.d)}"${extra} fill="${escapeXml(item.fill)}" stroke="${escapeXml(item.stroke)}" stroke-width="${n(item.strokeWidth)}"${rounded}${dashOf(item, !!item.rounded, freehand)}${classOf(item)}/>`,
      );
      return;
    }
    case "image": {
      const open = `${indent}<image x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" href="${escapeXml(item.href)}" preserveAspectRatio="xMidYMid meet"`;
      out.push(
        item.title === null
          ? `${open}/>`
          : `${open}><title>${escapeXml(item.title)}</title></image>`,
      );
      return;
    }
    case "polyline":
      out.push(
        `${indent}<polyline points="${item.points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}" fill="none" stroke="${escapeXml(item.stroke)}" stroke-width="${n(item.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"${dashOf(item, true, freehand)}${opacityOf(item.opacity)}${classOf(item)}/>`,
      );
      return;
    case "text": {
      const clipped = clip === undefined ? "" : ` clip-path="url(#${escapeXml(clip)})"`;
      const family = outline?.family(stackOf(item, scene));
      if (outline && family && (outline.embeddable?.(family) ?? true)) {
        const shape = outline.outline(item.text, family, item.weight, item.size);
        if (shape.d === "") return;
        const shift =
          item.anchor === "start" ? 0 : item.anchor === "middle" ? shape.width / 2 : shape.width;
        // The clip is in the group's coordinates, so a translated outline is wrapped to keep them.
        if (clipped) out.push(`${indent}<g${clipped}>`);
        out.push(
          `${clipped ? `${indent}  ` : indent}<path transform="translate(${n(item.x - shift)} ${n(item.baseline)})" d="${shape.d}" fill="${escapeXml(item.fill)}" aria-label="${escapeXml(item.text)}"/>`,
        );
        if (clipped) out.push(`${indent}</g>`);
        return;
      }
      // A written stack comes first and the role's stack after it, so a viewer without the family
      // falls back as the theme does; mono text names the mono stack; the rest inherits the svg's.
      const familyAttribute =
        item.stack !== undefined
          ? ` font-family="${escapeXml(`${item.stack}, ${roleStack(item, scene)}`)}"`
          : item.font === "mono"
            ? ` font-family="${escapeXml(scene.fonts.mono)}"`
            : "";
      out.push(
        `${indent}<text x="${n(item.x)}" y="${n(item.baseline)}" text-anchor="${item.anchor}" font-size="${n(item.size)}" font-weight="${item.weight}"${familyAttribute} fill="${escapeXml(item.fill)}"${clipped}>${escapeXml(item.text)}</text>`,
      );
      return;
    }
  }
}
