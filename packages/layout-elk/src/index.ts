import type {
  ArrangePort,
  ArrangeRequest,
  Arrangement,
  LayoutEngine,
} from "@meltemi/diagrams-layout";

export const PACKAGE_NAME = "@meltemi/diagrams-layout-elk";

/** The pinned ELK build; the adapter relies on its worker's synchronous dispatcher. */
export const ELK_VERSION = "0.12.0";

interface ElkPoint {
  x: number;
  y: number;
}

interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  ports?: {
    id: string;
    x?: number;
    y?: number;
    width: number;
    height: number;
    layoutOptions?: Record<string, string>;
  }[];
  edges?: ElkEdge[];
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  layoutOptions?: Record<string, string>;
  container?: string;
  labels?: {
    id: string;
    width: number;
    height: number;
    text: string;
    layoutOptions?: Record<string, string>;
  }[];
  sections?: { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }[];
}

interface FakeWorker {
  onmessage: (message: { data: { id: number; data?: unknown; error?: unknown } }) => void;
  dispatcher: { dispatch(event: { data: Record<string, unknown> }): void };
}

const DIRECTIONS: Readonly<Record<ArrangeRequest["direction"], string>> = {
  LR: "RIGHT",
  RL: "LEFT",
  TB: "DOWN",
  BT: "UP",
};

const SIDES: Readonly<Record<string, string>> = {
  north: "NORTH",
  south: "SOUTH",
  east: "EAST",
  west: "WEST",
};

/** Ports are points on the node border; ELK needs a size, so they are 1 px squares. */
const PORT_SIZE = 1;

/** Options of `createElkEngine`. */
export interface ElkEngineOptions {
  /**
   * Returns the exports of `elkjs/lib/elk-worker.min.js`. Under Node the installed package is
   * loaded by default; bundled hosts ship the file next to their bundle or bundle the module, and
   * browsers must give it.
   */
  readonly loadWorker?: () => unknown;
}

/**
 * A module built into Node, reached when called so that the package loads in browsers too.
 * Undefined outside Node.
 */
function nodeModule<T>(id: string): T | undefined {
  const process = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
    .process;
  return process?.getBuiltinModule?.(id) as T | undefined;
}

function requireNode<T>(id: string): T {
  const module = nodeModule<T>(id);
  if (!module) {
    throw new Error(
      "The ELK worker can only be read from the installed elkjs under Node; pass `loadWorker` to createElkEngine.",
    );
  }
  return module;
}

/**
 * Loads `elk-worker.min.js` from a file as a CommonJS module, with `self` hidden. The file starts
 * ELK as a real web worker when `self` exists and `document` does not, which is the case in the VS
 * Code extension host; it would then export nothing and take over `self.onmessage`.
 */
export function loadElkWorkerFile(path: string): unknown {
  const { readFileSync } = requireNode<typeof import("node:fs")>("node:fs");
  const source = readFileSync(path, "utf8");
  const module: { exports: unknown } = { exports: {} };
  // The worker is plain script code shipped with elkjs; it is evaluated once per engine.
  const run = new Function("module", "exports", "self", source) as (
    module: { exports: unknown },
    exports: unknown,
    self: undefined,
  ) => void;
  run(module, module.exports, undefined);
  return module.exports;
}

/** Loads the worker module of the installed `elkjs`. */
function installedWorker(): unknown {
  const { createRequire } = requireNode<typeof import("node:module")>("node:module");
  const require = createRequire(import.meta.url);
  return loadElkWorkerFile(require.resolve("elkjs/lib/elk-worker.min.js"));
}

/** Starts an ELK worker and registers the layered algorithm. */
function startWorker(load: () => unknown): FakeWorker {
  const exports = load() as { default?: unknown } | (new () => FakeWorker);
  const Worker = (typeof exports === "function" ? exports : exports?.default) as
    (new () => FakeWorker) | undefined;
  if (typeof Worker !== "function") {
    throw new Error(
      `The ELK worker module does not export a worker; elkjs ${ELK_VERSION} is required.`,
    );
  }
  const instance = new Worker();
  if (typeof instance.dispatcher?.dispatch !== "function") {
    throw new Error(
      `elkjs ${ELK_VERSION} is required; the installed version has no synchronous dispatcher.`,
    );
  }
  instance.onmessage = () => undefined;
  instance.dispatcher.dispatch({ data: { cmd: "register", id: 0, algorithms: ["layered"] } });
  return instance;
}

/** Runs ELK on a graph and returns the laid-out graph, synchronously. */
function layoutGraph(elk: FakeWorker, graph: ElkNode): ElkNode {
  let result: ElkNode | undefined;
  let failure: unknown;
  elk.onmessage = (message) => {
    if (message.data.error) failure = message.data.error;
    else result = message.data.data as ElkNode;
  };
  try {
    elk.dispatcher.dispatch({
      data: { cmd: "layout", id: 1, graph, layoutOptions: {}, options: {} },
    });
  } catch (error) {
    failure = error;
  }
  if (failure !== undefined || !result) {
    const message =
      (failure as { message?: string; g?: string })?.message ??
      (failure as { g?: string })?.g ??
      String(failure ?? "no result");
    throw new Error(message);
  }
  return result;
}

