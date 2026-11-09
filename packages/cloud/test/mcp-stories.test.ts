import { describe, expect, it } from "vitest";
import { compile } from "../../model/src/index.js";
import { inspectionOf, MAX_INSPECTION_ITEMS } from "@meltemi/diagrams-mcp/preview";
import {
  storyAuthoringJourney,
  STORY_BASE,
  AUTHORED_STORY,
  type StoryAgent,
} from "../../acceptance/src/mcp/stories.js";
import type { Refusal } from "../../acceptance/src/mcp/agent.js";
import { call, mcp, ok, refused } from "./support/mcp.js";

const IMAGE_WARNING = `diagram board: free {
  image logo "missing.png"
  placement {
    place logo at (100, 100)
    size logo (50, 50)
  }
}
`;

function storyAgent(
  client: Parameters<typeof call>[0],
  firstWrite?: (args: Record<string, unknown>) => Record<string, unknown>,
): StoryAgent {
  let injected = false;
  return {
    call: (name, args) => call(client, name, args),
    ok: async (name, args = {}) => {
      if (name === "write_files" && firstWrite && !injected) {
        injected = true;
        args = firstWrite(args);
      }
      return ok(await call(client, name, args));
    },
    refused: async (name, args, code) => {
      const result = refused(await call(client, name, args));
      expect(result["code"]).toBe(code);
      const { code: actual, message, ...fields } = result;
      return { code: actual, message, fields } as Refusal;
    },
  };
}

