// The sea when the canvas has nothing to draw (`playground-sea`, design D2): no file open,
// project.json open, or a file that is not a `.meltemi` source (`Studio.nothingToDraw`). The sea is
// asked for only then: `./sea.js` and `@meltemi/ocean` are a chunk of their own, loaded the first
// time, and nothing of the sea is kept while a diagram is on the canvas.
import type { SeaMoment } from "./sea.js";

/** What the sea's chunk gives the empty canvas. */
export interface SeaModule {
  playMoment(
    host: HTMLElement,
    options: { moment: "empty"; reducedMotion: boolean },
  ): SeaMoment | undefined;
}

/**
 * Puts the sea behind the canvas's message in `host` (the canvas's stage), once its chunk arrives,
 * and returns its disposer. Disposed before it arrives, it never shows; a chunk that cannot be
 * loaded leaves the message as it was.
 */
export function showEmptySea(
  host: HTMLElement,
  options: { readonly reducedMotion: boolean },
  load: () => Promise<SeaModule> = () => import("./sea.js"),
): () => void {
  let gone = false;
  let moment: SeaMoment | undefined;
  load()
    .then((sea) => {
      if (gone || !host.isConnected) return;
      moment = sea.playMoment(host, { moment: "empty", reducedMotion: options.reducedMotion });
    })
    .catch(() => undefined);
  return () => {
    gone = true;
    moment?.destroy();
    moment = undefined;
  };
}

/**
 * Follows what the studio says of the canvas (`StudioListener.nothingToDraw`): shows the sea when
 * there is nothing to draw, and disposes of it as soon as there is, which the studio says before
 * it sends the diagram.
 */
export class EmptySea {
  private dispose: (() => void) | undefined;

  constructor(private readonly show: () => (() => void) | undefined) {}

  /** Whether the sea is shown, or on its way. */
  get shown(): boolean {
    return this.dispose !== undefined;
  }

  set(nothing: boolean): void {
    if (nothing && this.dispose === undefined) {
      this.dispose = this.show();
    } else if (!nothing && this.dispose !== undefined) {
      const dispose = this.dispose;
      this.dispose = undefined;
      dispose();
    }
  }
}
