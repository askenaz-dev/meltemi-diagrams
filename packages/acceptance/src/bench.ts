// Benchmark: parse, compile, export and arrange timings, and the editor's path (analysis after an
// edit, a canvas drag round trip) for 30-element views of the four profiles.
// Usage: pnpm bench [--write]   (--write records the results in docs/performance.md)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planEdit } from "@meltemi/diagrams-edit";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { applyTextEdits, parse } from "@meltemi/diagrams-language";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { toProjectPath } from "@meltemi/diagrams-project";
import { renderSvg } from "@meltemi/diagrams-render";
import { corpusFiles } from "../../../test-support/corpus.js";
import { REPO_ROOT, acceptanceSheets, projectSessions } from "./corpus.js";
import { writeMarkdown } from "./markdown.js";
import { TARGETS, analysisAfterEdit, canvasRoundTrip, time, type Timing } from "./timing.js";

/** A flow diagram with `nodes` elements, a relation chain, placement and animations. */
export function generatedDiagram(nodes: number): string {
  const lines = ['language "0.2"', "", "diagram generated: flow {", "  layout assisted"];
  for (let i = 0; i < nodes; i++) lines.push(`  n${i}["Service ${i}"] // element ${i}`);
  for (let i = 1; i < nodes; i++) lines.push(`  n${i - 1} -> n${i}: "call ${i}" as r${i}`);
  lines.push("  placement {");
  for (let i = 0; i < nodes; i++) lines.push(`    place n${i} at (${i * 220}, ${(i % 5) * 140})`);
  for (let i = 1; i < nodes; i++) {
    lines.push(`    route r${i} from n${i - 1}.east to n${i}.west via [(${i * 220 - 110}, 70)]`);
  }
  lines.push("  }");
  for (let i = 1; i < nodes; i++)
    lines.push(`  animate r${i} { effect flow; duration 1200ms; repeat forever }`);
  lines.push("}", "");
  return lines.join("\n");
}

/** An unplaced `layout auto` diagram: a chain of `nodes` boxes in groups of ten, plus shortcuts. */
export function generatedAutoDiagram(nodes: number): string {
  const lines = ['language "0.2"', "", "diagram generated: flow {"];
  for (let g = 0; g * 10 < nodes; g++) {
    lines.push(`  group g${g} "Group ${g}" {`);
    for (let i = g * 10; i < Math.min(nodes, g * 10 + 10); i++)
      lines.push(`    n${i}["Service ${i}"]`);
    lines.push("  }");
  }
  for (let i = 1; i < nodes; i++) lines.push(`  n${i - 1} -> n${i}`);
  for (let i = 3; i < nodes; i += 3) lines.push(`  n${i - 3} --> n${i}`);
  lines.push("}", "");
  return lines.join("\n");
}

export interface BenchCase {
  readonly name: string;
  /** The name in Spanish, for `docs/es/performance.md`. */
  readonly nameEs: string;
  readonly timing: Timing;
  /** The target this case is held to, in milliseconds at p95. */
  readonly target?: number;
}

export interface BenchReport {
  readonly machine: string;
  /** The machine in Spanish. */
  readonly machineEs: string;
  readonly date: string;
  readonly cases: readonly BenchCase[];
}

/** The machine as the reports name it. */
export function machine(locale: "en" | "es" = "en"): string {
  const cpu = cpus()[0]?.model.trim() ?? (locale === "es" ? "CPU desconocida" : "unknown CPU");
  const threads = locale === "es" ? "hilos" : "threads";
  return `${cpu}, ${cpus().length} ${threads}, ${Math.round(totalmem() / 2 ** 30)} GB, ${platform()} ${release()}, Node ${process.version}`;
}

