import { createNodeIconPacks, createNodeLibraries } from "@meltemi/diagrams-assets/node";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { isAbsolute, join, resolve } from "node:path";
import { ProjectSessions as HostSessions, type ProjectSessionsOptions } from "./projects.js";

export type { ProjectDefaults, ProjectSessionsOptions } from "./projects.js";

/**
 * Project sessions over the local file system, the installed fonts and icons and the installed
 * ELK, unless the options give others.
 */
export class ProjectSessions extends HostSessions {
  constructor(options: ProjectSessionsOptions) {
    super(options, {
      host: createNodeHost,
      fonts: createNodeFontLibrary,
      iconPacks: createNodeIconPacks,
      libraries: createNodeLibraries,
    });
  }
}

/**
 * Where profile outputs go: in `out` when given (relative to `cwd`), otherwise beside the file in
 * `folder`; a profile's name may hold `/`-separated folders.
 */
export function profileOutputs(
  folder: string,
  out: string | undefined,
  cwd: string,
): (name: string) => string {
  const root = out === undefined ? folder : isAbsolute(out) ? out : resolve(cwd, out);
  return (name) => join(root, ...name.split("/"));
}

export {
  MAX_PIXELS,
  VIDEO_DEFAULTS,
  WRITABLE_FORMATS,
  produceExport,
  profileRequest,
  type ExportContext,
  type ExportOutput,
  type ExportRequest,
  type WritableFormat,
} from "./exports.js";
export {
  childViews,
  openTargetOf,
  resolveLink,
  viewClosure,
  viewRefKey,
  type LinkPlace,
  type ViewFilter,
  type ViewRef,
} from "./drill.js";
export {
  buildCatalog,
  isExcluded,
  type CatalogBuild,
  type CatalogOptions,
  type SkippedEntry,
} from "./catalog.js";
export {
  REVIEW_COLOURS,
  reviewProjects,
  type Review,
  type ReviewDiagram,
  type ReviewFile,
  type ReviewOptions,
  type ReviewSide,
} from "./review.js";
export {
  applyAssist,
  checkInProject,
  prepareAssist,
  prepareExplain,
  runAssist,
  runExplain,
  type AssistInput,
  type PreparedAssist,
  type PreparedExplain,
} from "./assist.js";
export { gitRevisionHost } from "./git.js";
