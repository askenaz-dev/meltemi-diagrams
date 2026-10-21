# @meltemi/diagrams-canvas

The canvas: the browser application that draws a diagram beside its code and turns every gesture
(move, resize, route, label, group, align, play) into a small edit of the text. It runs in a host
that implements `CanvasHostApi`, such as the VS Code webview or the playground, and styles itself
with `canvas.css`.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-canvas
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```js
import { CanvasApp } from "@meltemi/diagrams-canvas";
import { resolveLocale, setLocale } from "@meltemi/diagrams-i18n";
import "@meltemi/diagrams-canvas/canvas.css";

// The interface language, English or Spanish, is set before the canvas is created.
const locale = resolveLocale(navigator.language);
setLocale(locale);
document.documentElement.lang = locale;
// `host` posts canvas messages to the editor services and delivers their answers.
const app = new CanvasApp(document.getElementById("canvas"), host);
```

The canvas speaks the interface language of `@meltemi/diagrams-i18n`: its toolbar, palette,
menus, inspector controls, dialogs, announcements and story timeline. The words the host sends,
such as field labels and statuses, are shown as they arrive. The page's `lang` lets the stylesheet
make room for longer words.

A host can make the canvas only show by sending `readOnly: true` in the settings of its `settings`
message (`CanvasSettings`, in `@meltemi/diagrams-editor`); each `settings` message replaces the
settings as a whole, so a later one without it makes the canvas edit again, with no reload. While
it is on the canvas sends no message that changes the document, and selection, zoom, pan, the
minimap, stories and effects keep working ([editor guide](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/editor.md)).
A host that never sends it, such as the VS Code extension, sees no change.

A host that shares the diagram can show who else is in it with `presence` messages (`HostMessage`,
in `@meltemi/diagrams-editor`): the other people, each with a name, a colour and the ids they have
selected. The canvas draws an outline in the person's colour around each of those and a tag with
the name (always text, never markup) on a layer above the scene that is never selected, copied or
exported and that nothing of is sent back. Each message replaces the last; a message with nobody,
an empty canvas or another diagram clears it, and ids the diagram does not have are ignored.

Popovers, menus, side panels, tooltips and target outlines open and close with short transitions
on the motion tokens of `canvas.css` (`--mdg-motion-fast`, `--mdg-motion`, `--mdg-motion-slow`,
`--mdg-ease`). When the system asks for reduced motion they are zero and nothing moves.

## Documentation

- [Editor guide](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/editor.md)
- [Playground](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/playground.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
