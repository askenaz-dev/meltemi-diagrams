import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap } from "../ids.js";
import { messages } from "../messages/index.js";
import { emptyFlowSheet, type FlowSheet, type Props, type SheetElement } from "../writer.js";
import {
  cleanLabel,
  cssProps,
  mergeProps,
  partSpan,
  splitOutside,
  stylesOf,
  type Statement,
} from "./common.js";
import { FLOW_KIND_OF_SHAPE, MERMAID_SHAPES, NAMED_SHAPES, readShape } from "./shapes.js";

interface Vertex {
  source: string;
  order: number;
  span: Span;
  shape: string | null;
  label: string | null;
  classes: string[];
  comments: string[];
  /** Span of the last shape written, for findings. */
  shapeSpan: Span;
  description?: string;
}

interface Group {
  source: string;
  label: string | null;
  order: number;
  span: Span;
  parent: Group | null;
  mentions: Set<string>;
  classes: string[];
  comments: string[];
}

interface Edge {
  from: string;
  to: string;
  dashed: boolean;
  thick: boolean;
  noHead: boolean;
  twoWay: boolean;
  /** Heads other than the theme's: `circle`, `cross`, or `none` at an end without one. */
  head?: string;
  tail?: string;
  /** The route kind of a `curve` attribute. */
  routing?: string;
  label?: string;
  source?: string;
  span: Span;
  comments: string[];
  animate?: string;
}

const DIRECTIONS: Readonly<Record<string, string>> = {
  TB: "TB",
  TD: "TB",
  BT: "BT",
  LR: "LR",
  RL: "RL",
  ">": "LR",
  "<": "RL",
  v: "TB",
  "^": "BT",
};

const ID = /^[\p{L}\p{N}_](?:[\p{L}\p{N}_]|-(?=[\p{L}\p{N}_]))*/u;

/** Builds the flow diagram of a Mermaid `flowchart` or `graph`. */
export class FlowchartReader {
  readonly sheet: FlowSheet;
  private readonly vertices = new Map<string, Vertex>();
  private readonly groups = new Map<string, Group>();
  private readonly closed: Group[] = [];
  private readonly stack: Group[] = [];
  private readonly edges: Edge[] = [];
  private readonly edgeSources = new Map<string, Edge>();
  private readonly classUses: { source: string; cls: string; span: Span }[] = [];
  private readonly styleUses: { source: string; props: Props; span: Span }[] = [];
  private readonly linkStyles: { indexes: number[] | "default"; props: Props; span: Span }[] = [];
  private order = 0;

  constructor(
    private readonly ctx: FrontContext,
    id: string,
  ) {
    this.sheet = emptyFlowSheet("flow", id);
    this.sheet.layout = "auto";
  }

  private get reporter() {
    return this.ctx.reporter;
  }

  header(st: Statement): void {
    const m = /^(?:flowchart-elk|flowchart|graph)\b\s*([A-Za-z<>^]+)?\s*;?\s*$/.exec(st.text);
    const dir = m?.[1];
    if (dir !== undefined) {
      const mapped = DIRECTIONS[dir];
      if (mapped) {
        this.sheet.direction = mapped;
        this.reporter.mapped("flowchart.direction");
      } else {
        this.reporter.dropped(
          "flowchart.direction",
          st.span,
          messages().flowchart.unknownDirection(dir),
        );
      }
    } else if (!m) {
      this.reporter.syntax("flowchart.header", st.span, messages().flowchart.header);
    }
    if (st.text.startsWith("flowchart-elk")) {
      this.reporter.approximated("flowchart.elk", st.span, messages().flowchart.elk);
    }
  }

