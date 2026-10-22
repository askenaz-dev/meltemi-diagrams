/**
 * The scenarios of live collaboration that are about the room and the connection: a socket the Worker
 * cuts, a person who closes the page or falls silent for thirty seconds, a room that is full, viewers,
 * what presence is never (saved, exported), what it costs, and the room's rules for awareness in the
 * real runtime. See `scenarios-collaboration.ts` for what people see and do together, and
 * `collaboration.ts` for what both share.
 *
 * Not here: the states surviving a hibernation of the room, and the alarm firing after a wake. A
 * quiet room is not evicted from memory by `wrangler dev` within the thirty seconds a state lives
 * (measured: still in memory after 26 s, rebuilt by 80 s), so a browser scenario would only ever find
 * the states already dropped; `test/room-awareness-room.test.ts` rebuilds the room from the sockets'
 * attachments (`evict()`) and covers both. What the alarm does without a wake is here, in the
 * scenario of the person who falls silent.
 */
import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import {
  OVERVIEW,
  Listener,
  fileIdOf,
  canvasMarks,
  clickElement,
  drawn,
  exportSvg,
  listed,
  listsLabels,
  listsNobody,
  outlines,
  paneMarks,
  peerCount,
  selectText,
  stored,
  pairIn,
  slowDrag,
  SLIDE,
  stateOf,
} from "./collaboration.js";
import {
  THUMBNAIL_RATE_LOGGED,
  backOnline,
  code,
  codeIs,
  connected,
  connection,
  connectionLeaves,
  cutRoom,
  limitRoom,
  makeProject,
  muteRooms,
  openByLink,
  readRoom,
  roomHolds,
  roomStats,
  statusLine,
  typeAtEnd,
  waitFor,
} from "./cloud.js";
import { KIND, join as joinRoom } from "./room-socket.js";
import type { Person, Scenario } from "./scenario.js";
import { addMember, readOnly, setLinkLevel, viewingIs } from "./sharing.js";
import { ready, until } from "./support.js";

