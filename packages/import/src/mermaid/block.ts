import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap } from "../ids.js";
import { messages } from "../messages/index.js";
import { emptyFlowSheet, type FlowSheet, type SheetElement } from "../writer.js";
import { cleanLabel, cssProps, mergeProps, partSpan, stylesOf, type Statement } from "./common.js";
import { linkEnds, readLink, sanitizeClass } from "./flowchart.js";
import { MERMAID_SHAPES, readShape } from "./shapes.js";

/**
 * Grid cell, inset around boxes, and the group padding of the technical themes. Nested blocks are
 * untitled groups, whose interior starts the padding below their top edge.
 */
export const BLOCK_CELL = { width: 168, height: 84, inset: 14, padding: 16 } as const;

interface Cell {
  kind: "box" | "space" | "group";
  source: string;
  span: number;
  label: string | null;
  shape: string;
  columns: number | null;
  children: Cell[];
  at: Span;
  comments: string[];
  /** Laid out: top-left and size of the cell area, in the parent's content coordinates. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

/** A rough width of a label in the default font, to keep long labels inside their boxes. */
function textWidth(label: string): number {
  const longest = Math.max(...label.split("\n").map((l) => l.length));
  return Math.ceil(longest * 7.6) + 32;
}

/** Builds the free composition of a Mermaid `block-beta`. */
export class BlockReader {
  readonly sheet: FlowSheet;
  private readonly root: Cell = {
    kind: "group",
    source: "",
    span: 1,
    label: null,
    shape: "",
    columns: null,
    children: [],
    at: { start: 0, end: 0 },
    comments: [],
  };
  private readonly stack: Cell[] = [this.root];
  private readonly cells = new Map<string, Cell>();
  private readonly links: {
    from: string;
    to: string;
    dashed: boolean;
    label?: string;
    noHead: boolean;
    twoWay: boolean;
    head?: string;
    tail?: string;
    thick: boolean;
    span: Span;
    comments: string[];
  }[] = [];
  private readonly classUses: { source: string; cls: string; span: Span }[] = [];
  private readonly styleUses: { source: string; props: [string, string][]; span: Span }[] = [];
  private anonymous = 0;

  constructor(
    private readonly ctx: FrontContext,
    id: string,
  ) {
    this.sheet = emptyFlowSheet("free", id);
  }

  private get reporter() {
    return this.ctx.reporter;
  }

  private get current(): Cell {
    return this.stack[this.stack.length - 1]!;
  }

  statement(st: Statement): void {
    const t = st.text;
    const columns = /^columns\s+(\d+|auto)\s*$/.exec(t);
    if (columns) {
      this.current.columns = columns[1] === "auto" ? null : Math.max(1, Number(columns[1]));
      this.reporter.mapped("blockbeta.columns");
      return;
    }
    if (/^end\s*$/.test(t)) {
      if (this.stack.length <= 1)
        this.reporter.syntax("blockbeta.end", st.span, messages().common.endWithoutBlock);
      else this.stack.pop();
      return;
    }
    if (/^classDef\s/.test(t)) {
      const m = /^classDef\s+(\S+)\s+([\s\S]*)$/.exec(t);
      if (!m)
        return this.reporter.syntax(
          "blockbeta.classDef",
          st.span,
          messages().common.expected("classDef <name> <styles>"),
        );
      const { props, dropped } = cssProps(m[2]!, "element");
      for (const name of dropped)
        this.reporter.dropped("blockbeta.css", st.span, messages().common.css(name));
      for (const name of m[1]!.split(","))
        this.sheet.classDefs.push({ id: sanitizeClass(name), props });
      this.reporter.mapped("blockbeta.classDef");
      return;
    }
    if (/^class\s/.test(t)) {
      const m = /^class\s+(\S+)\s+(\S+)\s*$/.exec(t);
      if (!m)
        return this.reporter.syntax(
          "blockbeta.class",
          st.span,
          messages().common.expected("class <ids> <className>"),
        );
      for (const source of m[1]!.split(","))
        this.classUses.push({ source, cls: m[2]!, span: st.span });
      this.reporter.mapped("blockbeta.class");
      return;
    }
    if (/^style\s/.test(t)) {
      const m = /^style\s+(\S+)\s+([\s\S]*)$/.exec(t);
      if (!m)
        return this.reporter.syntax(
          "blockbeta.style",
          st.span,
          messages().common.expected("style <id> <styles>"),
        );
      const { props, dropped } = cssProps(m[2]!, "element");
      for (const name of dropped)
        this.reporter.dropped("blockbeta.css", st.span, messages().common.css(name));
      this.styleUses.push({ source: m[1]!, props, span: st.span });
      this.reporter.mapped("blockbeta.style");
      return;
    }
    if (this.edge(st)) return;
    this.items(st);
  }

