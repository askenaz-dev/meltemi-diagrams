// The record of the MCP acceptance procedure with the real Codex (`docs/quality/mcp-acceptance.md`,
// `mcp-acceptance` "The procedure for the rest"): its status by criterion and its recorded runs, read
// from the page's two tables, and the rules a test holds the page and the other documents to. A
// criterion is passed only with a recorded run that holds it and an evidence folder that exists, and
// no document says the voice flow works while the page has no run that passed criteria 7 to 9.

/** The page. */
export const PROCEDURE_PAGE = "docs/quality/mcp-acceptance.md";
/** The criteria the procedure proves. */
export const PROCEDURE_CRITERIA: readonly number[] = [1, 7, 8, 9, 16];
/** The criteria of the voice flow. */
export const VOICE_CRITERIA: readonly number[] = [7, 8, 9];
/** Where a run's evidence lives. */
export const EVIDENCE_ROOT = "docs/quality/mcp-acceptance/";

/** The status of a criterion, as the page's first table gives it. */
export interface CriterionStatus {
  readonly criterion: number;
  readonly status: string;
  readonly run: string;
}

/** A recorded run, as the page's second table gives it. */
export interface RecordedRun {
  readonly date: string;
  readonly host: string;
  readonly codex: string;
  readonly server: string;
  readonly configuration: string;
  readonly passed: readonly number[];
  readonly failed: readonly number[];
  readonly evidence: string;
}

/** The rows of the first table under the heading `## <heading>`, without its header and rule. */
export function tableUnder(text: string, heading: string): string[][] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.trim().startsWith("|")) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    rows.push(
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    );
  }
  return rows.slice(2);
}

/** The numbers a cell lists (`7, 8, 9`), or none for `none` or an empty cell. */
const numbers = (cell: string) => [...cell.matchAll(/\d+/g)].map((match) => Number(match[0]));

/** The page's statuses and runs. */
export function readProcedure(text: string): {
  statuses: CriterionStatus[];
  runs: RecordedRun[];
} {
  const statuses = tableUnder(text, "Status by criterion").map(([criterion, status, run]) => ({
    criterion: Number(criterion),
    status: (status ?? "").toLowerCase(),
    run: run ?? "",
  }));
  const runs = tableUnder(text, "Recorded runs").map(
    ([date, host, codex, server, configuration, passed, failed, evidence]) => ({
      date: date ?? "",
      host: host ?? "",
      codex: codex ?? "",
      server: server ?? "",
      configuration: configuration ?? "",
      passed: numbers(passed ?? ""),
      failed: numbers(failed ?? ""),
      evidence: (evidence ?? "").replace(/^\[[^\]]*\]\(([^)]+)\)$/, "$1"),
    }),
  );
  return { statuses, runs };
}

/**
 * What is wrong with the page: a criterion missing or of another status, a criterion passed without
 * a run that holds it, or a run without its date, versions or evidence. `exists` says whether a path
 * of the repository exists.
 */
export function procedureProblems(text: string, exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  const { statuses, runs } = readProcedure(text);
  const listed = statuses.map((s) => s.criterion);
  if (JSON.stringify(listed) !== JSON.stringify(PROCEDURE_CRITERIA)) {
    problems.push(
      `${PROCEDURE_PAGE}: the status table lists ${listed.join(", ")}, not 1, 7, 8, 9, 16`,
    );
  }
  for (const run of runs) {
    const where = `${PROCEDURE_PAGE}: the run of ${run.date || "(no date)"}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(run.date)) problems.push(`${where} has no date as YYYY-MM-DD`);
    if (!run.host) problems.push(`${where} names no host`);
    if (!/\d/.test(run.codex)) problems.push(`${where} names no Codex version`);
    if (!/\d/.test(run.server)) problems.push(`${where} names no server version`);
    if (!run.configuration) problems.push(`${where} names no configuration`);
    if (!run.evidence.startsWith(EVIDENCE_ROOT) || !exists(run.evidence)) {
      problems.push(`${where} has no evidence folder under ${EVIDENCE_ROOT}`);
    }
  }
  for (const { criterion, status, run } of statuses) {
    if (!["passed", "failed", "not run"].includes(status)) {
      problems.push(`${PROCEDURE_PAGE}: criterion ${criterion} is "${status}"`);
      continue;
    }
    if (status !== "passed") continue;
    const recorded = runs.find((r) => r.date === run && r.passed.includes(criterion));
    if (!recorded) {
      problems.push(
        `${PROCEDURE_PAGE}: criterion ${criterion} is marked passed without a recorded run that passed it`,
      );
    }
  }
  return problems;
}

/** Whether the page records the voice flow passed: criteria 7 to 9 passed, each by a recorded run. */
export function voiceRecorded(text: string, exists: (path: string) => boolean): boolean {
  if (procedureProblems(text, exists).length > 0) return false;
  const { statuses } = readProcedure(text);
  return VOICE_CRITERIA.every((c) => statuses.find((s) => s.criterion === c)?.status === "passed");
}

/**
 * The sentences of a document that say the voice flow works: they speak of voice and of support,
 * working, compatibility or verification, without a negation or a "not yet".
 */
export function voiceClaims(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ");
  return prose
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(voice|voz)\b/i.test(sentence))
    .filter((sentence) =>
      /\b(supports?|supported|works|working|verified|proven|compatible|soporta|funciona|verificad[oa]|probad[oa]|compatible)\b/i.test(
        sentence,
      ),
    )
    .filter(
      (sentence) =>
        !/\b(not|no|never|until|yet|unless|nor|sin|hasta|todavía|aún|nunca|ni)\b/i.test(sentence),
    );
}
