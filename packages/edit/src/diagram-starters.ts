import { isIdentifierText, type TextEdit } from "@meltemi/diagrams-language";
import { reject, type TextContext } from "./context.js";
import { appendBlock, createDiagram, newDiagramId, topLevelNames } from "./diagrams.js";
import { verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { DIAGRAM_STARTERS, isDiagramStarter } from "./starter-catalog.js";
import { quoteString } from "./text.js";

/** Append one valid starter. C4's model and view are one reversible insertion. */
export function createDiagramFromStarter(
  ctx: TextContext,
  op: OperationOf<"createDiagramFromStarter">,
): TextEdit[] {
  if (!isDiagramStarter(op.starter))
    reject(
      "edit.invalid-value",
      reasons().diagrams.notCreatable(String(op.starter), DIAGRAM_STARTERS),
    );
  if (ctx.compilation.parse.diagnostics.some((d) => d.severity === "error"))
    reject("edit.unsafe-target", reasons().diagrams.fixSource);
  const used = topLevelNames(ctx.compilation);
  const id = op.id ?? newDiagramId(ctx.compilation);
  if (!isIdentifierText(id)) reject("edit.invalid-value", reasons().diagrams.invalidId(id));
  if (used.has(id)) reject("edit.invalid-value", reasons().diagrams.taken(id));
  if (
    op.starter === "flow" ||
    op.starter === "sequence" ||
    op.starter === "gantt" ||
    op.starter === "free"
  )
    return createDiagram(ctx, {
      kind: "createDiagram",
      type: op.starter,
      id,
      ...(op.title !== undefined ? { title: op.title } : {}),
    });

  const words = messages().starterContent;
  const title = op.title ?? words[op.starter];
  let block: string;
  if (op.starter === "c4") {
    used.add(id);
    let model = "model1";
    for (let n = 1; used.has(model); n++) model = `model${n + 1}`;
    block = `model ${model} {
  person user ${quoteString(words.user)}
  system product ${quoteString(words.product)}
  user -> product: ${quoteString(words.uses)} as uses
}

diagram ${id}: c4 using ${model} {
  title ${quoteString(title)}
  level context
}`;
  } else if (op.starter === "whiteboard") {
    block = `diagram ${id}: free {
  title ${quoteString(title)}
  theme "sketch.light"
  preset board

  text heading ${quoteString(title)}
  sticky idea ${quoteString(words.idea)}
  placement {
    place heading at (200, 40)
    place idea at (200, 180)
  }
}`;
  } else {
    block = `diagram ${id}: free {
  title ${quoteString(title)}
  preset board

  group board "" {
    layout row
    spacing 24
    align stretch
    group todo ${quoteString(words.todo)} {
      layout column
      sticky idea ${quoteString(words.idea)}
    }
    group doing ${quoteString(words.doing)} { layout column }
    group done ${quoteString(words.done)} { layout column }
  }
  placement {
    place board at (380, 240)
    size todo (220, 360)
    size doing (220, 360)
    size done (220, 360)
  }
}`;
  }
  block = block
    .replace(/^ +/gm, (space) => ctx.unit.repeat(space.length / 2))
    .replaceAll("\n", ctx.eol);
  const empty = ctx.text.trim() === "";
  const header = ctx.compilation.parse.root.items.some((x) => x.kind === "Header");
  const edits: TextEdit[] = empty
    ? [
        {
          start: 0,
          end: ctx.text.length,
          newText: `language "0.2"${ctx.eol}${ctx.eol}${block}${ctx.eol}`,
        },
      ]
    : [
        ...(!header ? [{ start: 0, end: 0, newText: `language "0.2"${ctx.eol}${ctx.eol}` }] : []),
        appendBlock(ctx, block),
      ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}
