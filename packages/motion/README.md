# @meltemi/diagrams-motion

Motion on a deterministic clock: effects (flow particles, moving dashes, pulses, traces) planned on a
laid-out scene, the frame at any time, the CSS-animated SVG profile, and the timeline and frames
of stories.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-motion
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { planMotion, sceneAt } from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";

const text = `language "0.2"

diagram shop: flow {
  web -> api: "HTTPS" as call
  animate call { effect flow; duration 1200ms; repeat forever }
}
`;

const compilation = compile(text);
const diagram = compilation.document.diagrams[0]!;
const { scene } = layoutDiagram(compilation, diagram, { engine: createElkEngine() });
const plan = planMotion(diagram, scene!);
const frame = renderSvg(sceneAt(scene!, plan, 600)); // the picture at 600 ms
console.log(plan.effects.length, frame.length > 0); // 1 true
```

## Documentation

- [Motion](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/motion.md)
- [Stories](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/stories.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
