# @meltemi/diagrams-capture

PNG, PDF and video captures of rendered SVG with the installed Edge, Chrome or Chromium, driven
over the DevTools protocol, and video encoding with the installed FFmpeg. Nothing is downloaded:
`MELTEMI_BROWSER` and `MELTEMI_FFMPEG` name other executables.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-capture
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```js
import { captureSync } from "@meltemi/diagrams-capture";

// Writes a PNG at twice the pixels and a vector PDF page of the same SVG.
captureSync([
  { kind: "png", svg, width: 640, height: 360, scale: 2, out: "picture.png" },
  { kind: "pdf", svg, width: 640, height: 360, out: "picture.pdf" },
]);
```

## Documentation

- [Export](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/export.md)
- [Compatibility](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/compatibility.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
