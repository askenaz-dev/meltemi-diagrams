/**
 * The scenarios of a connection that comes and goes: what two devices do while the room cannot be
 * reached merges when it can, a project reopens from IndexedDB at once, and a project deleted from
 * another device stops the page reconnecting.
 *
 * The room is cut the way a developer cuts it (the Worker's `DEV` route closes the sockets), and
 * kept out of reach with a gate on the page's sockets (see `gateRooms`) for as long as a scenario
 * needs to edit "offline"; opening the gate and telling the page the browser is back online is the
 * connection returning.
 */
import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { Scenario } from "./scenario.js";
import {
  THUMBNAIL_RATE_LOGGED,
  backOnline,
  code,
  connected,
  connection,
  connectionLeaves,
  cutRoom,
  drawerRow,
  gateRooms,
  makeProject,
  noDialog,
  openByLink,
  openDrawer,
  readRoom,
  roomHolds,
  statusLine,
  studioState,
  textOf,
  typeAtEnd,
} from "./cloud.js";
import { until } from "./support.js";

const ONE = [
  "diagrams/one.meltemi",
  'language "0.2"\n\ndiagram one: flow {\n  a["A"]\n  b["B"]\n  a -> b\n}\n',
];
const TWO = [
  "diagrams/two.meltemi",
  'language "0.2"\n\ndiagram two: flow {\n  c["C"]\n  d["D"]\n  c -> d\n}\n',
];

/** The IndexedDB rows of this browser's cloud projects. */
function keptRows(page: Page): Promise<{ docs: number; updates: number }> {
  return page.evaluate(
    () =>
      new Promise<{ docs: number; updates: number }>((resolve, reject) => {
        const open = indexedDB.open("meltemi-cloud");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(["docs", "updates"], "readonly");
          const docs = transaction.objectStore("docs").count();
          const updates = transaction.objectStore("updates").count();
          transaction.oncomplete = () => {
            database.close();
            resolve({ docs: docs.result, updates: updates.result });
          };
        };
      }),
  );
}

