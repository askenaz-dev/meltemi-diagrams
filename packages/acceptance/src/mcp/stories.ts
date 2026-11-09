// The same story-authoring journey runs against the hosted endpoint, the local account server,
// and the Worker's in-memory test host. All mutations are ordinary revision-checked source edits.
import assert from "node:assert/strict";
import type { Agent } from "./agent.js";

export type StoryAgent = Pick<Agent, "ok" | "refused" | "call">;

export const STORY_BASE = `language "0.2"

// Keep the person's diagram and its comments intact.
diagram checkout: flow {
  direction LR
  a["Client"]
  b["API"]
  a -> b: "Request" as request
}

diagram detail: flow {
  direction LR
  a["Worker"]
  b["Store"]
  a -> b: "Persist" as save
}

// Another author's story is outside this edit.
story existing for checkout {
  scene still { hold 1s }
}
`;

export const AUTHORED_STORY = `
story walkthrough for checkout {
  title "Request walkthrough"
  scene overview "Overview" {
    reveal a, b over 400ms
    parallel {
      trace request over 800ms
      highlight a over 400ms
    }
    hold 100ms
  }
  scene storage "Storage" {
    view detail
    transition fade over 200ms
    camera all over 300ms
    hold 200ms
  }
}
`;

const DELIVERY = `
export walkthrough_player for walkthrough {
  format html
}
`;

/** Prove creation, timing edits, conflict recovery, frame boundaries and scoped deletion. */
export async function storyAuthoringJourney(agent: StoryAgent, project: string): Promise<void> {
  const path = "stories.meltemi";
  const read = async () => {
    const value = await agent.ok("read_files", { project });
    return {
      revision: value["revision"] as number,
      files: value["files"] as Record<string, string>,
    };
  };
  const write = async (source: string, revision: number) =>
    agent.ok("write_files", { project, files: { [path]: source }, ifRevision: revision });
  const inspect = () => agent.ok("inspect_story", { project, path, story: "walkthrough" });
  const sceneTimes = (value: Record<string, unknown>) =>
    (value["scenes"] as { id: string; startMs: number; durationMs: number; endMs: number }[]).map(
      ({ id, startMs, durationMs, endMs }) => [id, startMs, durationMs, endMs],
    );

  const validation = async (file?: string) => {
    const result = await agent.ok("validate", { project, ...(file ? { path: file } : {}) });
    const diagnostics = JSON.stringify(result["diagnostics"]);
    assert.equal(result["truncated"], false, `Validation must be complete: ${diagnostics}`);
    assert.equal(result["errors"], 0, `Validation errors: ${diagnostics}`);
    return result;
  };
  const externalDiagnostics = (result: Record<string, unknown>) =>
    (result["diagnostics"] as { path: string }[]).filter((diagnostic) => diagnostic.path !== path);
  const baseline = externalDiagnostics(await validation());
  const validateStory = async () => {
    const own = await validation(path);
    assert.equal(
      own["warnings"],
      0,
      `Story validation warnings: ${JSON.stringify(own["diagnostics"])}`,
    );
    const projectResult = await validation();
    assert.deepEqual(
      externalDiagnostics(projectResult),
      baseline,
      `External validation diagnostics changed: ${JSON.stringify(projectResult["diagnostics"])}`,
    );
  };

  await write(STORY_BASE + AUTHORED_STORY + DELIVERY, (await read()).revision);
  const created = await read();
  const timeline = await inspect();
  assert.equal(timeline["revision"], created.revision);
  assert.equal(timeline["durationMs"], 2000);
  assert.deepEqual(sceneTimes(timeline), [
    ["overview", 0, 1300, 1300],
    ["storage", 1300, 700, 2000],
  ]);
  const initialScenes = timeline["scenes"] as {
    actions: { kind: string; durationMs: number; children: { durationMs: number }[] }[];
  }[];
  assert.equal(initialScenes[0]!.actions[1]!.kind, "parallel");
  assert.equal(initialScenes[0]!.actions[1]!.durationMs, 800);
  assert.deepEqual(
    initialScenes[0]!.actions[1]!.children.map((action) => action.durationMs),
    [800, 400],
  );

  // A person's concurrent change arrives after the agent's read. The stale attempt must do nothing.
  const human = `${created.files[path]}\n// A concurrent human comment.\n`;
  await write(human, created.revision);
  const desired = created.files[path]!.replace(
    "trace request over 800ms",
    "trace request over 1200ms",
  );
  await agent.refused(
    "write_files",
    { project, files: { [path]: desired }, ifRevision: created.revision },
    "revision.mismatch",
  );
  const fresh = await read();
  assert.equal(fresh.files[path], human);
  const changed = fresh.files[path]!.replace(
    "trace request over 800ms",
    "trace request over 1200ms",
  );
  await write(changed, fresh.revision);
  const edited = await inspect();
  assert.notEqual(
    edited["revision"],
    timeline["revision"],
    "a later inspection identifies its own snapshot",
  );
  assert.equal(edited["durationMs"], 2400);
  assert.deepEqual(sceneTimes(edited), [
    ["overview", 0, 1700, 1700],
    ["storage", 1700, 700, 2400],
  ]);

  // Reordering real scenes must change the compiled active-view order and preserve the comment.
  const overview = / {2}scene overview[\s\S]*?\n {2}}\n/.exec(changed)![0];
  const storage = / {2}scene storage[\s\S]*?\n {2}}\n/.exec(changed)![0];
  const reordered = changed.replace(
    overview + storage,
    storage + overview.replace("    reveal", "    view checkout\n    transition cut\n    reveal"),
  );
  await write(reordered, (await read()).revision);
  const ordered = await inspect();
  assert.deepEqual(
    (ordered["scenes"] as { id: string }[]).map((scene) => scene.id),
    ["storage", "overview"],
  );
  await validateStory();
  const snapshot = await read();
  assert.ok(snapshot.files[path]!.includes("// A concurrent human comment."));
  assert.ok(snapshot.files[path]!.includes(STORY_BASE));
  for (const scene of ordered["scenes"] as {
    startMs: number;
    stillAtMs: number;
    endMs: number;
  }[]) {
    for (const at of [scene.startMs, scene.stillAtMs]) {
      const frame = await agent.call("preview", {
        project,
        path,
        story: "walkthrough",
        at: `${at}ms`,
        format: "svg",
      });
      assert.ok(!frame.isError, "a scene boundary preview succeeds");
      assert.match(frame.content[0]?.text ?? "", /^<svg\b/);
      assert.equal(
        frame.structuredContent?.["revision"],
        ordered["revision"],
        "each frame belongs to the inspected snapshot",
      );
    }
  }

  // Removing a story while its export remains is refused atomically. Remove both only when scoped.
  const authored = /\nstory walkthrough for checkout \{[\s\S]*?\n}\n/.exec(
    snapshot.files[path]!,
  )![0];
  const orphaned = snapshot.files[path]!.replace(authored, "");
  await agent.refused(
    "write_files",
    { project, files: { [path]: orphaned }, ifRevision: snapshot.revision },
    "diagram.invalid",
  );
  assert.deepEqual(await read(), snapshot, "a dangling export changes no source or revision");
  const deleted = orphaned.replace(DELIVERY, "");
  await write(deleted, snapshot.revision);
  assert.equal((await read()).files[path], STORY_BASE + "\n// A concurrent human comment.\n");
  await agent.refused("inspect_story", { project, path, story: "walkthrough" }, "request.invalid");
  const remaining = await agent.ok("inspect_story", { project, path, story: "existing" });
  assert.equal(remaining["durationMs"], 1000);
  await validateStory();
}
