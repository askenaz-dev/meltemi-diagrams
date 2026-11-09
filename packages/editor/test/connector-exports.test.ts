import { expect, it } from "vitest";
import { analyzeDocument, renderDiagram } from "../src/index.js";

it("keeps canvas interaction targets out of static and animated SVG exports", () => {
  const analysis = analyzeDocument({
    text: 'diagram d: flow {\n a["A"]\n b["B"]\n a -> b as link\n animate link { effect dash }\n}\n',
    revision: 1,
  });
  for (const motion of ["static", "animated"] as const) {
    const rendered = renderDiagram(analysis, "d", { motion });
    expect(rendered).toBeDefined();
    expect(rendered!.svg).not.toMatch(/mdg-hit|mdg-connector-hit|data-stroke-width/);
    if (motion === "animated") expect(rendered!.svg).toContain("mdg-m");
  }
});
