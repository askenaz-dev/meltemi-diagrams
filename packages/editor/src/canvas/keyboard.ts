import { keyMessages, type KeyCommand } from "../messages/keys.js";

/** Commands of the canvas that keys, menus and toolbar buttons trigger. */
export type CanvasCommand =
  | "selectAll"
  | "clearSelection"
  | "selectNext"
  | "selectPrevious"
  | "selectLeft"
  | "selectRight"
  | "selectUp"
  | "selectDown"
  /** The shape painted below the selected one under the same point (Alt+click, the menu). */
  | "selectBelow"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeUp"
  | "nudgeDown"
  | "nudgeLeftGrid"
  | "nudgeRightGrid"
  | "nudgeUpGrid"
  | "nudgeDownGrid"
  | "narrowerGrid"
  | "widerGrid"
  | "shorterGrid"
  | "tallerGrid"
  | "editLabel"
  | "renameId"
  | "delete"
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "group"
  | "ungroup"
  | "alignLeft"
  | "alignRight"
  | "alignTop"
  | "alignBottom"
  | "distributeHorizontal"
  | "distributeVertical"
  | "connect"
  | "relationTool"
  | "createNode"
  | "createDecision"
  | "createData"
  | "createNote"
  | "createTag"
  | "createGroup"
  | "createBox"
  | "createText"
  | "createIcon"
  | "createImage"
  /** Free diagrams: a sticky near the centre, with its editor open. */
  | "createSticky"
  /** Free diagrams: the pen, which stays armed after each stroke. */
  | "penTool"
  /** Free diagrams: the pen with the highlighter's colour, width and opacity. */
  | "highlighterTool"
  /** Free diagrams: the eraser, which deletes the pens it crosses. */
  | "eraserTool"
  /**
   * Free diagrams: after the selected child of a list, what the list's **+** adds at its end (a
   * sticky in a column, a column in a row).
   */
  | "addToList"
  /** Free diagrams: the selected child of a list before its neighbour in the list's order. */
  | "moveInListBefore"
  /** Free diagrams: the selected child of a list after its neighbour in the list's order. */
  | "moveInListAfter"
  /** The grid of the twenty-four shapes of the box (free) or node (flow) button. */
  | "openShapes"
  | "bringToFront"
  | "sendToBack"
  | "bringForward"
  | "sendBackward"
  | "convertToFree"
  | "createParticipant"
  | "createActor"
  | "createSequenceNote"
  | "createFragment"
  | "createDivider"
  | "createDelay"
  | "moveEventUp"
  | "moveEventDown"
  | "toggleActivation"
  | "nestInCall"
  | "unnestCall"
  | "addReturn"
  | "addEntity"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "zoomFit"
  | "zoomSelection"
  | "toggleLayers"
  | "toggleLibraries"
  /** The Pointer tool: a trail that points at the diagram and edits nothing. */
  | "togglePointer"
  | "contextMenu";

export interface KeyBinding {
  /** `KeyboardEvent.key` (case-insensitive) or `KeyboardEvent.code`. */
  readonly key: string;
  /** Ctrl on Windows and Linux, Cmd on macOS. */
  readonly primary?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly command: CanvasCommand;
  /** What the key does, in the interface language at the time it is read. */
  readonly description: string;
  /** The profile the key applies to; every profile when absent. */
  readonly profile?: "flow" | "free" | "sequence" | "c4";
}

/** A binding whose description is its command's, read in the interface language when asked. */
function bind(binding: Omit<KeyBinding, "command" | "description"> & { command: KeyCommand }) {
  return {
    ...binding,
    get description(): string {
      return keyMessages()[binding.command];
    },
  } satisfies KeyBinding;
}

const arrows = [
  ["ArrowLeft", "Left"],
  ["ArrowRight", "Right"],
  ["ArrowUp", "Up"],
  ["ArrowDown", "Down"],
] as const;

