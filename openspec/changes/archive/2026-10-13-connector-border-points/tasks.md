## 1. Edits

- [x] 1.1 `arrange` with scope `all` frees route ends (compass sides and points; named ports kept), removes waypoints and empty routes, reading route parts with `routeParts`; tests

## 2. Canvas

- [x] 2.1 `attachEnd`: any point of the border to 1 % within 12 px, magnets (side middles, corners, named ports) within 6 px, Alt without magnets, free inside; tests
- [x] 2.2 The overlay while dragging an end or a connection: the outline, the magnets, the point taken
- [x] 2.3 Connections from the border: hover ring outside boxes with its point and cursor, the press starts a connection pinned at that point; the protocol's `connect` pins start and end independently
- [x] 2.4 Webview tests: any point of the border, a connection from the border, arranging frees the ends

## 3. Documentation

- [x] 3.1 `docs/editor.md`, `docs/language/layout.md` (arrange), their Spanish versions; CHANGELOG 1.5.0, version 1.5.0; typecheck, lint, every suite, conformance, acceptance
