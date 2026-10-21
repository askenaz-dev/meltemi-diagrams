import { IconRegistry, LazyIconifyPack, librariesOf, type Library } from "@meltemi/diagrams-assets";
import {
  createNodeAssetReader,
  createNodeIconPacks,
  createNodeLibraries,
} from "@meltemi/diagrams-assets/node";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  BOX_SHAPES,
  ICON_POSITIONS as MODEL_ICON_POSITIONS,
  ICON_SIZE_RANGE,
  LABEL_POSITIONS as MODEL_LABEL_POSITIONS,
  compile,
} from "@meltemi/diagrams-model";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeDocument,
  CanvasSession,
  isCanvasMessage,
  type CanvasAction,
  type CanvasRender,
  type HostMessage,
  type IconGroupInfo,
  type InspectorField,
  type InspectorModel,
} from "../src/index.js";
import {
  ICON_POSITIONS,
  ICON_SIZES,
  LABEL_POSITIONS,
  SHAPES,
  commandFor,
} from "../src/canvas/index.js";

const registry = new IconRegistry(createNodeIconPacks());
const libraries: readonly Library[] = librariesOf(registry, createNodeLibraries());

/**
 * A session on a text with the project's packs and libraries (or others), drawn with the packs, on
 * its first diagram (or `diagram`), with helpers that send a message and apply the plan it gives.
 */
function open(
  text: string,
  options: {
    readonly icons?: boolean;
    readonly registry?: IconRegistry;
    readonly libraries?: readonly Library[];
    readonly diagram?: string;
  } = {},
) {
  const session = new CanvasSession();
  const packs = options.registry ?? registry;
  const assets =
    options.icons === false ? {} : { icons: packs, libraries: options.libraries ?? libraries };
  const analyze = (source: string, revision: number) =>
    analyzeDocument({
      text: source,
      revision,
      ...assets,
      layout: options.icons === false ? {} : { icons: packs },
    });
  let current = text;
  let rev = 1;
  let messages: readonly HostMessage[] = session.update(analyze(current, rev));
  if (options.diagram) {
    messages = session.receive({ type: "pickDiagram", diagram: options.diagram }).messages;
  }
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyze(current, rev));
    } else if (result.messages.length > 0) messages = [...result.messages];
    return result;
  };
  const act = (action: CanvasAction) => send({ type: "action", revision: rev, action });
  const apply = (action: CanvasAction): string => {
    const result = act(action);
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    return current;
  };
  const search = (query: string, token = 1): IconGroupInfo[] => {
    const answer = session.receive({ type: "searchIcons", query, token }).messages[0];
    if (answer?.type !== "icons") throw new Error(JSON.stringify(answer));
    expect(answer.token).toBe(token);
    return [...answer.groups];
  };
  const render = (): CanvasRender =>
    session.state().find((m): m is HostMessage & { type: "render" } => m.type === "render")!;
  const inspector = (ids: readonly string[]): InspectorModel =>
    session
      .receive({ type: "select", ids })
      .messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!
      .model;
  return {
    session,
    send,
    act,
    apply,
    search,
    render,
    inspector,
    text: () => current,
    messages: () => messages,
  };
}

const FLOW = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  decision ok "OK?"
  note memo "Memo"
  api -> db: "save" as save
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 266)
    place ok at (700, 112)
    place memo at (700, 266)
  }
}
`;

const FREE = `diagram s: free {
  box a "A"
  text t "T"
  placement {
    place a at (100, 100)
    place t at (400, 100)
  }
}
`;

const SEQUENCE =
  'diagram q: sequence {\n  participant a "A"\n  participant b "B"\n  a -> b: "call"\n}\n';

const C4 = `model m {
  person customer "Customer"
  system shop "Shop" {
    container web "Web" { technology "React" }
    container api "API"
  }
  customer -> shop.web: "Uses" as visit
  shop.web -> shop.api: "Calls" as call
}

