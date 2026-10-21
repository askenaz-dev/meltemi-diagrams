import {
  KEY_BINDINGS,
  type CanvasAction,
  type CanvasCommand,
  type CanvasMessage,
} from "@meltemi/diagrams-editor/canvas";
import { describe, expect, it } from "vitest";
import { undoRedoKey, viewCommand, writesDocument } from "../src/view-only.js";

/**
 * What a read-only canvas does with every command: `true` for the ones that only look. A command
 * added to the canvas must be sorted here (the type forces it), so that it is refused on purpose.
 */
const COMMANDS = {
  selectAll: true,
  clearSelection: true,
  selectNext: true,
  selectPrevious: true,
  selectLeft: true,
  selectRight: true,
  selectUp: true,
  selectDown: true,
  selectBelow: true,
  copy: true,
  zoomIn: true,
  zoomOut: true,
  zoomReset: true,
  zoomFit: true,
  zoomSelection: true,
  toggleLayers: true,
  contextMenu: true,
  nudgeLeft: false,
  nudgeRight: false,
  nudgeUp: false,
  nudgeDown: false,
  nudgeLeftGrid: false,
  nudgeRightGrid: false,
  nudgeUpGrid: false,
  nudgeDownGrid: false,
  narrowerGrid: false,
  widerGrid: false,
  shorterGrid: false,
  tallerGrid: false,
  editLabel: false,
  renameId: false,
  delete: false,
  cut: false,
  paste: false,
  duplicate: false,
  group: false,
  ungroup: false,
  alignLeft: false,
  alignRight: false,
  alignTop: false,
  alignBottom: false,
  distributeHorizontal: false,
  distributeVertical: false,
  connect: false,
  relationTool: false,
  createNode: false,
  createDecision: false,
  createData: false,
  createNote: false,
  createTag: false,
  createGroup: false,
  createBox: false,
  createText: false,
  createIcon: false,
  createImage: false,
  openShapes: false,
  bringToFront: false,
  sendToBack: false,
  bringForward: false,
  sendBackward: false,
  convertToFree: false,
  createParticipant: false,
  createActor: false,
  createSequenceNote: false,
  createFragment: false,
  createDivider: false,
  createDelay: false,
  moveEventUp: false,
  moveEventDown: false,
  toggleActivation: false,
  addEntity: false,
  toggleLibraries: false,
} as const satisfies Record<CanvasCommand, boolean>;

describe("the commands of a read-only canvas", () => {
  it("runs the ones that look and refuses the ones that write", () => {
    for (const [command, looks] of Object.entries(COMMANDS)) {
      expect(viewCommand(command as CanvasCommand), command).toBe(looks);
    }
  });

  it("refuses the keys that edit: Delete, Backspace, Ctrl+D, Ctrl+X, Ctrl+V, Enter and the arrows", () => {
    const keyed = (key: string) =>
      KEY_BINDINGS.filter((b) => b.key === key && !b.shift && !b.alt).map((b) => b.command);
    for (const key of ["Delete", "Backspace", "Enter", "F2", "d", "x", "v"]) {
      for (const command of keyed(key))
        expect(viewCommand(command), `${key}: ${command}`).toBe(false);
    }
    // The plain arrows nudge the selection; with Ctrl they only move it.
    for (const binding of KEY_BINDINGS.filter((b) => b.key.startsWith("Arrow"))) {
      const moves = binding.command.startsWith("select");
      expect(viewCommand(binding.command), `${binding.key}: ${binding.command}`).toBe(moves);
    }
  });

  it("keeps every key that zooms, selects or opens the menu", () => {
    for (const binding of KEY_BINDINGS) {
      if (/^(zoom|select|clearSelection|contextMenu)/.test(binding.command)) {
        expect(viewCommand(binding.command), binding.command).toBe(true);
      }
    }
  });
});

/** Every kind of action, which is how a plan reaches the host. */
const ACTIONS: readonly CanvasAction[] = [
  { kind: "move", ids: ["a"], delta: { x: 1, y: 0 } },
  { kind: "resize", id: "a", box: { x: 0, y: 0, width: 10, height: 10 } },
  { kind: "moveLabel", relation: "r", delta: { x: 1, y: 0 } },
  { kind: "setVia", relation: "r", via: [] },
  { kind: "setEnd", relation: "r", end: "to", element: "a", port: null },
  { kind: "create", elementKind: "node", at: { x: 0, y: 0 } },
  { kind: "connect", from: "a", to: "b", line: "solid" },
  { kind: "remove", ids: ["a"], cascade: false },
  { kind: "setLabel", id: "a", label: "A" },
  { kind: "renameId", id: "a", newId: "b" },
  { kind: "group", ids: ["a"] },
  { kind: "ungroup", id: "g" },
  { kind: "convertToContainer", id: "a" },
  { kind: "align", ids: ["a", "b"], edge: "left" },
  { kind: "distribute", ids: ["a", "b", "c"], axis: "horizontal" },
  { kind: "setField", ids: ["a"], field: "label", value: "A" },
  { kind: "setIcon", ids: ["a"], icon: "tabler:server" },
  { kind: "removeIcon", ids: ["a"] },
  { kind: "paste" },
  { kind: "duplicate", ids: ["a"] },
  { kind: "cut", ids: ["a"] },
  { kind: "arrange", scope: "all" },
  { kind: "reorder", ids: ["a"], to: "front" },
  { kind: "addLayer" },
  { kind: "renameLayer", layer: "l", name: "m" },
  { kind: "removeLayer", layer: "l" },
  { kind: "moveLayer", layer: "l", direction: "up" },
  { kind: "setLayer", ids: ["a"], layer: null },
  { kind: "convert" },
  { kind: "moveEvent", id: "e", direction: "up" },
  { kind: "toggleActivation", ids: ["r"] },
  { kind: "insertEvent", eventKind: "note", ids: [] },
  { kind: "includeEntity", entity: "shop.web" },
  { kind: "wrap", ids: ["r"], operator: "alt" },
  { kind: "setStoryTiming", story: "s", path: [0], durationMs: 100 },
  { kind: "addToScene", story: "s", scene: "o", action: "reveal", ids: ["a"] },
  { kind: "removeStoryAction", story: "s", path: [0, 0] },
  { kind: "insertScene", story: "s" },
  { kind: "createDiagram", type: "flow" },
  // A preview writes nothing, but it only follows a drag, which a read-only canvas never starts.
  { kind: "preview", token: 1, action: { kind: "move", ids: ["a"], delta: { x: 1, y: 0 } } },
];