export const offlineScenarios: Scenario[] = [
  {
    name: "offline merge: the sockets are cut, each device edits a different file while the connection is down, and when it returns both documents hold both edits",
    signedIn: "u-ana-offline",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const project = await makeProject(t.me, "Two files", {
        files: Object.fromEntries([ONE, TWO]),
      });
      const second = await t.device();
      const doors = [await gateRooms(t.context), await gateRooms(second.context)];
      const pages = [t.page, second.page] as const;
      for (const page of pages) await openByLink(page, t.origin, project.id);
      await t.page.locator("#file-select").selectOption(ONE[0]);
      await second.page.locator("#file-select").selectOption(TWO[0]);

      // The connection drops: the room closes both sockets, and nothing reaches it again for now.
      for (const door of doors) door.shut();
      assert.equal(await cutRoom(t.me, project.id), 2, "both sockets were open");
      for (const page of pages) await connectionLeaves(page, "connected", "saving");
      for (const page of pages) {
        assert.equal(await connection(page), "reconnecting");
        assert.match(
          (await page.locator(".cloud-status").innerText()) ?? "",
          /^Reconnecting… your changes are kept in this browser/,
        );
      }

      // Each device edits its own file; neither edit is in the room, and both pages go on working.
      await typeAtEnd(t.page, "// edited on the first device while the connection was down");
      await typeAtEnd(second.page, "// edited on the second device while the connection was down");
      const held = await readRoom(t.me, project.id);
      assert.equal(held.files[ONE[0]], ONE[1], "the room has none of it");
      assert.equal(held.files[TWO[0]], TWO[1], "the room has none of it");
      for (const page of pages) assert.equal(await connection(page), "reconnecting");

      // The connection returns: both edits reach the room and both pages, with no dialog.
      for (const door of doors) door.open();
      for (const page of pages) await backOnline(page);
      for (const page of pages) await connected(page, "the connection to return");
      const merged = await roomHolds(
        t.me,
        project.id,
        "both offline edits in the room",
        (read) =>
          (read.files[ONE[0]] ?? "").endsWith("while the connection was down") &&
          (read.files[TWO[0]] ?? "").endsWith("while the connection was down"),
      );
      assert.match(merged.files[ONE[0]] ?? "", /edited on the first device/);
      assert.match(merged.files[TWO[0]] ?? "", /edited on the second device/);
      for (const page of pages) {
        await until(
          page,
          "both edits in the page's documents",
          ([one, two]) => {
            const studio = (
              window as unknown as {
                meltemiPlayground: { studio: { text(path: string): string | undefined } };
              }
            ).meltemiPlayground.studio;
            return (
              (studio.text(one) ?? "").includes("edited on the first device") &&
              (studio.text(two) ?? "").includes("edited on the second device")
            );
          },
          [ONE[0], TWO[0]] as const,
        );
        assert.equal(await page.locator("dialog[open]").count(), 0, "no dialog");
        assert.equal(await connection(page), "connected");
      }
      assert.equal(await textOf(t.page, ONE[0]), merged.files[ONE[0]]);
      assert.equal(await textOf(second.page, TWO[0]), merged.files[TWO[0]]);
      assert.ok(doors[0]!.refused > 0, "the page did try to reconnect while the door was shut");
      // The connection says it is back, and the room kept nothing twice.
      assert.deepEqual(merged.collisions, []);
    },
  },

  {
    name: "kept in IndexedDB: a reload while the changes are only in this browser opens the project from it at once, and then syncs them",
    signedIn: "u-ana-indexeddb",
    async run(t) {
      const { page } = t;
      const project = await makeProject(t.me, "Kept", { files: Object.fromEntries([ONE]) });
      const door = await gateRooms(t.context);
      await openByLink(page, t.origin, project.id);
      const rows = await keptRows(page);
      assert.equal(rows.docs, 1, "the document is kept in this browser as soon as it opens");

      // The connection drops, and the person edits: the room has none of it.
      door.shut();
      await cutRoom(t.me, project.id);
      await connectionLeaves(page, "connected", "saving");
      await typeAtEnd(page, "// kept while the room was out of reach");
      const edited = await code(page);
      assert.match(edited, /kept while the room was out of reach$/);
      // Each local change is appended to IndexedDB as it is made.
      for (let waited = 0; (await keptRows(page)).updates < 1; waited += 100) {
        assert.ok(waited < 5000, "the change was appended to IndexedDB");
        await page.waitForTimeout(100);
      }
      assert.equal((await readRoom(t.me, project.id)).files[ONE[0]], ONE[1]);

      // Reload with the room still out of reach: the project is open, from this browser, at once.
      await page.reload();
      await page.waitForFunction(
        () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
      );
      assert.equal(new URL(page.url()).searchParams.get("project"), project.id);
      assert.equal((await studioState(page)).bound, true);
      assert.equal(await code(page), edited, "the edit made while away is on the screen");
      assert.equal(await connection(page), "reconnecting");
      assert.match(
        await page.locator(".cloud-status").innerText(),
        /your changes are kept in this browser/,
      );
      assert.equal(
        (await readRoom(t.me, project.id)).files[ONE[0]],
        ONE[1],
        "the room still lacks it",
      );

      // The room is reachable again: the page syncs, and the edit is in the room.
      door.open();
      await backOnline(page);
      await connected(page, "the sync after the reload");
      const room = await roomHolds(t.me, project.id, "the edit made while away", (read) =>
        (read.files[ONE[0]] ?? "").endsWith("kept while the room was out of reach"),
      );
      assert.equal(room.files[ONE[0]], edited);
    },
  },

  {
    name: "a cloud project opened with no connection at all comes from this browser's copy, and the status line says offline",
    signedIn: "u-ana-reopen",
    allowedErrors: [/ERR_INTERNET_DISCONNECTED/, /WebSocket connection/],
    async run(t) {
      const { page, context } = t;
      const project = await makeProject(t.me, "Offline", { files: Object.fromEntries([ONE]) });
      await openByLink(page, t.origin, project.id);
      await typeAtEnd(page, "\n// kept for offline");
      const text = await code(page);
      await roomHolds(t.me, project.id, "the edit in the room", (read) =>
        (read.files[ONE[0]] ?? "").endsWith("// kept for offline"),
      );
      // Back to the anonymous project, which keeps the browser's copy of the cloud one.
      await openDrawer(page);
      await page.getByRole("button", { name: "Open the local project" }).click();
      await noDialog(page);
      assert.equal((await studioState(page)).bound, false);

      // With no connection the cloud project opens from that copy (the page itself would not load
      // with no network, and there is no service worker: what is checked is the project's own way).
      await context.setOffline(true);
      const outcome = await page.evaluate(
        (id) =>
          (
            window as unknown as {
              meltemiPlayground: { cloud: { open(id: string): Promise<string> } };
            }
          ).meltemiPlayground.cloud.open(id),
        project.id,
      );
      assert.equal(outcome, "opened");
      assert.equal(await code(page), text);
      assert.equal(await connection(page), "offline");
      assert.match(
        await page.locator(".cloud-status").innerText(),
        /^Offline: your changes are kept in this browser/,
      );
      assert.match(
        await statusLine(page),
        /Opened the project from this browser\. You are offline\./,
      );
      assert.equal((await studioState(page)).bound, true);

      // The network returns, and the project connects.
      await context.setOffline(false);
      await connected(page, "the connection after the network came back");
    },
  },

  {
    name: "two devices adding a file of the same name while offline: both files are kept, the smaller id keeps the name, the other shows as <name>~<id>, and the page says so",
    signedIn: "u-ana-collision",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const project = await makeProject(t.me, "Collide", { files: Object.fromEntries([ONE]) });
      const second = await t.device();
      const doors = [await gateRooms(t.context), await gateRooms(second.context)];
      const pages = [t.page, second.page] as const;
      for (const page of pages) await openByLink(page, t.origin, project.id);
      for (const door of doors) door.shut();
      assert.equal(await cutRoom(t.me, project.id), 2);
      for (const page of pages) await connectionLeaves(page, "connected", "saving");

      // Each device adds diagrams/new.meltemi, with a line of its own in it.
      for (const [number, page] of pages.entries()) {
        await page.getByRole("button", { name: "New file" }).click();
        const dialog = page.locator("dialog[open]");
        assert.equal(await dialog.locator("input").inputValue(), "diagrams/new.meltemi");
        await dialog.getByRole("button", { name: "OK", exact: true }).click();
        await until(
          page,
          "the new file open",
          () =>
            (document.querySelector("#file-select") as HTMLSelectElement).value ===
            "diagrams/new.meltemi",
        );
        await typeAtEnd(page, `\n// written on device ${number}`);
      }
      assert.deepEqual(Object.keys((await readRoom(t.me, project.id)).files), [ONE[0]]);

      // The connection returns: the room keeps both and says which name is shared.
      for (const door of doors) door.open();
      for (const page of pages) await backOnline(page);
      const room = await roomHolds(
        t.me,
        project.id,
        "the collision in the room",
        (read) => read.collisions.length === 1,
      );
      const names = Object.keys(room.files).sort();
      assert.equal(names.length, 3, names.join(", "));
      const other = names.find((name) => name.startsWith("diagrams/new.meltemi~"));
      assert.ok(other, `the file that lost the name is shown as <name>~<id>: ${names.join(", ")}`);
      assert.match(other, /^diagrams\/new\.meltemi~[0-9a-z]{16}$/);
      const written = [room.files["diagrams/new.meltemi"] ?? "", room.files[other] ?? ""];
      assert.deepEqual(
        written.map((text) => /written on device (\d)/.exec(text)?.[1]).sort(),
        ["0", "1"],
        "each device's file is kept, one under each name",
      );

      // Both pages show the same three files, and say that two had the same name.
      for (const page of pages) {
        await connected(page, "the connection to return");
        await until(
          page,
          "the page to show both files",
          (wanted) => {
            const options = [...document.querySelectorAll("#file-select option")].map(
              (option) => (option as HTMLOptionElement).value,
            );
            return wanted.every((name) => options.includes(name));
          },
          names,
        );
        assert.deepEqual((await studioState(page)).paths, names);
        assert.match(
          await statusLine(page),
          /^Two files had the same name: one keeps it and the other is shown as diagrams\/new\.meltemi~[0-9a-z]{16}\./,
        );
      }
      assert.equal(await textOf(t.page, "diagrams/new.meltemi"), written[0]);
      assert.equal(await textOf(second.page, other), written[1]);
    },
  },

  {
    name: "storage unavailable: with no IndexedDB the project still opens from the room, and the status line says it will not be kept offline",
    signedIn: "u-ana-nostorage",
    async run(t) {
      const { page } = t;
      await t.context.addInitScript(() => {
        Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
      });
      const project = await makeProject(t.me, "No storage", { template: "flow" });
      await openByLink(page, t.origin, project.id);
      assert.equal(await page.locator(".cloud-status").getAttribute("data-kept"), "false");
      assert.equal(
        await page.locator(".cloud-status").innerText(),
        "Saved to the cloud Not kept offline in this browser.",
      );
      assert.equal(await statusLine(page), "This browser will not keep the project offline.");
      // The project is the room's, and what is typed reaches it all the same.
      assert.match(await code(page), /diagram overview: flow/);
      await typeAtEnd(page, "\n// typed with nowhere to keep it");
      await roomHolds(t.me, project.id, "the typing in the room", (read) =>
        (read.files["diagrams/overview.meltemi"] ?? "").endsWith("nowhere to keep it"),
      );
    },
  },

  {
    name: "a project deleted while this device was offline: when the connection returns the page finds out, says so and stops reconnecting",
    signedIn: "u-ana-deleted-offline",
    allowedErrors: [/status of 404/, /WebSocket/],
    async run(t) {
      const { page } = t;
      const project = await makeProject(t.me, "Doomed", { template: "flow" });
      const door = await gateRooms(t.context);
      await openByLink(page, t.origin, project.id);

      // The connection drops, and meanwhile the project is deleted from somewhere else.
      door.shut();
      await cutRoom(t.me, project.id);
      await connectionLeaves(page, "connected", "saving");
      const removed = await t.me.api("DELETE", `/api/projects/${project.id}`);
      assert.equal(removed.status, 204, removed.text);

      // The connection returns: the Worker refuses the upgrade (there is no such project for the
      // person), which the browser reports as a failed socket and nothing more. The page asks.
      door.open();
      await backOnline(page);
      await until(
        page,
        "the page to find out that the project is gone",
        () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "gone",
      );
      assert.equal(await page.locator(".cloud-status").innerText(), "Deleted from the cloud");
      assert.match(await statusLine(page), /This project was deleted from your account/);
      const opened = t.seen.sockets.length;
      await page.waitForTimeout(5000);
      assert.equal(t.seen.sockets.length, opened, "no socket was opened after it found out");
      assert.equal(await connection(page), "gone");
    },
  },

  {
    name: "a project deleted from another device: the open page says so and stops reconnecting",
    signedIn: "u-ana-deleted",
    allowedErrors: [/status of 404/, THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const project = await makeProject(t.me, "Doomed", { template: "flow" });
      const keeper = await makeProject(t.me, "Kept", { template: "flow" });
      const second = await t.device();
      await openByLink(t.page, t.origin, project.id);
      assert.equal(t.seen.sockets.length, 1);
      const typed = "\n// typed while the project is deleted elsewhere";

      // The other device deletes it from its drawer, as a person does.
      await second.page.goto(`${t.origin}/?project=${keeper.id}`);
      await connected(second.page);
      await openDrawer(second.page);
      await drawerRow(second.page, "Doomed").locator('button[data-action="delete"]').click();
      await second.page
        .locator("dialog[open]")
        .last()
        .getByRole("button", { name: "Delete the project", exact: true })
        .click();
      await until(
        second.page,
        "the project to leave the second device's list",
        () =>
          ![...document.querySelectorAll("dialog.drawer .project-name")].some(
            (n) => n.textContent === "Doomed",
          ),
      );
      assert.equal((await t.me.api("GET", `/api/projects/${project.id}`)).status, 404);

      // The page says it is gone: in the indicator and in the status line.
      await until(
        t.page,
        "the page to say the project is gone",
        () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "gone",
      );
      assert.equal(await t.page.locator(".cloud-status").innerText(), "Deleted from the cloud");
      assert.match(await statusLine(t.page), /This project was deleted from your account/);

      // It stopped trying: no socket is opened again, however long the page stays.
      const opened = t.seen.sockets.length;
      await t.page.waitForTimeout(6000);
      assert.equal(t.seen.sockets.length, opened, "no socket was opened after the deletion");
      assert.equal(await connection(t.page), "gone");
      // The person still has the text on the screen, and can still type into it.
      await typeAtEnd(t.page, typed);
      assert.match(await code(t.page), /typed while the project is deleted elsewhere$/);
      assert.equal(await connection(t.page), "gone");
    },
  },
];
