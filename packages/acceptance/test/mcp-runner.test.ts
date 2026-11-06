import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { access, link, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const runner = join(root, "packages/acceptance/src/mcp/run.ts");
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "mcp-runner-"));
});
afterEach(async () => {
  expect(dirname(resolve(directory))).toBe(resolve(tmpdir()));
  expect(basename(directory)).toMatch(/^mcp-runner-/);
  await rm(directory, { recursive: true, force: true });
});

async function execute(extra: NodeJS.ProcessEnv, flags = ["--require-complete"]) {
  const env = {
    ...process.env,
    MELTEMI_TOKEN: "",
    MELTEMI_TOKEN_2: "",
    MELTEMI_OAUTH_FIXTURES: "",
    CLOUDFLARE_API_TOKEN: "",
    CLOUDFLARE_API_KEY: "",
    CF_API_TOKEN: "",
    CF_API_KEY: "",
    MELTEMI_RESULTS: join(directory, "results", "results.json"),
    ...extra,
  };
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    execFile(
      process.execPath,
      ["--import", "tsx", runner, ...flags],
      { cwd: root, env, timeout: 20_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve({ code: 0, output: stdout + stderr });
        if (typeof error.code !== "number") return reject(error);
        resolve({ code: error.code, output: stdout + stderr });
      },
    );
  });
}

describe("the complete hosted runner's prerequisites", () => {
  it("fails missing credentials before touching a host and writes honest sanitized evidence", async () => {
    let requests = 0;
    const server = createServer((_, response) => {
      requests++;
      response.writeHead(500).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const result = await execute({ MELTEMI_ORIGIN: `http://127.0.0.1:${port}` });
      expect(result.code).toBe(1);
      expect(requests).toBe(0);
      const evidence = JSON.parse(await readFile(join(directory, "results/results.json"), "utf8"));
      expect(evidence).toMatchObject({
        passed: false,
        completeness: { required: true, complete: false, expected: 34 },
      });
      expect(evidence.prerequisites).toEqual(
        expect.arrayContaining([
          "MELTEMI_TOKEN is missing",
          "MELTEMI_TOKEN_2 is missing",
          "MELTEMI_OAUTH_FIXTURES is missing",
        ]),
      );
      expect(evidence.steps).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("never writes tokens or malformed fixture data while naming failed prerequisites", async () => {
    const privateValue = "private-fixture-credential-that-must-stay-private";
    const fixture = join(directory, "private.json");
    await writeFile(
      fixture,
      JSON.stringify({ fixtures: { normal: { accessToken: privateValue } } }),
    );
    const result = await execute({
      MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev",
      MELTEMI_TOKEN: `mdg_${"a".repeat(43)}`,
      MELTEMI_TOKEN_2: `mdg_${"b".repeat(43)}`,
      MELTEMI_OAUTH_FIXTURES: fixture,
      CLOUDFLARE_API_TOKEN: "deployment-authority-must-not-enter-suite",
    });
    expect(result.code).toBe(1);
    const json = await readFile(join(directory, "results/results.json"), "utf8");
    const log = await readFile(join(directory, "results/log.txt"), "utf8");
    const combined = result.output + json + log;
    expect(combined).not.toContain(privateValue);
    expect(combined).not.toContain("deployment-authority-must-not-enter-suite");
    expect(combined).not.toContain(`mdg_${"a".repeat(43)}`);
    expect(combined).toContain("Cloudflare deployment credentials must be absent");
    expect(JSON.parse(json).oauthFixtures.provided).toBe(false);
  });

  it("rejects a fixture manifest inside the uploaded results directory", async () => {
    await mkdir(join(directory, "results"));
    const fixture = join(directory, "results/private.json");
    await writeFile(fixture, "{}");
    const result = await execute({
      MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev",
      MELTEMI_OAUTH_FIXTURES: fixture,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("inside uploaded results");
  });

  it.each(["--local", "--probe"])("cannot claim completeness with %s", async (flag) => {
    const result = await execute({ MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev" }, [
      "--require-complete",
      flag,
    ]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("cannot be combined with --local or --probe");
  });

  it.each(["results", "log", "registration"])(
    "never overwrites private fixture data through the %s output",
    async (kind) => {
      const fixture = join(directory, kind === "log" ? "log.txt" : "private.json");
      const original = JSON.stringify({ credential: "private-journal-must-remain-for-cleanup" });
      const receipt = `${fixture}.registration.json`;
      await writeFile(fixture, original);
      await writeFile(receipt, "private-cleanup-receipt");
      const results =
        kind === "results"
          ? fixture
          : kind === "registration"
            ? receipt
            : join(directory, "results.json");
      const result = await execute({
        MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev",
        MELTEMI_OAUTH_FIXTURES: fixture,
        MELTEMI_RESULTS: results,
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain("no output was written");
      expect(result.output).not.toContain("private-journal-must-remain-for-cleanup");
      expect(await readFile(fixture, "utf8")).toBe(original);
      expect(await readFile(receipt, "utf8")).toBe("private-cleanup-receipt");
      if (kind === "log") await expect(access(results)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("rejects a hard-linked result alias without replacing the fixture inode's data", async () => {
    const fixture = join(directory, "private.json");
    const results = join(directory, "results.json");
    const original = "private-fixture-journal-preserved";
    await writeFile(fixture, original);
    await link(fixture, results);
    const result = await execute({
      MELTEMI_ORIGIN: "https://staging.diagrams.meltemi.dev",
      MELTEMI_OAUTH_FIXTURES: fixture,
      MELTEMI_RESULTS: results,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("no output was written");
    expect(await readFile(fixture, "utf8")).toBe(original);
    expect(await readFile(results, "utf8")).toBe(original);
  });
});
