import { setLocale } from "@meltemi/diagrams-i18n";
import type { InspectorField } from "@meltemi/diagrams-editor/canvas";
import { afterEach, describe, expect, it } from "vitest";
import { cardLabel, effectCards, effectsSummary, openCards } from "../src/inspector.js";

afterEach(() => setLocale("en"));

const toggle = (label: string, value: "on" | null, mixed?: boolean) => ({
  label,
  value,
  ...(mixed ? { mixed } : {}),
});

/** A strip field as the editor marks it: a toggle, or a setting grouped under its toggle. */
const field = (
  name: string,
  extra: Partial<InspectorField> & { label?: string } = {},
): InspectorField => ({
  name,
  label: extra.label ?? name,
  type: "text",
  value: null,
  section: "strip",
  ...extra,
});

/** The fields of an effect that is on: its toggle and the settings of its card. */
const on = (effect: string, label: string, ...settings: string[]): InspectorField[] => [
  field(`effect.${effect}`, { label, type: "enum", value: "on" }),
  field(`effect.${effect}.duration`, { label: `${label}: duration`, group: `effect.${effect}` }),
  ...settings.map((s) =>
    field(`effect.${effect}.${s}`, { label: `${label}: ${s}`, group: `effect.${effect}` }),
  ),
];

describe("the cards of the strip", () => {
  it("groups the fields of each effect that is on under its toggle, the duration apart", () => {
    const strip = [
      field("style.fill", { type: "color" }),
      field("effect.flow", { label: "Flow particles", type: "enum" }),
      ...on("dash", "Moving dash", "repeat", "delay", "direction"),
      field("effect.pulse", { label: "Pulse", type: "enum" }),
      ...on("trace", "Trace", "repeat", "delay", "direction", "color"),
    ];
    const cards = effectCards(strip);
    expect(cards.map((c) => c.toggle.name)).toEqual([
      "effect.flow",
      "effect.dash",
      "effect.pulse",
      "effect.trace",
    ]);
    expect(cards[0]!.duration).toBeUndefined();
    expect(cards[0]!.fields).toEqual([]);
    expect(cards[1]!.duration?.name).toBe("effect.dash.duration");
    expect(cards[1]!.fields.map((f) => f.name)).toEqual([
      "effect.dash.repeat",
      "effect.dash.delay",
      "effect.dash.direction",
    ]);
    expect(cards[3]!.fields.map((f) => f.name)).toEqual([
      "effect.trace.repeat",
      "effect.trace.delay",
      "effect.trace.direction",
      "effect.trace.color",
    ]);
  });

  it("gives a box with a pulse one card, and a selection with toggles only none", () => {
    const box = [
      field("effect.pulse", { type: "enum", value: "on" }),
      ...on("dash", "Moving dash"),
    ];
    expect(effectCards(box).filter((c) => c.duration || c.fields.length > 0)).toHaveLength(1);
    const selection = [
      field("effect.pulse", { type: "enum", value: null, mixed: true }),
      field("effect.dash", { type: "enum", value: null }),
    ];
    const cards = effectCards(selection);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.duration === undefined && c.fields.length === 0)).toBe(true);
  });

  it("shows a setting's label without the effect's name, in English and Spanish", () => {
    expect(cardLabel("Trace", "Trace: colour")).toBe("colour");
    expect(cardLabel("Pulso", "Pulso: color")).toBe("color");
    expect(cardLabel("Trace", "Repeat")).toBe("Repeat");
    expect(cardLabel("Trace", "Tracer: colour")).toBe("Tracer: colour");
  });

  it("opens the card of an effect just turned on and closes the others", () => {
    const before = [field("effect.dash", { type: "enum", value: null })];
    const after = [field("effect.dash", { type: "enum", value: "on" })];
    expect([...openCards(before, after, new Set())]).toEqual(["effect.dash"]);
    // The same model again: the kept set, nothing added.
    expect([...openCards(after, after, new Set())]).toEqual([]);
    expect([...openCards(after, after, new Set(["effect.dash"]))]).toEqual(["effect.dash"]);
    // A second effect turned on: its card opens, the first's closes.
    const traced = [...after, field("effect.trace", { type: "enum", value: "on" })];
    expect([...openCards(after, traced, new Set(["effect.dash"]))]).toEqual(["effect.trace"]);
  });

  it("closes the card of an effect turned off, by hand or in the text", () => {
    const after = [field("effect.dash", { type: "enum", value: null })];
    expect([...openCards(undefined, after, new Set(["effect.dash", "effect.trace"]))]).toEqual([
      "effect.trace",
    ]);
  });

  it("starts a target first seen from its kept set, empty at first", () => {
    const traced = [field("effect.trace", { type: "enum", value: "on" })];
    expect([...openCards(undefined, traced, new Set())]).toEqual([]);
    expect([...openCards(undefined, traced, new Set(["effect.trace"]))]).toEqual(["effect.trace"]);
  });
});

describe("the Effects row of the strip", () => {
  it("says off when no effect is on", () => {
    expect(effectsSummary([toggle("Flow particles", null), toggle("Pulse", null)])).toBe("off");
  });

  it("names the effect that is on", () => {
    expect(effectsSummary([toggle("Flow particles", null), toggle("Moving dash", "on")])).toBe(
      "Moving dash",
    );
  });

  it("names every effect that is on, in the strip's order", () => {
    expect(
      effectsSummary([
        toggle("Flow particles", "on"),
        toggle("Moving dash", null),
        toggle("Pulse", "on"),
      ]),
    ).toBe("Flow particles, Pulse");
  });

  it("says mixed when the selection differs on an effect", () => {
    expect(effectsSummary([toggle("Flow particles", "on"), toggle("Pulse", null, true)])).toBe(
      "mixed",
    );
  });

  it("speaks the interface language", () => {
    setLocale("es");
    expect(effectsSummary([toggle("Pulso", null)])).toBe("ninguno");
    expect(effectsSummary([toggle("Pulso", null, true)])).toBe("mixto");
  });
});
