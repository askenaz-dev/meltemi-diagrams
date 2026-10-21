import type { ExportRequest, WritableFormat } from "@meltemi/diagrams-editor";
import { produceExport, type ProjectSessions } from "@meltemi/diagrams-editor/node";
import { playerScript } from "@meltemi/diagrams-player/node";

/** A request with the CLI's defaults for a diagram or a story of a file. */
export function requestFor(
  sessions: ProjectSessions,
  path: string,
  target: { readonly diagram: string } | { readonly story: string },
  format: WritableFormat,
  options: Partial<ExportRequest> = {},
): ExportRequest {
  const workspace = sessions.forFile(path);
  const file = workspace.file(path);
  if (!file) throw new Error(`${path} is not a file of its project.`);
  let resolved: ExportRequest["target"];
  if ("diagram" in target) {
    const diagram = file.compilation.document.diagrams.find((d) => d.id === target.diagram);
    if (!diagram) throw new Error(`No diagram ${target.diagram} in ${path}.`);
    resolved = { kind: "diagram", diagram, owner: file };
  } else {
    const story = file.compilation.document.stories.find((s) => s.id === target.story);
    if (!story) throw new Error(`No story ${target.story} in ${path}.`);
    resolved = { kind: "story", story };
  }
  return {
    target: resolved,
    format,
    theme: null,
    fonts: "embedded",
    motion: "static",
    at: null,
    scenario: undefined,
    scale: 2,
    size: null,
    background: null,
    link: null,
    embed: false,
    autoplay: false,
    loop: false,
    fps: null,
    durationMs: null,
    out: null,
    ...options,
  };
}

/** Produces an export of a file as the CLI does: a text, a capture job or a video job. */
export function exportOf(sessions: ProjectSessions, path: string, request: ExportRequest) {
  const workspace = sessions.forFile(path);
  const file = workspace.file(path)!;
  const output = produceExport(
    {
      file,
      workspace,
      projects: sessions,
      playerScript,
      report: () => undefined,
      printed: new Set(),
    },
    request,
  );
  if ("problem" in output) throw new Error(`${path}: ${output.problem}`);
  return output;
}
