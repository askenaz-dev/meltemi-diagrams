/**
 * The scenarios of what the room refuses and what it costs: a text that would pass the limit, and
 * a minute of typing measured through the room's own counters (`GET /api/dev/rooms/:id/stats`).
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import {
  NOTES,
  code,
  codeIs,
  connected,
  connection,
  makeProject,
  openByLink,
  readRoom,
  roomHolds,
  roomStats,
  statusLine,
  typeAtEnd,
  waitFor,
} from "./cloud.js";
import { until } from "./support.js";

/** The most characters a text file holds (`CLOUD_LIMITS.textCharacters`). */
export const TEXT_LIMIT = 2 * 1024 * 1024;

/** A text of lines of 80 characters, exactly `length` characters long. */
export function fillerText(length: number): string {
  const whole = Math.floor(length / 80);
  const text = `${"x".repeat(79)}\n`.repeat(whole);
  return text + "y".repeat(length - text.length);
}

/** What the minute of typing may cost the room (`cloud-document`, "Rows written stay bounded"). */
export const MINUTE_BOUNDS = {
  storageWrites: { least: 20, most: 90 },
  materialisations: { most: 3 },
  d1RowsWritten: { most: 60 },
  messages: { most: 300 },
} as const;

/** How long the minute lasts. */
const MINUTE_MS = 60_000;

