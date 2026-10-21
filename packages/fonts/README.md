# @meltemi/diagrams-fonts

The bundled open fonts (Inter, IBM Plex Sans and Cascadia Mono, under the SIL Open Font
Licence), text measurement for layout, subsetting for embedded SVG fonts and text outlines. The
`./node` entry reads the font files from the installed font packages.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-fonts
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";

const fonts = createNodeFontLibrary();
// The width of a label in Inter 600 at 14 px, as the layout measures it.
console.log(fonts.width("Orders API", "Inter", 600, 14) > 0); // true
```

## Documentation

- [Fonts](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/fonts.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