const portId = (node: string, port: string) => `${node}\u0000${port}`;

/** Sides where relations enter and leave a box, by direction. */
const FLOW_SIDES: Readonly<
  Record<
    ArrangeRequest["direction"],
    { readonly in: ArrangePort["side"]; readonly out: ArrangePort["side"] }
  >
> = {
  LR: { in: "west", out: "east" },
  RL: { in: "east", out: "west" },
  TB: { in: "north", out: "south" },
  BT: { in: "south", out: "north" },
};

const COMPASS: ReadonlySet<string> = new Set(["north", "south", "east", "west"]);

/** A port of one relation end: on a compass side, or at a named port. */
interface EndPort {
  readonly id: string;
  readonly side: ArrangePort["side"];
}
/** The ELK graph of a request: compound groups, nodes with fixed-position ports, edges. */
export function elkGraph(request: ArrangeRequest): ElkNode {
  const root: ElkNode = {
    id: "\u0000root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": DIRECTIONS[request.direction],
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(request.spacing.node),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(request.spacing.layer),
      "elk.spacing.edgeEdge": String(request.spacing.edge),
      "elk.layered.spacing.edgeEdgeBetweenLayers": String(request.spacing.edge),
      "elk.spacing.edgeNode": "20",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.randomSeed": "1",
      // Trees: every parent centred over its children.
      ...(request.algorithm === "tree"
        ? {
            "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
            "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
          }
        : {}),
    },
    children: [],
    edges: [],
  };
  const containers = new Map<string, ElkNode>([["", root]]);
  // Groups lay out their children with the same spacing as the root.
  const spacing = Object.fromEntries(
    Object.entries(root.layoutOptions!).filter(([key]) => key.includes(".spacing.")),
  );
  for (const group of request.groups) {
    containers.set(group.id, {
      id: group.id,
      layoutOptions: {
        ...spacing,
        "elk.padding": `[top=${group.padding.top},left=${group.padding.left},bottom=${group.padding.bottom},right=${group.padding.right}]`,
        // A written size is the least the group gets, its children centred inside.
        ...(group.minimum
          ? {
              "elk.nodeSize.constraints": "MINIMUM_SIZE",
              "elk.nodeSize.minimum": `(${group.minimum.width}, ${group.minimum.height})`,
              "elk.contentAlignment": "[H_CENTER, V_CENTER]",
            }
          : {}),
      },
      children: [],
    });
  }
  // Groups nest in their parents; a group whose parent is missing goes to the root.
  for (const group of request.groups) {
    const parent = containers.get(group.parent ?? "") ?? root;
    parent.children!.push(containers.get(group.id)!);
  }
  // Named ports are points that every relation using them shares. A compass port only names a
  // side, so each relation end gets its own port there and ELK spreads them along the side. A
  // box with ports gets a port for its other relation ends too, in the middle of the side where
  // relations enter or leave: ELK would otherwise attach them to a corner.
  const flow = FLOW_SIDES[request.direction];
  const byId = new Map(request.nodes.map((n) => [n.id, n]));
  const named = (node: string) => byId.get(node)?.ports.filter((p) => !COMPASS.has(p.id)) ?? [];
  const constrained = new Set(
    request.edges.flatMap((e) => [
      ...(e.sourcePort ? [e.source] : []),
      ...(e.targetPort ? [e.target] : []),
    ]),
  );
  for (const node of request.nodes) if (named(node.id).length > 0) constrained.add(node.id);
  const endPorts = new Map<string, EndPort[]>();
  const endpoint = (
    edge: string,
    node: string,
    port: string | null,
    end: "source" | "target",
  ): string => {
    if (port && !COMPASS.has(port)) return portId(node, port);
    if (!constrained.has(node)) return node;
    const side = (port ?? (end === "source" ? flow.out : flow.in)) as ArrangePort["side"];
    const id = `\u0001${edge}\u0001${end}`;
    endPorts.set(node, [...(endPorts.get(node) ?? []), { id, side }]);
    return portId(node, id);
  };
  const edges = request.edges.map((edge) => ({
    edge,
    source: endpoint(edge.id, edge.source, edge.sourcePort, "source"),
    target: endpoint(edge.id, edge.target, edge.targetPort, "target"),
  }));
  for (const node of request.nodes) {
    const ports: ArrangePort[] = [...named(node.id)];
    // Relation ends share their side evenly, in the order of the relations.
    const ends = endPorts.get(node.id) ?? [];
    for (const end of ends) {
      const same = ends.filter((e) => e.side === end.side);
      const position = (same.indexOf(end) + 1) / (same.length + 1);
      ports.push({ id: end.id, side: end.side, position });
    }
    // Named ports keep their exact positions; otherwise ELK may reorder ports along a side.
    const constraint =
      ports.length === 0 ? "UNDEFINED" : named(node.id).length > 0 ? "FIXED_POS" : "FIXED_SIDE";
    const elkNode: ElkNode = {
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: { "elk.portConstraints": constraint },
      ports: ports.map((port) => {
        const horizontal = port.side === "north" || port.side === "south";
        const x =
          port.side === "west"
            ? -PORT_SIZE
            : port.side === "east"
              ? node.width
              : node.width * port.position;
        const y =
          port.side === "north"
            ? -PORT_SIZE
            : port.side === "south"
              ? node.height
              : node.height * port.position;
        return {
          id: portId(node.id, port.id),
          x: horizontal ? x - PORT_SIZE / 2 : x,
          y: horizontal ? y : y - PORT_SIZE / 2,
          width: PORT_SIZE,
          height: PORT_SIZE,
          layoutOptions: { "elk.port.side": SIDES[port.side]! },
        };
      }),
    };
    (containers.get(node.parent ?? "") ?? root).children!.push(elkNode);
  }
  // Groups are containers: relation ends on their sides get ports whose places ELK chooses.
  for (const group of request.groups) {
    const ends = endPorts.get(group.id);
    if (!ends) continue;
    const container = containers.get(group.id)!;
    container.layoutOptions = { ...container.layoutOptions, "elk.portConstraints": "FIXED_SIDE" };
    container.ports = ends.map((end) => ({
      id: portId(group.id, end.id),
      width: PORT_SIZE,
      height: PORT_SIZE,
      layoutOptions: { "elk.port.side": SIDES[end.side]! },
    }));
  }
  for (const { edge, source, target } of edges) {
    root.edges!.push({
      id: edge.id,
      sources: [source],
      targets: [target],
      // A centred label gets its own space between the layers.
      ...(edge.label
        ? {
            labels: [
              {
                id: `${edge.id}\u0000label`,
                width: edge.label.width,
                height: edge.label.height,
                // ELK ignores labels without text.
                text: edge.id,
                layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
              },
            ],
          }
        : {}),
      layoutOptions: edge.primary
        ? {
            "elk.layered.priority.straightness": "10",
            "elk.layered.priority.direction": "10",
          }
        : {
            "elk.layered.priority.straightness": "0",
            "elk.layered.priority.direction": "0",
          },
    });
  }
  return root;
}

