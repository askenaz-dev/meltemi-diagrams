## 1. Language

- [x] 1.1 `export` profiles: options, per-format checks, `export.*` diagnostics, `Document.exports`, JSON; remove `block.unsupported`, `PARSE_ONLY_BLOCKS` and the parse-only corpus; corpus for each code.
- [x] 1.2 `url` on elements of every profile and on model entities; checks; JSON.

## 2. Scene and SVG

- [x] 2.1 Group `href` from element URLs (flow, free, sequence, C4), scene `link`, transparent background; renderer `<a>` elements.

## 3. Capture

- [x] 3.1 `@meltemi/diagrams-capture`: browser discovery, DevTools pipe client, PNG and PDF jobs, waiting for fonts and images, `capture` and `captureSync`; tests that decode PNG and inspect PDF.

## 4. CLI and editor

- [x] 4.1 `export --format png|pdf`, `--scale`, `--size`, `--background`, `--link`, `--profile`, `--profiles`; usage errors; tests.
- [x] 4.2 Language services for profiles and `url`; VS Code **Export PNG**, **Export PDF**, **Run Export Profile**; VS Code tests.

## 5. Docs

- [x] 5.1 `docs/language/export.md`, grammar, diagnostics, model JSON, svg-export, editor guide, README, skill reference, decision 0025; `pnpm skills:sync`.

## 6. Verification

- [x] 6.1 typecheck, lint, test, webview, VS Code, player browser tests, package, licences; review PNG and PDF output.