  statement(st: Statement): void {
    const t = st.text;
    if (/^subgraph\b/.test(t)) return this.subgraph(st);
    if (/^end\s*$/.test(t)) return this.end(st);
    if (/^direction\s+\S+\s*$/.test(t)) return this.direction(st);
    if (/^classDef\s/.test(t)) return this.classDef(st);
    if (/^class\s/.test(t)) return this.classUse(st);
    if (/^style\s/.test(t)) return this.style(st);
    if (/^linkStyle\s/.test(t)) return this.linkStyle(st);
    if (/^(click|callback|href|call)\s/.test(t)) {
      this.reporter.dropped("flowchart.click", st.span, messages().flowchart.click);
      return;
    }
    if (/^accTitle\s*:/.test(t)) {
      this.sheet.title ??= t.replace(/^accTitle\s*:/, "").trim();
      this.reporter.mapped("mermaid.accTitle");
      return;
    }
    if (/^accDescr\b/.test(t)) {
      this.sheet.description = accDescr(t);
      this.reporter.mapped("mermaid.accDescr");
      return;
    }
    const meta = /^([\p{L}\p{N}_-]+)@\{([\s\S]*)\}\s*$/u.exec(t);
    if (meta && this.edgeSources.has(meta[1]!)) return this.edgeMeta(st, meta[1]!, meta[2]!);
    this.chain(st);
  }

  // -------------------------------------------------------------------------------------------
  // Subgraphs

