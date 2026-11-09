/** User-facing starting points, independent of a project's initial template. No engine imports. */
export const DIAGRAM_STARTERS = [
  "flow",
  "sequence",
  "c4",
  "gantt",
  "whiteboard",
  "kanban",
  "free",
] as const;

export type DiagramStarterId = (typeof DIAGRAM_STARTERS)[number];

export function isDiagramStarter(value: unknown): value is DiagramStarterId {
  return typeof value === "string" && (DIAGRAM_STARTERS as readonly string[]).includes(value);
}
