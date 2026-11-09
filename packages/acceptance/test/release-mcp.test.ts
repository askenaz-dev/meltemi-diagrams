import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { run } from "@meltemi/diagrams-cli";
import { startMcp, type Running } from "../../cli/test/mcp-support.js";
import { checkInstalledFolderMcp, type InstalledFolderMcp } from "../src/release-check.js";

type Answer = Awaited<ReturnType<InstalledFolderMcp["callTool"]>>;

describe("the installed-folder release smoke check", () => {
  const scratch = mkdtempSync(join(tmpdir(), "meltemi-release-mcp-"));
  const folder = join(scratch, "purchase");
  let server: Running | undefined;
  let client: Client;

  beforeAll(async () => {
    expect(
      await run(["init", folder, "--template", "purchase"], {
        cwd: scratch,
        stdout: () => {},
        stderr: () => {},
        env: { MELTEMI_LANG: "en" },
      }),
    ).toBe(0);
    server = await startMcp(["--folder", folder], {
      cwd: scratch,
      env: { MELTEMI_LANG: "en" },
      hooks: {
        fetch: async () => {
          throw new Error("The folder smoke test must not request a service.");
        },
      },
    });
    client = await server.connect();
  }, 60_000);

  afterAll(async () => {
    if (server) expect(await server.stop()).toBe(0);
    rmSync(scratch, { recursive: true, force: true });
  });

  function adapter(change?: (name: string, answer: Answer) => Answer) {
    const calls: string[] = [];
    const connection: InstalledFolderMcp = {
      listTools: () => client.listTools(),
      callTool: async (request) => {
        calls.push(request.name);
        const answer = await client.callTool(request);
        return change ? change(request.name, answer) : answer;
      },
    };
    return { connection, calls };
  }

  it("inspects the real compiled purchase story before previewing its snapshot", async () => {
    const { connection, calls } = adapter();
    const lines = await checkInstalledFolderMcp(connection, folder);
    expect(calls).toEqual(["inspect_story", "preview"]);
    expect(lines).toContainEqual(
      expect.stringMatching(/^inspect_story: purchase, 2 scenes, \d+ ms, revision \d+$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/^preview: PNG \d+×\d+, \d+ bytes at .*ms, same revision$/),
    );
  }, 60_000);

  it("refuses a server missing story inspection before requesting a frame", async () => {
    const { connection, calls } = adapter();
    connection.listTools = async () => ({
      tools: (await client.listTools()).tools.filter((tool) => tool.name !== "inspect_story"),
    });
    await expect(checkInstalledFolderMcp(connection, folder)).rejects.toThrow(
      /tools\/list: expected .*inspect_story/,
    );
    expect(calls).toEqual([]);
  });

  it("refuses malformed inspection data before requesting a frame", async () => {
    const { connection, calls } = adapter((name, answer) =>
      name === "inspect_story"
        ? {
            ...answer,
            structuredContent: {
              ...(answer.structuredContent as Record<string, unknown>),
              durationMs: "not a duration",
            },
          }
        : answer,
    );
    await expect(checkInstalledFolderMcp(connection, folder)).rejects.toThrow(
      "inspect_story returned an invalid report",
    );
    expect(calls).toEqual(["inspect_story"]);
  });

  it("compares schema-valid times with the compiled source instead of trusting the report", async () => {
    const { connection, calls } = adapter((name, answer) => {
      if (name !== "inspect_story") return answer;
      const data = answer.structuredContent as Record<string, unknown>;
      return {
        ...answer,
        structuredContent: { ...data, durationMs: Number(data["durationMs"]) + 1 },
      };
    });
    await expect(checkInstalledFolderMcp(connection, folder)).rejects.toThrow(
      "differs from the compiled purchase timeline",
    );
    expect(calls).toEqual(["inspect_story"]);
  });

  it("refuses an otherwise valid preview from a different folder snapshot", async () => {
    const { connection, calls } = adapter((name, answer) => {
      if (name !== "preview") return answer;
      const data = answer.structuredContent as Record<string, unknown>;
      return { ...answer, structuredContent: { ...data, revision: Number(data["revision"]) + 1 } };
    });
    await expect(checkInstalledFolderMcp(connection, folder)).rejects.toThrow(
      "refer to different folder snapshots",
    );
    expect(calls).toEqual(["inspect_story", "preview"]);
  }, 60_000);
});
