// Structural delivery guards complement the executable API and Git fixtures in automatic-release.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/corpus.js";

const DIR = join(REPO_ROOT, ".github", "workflows");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const secretsOf = (text: string) =>
  [
    ...new Set([...text.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])),
  ].sort();

describe("delivery workflows", () => {
  it("keeps the three workflows read-only by default and preserves queued pushes", () => {
    expect(readdirSync(DIR).sort()).toEqual(["ci.yml", "deploy.yml", "release.yml"]);
    for (const name of readdirSync(DIR)) {
      const text = read(name);
      expect(text).toMatch(/^permissions:\n {2}contents: read/m);
      expect(text).toContain("cancel-in-progress: false\n  queue: max");
      expect(text).not.toMatch(/\bwrangler secret\b|echo[^\n]*\$\{\{\s*secrets\./);
    }
  });

  it("runs CI for main pushes and PRs, including the four platform/runtime combinations and browser suites", () => {
    const text = read("ci.yml");
    expect(text).toMatch(/push:\n\s+branches: \[main\]\n\s+pull_request:/);
    expect(text).toContain("os: [ubuntu-latest, windows-latest]");
    expect(text).toContain("node: [22, 24]");
    for (const command of [
      "typecheck",
      "lint",
      "licenses:inventory --check",
      "test",
      "build",
      "playground:test-browser",
      "player:test-browser",
      "catalog:test-browser",
      "vscode:test-webview",
      "cloud:test-browser",
    ]) {
      expect(text).toContain(`run: pnpm ${command}`);
    }
    expect(secretsOf(text)).toEqual([]);
  });

  it.each(["release.yml", "deploy.yml"])(
    "%s validates CI rather than trusting a tag, dispatch SHA or default branch head",
    (name) => {
      const text = read(name);
      expect(text).toContain("workflow_run:");
      expect(text).toContain("workflows: [CI]");
      expect(text).toContain("types: [completed]");
      expect(text).toContain("ci_run_id:");
      expect(text).toContain("github.ref == 'refs/heads/main'");
      expect(text).toContain("github.event.workflow_run.conclusion == 'success'");
      expect(text).toContain("github.event.workflow_run.event == 'push'");
      expect(text).toContain(
        "github.event.workflow_run.head_repository.full_name == github.repository",
      );
      expect(text).toContain("ref: ${{ github.workflow_sha }}");
      expect(text).toContain("node scripts/ci-run.mjs");
      expect(text).not.toMatch(/^\s+tags:|^\s+push:/m);
    },
  );

  it("publishes four independent channels from the same checked artifact and fails the summary on any incomplete channel", () => {
    const text = read("release.yml");
    for (const name of ["npm", "marketplace", "openvsx", "github"]) {
      expect(text).toContain(`  ${name}:\n    needs: check`);
    }
    expect(text.match(/name: \$\{\{ needs.check.outputs.artifact \}\}/g)).toHaveLength(4);
    expect(text).toContain("ref: ${{ steps.ci.outputs.sha }}");
    expect(text).toContain("run: pnpm release:check");
    expect(text).toContain("SOURCE_DATE_EPOCH: ${{ steps.plan.outputs.source_date_epoch }}");
    expect(text).toContain("needs: [check, npm, marketplace, openvsx, github]");
    expect(text).toContain("always() && needs.check.result != 'skipped'");
    expect(text).toContain("value.result !== 'success'");
    expect(text).not.toContain("git push origin main");
  });

  it("uses Marketplace OIDC with its registered empty environment and native duplicate handling", () => {
    const text = read("release.yml");
    const marketplace = text.split("  marketplace:\n")[1]!.split("  openvsx:\n")[0]!;
    expect(marketplace).toContain("id-token: write");
    expect(marketplace).toContain("@vscode/vsce@4.1.0 publish");
    expect(marketplace).toContain("--oidc");
    expect(marketplace).toContain("--skip-duplicate");
    expect(marketplace).not.toContain("environment:");
    expect(secretsOf(text)).toEqual(["NPM_TOKEN", "OVSX_PAT", "WEB_DISPATCH_TOKEN"]);
    expect(text).toContain("node delivery/scripts/publish-github.mjs");
    expect(text).not.toContain("--clobber");
  });

  it("tells Meltemi Web after the GitHub release, with the narrow token only and never a failure for its absence", () => {
    const text = read("release.yml");
    const job = text.split("  tell-the-web:\n")[1]!.split("  summary:\n")[0]!;
    expect(job).toContain("needs: [check, github]");
    expect(job).toContain("if: ${{ always() && needs.github.result == 'success' }}");
    expect(secretsOf(job)).toEqual(["WEB_DISPATCH_TOKEN"]);
    expect(job).toContain("GH_TOKEN: ${{ secrets.WEB_DISPATCH_TOKEN }}");
    expect(job).toContain('if [ -z "$GH_TOKEN" ]; then');
    expect(job).toContain("::warning::WEB_DISPATCH_TOKEN is not set");
    expect(job).toContain("exit 0");
    expect(job).toContain("gh workflow run deploy.yml --repo askenaz-dev/meltemi-web --ref main");
    expect(job).not.toContain("permissions:\n      contents: write");
    // The channels' summary is about publishing; the web's notice is not one of them.
    expect(text).toContain("needs: [check, npm, marketplace, openvsx, github]");
  });

  it("uses Open VSX OIDC in its dedicated environment and the namespace token only for an extension's first version", () => {
    const text = read("release.yml");
    const openvsx = text.split("  openvsx:\n")[1]!.split("  github:\n")[0]!;
    const step = (name: string) =>
      openvsx.split(`- name: ${name}\n`)[1]!.split("      - name:")[0]!.split("      # ")[0]!;
    expect(openvsx).toContain("environment: open-vsx");
    expect(openvsx).toContain("permissions:\n      contents: read\n      id-token: write");
    expect(openvsx).toContain("node-version: 24");

    const registry = step("Is the extension on Open VSX yet?");
    expect(registry).toContain("extension/package.json");
    expect(registry).toContain("https://open-vsx.org/api/${id}");
    expect(registry).toContain('200) echo "first=false"');
    expect(registry).toContain('404) echo "first=true"');
    expect(registry).toContain("exit 1");

    const oidc = step("Open VSX through OIDC");
    expect(oidc).toContain("if: steps.registry.outputs.first == 'false'");
    expect(oidc).toContain(
      'run: npx --yes ovsx@1.3.0 publish "release/meltemi-diagrams-${VERSION}.vsix" --trusted-publishing --skip-duplicate',
    );
    expect(oidc).not.toContain("OVSX_PAT");

    const first = step("First Open VSX version with the namespace token");
    expect(first).toContain("if: steps.registry.outputs.first == 'true'");
    expect(first).toContain("OVSX_PAT: ${{ secrets.OVSX_PAT }}");
    expect(first).toContain(
      'npx --yes ovsx@1.3.0 publish "release/meltemi-diagrams-${VERSION}.vsix" --skip-duplicate',
    );
    expect(first).not.toContain("--trusted-publishing");

    expect(openvsx.match(/secrets\.OVSX_PAT/g)).toHaveLength(1);
    // The token reaches ovsx through its environment, never as an argument.
    expect(openvsx).not.toMatch(/--pat\b|-p "?\$|continue-on-error|\|\| true|grep/);
    expect(secretsOf(openvsx)).toEqual(["OVSX_PAT"]);
  });

  it("recovers original artifacts without a rebuild and gates every channel on integrity preflight", () => {
    const text = read("release.yml");
    expect(text).toContain("release_run_id:");
    expect(text).toContain("if: ${{ inputs.release_run_id != '' }}");
    expect(text).toContain('node ../delivery/scripts/recover-release.mjs "$RELEASE_PLAN" release');
    expect(text).toContain(
      "run: pnpm release:check\n        if: ${{ inputs.release_run_id == '' }}",
    );
    const preflight = text.indexOf("node ../delivery/scripts/preflight-release.mjs");
    expect(preflight).toBeGreaterThan(
      text.indexOf("node ../delivery/scripts/automatic-release.mjs metadata"),
    );
    expect(preflight).toBeLessThan(text.indexOf("uses: actions/upload-artifact@v4"));
  });

  it("builds the exact CI source and checks current main before any deployment mutation", () => {
    const text = read("deploy.yml");
    for (const name of ["staging", "deploy"]) {
      const job = jobOf(text, name);
      expect(job).toContain("ref: ${{ needs.authorize.outputs.sha }}");
      expect(job).toContain('git merge-base --is-ancestor "$SOURCE_SHA" origin/main');
      const boundary = job.indexOf("node ../delivery/scripts/ci-run.mjs current");
      expect(boundary).toBeGreaterThan(job.indexOf("run: pnpm playground:build"));
      expect(boundary).toBeLessThan(job.indexOf("wrangler d1 migrations apply"));
      // The migrations, both Workers and the suite run only for a source that is still main.
      const mutations = stepsOf(job).filter((step) =>
        /wrangler (d1 migrations apply|deploy)/.test(step),
      );
      expect(mutations).toHaveLength(3);
      for (const step of mutations) {
        expect(step).toContain("if: steps.current.outputs.current == 'true'\n");
      }
      expect(stepNamed(job, "acceptance:mcp\n")).toMatch(
        /if: steps\.current\.outputs\.current == 'true'/,
      );
    }
    expect(secretsOf(text)).toEqual(["CLOUDFLARE_API_TOKEN", "MELTEMI_TOKEN", "MELTEMI_TOKEN_2"]);
    expect(jobOf(text, "deploy")).toContain("environment: production");
    expect(jobOf(text, "staging")).toContain("environment: staging");
    expect(text).not.toContain("rollback_version:");
  });

  it("deploys staging first, runs the suite there, and only then production and its suite", () => {
    const text = read("deploy.yml");
    expect(Object.keys(jobsOf(text))).toEqual(["authorize", "staging", "deploy"]);
    const staging = jobOf(text, "staging");
    const production = jobOf(text, "deploy");
    expect(staging).toContain("    needs: authorize\n");
    // A failed staging job leaves production undeployed: it needs staging, and nothing lets a
    // failed step pass.
    expect(production).toContain("    needs: [authorize, staging]\n");
    expect(text).not.toContain("continue-on-error");
    expect(production).not.toMatch(/^\s+if:.*(always\(\)|failure\(\))/m);

    const order = (job: string, marks: readonly string[]) => {
      const at = marks.map((mark) => job.indexOf(mark));
      at.forEach((index, i) => expect(index, marks[i]).toBeGreaterThan(-1));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    };
    order(staging, [
      "node scripts/deploy-config.mjs --environment staging packages/cloud/wrangler.jsonc packages/cloud/wrangler.publish.jsonc",
      "run: pnpm playground:build",
      "node ../delivery/scripts/ci-run.mjs current",
      "wrangler d1 migrations apply DB --remote -c wrangler.deploy.json",
      "wrangler deploy -c wrangler.deploy.json",
      "wrangler deploy -c wrangler.publish.deploy.json",
      "run: pnpm acceptance:mcp --probe",
      "run: pnpm acceptance:mcp\n",
      "name: mcp-acceptance-staging",
    ]);
    order(production, [
      "node scripts/deploy-config.mjs packages/cloud/wrangler.jsonc packages/cloud/wrangler.publish.jsonc",
      "wrangler d1 migrations apply DB --remote -c wrangler.deploy.json",
      "wrangler deploy -c wrangler.deploy.json",
      "wrangler deploy -c wrangler.publish.deploy.json",
      "run: pnpm acceptance:mcp\n",
      "name: mcp-acceptance-production",
    ]);
    expect(stepNamed(staging, "run: pnpm acceptance:mcp\n")).toContain(
      "MELTEMI_ORIGIN: https://staging.diagrams.meltemi.dev\n",
    );
    expect(stepNamed(production, "run: pnpm acceptance:mcp\n")).toContain(
      "MELTEMI_ORIGIN: https://diagrams.meltemi.dev\n",
    );
    // Each run's results.json is kept, red or green.
    for (const [job, name] of [
      [staging, "mcp-acceptance-staging"],
      [production, "mcp-acceptance-production"],
    ] as const) {
      const upload = stepNamed(job, `name: ${name}`);
      expect(upload).toContain("uses: actions/upload-artifact@v4");
      expect(upload).toContain("if: ${{ !cancelled() && steps.suite.outcome != 'skipped' }}");
      expect(upload).toContain("path: source/.test-output/mcp-acceptance/");
    }
  });

  it("writes each environment's configuration from its own variables", () => {
    const text = read("deploy.yml");
    const variables = (job: string) =>
      [...job.matchAll(/\$\{\{\s*vars\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]).sort();
    expect(variables(jobOf(text, "staging"))).toEqual([
      "CLOUDFLARE_ACCOUNT_ID",
      "D1_DATABASE_ID",
      "OAUTH_KV_ID",
      "R2_BUCKET_NAME",
      "SECRETS_STORE_ID",
      "SECRETS_SUFFIX",
    ]);
    // Production's suffix is empty: a variable it does not read.
    expect(variables(jobOf(text, "deploy"))).toEqual([
      "CLOUDFLARE_ACCOUNT_ID",
      "D1_DATABASE_ID",
      "OAUTH_KV_ID",
      "R2_BUCKET_NAME",
      "SECRETS_STORE_ID",
    ]);
  });

  it("reads the suite's tokens as secrets only, in the suite's steps, and never echoes them", () => {
    const text = read("deploy.yml");
    for (const name of ["MELTEMI_TOKEN", "MELTEMI_TOKEN_2"]) {
      // Every mention is the environment entry that reads the secret.
      const lines = text.split("\n").filter((line) => new RegExp(`\\b${name}\\b`).test(line));
      expect(lines).toEqual([
        `          ${name}: \${{ secrets.${name} }}`,
        `          ${name}: \${{ secrets.${name} }}`,
      ]);
    }
    for (const job of [jobOf(text, "staging"), jobOf(text, "deploy")]) {
      for (const step of stepsOf(job).filter((s) => s.includes("secrets.MELTEMI_TOKEN"))) {
        expect(step).toContain("run: pnpm acceptance:mcp\n");
        // The suite runs without the Cloudflare token of the job.
        expect(step).toContain('CLOUDFLARE_API_TOKEN: ""\n');
      }
      const suites = stepsOf(job).filter((s) => s.includes("run: pnpm acceptance:mcp"));
      expect(suites.length).toBeGreaterThan(0);
      for (const step of suites) expect(step).toContain('CLOUDFLARE_API_TOKEN: ""\n');
    }
    expect(text).not.toMatch(/\$\{\{\s*vars\.MELTEMI_TOKEN|echo[^\n]*MELTEMI_TOKEN|::add-mask::/);
    expect(text).not.toMatch(/run:[^\n]*\$\{\{\s*secrets\./);
  });

  it("skips the staging suite with a notice while the staging host does not answer", () => {
    const staging = jobOf(read("deploy.yml"), "staging");
    const probe = stepNamed(staging, "run: pnpm acceptance:mcp --probe");
    expect(probe).toContain("id: host\n");
    expect(probe).toContain("MELTEMI_ORIGIN: https://staging.diagrams.meltemi.dev\n");
    expect(probe).not.toContain("secrets.");
    expect(stepNamed(staging, "run: pnpm acceptance:mcp\n")).toContain(
      "if: steps.current.outputs.current == 'true' && steps.host.outputs.answers == 'true'\n",
    );
    const result = stepNamed(staging, "name: Staging result");
    expect(result).toContain("::notice title=Staging not attached::");
    expect(result).toContain("production is not deployed");
  });
});

/** The jobs of a workflow, by id, each with its text. */
function jobsOf(text: string): Record<string, string> {
  const body = text.split(/^jobs:\n/m)[1] ?? "";
  const jobs: Record<string, string> = {};
  let current: string | undefined;
  for (const line of body.split("\n")) {
    const id = /^ {2}([a-z][a-z0-9-]*):$/.exec(line)?.[1];
    if (id) {
      current = id;
      jobs[id] = "";
    } else if (current) {
      jobs[current] += `${line}\n`;
    }
  }
  return jobs;
}

const jobOf = (text: string, id: string) => {
  const job = jobsOf(text)[id];
  if (job === undefined) throw new Error(`no job ${id}`);
  return job;
};

/** A job's steps, each from its `- ` to the next. */
const stepsOf = (job: string) => (job.split(/^ {4}steps:\n/m)[1] ?? "").split(/^ {6}- /m).slice(1);

/** The one step of a job that holds `mark`. */
function stepNamed(job: string, mark: string): string {
  const found = stepsOf(job).filter((step) => step.includes(mark));
  if (found.length !== 1) throw new Error(`${found.length} steps hold ${mark}`);
  return found[0]!;
}
