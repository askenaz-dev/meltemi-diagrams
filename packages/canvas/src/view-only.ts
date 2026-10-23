import type { CanvasCommand, CanvasMessage } from "@meltemi/diagrams-editor/canvas";

/**
 * What a read-only canvas (`CanvasSettings.readOnly`) still does with the keyboard and the menus:
 * look around, never write. A list of what stays, so a command added later is refused until it is
 * put here on purpose.
 */
const VIEW_COMMANDS: ReadonlySet<CanvasCommand> = new Set<CanvasCommand>([
  "selectAll",
  "clearSelection",
  "selectNext",
  "selectPrevious",
  "selectLeft",
  "selectRight",
  "selectUp",
  "selectDown",
  // The shape painted below the selected one: selecting only looks.
  "selectBelow",
  // Copying puts the selection on the clipboard; nothing changes in the document.
  "copy",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "zoomFit",
  "zoomSelection",
  // Layers are shown and hidden on the canvas (nothing is written); the menu is cut down.
  "toggleLayers",
  "contextMenu",
]);

/** Whether a command of the canvas may run while the canvas is read-only. */
export function viewCommand(command: CanvasCommand): boolean {
  return VIEW_COMMANDS.has(command);
}

/**
 * Whether a key press is undo or redo (Ctrl or Cmd with Z, Shift+Z or Y). The canvas has no
 * binding for them: the host does it (VS Code's document, the playground's page). A read-only
 * canvas keeps them from reaching the host, which has nothing of the viewer's to undo.
 */
export function undoRedoKey(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): boolean {
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y");
}

/**
 * Whether a message to the host would change the document, or open what changes it: an action
 * (every plan starts there), a new theme, a token of the theme, the theme panel's opening and the
 * icons added to the project. A read-only canvas sends none of them.
 */
export function writesDocument(message: CanvasMessage): boolean {
  switch (message.type) {
    case "action":
    case "newTheme":
    case "themeToken":
    case "addIcons":
      return true;
    case "editTheme":
      return message.open;
    default:
      return false;
  }
}
