import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { planOpen } from "../src/cloud/address.js";
import {
  CloudController,
  type CloudEnvironment,
  type CloudHooks,
} from "../src/cloud/controller.js";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";
import { fakeFetch, jsonResponse } from "./support/fake-fetch.js";
import { FakeIdb } from "./support/fake-idb.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const A = "diagrams/a.meltemi";

function rig(options: { full?: boolean } = {}) {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = new FakeRoom();
  addTextFile(cloudDoc(room.doc), A, 'diagram a: flow {\n  title "a"\n}\n', { origin: "seed" });
  room.serve(network);
  if (options.full) {
    // The room turns every socket away: it holds as many people as it may.
    const documents = network.onSocket;
    room.greeting = false;
    network.onSocket = (socket) => {
      documents?.(socket);
      queueMicrotask(() => socket.refuse("room.full", 4409));
    };
  }
  const studio = newStudio();
  const pane = new FakePane(studio);
  const { fetch } = fakeFetch(() =>
    jsonResponse({
      id: ID,
      name: "Purchase",
      description: "",
      updated_at: "2026-10-14T10:00:00.000Z",
      thumbnail: null,
      role: "owner",
    }),
  );
  const reports: string[] = [];
  const env: CloudEnvironment = {
    fetch,
    socket: network.factory,
    indexedDB: new FakeIdb(),
    storage: undefined,
    online: () => true,
    timers,
    location: { href: () => "https://diagrams.example/", replace: () => undefined },
  };
  const hooks: CloudHooks = {
    studio,
    templates: () => [],
    selection: () => pane.selection,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: () => undefined,
    changed: () => undefined,
    keepLocal: () => undefined,
    showLocal: () => undefined,
    localFiles: () => new Map(),
  };
  return { controller: new CloudController(env, hooks), reports, timers, network };
}

describe("the controller's hold on presence", () => {
  it("has presence while a project is open, and none before or after", async () => {
    const r = rig();
    expect(r.controller.presence).toBeUndefined();
    const opening = r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle(30);
    expect(await opening).toBeUndefined();
    expect(r.controller.presence).toBeDefined();
    expect(r.controller.presence?.peers).toEqual([]);
    r.controller.leaveToLocal();
    expect(r.controller.presence).toBeUndefined();
  });
});

describe("opening a project whose room is full", () => {
  it("says so at once, in the page's words, and what to do, instead of waiting to give up", async () => {
    const r = rig({ full: true });
    const opening = r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle(30);
    const notice = await opening;
    expect(notice).toBe(en.cloud.open.full(CLOUD_LIMITS.clients));
    expect(notice).toMatch(/20 people/);
    expect(notice).toMatch(/Open the project again/);
    expect(r.reports.at(-1)).toBe(notice);
    expect(r.controller.openProject).toBeUndefined();
    // No waiting for the ten seconds the room's answer is given: the clock has not moved.
    expect(r.timers.now).toBe(0);
  });

  it("says it in Spanish", () => {
    expect(es.cloud.open.full(20)).toMatch(/20 personas/);
    expect(es.cloud.open.full(20)).not.toBe(en.cloud.open.full(20));
    expect(es.cloud.status.full(20)).toMatch(/20 personas/);
    expect(es.cloud.status.retry).toBe("Reintentar");
  });
});