diagram containers: c4 using m {
  level container
  scope shop
  style shop.web { icon "tabler:world" }
}
`;

const references = (groups: readonly IconGroupInfo[]) =>
  groups.flatMap((g) => g.items.map((i) => i.reference));

const field = (model: InspectorModel, name: string): InspectorField | undefined =>
  model.fields.find((f) => f.name === name);

afterEach(() => setLocale("en"));

describe("searchIcons", () => {
  it("answers with the packs' icons and the libraries' items for a keyword, with its token", () => {
    const groups = open(FLOW).search("database", 3);
    const tabler = groups.find((g) => g.id === "tabler")!;
    expect(tabler).toMatchObject({ kind: "pack", title: expect.stringMatching(/Tabler/) });
    const database = tabler.items.find((i) => i.reference === "tabler:database")!;
    expect(database.label).toBe("database");
    expect(database.svg).toMatch(/^<svg/);
    const technology = groups.find((g) => g.id === "tech")!;
    expect(technology).toMatchObject({ kind: "library", title: "Technology" });
    expect(technology.items.find((i) => i.label === "PostgreSQL")).toMatchObject({
      reference: "logos:postgresql",
      svg: expect.stringMatching(/^<svg/),
    });
    // The packs' groups come before the libraries'.
    expect(groups.findIndex((g) => g.kind === "library")).toBeGreaterThan(
      groups.findIndex((g) => g.kind === "pack"),
    );
  });

  it("carries each search's own token, so the canvas keeps the latest query's answer", () => {
    const canvas = open(FLOW);
    const first = canvas.session.receive({ type: "searchIcons", query: "data", token: 7 });
    const second = canvas.session.receive({ type: "searchIcons", query: "server", token: 8 });
    expect(first.messages[0]).toMatchObject({ type: "icons", token: 7 });
    expect(second.messages[0]).toMatchObject({ type: "icons", token: 8 });
    const answer = second.messages[0]!;
    expect(answer.type === "icons" ? references(answer.groups) : []).toContain("tabler:server");
  });

  it("offers 60 icons at most, each once, a library item with its label", () => {
    const canvas = open(FLOW);
    for (const query of ["a", "cloud", "database", "server"]) {
      const found = references(canvas.search(query));
      expect(found.length, query).toBeLessThanOrEqual(60);
      expect(new Set(found).size, query).toBe(found.length);
    }
    expect(references(canvas.search("a"))).toHaveLength(60);
    // PostgreSQL is the Technology library's item, not the logos pack's icon again.
    const postgres = canvas.search("postgres");
    expect(postgres.filter((g) => g.items.some((i) => i.reference === "logos:postgresql"))).toEqual(
      [expect.objectContaining({ id: "tech" })],
    );
    // A provider pack names its icons: AWS Lambda, also found by its name in words.
    const lambda = canvas.search("aws lambda");
    expect(lambda.flatMap((g) => g.items).find((i) => i.reference === "aws:lambda")).toMatchObject({
      label: "AWS Lambda",
    });
  });

  it("offers a typed pack:name first when it names an icon", () => {
    const canvas = open(FLOW);
    const typed = canvas.search("aws:lambda");
    expect(typed[0]).toMatchObject({ id: "aws", kind: "pack" });
    expect(typed[0]!.items[0]).toMatchObject({ reference: "aws:lambda", label: "AWS Lambda" });
    expect(references(canvas.search("tabler:server"))[0]).toBe("tabler:server");
    expect(references(canvas.search("tabler:no-such-icon"))).not.toContain("tabler:no-such-icon");
  });

  it("answers an empty query with the Technology library's first category", () => {
    const groups = open(FLOW).search("  ");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "tech", kind: "library", title: "Technology" });
    expect(groups[0]!.items[0]).toMatchObject({
      reference: "logos:postgresql",
      label: "PostgreSQL",
    });
    expect(groups[0]!.items).toHaveLength(40);
  });

  it("offers only icons the packs can draw, each with its thumbnail", () => {
    const canvas = open(FLOW);
    const queries = ["google", "google drive", "git", "apache", "react", "github", "microsoft"];
    for (const query of [...queries, "linux", "chrome", "studio", "microsoft teams"]) {
      const items = canvas.search(query).flatMap((g) => g.items);
      expect(items.length, query).toBeGreaterThan(0);
      for (const item of items) {
        expect(registry.lookup(item.reference).status, `${query}: ${item.reference}`).toBe("found");
        expect(item.svg, item.reference).toMatch(/^<svg/);
        expect(item.missing, item.reference).toBeUndefined();
      }
    }
    // Logos drawn with a mask, a clip path or a reuse, which the sanitiser refuses.
    expect(references(canvas.search("google drive"))).not.toContain("logos:google-drive");
    expect(references(canvas.search("github"))).not.toContain("logos:github-octocat");
    expect(references(canvas.search("microsoft teams"))).not.toContain("logos:microsoft-teams");
    expect(references(canvas.search("logos:google-drive"))).not.toContain("logos:google-drive");
  });

  it("never offers a library item that cannot be drawn; one whose pack loads comes without it", () => {
    const read = createNodeAssetReader();
    let arrived = false;
    const kubernetes = new LazyIconifyPack("kubernetes", () =>
      arrived ? read("icons/kubernetes.json") : undefined,
    );
    const late = new IconRegistry([registry.pack("tabler")!, registry.pack("logos")!, kubernetes]);
    const items = [
      { icon: "logos:google-drive", label: "Drive widget" },
      { icon: "tabler:no-such-icon", label: "Nothing widget" },
      { icon: "nope:thing", label: "Nowhere widget" },
      { icon: "kubernetes:pod", label: "Pod widget" },
      { icon: "tabler:server", label: "Server widget" },
    ];
    const mine: Library = {
      id: "mine",
      title: "Mine",
      source: "assets/libraries/mine.json",
      categories: [{ id: "all", title: "All", count: items.length, items }],
    };
    const canvas = open(FLOW, { registry: late, libraries: [mine] });
    for (const query of ["widget", ""]) {
      const group = canvas.search(query).find((g) => g.id === "mine")!;
      expect(
        group.items.map((i) => i.reference),
        query,
      ).toEqual(["kubernetes:pod", "tabler:server"]);
      // Its pack is on its way: no picture yet, and not missing.
      expect(group.items[0]!.svg).toBeNull();
      expect(group.items[0]!.missing).toBeUndefined();
      expect(group.items[1]!.svg).toMatch(/^<svg/);
    }
    arrived = true;
    const pod = canvas.search("widget").find((g) => g.id === "mine")!.items[0]!;
    expect(pod).toMatchObject({ reference: "kubernetes:pod", svg: expect.stringMatching(/^<svg/) });
  });

  it("answers C4 views with the packs' icons, without the libraries", () => {
    const canvas = open(C4);
    const groups = canvas.search("server");
    expect(references(groups)).toContain("tabler:server");
    expect(groups.every((g) => g.kind === "pack")).toBe(true);
    const first = canvas.search("");
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((g) => g.kind === "pack")).toBe(true);
  });

  it("offers nothing on sequence diagrams, whose participants draw no icon, or without packs", () => {
    expect(open(SEQUENCE).search("server")).toEqual([]);
    expect(open(FLOW, { icons: false }).search("server")).toEqual([]);
  });

  it("is a well-formed message only with a query and a token", () => {
    expect(isCanvasMessage({ type: "searchIcons", query: "db", token: 1 })).toBe(true);
    expect(isCanvasMessage({ type: "searchIcons", query: "", token: 0 })).toBe(true);
    expect(isCanvasMessage({ type: "searchIcons", query: "db" })).toBe(false);
    expect(isCanvasMessage({ type: "searchIcons", query: 3, token: 1 })).toBe(false);
    expect(isCanvasMessage({ type: "searchIcons", query: "x".repeat(201), token: 1 })).toBe(false);
    // The host's icon dialog is gone from the canvas protocol.
    expect(isCanvasMessage({ type: "pickIcon", ids: ["api"] })).toBe(false);
  });
});

describe("creating with an icon and a placement", () => {
  it("creates an icon shape from the tool, empty, in one undo step", () => {
    const canvas = open(FLOW);
    const result = canvas.act({
      kind: "create",
      elementKind: "node",
      at: { x: 420, y: 260 },
      icon: "aws:lambda",
      shape: "icon",
    });
    expect(result.plan).toBeDefined();
    const text = canvas.text();
    expect(text).toContain('  node1[""]\n  style node1 { icon "aws:lambda"; shape icon }\n');
    expect(text).toContain("place node1 at (420, 266)");
    expect(canvas.session.selected).toEqual(["node1"]);
    expect(applyTextEdits(text, result.plan!.inverse)).toBe(FLOW);
  });

  it("creates the icon in a box: the current shape, or none for rounded", () => {
    const canvas = open(FLOW);
    let text = canvas.apply({
      kind: "create",
      elementKind: "node",
      at: { x: 420, y: 260 },
      icon: "aws:lambda",
    });
    expect(text).toContain('  node1[""]\n  style node1 { icon "aws:lambda" }\n');
    text = canvas.apply({
      kind: "create",
      elementKind: "node",
      at: { x: 700, y: 400 },
      icon: "tabler:server",
      shape: "hexagon",
    });
    expect(text).toContain('  node2[""]\n  style node2 { icon "tabler:server"; shape hexagon }\n');
  });

  it("creates a library element with its label, named after its icon", () => {
    const canvas = open(FLOW);
    const text = canvas.apply({
      kind: "create",
      elementKind: "node",
      at: { x: 300, y: 400 },
      label: "AWS Lambda",
      icon: "aws:lambda",
      shape: "icon",
    });
    expect(text).toContain(
      '  lambda1["AWS Lambda"]\n  style lambda1 { icon "aws:lambda"; shape icon }\n',
    );
    expect(canvas.session.selected).toEqual(["lambda1"]);
  });

  it("creates a free box as an icon, and just the icon", () => {
    const canvas = open(FREE);
    let text = canvas.apply({
      kind: "create",
      elementKind: "box",
      at: { x: 300, y: 300 },
      icon: "tabler:server",
      shape: "icon",
    });
    expect(text).toContain('  box box1 ""\n  style box1 { icon "tabler:server"; shape icon }\n');
    text = canvas.apply({
      kind: "create",
      elementKind: "icon",
      at: { x: 600, y: 300 },
      source: "tabler:server",
    });
    expect(text).toContain('  icon icon1 "tabler:server"\n');
    expect(text).toMatch(/place icon1 at \(\d+, \d+\)/);
    expect(compile(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("asks the host for an image only; an icon object comes with its icon", () => {
    const canvas = open(FREE);
    expect(
      canvas.act({ kind: "create", elementKind: "image", at: { x: 600, y: 400 } }).pick,
    ).toEqual({ kind: "image", at: { x: 600, y: 400 } });
    const action = (a: unknown) => isCanvasMessage({ type: "action", revision: 1, action: a });
    const at = { x: 1, y: 2 };
    expect(action({ kind: "create", elementKind: "icon", at })).toBe(false);
    expect(action({ kind: "create", elementKind: "icon", at, source: "tabler:server" })).toBe(true);
    expect(action({ kind: "create", elementKind: "icon", at, source: "server" })).toBe(false);
    expect(
      action({ kind: "create", elementKind: "icon", at, source: "tabler:server", shape: "icon" }),
    ).toBe(false);
    expect(
      action({ kind: "create", elementKind: "icon", at, source: "tabler:x", icon: "tabler:x" }),
    ).toBe(false);
    expect(
      action({ kind: "create", elementKind: "node", at, icon: "aws:lambda", shape: "icon" }),
    ).toBe(true);
  });
});

describe("setIcon and removeIcon", () => {
  it("gives the selection its icon in one undo step", () => {
    const canvas = open(FLOW);
    const result = canvas.act({ kind: "setIcon", ids: ["api", "db"], icon: "tabler:server" });
    expect(result.plan!.operation.kind).toBe("batch");
    expect(canvas.text()).toContain('style api { icon "tabler:server" }');
    expect(canvas.text()).toContain('style db { icon "tabler:server" }');
    expect(applyTextEdits(canvas.text(), result.plan!.inverse)).toBe(FLOW);
  });

  it("writes only the icon of an element an icon is dropped on", () => {
    const canvas = open(FLOW);
    const text = canvas.apply({ kind: "setIcon", ids: ["db"], icon: "tabler:database" });
    const added = text.split("\n").filter((line) => !FLOW.split("\n").includes(line));
    expect(added).toEqual(['  style db { icon "tabler:database" }']);
  });

  it("leaves what takes no icon, and refuses when nothing does", () => {
    const canvas = open(FLOW);
    canvas.apply({ kind: "setIcon", ids: ["ok", "memo", "save"], icon: "tabler:help" });
    expect(canvas.text()).toContain('style ok { icon "tabler:help" }');
    expect(canvas.text()).not.toContain("style memo");
    expect(canvas.text()).not.toContain("style save");
    const refused = canvas.act({ kind: "setIcon", ids: ["memo", "save"], icon: "tabler:help" });
    expect(refused.plan).toBeUndefined();
    expect(refused.messages[0]).toMatchObject({
      type: "rejected",
      code: "edit.invalid-value",
      reason: "Icons go on nodes, decisions, data stores and boxes; select one of them.",
    });
    expect(open(SEQUENCE).act({ kind: "setIcon", ids: ["a"], icon: "tabler:user" }).plan).toBe(
      undefined,
    );
    // The same icon again writes nothing.
    expect(canvas.act({ kind: "setIcon", ids: ["ok"], icon: "tabler:help" }).plan).toBeUndefined();
  });

  it("replaces an icon shared by a style statement for one of its targets", () => {
    const shared = FLOW.replace(
      "  placement {",
      '  style api, db { icon "tabler:server" }\n  placement {',
    );
    const text = open(shared).apply({ kind: "setIcon", ids: ["db"], icon: "tabler:database" });
    expect(text).toContain('style api { icon "tabler:server" }');
    expect(text).toContain('style db { icon "tabler:database" }');
  });

  it("removes the icon of an element's own style and keeps the rest of it", () => {
    const styled = FLOW.replace(
      "  placement {",
      '  style db { icon "tabler:database"; fill "#eef" }\n  style cache { icon "tabler:bolt" }\n  placement {',
    );
    const canvas = open(styled);
    let text = canvas.apply({ kind: "removeIcon", ids: ["db"] });
    expect(text).toContain('  style db { fill "#eef" }\n');
    expect(text).not.toContain("tabler:database");
    text = canvas.apply({ kind: "removeIcon", ids: ["api", "cache"] });
    expect(text).not.toContain("style cache");
    // Nothing of its own to remove.
    expect(canvas.act({ kind: "removeIcon", ids: ["api"] }).plan).toBeUndefined();
  });

  it("are well-formed with ids and a reference", () => {
    const action = (a: unknown) => isCanvasMessage({ type: "action", revision: 1, action: a });
    expect(action({ kind: "setIcon", ids: ["a"], icon: "tabler:server" })).toBe(true);
    expect(action({ kind: "setIcon", ids: ["a"], icon: "server" })).toBe(false);
    expect(action({ kind: "setIcon", ids: "a", icon: "tabler:server" })).toBe(false);
    expect(action({ kind: "setIcon", ids: ["a"] })).toBe(false);
    expect(action({ kind: "removeIcon", ids: ["a"] })).toBe(true);
    expect(action({ kind: "removeIcon" })).toBe(false);
  });
});

describe("what the canvas knows of an element's icon", () => {
  const SHAPED = `diagram d: flow {
  layout manual
  fn["Process orders"]
  bare[""]
  api["API"]
  db[("DB")]
  group g "G" {
    inner["Inner"]
  }
  note memo "Memo"
  class fancy { icon "tabler:star" }
  style fn { icon "aws:lambda"; shape icon }
  style bare { icon "aws:lambda"; shape icon }
  style api { icon "tabler:server" }
  style db { class fancy }
  placement {
    place fn at (200, 120)
    place bare at (400, 120)
    place api at (600, 120)
    place db at (200, 320)
    place memo at (600, 320)
    place inner at (400, 320)
  }
}
`;

  it("says which elements take an icon, and the icon of their own style", () => {
    const elements = new Map(
      open(SHAPED)
        .render()
        .elements.map((e) => [e.id, e]),
    );
    for (const id of ["fn", "bare", "api", "db", "inner"]) {
      expect(elements.get(id)!.takesIcon, id).toBe(true);
    }
    for (const id of ["g", "memo"]) expect(elements.get(id)!.takesIcon, id).toBe(false);
    expect(elements.get("api")!.icon).toBe("tabler:server");
    expect(elements.get("fn")!.icon).toBe("aws:lambda");
    // A class's icon is not the element's own to remove.
    expect(elements.get("db")!.icon).toBeNull();
    const free = open(FREE).render().elements;
    expect(free.find((e) => e.id === "a")!.takesIcon).toBe(true);
    expect(free.find((e) => e.id === "t")!.takesIcon).toBe(false);
    expect(
      open(SEQUENCE)
        .render()
        .elements.every((e) => !e.takesIcon),
    ).toBe(true);
  });

  it("hands over the label an icon shape draws outside its square", () => {
    const elements = new Map(
      open(SHAPED)
        .render()
        .elements.map((e) => [e.id, e]),
    );
    const fn = elements.get("fn")!;
    expect(fn.shape).toBe("icon");
    expect(fn.box).toMatchObject({ width: 64, height: 64 });
    const label = fn.labelBox!;
    // Below the square, half the padding away, centred on it.
    expect(label.y).toBeGreaterThan(fn.box.y + fn.box.height);
    expect(label.x + label.width / 2).toBeCloseTo(fn.box.x + fn.box.width / 2, 0);
    // The inline editor types over the label, not over the icon.
    for (const side of ["x", "y", "width", "height"] as const) {
      expect(fn.text!.area[side], side).toBeCloseTo(label[side], 6);
    }
    expect(fn.text!.anchor.y).toBeGreaterThan(fn.box.y + fn.box.height);
    // Without a label there is none to hand over; a new one goes below the square.
    const bare = elements.get("bare")!;
    expect(bare.labelBox).toBeUndefined();
    expect(bare.text).toMatchObject({ align: "center", lines: true });
    expect(bare.text!.anchor.x).toBeCloseTo(bare.box.x + bare.box.width / 2, 1);
    expect(bare.text!.anchor.y).toBeGreaterThan(bare.box.y + bare.box.height);
    expect(elements.get("api")!.labelBox).toBeUndefined();
  });

  it("hands over the label of an icon shape without its icon, not the placeholder's name", () => {
    const PLACEHOLDERS = `diagram d: flow {
  layout manual
  drawn["Lambda"]
  fn["Lambda"]
  fe[""]
  gone["Gone"]
  side[""]
  style drawn { icon "aws:lambda"; shape icon }
  style fn { shape icon }
  style fe { shape icon }
  style gone { icon "zz:nope"; shape icon }
  style side { shape icon; labelPosition right }
  placement {
    place drawn at (100, 100)
    place fn at (300, 100)
    place fe at (500, 100)
    place gone at (100, 300)
    place side at (300, 300)
  }
}
`;
    const elements = new Map(
      open(PLACEHOLDERS)
        .render()
        .elements.map((e) => [e.id, e]),
    );
    const label = elements.get("drawn")!.text!;
    for (const id of ["fn", "gone"]) {
      const element = elements.get(id)!;
      const text = element.text!;
      // Below the dashed square, where the label is drawn, in the label's font and colour.
      expect(text.anchor.y, id).toBeGreaterThan(element.box.y + element.box.height);
      for (const side of ["x", "y", "width", "height"] as const) {
        expect(text.area[side], `${id} ${side}`).toBeCloseTo(element.labelBox![side], 1);
      }
      expect(text, id).toMatchObject({
        size: label.size,
        weight: label.weight,
        color: label.color,
        align: "center",
      });
    }
    // Without a label: a new one goes outside the square, at its label position.
    const fe = elements.get("fe")!;
    expect(fe.text).toMatchObject({ size: label.size, color: label.color, align: "center" });
    expect(fe.text!.area.y).toBeGreaterThan(fe.box.y + fe.box.height);
    const side = elements.get("side")!;
    expect(side.text).toMatchObject({ align: "left", size: label.size });
    expect(side.text!.anchor.x).toBeGreaterThan(side.box.x + side.box.width);
  });

  it("places a new label of an icon shape at its label position", () => {
    const right = SHAPED.replace(
      'style bare { icon "aws:lambda"; shape icon }',
      'style bare { icon "aws:lambda"; shape icon; labelPosition right }',
    );
    const bare = open(right)
      .render()
      .elements.find((e) => e.id === "bare")!;
    expect(bare.text).toMatchObject({ align: "left" });
    expect(bare.text!.anchor.x).toBeGreaterThan(bare.box.x + bare.box.width);
    expect(bare.text!.anchor.y).toBeCloseTo(bare.box.y + bare.box.height / 2, 1);
  });
});

describe("the inspector's icon fields", () => {
  const ICONS = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  cache["Cache"]
  fn["Lambda"]
  group g "G" {
    inner["Inner"]
  }
  api -> db as save
  class starred { icon "tabler:star" }
  style api { icon "tabler:server" }
  style db { icon "tabler:database"; iconPosition center }
  style cache { class starred }
  style fn { icon "aws:lambda"; shape icon }
  placement {
    place api at (126, 112)
    place db at (420, 112)
    place cache at (420, 300)
    place fn at (126, 300)
    place inner at (700, 112)
  }
}
`;

  it("shows the icon with its thumbnail and name, written or from a class", () => {
    const canvas = open(ICONS);
    expect(field(canvas.inspector(["api"]), "style.icon")).toMatchObject({
      type: "icon",
      value: "tabler:server",
      thumbnail: {
        reference: "tabler:server",
        label: "server",
        svg: expect.stringMatching(/^<svg/),
      },
    });
    expect(field(canvas.inspector(["cache"]), "style.icon")).toMatchObject({
      value: null,
      placeholder: "tabler:star",
      thumbnail: { reference: "tabler:star", label: "star" },
    });
    expect(field(canvas.inspector(["fn"]), "style.icon")!.thumbnail).toMatchObject({
      label: "AWS Lambda",
    });
    // A node without one shows none.
    expect(field(canvas.inspector(["inner"]), "style.icon")!.thumbnail).toBeUndefined();
  });

  it("picks the icon position by its picture, after the shape in the strip", () => {
    const canvas = open(ICONS);
    const model = canvas.inspector(["api"]);
    expect(field(model, "style.iconPosition")).toMatchObject({
      label: "Icon position",
      type: "enum",
      value: null,
      placeholder: "left",
      glyphs: "iconPosition",
      section: "strip",
    });
    expect(field(model, "style.iconPosition")!.options).toEqual([...MODEL_ICON_POSITIONS]);
    const strip = model.fields.filter((f) => f.section === "strip").map((f) => f.name);
    expect(strip.indexOf("style.iconPosition")).toBe(strip.indexOf("style.shape") + 1);
    canvas.apply({ kind: "setField", ids: ["api"], field: "style.iconPosition", value: "right" });
    expect(canvas.text()).toContain('style api { icon "tabler:server"; iconPosition right }');
    // Without an icon, the field stays below the strip.
    const plain = field(canvas.inspector(["inner"]), "style.iconPosition")!;
    expect(plain.section).toBeUndefined();
  });

  it("shows the label position only where the icon is the centre piece", () => {
    const canvas = open(ICONS);
    expect(field(canvas.inspector(["db"]), "style.labelPosition")).toMatchObject({
      label: "Label position",
      value: null,
      placeholder: "bottom",
      glyphs: "labelPosition",
      options: [...MODEL_LABEL_POSITIONS],
    });
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.labelPosition", value: "top" });
    expect(canvas.text()).toContain("iconPosition center; labelPosition top }");
    expect(field(canvas.inspector(["api"]), "style.labelPosition")).toBeUndefined();
    // An icon shape: the label goes outside; the icon is the shape, so it has no position.
    const fn = canvas.inspector(["fn"]);
    expect(field(fn, "style.labelPosition")).toMatchObject({ placeholder: "bottom" });
    expect(field(fn, "style.iconPosition")).toBeUndefined();
    // Several: only when every one of them is.
    expect(field(canvas.inspector(["db", "fn"]), "style.labelPosition")).toBeDefined();
    expect(field(canvas.inspector(["db", "api"]), "style.labelPosition")).toBeUndefined();
  });

  it("sizes the icon with a slider, the drawn size greyed, auto and clear", () => {
    const canvas = open(ICONS);
    const size = field(canvas.inspector(["api"]), "style.iconSize")!;
    expect(size).toMatchObject({
      label: "Icon size",
      type: "number",
      value: null,
      // The theme's size beside the text, as drawn.
      placeholder: "18",
      range: { min: ICON_SIZE_RANGE.min, max: ICON_SIZE_RANGE.max, step: 1 },
      quick: [{ label: "Auto", value: "auto" }],
    });
    // A centred icon is as large as its box allows.
    const centred = Number(field(canvas.inspector(["db"]), "style.iconSize")!.placeholder);
    expect(centred).toBeGreaterThan(18);
    // An icon shape's icon fills its square.
    expect(field(canvas.inspector(["fn"]), "style.iconSize")!.placeholder).toBe("64");
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.iconSize", value: 48 });
    expect(canvas.text()).toContain("iconPosition center; iconSize 48 }");
    expect(field(canvas.inspector(["db"]), "style.iconSize")).toMatchObject({
      value: 48,
      placeholder: "48",
    });
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.iconSize", value: "auto" });
    expect(canvas.text()).toContain("iconPosition center; iconSize auto }");
    expect(field(canvas.inspector(["db"]), "style.iconSize")!.value).toBe("auto");
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.iconSize", value: "32px" });
    expect(canvas.text()).toContain("iconSize 32 }");
    canvas.apply({ kind: "setField", ids: ["db"], field: "style.iconSize", value: null });
    expect(canvas.text()).not.toContain("iconSize");
  });

  it("refuses an icon size out of range or a word it does not take", () => {
    const canvas = open(ICONS);
    for (const value of [200, "4", "big"]) {
      const result = canvas.act({ kind: "setField", ids: ["api"], field: "style.iconSize", value });
      expect(result.plan, String(value)).toBeUndefined();
      expect(result.messages[0]).toMatchObject({
        type: "rejected",
        reason: "Write `auto`, or a number from 8 to 128.",
      });
    }
    expect(canvas.text()).toBe(ICONS);
  });

  it("offers the position, the size and the label position to boxes only", () => {
    const canvas = open(ICONS);
    const group = canvas.inspector(["g"]);
    expect(field(group, "style.icon")).toBeDefined();
    for (const name of ["style.iconPosition", "style.iconSize", "style.labelPosition"]) {
      expect(field(group, name), name).toBeUndefined();
    }
    const relation = canvas.inspector(["save"]);
    expect(field(relation, "style.icon")).toBeDefined();
    expect(field(relation, "style.iconPosition")).toBeUndefined();
    expect(field(relation, "style.iconSize")).toBeUndefined();
  });

  it("tells an icon that does not exist from one whose pack is still loading", () => {
    const MISSING = `diagram d: flow {
  layout manual
  unknown["Unknown"]
  unsafe["Unsafe"]
  nowhere["Nowhere"]
  coming["Coming"]
  fine["Fine"]
  style unknown { icon "tabler:no-such-icon" }
  style unsafe { icon "logos:google-drive" }
  style nowhere { icon "nope:thing" }
  style coming { icon "kubernetes:pod" }
  style fine { icon "tabler:server" }
  placement {
    place unknown at (100, 100)
    place unsafe at (300, 100)
    place nowhere at (500, 100)
    place coming at (100, 300)
    place fine at (300, 300)
  }
}
`;
    const kubernetes = new LazyIconifyPack("kubernetes", () => undefined);
    const late = new IconRegistry([registry.pack("tabler")!, registry.pack("logos")!, kubernetes]);
    const canvas = open(MISSING, { registry: late });
    const thumbnail = (id: string) => field(canvas.inspector([id]), "style.icon")!.thumbnail!;
    // An unknown icon or pack, or a logo the sanitiser refuses: no picture will ever come.
    expect(thumbnail("unknown")).toEqual({
      reference: "tabler:no-such-icon",
      label: "no-such-icon",
      svg: null,
      missing: true,
    });
    expect(thumbnail("unsafe")).toMatchObject({ svg: null, missing: true });
    expect(thumbnail("nowhere")).toMatchObject({
      reference: "nope:thing",
      svg: null,
      missing: true,
    });
    // A pack on its way: no picture yet, and not missing.
    expect(thumbnail("coming")).toEqual({
      reference: "kubernetes:pod",
      label: "pod",
      svg: null,
    });
    expect(thumbnail("fine")).toEqual({
      reference: "tabler:server",
      label: "server",
      svg: expect.stringMatching(/^<svg/),
    });
  });

  it("leaves the icon out of sequence diagrams, whose participants and messages draw none", () => {
    const canvas = open(SEQUENCE);
    const message = canvas.render().relations[0]!.key;
    for (const ids of [["a"], [message]]) {
      const model = canvas.inspector(ids);
      expect(field(model, "style.fill"), ids[0]).toBeDefined();
      expect(field(model, "style.icon"), ids[0]).toBeUndefined();
      expect(field(model, "style.iconColor"), ids[0]).toBeUndefined();
    }
  });

  it("offers C4 entities their icon, and its positions beside the text, not centred", () => {
    const canvas = open(C4);
    const web = canvas.inspector(["shop.web"]);
    expect(field(web, "style.icon")).toMatchObject({
      value: "tabler:world",
      thumbnail: { reference: "tabler:world", svg: expect.stringMatching(/^<svg/) },
    });
    expect(field(web, "style.iconPosition")!.options).toEqual(["left", "right", "top", "bottom"]);
    expect(field(canvas.inspector(["customer"]), "style.iconPosition")!.options).not.toContain(
      "center",
    );
    // Flow and free diagrams keep the five.
    expect(field(open(FREE).inspector(["a"]), "style.iconPosition")!.options).toContain("center");
  });

  it("speaks Spanish", () => {
    setLocale("es");
    const canvas = open(ICONS);
    expect(field(canvas.inspector(["db"]), "style.labelPosition")!.label).toBe(
      "Posición de la etiqueta",
    );
    const size = field(canvas.inspector(["db"]), "style.iconSize")!;
    expect(size.label).toBe("Tamaño del icono");
    expect(size.quick).toEqual([{ label: "Automático", value: "auto" }]);
    const refused = canvas.act({
      kind: "setField",
      ids: ["db"],
      field: "style.iconSize",
      value: 1,
    });
    expect(refused.messages[0]).toMatchObject({
      reason: "Escribe `auto` o un número de 8 a 128.",
    });
  });
});

describe("the canvas's mirrors of the language", () => {
  it("has the twenty-four shapes, the icon positions, the label positions and the icon sizes", () => {
    expect(SHAPES).toEqual(BOX_SHAPES);
    expect(SHAPES).toContain("icon");
    expect(ICON_POSITIONS).toEqual(MODEL_ICON_POSITIONS);
    expect(LABEL_POSITIONS).toEqual(MODEL_LABEL_POSITIONS);
    expect(ICON_SIZES).toEqual(ICON_SIZE_RANGE);
  });

  it("opens the icon picker with I on flow and free diagrams", () => {
    const key = {
      key: "i",
      code: "KeyI",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    };
    expect(commandFor(key, false, "flow")).toBe("createIcon");
    expect(commandFor(key, false, "free")).toBe("createIcon");
    expect(commandFor(key, false, "sequence")).toBeUndefined();
  });
});