  private edge(st: Statement): boolean {
    const t = st.text;
    const first = /^[\p{L}\p{N}_-]+/u.exec(t);
    if (!first) return false;
    let pos = first[0].length;
    const shape = readShape(t, pos);
    if (shape) pos = shape.end;
    while (pos < t.length && /\s/.test(t[pos]!)) pos++;
    const link = readLink(t, pos);
    if (!link) return false;
    let p = link.end;
    while (p < t.length && /\s/.test(t[p]!)) p++;
    if (t[p] === "|") {
      const close = t.indexOf("|", p + 1);
      if (close > 0) {
        link.label = t.slice(p + 1, close);
        p = close + 1;
      }
    }
    while (p < t.length && /\s/.test(t[p]!)) p++;
    const second = /^[\p{L}\p{N}_-]+/u.exec(t.slice(p));
    if (!second) return false;
    this.cellFor(first[0], st, 0, shape);
    const targetShape = readShape(t, p + second[0].length);
    this.cellFor(second[0], st, p, targetShape);
    const ends = linkEnds(link);
    const entry: (typeof this.links)[number] = {
      from: ends.forward ? first[0] : second[0],
      to: ends.forward ? second[0] : first[0],
      dashed: link.body === "dotted",
      thick: link.body === "thick",
      noHead: ends.noHead,
      twoWay: ends.twoWay,
      ...(ends.head !== undefined ? { head: ends.head } : {}),
      ...(ends.tail !== undefined ? { tail: ends.tail } : {}),
      span: st.span,
      comments: [...st.comments],
    };
    if (link.label !== undefined) entry.label = cleanLabel(link.label, this.reporter, st.span);
    this.links.push(entry);
    this.reporter.mapped("blockbeta.link");
    return true;
  }

  /** Declares an edge end that was not written as an item, with its shape when given. */
  private cellFor(
    source: string,
    st: Statement,
    at: number,
    shape: ReturnType<typeof readShape>,
  ): void {
    const existing = this.cells.get(source);
    if (existing) {
      if (shape) this.applyShape(existing, shape, partSpan(st, at, shape.end - at));
      return;
    }
    // Mermaid draws an undeclared edge end as a block in the next cell.
    const cell = this.newBox(source, partSpan(st, at, source.length), []);
    if (shape) this.applyShape(cell, shape, partSpan(st, at, shape.end - at));
    this.current.children.push(cell);
  }

  private newBox(source: string, at: Span, comments: string[]): Cell {
    const cell: Cell = {
      kind: "box",
      source,
      span: 1,
      label: null,
      shape: "rectangle",
      columns: null,
      children: [],
      at,
      comments,
    };
    this.cells.set(source, cell);
    return cell;
  }

  private applyShape(cell: Cell, shape: NonNullable<ReturnType<typeof readShape>>, at: Span): void {
    cell.label = cleanLabel(shape.raw, this.reporter, at);
    const drawn = MERMAID_SHAPES[shape.shape] ?? { shape: "rectangle", approx: true };
    cell.shape = drawn.shape;
    if (drawn.approx) {
      this.reporter.approximated(
        `blockbeta.shape.${shape.shape}`,
        at,
        messages().mermaid.shape(shape.shape, drawn.shape),
      );
    } else this.reporter.mapped(`blockbeta.shape.${shape.shape}`);
  }