/**
 * Absolute positions of the nodes of a laid-out graph, the offsets of every container and the
 * boxes of the containers below the root.
 */
function collect(
  node: ElkNode,
  offset: ElkPoint,
  centers: Map<string, ElkPoint>,
  offsets: Map<string, ElkPoint>,
  boxes: Map<string, { x: number; y: number; width: number; height: number }>,
): void {
  offsets.set(node.id, offset);
  for (const child of node.children ?? []) {
    const origin = { x: offset.x + (child.x ?? 0), y: offset.y + (child.y ?? 0) };
    if (child.children) {
      boxes.set(child.id, { ...origin, width: child.width ?? 0, height: child.height ?? 0 });
      collect(child, origin, centers, offsets, boxes);
    } else
      centers.set(child.id, {
        x: origin.x + (child.width ?? 0) / 2,
        y: origin.y + (child.height ?? 0) / 2,
      });
  }
}

/** A layout engine backed by ELK's layered algorithm (elkjs, EPL-2.0). */
export function createElkEngine(options: ElkEngineOptions = {}): LayoutEngine {
  // The worker loads on first use: about 80 ms that hosts without automatic diagrams never pay.
  let worker: FakeWorker | undefined;
  return {
    name: "ELK",
    arrange(request: ArrangeRequest): Arrangement {
      worker ??= startWorker(options.loadWorker ?? installedWorker);
      const graph = layoutGraph(worker, elkGraph(request));
      const nodeCenters = new Map<string, ElkPoint>();
      const offsets = new Map<string, ElkPoint>();
      const containers = new Map<string, { x: number; y: number; width: number; height: number }>();
      collect(graph, { x: 0, y: 0 }, nodeCenters, offsets, containers);
      const centers = new Map<string, { x: number; y: number }>();
      for (const node of request.nodes) {
        const center = nodeCenters.get(node.id);
        if (center) centers.set(node.id, { x: round(center.x), y: round(center.y) });
      }
      const routes = new Map<string, { x: number; y: number }[]>();
      for (const edge of graph.edges ?? []) {
        const section = edge.sections?.[0];
        if (!section) continue;
        // Edge coordinates are relative to the edge's container.
        const origin = offsets.get(edge.container ?? graph.id) ?? { x: 0, y: 0 };
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          (p) => ({ x: round(p.x + origin.x), y: round(p.y + origin.y) }),
        );
        routes.set(edge.id, points);
      }
      const groups = new Map<string, { x: number; y: number; width: number; height: number }>();
      for (const group of request.groups) {
        const box = containers.get(group.id);
        if (!box) continue;
        groups.set(group.id, {
          x: round(box.x),
          y: round(box.y),
          width: round(box.width),
          height: round(box.height),
        });
      }
      return { centers, routes, groups };
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
