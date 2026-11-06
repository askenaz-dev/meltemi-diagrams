// The harness of the MCP acceptance suite (change `agent-mcp`, `mcp-acceptance`): named steps run in
// order, each with the criterion of the specification's section 13 it proves, what it needs (the two
// test accounts' tokens, the authorization server) and the steps it builds on; a log that every line
// of the run goes through, scanned for what grants access; and the results a run leaves.
//
// The log is the run's only output. A line that holds a token, an `mdg_` value, a bearer credential,
// an invitation's or a live session's link or an authorization code is printed redacted and fails
// the step that wrote it, naming the step, so the suite never prints what it found and never passes
// with it.

/** What a step ended as. */
export type Outcome = "passed" | "failed" | "skipped";

/**
 * What a step needs from the run: the first account's token, the second's, an authorization server,
 * preprovisioned OAuth fixtures, or the hosted endpoint itself (its door and its challenge, which a run through the
 * local server does not reach).
 */
export type Need = "token" | "token2" | "oauth" | "grant" | "endpoint";

/** One step of the suite. */
export interface Step<S> {
  /** The step's name in the log and the results, starting with its criterion. */
  readonly name: string;
  /** The criterion of section 13 it proves, or null for the run's own steps (connecting, cleaning up). */
  readonly criterion: number | null;
  readonly needs?: readonly Need[];
  /** The names of the steps whose state it uses: when one did not pass, it is skipped. */
  readonly after?: readonly string[];
  run(context: StepContext<S>): Promise<void>;
}

/** What a step is given. */
export interface StepContext<S> {
  /** The run's shared state: what earlier steps made. */
  readonly state: S;
  /** Writes a line of the step's log (scanned and, if need be, redacted). */
  log(line: string): void;
  /** A value that grants access and must never appear in the log (a token, a link). */
  secret(value: string): void;
  /** The steps whose log has held something that grants access, so far. */
  leaks(): readonly string[];
  /** Whether a line of another log holds what grants access: the patterns and the run's secrets. */
  holdsSecret(line: string): boolean;
}

/** A step's result, as `results.json` lists it. */
export interface StepResult {
  readonly step: string;
  readonly criterion: number | null;
  readonly outcome: Outcome;
  readonly ms: number;
  /** Why it was skipped. */
  readonly reason?: string;
  /** Why it failed, redacted. */
  readonly error?: string;
}

/** What is known before the run about what it may do. */
export interface Capabilities {
  readonly token: boolean;
  readonly token2: boolean;
  /** Whether the host publishes the authorization server's metadata; undefined before it is asked. */
  oauth?: boolean;
  /** Whether validated, origin-bound OAuth fixtures were provided by the separate setup process. */
  grant?: boolean;
  /** Whether the run goes through the command line's local servers (`--local`), not the endpoint. */
  local?: boolean;
}

/** Why a step that needs something the run does not have is skipped. */
export const NEED_REASONS: Readonly<Record<Need, string>> = {
  token: "MELTEMI_TOKEN is not set: the first test account's API token is needed",
  token2: "MELTEMI_TOKEN_2 is not set: the second test account's API token is needed",
  oauth:
    "the host publishes no authorization server metadata (/.well-known/oauth-protected-resource)",
  grant: "MELTEMI_OAUTH_FIXTURES is not set: origin-bound preprovisioned OAuth fixtures are needed",
  endpoint:
    "--local: the run goes through mdg mcp, which has no authorization server and no challenge; the endpoint's own door is proven by a run without --local",
};

/**
 * The patterns of what grants access, each with the part a redacted line keeps: an API token, a
 * bearer credential, an invitation's link and the address that accepts it, a live session's link
 * and an authorization code.
 */
