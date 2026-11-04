// A clock the tests turn by hand: timers run when `advance` reaches them, in order, and a timer that
// a timer sets runs too if it falls within the time advanced. Nothing here reads the real time.

import type { Timers } from "../../src/cloud/binding.js";

interface Pending {
  readonly id: number;
  readonly at: number;
  readonly run: () => void;
}

export class ManualTimers implements Timers {
  /** The clock's time, in milliseconds since it was made. */
  now = 0;
  private next = 1;
  private pending: Pending[] = [];

  set(run: () => void, milliseconds: number): unknown {
    const id = this.next++;
    this.pending.push({ id, at: this.now + milliseconds, run });
    return id;
  }

  clear(handle: unknown): void {
    this.pending = this.pending.filter((timer) => timer.id !== handle);
  }

  /** The delays of the timers waiting, soonest first, relative to now. */
  delays(): number[] {
    return this.pending.map((timer) => timer.at - this.now).sort((a, b) => a - b);
  }

  get waiting(): number {
    return this.pending.length;
  }

  /** Turns the clock forward, running every timer that falls due, in order. */
  advance(milliseconds: number): void {
    const until = this.now + milliseconds;
    for (;;) {
      const due = this.pending
        .filter((timer) => timer.at <= until)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.pending = this.pending.filter((timer) => timer !== due);
      this.now = Math.max(this.now, due.at);
      due.run();
    }
    this.now = until;
  }

  /** Runs the soonest timer, whenever it is due. */
  runNext(): boolean {
    const soonest = [...this.pending].sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!soonest) return false;
    this.advance(Math.max(0, soonest.at - this.now));
    return true;
  }
}

/** Lets promises and microtasks that are ready run, several rounds over. */
export async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((resolve) => queueMicrotask(resolve));
}
