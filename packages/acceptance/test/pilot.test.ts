import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

interface PilotSummary {
  summarise(folder: string): { markdown: string; skipped: string[] };
  parseCsv(text: string): string[][];
  seconds(value: string): number | null;
  TemplateError: new (message: string) => Error;
}

const pilot = (await import(
  /* @vite-ignore */ pathToFileURL(join(REPO_ROOT, "scripts", "pilot-summary.mjs")).href
)) as PilotSummary;

const folder = join(REPO_ROOT, "packages", "acceptance", ".test-output", "pilot");

const write = (files: Record<string, string>) => {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
};

const FILLED = {
  "participants.csv":
    "participant,role,experience,tools,consent,notes\nP1,architect,5 years,PlantUML,yes,\nP2,writer,2 years,draw.io,yes,\n",
  "sessions.csv": [
    "participant,task,phase,start,end,errors,help,notes",
    "P1,checkout flow,creation,10:00:00,10:05:00,1,0,",
    'P2,"payment sequence, with scenarios",creation,00:00,08:20,0,2,"said ""where is the canvas?"""',
    "P2,payment sequence,adjustment,08:20,12:00,0,1,",
    "P1,checkout flow,export,10:05:00,10:04:00,0,0,ends before it starts",
  ].join("\r\n"),
  "comparison.csv":
    "case,tool,rater,legibility,preference,maintainability,notes\nC1,Meltemi Diagrams,R1,4,5,4,\nC1,Meltemi Diagrams,R2,5,4,5,\nC1,draw.io,R1,3,3,2,\n",
  "followup.csv": "participant,second_delivery,date,notes\nP1,yes,2026-11-20,\nP2,no,2026-11-21,\n",
};

describe("pilot summary", () => {
  beforeEach(() => write(FILLED));

  it("reads quoted fields, doubled quotes and CRLF", () => {
    expect(pilot.parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
    expect([
      pilot.seconds("01:02:03"),
      pilot.seconds("08:20"),
      pilot.seconds("75"),
      pilot.seconds("soon"),
    ]).toEqual([3723, 500, 75, null]);
  });

  it("gives the median and range of each phase", () => {
    const { markdown } = pilot.summarise(folder);
    expect(markdown).toContain("| creation | 2 | 6:40 | 5:00 to 8:20 |");
    expect(markdown).toContain("| adjustment | 1 | 3:40 | 3:40 to 3:40 |");
    expect(markdown).toContain("| export | 0 | — | — |");
  });

  it("counts errors and help by task, rates tools by criterion and counts second deliveries", () => {
    const { markdown } = pilot.summarise(folder);
    expect(markdown).toContain("| checkout flow | 1 | 1 | 0 |");
    expect(markdown).toContain("| payment sequence, with scenarios | 1 | 0 | 2 |");
    expect(markdown).toContain("| Meltemi Diagrams | 2 | 4.50 | 4.50 | 4.50 |");
    expect(markdown).toContain("| draw.io | 1 | 3.00 | 3.00 | 2.00 |");
    expect(markdown).toContain("1 of 2 participants (50 %) made a second delivery");
  });

  it("lists the rows it cannot read with their file and line", () => {
    const { markdown, skipped } = pilot.summarise(folder);
    expect(skipped).toEqual(['sessions.csv:5: the times "10:05:00" to "10:04:00" cannot be read']);
    expect(markdown).toContain("## Rows not read");
  });

  it("stops when a file or a column is missing", () => {
    write({ ...FILLED, "sessions.csv": "participant,task,start,end,errors,help\n" });
    expect(() => pilot.summarise(folder)).toThrow(/sessions\.csv has no "phase" column/);
    const { "followup.csv": _followup, ...withoutFollowup } = FILLED;
    write(withoutFollowup);
    expect(() => pilot.summarise(folder)).toThrow(/followup\.csv is missing/);
  });

  it("summarises the empty templates", () => {
    const { markdown, skipped } = pilot.summarise(join(REPO_ROOT, "docs", "pilot", "templates"));
    expect(skipped).toEqual([]);
    expect(markdown).toContain("0 participants, 0 timed sessions, 0 comparison cases.");
  });
});