const PATTERNS: readonly { readonly pattern: RegExp; readonly keep: (found: string) => string }[] =
  [
    { pattern: /mdg_(?!\[redacted\])[A-Za-z0-9_-]*/g, keep: () => "mdg_" },
    {
      pattern: /\bBearer\s+(?!resource_metadata=|realm=|error=)[A-Za-z0-9._~+/-]+=*/g,
      keep: () => "Bearer ",
    },
    { pattern: /[?&]invite=(?!\[redacted\])[^\s"'&#)]+/g, keep: (found) => `${found[0]}invite=` },
    { pattern: /\/invitations\/[A-Za-z0-9_-]{16,}\/accept/g, keep: () => "/invitations/" },
    { pattern: /[?&]live=(?!\[redacted\])[^\s"'&#)]+/g, keep: (found) => `${found[0]}live=` },
    { pattern: /[?&]code=(?!\[redacted\])[^\s"'&#)]+/g, keep: (found) => `${found[0]}code=` },
  ];

/** What a scan found in a line: whether it held something, and the line with it redacted. */
export interface Scanned {
  readonly leaked: boolean;
  readonly line: string;
}

/**
 * Scans a line for the patterns and the run's secrets (the exact values), and redacts them. A value
 * shorter than eight characters is not looked for: it would match ordinary words.
 */
export function scanLine(line: string, secrets: Iterable<string> = []): Scanned {
  let out = line;
  let leaked = false;
  for (const value of [...secrets].sort((left, right) => right.length - left.length)) {
    if (value.length < 8 || !out.includes(value)) continue;
    leaked = true;
    out = out.split(value).join("[redacted]");
  }
  for (const { pattern, keep } of PATTERNS) {
    const redacted = out.replace(pattern, (found) => `${keep(found)}[redacted]`);
    if (redacted !== out) leaked = true;
    out = redacted;
  }
  return { leaked, line: out };
}

/** The log of a run: every line, by step, with the steps that wrote what grants access. */
export class RunLog {
  readonly lines: { readonly step: string; readonly line: string }[] = [];
  readonly leaks = new Set<string>();
  readonly secrets = new Set<string>();

  constructor(private readonly print: (line: string) => void = (line) => console.log(line)) {}

  /** Writes a line for `step` (or the run, with `-`), redacted, and remembers a leak. */
  write(step: string, line: string): void {
    for (const part of line.split(/\r?\n/)) {
      const scanned = scanLine(part, this.secrets);
      if (scanned.leaked) this.leaks.add(step);
      this.lines.push({ step, line: scanned.line });
      this.print(scanned.line);
    }
  }

  /** The text of a message, redacted, without remembering a leak (for results already failed). */
  redact(text: string): string {
    return scanLine(text, this.secrets).line;
  }
}

/** The outcome of a run: its steps' results and whether it passed. */
export interface RunOutcome {
  readonly results: readonly StepResult[];
  readonly passed: boolean;
  /** The steps whose log held something that grants access. */
  readonly leaks: readonly string[];
}

/** Thrown by a step that finds, once running, that what it checks is not there to check. */
export class Skip extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "Skip";
  }
}

/** The message of whatever a step threw, on one line. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the steps in order. A step is skipped when the run lacks what it needs or when a step it
 * builds on did not pass, with the reason; it fails when it throws or when its log held something
 * that grants access. The run passes when no step failed.
 */
export async function runSteps<S>(
  steps: readonly Step<S>[],
  state: S,
  capabilities: Capabilities,
  log: RunLog,
  clock: () => number = () => performance.now(),
): Promise<RunOutcome> {
  const results: StepResult[] = [];
  const outcomes = new Map<string, Outcome>();
  for (const step of steps) {
    const missing = (step.needs ?? []).find((need) => {
      if (need === "token") return !capabilities.token;
      if (need === "token2") return !capabilities.token2;
      if (need === "endpoint") return capabilities.local === true;
      if (need === "oauth") return capabilities.local === true || capabilities.oauth !== true;
      return capabilities.local === true || capabilities.grant !== true;
    });
    const blocked = (step.after ?? []).find((name) => outcomes.get(name) !== "passed");
    if (missing !== undefined || blocked !== undefined) {
      const reason =
        missing !== undefined
          ? NEED_REASONS[
              capabilities.local && missing !== "token" && missing !== "token2"
                ? "endpoint"
                : missing
            ]
          : `builds on "${blocked}", which ${outcomes.has(blocked!) ? `was ${outcomes.get(blocked!)}` : "did not run"}`;
      outcomes.set(step.name, "skipped");
      results.push({
        step: step.name,
        criterion: step.criterion,
        outcome: "skipped",
        ms: 0,
        reason,
      });
      log.write(step.name, `- ${step.name}: skipped (${reason})`);
      continue;
    }
    const started = clock();
    let error: string | undefined;
    let skipped: string | undefined;
    try {
      await step.run({
        state,
        log: (line) => log.write(step.name, `    ${line}`),
        secret: (value) => {
          if (value) log.secrets.add(value);
        },
        leaks: () => [...log.leaks],
        holdsSecret: (line) => scanLine(line, log.secrets).leaked,
      });
    } catch (thrown) {
      if (thrown instanceof Skip) skipped = log.redact(thrown.reason);
      else error = log.redact(messageOf(thrown)).replace(/\s+/g, " ").trim().slice(0, 600);
    }
    if (skipped !== undefined && !log.leaks.has(step.name)) {
      outcomes.set(step.name, "skipped");
      results.push({
        step: step.name,
        criterion: step.criterion,
        outcome: "skipped",
        ms: Math.round(clock() - started),
        reason: skipped,
      });
      log.write(step.name, `- ${step.name}: skipped (${skipped})`);
      continue;
    }
    if (error === undefined && log.leaks.has(step.name)) {
      error = "its log held a token, a bearer credential, an access link or a code (redacted)";
    }
    const ms = Math.round(clock() - started);
    const outcome: Outcome = error === undefined ? "passed" : "failed";
    outcomes.set(step.name, outcome);
    results.push({
      step: step.name,
      criterion: step.criterion,
      outcome,
      ms,
      ...(error !== undefined ? { error } : {}),
    });
    log.write(step.name, `${outcome === "passed" ? "+" : "x"} ${step.name}: ${outcome} (${ms} ms)`);
    if (error !== undefined) log.write(step.name, `    ${error}`);
  }
  const leaks = [...log.leaks];
  return {
    results,
    passed: results.every((result) => result.outcome !== "failed") && leaks.length === 0,
    leaks,
  };
}

/** The counts of a run's outcomes. */
export function summarise(results: readonly StepResult[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { passed: 0, failed: 0, skipped: 0 };
  for (const result of results) counts[result.outcome]++;
  return counts;
}

/** Hosted delivery's fixed contract; a shorter run cannot silently count as complete. */
export const HOSTED_STEP_COUNT = 34;

/** Completeness is stronger than a diagnostic run's success, which permits honest skips. */
export function completeHostedRun(outcome: RunOutcome): boolean {
  return (
    outcome.passed &&
    outcome.leaks.length === 0 &&
    outcome.results.length === HOSTED_STEP_COUNT &&
    outcome.results.every((result) => result.outcome === "passed")
  );
}

/** The criteria of section 13 the suite runs (the others are the written procedure, or the workflow). */
export const AUTOMATED_CRITERIA: readonly number[] = [
  2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
];

/** The criteria the written procedure covers, with the real Codex (16's voice half among them). */
export const MANUAL_CRITERIA: readonly number[] = [1, 7, 8, 9, 16];