export const collaborationRoomScenarios: Scenario[] = [
  {
    name: "collaboration: a socket the Worker cuts reconnects and merges what each person typed meanwhile: the page says reconnecting and shows nobody while it is cut, and presence returns after the reconnection",
    signedIn: "u-ana-cut",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, project, door } = await pairIn(t, "flow", "u-ben-cut", "Ben", {
        gate: "ana",
      });
      assert.ok(door);
      const labels = { ana: `Ana, in ${OVERVIEW}`, ben: `Ben, in ${OVERVIEW}` };
      await listsLabels(ana, [labels.ben], "Ana sees Ben");
      await listsLabels(bens, [labels.ana], "Ben sees Ana");

      // Ana's socket is cut and her browser cannot reach the room again for now. The room tells Ben at
      // once that she is gone; her page says it is reconnecting and shows nobody (no room, no peers).
      door.shut();
      assert.equal(await cutRoom(t.me, project.id, { sub: t.me.sub }), 1, "one socket was cut");
      await listsNobody(bens, "Ana's socket was cut");
      await connectionLeaves(ana, "connected", "saving");
      assert.equal(await connection(ana), "reconnecting");
      assert.match(
        await ana.locator(".cloud-status").innerText(),
        /^Reconnecting… your changes are kept in this browser/,
      );
      await listsNobody(ana, "a page that is not connected has no peers");
      assert.deepEqual(await drawn(ana), []);
      assert.equal((await paneMarks(ana)).peers, 0);
      assert.equal(await connection(bens), "connected", "Ben's socket was not cut");

      // Both go on typing, in different lines; Ben's edit reaches the room and Ana's does not.
      await typeAtEnd(ana, "\n// Ana, while her socket was cut");
      await bens.locator(".code-input").click();
      await bens.keyboard.press("Control+Home");
      await bens.keyboard.type("// Ben, meanwhile\n", { delay: 12 });
      const held = await roomHolds(t.me, project.id, "Ben's line in the room", (read) =>
        (read.files[OVERVIEW] ?? "").startsWith("// Ben, meanwhile\n"),
      );
      assert.ok(!(held.files[OVERVIEW] ?? "").includes("while her socket was cut"));
      assert.ok((await code(ana)).includes("while her socket was cut"), "Ana's page keeps working");
      assert.equal(await connection(ana), "reconnecting");

      // The connection returns: both lines are everywhere, and each sees the other again.
      door.open();
      await backOnline(ana);
      await connected(ana, "Ana to reconnect");
      const merged = await roomHolds(
        t.me,
        project.id,
        "both lines in the room",
        (read) =>
          (read.files[OVERVIEW] ?? "").startsWith("// Ben, meanwhile\n") &&
          (read.files[OVERVIEW] ?? "").endsWith("while her socket was cut"),
      );
      await codeIs(ana, merged.files[OVERVIEW] ?? "", "Ana's pane to hold both lines");
      await codeIs(bens, merged.files[OVERVIEW] ?? "", "Ben's pane to hold both lines");
      assert.deepEqual(merged.collisions, []);
      await listsLabels(ana, [labels.ben], "presence returned for Ana");
      await listsLabels(bens, [labels.ana], "presence returned for Ben");
      assert.ok(door.refused > 0, "the page did try while the door was shut");

      // Now both sockets are cut with nothing in the way: the browser learns of it about two seconds
      // later, and what is typed meanwhile is offered to the room when the page is back.
      assert.equal(await cutRoom(t.me, project.id), 2, "both sockets were cut");
      await typeAtEnd(ana, "\n// Ana before she knew");
      await bens.locator(".code-input").click();
      await bens.keyboard.press("Control+Home");
      await bens.keyboard.type("// Ben before he knew\n", { delay: 12 });
      await connectionLeaves(ana, "connected", "saving");
      await connectionLeaves(bens, "connected", "saving");
      await connected(ana, "Ana to reconnect by herself");
      await connected(bens, "Ben to reconnect by himself");
      const again = await roomHolds(
        t.me,
        project.id,
        "the four lines in the room",
        (read) => {
          const text = read.files[OVERVIEW] ?? "";
          return (
            text.startsWith("// Ben before he knew\n// Ben, meanwhile\n") &&
            text.endsWith("while her socket was cut\n// Ana before she knew")
          );
        },
        30_000,
      );
      await codeIs(ana, again.files[OVERVIEW] ?? "", "Ana's pane to hold the four lines");
      await codeIs(bens, again.files[OVERVIEW] ?? "", "Ben's pane to hold the four lines");
      await listsLabels(ana, [labels.ben], "Ben is back for Ana");
      await listsLabels(bens, [labels.ana], "Ana is back for Ben");
      assert.deepEqual(again.collisions, []);
    },
  },

  {
    name: "collaboration: a person who keeps moving the caret while the Worker closes their socket makes the page try nothing on the socket the browser is closing (no console error), and presence returns after the reconnection",
    signedIn: "u-ana-closing",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, ben, project } = await pairIn(t, "flow", "u-ben-closing");
      const label = (name: string) => `${name}, in ${OVERVIEW}`;
      await listsLabels(ana, [label("Ben")], "Ana sees Ben");
      await listsLabels(bens, [label("Ana")], "Ben sees Ana");

      // Ben's caret moves every 60 ms while the Worker closes his socket, three times over. The close
      // takes a while to reach his page (locally about two seconds), and for that while the browser
      // holds a socket it is closing which the page has no word of yet: what the page tells the room
      // meanwhile (a caret it sends at most every 250 ms) must not be tried on it, or the browser logs
      // an error. Whether a send falls in that while is chance, so the cut is repeated.
      const moveCaret = (seconds: number) =>
        bens.locator(".code-input").evaluate(async (area: HTMLTextAreaElement, duration) => {
          area.focus();
          const until = performance.now() + duration * 1000;
          let moves = 0;
          while (performance.now() < until) {
            const at = (moves * 11) % Math.max(1, area.value.length - 4);
            area.setSelectionRange(at, at + (moves % 3));
            moves++;
            await new Promise((done) => setTimeout(done, 60));
          }
          return moves;
        }, seconds);
      for (const round of [1, 2, 3]) {
        const moving = moveCaret(3.2);
        await ana.waitForTimeout(300 + round * 70);
        assert.equal(await cutRoom(t.me, project.id, { sub: ben.sub }), 1, "Ben's socket was cut");
        await listsNobody(ana, "the room told Ana that Ben's socket was closed");

        // The page finds out in the end, reconnects, and the two see each other again.
        await connectionLeaves(bens, "connected", "saving");
        assert.ok((await moving) > 30, "the caret moved all the while");
        await connected(bens, "Ben to reconnect");
        await listsLabels(ana, [label("Ben")], "Ben is back for Ana");
      }
      await listsLabels(bens, [label("Ana")], "Ana is back for Ben");
    },
  },

  {
    name: "collaboration: a person who closes the page, or the whole browser, disappears from the others' header at once, the room telling them, and is back when they open the project again",
    signedIn: "u-ana-leave",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, ben, device, project } = await pairIn(t, "flow", "u-ben-leave");
      const cy = await t.person("u-cy-leave", { name: "Cy" });
      await addMember(t.me, project.id, cy, "editor");
      const cys = await t.device({ as: cy });
      await openByLink(cys.page, t.origin, project.id);
      const zed = await t.person("u-zed-leave", { name: "Zed" });
      await addMember(t.me, project.id, zed, "viewer");
      const listener = await Listener.join(t.origin, project.id, zed);
      const label = (name: string) => `${name}, in ${OVERVIEW}`;
      await listsLabels(ana, [label("Ben"), label("Cy")], "Ben and Cy are here");
      await listener.hereAre([t.me.sub, ben.sub, cy.sub], "the room names all three");

      // Ben closes his page: a clean close, which the room hears and passes on.
      let began = Date.now();
      await bens.close();
      await listsLabels(ana, [label("Cy")], "Ben closed his page");
      const page = Date.now() - began;
      await listener.hereAre([t.me.sub, cy.sub], "the room told its listener that Ben left");
      // Cy closes the whole browser: the sockets are torn down with it.
      began = Date.now();
      await cys.context.close();
      await listsNobody(ana, "Cy closed the browser");
      const browser = Date.now() - began;
      await listener.hereAre([t.me.sub], "the room told its listener that Cy left");
      console.log(
        `    gone from the header: ${page} ms after a page was closed, ${browser} ms after a browser was`,
      );
      assert.ok(page < 5000, `a closed page is gone at once, not after ${page} ms`);
      assert.ok(browser < 8000, `a closed browser is gone at once, not after ${browser} ms`);

      // Ben opens the project again in a new window of his browser: he is back.
      const again = await device.context.newPage();
      await openByLink(again, t.origin, project.id);
      await listsLabels(ana, [label("Ben")], "Ben opened the project again");
      await listsLabels(again, [label("Ana")], "Ben sees Ana");
      listener.close();
    },
  },

  {
    name: "collaboration: a person who falls silent without leaving disappears after thirty seconds, a client of the room and a page that stops reaching it alike, while one who only keeps still stays (the heartbeat), and the silent one's next message brings them back",
    signedIn: "u-ana-silent",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, ben, project } = await pairIn(t, "flow", "u-ben-silent");
      const sam = await t.person("u-sam-silent", { name: "Sam" });
      await addMember(t.me, project.id, sam, "editor");
      const cy = await t.person("u-cy-silent", { name: "Cy" });
      await addMember(t.me, project.id, cy, "editor");
      const zed = await t.person("u-zed-silent", { name: "Zed" });
      await addMember(t.me, project.id, zed, "viewer");
      const listener = await Listener.join(t.origin, project.id, zed);
      const label = (name: string) => `${name}, in ${OVERVIEW}`;

      // Cy is a page whose browser stops reaching the room (a laptop shut, a network gone) without
      // closing anything: its sockets stay open and its page goes on sending, into the void.
      const cys = await t.device({ as: cy });
      const hush = await muteRooms(cys.context);
      await openByLink(cys.page, t.origin, project.id);
      await listsLabels(ana, [label("Ben"), label("Cy")], "Cy is here");
      // Its last message: a selection, which Ana's pane draws, so that the room has it for sure.
      await selectText(cys.page, "api", 3);
      await until(
        ana,
        "Cy's selection in Ana's pane",
        () => document.querySelector(".code-presence .presence-band") !== null,
      );
      hush.mute();
      const hushed = Date.now();

      // Sam is a client of the room that is not a page: it says where it is once and then nothing.
      const silent = await joinRoom(t.origin, project.id, sam);
      const fileId = fileIdOf(silent.doc);
      const speak = (): void => silent.client.send(KIND.awareness, stateOf({ file: fileId }));
      speak();
      const spoke = Date.now();
      await listsLabels(ana, [label("Ben"), label("Cy"), label("Sam")], "Sam said where he is");
      await listener.hereAre([t.me.sub, ben.sub, cy.sub, sam.sub], "the room relayed Sam's state");
      const benId = [...listener.here()].find(([, peer]) => peer.user.sub === ben.sub)?.[0];
      assert.ok(benId);
      const heardFromBen = () =>
        listener.messages().filter((message) => message[benId] !== undefined).length;
      const before = heardFromBen();

      // Twenty-five seconds on: Cy and Sam have said nothing, and are still listed, as Ben is.
      await ana.waitForTimeout(Math.max(0, 25_000 - (Date.now() - hushed)));
      await listsLabels(
        ana,
        [label("Ben"), label("Cy"), label("Sam")],
        "25 seconds after their last messages",
      );

      // Thirty seconds after their messages the room's alarm drops them and tells the others; Ben,
      // who did nothing either, was never dropped because his page sent its state again.
      await listsLabels(ana, [label("Ben")], "Cy and Sam were silent for thirty seconds");
      const cySilentFor = Date.now() - hushed;
      const samSilentFor = Date.now() - spoke;
      await listener.hereAre([t.me.sub, ben.sub], "the room told its listener that they are gone");
      console.log(
        `    a page that stopped reaching the room was dropped ${(cySilentFor / 1000).toFixed(1)} s after its last message ` +
          `(${hush.swallowed} of its messages swallowed since), a client of the room ${(samSilentFor / 1000).toFixed(1)} s; ` +
          `Ben's page sent its state ${heardFromBen() - before} times meanwhile`,
      );
      for (const silentFor of [cySilentFor, samSilentFor]) {
        assert.ok(silentFor >= 29_000, `not dropped before thirty seconds (${silentFor} ms)`);
        assert.ok(silentFor <= 36_000, `dropped when the alarm fires (${silentFor} ms)`);
      }
      // Ben stays listed past the thirty seconds after his own last message because his page sent its
      // state again (every fifteen seconds); how many times is told above.
      assert.ok(heardFromBen() - before >= 1, "Ben's page sent its state again");
      assert.ok(hush.swallowed >= 1, "Cy's page did send its state again, into the void");
      assert.equal(
        silent.client.closed,
        undefined,
        "Sam's socket was not closed, only his state dropped",
      );
      assert.equal(await connection(cys.page), "connected", "Cy's socket was not closed either");
      assert.deepEqual(
        (await drawn(ana)).filter((peer) => peer.name === "Cy"),
        [],
        "Cy's selection is gone from Ana's pane",
      );

      // The next message of each brings them back.
      hush.unmute();
      await selectText(cys.page, "Database", 4);
      await listsLabels(ana, [label("Ben"), label("Cy")], "Cy moved again");
      await until(
        ana,
        "Cy's selection in Ana's pane again",
        () => document.querySelector(".code-presence .presence-band") !== null,
      );
      assert.deepEqual(
        (await drawn(ana)).filter((peer) => peer.name === "Cy").map((peer) => peer.covers),
        ["Data"],
      );
      speak();
      await listsLabels(ana, [label("Ben"), label("Cy"), label("Sam")], "Sam spoke again");
      silent.client.close();
      await listsLabels(ana, [label("Ben"), label("Cy")], "Sam left");
      listener.close();
    },
  },

  {
    name: "collaboration: a room that holds as many people as it may turns the next one away and says so: a person with the project kept in the browser sees Room full with Try again and joins once there is room, one who never opened it is told at once",
    signedIn: "u-ana-full",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, project } = await pairIn(t, "flow", "u-ben-full");
      const label = (name: string) => `${name}, in ${OVERVIEW}`;
      // Eva has the project open once, so that her browser keeps a copy, and goes away again.
      const eva = await t.person("u-eva-full", { name: "Eva" });
      const fay = await t.person("u-fay-full", { name: "Fay" });
      for (const person of [eva, fay]) await addMember(t.me, project.id, person, "editor");
      const evas = await t.device({ as: eva });
      await openByLink(evas.page, t.origin, project.id);
      await listsLabels(ana, [label("Ben"), label("Eva")], "Eva is here");
      await evas.page.close();
      await listsLabels(ana, [label("Ben")], "Eva left");

      // The room admits two people from now on (twenty is the real limit): Ana and Ben fill it.
      assert.equal(await limitRoom(t.me, project.id, 2), 2);

      // Fay has never opened the project here: the page says at once that the room is full and what
      // to do, and no project opens.
      const fays = await t.device({ as: fay });
      let began = Date.now();
      await fays.page.goto(`${t.origin}/p/${project.id}`);
      await until(fays.page, "Fay to be told the room is full", () =>
        (document.querySelector(".status-text")?.textContent ?? "").includes("room is full"),
      );
      console.log(
        `    a person with no copy was told the room is full after ${Date.now() - began} ms`,
      );
      assert.equal(
        await statusLine(fays.page),
        "This project's room is full: 20 people are in it already. Open the project again in a moment to join.",
      );
      assert.equal(
        await fays.page.locator(".cloud-status").isVisible(),
        false,
        "no project is open",
      );

      // Eva has a copy: the project opens from it, and the connection says the room is full, with a
      // button. The room tells a refused socket why at once (kind 4) and closes it, and that close
      // reaches a browser about two seconds later: `refusedAgain` is the moment the second refusal
      // is said, with its socket still open.
      const again = await evas.context.newPage();
      let refusals = 0;
      const refusedAgain = new Promise<void>((resolve) => {
        again.on("websocket", (socket) =>
          socket.on("framereceived", (frame) => {
            if (String(frame.payload).includes("room.full") && ++refusals === 2) resolve();
          }),
        );
      });
      began = Date.now();
      await again.goto(`${t.origin}/p/${project.id}`);
      await until(
        again,
        "the connection to say Room full",
        () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "full",
      );
      console.log(`    a person with a copy saw "Room full" after ${Date.now() - began} ms`);
      assert.equal(
        await again.locator(".cloud-status-text").innerText(),
        "Room full: 20 people are in this project. Trying again…",
      );
      assert.equal(await again.locator(".cloud-retry").innerText(), "Try again");
      assert.equal(await connection(again), "full");
      // She is in nobody's header, and sees nobody.
      await listsLabels(ana, [label("Ben")], "Eva is not in the room");
      await listsNobody(again, "a page the room turned away has no peers");
      assert.deepEqual(await drawn(again), []);

      // The page keeps trying by itself, a little later each time. At the moment the room has refused
      // it twice the limit goes back to what it was, and "Try again" joins at once: it does not wait
      // for the close of the refused socket nor for the wait the page set itself.
      await refusedAgain;
      assert.equal(await limitRoom(t.me, project.id), 20);
      const sockets = evas.seen.sockets.length;
      const clicked = Date.now();
      await again.locator(".cloud-retry").click();
      await waitFor("a new socket after Try again", () => evas.seen.sockets.length > sockets, 5000);
      const opened = Date.now() - clicked;
      await connected(again, "Eva to be let in after Try again");
      const joined = Date.now() - clicked;
      console.log(
        `    Try again opened a socket after ${opened} ms and let her in after ${joined} ms`,
      );
      assert.ok(joined < 1500, `Try again lets her in at once, not after ${joined} ms`);
      assert.equal(
        await again.locator(".cloud-retry").count(),
        0,
        "the button goes once she is in",
      );
      await listsLabels(ana, [label("Ben"), label("Eva")], "Eva joined");
      await listsLabels(again, [label("Ana"), label("Ben")], "Eva sees who is here");
    },
  },

  {
    name: "collaboration: viewers, by membership and by the link, see presence and are seen, and cannot write: their selection is drawn for the others, and what they type or drag changes nothing in the room",
    signedIn: "u-ana-viewers",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin } = t;
      const bea = await t.person("u-bea-viewers", { name: "Bea" });
      const cy = await t.person("u-cy-viewers", { name: "Cy" });
      const project = await makeProject(t.me, "Looked at", { template: "free" });
      await addMember(t.me, project.id, bea, "viewer");
      await setLinkLevel(t.me, project.id, "view");
      const label = (name: string) => `${name}, in ${SLIDE}`;
      const ana = t.page;
      await openByLink(ana, origin, project.id);
      // Bea is a viewer by name, Cy by the link: both live and read only, as a viewer's page is.
      const viewers: Record<string, Page> = {};
      for (const [name, person] of [
        ["Bea", bea],
        ["Cy", cy],
      ] as const) {
        const device = await t.device({ as: person });
        await device.page.goto(`${origin}/p/${project.id}`);
        await ready(device.page);
        await connected(device.page);
        await viewingIs(device.page, "live");
        assert.equal(await readOnly(device.page), true, `${name}'s page edits nothing`);
        viewers[name] = device.page;
      }
      const [beas, cys] = [viewers["Bea"]!, viewers["Cy"]!];
      const awarenessBefore = (await roomStats(t.me, project.id)).awareness;

      // Everybody sees everybody, the viewers included.
      await listsLabels(ana, [label("Bea"), label("Cy")], "Ana sees both viewers");
      await listsLabels(beas, [label("Ana"), label("Cy")], "Bea sees Ana and Cy");
      await listsLabels(cys, [label("Ana"), label("Bea")], "Cy sees Ana and Bea");

      // A viewer's selection in the pane and on the canvas is drawn for the others, with the name.
      assert.equal(await selectText(beas, "browser", 7), "browser");
      await until(
        ana,
        "Bea's selection in Ana's pane",
        () => document.querySelector(".code-presence .presence-band") !== null,
      );
      // (Cy is drawn too: a viewer's caret is a bar like anybody's, at the start of the file.)
      assert.deepEqual(
        (await drawn(ana))
          .filter((peer) => peer.name === "Bea")
          .map(({ name, covers }) => ({ name, covers })),
        [{ name: "Bea", covers: "browser" }],
      );
      await clickElement(cys, "api");
      await outlines(ana, ["api"], "Cy selected api");
      assert.deepEqual(
        (await canvasMarks(ana)).tags.map((tag) => tag.text),
        ["Cy"],
      );
      // Ana's selection on the viewers' canvases.
      await clickElement(ana, "db");
      await outlines(beas, ["api", "db"], "Bea sees Ana's and Cy's selections");
      assert.deepEqual((await canvasMarks(beas)).tags.map((tag) => tag.text).sort(), ["Ana", "Cy"]);

      // What a viewer types or drags changes nothing: the page refuses, and the room stays as it was.
      const held = await readRoom(t.me, project.id);
      const shown = await code(beas);
      await beas.locator(".code-input").click();
      await beas.keyboard.press("Control+End");
      await beas.keyboard.type("bea typed this", { delay: 5 });
      await cys.locator(".code-input").click();
      await cys.keyboard.press("Control+Home");
      await cys.keyboard.type("cy typed this", { delay: 5 });
      await slowDrag(beas, "browser", 60, 20, 300);
      await beas.waitForTimeout(600);
      assert.equal(await code(beas), shown, "Bea's pane is as it was");
      assert.equal(await code(cys), shown, "Cy's pane is as it was");
      assert.deepEqual(
        await readRoom(t.me, project.id),
        held,
        "the room: the same files, the same revision",
      );
      // Their carets moved all the same: what they do is told to the others.
      assert.ok((await roomStats(t.me, project.id)).awareness > awarenessBefore, "viewers publish");
      assert.equal(await connection(beas), "connected");

      // An editor's change reaches the viewers, who go on being listed.
      await typeAtEnd(ana, "\n// from Ana");
      await until(beas, "Ana's line in Bea's pane", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.endsWith(
          "// from Ana",
        ),
      );
      await listsLabels(ana, [label("Bea"), label("Cy")], "viewers still listed");
    },
  },

  {
    name: "collaboration: presence is never saved or exported: a browser that opens after the others left sees nobody, the SVG export is the same with and without others, and nothing of it is in the room's files, a version, IndexedDB or localStorage",
    signedIn: "u-ana-never",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const name = "Quincy Zanzibar";
      const { ana, bens, ben, device, project } = await pairIn(t, "flow", "u-qz-never", name);
      const label = `${name}, in ${OVERVIEW}`;
      await listsLabels(ana, [label], "Ana sees Quincy");
      const needles = [name, "Zanzibar", ben.sub];

      // Quincy selects a word and an element: everything presence has to show is on Ana's page.
      await selectText(bens, 'api["API"]', 3);
      await clickElement(bens, "api");
      await outlines(ana, ["api"], "Quincy selected api");
      assert.ok((await paneMarks(ana)).bands >= 1);
      assert.equal((await canvasMarks(ana)).tags[0]?.text, name);

      // The export of the diagram carries none of it, and is the one made without anybody else.
      const withPeers = await exportSvg(ana);
      assert.ok(withPeers.startsWith("<svg"), "an SVG");
      for (const needle of [...needles, "presence", "Quincy"]) {
        assert.ok(!withPeers.includes(needle), `the SVG holds no ${needle}`);
      }

      // Awareness is never written to the room's storage: a few seconds of carets moving cost it
      // messages and no write at all.
      const before = await roomStats(t.me, project.id);
      await bens.locator(".code-input").evaluate(async (area: HTMLTextAreaElement) => {
        area.focus();
        for (let step = 0; step < 14; step++) {
          area.setSelectionRange(step * 3, step * 3 + 2);
          await new Promise((done) => setTimeout(done, 280));
        }
      });
      const after = await roomStats(t.me, project.id);
      console.log(
        `    ${after.awareness - before.awareness} awareness messages, ${after.storageWrites - before.storageWrites} storage writes`,
      );
      assert.ok(after.awareness - before.awareness >= 5, "the carets were told to the room");
      assert.equal(after.storageWrites, before.storageWrites, "no write to the room's storage");
      assert.equal(after.revision, before.revision, "no revision");
      assert.equal(after.materialisations, before.materialisations);

      // Nothing of it is in the room's files, in a version of the project, or in this browser.
      const files = JSON.stringify(await readRoom(t.me, project.id));
      const version = await t.me.api("POST", `/api/projects/${project.id}/versions`, {
        label: "check",
      });
      assert.equal(version.status, 201, version.text);
      const made = await t.me.api(
        "GET",
        `/api/projects/${project.id}/versions/${version.json()["number"]}`,
      );
      for (const needle of needles) {
        assert.ok(!files.includes(needle), `the room's files hold no ${needle}`);
        assert.ok(!made.text.includes(needle), `the version holds no ${needle}`);
      }
      for (const [who, page, absent] of [
        ["Ana", ana, needles],
        ["Quincy", bens, [t.me.sub]],
      ] as const) {
        const kept = await stored(page);
        assert.ok(kept.includes("Handles requests"), `${who}'s browser keeps the project`);
        for (const needle of absent) {
          assert.ok(!kept.includes(needle), `${who}'s browser keeps no ${needle}`);
        }
      }

      // Quincy leaves: Ana sees nobody, and the export is the same as with him.
      await device.page.close();
      await listsNobody(ana, "Quincy left");
      assert.equal((await canvasMarks(ana)).outlines.length, 0);
      assert.equal(
        await exportSvg(ana),
        withPeers,
        "the same SVG with and without the other person",
      );

      // A browser that opens after everybody left sees nobody.
      await ana.close();
      await waitFor(
        "the room to hold nobody",
        async () => (await roomStats(t.me, project.id)).clients === 0,
      );
      const later = await t.device();
      await openByLink(later.page, t.origin, project.id);
      assert.equal(await peerCount(later.page), 0, "no peer");
      assert.deepEqual(await listed(later.page), []);
      assert.equal(await later.page.locator(".presence-bar").isVisible(), false);
      assert.equal((await paneMarks(later.page)).peers, 0);
      assert.equal((await canvasMarks(later.page)).outlines.length, 0);
    },
  },

  {
    name: "collaboration: two people moving their carets for ten seconds cost the room a bounded number of messages: the page sends at most four states a second each, none is dropped and nobody is closed",
    signedIn: "u-ana-traffic",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, project } = await pairIn(t, "flow", "u-ben-traffic");
      const label = (name: string) => `${name}, in ${OVERVIEW}`;
      await listsLabels(ana, [label("Ben")], "Ana sees Ben");
      await listsLabels(bens, [label("Ana")], "Ben sees Ana");
      await ana.waitForTimeout(1500);
      const before = await roomStats(t.me, project.id);
      const sockets = t.seen.sockets.length;

      // Both move the caret every 40 ms, far more than the page tells the room, for ten seconds.
      const SECONDS = 10;
      const moving = (page: Page): Promise<number> =>
        page.locator(".code-input").evaluate(async (area: HTMLTextAreaElement, seconds) => {
          area.focus();
          let moves = 0;
          const until = performance.now() + seconds * 1000;
          while (performance.now() < until) {
            const at = (moves * 7) % Math.max(1, area.value.length - 5);
            area.setSelectionRange(at, at + (moves % 3));
            moves++;
            await new Promise((done) => setTimeout(done, 40));
          }
          return moves;
        }, SECONDS);
      const [anaMoves, benMoves] = await Promise.all([moving(ana), moving(bens)]);
      await ana.waitForTimeout(500);
      const after = await roomStats(t.me, project.id);
      const messages = after.messages - before.messages;
      const awareness = after.awareness - before.awareness;
      console.log(
        `    ${anaMoves + benMoves} caret moves in ${SECONDS} s cost the room ${messages} messages, ${awareness} of them awareness ` +
          `(${(awareness / 2 / SECONDS).toFixed(1)} a second for each person), ${after.awarenessDropped - before.awarenessDropped} dropped`,
      );
      // At most four a second each (the 250 ms throttle), the first state of each and a heartbeat that
      // may fall inside the ten seconds, and a margin of four: 88 messages for two people in ten
      // seconds, which is 8.8 a second for the room. Measured with both moving the caret every 40 ms
      // (about 430 moves): 80 to 82 messages (4.0 to 4.1 a second for each person), none dropped by
      // the room's rate of 20 a second, nobody closed. Four a second each is what the design assumes
      // (a full room of twenty: 80 incoming messages a second at most, 4 requests a second at the
      // platform's 20:1 rate).
      const bound = 2 * (4 * SECONDS + 2) + 4;
      assert.ok(anaMoves > 100 && benMoves > 100, "both moved the caret often");
      assert.ok(
        awareness >= 2 * 2 * SECONDS,
        `${awareness} awareness messages: the moves were told to the room`,
      );
      assert.ok(awareness <= bound, `${awareness} awareness messages, expected at most ${bound}`);
      assert.equal(messages, awareness, "nothing but awareness reached the room");
      assert.equal(
        after.awarenessDropped,
        before.awarenessDropped,
        "none was dropped by the room's rate",
      );
      assert.equal(after.clients, before.clients, "nobody was closed");
      assert.equal(after.storageWrites, before.storageWrites);
      assert.equal(sockets, t.seen.sockets.length, "no socket was reopened");
      // And they saw each other all the while.
      await listsLabels(ana, [label("Ben")], "Ben is still here");
      await listsLabels(bens, [label("Ana")], "Ana is still here");
    },
  },

  {
    name: "collaboration: in the real runtime the room relays a client's state as that client whatever it claims, closes a client whose state is over 16 KiB with 4413, drops what a client sends beyond 20 a second and closes a flood with 4429",
    signedIn: "u-ana-rules",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Rules", { template: "flow" });
      const ana = t.page;
      await openByLink(ana, origin, project.id);
      const people: Record<string, Person> = {};
      for (const [sub, name, role] of [
        ["u-mal-rules", "Mallory", "editor"],
        ["u-pia-rules", "Pia", "editor"],
        ["u-fin-rules", "Fin", "editor"],
        ["u-zed-rules", "Zed", "viewer"],
      ] as const) {
        people[name] = await t.person(sub, { name });
        await addMember(t.me, project.id, people[name]!, role);
      }
      const listener = await Listener.join(origin, project.id, people["Zed"]!);
      const encode = (value: unknown): Uint8Array =>
        new TextEncoder().encode(JSON.stringify(value));

      // A state that claims to be Ana's, with a colour and a picture of its own: the room relays it
      // as Mallory's, with Mallory's identity and colour, and nothing else a client invented.
      const mallory = await joinRoom(origin, project.id, people["Mallory"]!);
      mallory.client.send(
        KIND.awareness,
        encode({
          mine: {
            file: fileIdOf(mallory.doc),
            user: {
              sub: t.me.sub,
              name: "Ana",
              picture: "https://evil.example/ana.png",
              colour: "#000000",
            },
            name: "Ana",
            colour: "#000000",
          },
        }),
      );
      await listsLabels(
        ana,
        [`Mallory, in ${OVERVIEW}`],
        "Ana's page lists Mallory, and Mallory only",
      );
      await listener.client.until(
        "the room to relay Mallory's state",
        () => listener.of(people["Mallory"]!.sub) !== undefined,
      );
      const relayed = listener.of(people["Mallory"]!.sub)!;
      assert.deepEqual(
        Object.keys(relayed).sort(),
        ["file", "user"],
        "only the parts of a state are relayed",
      );
      assert.deepEqual(Object.keys(relayed.user).sort(), [
        "colour",
        "guest",
        "name",
        "picture",
        "sub",
      ]);
      assert.equal(relayed.user.sub, people["Mallory"]!.sub);
      assert.equal(relayed.user.name, "Mallory");
      assert.equal(relayed.user.guest, false, "an account is no guest, whatever it claims");
      assert.equal(relayed.user.picture, `${origin}/favicon.svg`, "the picture the Worker passed");
      assert.notEqual(relayed.user.colour, "#000000");
      assert.match(relayed.user.colour, /^#[0-9a-f]{6}$/);
      assert.ok(
        [...listener.here().values()].every(
          (peer) => peer.user.name !== "Ana" || peer.user.sub === t.me.sub,
        ),
        "nobody else is called Ana",
      );
      assert.equal((await listed(ana))[0]?.picture, `${origin}/favicon.svg`);

      // A canvas selection that names an element the drawing lacks beside one it has: Ana's canvas
      // outlines the one it has, with Mallory's name, and raises no error for the other (the suite
      // fails on any error the page logs).
      mallory.client.send(
        KIND.awareness,
        encode({
          mine: {
            file: fileIdOf(mallory.doc),
            canvas: { selection: ["no-such-element", "api"] },
          },
        }),
      );
      await outlines(ana, ["api"], "Mallory selected an element that exists and one that does not");
      const outlined = await canvasMarks(ana);
      assert.deepEqual(
        outlined.tags.map((tag) => tag.text),
        ["Mallory"],
      );
      assert.equal(outlined.nested, 0);

      // A state over 16 KiB closes the client that sent it, and the others hear nothing of it.
      const pia = await joinRoom(origin, project.id, people["Pia"]!);
      const piaId = (pia.client.json(KIND.hello)["you"] as { id: string }).id;
      const heard = listener.messages().length;
      pia.client.send(KIND.awareness, encode({ x: { file: "a".repeat(20 * 1024) } }));
      await pia.client.until("Pia to be closed", () => pia.client.closed !== undefined);
      assert.equal(pia.client.closed?.code, 4413);
      assert.deepEqual(pia.client.json(KIND.error), { code: "message.too-large" });
      assert.equal(
        listener
          .messages()
          .slice(heard)
          .filter((message) => piaId in message).length,
        0,
        "the others heard nothing from a client closed for its size",
      );

      // A flood: 50 states in one second are relayed up to 20; 150 in the next close the client.
      const fin = await joinRoom(origin, project.id, people["Fin"]!);
      const finId = (fin.client.json(KIND.hello)["you"] as { id: string }).id;
      const file = fileIdOf(fin.doc);
      const send = (count: number, round: string): void => {
        for (let index = 0; index < count; index++) {
          fin.client.send(
            KIND.awareness,
            encode({ x: { file, canvas: { selection: [`${round}${index}`] } } }),
          );
        }
      };
      const relayedFrom = (id: string): number =>
        listener.messages().filter((message) => message[id] !== undefined && message[id] !== null)
          .length;
      const before = await roomStats(t.me, project.id);
      send(50, "first");
      await listener.client.until("the first relays", () => relayedFrom(finId) >= 20);
      await ana.waitForTimeout(400);
      const first = relayedFrom(finId);
      const mid = await roomStats(t.me, project.id);
      console.log(
        `    50 states in a burst: ${first} relayed, ${mid.awarenessDropped - before.awarenessDropped} dropped`,
      );
      assert.ok(first >= 10 && first <= 20, `${first} of 50 relayed, at most 20`);
      assert.equal(
        mid.awarenessDropped - before.awarenessDropped,
        50 - first,
        "the others were counted as dropped",
      );
      const closure = () => fin.client.closed;
      assert.equal(closure(), undefined, "a burst of 50 does not close the client");
      await ana.waitForTimeout(1100);
      send(150, "second");
      await fin.client.until(
        "Fin to be closed for the flood",
        () => fin.client.closed !== undefined,
      );
      assert.equal(closure()?.code, 4429);
      assert.deepEqual(fin.client.json(KIND.error), { code: "awareness.rate" });
      assert.ok(relayedFrom(finId) <= first + 20, `${relayedFrom(finId)} relayed in all`);
      // The others are told he is gone, and Ana's page lists Mallory only.
      await listener.client.until(
        "Fin to be gone for the listener",
        () => ![...listener.here().keys()].includes(finId),
      );
      await listsLabels(ana, [`Mallory, in ${OVERVIEW}`], "Fin is not listed");
      mallory.client.close();
      listener.close();
    },
  },
];
