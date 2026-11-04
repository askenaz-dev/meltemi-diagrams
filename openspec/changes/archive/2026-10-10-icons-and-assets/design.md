## Context

- `icon "<pack>:<name>"` is a style property: it can be set in `style` statements, classes and rules, and only its form is checked.
- Nothing draws it, and there are no icon packs.
- Fonts are bundled by `@meltemi/diagrams-fonts` and read through a reader function, so hosts without a file system can supply them.
- Projects are read through `ProjectHost` (`readFile`, `readDirectory`), which only reads text.
- `@tabler/icons` 3.48.0 ships `tabler-nodes-outline.json` and `tabler-nodes-filled.json`, which list every icon as `[tag, attributes]` elements, and `icons.json` with categories and tags. That is 5,166 outline and 1,054 filled icons. The download is approved.

## Goals / Non-Goals

**Goals:**
- Icons that look like one family whatever pack they come from, placed consistently next to the label and measured before layout.
- Every icon and font a project uses has a known version, origin and licence, and the lock tells when they change.
- Untrusted SVG never reaches an export unsanitised.

**Non-Goals:**
- Images and plugins (roadmap changes 9 and 21), and fetching packs from the network.

## Decisions

### D1. Packages and hosts

`@meltemi/diagrams-assets` holds packs, the sanitiser, geometry, licences and the lock. It has no Node dependency.

- `./node` provides `createNodeIconPacks()`, which reads Tabler from `node_modules`.
- Hosts without a file system pass the same JSON through a reader, as the fonts package does.
- The layout depends on it for icon geometry. The project package depends on it to discover and check project assets.
- `ProjectHost` gains an optional `readBinary(path)` for fonts, implemented by the node and memory hosts.

### D2. Packs and names

| Pack | Files | Names | Licence metadata |
|---|---|---|---|
| `tabler` (built in) | `@tabler/icons` node JSON | `tabler:server`; filled `tabler:server-filled` | MIT, Paweł Kuna, version from its `package.json` |
| Iconify JSON | `assets/icons/<prefix>.json` | `<prefix>:<name>`, aliases of the file included | `info` (name, version, author, licence), overridden by `assets/licenses.json` |
| SVG folder | `assets/icons/<prefix>/<name>.svg` | `<prefix>:<name>` | `assets/licenses.json` only |

- A prefix is `[a-z0-9][a-z0-9-]*` and must be unique. A project pack named `tabler`, or two files claiming one prefix, is `asset.duplicate-pack`.
- `"icons": { "<alias>": "<prefix>" }` in `project.json` adds aliases: `cloud:lambda` resolves to `aws:lambda`. An alias must not be a pack prefix, and its target must be a pack. Otherwise it is `project.invalid-value`.
- Search matches names, Tabler tags and categories, and Iconify `categories`, case-insensitively, and ranks exact names first.

### D3. Sanitising and limits

Local SVG and Iconify bodies are parsed by a small XML reader. Anything outside the allow-list makes the icon unusable and is `asset.unsafe-svg`, naming the element or attribute.

