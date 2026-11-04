// Icons of the explorer, as path data in the canvas's 16 × 16 style (see `ICONS` in `ui.ts`).

import { ICONS } from "../ui.js";
import { CLOUD_ICON, DUPLICATE_ICON } from "../cloud/icons.js";
import type { NodeIcon } from "./tree-model.js";

export const EXPLORER_ICONS = {
  folder: "M2 4.5h4.2l1.3 1.3H14v6.7H2z",
  folderOpen: "M2 12.5v-8h4.2l1.3 1.3H13v1.7|M2 12.5l1.7-5H15l-1.7 5z",
  chevron: "M6 4l4 4-4 4",
  flow: "M2.5 2.5h4.5v3.5H2.5z|M9 10h4.5v3.5H9z|M4.75 6v5.75H9",
  free: "M2.5 3h11v10h-11z|M4.5 10.5l2.2-2.8 2 2.1 1.5-1.4 1.8 2.1",
  sequence:
    "M4 2.5v11|M12 2.5v11|M4 6h7.3|M9.8 4.5L11.3 6 9.8 7.5|M12 10.5H4.7|M6.2 9L4.7 10.5 6.2 12",
  c4: "M2.5 2.5h11v11h-11z|M5 6h6v5H5z|M5 4.3h3",
  model: "M8 2l5.5 3v6L8 14l-5.5-3V5z|M2.5 5L8 8l5.5-3|M8 8v6",
  story: ICONS.story,
  theme:
    "M8 2.5a5.5 5.5 0 1 0 0 11c.9 0 1.2-.8.8-1.5-.5-.9 0-1.7 1-1.7h1.4a2.3 2.3 0 0 0 2.3-2.3c0-3-2.5-5.5-5.5-5.5z|M5.3 7.2h.01|M7.6 5.1h.01|M10.4 6h.01",
  image: ICONS.image,
  settings:
    "M8 5.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z|M8 1.8v1.7|M8 12.5v1.7|M1.8 8h1.7|M12.5 8h1.7|M3.6 3.6l1.2 1.2|M11.2 11.2l1.2 1.2|M3.6 12.4l1.2-1.2|M11.2 4.8l1.2-1.2",
  file: ICONS.file,
  newFolder: "M2 4.5h4.2l1.3 1.3H14v6.7H2z|M8 7.6v3.4|M6.3 9.3h3.4",
  newDiagram: ICONS.newFile,
  collapseAll: "M3 3.5h10v9H3z|M5.6 8h4.8",
  more: "M3.5 6.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z|M8 6.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z|M12.5 6.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z",
  sidebar: "M2.5 3h11v10h-11z|M6.2 3v10",
  browser: "M2.5 3.5h11v7h-11z|M1.5 12.5h13",
  cloud: CLOUD_ICON,
  move: "M2 4.5h4.2l1.3 1.3H14v6.7H2z|M5.5 9.2h5|M8.8 7.5l1.7 1.7-1.7 1.7",
  rename: ICONS.rename,
  duplicate: DUPLICATE_ICON,
  trash: ICONS.trash,
  download: ICONS.download,
  import: ICONS.import,
  plus: "M8 3v10|M3 8h10",
  restore: ICONS.restore,
  check: ICONS.check,
} as const;

/** The path data of a row's picture. */
export function nodeIcon(kind: NodeIcon, open = false): string {
  if (kind === "folder") return open ? EXPLORER_ICONS.folderOpen : EXPLORER_ICONS.folder;
  return EXPLORER_ICONS[kind];
}