/**
 * Every key of the canvas. They apply only while the canvas has focus, and avoid VS Code's global
 * keys: Ctrl+G, Ctrl+K chords, Ctrl+Alt+arrows and Alt+Left or Right belong to the workbench, and
 * VS Code itself sends Ctrl+Z and Ctrl+Y to the document.
 */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  bind({ key: "a", primary: true, command: "selectAll" }),
  bind({ key: "Escape", command: "clearSelection" }),
  bind({ key: "Tab", command: "selectNext" }),
  bind({ key: "Tab", shift: true, command: "selectPrevious" }),
  ...arrows.map(([key, name]) => bind({ key, primary: true, command: `select${name}` })),
  ...arrows.map(([key, name]) => bind({ key, command: `nudge${name}` })),
  ...arrows.map(([key, name]) => bind({ key, shift: true, command: `nudge${name}Grid` })),
  bind({ key: "ArrowLeft", alt: true, shift: true, command: "narrowerGrid" }),
  bind({ key: "ArrowRight", alt: true, shift: true, command: "widerGrid" }),
  bind({ key: "ArrowUp", alt: true, shift: true, command: "shorterGrid" }),
  bind({ key: "ArrowDown", alt: true, shift: true, command: "tallerGrid" }),
  bind({ key: "Enter", command: "editLabel" }),
  bind({ key: "F2", command: "editLabel" }),
  bind({ key: "F2", shift: true, command: "renameId" }),
  bind({ key: "Delete", command: "delete" }),
  bind({ key: "Backspace", command: "delete" }),
  bind({ key: "c", primary: true, command: "copy" }),
  bind({ key: "x", primary: true, command: "cut" }),
  bind({ key: "v", primary: true, command: "paste" }),
  bind({ key: "d", primary: true, command: "duplicate" }),
  bind({ key: "g", alt: true, command: "group" }),
  bind({ key: "g", alt: true, shift: true, command: "ungroup" }),
  bind({ key: "ArrowLeft", primary: true, shift: true, command: "alignLeft" }),
  bind({ key: "ArrowRight", primary: true, shift: true, command: "alignRight" }),
  bind({ key: "ArrowUp", primary: true, shift: true, command: "alignTop" }),
  bind({ key: "ArrowDown", primary: true, shift: true, command: "alignBottom" }),
  bind({ key: "h", primary: true, alt: true, command: "distributeHorizontal" }),
  bind({ key: "v", primary: true, alt: true, command: "distributeVertical" }),
  bind({ key: "BracketRight", primary: true, shift: true, command: "bringToFront" }),
  bind({ key: "BracketLeft", primary: true, shift: true, command: "sendToBack" }),
  bind({ key: "BracketRight", primary: true, command: "bringForward" }),
  bind({ key: "BracketLeft", primary: true, command: "sendBackward" }),
  bind({ key: "c", command: "connect" }),
  bind({ key: "r", command: "relationTool" }),
  bind({ key: "n", command: "createNode", profile: "flow" }),
  bind({ key: "d", command: "createDecision", profile: "flow" }),
  bind({ key: "s", command: "createData", profile: "flow" }),
  bind({ key: "o", command: "createNote", profile: "flow" }),
  bind({ key: "o", command: "createNote", profile: "free" }),
  bind({ key: "o", command: "createNote", profile: "c4" }),
  bind({ key: "t", command: "createTag", profile: "flow" }),
  // On a sequence diagram T tags the selected message or participant (`addTag`).
  bind({ key: "t", command: "createTag", profile: "sequence" }),
  // The icon picker, on flow and free diagrams: I again closes it.
  bind({ key: "i", command: "createIcon", profile: "flow" }),
  bind({ key: "b", command: "createBox", profile: "free" }),
  bind({ key: "t", command: "createText", profile: "free" }),
  bind({ key: "i", command: "createIcon", profile: "free" }),
  bind({ key: "m", command: "createImage", profile: "free" }),
  // The whiteboard: S, P, H and E are the words' initials, free on the free profile (S and P
  // belong to the data store in flow and to participants in sequence diagrams).
  bind({ key: "s", command: "createSticky", profile: "free" }),
  bind({ key: "p", command: "penTool", profile: "free" }),
  bind({ key: "h", command: "highlighterTool", profile: "free" }),
  bind({ key: "e", command: "eraserTool", profile: "free" }),
  bind({ key: "Enter", primary: true, command: "addToList", profile: "free" }),
  // Up and Down in a row as in a column: Alt+Left and Alt+Right belong to the workbench.
  bind({ key: "ArrowUp", alt: true, command: "moveInListBefore", profile: "free" }),
  bind({ key: "ArrowDown", alt: true, command: "moveInListAfter", profile: "free" }),
  // F, not S, opens the shapes: S is the data store in flow; sequence diagrams keep F for fragments.
  bind({ key: "f", command: "openShapes", profile: "flow" }),
  bind({ key: "f", command: "openShapes", profile: "free" }),
  bind({ key: "p", command: "createParticipant", profile: "sequence" }),
  bind({ key: "a", command: "createActor", profile: "sequence" }),
  bind({ key: "o", command: "createSequenceNote", profile: "sequence" }),
  bind({ key: "f", command: "createFragment", profile: "sequence" }),
  bind({ key: "ArrowUp", alt: true, command: "moveEventUp", profile: "sequence" }),
  bind({ key: "ArrowDown", alt: true, command: "moveEventDown", profile: "sequence" }),
  bind({ key: "a", alt: true, command: "toggleActivation", profile: "sequence" }),
  // N for nest: N alone creates a node on flow and does nothing on sequence.
  bind({ key: "n", alt: true, command: "nestInCall", profile: "sequence" }),
  bind({ key: "n", alt: true, shift: true, command: "unnestCall", profile: "sequence" }),
  bind({ key: "r", alt: true, command: "addReturn", profile: "sequence" }),
  bind({ key: "a", command: "addEntity", profile: "c4" }),
  bind({ key: "g", command: "createGroup" }),
  bind({ key: "l", command: "toggleLayers" }),
  bind({ key: "u", command: "toggleLibraries" }),
  // Points at the diagram: on every profile, and on a read-only canvas too.
  bind({ key: "k", command: "togglePointer" }),
  bind({ key: "+", command: "zoomIn" }),
  bind({ key: "=", command: "zoomIn" }),
  bind({ key: "-", command: "zoomOut" }),
  bind({ key: "Digit0", shift: true, command: "zoomReset" }),
  bind({ key: "Digit1", shift: true, command: "zoomFit" }),
  bind({ key: "Digit2", shift: true, command: "zoomSelection" }),
  bind({ key: "F10", shift: true, command: "contextMenu" }),
  bind({ key: "ContextMenu", command: "contextMenu" }),
];

export interface KeyEventLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * The command of a key press, if the canvas handles it. `mac` uses Cmd as the primary key; the
 * profile of the diagram picks the creation keys.
 */
export function commandFor(
  event: KeyEventLike,
  mac = false,
  profile: "flow" | "free" | "sequence" | "c4" = "flow",
): CanvasCommand | undefined {
  const primary = mac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  for (const binding of KEY_BINDINGS) {
    if (binding.profile && binding.profile !== profile) continue;
    const matches =
      binding.key === event.code ||
      binding.key === key ||
      (binding.key.length === 1 && binding.key === key.toLowerCase());
    if (!matches) continue;
    if (!!binding.primary !== primary) continue;
    if (!!binding.alt !== event.altKey) continue;
    // `+` needs Shift on many layouts; it matches either way.
    if (binding.key !== "+" && !!binding.shift !== event.shiftKey) continue;
    return binding.command;
  }
  return undefined;
}