| Allowed elements | `svg` (root), `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `defs`, `linearGradient`, `radialGradient`, `stop`; `title`, `desc` and `metadata` are skipped |
|---|---|
| Allowed attributes | geometry (`d`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height`, `x1`, `y1`, `x2`, `y2`, `fx`, `fy`, `points`, `viewBox`), paint (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill-rule`, `opacity`, `fill-opacity`, `stroke-opacity`), gradients (`gradientUnits`, `gradientTransform`, `spreadMethod`, `offset`, `stop-color`, `stop-opacity`), `transform`, `id`, and `style` limited to the same properties; `class`, `xmlns*`, `version` and `data-*` are ignored |
| Local references | `url(#id)` in a paint, and `href`/`xlink:href="#id"` on a gradient that inherits another gradient of the same file |
| Rejected | DTDs and entities other than the XML five and numeric ones, `script`, `style` elements, `foreignObject`, `image`, `use`, `a`, external links, event attributes (`on*`), patterns, masks, clips, filters, `url(` to anything but a gradient of the same file, and animation |

| Limit | Value | Code |
|---|---|---|
| SVG icon file | 256 KB | `asset.too-large` |
| Iconify JSON file | 16 MB | `asset.too-large` |
| Font file | 16 MB | `asset.too-large` |
| Elements per icon | 2,000 | `asset.too-large` |
| Nesting depth | 32 | `asset.too-large` |
| Path data per icon | 256 KB | `asset.too-large` |

Every shape becomes path data, so renderers only draw paths.

### D4. Geometry and optical scale

- Path data is parsed into segments. Curves and arcs are flattened to points, transforms are applied, and the bounding box grows by half the stroke width.
- The optical ratio of an icon is the larger side of its content box divided by the larger side of its view box.
- The pack's ratio is the median over up to 64 icons in name order, computed once and cached. Tabler's is about 0.83: 20 of 24 units.
- An icon is drawn with its view box scaled to `iconSize × 0.833 / packRatio`, clamped to between 0.75 and 1.25 times `iconSize`, and centred in an `iconSize` square. Packs drawn edge to edge are scaled down to Tabler's share, and padded packs are scaled up.
- Per-icon content centring is not used, because grid-designed icons are balanced on their grid.
- `assets/licenses.json` may override the ratio with `opticalScale`.

### D5. Placement and colour

| Target | `iconPosition left` | `iconPosition top` |
|---|---|---|
| node, decision, data | icon, gap, then the text block left-aligned; the row is centred in the box | icon centred above the centred text block; the column is centred |
| group | before the title, at the title's centre line | same as `left` |
| tag, note | before the text (first line of a note), at `tagSize × 1.3` or `noteSize × 1.3` | same as `left` |
| relation label | before the label text inside the pill; an icon-only pill without a label | same as `left` |

- The gap is `round(iconSize × 0.4)`.
- Monochrome icons use `currentColor`, black or no paint. Their paint becomes `iconColor`, else the target's text colour. Other icons keep their colours.
- Box sizes include the icon: `left` adds `iconSize + gap` to the text width, and `top` adds `iconSize + gap` to the text height. So `layout.text-overflow` and default sizes account for it.
- Theme tokens: `iconSize` (8 to 64; technical 18, editorial 16, stage 24) and `iconPosition` (technical and editorial `left`, stage `top`). Style properties: `iconColor` (colour or token) and `iconPosition` (elements only).
- In the scene, an icon is a group with role `icon`, `data-id` set to the reference, and a `translate(x y) scale(s)` transform, holding paths in view box units. Paths gain `opacity` and `fillRule`, and `rounded` stands for round caps and joins.
- Icon gradients become scene gradients, linear or radial with their units, transform and stops, under ids unique in the scene (`icon-<n>-<id>`). Their coordinates stay in the icon's user space, which SVG resolves inside the transformed group.

### D6. Licences

`assets/licenses.json`:

```json
{
  "icons": {
    "aws": {
      "title": "AWS Architecture Icons",
      "version": "2025.02",
      "license": "LicenseRef-AWS-Architecture-Icons",
      "url": "https://aws.amazon.com/architecture/icons/",
      "author": "Amazon Web Services",
      "redistribute": false,
      "opticalScale": 0.9
    }
  },
  "fonts": {
    "Company Sans": { "version": "2.001", "license": "OFL-1.1", "url": "https://example.com", "author": "Company" }
  }
}
```

- Fields: `license` is required, either an SPDX id or a `LicenseRef-*` name. `title`, `version`, `url`, `author`, `redistribute` (default `true`) and `opticalScale` are optional.
- A project pack or font with no licence from its own metadata or this file is `asset.missing-license`.
- Unknown keys are `asset.invalid-file` (warning); malformed JSON or wrong types are `asset.invalid-file` (error).
- `meltemi-diagrams assets list` shows `redistribute: no` so authors know which exports may not be published. Licences are reported, never rewritten.

### D7. Project fonts

- Every `.woff2`, `.woff`, `.ttf` or `.otf` in `assets/fonts/` joins the font library for exports of the project, under its family name, weight and style.
- The `OS/2` `fsType` bit for restricted embedding (`0x0002`) makes the font usable for measurement only. The `embedded` and `outlined` policies then draw its text with the font name, and `asset.font-restricted` (warning) is reported on the file.
- Embedded project fonts are written whole, without subsets or `unicode-range`.

### D8. Lock

```json
{
  "lockVersion": 1,
  "icons": {
    "tabler": { "version": "3.48.0", "source": "built-in", "license": "MIT" },
    "aws": { "version": "2025.02", "source": "assets/icons/aws", "license": "LicenseRef-AWS-Architecture-Icons", "integrity": "sha256-…" }
  },
  "fonts": {
    "assets/fonts/CompanySans-Regular.woff2": { "family": "Company Sans", "license": "OFL-1.1", "integrity": "sha256-…" }
  }
}
```

- The integrity of a project pack is the SHA-256 of its file, or of its folder's sorted `name\0content` pairs. Built-in packs are pinned by version.
- `meltemi-diagrams assets lock` writes the file.
- When the file exists, `validate` and `export` compare it and report `asset.lock-mismatch` (warning) for every pack or font added, removed or changed, on the lock file.
- No lock means nothing is reported: locking is a project's choice, made strict in CI with `--strict`.

### D9. Where checks run

`Workspace.assets()` discovers and checks assets once and caches the result. It is invalidated by any change under `assets/`, the lock or the manifest. Asset diagnostics are grouped by file. Project compilation checks the icon values of every diagram, class and rule against the registry: an unknown prefix is `asset.unknown-pack`, and an unknown name `asset.unknown-icon`, with close names in the hint. The CLI prints asset diagnostics with the manifest's.

| Alternative | Why not |
|---|---|
| Bundling all of Iconify | Not approved for download, mixed licences, megabytes of JSON |
| Rendering icons with `<use>` or `<image>` | Not portable to office applications, and external references are banned |
| Per-icon content normalisation | Breaks the balance of grid-designed icons |

## Risks / Trade-offs

- [Path flattening approximates arcs and curves] → It is used only for the optical ratio and bounding boxes. A pixel of error does not change the scale noticeably.
- [Sanitising rejects masks, clips and `use`] → The message names the element. Icon sets built with them are rare; such icons can be flattened with any vector editor.
- [Hashing large packs on every validation] → Hashes are computed only when a lock exists, and are cached by file text in the workspace.
