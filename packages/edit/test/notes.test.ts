import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation } from "../src/index.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

/** Plans and applies an operation, checking the inverse and that no error is added. */
function run(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(text: string, operation: EditOperation) {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection;
}

const CHECKOUT = `diagram checkout: flow {
  layout manual
  api["API"]
  db[("DB")]
  api -> db as save
  placement {
    place api at (100, 100)
    place db at (400, 100)
  }
}
`;

const WITH_NOTE = CHECKOUT.replace(
  "  api -> db as save\n",
  '  api -> db as save\n  note note1 "Idempotent" on api { class hot }\n  class hot { stroke "#e8a600" }\n',
);

describe("note attachments", () => {
  it("creates an attached note with its place", () => {
    const after = run(CHECKOUT, {
      kind: "createElement",
      diagram: "checkout",
      elementKind: "note",
      label: "Idempotent",
      at: { x: 700, y: 60 },
      attachedTo: "api",
    });
    expect(after).toContain('  note note1 "Idempotent" on api\n');
    expect(after).toContain("place note1 at (700, 60)");
  });

  it("refuses an attachment on another kind, and to a target the diagram does not have", () => {
    const kind = refused(CHECKOUT, {
      kind: "createElement",
      diagram: "checkout",
      elementKind: "node",
      attachedTo: "api",
    });
    expect(kind.code).toBe("edit.invalid-value");
    const unknown = refused(CHECKOUT, {
      kind: "createElement",
      diagram: "checkout",
      elementKind: "note",
      attachedTo: "ghost",
    });
    expect(unknown.code).toBe("edit.unsafe-target");
  });

  it("attaches, replaces and detaches a note, keeping its block", () => {
    const moved = run(WITH_NOTE, {
      kind: "attachNote",
      diagram: "checkout",
      note: "note1",
      element: "db",
    });
    expect(moved).toContain('  note note1 "Idempotent" on db { class hot }\n');
    const detached = run(moved, {
      kind: "attachNote",
      diagram: "checkout",
      note: "note1",
      element: null,
    });
    expect(detached).toContain('  note note1 "Idempotent" { class hot }\n');
    const again = run(detached, {
      kind: "attachNote",
      diagram: "checkout",
      note: "note1",
      element: "api",
    });
    expect(again).toContain('  note note1 "Idempotent" on api { class hot }\n');
    // Nothing to write when it already is as asked.
    const same = planEdit(compile(WITH_NOTE), {
      kind: "attachNote",
      diagram: "checkout",
      note: "note1",
      element: "api",
    });
    expect(same.ok && same.plan.edits).toEqual([]);
  });

  it("refuses to attach a box, a note to itself, an unknown note or an unknown element", () => {
    const box = refused('diagram sheet: free {\n  box api "API"\n  box db "DB"\n}\n', {
      kind: "attachNote",
      diagram: "sheet",
      note: "api",
      element: "db",
    });
    expect(box).toMatchObject({ code: "edit.invalid-value" });
    expect(box.reason).toMatch(/only notes attach/);
    expect(
      refused(WITH_NOTE, {
        kind: "attachNote",
        diagram: "checkout",
        note: "note1",
        element: "note1",
      }).code,
    ).toBe("edit.invalid-value");
    expect(
      refused(WITH_NOTE, { kind: "attachNote", diagram: "checkout", note: "ghost", element: "api" })
        .code,
    ).toBe("edit.unsafe-target");
    expect(
      refused(WITH_NOTE, {
        kind: "attachNote",
        diagram: "checkout",
        note: "note1",
        element: "ghost",
      }).code,
    ).toBe("edit.unsafe-target");
  });

  it("lists the attachment of a removed element, and strips it when cascading", () => {
    const blocked = refused(WITH_NOTE, {
      kind: "removeElement",
      diagram: "checkout",
      element: "api",
      cascade: false,
    });
    expect(blocked.code).toBe("edit.has-dependents");
    const attachment = blocked.dependents!.find((d) => d.kind === "attachment")!;
    expect(attachment.name).toBe("note1");
    expect(attachment.description).toBe("note `note1` is attached to it, on line 6");
    expect(attachment.range.start.line).toBe(6);
    const after = run(WITH_NOTE, {
      kind: "removeElement",
      diagram: "checkout",
      element: "api",
      cascade: true,
    });
    expect(after).toContain('  note note1 "Idempotent" { class hot }\n');
    expect(after).not.toContain("api");
  });

  it("keeps a note attached to an element removed with its group", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  group g "G" {\n    api["API"]\n  }\n  note n "Note" on api\n}\n';
    const after = run(text, { kind: "removeElement", diagram: "d", element: "g", cascade: true });
    expect(after).toContain('note n "Note"');
    expect(after).not.toContain("on api");
  });

  it("rewrites the target when the element is renamed", () => {
    const after = run(WITH_NOTE, {
      kind: "renameElement",
      diagram: "checkout",
      element: "api",
      newId: "gateway",
    });
    expect(after).toContain('  note note1 "Idempotent" on gateway { class hot }\n');
  });
});

