// The load screen's sea (`playground-sea`, design D1): a module of its own, `boot-sea.js`, which
// `index.html` loads with `async` beside `playground.js`. It runs as soon as it arrives and never
// holds the page back: arriving after the start, it finds no `loading` and does nothing. While the
// page loads it plays the sea behind the boot line; when the page starts, the load screen dissolves
// over the editor in 200 ms (none under reduced motion), and the sea is destroyed and removed.
//
// It imports nothing the editor's bundle imports, so the editor's bundle stays what it was.
import { FADE_MS, playMoment, reducedMotion } from "./sea.js";

const root = document.getElementById("playground");

if (root?.classList.contains("loading")) {
  const reduced = reducedMotion((query) => window.matchMedia(query));
  // The boot line the page wrote, in the person's language: the dissolve shows it once more.
  const boot = root.querySelector<HTMLElement>(".boot");
  // Over the page, not in it: the page replaces what #playground holds as it starts.
  const screen = document.createElement("div");
  screen.className = "boot-sea";
  screen.setAttribute("aria-hidden", "true");
  document.body.append(screen);
  const moment = playMoment(screen, { moment: "boot", reducedMotion: reduced });
  if (!moment) {
    screen.remove();
  } else {
    const leave = () => {
      if (reduced) {
        moment.destroy();
        screen.remove();
        return;
      }
      // The load screen as it was, its background and its line over the editor, fading out.
      const line = document.createElement("p");
      line.className = "boot";
      line.textContent = boot?.textContent ?? "";
      screen.append(line);
      const gone = () => {
        clearTimeout(late);
        moment.destroy();
        screen.remove();
      };
      // The dissolve's 200 ms count from its first frame, which waits for the editor's first
      // drawing to leave the main thread; a page in the background plays no animation, and the
      // timer takes the layer away then.
      screen.addEventListener("animationend", gone, { once: true });
      const late = setTimeout(gone, FADE_MS + 1000);
      screen.classList.add("leaving");
    };
    const started = new MutationObserver(() => {
      if (root.classList.contains("loading")) return;
      started.disconnect();
      leave();
    });
    started.observe(root, { attributes: true, attributeFilter: ["class"] });
  }
}
