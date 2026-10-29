// What the page adds to an open cloud project for presence (`live-collaboration`, "Presence"):
// the header's list of the people who are here, their carets and selections over the code pane, and
// their selections and pointers on the canvas. It tells presence what the person does (the open
// file, the caret, the canvas selection, where the pointer is over the canvas) and draws what
// presence says about the others. Both live and die with the open project; the anonymous page with
// no project in a room never calls this, so it has none of it.

import { presenceMessage } from "../canvas-host.js";
import { messages } from "../messages/index.js";
import type { Playground } from "../shell.js";
import { realTimers } from "./binding.js";
import type { CloudController } from "./controller.js";
import { studioSource, type Presence } from "./presence.js";
import { presenceBar } from "./presence-bar.js";
import { PresenceOverlay } from "./presence-overlay.js";

/** What `told` is when the canvas has been told nothing: nobody, and no colour of its own. */
const EMPTY = "[[],null]";

/** Puts the "who is here" list in the cloud slot and follows the open project's presence. */
export function mountPresence(playground: Playground, controller: CloudController): void {
  const studio = playground.studio;
  const code = playground.code;

  const bar = presenceBar({
    open: (path) => {
      studio.select(path);
      playground.show("code");
    },
  });
  playground.cloudSlot.prepend(bar.element);
  const overlay = new PresenceOverlay(code.overlayHost(), realTimers, () => Date.now());

  /** The person, as presence publishes them. */
  const source = studioSource(studio, () => {
    const { start, end } = code.selection();
    return { start, end, backward: code.input.selectionDirection === "backward" };
  });

  let current: Presence | undefined;
  let stop: (() => void) | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  /** What the header was last drawn with: it is drawn again only when it differs (focus stays). */
  let listed = "[]";
  /** What the canvas was last told, or knows it has lost: it is told again only when it differs. */
  let told = EMPTY;
  /** The file and the diagram the canvas shows, to know when it has cleared what it was told. */
  let shownFile = studio.open;
  let shownDiagram: string | undefined;

  const draw = (): void => {
    scheduled = undefined;
    const m = messages().presence;
    const presence = current;
    const people = presence ? presence.people() : [];
    const list = JSON.stringify(people);
    if (list !== listed) {
      listed = list;
      bar.update(people);
    }
    overlay.show(presence ? presence.carets(studio.open, code.text, m.unnamed) : [], code.text);
    // A pointer is drawn over the diagram it was over: the canvas shows one diagram of the file.
    const diagram = studio.open === "" ? undefined : studio.session.current;
    const selections = presence ? presence.canvas(studio.open, m.unnamed, diagram) : [];
    // The person's own colour, as the others see it: the Pointer's trail and cursor are drawn in it.
    const colour = presence?.colour;
    const key = JSON.stringify([selections, colour]);
    if (key !== told) {
      told = key;
      playground.canvas.receive(presenceMessage(selections, colour ? { colour } : undefined));
    }
  };

  /** Draws once the page has settled what it is doing: many changes in a turn are one drawing. */
  const later = (): void => {
    scheduled ??= setTimeout(draw, 0);
  };

  const follow = (presence: Presence | undefined): void => {
    stop?.();
    stop = undefined;
    current = presence;
    if (presence) {
      stop = presence.listen(later);
      presence.attach(source);
      // The canvas reports the pointer to a host that shares presence: this says it does.
      if (told === EMPTY) playground.canvas.receive(presenceMessage([]));
    }
    later();
  };
  controller.subscribe((project) => follow(project ? controller.presence : undefined));
  // Where the person's pointer is over the canvas goes out with the rest of their state.
  playground.onCanvasPointer((at) => current?.pointer(at));
  // So do the points of a stroke of the Pointer tool, or of the pen or the highlighter with how it
  // looks, in the same message.
  playground.onCanvasLaser((batch) => current?.laser(batch.points, batch.diagram, batch.pen));

  studio.listen({
    // Another file was opened (or this one renamed): the person is somewhere else. What the canvas
    // was told is for the file it showed: it is cleared at once, and told again after the render
    // of this one (the drawing waits for the turn to end, which is after the render).
    files: () => {
      current?.moved();
      if (studio.open !== shownFile) {
        shownFile = studio.open;
        if (told !== EMPTY) playground.canvas.receive(presenceMessage([]));
        told = EMPTY;
      }
      later();
    },
    // The text of the open file changed, here or elsewhere: carets move with it.
    text: (path) => {
      if (path === studio.open) later();
    },
    // The canvas selected something (the person's selection is published), or drew another diagram
    // or nothing, which clears what it was told: it is told again once it has drawn.
    canvas: (batch) => {
      current?.moved();
      for (const message of batch) {
        if (message.type === "empty") {
          told = EMPTY;
          shownDiagram = undefined;
          later();
        } else if (message.type === "render") {
          if (message.diagram !== shownDiagram) {
            shownDiagram = message.diagram;
            told = EMPTY;
          }
          later();
        }
      }
    },
  });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === code.input) current?.moved();
  });
  code.input.addEventListener("scroll", () => overlay.reposition());
}
