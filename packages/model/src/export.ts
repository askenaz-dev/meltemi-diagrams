import type {
  DiagnosticBag,
  ExportBlock,
  KeywordStatement,
  LineIndex,
  Span,
  Token,
  DiagnosticData,
} from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import {
  ANIMATION_DEFAULT_DURATIONS,
  EXPORT_EXTENSIONS,
  EXPORT_FORMATS,
  EXPORT_OPTIONS,
  THEME_COLOR_TOKENS,
} from "./schema.js";
import { checkArg, headerHasError, singleIdent, spanOf } from "./style-values.js";
import type {
  ExportFormat,
  ExportProfile,
  ExportTarget,
  FlowDiagram,
  ResolvedDiagram,
  StoryDefinition,
} from "./types.js";

/** How an `export` profile finds its target. */
export interface ExportResolver {
  /** A diagram of the file or an imported one. */
  diagram(name: string): ResolvedDiagram | undefined;
  story(name: string): StoryDefinition | undefined;
  /** True when the name starts with an import binding that did not resolve (yet). */
  pending(name: string): boolean;
  /** Names to suggest for an unknown target. */
  names(): string[];
}

/**
 * When the `animate` effects of a diagram end, in milliseconds: 0 without effects, null when one
 * repeats forever (the default).
 */
export function effectsEnd(diagram: FlowDiagram): number | null {
  let end = 0;
  for (const entry of diagram.animations) {
    if (entry.effect === null) continue;
    const repeat = entry.repeat ?? "forever";
    if (repeat === "forever") return null;
    const duration = entry.durationMs ?? ANIMATION_DEFAULT_DURATIONS[entry.effect];
    end = Math.max(end, (entry.delayMs ?? 0) + repeat * duration);
  }
  return end;
}

/** Whether `file` is a safe relative output path: no absolute path, no `..`, no backslash. */
function relativeFile(file: string): boolean {
  if (file.trim() === "" || file.includes("\\") || /^([A-Za-z]:|\/)/.test(file)) return false;
  return !file.split("/").some((part) => part === ".." || part === "");
}

