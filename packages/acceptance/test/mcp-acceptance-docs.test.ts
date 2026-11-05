// The record of the MCP acceptance procedure (change agent-mcp, `mcp-acceptance` "The procedure for
// the rest"): no criterion of the procedure is marked passed without a recorded run, with its date,
// versions and evidence, and no document says the voice flow works while the page has none.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";
import {
  PROCEDURE_PAGE,
  procedureProblems,
  readProcedure,
  voiceClaims,
  voiceRecorded,
} from "../src/mcp/procedure.js";

const page = readFileSync(join(REPO_ROOT, PROCEDURE_PAGE), "utf8");
const exists = (path: string) => existsSync(join(REPO_ROOT, path));

/** The page with its status rows and recorded runs replaced, for the rules' own cases. */
function pageWith(statuses: string[], runs: string[]): string {
  return [
    "# MCP acceptance",
    "",
    "## Status by criterion",
    "",
    "| Criterion | Status | Recorded run |",
    "| --: | --- | --- |",
    ...statuses,
    "",
    "## Recorded runs",
    "",
    "| Date | Host | Codex | Server | Configuration | Passed | Failed | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...runs,
    "",
  ].join("\n");
}

const notRun = (criteria: number[]) => criteria.map((c) => `| ${c} | not run | none |`);

describe("the MCP acceptance procedure's record", () => {
  it("lists the procedure's five criteria, and every one it marks passed has a recorded run", () => {
    expect(readProcedure(page).statuses.map((s) => s.criterion)).toEqual([1, 7, 8, 9, 16]);
    expect(procedureProblems(page, exists)).toEqual([]);
  });

  it("refuses a criterion marked passed without a recorded run, naming the page", () => {
    const claimed = pageWith(
      ["| 1 | not run | none |", "| 7 | passed | 2026-11-20 |", ...notRun([8, 9, 16])],
      [],
    );
    expect(procedureProblems(claimed, () => true)).toEqual([
      "docs/quality/mcp-acceptance.md: criterion 7 is marked passed without a recorded run that passed it",
    ]);
  });

  it("refuses a run without its versions or its evidence folder", () => {
    const run =
      "| 2026-11-20 | staging | | 1.12.0 | OAuth | 1, 7, 8, 9, 16 | | docs/quality/mcp-acceptance/2026-11-20-staging/ |";
    const recorded = pageWith(
      ["| 1 | passed | 2026-11-20 |", "| 7 | passed | 2026-11-20 |", ...notRun([8, 9, 16])],
      [run],
    );
    expect(procedureProblems(recorded, () => false)).toEqual([
      "docs/quality/mcp-acceptance.md: the run of 2026-11-20 names no Codex version",
      "docs/quality/mcp-acceptance.md: the run of 2026-11-20 has no evidence folder under docs/quality/mcp-acceptance/",
    ]);
    const complete = run.replace("| staging | |", "| staging | 0.130.0 |");
    expect(
      procedureProblems(
        pageWith(["| 1 | passed | 2026-11-20 |", ...notRun([7, 8, 9, 16])], [complete]),
        () => true,
      ),
    ).toEqual([]);
  });

  it("finds a document that says the voice flow works, and not one that says it is unproven", () => {
    expect(voiceClaims("The voice flow with Codex is supported. Other text.")).toEqual([
      "The voice flow with Codex is supported.",
    ]);
    expect(voiceClaims("El flujo de voz funciona con Codex.")).toHaveLength(1);
    expect(voiceClaims("The voice flow is not verified yet; the procedure records it.")).toEqual(
      [],
    );
    expect(voiceClaims("Voice comes later.")).toEqual([]);
    expect(voiceClaims("```text\nvoice works\n```")).toEqual([]);
  });

  it("lets no document say the voice flow works while the page has no run that passed it", () => {
    const documents = [
      "CHANGELOG.md",
      "README.md",
      "README.es.md",
      "docs/agents.md",
      "docs/es/agents.md",
      "docs/cloud.md",
      "docs/es/cloud.md",
      "skills/meltemi-diagrams/reference/mcp.md",
    ].filter(exists);
    const claims = documents.flatMap((document) =>
      voiceClaims(readFileSync(join(REPO_ROOT, document), "utf8")).map((s) => `${document}: ${s}`),
    );
    if (claims.length > 0) {
      expect(
        voiceRecorded(page, exists),
        `${PROCEDURE_PAGE} has no recorded run that passed criteria 7 to 9, yet:\n${claims.join("\n")}`,
      ).toBe(true);
    }
    // The rule itself: a claim with no recorded run fails, naming the page.
    expect(voiceRecorded(pageWith(notRun([1, 7, 8, 9, 16]), []), () => true)).toBe(false);
  });
});