export const limitScenarios: Scenario[] = [
  {
    name: "a refused transaction: a text that would pass 2 Mi characters is named in the status line, the local text returns to the room's, and the socket reopens",
    signedIn: "u-ana-refused",
    async run(t) {
      const { page } = t;
      const big = fillerText(TEXT_LIMIT - 3);
      assert.equal(big.length, TEXT_LIMIT - 3);
      const project = await makeProject(t.me, "Almost full", {
        files: { "diagrams/a.meltemi": NOTES, "notes.txt": big },
      });
      await openByLink(page, t.origin, project.id);
      await page.locator("#file-select").selectOption("notes.txt");
      await codeIs(page, big, "the big text open");
      const revision = (await readRoom(t.me, project.id)).revision;
      const sockets = t.seen.sockets.length;

      // Three characters fit; six do not. The room refuses the change as a whole.
      await typeAtEnd(page, "abcdef");
      await until(
        page,
        "the limit in the status line",
        () =>
          document.querySelector(".status-text")?.textContent?.includes("over its size limit") ??
          false,
      );
      assert.equal(
        await statusLine(page),
        "The project is over its size limit: 16 MiB in all, and 2 Mi characters in one file. " +
          "Your last change was not kept: the project is back as the room has it.",
      );

      // The local text returns to the room's state, which never changed.
      await codeIs(page, big, "the text back as the room has it");
      const room = await readRoom(t.me, project.id);
      assert.equal(room.files["notes.txt"], big);
      assert.equal(room.revision, revision, "the refused transaction changed nothing");

      // The socket reopened: a new one was made, and the page is connected and saved again.
      await waitFor("a new socket to be opened", () => t.seen.sockets.length > sockets);
      await connected(page, "the socket to reopen");
      assert.ok(t.seen.sockets.length > sockets, "a second socket was opened");
      assert.equal(await connection(page), "connected");

      // And the project works again: a deletion is within the limit and reaches the room.
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Backspace");
      const smaller = await roomHolds(
        t.me,
        project.id,
        "the deletion in the room",
        (read) => (read.files["notes.txt"] ?? "").length === TEXT_LIMIT - 4,
      );
      assert.equal(smaller.files["notes.txt"], big.slice(0, -1));
      assert.equal(await code(page), big.slice(0, -1));
    },
  },

  {
    name: "a paste of over 512 KiB is refused as one change that is too large: the status line says so, the text returns to the room's, and the socket reopens",
    signedIn: "u-ana-paste",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      await openByLink(page, t.origin, flow.id);
      const original = await code(page);
      const revision = (await readRoom(t.me, flow.id)).revision;
      const sockets = t.seen.sockets.length;

      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.insertText(`// ${"pasted ".repeat(100_000)}\n`);
      await until(page, "the limit in the status line", () =>
        (document.querySelector(".status-text")?.textContent ?? "").includes("512 KiB"),
      );
      assert.equal(
        await statusLine(page),
        "A single change is over 512 KiB. Make it in smaller steps. " +
          "Your last change was not kept: the project is back as the room has it.",
      );
      await codeIs(page, original, "the text back as the room has it");
      await waitFor("a new socket to be opened", () => t.seen.sockets.length > sockets);
      await connected(page, "the socket to reopen");
      const room = await readRoom(t.me, flow.id);
      assert.equal(room.files["diagrams/overview.meltemi"], original);
      assert.equal(room.revision, revision, "the refused change changed nothing");
    },
  },

  {
    name: "the minute of typing: sixty seconds of typing cost 20 to 90 storage writes, at most 3 materialisations, 60 D1 rows and 300 messages",
    signedIn: "u-ana-minute",
    async run(t) {
      const { page } = t;
      const project = await makeProject(t.me, "A minute of typing", { template: "flow" });
      await openByLink(page, t.origin, project.id);
      const before = await roomStats(t.me, project.id);

      // Eight keys at about 18 a second, then a pause of under half a second: a person who types
      // fast and stops to think, without ever leaving the room idle for a second.
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n", { delay: 0 });
      const began = Date.now();
      let typed = 0;
      while (Date.now() - began < MINUTE_MS) {
        await page.keyboard.type("lorem ip", { delay: 55 });
        typed += 8;
        await page.waitForTimeout(450);
      }
      const took = Date.now() - began;
      const stats = await roomStats(t.me, project.id);
      console.log(
        `    typed ${typed} characters in ${(took / 1000).toFixed(1)} s: ${stats.storageWrites} storage writes, ` +
          `${stats.materialisations} materialisations, ${stats.d1RowsWritten} D1 rows written, ` +
          `${stats.messages} messages, revision ${stats.revision} (${stats.storageWrites - before.storageWrites} writes, ` +
          `${stats.messages - before.messages} messages during the minute)`,
      );

      // The room counted since it was made; it was not rebuilt (that would reset the counts).
      assert.ok(stats.messages >= before.messages, "the room kept its counters");
      assert.ok(stats.clients >= 1);
      const { storageWrites, materialisations, d1RowsWritten, messages } = MINUTE_BOUNDS;
      assert.ok(
        stats.storageWrites >= storageWrites.least && stats.storageWrites <= storageWrites.most,
        `${stats.storageWrites} storage writes, expected ${storageWrites.least} to ${storageWrites.most}`,
      );
      assert.ok(
        stats.materialisations <= materialisations.most,
        `${stats.materialisations} materialisations, expected at most ${materialisations.most}`,
      );
      assert.equal(stats.materialiseFailures, 0);
      assert.ok(
        stats.d1RowsWritten <= d1RowsWritten.most,
        `${stats.d1RowsWritten} D1 rows written, expected at most ${d1RowsWritten.most}`,
      );
      assert.ok(
        stats.messages <= messages.most,
        `${stats.messages} messages, expected at most ${messages.most}`,
      );

      // Every key reached the room, and the page says it is saved.
      await connected(page);
      const room = await roomHolds(t.me, project.id, "all the typing in the room", (read) =>
        (read.files["diagrams/overview.meltemi"] ?? "").endsWith("lorem ip".repeat(typed / 8)),
      );
      const typedText = room.files["diagrams/overview.meltemi"];
      assert.equal(typedText, await code(page));

      // The last client leaves: the room materialises what changed (one file's row, not every
      // file's) and a version made then holds the typed text, read back from D1 and R2.
      await page.close();
      await waitFor("the room to materialise when the last client left", async () => {
        const now = await roomStats(t.me, project.id);
        return now.materialisations > stats.materialisations;
      });
      const left = await roomStats(t.me, project.id);
      assert.equal(left.materialiseFailures, 0);
      const rows = left.d1RowsWritten - stats.d1RowsWritten;
      console.log(`    the last client leaving: ${rows} D1 rows written`);
      assert.ok(rows > 0 && rows <= 6, `${rows} D1 rows written to materialise one changed file`);
      const version = await t.me.api("POST", `/api/projects/${project.id}/versions`, {
        label: "after typing",
      });
      assert.equal(version.status, 201, version.text);
      const made = await t.me.api(
        "GET",
        `/api/projects/${project.id}/versions/${version.json()["number"]}`,
      );
      assert.equal(
        (made.json()["files"] as Record<string, string>)["diagrams/overview.meltemi"],
        typedText,
      );
    },
  },
];
