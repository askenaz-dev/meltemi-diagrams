// Summarises the pilot's filled measurement templates (docs/pilot/templates/) as Markdown: the time
// of each phase, errors and help per task, ratings per tool and criterion, and second deliveries.
// Usage: pnpm pilot:summary <folder> [--out summary.md]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The files and the columns each must have. */
export const TEMPLATES = {
  "participants.csv": ["participant", "role", "experience", "tools", "consent"],
  "sessions.csv": ["participant", "task", "phase", "start", "end", "errors", "help"],
  "comparison.csv": ["case", "tool", "rater", "legibility", "preference", "maintainability"],
  "followup.csv": ["participant", "second_delivery"],
};

export const PHASES = ["creation", "adjustment", "export", "update"];
export const CRITERIA = ["legibility", "preference", "maintainability"];

/** A missing file or column: the summary cannot be made. */
export class TemplateError extends Error {}

/** Parses CSV text (RFC 4180: quoted fields, doubled quotes, CRLF) into rows of fields. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads a template: its records by column name, with their line numbers. */
function readTemplate(folder, name) {
  const path = join(folder, name);
  if (!existsSync(path)) throw new TemplateError(`${name} is missing from ${folder}.`);
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  for (const column of TEMPLATES[name]) {
    if (!header.includes(column)) throw new TemplateError(`${name} has no "${column}" column.`);
  }
  return rows
    .slice(1)
    .map((fields, i) => ({
      line: i + 2,
      record: Object.fromEntries(header.map((h, j) => [h, (fields[j] ?? "").trim()])),
    }))
    .filter(({ record }) => Object.values(record).some((v) => v !== ""));
}

/** Seconds from `HH:MM:SS`, `MM:SS` or a number of seconds. */
export function seconds(value) {
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p)))
    return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** A duration as `m:ss`. */
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The summary of a folder of filled templates: Markdown text and the rows that were not read. */
export function summarise(folder) {
  const skipped = [];
  const skip = (name, line, reason) => skipped.push(`${name}:${line}: ${reason}`);
  const participants = readTemplate(folder, "participants.csv");
  const sessions = readTemplate(folder, "sessions.csv");
  const comparison = readTemplate(folder, "comparison.csv");
  const followup = readTemplate(folder, "followup.csv");

  // Times by phase, errors and help by task.
  const times = new Map(PHASES.map((p) => [p, []]));
  const tasks = new Map();
  for (const { line, record } of sessions) {
    const phase = record.phase.toLowerCase();
    if (!times.has(phase)) {
      skip("sessions.csv", line, `phase "${record.phase}" is not one of ${PHASES.join(", ")}`);
      continue;
    }
    const start = seconds(record.start);
    const end = seconds(record.end);
    const errors = Number(record.errors || 0);
    const help = Number(record.help || 0);
    if (start === null || end === null || end < start) {
      skip("sessions.csv", line, `the times "${record.start}" to "${record.end}" cannot be read`);
      continue;
    }
    if (!Number.isInteger(errors) || !Number.isInteger(help) || errors < 0 || help < 0) {
      skip("sessions.csv", line, "errors and help must be whole numbers");
      continue;
    }
    times.get(phase).push(end - start);
    const task = tasks.get(record.task) ?? { sessions: 0, errors: 0, help: 0 };
    tasks.set(record.task, {
      sessions: task.sessions + 1,
      errors: task.errors + errors,
      help: task.help + help,
    });
  }

  // Ratings by tool and criterion.
  const ratings = new Map();
  for (const { line, record } of comparison) {
    const values = CRITERIA.map((c) => Number(record[c]));
    if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
      skip("comparison.csv", line, "ratings must be whole numbers from 1 to 5");
      continue;
    }
    const tool = ratings.get(record.tool) ?? CRITERIA.map(() => []);
    values.forEach((v, i) => tool[i].push(v));
    ratings.set(record.tool, tool);
  }

  // Second deliveries.
  let returned = 0;
  let answered = 0;
  for (const { line, record } of followup) {
    const answer = record.second_delivery.toLowerCase();
    if (answer !== "yes" && answer !== "no") {
      skip("followup.csv", line, `second_delivery is "${record.second_delivery}", not yes or no`);
      continue;
    }
    answered++;
    if (answer === "yes") returned++;
  }

  const lines = [
    "# Pilot summary",
    "",
    `${participants.length} participants, ${sessions.length} timed sessions, ${new Set(comparison.map((r) => r.record.case)).size} comparison cases.`,
    "The pilot gives qualitative signals; these figures do not show demand on their own.",
    "",
    "## Time by phase",
    "",
    "| Phase | Sessions | Median | Range |",
    "| --- | ---: | ---: | --- |",
    ...PHASES.map((p) => {
      const values = times.get(p);
      return values.length === 0
        ? `| ${p} | 0 | — | — |`
        : `| ${p} | ${values.length} | ${clock(median(values))} | ${clock(Math.min(...values))} to ${clock(Math.max(...values))} |`;
    }),
    "",
    "## Errors and help by task",
    "",
    "| Task | Sessions | Errors | Help |",
    "| --- | ---: | ---: | ---: |",
    ...[...tasks].map(([task, t]) => `| ${task} | ${t.sessions} | ${t.errors} | ${t.help} |`),
    "",
    "## Comparison with reference tools",
    "",
    "Mean ratings from 1 to 5, each criterion on its own.",
    "",
    `| Tool | Ratings | ${CRITERIA.map((c) => c[0].toUpperCase() + c.slice(1)).join(" | ")} |`,
    `| --- | ---: | ${CRITERIA.map(() => "---:").join(" | ")} |`,
    ...[...ratings].map(
      ([tool, values]) =>
        `| ${tool} | ${values[0].length} | ${values.map((v) => (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)).join(" | ")} |`,
    ),
    "",
    "## Second delivery",
    "",
    answered === 0
      ? "No follow-up answers yet."
      : `${returned} of ${answered} participants (${Math.round((returned / answered) * 100)} %) made a second delivery with the product.`,
    "",
  ];
  if (skipped.length > 0) {
    lines.push("## Rows not read", "", ...skipped.map((s) => `- ${s}`), "");
  }
  return { markdown: lines.join("\n"), skipped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage: pnpm pilot:summary <folder> [--out summary.md]");
    process.exit(2);
  }
  const base = process.env.INIT_CWD ?? process.cwd();
  try {
    const { markdown, skipped } = summarise(resolve(base, folder));
    const at = process.argv.indexOf("--out");
    if (at > 0 && process.argv[at + 1]) {
      writeFileSync(resolve(base, process.argv[at + 1]), markdown);
      console.log(`Wrote ${process.argv[at + 1]}.`);
    } else process.stdout.write(markdown);
    for (const s of skipped) console.error(`skipped ${s}`);
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
