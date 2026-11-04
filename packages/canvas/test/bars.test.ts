import type { EventInfo } from "@meltemi/diagrams-editor/canvas";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { barEndY, barRowAt, barSpan } from "../src/bars.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

afterEach(() => setLocale("en"));

/** An event of the canvas: its row from `y`, `height` tall. */
const event = (
  key: string,
  kind: EventInfo["kind"],
  y: number,
  height: number,
  extra: Partial<EventInfo> = {},
): EventInfo => ({
  key,
  kind,
  y,
  height,
  box: null,
  pair: null,
  parent: null,
  participant: null,
  label: null,
  space: 0,
  spaced: kind === "message" || kind === "note" || kind === "fragment",
  ...extra,
});

/**
 * The payment canvas's events, as the session sends them: `pay`, `activate api`, `authorize`, an
 * `alt` fragment holding `approved` and `declined` in its two branches, then `deactivate api`.
 */
const PAYMENT: readonly EventInfo[] = [
  event("pay", "message", 100, 40),
  event("activate#1", "activate", 128, 0, {
    participant: "api",
    pair: "deactivate#1",
    box: { x: 140, y: 128, width: 10, height: 172 },
  }),
  event("authorize", "message", 140, 40),
  event("result", "fragment", 180, 120),
  event("approved", "message", 214, 40, { parent: "result" }),
  event("declined", "message", 262, 34, { parent: "result" }),
  event("deactivate#1", "deactivate", 300, 0, { participant: "api", pair: "activate#1" }),
];

describe("the row an end of an activation bar snaps to", () => {
  it("takes the event row under the pointer, the handle on the boundary below it", () => {
    expect(barRowAt(PAYMENT, 110)).toEqual({ key: "pay", y: 140 });
    expect(barRowAt(PAYMENT, 140)).toEqual({ key: "authorize", y: 180 });
    expect(barRowAt(PAYMENT, 179.5)).toEqual({ key: "authorize", y: 180 });
  });

  it("takes the innermost of nested rows, and the fragment where no branch row is", () => {
    // Inside the fragment's second branch: the message, not the fragment around it.
    expect(barRowAt(PAYMENT, 270)).toEqual({ key: "declined", y: 296 });
    expect(barRowAt(PAYMENT, 220)).toEqual({ key: "approved", y: 254 });
    // The fragment's header holds no message row: the fragment itself.
    expect(barRowAt(PAYMENT, 190)).toEqual({ key: "result", y: 300 });
  });

  it("never snaps to an activation's own row, which has no height", () => {
    const keys = [100, 128, 160, 299].map((y) => barRowAt(PAYMENT, y)?.key);
    expect(keys).not.toContain("activate#1");
    expect(keys).not.toContain("deactivate#1");
  });

  it("takes the last row past the end, and the first above the start", () => {
    expect(barRowAt(PAYMENT, 900)).toEqual({ key: "result", y: 300 });
    expect(barRowAt(PAYMENT, 20)).toEqual({ key: "pay", y: 140 });
    expect(barRowAt([], 20)).toBeUndefined();
  });
});

describe("where a dragged end of a bar is drawn", () => {
  const ask = {
    from: "a",
    to: "b",
    points: [
      { x: 10, y: 120 },
      { x: 90, y: 120 },
    ],
  };
  const loop = {
    from: "b",
    to: "b",
    points: [
      { x: 90, y: 150 },
      { x: 120, y: 150 },
      { x: 120, y: 170 },
      { x: 90, y: 170 },
    ],
  };

  it("at the arrow of a message its participant sends or receives", () => {
    expect(barEndY(ask, "b")).toBe(120);
    expect(barEndY(ask, "a")).toBe(120);
    // A self-call's loop comes back at its last point.
    expect(barEndY(loop, "b")).toBe(170);
  });

  it("on the row's boundary for a message between others, or no message", () => {
    expect(barEndY(ask, "c")).toBeUndefined();
    expect(barEndY(undefined, "b")).toBeUndefined();
    expect(barEndY(ask, null)).toBeUndefined();
  });
});

describe("what the status line says of a selected bar", () => {
  it("names the participant, the message it starts at and the last before its end", () => {
    expect(barSpan(PAYMENT, "activate#1")).toEqual({
      participant: "api",
      from: "pay",
      to: "declined",
    });
    expect(en.announcements.activation("api", "pay", "declined")).toBe(
      "Activation of api from pay to declined selected.",
    );
    expect(es.announcements.activation("api", "pay", "declined")).toBe(
      "Activación de api desde pay hasta declined seleccionada.",
    );
  });

  it("says to the end for a bar that no deactivate ends", () => {
    const open = PAYMENT.filter((e) => e.kind !== "deactivate").map((e) =>
      e.kind === "activate" ? { ...e, pair: null } : e,
    );
    const span = barSpan(open, "activate#1")!;
    expect(span).toEqual({ participant: "api", from: "pay", to: null });
    expect(en.announcements.activation(span.participant, span.from, span.to)).toBe(
      "Activation of api from pay to the end selected.",
    );
    expect(es.announcements.activation(span.participant, span.from, span.to)).toBe(
      "Activación de api desde pay hasta el final seleccionada.",
    );
  });

  it("ends at the message it starts at when none comes before its deactivate", () => {
    const short: EventInfo[] = [
      event("ask", "message", 100, 40),
      event("activate#1", "activate", 128, 0, { participant: "b", pair: "deactivate#1" }),
      event("deactivate#1", "deactivate", 140, 0, { participant: "b", pair: "activate#1" }),
      event("reply", "message", 140, 40),
    ];
    expect(barSpan(short, "activate#1")).toEqual({ participant: "b", from: "ask", to: "ask" });
  });

  it("starts at the start before any message, and knows nothing of other events", () => {
    const first: EventInfo[] = [
      event("activate#1", "activate", 40, 0, { participant: "a" }),
      event("ask", "message", 40, 40),
    ];
    expect(barSpan(first, "activate#1")).toEqual({ participant: "a", from: null, to: null });
    expect(en.announcements.activation("a", null, null)).toBe(
      "Activation of a from the start to the end selected.",
    );
    expect(barSpan(PAYMENT, "authorize")).toBeUndefined();
    expect(barSpan(PAYMENT, "deactivate#1")).toBeUndefined();
    expect(barSpan(PAYMENT, "missing")).toBeUndefined();
  });

  it("says where a dragged end goes and where it went, in both languages", () => {
    expect(en.announcements.barEndAt("api", "end", "authorize")).toBe(
      "End the activation of api after authorize: release to move it, Escape cancels.",
    );
    expect(en.announcements.barEndMoved("api", "start", "authorize")).toBe(
      "The activation of api now starts after authorize.",
    );
    expect(es.announcements.barEndMoved("api", "end", "authorize")).toBe(
      "La activación de api ahora termina después de authorize.",
    );
  });
});
