import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { toProjectPath } from "@meltemi/diagrams-project";
import { reviewMessages } from "../src/messages/review.js";
import { gitRevisionHost } from "../src/node.js";

const scratch = mkdtempSync(join(tmpdir(), "meltemi-review-language-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
afterEach(() => setLocale("en"));
const hasGit = spawnSync("git", ["--version"]).status === 0;

describe("the words of reviews", () => {
  it("has every sentence in Spanish", () => {
    expect(untranslated(reviewMessages("en"), reviewMessages("es"))).toEqual([]);
  });

  it("says in the interface language that a folder is not in a Git repository", () => {
    // A folder without Git above it: the scratch folder's own drive or temporary folder.
    const folder = toProjectPath(join(scratch, "loose"));
    mkdirSync(folder, { recursive: true });
    const english = gitRevisionHost(folder, "HEAD");
    if (typeof english !== "string") return; // The temporary folder is inside a repository.
    expect(english).toBe(
      "the path is not in a Git repository; give the version before with --before <path>.",
    );
    setLocale("es");
    expect(gitRevisionHost(folder, "HEAD")).toBe(reviewMessages("es").git.notARepository);
  });

  it.skipIf(!hasGit)("names an unknown revision in the interface language", () => {
    const repo = join(scratch, "repo");
    mkdirSync(repo, { recursive: true });
    expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
    writeFileSync(join(repo, "a.meltemi"), 'language "0.2"\n');
    const folder = toProjectPath(repo);
    expect(gitRevisionHost(folder, "no-such-branch")).toBe(
      '"no-such-branch" is not a commit, branch or tag of the repository.',
    );
    setLocale("es");
    expect(gitRevisionHost(folder, "no-such-branch")).toBe(
      '"no-such-branch" no es un commit, una rama ni una etiqueta del repositorio.',
    );
  });
});
