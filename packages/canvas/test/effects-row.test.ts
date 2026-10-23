import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { effectsSummary } from "../src/inspector.js";

afterEach(() => setLocale("en"));

const toggle = (label: string, value: "on" | null, mixed?: boolean) => ({
  label,
  value,
  ...(mixed ? { mixed } : {}),
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
