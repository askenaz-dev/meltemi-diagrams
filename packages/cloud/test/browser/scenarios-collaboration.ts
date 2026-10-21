/**
 * The scenarios of live collaboration, two browsers in one room, about what people see and do together:
 * who is here and where (the header, the pane, the canvas), a name that looks like markup, typing in
 * the same line, a drag and a keystroke, a change the room refuses, and the explorer of one person
 * while the other adds a diagram. Each scenario has persons of
 * its own; Ana is the owner and the first browser, Ben (an editor) the second. The connection, the
 * room's rules, viewers and what presence is never are in `scenarios-collaboration-room.ts`; what they
 * share is in `collaboration.ts`.
 */
import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import {
  MANIFEST,
  OVERVIEW,
  Listener,
  canvasMarks,
  clickElement,
  clickNothing,
  drawn,
  listed,
  listsLabels,
  outlines,
  paneMarks,
  rgb,
  selectText,
  selectedIs,
  selectedOnCanvas,
  pairIn,
  slowDrag,
  SLIDE,
} from "./collaboration.js";
import {
  NOTES,
  THUMBNAIL_RATE_LOGGED,
  caretAt,
  code,
  codeIs,
  connected,
  connection,
  dragElement,
  elementBox,
  makeProject,
  openByLink,
  readRoom,
  roomHolds,
  statusLine,
  studioState,
  textOf,
  typeAtEnd,
  undo,
  waitFor,
} from "./cloud.js";
import type { Scenario } from "./scenario.js";
import { TEXT_LIMIT, fillerText } from "./scenarios-limits.js";
import { KIND } from "./room-socket.js";
import { addMember } from "./sharing.js";
import { analysed, expectOpen, openFile, until } from "./support.js";

