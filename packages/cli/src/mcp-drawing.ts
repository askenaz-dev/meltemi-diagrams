/**
 * What the local server's `preview` and `validate` share, whether the files come from a cloud
 * project or a folder: the width's bounds, asked before anything is read, and the engine's answers
 * as the hosted tools answer them (`mcp-local-server`, "The drawing and the checking on the
 * machine"), with the same codes and sentences as the endpoint's.
 */

import { Refusal, toBase64, type ToolAnswer, type ToolDiagnostic } from "@meltemi/diagrams-mcp";
import {
  MAX_PNG_WIDTH,
  MIN_PNG_WIDTH,
  type RenderOutcome,
  type RenderReport,
  type ValidateOutcome,
} from "@meltemi/diagrams-mcp/preview";

const TEXT = new TextDecoder();

/** The service's sentence for a path the path rule refuses. */
export const PATH_INVALID = "A file path is not valid.";

/** Refuses a width the renderer would refuse, before anything is read, as the endpoint does. */
export function checkWidth(format: "png" | "svg", width: number | undefined): void {
  if (width === undefined) return;
  if (format !== "png") {
    throw new Refusal("request.invalid", "width is for a PNG; an SVG is drawn at its own size.");
  }
  if (width > MAX_PNG_WIDTH) {
    throw new Refusal("request.invalid", `width is over the limit of ${MAX_PNG_WIDTH} pixels.`, {
      limit: MAX_PNG_WIDTH,
    });
  }
  if (width < MIN_PNG_WIDTH) {
    throw new Refusal("request.invalid", `width is under ${MIN_PNG_WIDTH} pixels.`, {
      limit: MIN_PNG_WIDTH,
    });
  }
}

/** A preview's report as the tools answer it. */
export type PreviewReport = Omit<RenderReport, "diagnostics" | "estimatedFonts"> & {
  readonly diagnostics: ToolDiagnostic[];
  readonly estimatedFonts: string[];
  readonly cached: boolean;
};

/** The picture and its report, or the refusal of a drawing the engine would not make. */
export function previewAnswer(outcome: RenderOutcome): ToolAnswer<PreviewReport> {
  if (!outcome.ok) {
    throw new Refusal(
      outcome.code,
      outcome.message,
      outcome.diagnostics ? { diagnostics: outcome.diagnostics } : {},
    );
  }
  return {
    structured: {
      ...outcome.report,
      diagnostics: [...outcome.report.diagnostics],
      estimatedFonts: [...outcome.report.estimatedFonts],
      cached: outcome.cached,
    },
    content:
      outcome.contentType === "image/png"
        ? [{ type: "image", data: toBase64(outcome.bytes), mimeType: "image/png" }]
        : [{ type: "text", text: TEXT.decode(outcome.bytes) }],
  };
}

/** What a check answers, without the revision. */
export interface CheckReport {
  readonly errors: number;
  readonly warnings: number;
  readonly diagnostics: ToolDiagnostic[];
  readonly truncated: boolean;
}

/** A check's answer, or its refusal. */
export function checkAnswer(outcome: ValidateOutcome): CheckReport {
  if (!outcome.ok) throw new Refusal(outcome.code, outcome.message);
  return {
    errors: outcome.errors,
    warnings: outcome.warnings,
    diagnostics: [...outcome.diagnostics],
    truncated: outcome.truncated,
  };
}