describe("note operations in views", () => {
  it("creates a note in the view after its last note, with its place, leaving the model alone", () => {
    const after = run(commerce, {
      kind: "createElement",
      diagram: "containers",
      elementKind: "note",
      label: "Cached",
      at: { x: 600, y: 80 },
      attachedTo: "shop.api",
    });
    expect(after).toContain(
      '  note cache "Cached 5 min" on shop.api\n  note note1 "Cached" on shop.api\n',
    );
    expect(after).toContain("place note1 at (600, 80)");
    // The model block is the same text.
    expect(after.slice(0, after.indexOf("diagram containers"))).toBe(
      commerce.slice(0, commerce.indexOf("diagram containers")),
    );
  });

  it("puts the first note of a view after its lists and before its blocks", () => {
    const text = commerce.replace('  note cache "Cached 5 min" on shop.api\n', "");
    const after = run(text, {
      kind: "createElement",
      diagram: "containers",
      elementKind: "note",
      label: "Cached",
    });
    expect(after).toContain('  label shop.api "API de pedidos"\n  note note1 "Cached"\n}');
  });

  it("refuses a node in a view, naming the entity operations", () => {
    const rejection = refused(commerce, {
      kind: "createElement",
      diagram: "containers",
      elementKind: "node",
    });
    expect(rejection.code).toBe("edit.invalid-value");
    expect(rejection.reason).toMatch(/createEntity/);
    expect(rejection.reason).toMatch(/includeEntity/);
  });

  it("attaches to an entity the view draws and refuses one it does not", () => {
    const moved = run(commerce, {
      kind: "attachNote",
      diagram: "containers",
      note: "cache",
      element: "shop.db",
    });
    expect(moved).toContain('  note cache "Cached 5 min" on shop.db\n');
    const undrawn = refused(commerce, {
      kind: "attachNote",
      diagram: "containers",
      note: "cache",
      element: "shop.api.orders",
    });
    expect(undrawn.code).toBe("edit.unsafe-target");
    expect(undrawn.reason).toContain("shop.api.orders");
    expect(undrawn.reason).toContain("containers");
    const detached = run(commerce, {
      kind: "attachNote",
      diagram: "containers",
      note: "cache",
      element: null,
    });
    expect(detached).toContain('  note cache "Cached 5 min"\n');
  });

  it("lists the attachment when an entity leaves the view, and keeps the note when cascading", () => {
    const blocked = refused(commerce, {
      kind: "excludeEntity",
      diagram: "containers",
      entity: "shop.api",
      cascade: false,
    });
    expect(blocked.code).toBe("edit.has-dependents");
    expect(blocked.dependents!.some((d) => d.kind === "attachment" && d.name === "cache")).toBe(
      true,
    );
    const after = run(commerce, {
      kind: "excludeEntity",
      diagram: "containers",
      entity: "shop.api",
      cascade: true,
    });
    expect(after).toContain('  note cache "Cached 5 min"\n');
    expect(after).toContain("include customer, shop.web, shop.db");
  });

  it("strips the attachments of every view when an entity leaves the model", () => {
    const second =
      '\ndiagram again: c4 using commerce {\n  level container\n  scope shop\n  include shop.web, shop.db\n  note other "Other" on shop.db\n}\n';
    const text =
      commerce.replace(
        '  note cache "Cached 5 min" on shop.api\n',
        '  note cache "Cached 5 min" on shop.db\n',
      ) + second;
    const after = run(text, {
      kind: "removeEntity",
      model: "commerce",
      entity: "shop.db",
      cascade: true,
    });
    expect(after).toContain('  note cache "Cached 5 min"\n');
    expect(after).toContain('  note other "Other"\n');
    expect(after).not.toMatch(/on shop\.db/);
  });

  it("rewrites the attachment when the entity is renamed", () => {
    const after = run(commerce, {
      kind: "renameEntity",
      model: "commerce",
      entity: "shop.api",
      newId: "orders",
    });
    expect(after).toContain('  note cache "Cached 5 min" on shop.orders\n');
  });
});
