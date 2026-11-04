// What the page adds to the open cloud project beyond the drawer: the versions button, in the
// header's cloud slot, and the thumbnail sent from the page. Both live and die with the project:
// the button's slot is shown only while a cloud project is open, and the thumbnail's timers are
// dropped the moment the project is left. The anonymous page never calls this.

import type { Playground } from "../shell.js";
import { realTimers } from "./binding.js";
import type { CloudController } from "./controller.js";
import { sha256Hex } from "./doc.js";
import { mountPresence } from "./presence-mount.js";
import { drawsSomething, renderThumbnail } from "./thumbnail-render.js";
import { Thumbnails, thumbnailMemory } from "./thumbnails.js";
import { openVersionsDrawer, versionsButton } from "./versions.js";

const encoder = new TextEncoder();

/** Puts the versions button in the cloud slot and starts sending the open project's thumbnail. */
export function mountCloudExtras(playground: Playground, controller: CloudController): Thumbnails {
  const versions = versionsButton(() => openVersionsDrawer(controller));
  playground.cloudSlot.append(versions);
  // Who else is here, in the header, over the code and on the canvas.
  mountPresence(playground, controller);

  const studio = playground.studio;
  const thumbnails = new Thumbnails({
    timers: realTimers,
    now: () => Date.now(),
    render: () => renderThumbnail(studio),
    hash: (svg) => sha256Hex(encoder.encode(svg)),
    send: (project, svg) => controller.api.putThumbnail(project, svg),
    memory: thumbnailMemory(playground.options.cloud?.storage),
    sent: (project) => controller.thumbnails.sent(project),
  });
  controller.subscribe((project) => {
    // A viewer changes nothing of the project: no versions to name or restore, no thumbnail to send.
    const viewer = controller.role === "viewer";
    versions.hidden = viewer;
    thumbnails.open(project && !viewer ? project.id : undefined);
    // The project's files were loaded, and analysed, before the page was told it is open.
    if (project && !viewer) thumbnails.analysed(drawsSomething(studio.analysis));
  });
  studio.listen({ analysis: (analysis) => thumbnails.analysed(drawsSomething(analysis)) });
  // Signing out leaves the page, which ends its timers; and a call that finds the person signed out
  // (the answer is 401) stops the thumbnails for good.
  return thumbnails;
}
