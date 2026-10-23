import { describe, expect, it } from "vitest";
import { writtenMessage } from "../../src/extension/written.js";

const wrote = (names: readonly string[]) => `Wrote ${names.join(", ")}.`;

describe("the message after an export", () => {
  it("names the files and then what the export chose", () => {
    expect(
      writtenMessage(
        wrote,
        ["sheet.checkout.gif"],
        ["The effects of `checkout` repeat forever: the video lasts 6 s, one loop of them."],
      ),
    ).toBe(
      "Wrote sheet.checkout.gif. The effects of `checkout` repeat forever: the video lasts 6 s, one loop of them.",
    );
  });

  it("is the files alone when nothing was chosen", () => {
    expect(writtenMessage(wrote, ["a.png", "b.png"], [])).toBe("Wrote a.png, b.png.");
  });
});
