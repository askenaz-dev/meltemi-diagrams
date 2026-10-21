## 1. Language and layout

- [x] 1.1 Model: a percentage after a compass route end (`RouteEndpoint.position`), its checks (Spanish and English messages), model JSON `position`; grammar and formatter accept it
- [x] 1.2 Layout: positioned ends anchor like named ports (no waypoint projection, no lanes); the ELK request gets ports at those positions

## 2. Edits and canvas

- [x] 2.1 Edit: `setRoute` (`fromPosition`, `toPosition`), `reconnectRelation` and `createRelation` (`position`, `fromPosition`, `toPosition`) write positions; removing the last thing of a route removes it
- [x] 2.2 Editor session and protocol: `setEnd` and `connect` carry the point (`position`), a null port frees an end; anonymous relations named as for other route edits
- [x] 2.3 Canvas: anchor points shown while dragging an end or a connection, snapping (points, Alt, border, inside), the preview at the snapped point, double-click on an end; announcements in both languages

## 3. Tests and documentation

- [x] 3.1 Unit tests (model, layout, ELK, edit, session), a corpus case, a webview test (drop on the middle of a side, connect to a point, double-click), English and Spanish
- [x] 3.2 Docs (`layout.md`, `svg-export.md`, `grammar-0.2.md`, `editor.md` and their Spanish versions), decision 0038, CHANGELOG; typecheck, lint, every suite, conformance
