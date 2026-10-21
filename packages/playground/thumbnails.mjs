// The pictures of the New project cards: each template's first diagram, rendered once when the site
// is built, as the static SVG the export writes, without embedded fonts (an <img> draws them with
// the system's), in the template's theme and in its dark counterpart. The page shows the one of its
// own theme. Rendered in Node with the editor's project sessions, over the template's files written
// to a scratch folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { ProjectSessions, produceExport } from "@meltemi/diagrams-editor/node";

/** The most bytes a thumbnail may take; the build refuses a larger one. */
export const THUMBNAIL_LIMIT = 200 * 1024;

const DEFAULT_THEME = "technical.light";

/** The dark counterpart of a theme: `x.light` gives `x.dark`, and a dark or custom theme itself. */
export function darkCounterpart(theme) {
  return theme.endsWith(".light") ? `${theme.slice(0, -".light".length)}.dark` : theme;
}

/** The file a template opens first: its first diagram (as the page's `templateEntry`). */
function entryOf(files) {
  const paths = Object.keys(files).sort();
  return (
    paths.find((p) => p.startsWith("diagrams/") && p.endsWith(".meltemi")) ??
    paths.find((p) => p.endsWith(".meltemi"))
  );
}

function svgRequest(diagram, owner, theme) {
  return {
    target: { kind: "diagram", diagram, owner },
    format: "svg",
    theme,
    fonts: "system",
    motion: "static",
    at: null,
    scenario: undefined,
    scale: 1,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    durationMs: null,
    out: null,
  };
}

/**
 * The light and dark thumbnails of a template whose files are given by project path. Throws when
 * the template has no diagram that draws, or when a picture is larger than `THUMBNAIL_LIMIT`.
 */
export function templateThumbnails(name, files, toolVersion) {
  const folder = mkdtempSync(join(tmpdir(), `pg-thumb-${name}-`));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    const entry = entryOf(files);
    if (!entry) throw new Error(`The ${name} template has no .meltemi file.`);
    const projects = new ProjectSessions({ toolVersion });
    const absolute = join(folder, entry).split(sep).join("/");
    const workspace = projects.forFile(absolute);
    const file = workspace.file(absolute);
    const diagram = file?.compilation.document.diagrams[0];
    if (!file || !diagram) throw new Error(`The ${name} template's ${entry} has no diagram.`);
    const context = {
      file,
      workspace,
      projects,
      playerScript: () => "",
      report: () => undefined,
      printed: new Set(),
    };
    const theme = diagram.theme ?? DEFAULT_THEME;
    const render = (themeName) => {
      const output = produceExport(context, svgRequest(diagram, file, themeName));
      if (!("text" in output)) {
        throw new Error(`The ${name} template's thumbnail could not be drawn: ${output.problem}`);
      }
      if (Buffer.byteLength(output.text) > THUMBNAIL_LIMIT) {
        throw new Error(
          `The ${name} template's thumbnail is larger than ${THUMBNAIL_LIMIT} bytes.`,
        );
      }
      return output.text;
    };
    return { light: render(theme), dark: render(darkCounterpart(theme)) };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
