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
    expect(text).toContain("ref: ${{ needs.authorize.outputs.sha }}");
    expect(text).toContain('git merge-base --is-ancestor "$SOURCE_SHA" origin/main');
    const boundary = text.indexOf("node ../delivery/scripts/ci-run.mjs current");
    expect(boundary).toBeGreaterThan(text.indexOf("run: pnpm playground:build"));
    expect(boundary).toBeLessThan(text.indexOf("wrangler d1 migrations apply"));
    expect(text.match(/if: steps.current.outputs.current == 'true'/g)).toHaveLength(3);
    expect(secretsOf(text)).toEqual(["CLOUDFLARE_API_TOKEN"]);
    expect(text).toContain("environment: production");
    expect(text).not.toContain("rollback_version:");
  });
});
