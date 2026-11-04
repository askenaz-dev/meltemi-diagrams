import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { CLI_VERSION, run } from "../src/index.js";
import { compile } from "@meltemi/diagrams-model";
import { TEMPLATE_CONTENT_KINDS, templateManifest } from "@meltemi/diagrams-project";
import { TEMPLATES, templateFiles, withCloudJob, type TemplateName } from "../src/init-command.js";

const TEMPLATE_FOLDER = fileURLToPath(new URL("../templates/", import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), "mdg-init-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const hasGit = spawnSync("git", ["--version"]).status === 0;

function mdg(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
  });
  return { code, stdout, stderr };
}

describe("init", () => {
  it("lists the templates", () => {
    const { code, stdout } = mdg(scratch, "init", "--list");
    expect(code).toBe(0);
    expect(
      stdout
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split(" ")[0]),
    ).toEqual(Object.keys(TEMPLATES));
  });

  it("lists each template's title, description and contents", () => {
    const { stdout } = mdg(scratch, "init", "--list");
    const lines = stdout.split("\n").filter(Boolean);
    expect(lines).toHaveLength(7);
    expect(lines.map((l) => l.split(" ")[0])).toEqual([
      "flow",
      "c4",
      "sequence",
      "free",
      "kanban",
      "whiteboard",
      "purchase",
    ]);
    expect(lines.find((l) => l.startsWith("c4 "))).toMatch(
      /^c4 +C4 model — An architecture model with a context view and a container view \(1 model, 2 views\)$/,
    );
    expect(lines.find((l) => l.startsWith("kanban "))).toMatch(
      /^kanban +Kanban board — A board of columns and sticky cards \(1 diagram\)$/,
    );
    expect(lines.find((l) => l.startsWith("whiteboard "))).toMatch(
      /^whiteboard +Whiteboard — A sketched board with strokes, stickies and a story that draws them \(1 diagram, 1 story\)$/,
    );
    expect(lines.find((l) => l.startsWith("purchase "))).toMatch(
      /\(1 model, 2 views, 2 diagrams, 1 story\)$/,
    );
  });

  it("creates a kanban board that validates without diagnostics: a row of three columns of stickies", () => {
    const { code } = mdg(scratch, "init", "board", "--template", "kanban");
    expect(code).toBe(0);
    const validate = mdg(scratch, "validate", "board");
    expect(validate.stdout).toBe("Checked 1 file: 0 errors, 0 warnings.\n");
    expect(validate.code).toBe(0);
    const diagram = compile(
      readFileSync(join(scratch, "board", "diagrams", "board.meltemi"), "utf8"),
    ).document.diagrams[0]!;
    expect(diagram.type).toBe("free");
    expect(diagram.properties.preset).toBe("board");
    const groups = diagram.elements.filter((e) => e.kind === "group");
    const row = groups.find((g) => g.list?.layout === "row")!;
    expect(row.list?.align).toBe("stretch");
    const columns = groups.filter(
      (g) => g.list?.layout === "column" && g.groupPath.at(-1) === row.id,
    );
    expect(columns.map((c) => c.label)).toEqual(["To do", "Doing", "Done"]);
    for (const column of columns) {
      const cards = diagram.elements.filter((e) => e.groupPath.at(-1) === column.id);
      expect(cards.length, column.id).toBeGreaterThan(0);
      expect(cards.every((e) => e.kind === "sticky")).toBe(true);
    }
    const stickies = diagram.elements.filter((e) => e.kind === "sticky");
    expect(stickies).toHaveLength(6);
    // Two colours: the theme's and one written fill; and no place for a card, the lists place them.
    const filled = diagram.styles.filter(
      (s) => stickies.some((e) => e.id === s.target) && s.properties.fill !== undefined,
    );
    expect(new Set(filled.map((s) => s.properties.fill)).size).toBe(1);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.length).toBeLessThan(stickies.length);
    expect(diagram.relations).toHaveLength(2);
    expect(diagram.placement.filter((p) => stickies.some((e) => e.id === p.target))).toEqual([]);
    expect(diagram.placement.some((p) => p.statement === "place" && p.target === row.id)).toBe(
      true,
    );
  });

  it.each(Object.keys(TEMPLATES) as TemplateName[])(
    "declares what the %s template holds",
    (template) => {
      const counted = { diagrams: 0, models: 0, views: 0, stories: 0 };
      for (const file of templateFiles(template).filter((f) => f.endsWith(".meltemi"))) {
        const document = compile(
          readFileSync(join(TEMPLATE_FOLDER, template, file), "utf8"),
        ).document;
        counted.views += document.diagrams.filter((d) => d.type === "c4").length;
        counted.diagrams += document.diagrams.filter((d) => d.type !== "c4").length;
        counted.models += document.models.length;
        counted.stories += document.stories.length;
      }
      const declared = TEMPLATES[template].contents;
      for (const kind of TEMPLATE_CONTENT_KINDS) {
        expect(
          declared[kind],
          `${template}: ${kind} declared ${declared[kind]}, files hold ${counted[kind]}`,
        ).toBe(counted[kind]);
      }
    },
  );

  it.each(Object.keys(TEMPLATES) as TemplateName[])(
    "creates a %s project that validates and builds its catalog",
    (template) => {
      const { code, stdout } = mdg(scratch, "init", template, "--template", template);
      expect(code).toBe(0);
      expect(stdout).toContain(`Created ${template}/project.json\n`);
      for (const file of templateFiles(template)) {
        expect(stdout).toContain(`Created ${template}/${file}\n`);
      }
      expect(stdout).toContain(`Next:\n  meltemi-diagrams validate ${template}\n`);
      const manifest = JSON.parse(readFileSync(join(scratch, template, "project.json"), "utf8"));
      expect(manifest).toMatchObject({
        name: template,
        language: "0.2",
        tools: { "meltemi-diagrams": `^${CLI_VERSION}` },
      });
      const validate = mdg(scratch, "validate", template);
      expect(validate.stdout).toMatch(/: 0 errors, 0 warnings\.\n$/);
      expect(validate.code).toBe(0);
      const catalog = mdg(scratch, "build", "catalog", template, "--out", `${template}.html`);
      expect(catalog.stderr).toBe("");
      expect(catalog.code).toBe(0);
    },
    120_000,
  );

  it("writes the manifest the project package makes, as the playground does", () => {
    expect(mdg(scratch, "init", "shop", "--template", "purchase").code).toBe(0);
    expect(readFileSync(join(scratch, "shop", "project.json"), "utf8")).toBe(
      templateManifest("shop", "purchase", { toolVersion: CLI_VERSION, languageVersion: "0.2" }),
    );
    expect(
      JSON.parse(
        templateManifest("shop", "purchase", { toolVersion: "1.0.0", languageVersion: "0.2" }),
      ).catalog.title,
    ).toBe("Purchase");
  });

  it("names the project and never replaces a file", () => {
    const named = mdg(scratch, "init", "named", "--name", "Shop architecture");
    expect(named.code).toBe(0);
    expect(JSON.parse(readFileSync(join(scratch, "named", "project.json"), "utf8")).name).toBe(
      "Shop architecture",
    );
    expect(mdg(scratch, "init", "named").stderr).toContain("is already a project");
    const busy = join(scratch, "busy");
    mkdirSync(join(busy, "diagrams"), { recursive: true });
    writeFileSync(join(busy, "diagrams", "overview.meltemi"), "mine");
    const refused = mdg(scratch, "init", "busy");
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("busy/diagrams/overview.meltemi exists; nothing was written.");
    expect(existsSync(join(busy, "project.json"))).toBe(false);
    expect(readFileSync(join(busy, "diagrams", "overview.meltemi"), "utf8")).toBe("mine");
    expect(mdg(scratch, "init", "x", "--template", "uml").code).toBe(2);
    expect(mdg(scratch, "init", "x", "--ci", "jenkins").code).toBe(2);
    expect(mdg(scratch, "init", "a", "b").code).toBe(2);
    expect(mdg(scratch, "init", "--help").stdout).toContain("Usage: init [folder]");
  });

  it.skipIf(!hasGit)("writes a GitHub workflow at the top of the repository", () => {
    const repo = join(scratch, "repo");
    mkdirSync(repo);
    expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
    const { code, stdout } = mdg(repo, "init", join("docs", "architecture"), "--ci", "github");
    expect(code).toBe(0);
    expect(stdout).toContain("Created .github/workflows/meltemi-diagrams.yml\n");
    const workflow = readFileSync(
      join(repo, ".github", "workflows", "meltemi-diagrams.yml"),
      "utf8",
    );
    expect(workflow).toContain('PROJECT: "docs/architecture"');
    expect(workflow).toContain(`MELTEMI_DIAGRAMS: "@meltemi/diagrams-cli@${CLI_VERSION}"`);
    expect(workflow).toContain('--base "origin/$GITHUB_BASE_REF"');
    expect(workflow).not.toContain("${{ github.base_ref }}");
    const again = mdg(repo, "init", join("docs", "architecture"), "--ci", "github");
    expect(again.code).toBe(2);
    expect(again.stderr).toContain("exists; it is not replaced");
  });

  it("adds a GitLab job to an existing project, beside a pipeline it does not replace", () => {
    const project = join(scratch, "gitlab");
    expect(mdg(scratch, "init", "gitlab").code).toBe(0);
    const first = mdg(scratch, "init", "gitlab", "--ci", "gitlab");
    expect(first.code).toBe(0);
    expect(first.stdout).toBe("Created gitlab/.gitlab-ci.yml\n");
    expect(readFileSync(join(project, ".gitlab-ci.yml"), "utf8")).toContain('PROJECT: "."');
    const second = mdg(scratch, "init", "gitlab", "--ci", "gitlab");
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("include:\n    - local: .gitlab/meltemi-diagrams.yml");
    expect(existsSync(join(project, ".gitlab", "meltemi-diagrams.yml"))).toBe(true);
  });
});