/** Compiles one `export` block: its target and options, checked against the format. */
export function analyzeExport(
  node: ExportBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
  resolver: ExportResolver,
): ExportProfile {
  const error = (
    code: string,
    message: string,
    at: Span,
    hints?: string[],
    data?: DiagnosticData,
  ) =>
    bag.add({
      code,
      severity: "error",
      message,
      span: at,
      ...(hints ? { hints } : {}),
      ...(data ? { data } : {}),
    });

  // The target.
  const ref = node.target && node.target.kind === "QualifiedRef" ? node.target : null;
  let target: ExportTarget = { name: "", kind: null, diagram: null, story: null, file: null };
  if (!ref) {
    error("export.unknown-target", messages().diagnostics.export.namesTarget, spanOf(node.keyword));
  } else {
    const story = resolver.story(ref.text);
    const diagram = story ? undefined : resolver.diagram(ref.text);
    if (story) target = { name: ref.text, kind: "story", diagram: null, story, file: null };
    else if (diagram) {
      target = {
        name: ref.text,
        kind: "diagram",
        diagram: diagram.diagram,
        story: null,
        file: diagram.file,
      };
    } else {
      target = { name: ref.text, kind: null, diagram: null, story: null, file: null };
      if (!resolver.pending(ref.text)) {
        const names = resolver.names();
        const m = messages();
        error("export.unknown-target", m.diagnostics.export.unknownTarget(ref.text), spanOf(ref), [
          names.length > 0 ? m.hints.export.targets(names) : m.hints.export.declareTarget,
        ]);
      }
    }
  }

  // The options as written.
  const written = new Map<string, KeywordStatement>();
  const named = new Set<string>();
  const values: Record<string, unknown> = {};
  const block = node.block.kind === "Block" ? node.block : null;
  for (const stmt of block?.statements ?? []) {
    if (stmt.kind !== "KeywordStatement" || headerHasError(stmt)) {
      if (stmt.kind !== "Error" && stmt.kind !== "KeywordStatement") {
        error("prop.unknown", messages().diagnostics.export.options, spanOf(stmt));
      }
      continue;
    }
    const name = stmt.keyword.text;
    const option = EXPORT_OPTIONS[name];
    if (!option) {
      const m = messages();
      error(
        "prop.unknown",
        m.diagnostics.export.notOption(name),
        spanOf(stmt.keyword),
        [m.hints.export.options(Object.keys(EXPORT_OPTIONS))],
        { candidates: Object.keys(EXPORT_OPTIONS) },
      );
      continue;
    }
    named.add(name);
    const first = written.get(name);
    if (first) {
      const m = messages();
      bag.add({
        code: "prop.duplicate",
        severity: "error",
        message: m.diagnostics.common.setMoreThanOnce(name),
        span: spanOf(stmt.keyword),
        related: [{ message: m.related.firstSet, span: spanOf(first.keyword) }],
      });
      continue;
    }
    if (stmt.block) {
      error(
        "prop.invalid-value",
        messages().diagnostics.common.takesNoBlock(name),
        spanOf(stmt.block),
      );
      continue;
    }
    // Flags take no value.
    if (option.spec === null && name !== "background") {
      if (stmt.args.length > 0) {
        error(
          "prop.invalid-value",
          messages().diagnostics.common.takesNoValue(name),
          spanOf(stmt.args[0]!),
        );
        continue;
      }
      written.set(name, stmt);
      values[name] = true;
      continue;
    }
    const arg = stmt.args[0];
    if (!arg || stmt.args.length > 1) {
      error(
        "prop.invalid-value",
        messages().diagnostics.export.oneValue(name),
        stmt.args[1] ? spanOf(stmt.args[1]) : spanOf(stmt.keyword),
      );
      continue;
    }
    if (name === "background") {
      const word = singleIdent(arg);
      if (word?.text === "transparent") values[name] = "transparent";
      else {
        const result = checkArg(arg, { kind: "color", tokens: true }, name);
        if (!result.ok) {
          error("prop.invalid-value", result.message, spanOf(arg), [
            messages().hints.export.background,
            ...(result.hints ?? []),
          ]);
          continue;
        }
        values[name] = result.value;
      }
      written.set(name, stmt);
      continue;
    }
    const result = checkArg(arg, option.spec!, name);
    if (!result.ok) {
      error("prop.invalid-value", result.message, spanOf(arg), result.hints);
      continue;
    }
    if (name === "fps" && !Number.isInteger(result.value)) {
      error("prop.invalid-value", messages().diagnostics.export.fps, spanOf(arg));
      continue;
    }
    if (name === "file" && !relativeFile(result.value as string)) {
      error("prop.invalid-value", messages().diagnostics.export.file, spanOf(arg));
      continue;
    }
    written.set(name, stmt);
    values[name] = result.value;
  }

  const format = (values.format as ExportFormat | undefined) ?? null;
  if (format === null && !named.has("format")) {
    error(
      "export.missing-format",
      messages().diagnostics.export.missingFormat(id.text, EXPORT_FORMATS),
      spanOf(id),
    );
  }
  const invalid = (name: string, message: string) => {
    const stmt = written.get(name)!;
    error("export.invalid-option", message, spanOf(stmt));
    written.delete(name);
    delete values[name];
  };
  if (format !== null) {
    const m = messages().diagnostics.export;
    for (const name of [...written.keys()]) {
      const formats = EXPORT_OPTIONS[name]!.formats as readonly string[];
      if (!formats.includes(format)) invalid(name, m.notForFormat(name, format, formats));
    }
    if (format === "svg" && values.motion === "animated" && written.has("at")) {
      invalid("at", m.atWithMotion);
    }
    if (written.has("file")) {
      const extension = EXPORT_EXTENSIONS[format];
      if (!(values.file as string).toLowerCase().endsWith(`.${extension}`)) {
        invalid("file", m.extension(format, extension));
      }
    }
  }
  if (target.kind === "story") {
    const m = messages().diagnostics.export;
    if (written.has("motion")) invalid("motion", m.storyMotion);
    if (written.has("scenario")) invalid("scenario", m.storyScenario);
    const duration = target.story!.durationMs;
    if (written.has("at") && (values.at as number) > duration) {
      invalid("at", m.atPastEnd(duration));
    }
  }
  if (target.kind === "diagram" && written.has("scenario")) {
    const scenarios = target.diagram!.scenarios.map((s) => s.id);
    if (!scenarios.includes(values.scenario as string)) {
      const m = messages().diagnostics.export;
      invalid(
        "scenario",
        scenarios.length > 0
          ? m.unknownScenario(target.name, String(values.scenario), scenarios)
          : m.noScenarios(target.name),
      );
    }
  }
  const range = (s: Span) => lines.range(s);
  return {
    id: id.text,
    target,
    format,
    size: (values.size as ExportProfile["size"]) ?? null,
    scale: (values.scale as number | undefined) ?? null,
    background: (values.background as string | undefined) ?? null,
    atMs: (values.at as number | undefined) ?? null,
    motion: (values.motion as ExportProfile["motion"]) ?? null,
    theme: (values.theme as string | undefined) ?? null,
    fonts: (values.fonts as ExportProfile["fonts"]) ?? null,
    scenario: (values.scenario as string | undefined) ?? null,
    link: (values.link as string | undefined) ?? null,
    fps: (values.fps as number | undefined) ?? null,
    durationMs: (values.duration as number | undefined) ?? null,
    file: (values.file as string | undefined) ?? null,
    autoplay: values.autoplay === true,
    loop: values.loop === true,
    embed: values.embed === true,
    options: [...written.entries()].map(([name, stmt]) => ({ name, range: range(spanOf(stmt)) })),
    range: range(spanOf(node)),
    idRange: range(spanOf(id)),
    node,
  };
}

/** Colour tokens a background may name, for hints and completion. */
export const BACKGROUND_WORDS: readonly string[] = ["transparent", ...THEME_COLOR_TOKENS];