  private subgraph(st: Statement): void {
    const rest = st.text.replace(/^subgraph\b/, "").trim();
    let source: string;
    let label: string | null;
    const bracket = /^([^\s[]+)\s*\[([\s\S]*)\]\s*$/.exec(rest);
    if (bracket) {
      source = bracket[1]!;
      label = cleanLabel(bracket[2]!, this.reporter, st.span);
    } else if (/^"[\s\S]*"$/.test(rest)) {
      label = cleanLabel(rest, this.reporter, st.span);
      source = label;
    } else if (rest === "") {
      source = `subgraph${this.groups.size + 1}`;
      label = null;
    } else {
      source = rest;
      label = rest;
    }
    let group = this.groups.get(source);
    if (!group) {
      group = {
        source,
        label,
        order: this.order++,
        span: st.span,
        parent: this.stack[this.stack.length - 1] ?? null,
        mentions: new Set(),
        classes: [],
        comments: [...st.comments],
      };
      this.groups.set(source, group);
    }
    this.stack.push(group);
    this.reporter.mapped("flowchart.subgraph");
  }

  private end(st: Statement): void {
    const group = this.stack.pop();
    if (!group) {
      this.reporter.syntax("flowchart.end", st.span, messages().flowchart.endWithoutSubgraph);
      return;
    }
    this.closed.push(group);
  }

  private direction(st: Statement): void {
    const dir = st.text.split(/\s+/)[1]!;
    if (this.stack.length > 0) {
      this.reporter.dropped(
        "flowchart.subgraph.direction",
        st.span,
        messages().flowchart.subgraphDirection,
      );
      return;
    }
    const mapped = DIRECTIONS[dir];
    if (mapped) {
      this.sheet.direction = mapped;
      this.reporter.mapped("flowchart.direction");
    } else {
      this.reporter.dropped(
        "flowchart.direction",
        st.span,
        messages().flowchart.unknownDirection(dir),
      );
    }
  }

  // -------------------------------------------------------------------------------------------
  // Styles

  private classDef(st: Statement): void {
    const m = /^classDef\s+(\S+)\s+([\s\S]*)$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        "flowchart.classDef",
        st.span,
        messages().common.expected("classDef <name> <styles>"),
      );
      return;
    }
    const { props, dropped } = cssProps(m[2]!, "element");
    this.reportCss(dropped, st.span);
    for (const name of m[1]!.split(",").filter((n) => n !== "")) {
      if (name === "default") {
        for (const kind of ["node", "decision", "data"]) this.sheet.rules.push({ kind, props });
      } else {
        const id = sanitizeClass(name);
        const existing = this.sheet.classDefs.find((c) => c.id === id);
        if (existing) existing.props = mergeList(existing.props, props);
        else this.sheet.classDefs.push({ id, props });
      }
      this.reporter.mapped("flowchart.classDef");
    }
  }

  private classUse(st: Statement): void {
    const m = /^class\s+(\S+)\s+(\S+)\s*$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        "flowchart.class",
        st.span,
        messages().common.expected("class <ids> <className>"),
      );
      return;
    }
    for (const source of m[1]!.split(",").filter((s) => s !== "")) {
      this.classUses.push({ source, cls: m[2]!, span: st.span });
    }
    this.reporter.mapped("flowchart.class");
  }

  private style(st: Statement): void {
    const m = /^style\s+(\S+)\s+([\s\S]*)$/.exec(st.text);
    if (!m) {
      this.reporter.syntax(
        "flowchart.style",
        st.span,
        messages().common.expected("style <id> <styles>"),
      );
      return;
    }
    const { props, dropped } = cssProps(m[2]!, "element");
    this.reportCss(dropped, st.span);
    this.styleUses.push({ source: m[1]!, props, span: st.span });
    this.reporter.mapped("flowchart.style");
  }

  private linkStyle(st: Statement): void {
    const m = /^linkStyle\s+(default|[0-9,\s]+?)\s+(?:interpolate\s+\S+\s*)?([\s\S]*)$/.exec(
      st.text,
    );
    if (!m) {
      this.reporter.syntax(
        "flowchart.linkStyle",
        st.span,
        messages().common.expected("linkStyle <n,m|default> <styles>"),
      );
      return;
    }
    const curve = /\binterpolate\s+(\S+)/.exec(st.text);
    const { props, dropped } = cssProps(m[2]!, "relation");
    if (curve) {
      props.push(["routing", routingOfCurve(curve[1]!)]);
      this.reporter.mapped("flowchart.linkStyle.interpolate");
    }
    this.reportCss(dropped, st.span);
    const indexes =
      m[1] === "default"
        ? ("default" as const)
        : m[1]!
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isInteger(n));
    this.linkStyles.push({ indexes, props, span: st.span });
    this.reporter.mapped("flowchart.linkStyle");
  }

  private reportCss(dropped: readonly string[], span: Span): void {
    for (const name of dropped) {
      this.reporter.dropped("flowchart.css", span, messages().common.css(name));
    }
  }

  // -------------------------------------------------------------------------------------------
  // Vertices and links

  private chain(st: Statement): void {
    const t = st.text;
    const reader = { pos: 0 };
    const skip = () => {
      while (reader.pos < t.length && /\s/.test(t[reader.pos]!)) reader.pos++;
    };
    // A statement that cannot be read leaves nothing behind.
    const known = new Set(this.vertices.keys());
    const mentioned = new Map(this.stack.map((g) => [g, new Set(g.mentions)]));
    const uses = this.classUses.length;
    const fail = (message: string) => {
      for (const source of [...this.vertices.keys()])
        if (!known.has(source)) this.vertices.delete(source);
      for (const [group, before] of mentioned) group.mentions = before;
      this.classUses.length = uses;
      this.reporter.syntax("flowchart.statement", st.span, message);
      this.sheet.trailing.push(
        messages(this.ctx.locale).content.notImported(t.replace(/\s*\n\s*/g, " ")),
      );
    };
    const firstGroup = this.vertexGroup(st, reader);
    if (!firstGroup) return fail(messages().common.cannotRead(t));
    const groups = [firstGroup];
    const links: Link[] = [];
    skip();
    while (reader.pos < t.length) {
      if (t[reader.pos] === ";") {
        reader.pos++;
        skip();
        continue;
      }
      const link = readLink(t, reader.pos);
      if (!link) return fail(messages().flowchart.link(t));
      reader.pos = link.end;
      skip();
      if (t[reader.pos] === "|") {
        const close = t.indexOf("|", reader.pos + 1);
        if (close < 0) return fail(messages().flowchart.linkLabel(t));
        link.label = cleanLabel(t.slice(reader.pos + 1, close), this.reporter, st.span);
        reader.pos = close + 1;
        skip();
      }
      const next = this.vertexGroup(st, reader);
      if (!next) return fail(messages().flowchart.target(t));
      links.push(link);
      groups.push(next);
      skip();
    }
    let commented = false;
    const comments = () => {
      if (commented) return [];
      commented = true;
      return [...st.comments];
    };
    if (links.length === 0) {
      // Declarations only.
      for (const source of groups[0]!) this.vertices.get(source)?.comments.push(...comments());
      return;
    }
    for (let i = 0; i < links.length; i++) {
      const link = links[i]!;
      this.reportLink(link);
      for (const a of groups[i]!) {
        for (const b of groups[i + 1]!) {
          const ends = linkEnds(link);
          const edge: Edge = {
            from: ends.forward ? a : b,
            to: ends.forward ? b : a,
            dashed: link.body === "dotted",
            thick: link.body === "thick",
            noHead: ends.noHead,
            twoWay: ends.twoWay,
            ...(ends.head !== undefined ? { head: ends.head } : {}),
            ...(ends.tail !== undefined ? { tail: ends.tail } : {}),
            span: st.span,
            comments: comments(),
          };
          if (link.label !== undefined) edge.label = link.label;
          if (link.id !== undefined) {
            if (!this.edgeSources.has(link.id)) {
              edge.source = link.id;
              this.edgeSources.set(link.id, edge);
              this.reporter.mapped("flowchart.link.id");
            }
          }
          if (link.body === "invisible") {
            this.reporter.dropped(
              "flowchart.link.invisible",
              st.span,
              messages().flowchart.invisible,
            );
            continue;
          }
          this.edges.push(edge);
        }
      }
    }
  }

  private reportLink(link: Link): void {
    const r = this.reporter;
    if (link.body === "invisible") return;
    if (link.label !== undefined) r.mapped("flowchart.link.label");
    if (link.body === "dotted") r.mapped("flowchart.link.dotted");
    if (link.body === "thick") r.mapped("flowchart.link.thick");
    const heads = link.leftHead + link.rightHead;
    if (heads === "") r.mapped("flowchart.link.open");
    else if (heads.includes("o")) r.mapped("flowchart.link.circle");
    else if (heads.includes("x")) r.mapped("flowchart.link.cross");
    else if (link.leftHead !== "" && link.rightHead !== "")
      r.mapped("flowchart.link.bidirectional");
    else r.mapped("flowchart.link.arrow");
  }

  /** Reads `a & b & c`, registering each vertex. Returns the source ids. */
  private vertexGroup(st: Statement, reader: { pos: number }): string[] | null {
    const t = st.text;
    const out: string[] = [];
    for (;;) {
      while (reader.pos < t.length && /\s/.test(t[reader.pos]!)) reader.pos++;
      const source = this.vertex(st, reader);
      if (source === null) return null;
      out.push(source);
      let p = reader.pos;
      while (p < t.length && /\s/.test(t[p]!)) p++;
      if (t[p] !== "&") return out;
      reader.pos = p + 1;
    }
  }

  private vertex(st: Statement, reader: { pos: number }): string | null {
    const t = st.text;
    const m = ID.exec(t.slice(reader.pos));
    if (!m) return null;
    const source = m[0];
    // An edge id (`e1@-->`) is not a vertex.
    if (
      t[reader.pos + source.length] === "@" &&
      /[-=.<ox~]/.test(t[reader.pos + source.length + 1] ?? "")
    ) {
      return null;
    }
    const start = reader.pos;
    reader.pos += source.length;
    const vertex = this.touch(source, partSpan(st, start, source.length));
    const shape = readShape(t, reader.pos);
    if (shape) {
      const span = partSpan(st, start, shape.end - start);
      vertex.shape = shape.shape;
      vertex.shapeSpan = span;
      vertex.label = cleanLabel(shape.raw, this.reporter, span);
      reader.pos = shape.end;
    } else if (t[reader.pos] === "@" && t[reader.pos + 1] === "{") {
      const close = matchBrace(t, reader.pos + 1);
      if (close < 0) return null;
      const span = partSpan(st, start, close + 1 - start);
      this.nodeMeta(vertex, t.slice(reader.pos + 2, close), span);
      reader.pos = close + 1;
    }
    if (t.startsWith(":::", reader.pos)) {
      const cls = /^:::([\p{L}\p{N}_-]+)/u.exec(t.slice(reader.pos));
      if (cls) {
        this.classUses.push({ source, cls: cls[1]!, span: st.span });
        this.reporter.mapped("flowchart.class");
        reader.pos += cls[0].length;
      }
    }
    return source;
  }

  private touch(source: string, span: Span): Vertex {
    let vertex = this.vertices.get(source);
    if (!vertex) {
      vertex = {
        source,
        order: this.order++,
        span,
        shape: null,
        label: null,
        classes: [],
        comments: [],
        shapeSpan: span,
      };
      this.vertices.set(source, vertex);
    }
    const group = this.stack[this.stack.length - 1];
    if (group) group.mentions.add(source);
    return vertex;
  }

  private nodeMeta(vertex: Vertex, body: string, span: Span): void {
    const fields = readFields(body);
    const shapeName = fields.get("shape");
    if (shapeName !== undefined) {
      const shape = NAMED_SHAPES[shapeName];
      if (shape) vertex.shape = shape;
      else {
        vertex.shape = "unknown";
        this.reporter.approximated(
          "flowchart.shape.named",
          span,
          messages().flowchart.namedShape(shapeName),
        );
      }
    } else vertex.shape ??= "rect";
    vertex.shapeSpan = span;
    const label = fields.get("label");
    if (label !== undefined) vertex.label = cleanLabel(`"${label}"`, this.reporter, span);
    for (const key of fields.keys()) {
      if (key === "shape" || key === "label") continue;
      this.reporter.dropped("flowchart.meta", span, messages().flowchart.nodeAttribute(key));
    }
  }

  private edgeMeta(st: Statement, source: string, body: string): void {
    const edge = this.edgeSources.get(source)!;
    const fields = readFields(body);
    for (const [key, value] of fields) {
      if (key === "animate" && value === "true") {
        edge.animate = "flow";
        this.reporter.mapped("flowchart.link.animation");
      } else if (key === "animate" && value === "false") {
        this.reporter.mapped("flowchart.link.animation");
      } else if (key === "animation") {
        edge.animate = value === "slow" ? "slow" : "fast";
        this.reporter.mapped("flowchart.link.animation");
      } else if (key === "curve") {
        edge.routing = routingOfCurve(value);
        this.reporter.mapped("flowchart.link.curve");
      } else {
        this.reporter.dropped(
          "flowchart.link.attribute",
          st.span,
          messages().flowchart.linkAttribute(key),
        );
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Result

  finish(): FlowSheet {
    for (const group of this.stack.splice(0)) {
      this.reporter.syntax(
        "flowchart.subgraph",
        group.span,
        messages().flowchart.subgraphNotClosed,
      );
      this.closed.push(group);
    }
    const ids = new IdMap(this.reporter);
    const isGroup = (source: string) => this.groups.has(source);
    // Ids in order of appearance.
    const all: { source: string; order: number; span: Span }[] = [
      ...[...this.vertices.values()].filter((v) => !isGroup(v.source)),
      ...this.groups.values(),
    ].sort((a, b) => a.order - b.order);
    for (const item of all) ids.id(item.source, item.span);
    // Membership: the first closed subgraph that mentions a vertex keeps it.
    const owner = new Map<string, Group>();
    for (const group of this.closed) {
      for (const source of group.mentions) {
        if (!isGroup(source) && !owner.has(source)) owner.set(source, group);
      }
    }
    const elements = new Map<string, SheetElement>();
    const elementStyles = new Map<string, Map<string, string>>();
    for (const vertex of this.vertices.values()) {
      if (isGroup(vertex.source)) continue;
      const id = ids.id(vertex.source);
      const { element, shape } = this.element(vertex, id);
      elements.set(vertex.source, element);
      if (shape !== null) mergeProps(elementStyles, id, [["shape", shape]]);
    }
    for (const group of this.groups.values()) {
      const id = ids.id(group.source);
      elements.set(group.source, {
        kind: "group",
        id,
        label: group.label,
        classes: [],
        children: [],
        comments: group.comments,
      });
    }
    const roots: { order: number; el: SheetElement }[] = [];
    const childrenOf = new Map<string, { order: number; el: SheetElement }[]>();
    const place = (parent: Group | null | undefined, order: number, el: SheetElement) => {
      if (!parent) roots.push({ order, el });
      else {
        const list = childrenOf.get(parent.source) ?? [];
        list.push({ order, el });
        childrenOf.set(parent.source, list);
      }
    };
    for (const vertex of this.vertices.values()) {
      if (isGroup(vertex.source)) continue;
      place(owner.get(vertex.source), vertex.order, elements.get(vertex.source)!);
    }
    for (const group of this.groups.values())
      place(group.parent, group.order, elements.get(group.source)!);
    for (const [source, list] of childrenOf) {
      elements.get(source)!.children = list.sort((a, b) => a.order - b.order).map((x) => x.el);
    }
    this.sheet.elements = roots.sort((a, b) => a.order - b.order).map((x) => x.el);

    // Classes and styles of elements.
    const known = new Set(this.sheet.classDefs.map((c) => c.id));
    for (const use of this.classUses) {
      const el = elements.get(use.source);
      const cls = sanitizeClass(use.cls);
      if (!el) {
        this.reporter.dropped(
          "flowchart.class",
          use.span,
          messages().flowchart.notANode(use.source),
        );
        continue;
      }
      if (!known.has(cls)) {
        this.reporter.dropped(
          "flowchart.class",
          use.span,
          messages().flowchart.undefinedClass(use.cls),
        );
        continue;
      }
      if (!el.classes.includes(cls)) el.classes.push(cls);
    }
    for (const use of this.styleUses) {
      const el = elements.get(use.source);
      if (!el) {
        this.reporter.dropped(
          "flowchart.style",
          use.span,
          messages().flowchart.notANode(use.source),
        );
        continue;
      }
      mergeProps(elementStyles, el.id, use.props);
    }

    // Relations.
    const relationStyles = new Map<string, Map<string, string>>();
    const needsId = (i: number, edge: Edge) =>
      edge.source !== undefined ||
      edge.thick ||
      edge.head !== undefined ||
      edge.tail !== undefined ||
      edge.routing !== undefined ||
      edge.animate !== undefined ||
      this.linkStyles.some((s) => s.indexes !== "default" && s.indexes.includes(i));
    for (const edge of this.edges) if (edge.source !== undefined) ids.id(edge.source, edge.span);
    this.sheet.relations = this.edges.map((edge, i) => {
      const from = ids.id(edge.from);
      const to = ids.id(edge.to);
      const id = needsId(i, edge)
        ? edge.source !== undefined
          ? ids.id(edge.source)
          : ids.fresh("e")
        : undefined;
      if (id !== undefined) {
        if (edge.thick) mergeProps(relationStyles, id, [["width", "3"]]);
        if (edge.head !== undefined) mergeProps(relationStyles, id, [["arrowhead", edge.head]]);
        if (edge.tail !== undefined) mergeProps(relationStyles, id, [["arrowtail", edge.tail]]);
        if (edge.routing !== undefined) {
          mergeProps(relationStyles, id, [["routing", edge.routing]]);
        }
        if (edge.animate !== undefined) {
          this.sheet.animates.push({
            targets: [id],
            props: [
              ["effect", "flow"],
              ["duration", edge.animate === "slow" ? "2s" : "1s"],
              ["repeat", "forever"],
            ],
          });
        }
      }
      return {
        from,
        to,
        dashed: edge.dashed,
        ...(edge.twoWay ? { twoWay: true } : {}),
        // An open link is a line: `---` is `--`, `-.-` is `---`, `===` is `--` with width 3.
        ...(edge.noHead ? { heads: "none" as const } : {}),
        ...(edge.label !== undefined && edge.label !== "" ? { label: edge.label } : {}),
        ...(id !== undefined ? { id } : {}),
        classes: [],
        comments: edge.comments,
      };
    });
    for (const ls of this.linkStyles) {
      if (ls.indexes === "default") {
        this.sheet.rules.push({ kind: "relation", props: ls.props });
        continue;
      }
      for (const index of ls.indexes) {
        const rel = this.sheet.relations[index];
        if (!rel?.id) {
          this.reporter.dropped("flowchart.linkStyle", ls.span, messages().flowchart.noLink(index));
          continue;
        }
        mergeProps(relationStyles, rel.id, ls.props);
      }
    }
    this.sheet.styles = [...stylesOf(elementStyles), ...stylesOf(relationStyles)];
    return this.sheet;
  }

  /** The element of a vertex, and the `shape` style a `node` gets for Mermaid's other shapes. */
  private element(vertex: Vertex, id: string): { element: SheetElement; shape: string | null } {
    const shape = vertex.shape ?? "rect";
    let kind = FLOW_KIND_OF_SHAPE[shape];
    const drawn = MERMAID_SHAPES[shape];
    let style: string | null = null;
    if (kind) this.reporter.mapped(`flowchart.shape.${shape}`);
    else if (shape === "h_cylinder") {
      kind = "data";
      this.reporter.approximated(
        "flowchart.shape.h_cylinder",
        vertex.shapeSpan,
        messages().flowchart.storedData,
      );
    } else if (shape === "text") {
      kind = "note";
      this.reporter.approximated(
        "flowchart.shape.text",
        vertex.shapeSpan,
        messages().flowchart.textShape,
      );
    } else {
      kind = "node";
      if (drawn) {
        style = drawn.shape;
        if (drawn.approx) {
          this.reporter.approximated(
            `flowchart.shape.${shape}`,
            vertex.shapeSpan,
            messages().mermaid.shape(shape, drawn.shape),
          );
        } else this.reporter.mapped(`flowchart.shape.${shape}`);
      }
    }
    const label = vertex.label === null || vertex.label === "" ? vertex.source : vertex.label;
    return {
      element: {
        kind,
        id,
        label: label === id ? null : label,
        classes: vertex.classes,
        children: [],
        comments: vertex.comments,
      },
      shape: style,
    };
  }
}

interface Link {
  leftHead: "" | "<" | "o" | "x";
  rightHead: "" | ">" | "o" | "x";
  body: "solid" | "dotted" | "thick" | "invisible";
  label?: string;
  id?: string;
  end: number;
}

/** The route kind of a Mermaid curve: straight, stepped (elbow) or any smooth curve. */
export function routingOfCurve(curve: string): string {
  if (curve === "linear") return "polyline";
  return /^step/.test(curve) ? "orthogonal" : "bezier";
}

/**
 * The heads of a link as the language writes them: `<-->` and `o--o` are two-way arrows (with a
 * circle or cross head), `--o` and `--x` set the head at the target, `<--` alone points back, and
 * mixed ends become heads at each end.
 */
export function linkEnds(link: Pick<Link, "leftHead" | "rightHead">): {
  forward: boolean;
  twoWay: boolean;
  noHead: boolean;
  head?: string;
  tail?: string;
} {
  const kind = (h: string) =>
    h === ">" || h === "<" ? "triangle" : h === "o" ? "circle" : h === "x" ? "cross" : "none";
  const left = kind(link.leftHead);
  const right = kind(link.rightHead);
  if (left === "none" && right === "none") return { forward: true, twoWay: false, noHead: true };
  if (right === "none" && left === "triangle") {
    return { forward: false, twoWay: false, noHead: false };
  }
  if (left !== "none" && left === right) {
    return {
      forward: true,
      twoWay: true,
      noHead: false,
      ...(right !== "triangle" ? { head: right } : {}),
    };
  }
  return {
    forward: true,
    twoWay: false,
    noHead: false,
    ...(right !== "triangle" ? { head: right } : {}),
    ...(left !== "none" ? { tail: left } : {}),
  };
}

/** Reads a link at `pos`: plain (`-->`, `-.->`, `==>`, `---`, `~~~`) or with text (`-- t -->`). */
export function readLink(text: string, pos: number): Link | null {
  let p = pos;
  let id: string | undefined;
  const idMatch = /^([\p{L}\p{N}_-]+)@(?=[-=.<ox~])/u.exec(text.slice(p));
  if (idMatch) {
    id = idMatch[1];
    p += idMatch[0].length;
  }
  const rest = text.slice(p);
  const plain = /^([<ox])?(-{2,}|-\.+-|={2,}|~{3,})([>ox])?/.exec(rest);
  const bodyOf = (b: string): Link["body"] =>
    b.startsWith("~")
      ? "invisible"
      : b.includes(".")
        ? "dotted"
        : b.startsWith("=")
          ? "thick"
          : "solid";
  if (plain) {
    const [whole, left = "", body, right = ""] = plain;
    const isTextStart = (body === "--" || body === "==") && right === "";
    // `--o` and `--x` need a space or the end after the head, or they start a node id.
    const headOk = right === "" || right === ">" || /^[\s|]|^$/.test(rest.slice(whole.length));
    if (!isTextStart && headOk) {
      const link: Link = {
        leftHead: left as Link["leftHead"],
        rightHead: right as Link["rightHead"],
        body: bodyOf(body!),
        end: p + whole.length,
      };
      if (id !== undefined) link.id = id;
      return link;
    }
    if (!isTextStart && !headOk) {
      const link: Link = {
        leftHead: left as Link["leftHead"],
        rightHead: "",
        body: bodyOf(body!),
        end: p + whole.length - 1,
      };
      if (id !== undefined) link.id = id;
      return link;
    }
  }
  const start = /^([<ox])?(--|==|-\.)(?=[^->=.])/.exec(rest);
  if (!start) return null;
  const [opener, left = "", kind] = start;
  const ends: RegExp =
    kind === "--" ? /(-{2,}[>ox]|-{3,})/g : kind === "==" ? /(={2,}[>ox]|={3,})/g : /(\.+-[>ox]?)/g;
  ends.lastIndex = opener.length;
  const end = ends.exec(rest);
  if (!end) return null;
  const label = rest.slice(opener.length, end.index).trim();
  const closer = end[1]!;
  const last = closer[closer.length - 1]!;
  const link: Link = {
    leftHead: left as Link["leftHead"],
    rightHead: (/[>ox]/.test(last) ? last : "") as Link["rightHead"],
    body: kind === "-." ? "dotted" : kind === "==" ? "thick" : "solid",
    end: p + end.index + closer.length,
  };
  if (label !== "") link.label = label.replace(/^"|"$/g, "");
  if (id !== undefined) link.id = id;
  return link;
}

/** Index of the `}` matching the `{` at `open`, outside quotes. */
export function matchBrace(text: string, open: number): number {
  let depth = 0;
  let quote = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quote = !quote;
    else if (quote) continue;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Reads `key: value, key: "value"` fields of `@{ … }` blocks. */
export function readFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of splitOutside(body.replace(/\n/g, ","), ",")) {
    const m = /^\s*([A-Za-z][\w-]*)\s*:\s*([\s\S]*?)\s*$/.exec(part.text);
    if (!m) continue;
    let value = m[2]!;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields.set(m[1]!, value);
  }
  return fields;
}

function accDescr(text: string): string {
  const block = /^accDescr\s*\{([\s\S]*)\}\s*$/.exec(text);
  if (block) {
    return block[1]!
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .join("\n");
  }
  return text.replace(/^accDescr\s*:/, "").trim();
}

/** Class names may hold `-`; class ids may not. */
export function sanitizeClass(name: string): string {
  const id = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(id) ? `c${id}` : id;
}

function mergeList(a: Props, b: Props): Props {
  const map = new Map(a);
  for (const [k, v] of b) map.set(k, v);
  return [...map.entries()];
}
