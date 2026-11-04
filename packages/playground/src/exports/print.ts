import { capturePage } from "@meltemi/diagrams-capture/page";
import type { CaptureJob } from "@meltemi/diagrams-capture";
import { messages } from "../messages/index.js";
import { h } from "../ui.js";

/**
 * Opens the browser's print dialog on the page the CLI prints to PDF: the picture at its size on
 * a page of the same size with no margin. "Save as PDF" in the dialog keeps it as vectors.
 */
export function printPicture(job: CaptureJob): Promise<void> {
  document.querySelector(".print-frame")?.remove();
  const frame = h("iframe", {
    class: "print-frame",
    title: messages().exports.printTitle,
    "aria-hidden": "true",
    tabindex: "-1",
  });
  frame.srcdoc = capturePage(job);
  document.body.append(frame);
  return new Promise((resolve) => {
    frame.addEventListener(
      "load",
      () => {
        const view = frame.contentWindow;
        if (!view) {
          resolve();
          return;
        }
        void view.document.fonts.ready.then(() => {
          view.focus();
          view.print();
          resolve();
        });
      },
      { once: true },
    );
  });
}