  private items(st: Statement): void {
    const t = st.text;
    let pos = 0;
    let comments = [...st.comments];
    while (pos < t.length) {
      while (pos < t.length && /\s/.test(t[pos]!)) pos++;
      if (pos >= t.length) break;
      const rest = t.slice(pos);
      const block = /^block(?::([\p{L}\p{N}_-]+))?(?::(\d+))?(?=\s|$)/u.exec(rest);
      if (block) {
        const source = block[1] ?? `block${++this.anonymous}`;
        const cell: Cell = {
          kind: "group",
          source,
          span: block[2] !== undefined ? Math.max(1, Number(block[2])) : 1,
          label: null,
          shape: "",
          columns: null,
          children: [],
          at: partSpan(st, pos, block[0].length),
          comments,
        };
        comments = [];
        this.cells.set(source, cell);
        this.current.children.push(cell);
        this.stack.push(cell);
        this.reporter.mapped("blockbeta.block");
        pos += block[0].length;
        continue;
      }
      const space = /^space(?::(\d+))?(?=\s|$)/.exec(rest);
      if (space) {
        this.current.children.push({
          kind: "space",
          source: "",
          span: space[1] !== undefined ? Math.max(1, Number(space[1])) : 1,
          label: null,
          shape: "",
          columns: null,
          children: [],
          at: partSpan(st, pos, space[0].length),
          comments: [],
        });
        this.reporter.mapped("blockbeta.space");
        pos += space[0].length;
        continue;
      }
      const id = /^[\p{L}\p{N}_-]+/u.exec(rest);
      if (!id) {
        this.reporter.syntax(
          "blockbeta.item",
          partSpan(st, pos, rest.length),
          messages().common.cannotRead(rest),
        );
        this.sheet.trailing.push(messages(this.ctx.locale).content.notImported(rest));
        return;
      }
      const start = pos;
      const source = id[0];
      pos += source.length;
      const cell =
        this.cells.get(source) ?? this.newBox(source, partSpan(st, start, source.length), comments);
      comments = [];
      // Block arrows: id<["label"]>(direction); `shape arrow` points right.
      if (t.startsWith("<[", pos)) {
        const close = t.indexOf("]>", pos);
        if (close > 0) {
          cell.label = cleanLabel(t.slice(pos + 2, close), this.reporter, st.span);
          cell.shape = "arrow";
          pos = close + 2;
          const dir = /^\(([a-z, ]+)\)/.exec(t.slice(pos));
          if (dir) pos += dir[0].length;
          if (dir?.[1]!.trim() === "right") this.reporter.mapped("blockbeta.arrow");
          else {
            this.reporter.approximated(
              "blockbeta.arrow.direction",
              partSpan(st, start, pos - start),
              messages().block.arrow,
            );
          }
        }
      } else {
        const shape = readShape(t, pos);
        if (shape) {
          this.applyShape(cell, shape, partSpan(st, start, shape.end - start));
          pos = shape.end;
        } else this.reporter.mapped("blockbeta.box");
      }
      const spanMatch = /^:(\d+)/.exec(t.slice(pos));
      if (spanMatch) {
        cell.span = Math.max(1, Number(spanMatch[1]));
        pos += spanMatch[0].length;
        this.reporter.mapped("blockbeta.span");
      }
      if (!this.current.children.includes(cell)) this.current.children.push(cell);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Layout on the grid

  private natural(cell: Cell): { w: number; h: number } {
    const c = BLOCK_CELL;
    if (cell.kind === "group") {
      const inner = this.measure(cell);
      return {
        w: inner.w + 2 * c.padding + 2 * c.inset,
        h: inner.h + 2 * c.padding + 2 * c.inset,
      };
    }
    const text = cell.kind === "box" ? textWidth(cell.label ?? cell.source) + 2 * c.inset : 0;
    return { w: Math.max(c.width * cell.span, text), h: c.height };
  }

  private columnsOf(cell: Cell): number {
    if (cell.columns !== null) return cell.columns;
    return Math.max(
      1,
      cell.children.reduce((n, child) => n + child.span, 0),
    );
  }

  /** Rows of a container: children in reading order, wrapped at the column count. */
  private rows(cell: Cell): Cell[][] {
    const columns = this.columnsOf(cell);
    const rows: Cell[][] = [[]];
    let used = 0;
    for (const child of cell.children) {
      child.span = Math.min(child.span, columns);
      if (used + child.span > columns && used > 0) {
        rows.push([]);
        used = 0;
      }
      rows[rows.length - 1]!.push(child);
      used += child.span;
    }
    return rows;
  }

  private measure(cell: Cell): { w: number; h: number; unit: number } {
    const columns = this.columnsOf(cell);
    let unit: number = BLOCK_CELL.width;
    for (const child of cell.children) unit = Math.max(unit, this.natural(child).w / child.span);
    const h = this.rows(cell).reduce(
      (sum, row) => sum + Math.max(BLOCK_CELL.height, ...row.map((child) => this.natural(child).h)),
      0,
    );
    return { w: Math.ceil(unit * columns), h, unit };
  }

  /** Lays the children of `cell` out inside a content box `width` wide, from (0, 0). */
  private arrange(cell: Cell, width: number): void {
    const columns = this.columnsOf(cell);
    const unit = width / columns;
    let y = 0;
    for (const row of this.rows(cell)) {
      const h = Math.max(BLOCK_CELL.height, ...row.map((child) => this.natural(child).h));
      let col = 0;
      for (const child of row) {
        child.x = col * unit;
        child.y = y;
        child.w = child.span * unit;
        child.h = h;
        col += child.span;
      }
      y += h;
    }
  }

  private toElements(cell: Cell, ids: IdMap): SheetElement[] {
    const out: SheetElement[] = [];
    const c = BLOCK_CELL;
    for (const child of cell.children) {
      if (child.kind === "space") continue;
      const id = ids.id(child.source);
      const x = child.x!;
      const y = child.y!;
      const w = child.w!;
      const h = child.h!;
      if (child.kind === "box") {
        const label = child.label ?? child.source;
        out.push({
          kind: "box",
          id,
          label: label === id ? null : label,
          classes: [],
          children: [],
          comments: child.comments,
          place: { x: Math.round(x + w / 2), y: Math.round(y + h / 2) },
          size: { w: Math.round(w - 2 * c.inset), h: c.height - 2 * c.inset },
        });
        if (child.shape !== "rounded") {
          this.sheet.styles.push({ targets: [id], props: [["shape", child.shape]] });
        }
        continue;
      }
      const gw = w - 2 * c.inset;
      const gh = h - 2 * c.inset;
      this.arrange(child, gw - 2 * c.padding);
      out.push({
        kind: "group",
        id,
        label: "",
        classes: [],
        children: this.toElements(child, ids),
        comments: child.comments,
        place: { x: Math.round(x + w / 2), y: Math.round(y + h / 2) },
        size: { w: Math.round(gw), h: Math.round(gh) },
      });
    }
    return out;
  }

  finish(): FlowSheet {
    if (this.stack.length > 1) {
      for (const open of this.stack.slice(1)) {
        this.reporter.syntax("blockbeta.block", open.at, messages().common.blockNotClosed);
      }
    }
    const ids = new IdMap(this.reporter);
    for (const cell of this.cells.values()) ids.id(cell.source, cell.at);
    const size = this.measure(this.root);
    this.arrange(this.root, size.w);
    this.sheet.elements = this.toElements(this.root, ids);

    const known = new Set(this.sheet.classDefs.map((c) => c.id));
    const byId = new Map<string, SheetElement>();
    const walk = (list: SheetElement[]) => {
      for (const el of list) {
        byId.set(el.id, el);
        walk(el.children);
      }
    };
    walk(this.sheet.elements);
    for (const use of this.classUses) {
      const el = this.cells.has(use.source) ? byId.get(ids.id(use.source)) : undefined;
      const cls = sanitizeClass(use.cls);
      if (!el || !known.has(cls)) {
        this.reporter.dropped(
          "blockbeta.class",
          use.span,
          messages().block.undefinedClass(use.source, use.cls),
        );
        continue;
      }
      if (!el.classes.includes(cls)) el.classes.push(cls);
    }
    const styles = new Map<string, Map<string, string>>();
    for (const style of this.sheet.styles) mergeProps(styles, style.targets[0]!, style.props);
    for (const use of this.styleUses) {
      if (!this.cells.has(use.source)) {
        this.reporter.dropped("blockbeta.style", use.span, messages().block.notABlock(use.source));
        continue;
      }
      mergeProps(styles, ids.id(use.source), use.props);
    }
    const relationStyles = new Map<string, Map<string, string>>();
    this.sheet.relations = this.links.map((link) => {
      const styled =
        link.noHead || link.thick || link.head !== undefined || link.tail !== undefined;
      const id = styled ? ids.fresh("e") : undefined;
      if (id !== undefined) {
        if (link.noHead) mergeProps(relationStyles, id, [["arrowhead", "none"]]);
        if (link.thick) mergeProps(relationStyles, id, [["width", "3"]]);
        if (link.head !== undefined) mergeProps(relationStyles, id, [["arrowhead", link.head]]);
        if (link.tail !== undefined) mergeProps(relationStyles, id, [["arrowtail", link.tail]]);
      }
      return {
        from: ids.id(link.from),
        to: ids.id(link.to),
        dashed: link.dashed,
        ...(link.twoWay ? { twoWay: true } : {}),
        ...(link.label !== undefined && link.label !== "" ? { label: link.label } : {}),
        ...(id !== undefined ? { id } : {}),
        classes: [],
        comments: link.comments,
      };
    });
    this.sheet.styles = [...stylesOf(styles), ...stylesOf(relationStyles)];
    return this.sheet;
  }
}
