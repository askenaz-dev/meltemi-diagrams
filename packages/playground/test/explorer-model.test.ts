import { describe, expect, it } from "vitest";
import {
  ancestorKeys,
  buildTree,
  copyPath,
  diagramId,
  diagramPath,
  displayName,
  folderMoves,
  hiddenProblems,
  movesInto,
  newDiagramText,
  renamedPath,
  visibleRows,
  type TreeInput,
  type TreeNode,
} from "../src/explorer/tree-model.js";
import type { FileOutline } from "../src/studio.js";

const outline = (parts: Partial<FileOutline> = {}): FileOutline => ({
  diagrams: [],
  stories: [],
  models: 0,
  themes: 0,
  ...parts,
});

/** The purchase template as the explorer sees it. */
const PURCHASE: TreeInput = {
  paths: [
    "diagrams/architecture.meltemi",
    "diagrams/executive.meltemi",
    "diagrams/payment.meltemi",
    "models/commerce.meltemi",
    "project.json",
    "stories/purchase.meltemi",
  ],
  outlines: new Map([
    [
      "diagrams/architecture.meltemi",
      outline({
        diagrams: [
          { id: "context", title: "Context", type: "c4" },
          { id: "containers", title: null, type: "c4" },
        ],
      }),
    ],
    [
      "diagrams/executive.meltemi",
      outline({ diagrams: [{ id: "executive", title: "Executive", type: "free" }] }),
    ],
    [
      "diagrams/payment.meltemi",
      outline({ diagrams: [{ id: "payment", title: "Payment", type: "sequence" }] }),
    ],
    ["models/commerce.meltemi", outline({ models: 1 })],
    ["stories/purchase.meltemi", outline({ stories: [{ id: "purchase", title: "Purchase" }] })],
  ]),
  problems: new Map([["diagrams/payment.meltemi", { errors: 1, warnings: 2 }]]),
  showAll: false,
};

/** The tree as indented names, for reading. */
function names(nodes: readonly TreeNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [`${"  ".repeat(depth)}${n.name}`, ...names(n.children, depth + 1)]);
}

describe("the explorer's tree", () => {
  it("lists folders before files, diagrams without their extension, and hides the manifest", () => {
    expect(names(buildTree(PURCHASE))).toEqual([
      "diagrams",
      "  architecture",
      "    Context",
      "    containers",
      "  executive",
      "  payment",
      "models",
      "  commerce",
      "stories",
      "  purchase",
    ]);
  });

  it("shows every file with showAll, the manifest with the settings picture", () => {
    const tree = buildTree({ ...PURCHASE, showAll: true });
    const manifest = tree.find((n) => n.path === "project.json");
    expect(manifest).toMatchObject({ kind: "file", name: "project.json", icon: "settings" });
  });

  it("pictures each file by what it declares, and each child by its kind", () => {
    const tree = buildTree(PURCHASE);
    const icons = Object.fromEntries(
      [...tree.flatMap((n) => n.children)].map((n) => [n.name, n.icon]),
    );
    expect(icons).toEqual({
      architecture: "c4",
      executive: "free",
      payment: "sequence",
      commerce: "model",
      purchase: "story",
    });
    const architecture = tree[0]!.children[0]!;
    expect(architecture.children.map((c) => [c.kind, c.id, c.key])).toEqual([
      ["diagram", "context", "g:diagrams/architecture.meltemi#context"],
      ["diagram", "containers", "g:diagrams/architecture.meltemi#containers"],
    ]);
  });

  it("counts a file's problems and sums them on its folders", () => {
    const tree = buildTree(PURCHASE);
    expect(tree[0]).toMatchObject({ name: "diagrams", errors: 1, warnings: 2 });
    expect(tree[0]!.children.find((n) => n.name === "payment")).toMatchObject({
      errors: 1,
      warnings: 2,
    });
    expect(tree[1]).toMatchObject({ name: "models", errors: 0, warnings: 0 });
  });

  it("names the hidden files that have problems, and none when all are shown", () => {
    const input = {
      ...PURCHASE,
      problems: new Map([["project.json", { errors: 1, warnings: 0 }]]),
    };
    expect(hiddenProblems(input)).toEqual(["project.json"]);
    expect(hiddenProblems({ ...input, showAll: true })).toEqual([]);
  });

  it("leaves out a folder with nothing listed, unless the explorer made it", () => {
    const input: TreeInput = {
      paths: ["notes/readme.md", "a.meltemi"],
      outlines: new Map(),
      problems: new Map(),
      showAll: false,
    };
    expect(names(buildTree(input))).toEqual(["a"]);
    expect(names(buildTree({ ...input, folders: ["drafts"] }))).toEqual(["drafts", "a"]);
  });

  it("sorts names as people read them", () => {
    const input: TreeInput = {
      paths: ["b10.meltemi", "B2.meltemi", "a.meltemi"],
      outlines: new Map(),
      problems: new Map(),
      showAll: false,
    };
    expect(names(buildTree(input))).toEqual(["a", "B2", "b10"]);
  });

  it("walks only the rows whose parents are expanded", () => {
    const tree = buildTree(PURCHASE);
    expect(visibleRows(tree, new Set()).map((r) => r.node.name)).toEqual([
      "diagrams",
      "models",
      "stories",
    ]);
    const rows = visibleRows(tree, new Set(["d:diagrams", "f:diagrams/architecture.meltemi"]));
    expect(rows.map((r) => [r.node.name, r.level])).toEqual([
      ["diagrams", 1],
      ["architecture", 2],
      ["Context", 3],
      ["containers", 3],
      ["executive", 2],
      ["payment", 2],
      ["models", 1],
      ["stories", 1],
    ]);
    expect(rows[2]!.parent).toBe("f:diagrams/architecture.meltemi");
  });

  it("names the folders to expand to show a file", () => {
    expect(ancestorKeys("a/b/c.meltemi")).toEqual(["d:a", "d:a/b"]);
    expect(ancestorKeys("c.meltemi")).toEqual([]);
  });
});

