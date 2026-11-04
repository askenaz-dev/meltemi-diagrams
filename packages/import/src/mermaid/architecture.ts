import type { Span } from "@meltemi/diagrams-language";
import type { FrontContext } from "../front.js";
import { IdMap } from "../ids.js";
import { messages } from "../messages/index.js";
import { emptyFlowSheet, quote, type FlowSheet, type SheetElement } from "../writer.js";
import { cleanLabel, type Statement } from "./common.js";

/** Mermaid's built-in architecture icons and the Tabler icons drawn for them. */
export const ARCHITECTURE_ICONS: Readonly<Record<string, string>> = {
  cloud: "tabler:cloud",
  database: "tabler:database",
  disk: "tabler:device-floppy",
  internet: "tabler:world",
  server: "tabler:server",
};

const SIDES: Readonly<Record<string, string>> = { L: "west", R: "east", T: "north", B: "south" };

interface Item {
  kind: "group" | "service" | "junction";
  source: string;
  label: string | null;
  icon: string | null;
  parent: string | null;
  span: Span;
  comments: string[];
}

/** Builds the flow diagram of a Mermaid `architecture-beta`. */
export class ArchitectureReader {
  readonly sheet: FlowSheet;
  private readonly items = new Map<string, Item>();
  private readonly edges: {
    from: string;
    fromSide: string;
    fromGroup: boolean;
    to: string;
    toSide: string;
    toGroup: boolean;
    left: boolean;
    right: boolean;
    label?: string;
    span: Span;
    comments: string[];
  }[] = [];

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

