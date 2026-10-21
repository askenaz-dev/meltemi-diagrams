/**
 * The review by id of a push (`cli-cloud`, "Push"): what pushing the folder would change in the
 * diagrams of the cloud project, by element id, printed beside the list of paths that differ.
 *
 * It is the existing review (`reviewProjects`, decision 0028) with the cloud's texts as the version
 * before and the folder's push set as the version after, both held in memory and rooted at the
 * folder, so that what is compared is exactly what a push would make of the cloud. It sees only the
 * semantic changes of the sources: a difference in `project.json`, a comment or an image is in the
 * list of paths but not in the review.
 */

import { ProjectSessions, reviewProjects } from "@meltemi/diagrams-editor/node";
import type { Review, ReviewFile } from "@meltemi/diagrams-editor/node";
import { describeChange } from "@meltemi/diagrams-model";
import { createMemoryHost, joinPath, toProjectPath } from "@meltemi/diagrams-project";
import { printablePath } from "./cloud-paths.js";
import { messages } from "./messages/index.js";

/** The review from the cloud's texts to the folder's, both by path. */
export function reviewTexts(
  folder: string,
  cloudTexts: ReadonlyMap<string, string>,
  folderTexts: ReadonlyMap<string, string>,
  toolVersion: string,
): Review {
  const root = toProjectPath(folder);
  const side = (texts: ReadonlyMap<string, string>) => {
    const host = createMemoryHost(
      Object.fromEntries([...texts].map(([path, text]) => [joinPath(root, path), text])),
    );
    const projects = new ProjectSessions({ toolVersion, host });
    return { workspace: projects.forFolder(root), projects, scope: null };
  };
  return reviewProjects(side(cloudTexts), side(folderTexts), { images: false });
}

const SIGNS: Readonly<Record<ReviewFile["status"], string>> = {
  added: "+",
  removed: "-",
  renamed: ">",
  changed: "~",
};

/** The lines `review` prints for a file: its path and the changes under it, by id. */
function fileLines(file: ReviewFile): string[] {
  const head = file.status === "renamed" ? `${file.from} → ${file.path}` : `${file.path}`;
  const lines = [`${SIGNS[file.status]} ${head}`];
  const top = file.changes.filter((c) => c.scope === null);
  for (const c of top) {
    lines.push(`    ${describeChange(c)}`);
    for (const x of file.changes.filter((x) => x.scope === c.id)) {
      lines.push(`        ${describeChange(x)}`);
    }
  }
  const scopes = [...new Set(file.changes.map((c) => c.scope).filter((s) => s !== null))];
  const t = messages().review;
  for (const scope of scopes) {
    if (top.some((c) => c.id === scope)) continue;
    const kind = file.scopes[scope!];
    lines.push(`    ${kind === undefined ? t.block : t.scopes[kind]} ${scope}`);
    for (const x of file.changes.filter((c) => c.scope === scope)) {
      lines.push(`        ${describeChange(x)}`);
    }
  }
  return lines;
}

/** What `review` prints for a review: every file's lines, then the summary (or that nothing changed). */
export function reviewLines(review: Review): string[] {
  const t = messages().review;
  const counts = { added: 0, removed: 0, renamed: 0, changed: 0 };
  for (const file of review.files) for (const change of file.changes) counts[change.kind]++;
  return [
    // Labels and values come from the cloud's texts, which a collaborator wrote: control characters
    // (an escape sequence could repaint the screen that precedes the question) are written out.
    ...review.files.flatMap(fileLines).map(printablePath),
    review.files.length === 0
      ? t.none
      : t.summary(
          review.files.length,
          counts.added,
          counts.removed,
          counts.renamed,
          counts.changed,
        ),
  ];
}