describe("agentic story authoring", () => {
  it("bounds the complete timeline instead of silently dropping scenes or actions", () => {
    const story = compile(STORY_BASE + AUTHORED_STORY).document.stories[1]!;
    const scene = story.scenes[0]!;
    const large = {
      ...story,
      scenes: Array.from({ length: MAX_INSPECTION_ITEMS + 1 }, (_, i) => ({
        ...scene,
        id: `s${i}`,
      })),
    };
    expect(inspectionOf(large, { file: "story.meltemi", revision: 7 }, [], false)).toMatchObject({
      ok: false,
      code: "request.invalid",
      message: expect.stringContaining(String(MAX_INSPECTION_ITEMS)),
    });
  });

  it("authors, times, reorders, previews and deletes only its story through the SDK", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token("u-ana"));
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", { name: "Story authoring" }),
    );
    try {
      await storyAuthoringJourney(storyAgent(client), id);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("preserves a pre-existing image warning while requiring its story file to be clean", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token("u-ana"));
    const external = IMAGE_WARNING;
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", {
        name: "Story in an existing board project",
        files: { "board.meltemi": external },
      }),
    );
    try {
      const before = ok(await call(client, "validate", { project: id }));
      expect(before).toMatchObject({ errors: 0, warnings: 1, truncated: false });
      expect(before["diagnostics"]).toMatchObject([
        { path: "board.meltemi", code: "layout.image-unavailable" },
      ]);
      await storyAuthoringJourney(storyAgent(client), id);
      const after = ok(await call(client, "validate", { project: id }));
      expect(after).toEqual(
        expect.objectContaining({ errors: 0, warnings: 1, diagnostics: before["diagnostics"] }),
      );
      const snapshot = ok(await call(client, "read_files", { project: id }));
      expect((snapshot["files"] as Record<string, string>)["board.meltemi"]).toBe(external);
    } finally {
      await client.close();
    }
  }, 60_000);

  it.each(["story", "external"] as const)(
    "rejects a new warning in the %s source instead of hiding it",
    async (where) => {
      const m = await mcp();
      const client = await m.connect(await m.token("u-ana"));
      const { id } = ok<{ id: string }>(
        await call(client, "create_project", { name: "New warning refusal" }),
      );
      const injected = storyAgent(client, (args) => {
        const files = { ...(args["files"] as Record<string, string>) };
        if (where === "story")
          files["stories.meltemi"] = files["stories.meltemi"]!.replace(
            "scene still { hold 1s }",
            "scene still {}",
          );
        else files["unrelated.meltemi"] = IMAGE_WARNING;
        return { ...args, files };
      });
      try {
        await expect(storyAuthoringJourney(injected, id)).rejects.toThrow(
          where === "story" ? "story.empty-scene" : "layout.image-unavailable",
        );
      } finally {
        await client.close();
      }
    },
    60_000,
  );

  it("reports current source identities, imported views and compiled nested action timing without drawing", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token("u-ana"));
    const files = {
      "base.meltemi": 'language "0.2"\ndiagram checkout: flow { a -> b: "Request" as request }\n',
      "story.meltemi":
        'language "0.2"\nimport checkout from "./base.meltemi"\nstory tour for checkout {\n  scene first "First" {\n    parallel {\n      trace request\n      camera all over 2s\n    }\n    hold 300ms\n  }\n}\n',
    };
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", { name: "Imported story", files }),
    );
    const result = ok(
      await call(client, "inspect_story", { project: id, path: "story.meltemi", story: "tour" }),
    );
    expect(result).toMatchObject({
      id: "tour",
      path: "story.meltemi",
      title: null,
      durationMs: 2300,
      revision: 1,
      truncated: false,
    });
    expect(result["scenes"]).toMatchObject([
      {
        id: "first",
        title: "First",
        startMs: 0,
        endMs: 2300,
        durationMs: 2300,
        stillAtMs: 2300,
        view: "/base.meltemi#checkout",
        actions: [
          {
            kind: "parallel",
            startMs: 0,
            endMs: 2000,
            durationMs: 2000,
            path: [0, 0],
            children: [
              { kind: "trace", startMs: 0, endMs: 1200, durationMs: 1200, path: [0, 0, 0] },
              { kind: "camera", durationMs: 2000, all: true },
            ],
          },
          { kind: "hold", startMs: 2000, durationMs: 300 },
        ],
      },
    ]);
    expect((await m.renderers.stats(id)).renders).toBe(0);
    await client.close();
  });

  it("enforces project read access and refuses missing and invalid stories without altering revisions", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token("u-ana"));
    const other = await m.connect(await m.token("u-ben"));
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", {
        name: "Private story",
        files: { "story.meltemi": STORY_BASE + AUTHORED_STORY },
      }),
    );
    const args = { project: id, path: "story.meltemi", story: "walkthrough" };
    expect(refused(await call(other, "inspect_story", args))["code"]).toBe("project.not-found");
    expect(refused(await call(client, "inspect_story", { ...args, story: "absent" }))["code"]).toBe(
      "request.invalid",
    );
    expect(
      refused(await call(client, "inspect_story", { ...args, path: "absent.meltemi" }))["code"],
    ).toBe("request.invalid");
    const before = ok(await call(client, "read_files", { project: id }));
    await call(client, "inspect_story", args);
    expect(ok(await call(client, "read_files", { project: id }))).toEqual(before);
    const core = m.renderers.core(id);
    const invalid = await core.inspectStory({
      revision: 3,
      files: {
        "bad.meltemi":
          "diagram x: flow { a -> b }\nstory bad for x { scene one { trace missing } }",
      },
      file: "bad.meltemi",
      story: "bad",
    });
    expect(invalid).toMatchObject({
      ok: false,
      code: "diagram.invalid",
      diagnostics: [expect.objectContaining({ severity: "error", path: "bad.meltemi" })],
    });
    expect(
      await core.inspectStory({ revision: -1, files: {}, file: "bad.meltemi", story: "bad" }),
    ).toMatchObject({ ok: false, code: "request.invalid" });
    expect(
      await core.inspectStory({
        revision: 4,
        files: {
          "warning.meltemi": "diagram x: flow { a -> b }\nstory tour for x { scene empty {} }\n",
        },
        file: "warning.meltemi",
        story: "tour",
      }),
    ).toMatchObject({
      ok: true,
      inspection: {
        revision: 4,
        durationMs: 0,
        diagnostics: [expect.objectContaining({ code: "story.empty-scene", severity: "warning" })],
      },
    });
    await Promise.all([client.close(), other.close()]);
  });
});