  statement(st: Statement): void {
    const t = st.text;
    const decl =
      /^(group|service)\s+([\p{L}\p{N}_-]+)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?\s*(?:in\s+([\p{L}\p{N}_-]+))?\s*$/u.exec(
        t,
      );
    if (decl) {
      this.declare(st, decl[1] as "group" | "service", decl[2]!, decl[3], decl[4], decl[5]);
      return;
    }
    const junction = /^junction\s+([\p{L}\p{N}_-]+)\s*(?:in\s+([\p{L}\p{N}_-]+))?\s*$/u.exec(t);
    if (junction) {
      this.items.set(junction[1]!, {
        kind: "junction",
        source: junction[1]!,
        label: null,
        icon: null,
        parent: junction[2] ?? null,
        span: st.span,
        comments: [...st.comments],
      });
      this.reporter.approximated(
        "architecture.junction",
        st.span,
        messages().architecture.junction,
      );
      return;
    }
    const edge =
      /^([\p{L}\p{N}_-]+)(\{group\})?\s*:\s*([LRTB])\s*(<)?-(?:\[([^\]]*)\])?-(>)?\s*([LRTB])\s*:\s*([\p{L}\p{N}_-]+)(\{group\})?\s*$/u.exec(
        t,
      );
    if (edge) {
      const e: (typeof this.edges)[number] = {
        from: edge[1]!,
        fromGroup: edge[2] !== undefined,
        fromSide: edge[3]!,
        left: edge[4] !== undefined,
        right: edge[6] !== undefined,
        toSide: edge[7]!,
        to: edge[8]!,
        toGroup: edge[9] !== undefined,
        span: st.span,
        comments: [...st.comments],
      };
      if (edge[5] !== undefined) e.label = cleanLabel(edge[5], this.reporter, st.span);
      this.edges.push(e);
      return;
    }
    if (/^title\s/.test(t)) {
      this.sheet.title = t.replace(/^title\s+/, "").trim();
      this.reporter.mapped("architecture.title");
      return;
    }
    if (/^accTitle\s*:/.test(t)) {
      this.sheet.title ??= t.replace(/^accTitle\s*:/, "").trim();
      this.reporter.mapped("mermaid.accTitle");
      return;
    }
    if (/^accDescr\b/.test(t)) {
      this.sheet.description = t
        .replace(/^accDescr\s*[:{]/, "")
        .replace(/\}\s*$/, "")
        .trim();
      this.reporter.mapped("mermaid.accDescr");
      return;
    }
    this.reporter.syntax("architecture.statement", st.span, messages().common.cannotRead(t));
    this.sheet.trailing.push(messages(this.ctx.locale).content.notImported(t));
  }

  private declare(
    st: Statement,
    kind: "group" | "service",
    source: string,
    icon: string | undefined,
    label: string | undefined,
    parent: string | undefined,
  ): void {
    this.items.set(source, {
      kind,
      source,
      label: label !== undefined ? cleanLabel(label, this.reporter, st.span) : null,
      icon: icon !== undefined ? this.icon(icon.trim(), st.span) : null,
      parent: parent ?? null,
      span: st.span,
      comments: [...st.comments],
    });
    this.reporter.mapped(`architecture.${kind}`);
  }

  private icon(name: string, span: Span): string | null {
    const builtin = ARCHITECTURE_ICONS[name];
    if (builtin) {
      this.reporter.mapped("architecture.icon");
      return builtin;
    }
    if (/^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/.test(name) && this.ctx.hasIcon(name)) {
      this.reporter.mapped("architecture.icon");
      return name;
    }
    this.reporter.dropped("architecture.icon", span, messages().architecture.icon(name), false, [
      messages().architecture.iconHint,
    ]);
    return null;
  }

  finish(): FlowSheet {
    const ids = new IdMap(this.reporter);
    for (const item of this.items.values()) ids.id(item.source, item.span);
    const elements = new Map<string, SheetElement>();
    for (const item of this.items.values()) {
      const id = ids.id(item.source);
      const label = item.kind === "junction" ? "" : (item.label ?? item.source);
      elements.set(item.source, {
        kind: item.kind === "group" ? "group" : "node",
        id,
        label: label === id ? null : label,
        classes: [],
        children: [],
        comments: item.comments,
      });
      if (item.icon) this.sheet.styles.push({ targets: [id], props: [["icon", quote(item.icon)]] });
    }
    for (const item of this.items.values()) {
      const el = elements.get(item.source)!;
      const parent = item.parent !== null ? elements.get(item.parent) : undefined;
      if (item.parent !== null && (!parent || parent.kind !== "group")) {
        this.reporter.dropped(
          `architecture.${item.kind}.in`,
          item.span,
          messages().architecture.notAGroup(item.parent, item.source),
        );
      }
      if (parent && parent.kind === "group") parent.children.push(el);
      else this.sheet.elements.push(el);
    }
    const endpoint = (source: string, group: boolean, span: Span): string | null => {
      const item = this.items.get(source);
      if (!item) {
        this.reporter.dropped(
          "architecture.edge",
          span,
          messages().architecture.undeclared(source),
          true,
        );
        return null;
      }
      if (!group) return ids.id(source);
      const parent = item.parent !== null ? this.items.get(item.parent) : undefined;
      if (parent?.kind === "group") {
        this.reporter.mapped("architecture.edge.group");
        return ids.id(parent.source);
      }
      this.reporter.approximated(
        "architecture.edge.group",
        span,
        messages().architecture.notInAGroup(source),
      );
      return ids.id(source);
    };
    for (const edge of this.edges) {
      const a = endpoint(edge.from, edge.fromGroup, edge.span);
      const b = endpoint(edge.to, edge.toGroup, edge.span);
      if (a === null || b === null) continue;
      const reversed = edge.left && !edge.right;
      const from = reversed ? b : a;
      const to = reversed ? a : b;
      const fromSide = SIDES[reversed ? edge.toSide : edge.fromSide]!;
      const toSide = SIDES[reversed ? edge.fromSide : edge.toSide]!;
      const id = ids.fresh("e");
      this.sheet.relations.push({
        from,
        to,
        dashed: false,
        ...(edge.left && edge.right ? { twoWay: true } : {}),
        // An edge with no arrow at either side is the line token `--`; it keeps its id for its route.
        ...(!edge.left && !edge.right ? { heads: "none" as const } : {}),
        id,
        ...(edge.label !== undefined && edge.label !== "" ? { label: edge.label } : {}),
        classes: [],
        comments: edge.comments,
      });
      this.sheet.routes.push({ relation: id, from: `${from}.${fromSide}`, to: `${to}.${toSide}` });
      if (!edge.left && !edge.right) {
        this.reporter.mapped("architecture.edge");
      } else if (edge.left && edge.right) {
        this.reporter.mapped("architecture.edge.both");
      } else this.reporter.mapped("architecture.edge.arrow");
      this.reporter.mapped("architecture.edge.side");
    }
    return this.sheet;
  }
}
