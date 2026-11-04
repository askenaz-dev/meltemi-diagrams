import { markGroup } from "./mark.js";
import { fontRole, writtenStack, type TextFont, type TextMetrics } from "./measure.js";
import type { GroupItem, SceneItem, TextItem } from "./scene.js";
import type { Theme } from "./theme.js";

/** Rounds to two decimals, as every scene coordinate is. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A text item centred vertically on `y`, with its baseline from the measured font. */
export function textItem(
  metrics: TextMetrics,
  x: number,
  y: number,
  text: string,
  size: number,
  weight: number,
  fill: string,
  anchor: TextItem["anchor"] = "middle",
  font: TextFont = "body",
): TextItem {
  const stack = writtenStack(font);
  return {
    kind: "text",
    x: round2(x),
    y: round2(y),
    baseline: round2(metrics.baseline(y, font, weight, size)),
    text,
    size,
    weight,
    font: fontRole(font),
    ...(stack !== undefined ? { stack } : {}),
    anchor,
    fill,
  };
}

/** The measures of the brand frame that a layout needs. */
export interface FrameScale {
  readonly frameHeight: number;
  readonly frameMark: number;
  readonly frameBrand: number;
  readonly frameTitle: number;
}

/** The brand strip: hairline, mark, wordmark and diagram title, spanning the canvas. */
export function brandFrame(
  theme: Theme,
  scale: FrameScale,
  metrics: TextMetrics,
  width: number,
  stripTop: number,
  title: string | null,
): GroupItem {
  const margin = theme.margin;
  const lineY = theme.frame === "header" ? scale.frameHeight - 0.5 : stripTop + 0.5;
  const centerY = stripTop + scale.frameHeight / 2;
  const items: SceneItem[] = [
    {
      kind: "polyline",
      points: [
        { x: margin, y: lineY },
        { x: width - margin, y: lineY },
      ],
      stroke: theme.line,
      strokeWidth: 1,
      dashed: false,
    },
  ];
  let textX = margin;
  if (theme.mark === "meltemi") {
    items.push(markGroup(margin, centerY - scale.frameMark / 2, scale.frameMark));
    textX += scale.frameMark + 8;
  }
  if (theme.brand.trim() !== "") {
    items.push(
      textItem(metrics, textX, centerY, theme.brand, scale.frameBrand, 600, theme.ink, "start"),
    );
  }
  if (title) {
    items.push(
      textItem(metrics, width - margin, centerY, title, scale.frameTitle, 400, theme.muted, "end"),
    );
  }
  return { kind: "group", id: "frame", role: "frame", items };
}
