# 0031. The web playground: the same libraries in a static page

Status: accepted (web-playground change, 11 October 2026). Amended by
[0041](0041-hosted-service.md): served by the cloud service, the page offers an optional account.

## Context

The proposal makes the playground the entry to the product: templates and visible code, a useful
result before learning more, and a way to continue locally with the CLI and the editor without an
account. The roadmap asks for the same canvas and the same exports. The libraries already run in
any JavaScript host and the canvas already runs in a browser engine (the VS Code webview), but the
ELK adapter imported Node modules at load time, the project sessions and exports lived behind the
editor's Node entry, and the canvas lived inside the extension. A browser has no headless browser
to capture pictures and no FFmpeg to encode video.

## Decision

- **A static site, no server code.** `packages/playground` builds with esbuild into `dist/`: an
  ES-module page with the ELK worker in its own chunk, the fonts and Tabler data as files, the
  templates of `init`, the runtimes of exported players and catalogs, and the notices. Any static
  server serves it; hosting it is an owner action.
- **No network, no account.** A content security policy limits scripts, styles, fonts, images and
  connections to the page's origin (plus `data:` and `blob:`). Share links carry the project in
  the URL fragment, which is never sent; work stays in the browser's storage.
- **The same code.** `ProjectSessions`, `produceExport`, `profileRequest`, the layouts and the
  catalog build are host-neutral modules of `@meltemi/diagrams-editor` (the Node entry adds the
  local file system and installed packages as defaults). The ELK adapter reaches Node only when its
  default loader runs. The canvas application is `@meltemi/diagrams-canvas`, mounted by the
  extension's webview and by the page.
- **Projects in memory.** A `ProjectHost` over a map of files compiles templates, imports, models,
  stories, themes, images and profiles exactly as on disk. Archives (`.zip`) open and download
  projects that the CLI validates as they are.
- **Files on demand.** Fonts and icon data are read synchronously by the libraries; the page
  fetches what was missed and analyses again when it arrives, and exports settle until nothing is
  missing, so pictures are measured and embedded exactly as by the CLI.
- **Exports, the last step in the browser.** SVG and HTML are the CLI's text. PNG is the SVG drawn
  on a canvas. PDF opens the print dialog on the CLI's capture page (vectors with **Save as PDF**).
  GIF, WebM and MP4 draw the CLI's frames (`frameSvg` at `i × 1000 / fps`) and encode them with a
  GIF encoder and WebM and MP4 writers written for the page and the browser's WebCodecs encoders.
  Formats the browser cannot encode are disabled with the CLI command that makes them;
  transparent video is left to the CLI.
- **No AI in the page.** It would put a provider key in a web page and open the page's policy to
  provider origins; the first diagram needs no AI, and the CLI and the editor offer it.

## Alternatives considered

- **A server that compiles and exports.** Simpler exports, but it would receive the person's
  diagrams, need an operator and break the "nothing is sent" promise.
- **Monaco or CodeMirror for the code.** Rich, but downloads that were not approved and much larger
  than the code pane the editor's services need: a text area over a highlighted copy keeps native
  input, selection and accessibility.
- **An FFmpeg build in WebAssembly.** Not approved, tens of megabytes and a GPL obligation for
  libx264; WebCodecs is in the browser already.
- **The canvas in an iframe, as in VS Code.** Isolation the page does not need; mounting it in the
  page shares focus, undo and the clipboard simply.

## Consequences

- One canvas and one set of services serve VS Code and the page; a fix to either reaches both.
- The extension now ships every font file the library reads (the Fontsource subset tables were
  missing, so it embedded no subsets and measured Cascadia Mono with Inter); `bundledFontFiles()`
  lists them for every host.
- Video files from the page differ in bytes from the CLI's (other encoders), not in frames; the
  verification matrix (change 23) records both paths.
- `meltemi-diagrams convert --to json` writes the model JSON, which the page downloads too.