export function runBench(): BenchReport {
  const cases: BenchCase[] = [];
  const add = (name: string, nameEs: string, timing: Timing, target?: number) =>
    cases.push({ name, nameEs, timing, ...(target ? { target } : {}) });
  const fonts = createNodeFontLibrary();
  const elk = createElkEngine();

  const largest = [...corpusFiles("valid"), ...corpusFiles("acceptance")].sort(
    (a, b) => b.text.length - a.text.length,
  )[0]!;
  const thirty = generatedDiagram(30);
  const large = generatedDiagram(500);
  const lines = (text: string) => text.split("\n").length;
  add(
    `parse ${largest.name} (${lines(largest.text)} lines)`,
    `análisis sintáctico de ${largest.name} (${lines(largest.text)} líneas)`,
    time(300, () => parse(largest.text)),
  );
  add(
    `compile ${largest.name}`,
    `compilación de ${largest.name}`,
    time(300, () => compile(largest.text)),
  );
  add(
    `compile a 30-node diagram (${lines(thirty)} lines)`,
    `compilación de un diagrama de 30 nodos (${lines(thirty)} líneas)`,
    time(200, () => compile(thirty)),
  );
  {
    const compilation = compile(thirty);
    add(
      "plan a drag, apply it and recompile, 30 nodes",
      "planificar un arrastre, aplicarlo y recompilar, 30 nodos",
      time(200, (i) => {
        const result = planEdit(compilation, {
          kind: "setPosition",
          diagram: "generated",
          element: "n7",
          x: i,
          y: 40,
        });
        if (!result.ok) throw new Error(result.rejection.reason);
        compile(applyTextEdits(thirty, result.plan.edits));
      }),
    );
  }
  add(
    `parse a 500-node diagram (${lines(large)} lines)`,
    `análisis sintáctico de un diagrama de 500 nodos (${lines(large)} líneas)`,
    time(30, () => parse(large)),
  );
  add(
    `compile a 500-node diagram (${lines(large)} lines)`,
    `compilación de un diagrama de 500 nodos (${lines(large)} líneas)`,
    time(30, () => compile(large)),
  );
  const exportSvg =
    (text: string, measurer = fonts) =>
    () => {
      const compilation = compile(text);
      const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
      renderSvg(result.scene!);
    };
  add(
    "export a 30-node diagram with the bundled fonts",
    "exportación de un diagrama de 30 nodos con las fuentes incluidas",
    time(150, exportSvg(thirty)),
  );
  add(
    "export a 30-node diagram with a new font library (cold)",
    "exportación de un diagrama de 30 nodos con una biblioteca de fuentes nueva (en frío)",
    time(5, () => exportSvg(thirty, createNodeFontLibrary())(), 0),
  );
  add(
    "export a 500-node diagram with the bundled fonts",
    "exportación de un diagrama de 500 nodos con las fuentes incluidas",
    time(15, exportSvg(large)),
  );
  const arrange = (text: string) => () => {
    const compilation = compile(text);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
      measurer: fonts,
      engine: elk,
    });
    renderSvg(result.scene!);
  };
  add(
    "arrange with ELK and export a 30-node `auto` diagram",
    "organización con ELK y exportación de un diagrama `auto` de 30 nodos",
    time(60, arrange(generatedAutoDiagram(30))),
  );
  add(
    "arrange with ELK and export a 500-node `auto` diagram",
    "organización con ELK y exportación de un diagrama `auto` de 500 nodos",
    time(5, arrange(generatedAutoDiagram(500)), 1),
  );

  // The editor's path, on the 30-element views of the acceptance corpus and an assisted sheet.
  const scratch = join(tmpdir(), `meltemi-bench-${process.pid}`);
  mkdirSync(scratch, { recursive: true });
  try {
    const assisted = toProjectPath(join(scratch, "assisted.meltemi"));
    writeFileSync(assisted, thirty);
    const views = [
      ...acceptanceSheets()
        .filter((s) => s.name.endsWith("/thirty"))
        .map((s) => ({
          label: `${s.profile} (${s.profile === "flow" ? "auto" : "30 elements"})`,
          labelEs: `${s.profile} (${s.profile === "flow" ? "auto" : "30 elementos"})`,
          path: s.path,
        })),
      { label: "flow (assisted)", labelEs: "flow (assisted)", path: assisted },
    ];
    for (const view of views) {
      add(
        `analysis after an edit, ${view.label}`,
        `análisis tras una edición, ${view.labelEs}`,
        analysisAfterEdit(projectSessions(), view.path, 40),
        TARGETS.analysis,
      );
      add(
        `canvas drag round trip, ${view.label}`,
        `ida y vuelta de un arrastre en el lienzo, ${view.labelEs}`,
        canvasRoundTrip(projectSessions(), view.path, 40),
        TARGETS.canvas,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    machine: machine(),
    machineEs: machine("es"),
    date: new Date().toISOString().slice(0, 10),
    cases,
  };
}

/** A number of milliseconds as each page writes it: a decimal point in English, a comma in Spanish. */
const ms = (value: number, locale: "en" | "es") =>
  locale === "es" ? value.toFixed(2).replace(".", ",") : value.toFixed(2);

/** The results as Markdown: one row per case with its target when it has one. */
export function benchMarkdown(report: BenchReport, locale: "en" | "es" = "en"): string {
  const es = locale === "es";
  const rows = report.cases.map((c) => {
    const verdict =
      c.target === undefined
        ? ""
        : c.timing.p95 < c.target
          ? `${es ? "menos de" : "under"} ${c.target}`
          : `**${es ? "más de" : "over"} ${c.target}**`;
    const name = es ? c.nameEs : c.name;
    return `| ${name} | ${ms(c.timing.median, locale)} | ${ms(c.timing.p95, locale)} | ${verdict} |`;
  });
  return [
    es
      ? "| Caso | Mediana (ms) | p95 (ms) | Objetivo (p95, ms) |"
      : "| Case | Median (ms) | p95 (ms) | Target (p95, ms) |",
    "| --- | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}

export const BENCH_DOC = join(REPO_ROOT, "docs", "performance.md");
export const BENCH_DOC_ES = join(REPO_ROOT, "docs", "es", "performance.md");

/** `docs/performance.md` or its Spanish version: how cases are measured, the machine, the table. */
export function benchDocument(report: BenchReport, locale: "en" | "es" = "en"): string {
  const intro =
    locale === "es"
      ? [
          "# Rendimiento",
          "",
          "[English](../performance.md)",
          "",
          "Generado por `pnpm bench --write` y `pnpm acceptance`; los objetivos y la máquina de referencia están",
          "en la decisión 0032 y en [quality.md](../quality.md). Cada caso se ejecuta después de unas cuantas",
          "ejecuciones que no se miden; del editor se mide el análisis que recibe un archivo tras una edición",
          "(compilación, disposición y diagnósticos dentro de su proyecto) y un arrastre en el lienzo, desde el",
          "mensaje hasta el nuevo dibujo.",
          "",
          `Medido el ${report.date}: ${report.machineEs}.`,
        ]
      : [
          "# Performance",
          "",
          "[Español](es/performance.md)",
          "",
          "Generated by `pnpm bench --write` and `pnpm acceptance`; the targets and the reference machine",
          "are in decision 0032 and [quality.md](quality.md). Each case runs after a few unmeasured runs;",
          "the editor's path is the analysis a file gets after an edit (compile, layout and diagnostics",
          "inside its project) and a canvas drag from the message to the new drawing.",
          "",
          `Measured on ${report.date}: ${report.machine}.`,
        ];
  return [...intro, "", benchMarkdown(report, locale), ""].join("\n");
}

/** Writes `docs/performance.md` and its Spanish version. */
export async function writeBenchDocuments(report: BenchReport): Promise<void> {
  await writeMarkdown(BENCH_DOC, benchDocument(report, "en"));
  await writeMarkdown(BENCH_DOC_ES, benchDocument(report, "es"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = runBench();
  console.log(`${report.machine}\n\n${benchMarkdown(report)}`);
  if (process.argv.includes("--write")) {
    await writeBenchDocuments(report);
    console.log("\nWrote docs/performance.md and docs/es/performance.md");
  }
  if (report.cases.some((c) => c.target !== undefined && c.timing.p95 >= c.target))
    process.exitCode = 1;
}
