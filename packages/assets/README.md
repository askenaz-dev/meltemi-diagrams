# @meltemi/diagrams-assets

Icons and project assets: the built-in Tabler pack, Iconify and SVG folder packs with their
licences, a strict SVG sanitiser, image reading and the asset lock with SHA-256 digests.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-assets
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { sanitizeSvg } from "@meltemi/diagrams-assets";

const result = sanitizeSvg(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><script>alert(1)</script></svg>',
);
console.log(result.ok); // false: scripts are refused, never stripped silently
```

## Documentation

- [Icons and assets](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/assets.md)
- [Security](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/security.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