describe("the explorer's names", () => {
  it("makes a diagram's path and id from the name typed", () => {
    expect(diagramPath("diagrams", "checkout")).toBe("diagrams/checkout.meltemi");
    expect(diagramPath("", "a.meltemi")).toBe("a.meltemi");
    expect(diagramId("Order flow")).toBe("Order_flow");
    expect(diagramId("2024 plan")).toBe("d2024_plan");
    expect(diagramId("Diseño ñandú")).toBe("Diseno_nandu");
    expect(displayName("diagrams/a.meltemi")).toBe("a");
  });

  it("renames a file in its folder, keeping a diagram's extension and another file's", () => {
    expect(renamedPath("diagrams/overview.meltemi", "start", "file")).toEqual({
      path: "diagrams/start.meltemi",
    });
    expect(renamedPath("notes/a.md", "b.md", "file")).toEqual({ path: "notes/b.md" });
    expect(renamedPath("notes/a.md", "b.txt", "file")).toEqual({ reason: "extension" });
    expect(renamedPath("diagrams", "views", "folder")).toEqual({ path: "views" });
  });

  it("refuses an empty name and one that is not a segment of a path", () => {
    for (const name of ["", "  "]) {
      expect(renamedPath("a.meltemi", name, "file")).toEqual({ reason: "empty" });
    }
    for (const name of ["a/b", "a\\b", "c:d", ".hidden", ".."]) {
      expect(renamedPath("a.meltemi", name, "file")).toEqual({ reason: "invalid" });
    }
  });

  it("moves files and folders into a folder, refusing a taken name and a folder into itself", () => {
    const paths = ["a/x.meltemi", "a/y.meltemi", "b/y.meltemi", "c.meltemi"];
    expect(movesInto([{ kind: "file", path: "c.meltemi" }], "a", paths)).toEqual({
      moves: [["c.meltemi", "a/c.meltemi"]],
    });
    expect(
      movesInto(
        [
          { kind: "file", path: "a/x.meltemi" },
          { kind: "file", path: "a/y.meltemi" },
        ],
        "b",
        paths,
      ),
    ).toEqual({ reason: "exists", path: "b/y.meltemi" });
    expect(movesInto([{ kind: "folder", path: "a" }], "b", paths)).toEqual({
      moves: [
        ["a/x.meltemi", "b/a/x.meltemi"],
        ["a/y.meltemi", "b/a/y.meltemi"],
      ],
    });
    expect(movesInto([{ kind: "folder", path: "a" }], "a", paths)).toEqual({ reason: "itself" });
    expect(movesInto([{ kind: "file", path: "a/x.meltemi" }], "a", paths)).toEqual({ moves: [] });
  });

  it("renames a folder with every file it holds", () => {
    const paths = ["a/x.meltemi", "a/b/y.meltemi", "c/x.meltemi"];
    expect(folderMoves("a", "z", paths)).toEqual({
      moves: [
        ["a/x.meltemi", "z/x.meltemi"],
        ["a/b/y.meltemi", "z/b/y.meltemi"],
      ],
    });
    expect(folderMoves("a", "c", paths)).toEqual({ reason: "exists", path: "c/x.meltemi" });
    expect(folderMoves("a", "a/in", paths)).toEqual({ reason: "itself" });
  });

  it("names a copy beside the file, counting up while the name is taken", () => {
    const taken = new Set(["d/a.meltemi", "d/a-copy.meltemi"]);
    expect(copyPath("d/a.meltemi", (p) => taken.has(p))).toBe("d/a-copy-2.meltemi");
    expect(copyPath("logo.png", () => false)).toBe("logo-copy.png");
  });
});

describe("a new diagram's text", () => {
  it("is the header and an empty diagram of the kind, named and titled after the file", () => {
    expect(newDiagramText("sequence", "checkout")).toBe(
      'language "0.2"\n\ndiagram checkout: sequence {\n  title "checkout"\n}\n',
    );
    expect(newDiagramText("flow", "Order flow")).toContain(
      'diagram Order_flow: flow {\n  title "Order flow"',
    );
  });
});
