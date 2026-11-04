import type { Point } from "@meltemi/diagrams-model";
import type { Box, Side } from "./geometry.js";

/** A port of a node: a side and a position along it, from 0 to 1. */
export interface ArrangePort {
  readonly id: string;
  readonly side: Side;
  readonly position: number;
}

/** A box to arrange: a node, decision, data store, note or tag. */
export interface ArrangeNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly kind: string;
  /** The innermost group declaring the node, or null. */
  readonly parent: string | null;
  /** The centre of a placed node in `assisted` mode; the engine may use it as a hint. */
  readonly fixed: Point | null;
  readonly ports: readonly ArrangePort[];
}

export interface ArrangeGroup {
  readonly id: string;
  readonly parent: string | null;
  readonly padding: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /**
   * The written `size` of a placed group with children: the engine lays the group out at least
   * this large, its children centred inside.
   */
  readonly minimum?: { readonly width: number; readonly height: number };
}

export interface ArrangeEdge {
  readonly id: string;
  /** A node or group id. */
  readonly source: string;
  readonly target: string;
  /** A port id of the source or target node, or null for any side. */
  readonly sourcePort: string | null;
  readonly targetPort: string | null;
  /** True for `->` relations, false for `-->` ones, which the engine may route less directly. */
  readonly primary: boolean;
  /** The label pill drawn at the middle of the relation, which the engine leaves room for. */
  readonly label?: { readonly width: number; readonly height: number } | null;
}

export interface ArrangeRequest {
  readonly direction: "LR" | "RL" | "TB" | "BT";
  /**
   * `tree` keeps parents centred over their children (declared types may ask for it); layered
   * graphs by default.
   */
  readonly algorithm?: "layered" | "tree";
  readonly nodes: readonly ArrangeNode[];
  readonly groups: readonly ArrangeGroup[];
  readonly edges: readonly ArrangeEdge[];
  readonly spacing: { readonly node: number; readonly layer: number; readonly edge: number };
}

export interface Arrangement {
  /** Centres of every node, in diagram coordinates. */
  readonly centers: ReadonlyMap<string, Point>;
  /** Points of every edge from the source border to the target border. */
  readonly routes: ReadonlyMap<string, readonly Point[]>;
  /**
   * The box of every group, in diagram coordinates. Engines that leave it out let the layout
   * draw groups around their children.
   */
  readonly groups?: ReadonlyMap<string, Box>;
}

/**
 * Arranges unplaced boxes for `auto` and `assisted` diagrams. Engines are synchronous so layout
 * stays synchronous for every host; `@meltemi/diagrams-layout-elk` provides one backed by ELK.
 */
export interface LayoutEngine {
  readonly name: string;
  arrange(request: ArrangeRequest): Arrangement;
}

/** Spacing passed to engines: between boxes in a layer, between layers, and between edges. */
export const ENGINE_SPACING = { node: 40, layer: 70, edge: 16 } as const;