describe("init --ci <service> --cloud", () => {
  const workflowOf = (folder: string) =>
    readFileSync(join(scratch, folder, ".github", "workflows", "meltemi-diagrams.yml"), "utf8");
  /** The keys of the jobs of a GitHub workflow: the two-space keys after `jobs:`. */
  const githubJobs = (text: string) =>
    [...text.slice(text.indexOf("\njobs:")).matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)].map((m) => m[1]);
  /** Lines that give a variable named MELTEMI_TOKEN a value: the only way a file can hold one. */
  const tokenAssignments = (text: string) =>
    text.split("\n").filter((line) => /^\s*-?\s*MELTEMI_TOKEN\s*[:=]/.test(line));

  it("adds the push job to the GitHub workflow, on the default branch, with the secret and --force --strict", () => {
    const { code, stdout, stderr } = mdg(
      scratch,
      "init",
      "cloud-github",
      "--ci",
      "github",
      "--cloud",
    );
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("Created cloud-github/.github/workflows/meltemi-diagrams.yml\n");
    const workflow = workflowOf("cloud-github");
    // The workflow that was there is still there, then the job.
    expect(githubJobs(workflow)).toEqual(["diagrams", "cloud"]);
    expect(workflow).toContain(
      'npx --yes --package "$MELTEMI_DIAGRAMS" meltemi-diagrams validate "$PROJECT" --strict',
    );
    expect(workflow).toContain(
      "if: github.event_name == 'push' && github.ref_name == github.event.repository.default_branch",
    );
    expect(workflow).toContain("MELTEMI_TOKEN: ${{ secrets.MELTEMI_TOKEN }}");
    expect(workflow).toContain("MELTEMI_HOST: ${{ vars.MELTEMI_HOST }}");
    expect(workflow).toContain(
      'run: npx --yes --package "$MELTEMI_DIAGRAMS" meltemi-diagrams push "$PROJECT" --force --strict',
    );
    // The project and the version are filled in everywhere, and the workflow still triggers on main only.
    expect(workflow).toContain('PROJECT: "."');
    expect(workflow).toContain(`MELTEMI_DIAGRAMS: "@meltemi/diagrams-cli@${CLI_VERSION}"`);
    expect(workflow).not.toContain("{{project}}");
    expect(workflow).not.toContain("{{version}}");
    expect(workflow).toContain("branches: [main]");
    // Why --force, said where the next person reads.
    expect(workflow).toMatch(/--force: CI cannot answer the question a\s+# push asks/);
    // The token is the secret's and nobody's text: no value in the file, no token of any shape.
    expect(workflow).not.toContain("mdg_");
    expect(tokenAssignments(workflow)).toEqual([
      "          MELTEMI_TOKEN: ${{ secrets.MELTEMI_TOKEN }}",
    ]);
    // What to do about the secret is told, once.
    expect(stdout).toContain("Add MELTEMI_TOKEN to the CI's secrets");
  });

  it("leaves the workflow as it was without --cloud: no push job, no token", () => {
    expect(mdg(scratch, "init", "plain-github", "--ci", "github").code).toBe(0);
    const plain = workflowOf("plain-github");
    expect(githubJobs(plain)).toEqual(["diagrams"]);
    expect(plain).not.toContain("MELTEMI_TOKEN");
    expect(plain).not.toContain("meltemi-diagrams push");
    expect(plain).not.toContain("secrets.");
    expect(plain).not.toContain("cloud-begin");
    expect(plain.endsWith("          if-no-files-found: ignore\n")).toBe(true);
    // The cloud workflow is that one with the job added at its end, nothing else changed.
    expect(mdg(scratch, "init", "plain-then-cloud", "--ci", "github", "--cloud").code).toBe(0);
    const cloud = workflowOf("plain-then-cloud");
    expect(cloud.startsWith(plain)).toBe(true);
    expect(cloud.length).toBeGreaterThan(plain.length);
    expect(mdg(scratch, "init", "plain-gitlab", "--ci", "gitlab").code).toBe(0);
    const gitlab = readFileSync(join(scratch, "plain-gitlab", ".gitlab-ci.yml"), "utf8");
    expect(gitlab).not.toContain("MELTEMI_TOKEN");
    expect(gitlab).not.toContain("push");
    expect(gitlab).not.toContain("cloud-begin");
    expect(gitlab.endsWith("    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH\n")).toBe(true);
  });

  it("keeps the job of a template or takes it out whole, with its markers gone either way", () => {
    const template = "a: 1\n\n  # {{cloud-begin}}\n  job:\n    run: x\n  # {{cloud-end}}\n";
    expect(withCloudJob(template, false)).toBe("a: 1\n");
    expect(withCloudJob(template, true)).toBe("a: 1\n\n  job:\n    run: x\n");
    // A template without the job is what it is, and the markers of a real template are not left.
    expect(withCloudJob("a: 1\n", false)).toBe("a: 1\n");
    expect(withCloudJob("a: 1\n", true)).toBe("a: 1\n");
    for (const service of ["github", "gitlab"]) {
      for (const cloud of [false, true]) {
        const text = withCloudJob(
          readFileSync(join(TEMPLATE_FOLDER, "ci", `${service}.yml`), "utf8"),
          cloud,
        );
        expect(text, `${service} ${cloud}`).not.toContain("{{cloud-");
        expect(text.includes("MELTEMI_TOKEN"), `${service} ${cloud}`).toBe(cloud);
      }
    }
  });

  it("adds the push job to the GitLab pipeline: the default branch, --force --strict, no token in the file", () => {
    const { code, stdout, stderr } = mdg(
      scratch,
      "init",
      "cloud-gitlab",
      "--ci",
      "gitlab",
      "--cloud",
    );
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("Created cloud-gitlab/.gitlab-ci.yml\n");
    const pipeline = readFileSync(join(scratch, "cloud-gitlab", ".gitlab-ci.yml"), "utf8");
    expect(pipeline.match(/^[a-z][\w-]*:/gm)).toEqual([
      "meltemi-diagrams:",
      "meltemi-diagrams-cloud:",
    ]);
    const job = pipeline.slice(pipeline.indexOf("meltemi-diagrams-cloud:"));
    expect(job).toContain(
      '- npx --yes --package "$MELTEMI_DIAGRAMS" meltemi-diagrams push "$PROJECT" --force --strict',
    );
    expect(job).toContain("- if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH");
    // The job is the project's variables' to fill: a masked CI/CD variable, said in the comment.
    expect(pipeline).toMatch(
      /MELTEMI_TOKEN is an API token kept as a CI\/CD variable[^]*masked and protected/,
    );
    expect(tokenAssignments(pipeline)).toEqual([]);
    expect(pipeline).not.toContain("mdg_");
    expect(pipeline).not.toContain("{{");
    expect(job).toContain('PROJECT: "."');
    // The merge request job is still what it was.
    expect(
      pipeline.startsWith(readFileSync(join(scratch, "plain-gitlab", ".gitlab-ci.yml"), "utf8")),
    ).toBe(true);
    // Beside a pipeline that exists, the job file has both jobs.
    const again = mdg(scratch, "init", "cloud-gitlab", "--ci", "gitlab", "--cloud");
    expect(again.code, again.stderr).toBe(0);
    const beside = readFileSync(
      join(scratch, "cloud-gitlab", ".gitlab", "meltemi-diagrams.yml"),
      "utf8",
    );
    expect(beside).toContain("meltemi-diagrams-cloud:");
  });

  it("adds the job to a project that exists, writing only the workflow, and tells it in Spanish with --lang es", () => {
    expect(mdg(scratch, "init", "existing").code).toBe(0);
    const manifest = readFileSync(join(scratch, "existing", "project.json"), "utf8");
    const { code, stdout } = mdg(
      scratch,
      "init",
      "existing",
      "--ci",
      "github",
      "--cloud",
      "--lang",
      "es",
    );
    expect(code).toBe(0);
    expect(githubJobs(workflowOf("existing"))).toEqual(["diagrams", "cloud"]);
    expect(readFileSync(join(scratch, "existing", "project.json"), "utf8")).toBe(manifest);
    expect(stdout).toContain("Agrega MELTEMI_TOKEN a los secretos de la CI");
    expect(stdout).not.toContain("mdg_");
  });

  it("is a usage error without --ci, or with a service that is not one, and writes nothing", () => {
    const withoutCi = mdg(scratch, "init", "cloud-alone", "--cloud");
    expect(withoutCi.code).toBe(2);
    expect(withoutCi.stderr).toBe(
      "meltemi-diagrams init: --cloud adds a job to the CI workflow; give --ci github or gitlab with it.\n",
    );
    expect(existsSync(join(scratch, "cloud-alone"))).toBe(false);
    const unknown = mdg(scratch, "init", "cloud-unknown", "--ci", "jenkins", "--cloud");
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('--ci takes github or gitlab, not "jenkins".');
    expect(existsSync(join(scratch, "cloud-unknown"))).toBe(false);
    const spanish = mdg(scratch, "init", "cloud-alone", "--cloud", "--lang", "es");
    expect(spanish.code).toBe(2);
    expect(spanish.stderr).toContain("--cloud agrega un trabajo al flujo de trabajo de CI");
    // An existing project that is given --cloud alone is refused as before: nothing to write.
    expect(mdg(scratch, "init", "existing", "--cloud").code).toBe(2);
  });

  it("lists --cloud in the help, in both languages", () => {
    expect(mdg(scratch, "init", "--help").stdout).toContain("--cloud            With --ci:");
    expect(mdg(scratch, "init", "--help", "--lang", "es").stdout).toContain(
      "--cloud              Con --ci:",
    );
    expect(mdg(scratch, "--help").stdout).toContain("  --cloud                With --ci:");
  });

  it.skipIf(!hasGit)(
    "writes the project's path from the top of the repository, whatever characters it has",
    () => {
      const repo = join(scratch, "cloud-repo");
      mkdirSync(repo);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      const { code, stderr } = mdg(repo, "init", join("docs", "a$&b"), "--ci", "github", "--cloud");
      expect(code, stderr).toBe(0);
      const workflow = readFileSync(
        join(repo, ".github", "workflows", "meltemi-diagrams.yml"),
        "utf8",
      );
      // Every use of the path, the one in the cloud job included, is the path as it is.
      expect(workflow).toContain('PROJECT: "docs/a$&b"');
      expect(workflow).not.toContain("{{project}}");
    },
  );
});