export const collaborationScenarios: Scenario[] = [
  {
    name: "collaboration: two people in one project see each other: the header lists them with their colour and file, the pane draws the other's selection with a name flag that fades, and the canvas outlines what the other selected with a name tag",
    signedIn: "u-ana-here",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin } = t;
      const ben = await t.person("u-ben-here", { name: "Ben" });
      const zed = await t.person("u-zed-here", { name: "Zed" });
      const project = await makeProject(t.me, "Together", { template: "flow" });
      await addMember(t.me, project.id, ben, "editor");
      await addMember(t.me, project.id, zed, "viewer");
      const second = await t.device({ as: ben });
      const ana = t.page;
      const bens = second.page;
      await openByLink(ana, origin, project.id);
      await openByLink(bens, origin, project.id);

      // The header: each sees the other, and not themselves.
      await listsLabels(ana, [`Ben, in ${OVERVIEW}`], "Ana sees Ben");
      await listsLabels(bens, [`Ana, in ${OVERVIEW}`], "Ben sees Ana");

      // Zed is not a page: a client of the room that listens to what it relays. He comes after both
      // have published, and the room tells him about the two of them in one message before it sends
      // him any update.
      const listener = await Listener.join(origin, project.id, zed);
      const kinds = listener.client.frames.map((frame) => frame.kind);
      assert.ok(
        kinds.indexOf(KIND.awareness) >= 0 &&
          kinds.indexOf(KIND.awareness) < kinds.indexOf(KIND.update),
        `the states come before the first update (kinds ${kinds.join(", ")})`,
      );
      assert.deepEqual(
        Object.values(listener.messages()[0] ?? {})
          .map((peer) => peer?.user.sub)
          .sort(),
        [t.me.sub, ben.sub].sort(),
        "both states in the first message",
      );
      await listener.hereAre([t.me.sub, ben.sub], "both published their state");

      // The colour is the room's: what it attaches to each person's messages is what the header,
      // the flags and the tags draw, for the same person on every page.
      const anaColour = listener.of(t.me.sub)?.user.colour ?? "";
      const benColour = listener.of(ben.sub)?.user.colour ?? "";
      assert.match(anaColour, /^#[0-9a-f]{6}$/);
      assert.match(benColour, /^#[0-9a-f]{6}$/);
      const [seenBen] = await listed(ana);
      assert.deepEqual(
        { ...seenBen, picture: undefined },
        {
          label: `Ben, in ${OVERVIEW}`,
          name: "Ben",
          file: "overview.meltemi",
          colour: benColour,
          border: rgb(benColour),
          picture: undefined,
        },
      );
      assert.equal(
        seenBen?.picture,
        `${origin}/favicon.svg`,
        "the avatar from the Worker's origin",
      );
      const [seenAna] = await listed(bens);
      assert.equal(seenAna?.colour, anaColour);
      assert.equal(seenAna?.border, rgb(anaColour));
      assert.equal(listener.of(ben.sub)?.user.name, "Ben");
      assert.equal(listener.of(t.me.sub)?.user.name, "Ana");

      // Ben selects a word in the code: Ana's pane draws it in his colour with his name.
      const word = await selectText(bens, 'api["API"]', 3);
      assert.equal(word, "api");
      await until(
        ana,
        "Ben's selection in Ana's pane",
        () => document.querySelector(".code-presence .presence-band") !== null,
      );
      assert.deepEqual(
        (await drawn(ana)).map(({ name, covers }) => ({ name, covers })),
        [{ name: "Ben", covers: "api" }],
      );
      const marks = await paneMarks(ana);
      assert.equal(marks.peers, 1);
      assert.ok(marks.bands >= 1, "a band over the word");
      assert.deepEqual(
        marks.flags.map(({ text, background, faded }) => ({ text, background, faded })),
        [{ text: "Ben", background: rgb(benColour), faded: false }],
      );
      // The band lies over the word: inside the pane, as wide as three characters at least.
      const input = await ana.locator(".code-input").boundingBox();
      const band = await ana.locator(".code-presence .presence-band").first().boundingBox();
      assert.ok(input && band, "the pane and the band are drawn");
      assert.ok(
        band.x >= input.x && band.y >= input.y && band.width >= 12 && band.height > 8,
        "the band is over the text",
      );
      assert.equal(
        await ana
          .locator(".code-presence")
          .evaluate((layer) => getComputedStyle(layer).pointerEvents),
        "none",
        "the layer never takes the pointer",
      );
      // The flag fades after two seconds of stillness and returns when the selection moves.
      await until(ana, "the name flag to fade", () => {
        const flag = document.querySelector(".code-presence .presence-flag");
        return flag !== null && getComputedStyle(flag).opacity === "0";
      });
      await selectText(bens, "Database", 4);
      await until(ana, "the flag to return and the band to follow", () => {
        const flag = document.querySelector(".code-presence .presence-flag");
        return flag !== null && getComputedStyle(flag).opacity === "1";
      });
      assert.deepEqual(
        (await drawn(ana)).map((peer) => peer.covers),
        ["Data"],
      );

      // The canvas: Ben selects an element, and Ana's canvas outlines it with his name.
      await clickElement(bens, "api");
      await outlines(ana, ["api"], "Ben selected api");
      const outlined = await canvasMarks(ana);
      assert.deepEqual(outlined.outlines, [{ target: "api", stroke: benColour }]);
      assert.deepEqual(outlined.tags, [{ target: "api", text: "Ben", background: rgb(benColour) }]);
      assert.equal(outlined.nested, 0);
      assert.deepEqual(await selectedOnCanvas(ana), [], "Ben's outline is not Ana's selection");
      // Ana clicks the same element: it is hers to select, Ben's outline does not take the click.
      await clickElement(ana, "api");
      await selectedIs(ana, ["api"], "Ana clicked api");
      await outlines(bens, ["api"], "Ana selected api too");
      assert.deepEqual(
        (await canvasMarks(bens)).tags.map((tag) => tag.text),
        ["Ana"],
      );
      assert.deepEqual((await canvasMarks(bens)).outlines, [{ target: "api", stroke: anaColour }]);
      assert.deepEqual((await canvasMarks(ana)).outlines, [{ target: "api", stroke: benColour }]);
      // The room relays the canvas selection as the ids.
      await listener.client.until(
        "the room to relay Ben's canvas selection",
        () => listener.of(ben.sub)?.canvas?.selection?.join() === "api",
      );
      // Ben clicks nowhere: his outline goes from Ana's canvas.
      await clickNothing(bens);
      await outlines(ana, [], "Ben selected nothing");

      // The file each person has open: Ben selects an element and opens the manifest, which takes his
      // outline off Ana's canvas (it is for the file he left), the header says where he is, and a
      // click on him in Ana's header opens that file for her.
      await clickElement(bens, "api");
      await outlines(ana, ["api"], "Ben selected api again");
      await openFile(bens, MANIFEST);
      await outlines(ana, [], "Ben is in another file");
      await listsLabels(ana, [`Ben, in ${MANIFEST}`], "Ben opened the manifest");
      assert.equal((await listed(ana))[0]?.file, MANIFEST);
      assert.deepEqual(await drawn(ana), [], "his caret is in another file, not in Ana's pane");
      await ana.locator(".presence-person").first().click();
      await expectOpen(ana, MANIFEST);
      assert.match(await code(ana), /"name": "flow"/);
      await openFile(bens, OVERVIEW);
      await listsLabels(ana, [`Ben, in ${OVERVIEW}`], "Ben came back");

      listener.close();
    },
  },

  {
    name: "collaboration: a name that looks like markup is shown as its characters in the header, the name flag and the canvas tag, and nothing is created or run from it",
    signedIn: "u-ana-markup",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const hostile = "<img src=x onerror=alert(1)>";
      const escaped = "&lt;img src=x onerror=alert(1)&gt;";
      const { ana, bens, ben, project, device } = await pairIn(t, "flow", "u-mal-markup", hostile);
      const dialogs: string[] = [];
      for (const page of [ana, bens]) {
        page.on("dialog", (dialog) => {
          dialogs.push(dialog.message());
          void dialog.dismiss();
        });
      }
      const zed = await t.person("u-zed-markup", { name: "Zed" });
      await addMember(t.me, project.id, zed, "viewer");
      const listener = await Listener.join(t.origin, project.id, zed);

      // The header: the characters, as text, and the button named with them.
      await listsLabels(ana, [`${hostile}, in ${OVERVIEW}`], "the hostile name in Ana's header");
      assert.equal((await listed(ana))[0]?.name, hostile);
      assert.equal(await ana.locator(".presence-name").innerHTML(), escaped);
      // The room relays the name as the characters it was given.
      await listener.hereAre([t.me.sub, ben.sub], "both are here");
      assert.equal(listener.of(ben.sub)?.user.name, hostile);

      // The name flag in the pane and the tag on the canvas.
      await selectText(bens, 'api["API"]', 3);
      await until(
        ana,
        "the flag in the pane",
        () => document.querySelector(".presence-flag") !== null,
      );
      assert.equal((await paneMarks(ana)).flags[0]?.text, hostile);
      assert.equal(await ana.locator(".presence-flag").first().innerHTML(), escaped);
      await clickElement(bens, "api");
      await outlines(ana, ["api"], "the hostile person selected api");
      const marks = await canvasMarks(ana);
      assert.deepEqual(
        marks.tags.map((tag) => tag.text),
        [hostile],
      );
      assert.equal(await ana.locator("#app .presence-tag").first().innerHTML(), escaped);
      assert.equal(marks.nested, 0, "no element inside a tag or an outline");

      // Nothing was made from it, on either page, and nothing ran.
      for (const page of [ana, bens]) {
        assert.equal(await page.locator('img[src="x"]').count(), 0, "no image from the name");
        assert.equal(
          await page
            .locator(".presence-bar *, .code-presence *, #app .presence *")
            .evaluateAll(
              (nodes) =>
                nodes.filter(
                  (node) =>
                    ![
                      "IMG",
                      "SPAN",
                      "DIV",
                      "svg",
                      "rect",
                      "polyline",
                      "BUTTON",
                      "LI",
                      "UL",
                    ].includes(node.tagName),
                ).length,
            ),
          0,
          "no element of a kind the page does not draw",
        );
      }
      await ana.waitForTimeout(500);
      assert.deepEqual(dialogs, [], "no alert was raised");
      // Ben's own page says his name as text too (the account control).
      assert.equal(
        await device.page.locator(".account-button .account-name").textContent(),
        hostile,
      );
      listener.close();
    },
  },

  {
    name: "collaboration: two people typing in the same line at the same place at once keep every key and end with one text on both pages and in the room, and each person's Ctrl+Z removes their own word only",
    signedIn: "u-ana-line",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, project } = await pairIn(t, "flow", "u-ben-line");
      const original = await code(ana);
      // The end of the first comment line: the same place in both documents.
      const end = original.indexOf("to see it.") + "to see it.".length;
      const prefix = original.slice(0, end);
      const suffix = original.slice(end);
      const anaWord = "KIWI";
      const benWord = "mango";
      const segmentOf = (text: string): string => {
        assert.ok(
          text.startsWith(prefix) && text.endsWith(suffix),
          "the rest of the file is as it was",
        );
        return text.slice(prefix.length, text.length - suffix.length);
      };
      const only = (text: string, own: string): string =>
        [...text].filter((character) => own.includes(character)).join("");
      const everywhere = async (expected: string, what: string): Promise<void> => {
        const room = await roomHolds(
          t.me,
          project.id,
          what,
          (read) => read.files[OVERVIEW] === expected,
        );
        assert.equal(room.files[OVERVIEW], expected);
        await codeIs(ana, expected, `Ana's pane: ${what}`);
        await codeIs(bens, expected, `Ben's pane: ${what}`);
      };
      const together = async (
        type: (page: Page, word: string) => Promise<void>,
      ): Promise<string> => {
        await caretAt(ana, "to see it.", true);
        await caretAt(bens, "to see it.", true);
        await Promise.all([type(ana, anaWord), type(bens, benWord)]);
        // One text, with all the keys of both, on both pages and in the room.
        const room = await roomHolds(t.me, project.id, "both words in the room", (read) => {
          const text = read.files[OVERVIEW] ?? "";
          return (
            text.startsWith(prefix) &&
            text.endsWith(suffix) &&
            only(segmentOf(text), anaWord) === anaWord &&
            only(segmentOf(text), benWord) === benWord
          );
        });
        const merged = room.files[OVERVIEW] ?? "";
        await codeIs(ana, merged, "Ana's pane to show the merged line");
        await codeIs(bens, merged, "Ben's pane to show the merged line");
        assert.equal(segmentOf(merged).length, anaWord.length + benWord.length);
        return merged;
      };
      /** Both people undo, one after the other; each takes their own word and leaves the other's. */
      const undoOneByOne = async (): Promise<void> => {
        await undo(ana);
        await everywhere(prefix + benWord + suffix, "Ana's word undone, Ben's still there");
        await undo(bens);
        await everywhere(original, "Ben's word undone too");
      };

      // Each word pasted at once: the line holds both words whole, in one order or the other.
      const pasted = await together((page, word) => page.keyboard.insertText(word));
      assert.ok(
        [prefix + anaWord + benWord + suffix, prefix + benWord + anaWord + suffix].includes(pasted),
        `both words whole: ${JSON.stringify(segmentOf(pasted))}`,
      );
      await undoOneByOne();

      // The same typed key by key at the same moment, each hearing of the other late: every key is
      // there, each person's in order (the two words may be mixed), and the undo is the same.
      await ana.waitForTimeout(800);
      const typed = await together((page, word) => page.keyboard.type(word, { delay: 35 }));
      assert.equal(only(segmentOf(typed), anaWord), anaWord);
      assert.equal(only(segmentOf(typed), benWord), benWord);
      console.log(
        `    typed key by key at the same place, the line holds ${JSON.stringify(segmentOf(typed))}`,
      );
      await undoOneByOne();
      // Redo brings back a person's own word only.
      await ana.locator(".code-input").focus();
      await ana.keyboard.press("Control+Shift+z");
      await until(
        ana,
        "Ana's word back",
        (word) =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(word),
        anaWord,
      );
      assert.equal(segmentOf(await code(ana)), anaWord);
    },
  },

  {
    name: "collaboration: an element dragged on one canvas while the other person types in the same file: drags and keystrokes taken in turns land and both canvases show the element moved, and when they overlap in time both pages converge on the room's text, with the typed text whole",
    signedIn: "u-ana-drag",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, project } = await pairIn(t, "free", "u-ben-drag");
      const PLACE = /place browser at \((\d+), (\d+)\)/;
      const placeOf = async (page: Page): Promise<[number, number]> => {
        const found = PLACE.exec(await code(page));
        assert.ok(found, "the browser box is placed by hand");
        return [Number(found[1]), Number(found[2])];
      };
      const start = await placeOf(ana);
      const placed = await elementBox(ana, "browser");
      assert.deepEqual(
        await elementBox(bens, "browser"),
        placed,
        "the same drawing on both canvases",
      );
      /** Both canvases draw the element where the room's text says, the same place on both. */
      const canvasesAgree = (label: string): Promise<void> =>
        waitFor(label, async () => {
          const [one, other] = [
            await elementBox(ana, "browser"),
            await elementBox(bens, "browser"),
          ];
          return Math.abs(one.x - other.x) < 1 && Math.abs(one.y - other.y) < 1;
        });

      // In turns: Ben types a line, Ana's page has it and has drawn it, Ana drags the box a little;
      // three times. Every drag lands, and what each did is in the text on both pages and in the room.
      let place = start;
      for (const round of [0, 1, 2]) {
        const line = `\n// Ben, line ${round}`;
        await typeAtEnd(bens, line, 12);
        await until(
          ana,
          `Ben's line ${round} in Ana's pane`,
          (needle) =>
            (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(needle),
          line.trim(),
        );
        await analysed(ana);
        await dragElement(ana, "browser", 40, 20);
        await until(
          ana,
          `the drag ${round} in Ana's text`,
          ([x, y]) =>
            !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
              `place browser at (${x}, ${y})`,
            ),
          place,
        );
        const next = await placeOf(ana);
        assert.ok(
          next[0] > place[0] && next[1] > place[1],
          `moved right and down: ${place} to ${next}`,
        );
        place = next;
      }
      const turns = await roomHolds(t.me, project.id, "three drags and three lines", (read) => {
        const text = read.files[SLIDE] ?? "";
        const found = PLACE.exec(text);
        return (
          found !== null &&
          `${found[1]},${found[2]}` === place.join(",") &&
          [0, 1, 2].every((round) => text.includes(`\n// Ben, line ${round}`))
        );
      });
      await codeIs(ana, turns.files[SLIDE] ?? "", "Ana's pane to show the room's text");
      await codeIs(bens, turns.files[SLIDE] ?? "", "Ben's pane to show the room's text");
      await canvasesAgree("both canvases to show the box moved, in the same place");
      const moved = await elementBox(ana, "browser");
      assert.ok(
        moved.x > placed.x + 20 && moved.y > placed.y + 10,
        "the box was moved on the canvas",
      );

      // At the same time: Ben types for a second and a half while Ana holds the box for one second. A
      // drag is made against the text the canvas drew, so when the other person's keys change the
      // text between that drawing and the release of the button, the page refuses it ("The text
      // changed; the canvas shows it again") and the box stays where it was: the person drags again.
      // Whichever happens, nothing is lost: the text is the same everywhere, Ben's is whole, and
      // both canvases draw what the text says.
      const typed = "\n// typed by Ben while Ana drags";
      const before = await placeOf(ana);
      const typing = typeAtEnd(bens, typed, 45);
      await ana.waitForTimeout(250);
      await slowDrag(ana, "browser", 90, 40, 1000);
      await typing;
      const room = await roomHolds(t.me, project.id, "Ben's text, whole, in the room", (read) =>
        (read.files[SLIDE] ?? "").endsWith(typed),
      );
      const text = room.files[SLIDE] ?? "";
      assert.equal(text.split(typed).length - 1, 1, "Ben's text once");
      await codeIs(ana, text, "Ana's pane to show the room's text");
      await codeIs(bens, text, "Ben's pane to show the room's text");
      const after = await placeOf(ana);
      const landed = after[0] !== before[0] || after[1] !== before[1];
      console.log(
        `    the drag made while the other person typed ${landed ? "landed" : "was refused as stale and has to be made again"}`,
      );
      if (landed) assert.ok(after[0] > before[0] && after[1] > before[1], `${before} to ${after}`);
      await canvasesAgree("both canvases to draw the same place after the overlap");
      // Once Ben has stopped, the drag lands for sure and every page shows it.
      await analysed(ana);
      if (!landed) {
        await dragElement(ana, "browser", 90, 40);
        await until(
          ana,
          "the second drag in Ana's text",
          ([x, y]) =>
            !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
              `place browser at (${x}, ${y})`,
            ),
          after,
        );
      }
      const final = await roomHolds(t.me, project.id, "the last place in the room", (read) => {
        const found = PLACE.exec(read.files[SLIDE] ?? "");
        return found !== null && (found[1] !== String(before[0]) || found[2] !== String(before[1]));
      });
      assert.ok((final.files[SLIDE] ?? "").endsWith(typed));
      await codeIs(ana, final.files[SLIDE] ?? "", "Ana's pane to show the room's text at the end");
      await codeIs(bens, final.files[SLIDE] ?? "", "Ben's pane to show the room's text at the end");
      await canvasesAgree("both canvases to show the last place");
    },
  },

  {
    name: "collaboration: a change the room refuses as too large leaves the other person's document untouched, the person who made it is told the limit and gets the room's text back, and both go on editing and see each other",
    signedIn: "u-ana-refuse",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      // A text three characters short of the limit: six more do not fit.
      const big = fillerText(TEXT_LIMIT - 3);
      const ben = await t.person("u-ben-refuse", { name: "Ben" });
      const project = await makeProject(t.me, "Almost full", {
        files: { "diagrams/a.meltemi": NOTES, "notes.txt": big },
      });
      await addMember(t.me, project.id, ben, "editor");
      const device = await t.device({ as: ben });
      const [ana, bens] = [t.page, device.page];
      await openByLink(ana, t.origin, project.id);
      await openByLink(bens, t.origin, project.id);
      await openFile(ana, "notes.txt");
      await codeIs(ana, big, "the big text in Ana's pane");
      const revision = (await readRoom(t.me, project.id)).revision;
      const sockets = t.seen.sockets.length;
      const labels = { ana: "Ana, in notes.txt", ben: "Ben, in diagrams/a.meltemi" };
      await listsLabels(bens, [labels.ana], "Ben sees Ana in the big file");
      await listsLabels(ana, [labels.ben], "Ana sees Ben in the diagram");

      // Ana types six characters: the room refuses the change, and says so only to her.
      await typeAtEnd(ana, "abcdef");
      await until(ana, "the limit in Ana's status line", () =>
        (document.querySelector(".status-text")?.textContent ?? "").includes("over its size limit"),
      );
      assert.match(
        await statusLine(ana),
        /^The project is over its size limit: 16 MiB in all, and 2 Mi characters in one file\. Your last change was not kept/,
      );
      await codeIs(ana, big, "Ana's text back as the room has it");
      assert.equal(await connection(bens), "connected", "Ben's socket was not touched");
      assert.doesNotMatch(await statusLine(bens), /size limit/);
      assert.equal(await textOf(bens, "notes.txt"), big, "Ben's document is as it was");
      assert.equal((await readRoom(t.me, project.id)).revision, revision, "the room is as it was");

      // Ana's socket reopens by itself and they see each other again.
      await waitFor("a new socket to be opened", () => t.seen.sockets.length > sockets);
      await connected(ana, "Ana's socket to reopen");
      await listsLabels(ana, [labels.ben], "Ben is listed again for Ana");
      await listsLabels(bens, [labels.ana], "Ana is listed again for Ben");

      // Both go on: Ana deletes a character (within the limit), Ben adds a line to the diagram.
      await ana.locator(".code-input").click();
      await ana.keyboard.press("Control+End");
      await ana.keyboard.press("Backspace");
      await typeAtEnd(bens, "\n// Ben after the refusal");
      const room = await roomHolds(
        t.me,
        project.id,
        "Ana's deletion and Ben's line",
        (read) =>
          (read.files["notes.txt"] ?? "").length === TEXT_LIMIT - 4 &&
          (read.files["diagrams/a.meltemi"] ?? "").endsWith("// Ben after the refusal"),
      );
      assert.equal(room.files["notes.txt"], big.slice(0, -1));
      await until(
        bens,
        "Ana's deletion in Ben's document",
        (length) =>
          (
            window as unknown as {
              meltemiPlayground: { studio: { text(path: string): string | undefined } };
            }
          ).meltemiPlayground.studio.text("notes.txt")?.length === length,
        TEXT_LIMIT - 4,
      );
      await until(ana, "Ben's line in Ana's document", () =>
        (
          (
            window as unknown as {
              meltemiPlayground: { studio: { text(path: string): string | undefined } };
            }
          ).meltemiPlayground.studio.text("diagrams/a.meltemi") ?? ""
        ).endsWith("// Ben after the refusal"),
      );
    },
  },

  {
    name: "collaboration: a diagram another person adds appears in the explorer in its place by name, while the row that has the focus keeps it and the open folders stay open",
    signedIn: "u-ana-tree",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { ana, bens, project } = await pairIn(t, "purchase", "u-ben-tree");
      const added = "diagrams/cart.meltemi";
      const payment = "f:diagrams/payment.meltemi";
      const anasFile = (await studioState(ana)).open;
      assert.match(anasFile, /^diagrams\//, "the file the project opens at is in diagrams");

      // Ana opens the folders of the model and the story, then puts the focus on the payment
      // sequence's row, below the place the new diagram takes.
      for (const folder of ["models", "stories"]) {
        const row = ana.locator(`.tree li[data-key="d:${folder}"]`);
        if ((await row.getAttribute("aria-expanded")) === "false") {
          await row.locator(":scope > .tree-row").click();
        }
      }
      await ana.locator(`.tree li[data-key="${payment}"]`).focus();
      const focused = () =>
        ana.evaluate(() => document.activeElement?.getAttribute("data-key") ?? null);
      const expanded = () =>
        ana
          .locator('.tree li[aria-expanded="true"]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-key") ?? "").sort());
      assert.equal(await focused(), payment);
      const open = await expanded();
      for (const key of ["d:diagrams", "d:models", "d:stories"]) {
        assert.ok(open.includes(key), `${key} is open: ${open.join(", ")}`);
      }

      // Ben makes a diagram in that folder from his explorer: New diagram, in the open file's folder.
      await bens.locator(".explorer-bar").getByRole("button", { name: "New diagram…" }).click();
      const dialog = bens.locator("dialog[open]");
      assert.equal(await dialog.locator(".dialog-where").innerText(), "In diagrams");
      await dialog.getByLabel("Name", { exact: true }).fill("cart");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await expectOpen(bens, added);
      const room = await roomHolds(
        t.me,
        project.id,
        "Ben's new diagram in the room",
        (read) => added in read.files,
      );

      // It appears in Ana's tree, in its place by name among the folder's diagrams.
      await ana.locator(`.tree li[data-key="f:${added}"]`).waitFor({ state: "attached" });
      const byName = (a: string, b: string) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      const inFolder = Object.keys(room.files)
        .filter((path) => /^diagrams\/[^/]+\.meltemi$/.test(path))
        .sort(byName)
        .map((path) => `f:${path}`);
      assert.ok(inFolder.includes(`f:${added}`));
      assert.deepEqual(
        await ana
          .locator(
            '.tree li[data-key="d:diagrams"] > .tree-group-wrap > .tree-group > li[data-key]',
          )
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-key"))),
        inFolder,
      );
      // The focus stayed on the row it was on, the open folders are open, and Ana's file is hers.
      assert.equal(await focused(), payment);
      assert.deepEqual(await expanded(), open);
      assert.equal((await studioState(ana)).open, anasFile);
    },
  },
];