/** A message of every type, and whether a read-only canvas may send it. */
const MESSAGES = {
  ready: [{ message: { type: "ready" }, writes: false }],
  pickDiagram: [{ message: { type: "pickDiagram", diagram: "d" }, writes: false }],
  pickScenario: [{ message: { type: "pickScenario", scenario: null }, writes: false }],
  select: [{ message: { type: "select", ids: ["a"] }, writes: false }],
  action: ACTIONS.map((action) => ({
    message: { type: "action", revision: 1, action } satisfies CanvasMessage,
    writes: true,
  })),
  copy: [{ message: { type: "copy", ids: ["a"] }, writes: false }],
  focusText: [{ message: { type: "focusText", id: "a" }, writes: false }],
  export: [{ message: { type: "export" }, writes: false }],
  openModel: [{ message: { type: "openModel" }, writes: false }],
  playEffects: [{ message: { type: "playEffects", on: true }, writes: false }],
  pickStory: [{ message: { type: "pickStory", story: "s" }, writes: false }],
  exportPlayer: [{ message: { type: "exportPlayer", story: null }, writes: false }],
  libraries: [{ message: { type: "libraries" }, writes: false }],
  libraryItems: [{ message: { type: "libraryItems", library: "l", category: "c" }, writes: false }],
  librarySearch: [{ message: { type: "librarySearch", query: "q" }, writes: false }],
  searchIcons: [{ message: { type: "searchIcons", query: "q", token: 1 }, writes: false }],
  newTheme: [{ message: { type: "newTheme", id: "t", scope: "file" }, writes: true }],
  editTheme: [
    { message: { type: "editTheme", open: true }, writes: true },
    { message: { type: "editTheme", open: false }, writes: false },
  ],
  themeToken: [{ message: { type: "themeToken", token: "accent", value: "#fff" }, writes: true }],
} as const satisfies Record<
  CanvasMessage["type"],
  readonly { readonly message: CanvasMessage; readonly writes: boolean }[]
>;

describe("the messages of a read-only canvas", () => {
  it("never sends one that changes the document, and sends every other", () => {
    for (const [type, samples] of Object.entries(MESSAGES)) {
      for (const { message, writes } of samples) {
        expect(writesDocument(message), `${type}: ${JSON.stringify(message)}`).toBe(writes);
      }
    }
  });

  it("lists every kind of action once, and every one is a write", () => {
    // The record is complete by its type: a new kind of action must be added to it, and so here.
    const every = {
      move: 1,
      resize: 1,
      moveLabel: 1,
      setVia: 1,
      setEnd: 1,
      create: 1,
      connect: 1,
      remove: 1,
      setLabel: 1,
      renameId: 1,
      group: 1,
      ungroup: 1,
      convertToContainer: 1,
      align: 1,
      distribute: 1,
      setField: 1,
      setIcon: 1,
      removeIcon: 1,
      paste: 1,
      duplicate: 1,
      cut: 1,
      arrange: 1,
      reorder: 1,
      addLayer: 1,
      renameLayer: 1,
      removeLayer: 1,
      moveLayer: 1,
      setLayer: 1,
      convert: 1,
      moveEvent: 1,
      toggleActivation: 1,
      insertEvent: 1,
      includeEntity: 1,
      wrap: 1,
      setStoryTiming: 1,
      addToScene: 1,
      removeStoryAction: 1,
      insertScene: 1,
      createDiagram: 1,
      preview: 1,
    } as const satisfies Record<CanvasAction["kind"], 1>;
    expect(ACTIONS.map((a) => a.kind).sort()).toEqual(Object.keys(every).sort());
    for (const action of ACTIONS) {
      expect(writesDocument({ type: "action", revision: 1, action }), action.kind).toBe(true);
    }
  });
});

describe("the undo and redo keys", () => {
  const press = (
    key: string,
    modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
  ) => ({
    key,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    altKey: modifiers.alt ?? false,
  });

  it("are Ctrl or Cmd with Z or Y, in either case", () => {
    expect(undoRedoKey(press("z", { ctrl: true }))).toBe(true);
    expect(undoRedoKey(press("Z", { ctrl: true }))).toBe(true);
    expect(undoRedoKey(press("y", { ctrl: true }))).toBe(true);
    expect(undoRedoKey(press("z", { meta: true }))).toBe(true);
    expect(undoRedoKey(press("Z", { meta: true }))).toBe(true);
  });

  it("are not the other keys, nor Z without Ctrl or Cmd, nor Alt chords", () => {
    expect(undoRedoKey(press("z"))).toBe(false);
    expect(undoRedoKey(press("y"))).toBe(false);
    expect(undoRedoKey(press("c", { ctrl: true }))).toBe(false);
    expect(undoRedoKey(press("d", { ctrl: true }))).toBe(false);
    expect(undoRedoKey(press("z", { ctrl: true, alt: true }))).toBe(false);
    expect(undoRedoKey(press("Delete"))).toBe(false);
  });
});
