import {
  geometrySvg,
  searchLibraries,
  type Library,
  type LibraryItem,
} from "@meltemi/diagrams-assets";
import {
  CREATABLE_DIAGRAMS,
  defaultLabel,
  newDiagramId,
  planEdit,
  type EditOperation,
  type EditPlan,
  type PlanResult,
} from "@meltemi/diagrams-edit";
import { applyTextEdits, isIdentifierText } from "@meltemi/diagrams-language";
import { layoutDiagram, type Box } from "@meltemi/diagrams-layout";
import {
  MAIN_LAYER,
  compile,
  type Compilation,
  type ElementKind,
  type FlowDiagram,
  type LabelEntry,
  type PlaceEntry,
  type Point,
} from "@meltemi/diagrams-model";
import { diagramView, type DiagramView, type DocumentAnalysis } from "./analysis.js";
import {
  arrangeAttempt,
  containerOperation,
  convertOperation,
  stackedAfterMove,
  interiorOf,
  materializeOperation,
  steadyGroups,
} from "./arrange.js";
import { alignBoxes, distributeBoxes } from "./canvas/arrange.js";
import { center } from "./canvas/geometry.js";
import { carriedChildren } from "./canvas/selection.js";
import {
  isCanvasMessage,
  type CanvasAction,
  type CanvasRender,
  type DependentInfo,
  type ElementInfo,
  type HostMessage,
  type IconGroupInfo,
  type InspectorModel,
  type RelationInfo,
  type LibraryInfo,
  type LibraryItemInfo,
  type CreatableDiagram,
  type MoveAction,
  type PreviewedAction,
  type ResizeAction,
} from "./canvas/protocol.js";
import { DEFAULT_GRID, snapValue, writtenCenter } from "./canvas/snapping.js";
import { copyFragment, pasteOperations } from "./clipboard.js";
import { iconGroups, takesIcon, writtenIcon } from "./icons.js";
import { fieldOperations, inspect, namedRelation } from "./inspector.js";
import { freshRelationId } from "./targets.js";
// The editor's catalog; `messages` names the host messages in this file.
import { messages as wording } from "./messages/index.js";
import { baseName, themeLocation, themePanel, themeTokenOperation } from "./themes.js";
import { renderDiagram, renderLayout } from "./render.js";
import { selectionAt } from "./services/navigation.js";
import { eventInfos, sequenceAction, sequenceMove } from "./sequence.js";
import { entityChoices, modelIsLocal } from "./c4.js";
import { storyChoices, storyPlayback } from "./story.js";

/** What the host does after the session handled a message. */
export interface SessionResult {
  readonly messages: readonly HostMessage[];
  /** One plan to apply to the document as one undo step. */
  readonly plan?: EditPlan;
  /** Text to put on the system clipboard. */
  readonly clipboard?: string;
  /** Read the system clipboard and call `paste` with its text. */
  readonly readClipboard?: { readonly at?: Point };
  /** A range of the text to show, and whether to focus the text editor. */
  readonly reveal?: { readonly start: number; readonly end: number; readonly focus: boolean };
  /** A command of the document. */
  readonly command?: "export" | "openModel" | "exportPlayer";
  /** The story of `exportPlayer`; the host asks when it is absent. */
  readonly story?: string;
  /**
   * Edits of other files of the project, which the host makes with `ProjectSessions`: a theme
   * created for the project, or an operation on the file that holds the theme being edited.
   */
  readonly project?:
    | { readonly kind: "createTheme"; readonly theme: string; readonly extends: string }
    | { readonly kind: "themeFile"; readonly file: string; readonly operation: EditOperation };
  /**
   * Ask the user for the image file of a new image, then call `createObject` with it (`at` is in
   * diagram coordinates). Icons are chosen in the canvas's own icon picker.
   */
  readonly pick?: { readonly kind: "image"; readonly at: Point; readonly parent?: string };
}

const NONE: SessionResult = { messages: [] };

/** Default sizes of groups created from the palette, on the 14 px grid. */
const NEW_GROUP_SIZE = { width: 280, height: 168 };

/**
 * Kinds created as empty shapes, `box box1 ""` or `node1[""]`, the text added later in place;
 * texts, notes and tags show nothing without their text and keep their default one.
 */
const EMPTY_KINDS: ReadonlySet<string> = new Set(["node", "decision", "data", "box"]);

/** Actions that change positions, which first write the arrangement of an `auto` diagram. */
const GEOMETRY: ReadonlySet<CanvasAction["kind"]> = new Set([
  "move",
  "resize",
  "setVia",
  "create",
  "align",
  "distribute",
  "paste",
  "duplicate",
]);

/**
 * The state of one canvas on one document: the analysed text, the diagram shown and the
 * selection. It turns canvas messages into edit plans and host messages, and never touches the
 * document itself.
 */
export class CanvasSession {
  private analysis: DocumentAnalysis | undefined;
  private diagram: string | undefined;
  private selection: string[] = [];
  private readonly rendered = new Map<string, HostMessage>();
  private pendingSelection: string[] | undefined;
  private pendingEdit: string | undefined;
  /** The diagram to show once it exists, after a conversion. */
  private pendingDiagram: string | undefined;
  /** True while the canvas shows the diagram's effects running. */
  private playing = false;
  /** The scenario of a sequence diagram previewed read-only, with its diagram. */
  private scenario: { readonly diagram: string; readonly id: string } | undefined;
  /** The story the canvas plays, read-only, in story mode. */
  private story: string | undefined;
  grid: number;
  /** True while the theme panel is open; it follows every new analysis. */
  private themeEditing = false;
  /**
   * A theme created for the project, whose panel opens once the host has written its file and
   * `project.json` and the diagram draws with it.
   */
  private awaitedTheme: string | undefined;
  private readonly pathOf: () => string | undefined;
  private readonly inProject: () => boolean;

  constructor(
    options: {
      readonly grid?: number;
      /**
       * The document's path in the project's form, to tell its own themes from other files'; a
       * function when the host can rename the file under the session.
       */
      readonly path?: string | (() => string | undefined);
      /** Whether the document is in a project, where themes can be created for every diagram. */
      readonly project?: () => boolean;
    } = {},
  ) {
    this.grid = options.grid ?? DEFAULT_GRID;
    const path = options.path;
    this.pathOf = typeof path === "function" ? path : () => path;
    this.inProject = options.project ?? (() => false);
  }

  /** The document's path in the project's form, when the host gave one. */
  private get path(): string | undefined {
    return this.pathOf();
  }

  /** The inspector of a diagram with what the session knows of the document's place. */
  private inspect(diagram: string): InspectorModel | undefined {
    const path = this.path;
    return inspect(this.analysis!, diagram, this.selection, {
      ...(path ? { path } : {}),
      project: this.inProject(),
    });
  }

  /** The theme panel message: the diagram's editable theme, or null when there is none. */
  private themePanelMessage(): HostMessage {
    const view = this.view();
    const location = view && themeLocation(this.analysis!, view, this.path);
    const panel = location ? themePanel(this.analysis!, location) : undefined;
    if (!panel) this.themeEditing = false;
    return { type: "themePanel", panel: panel ?? null };
  }

  /** The diagram the canvas shows. */
  get current(): string | undefined {
    return this.diagram;
  }

  get selected(): readonly string[] {
    return this.selection;
  }

  /** Takes a new analysis of the document and returns what the canvas must show. */
  update(analysis: DocumentAnalysis): HostMessage[] {
    this.analysis = analysis;
    const ids = analysis.diagrams.map((d) => d.id);
    if (this.pendingDiagram && ids.includes(this.pendingDiagram)) {
      this.diagram = this.pendingDiagram;
      this.pendingDiagram = undefined;
      this.selection = [];
    }
    if (!this.diagram || !ids.includes(this.diagram)) {
      this.diagram = analysis.diagrams.find((d) => d.layout?.scene)?.id ?? ids[0];
    }
    return this.state();
  }

  /**
   * The stories of the file and, in story mode, the playback of the story. A story that is gone
   * ends story mode; one whose views cannot be drawn keeps the last playback the canvas has.
   */
  private storyMessages(): HostMessage[] {
    const analysis = this.analysis!;
    const stories = storyChoices(analysis);
    if (this.story && !stories.some((s) => s.id === this.story)) this.story = undefined;
    if (stories.length === 0 && !this.story) return [];
    const playback = this.story ? storyPlayback(analysis, this.story) : undefined;
    if (this.story && !playback) return [];
    return [{ type: "story", revision: analysis.revision, stories, playback: playback ?? null }];
  }

  /**
   * The messages that show the current state: a render, a stale notice or an empty notice. Their
   * words are in the interface language; a host that changes it sends these again.
   */
  state(): HostMessage[] {
    const analysis = this.analysis;
    if (!analysis) return [];
    const words = wording().session;
    if (!this.diagram) {
      // The story messages first: a story that is gone ends story mode.
      const stories = this.storyMessages();
      return [
        {
          type: "empty",
          revision: analysis.revision,
          message:
            analysis.compilation.document.stories.length > 0
              ? words.noDiagramStories
              : words.noDiagram,
          // Nothing to create while a story plays.
          creatable: this.story === undefined ? [...CREATABLE_DIAGRAMS] : [],
        },
        ...stories,
      ];
    }
    const view = diagramView(analysis, this.diagram)!;
    const render = this.render(view);
    const messages: HostMessage[] = [];
    if (render) {
      this.rendered.set(view.id, render);
      messages.push(render);
    } else {
      const errors = analysis.diagnostics.filter(
        (d) =>
          d.severity === "error" &&
          d.range.start.offset >= view.diagram.node.fullStart &&
          d.range.start.offset <= view.diagram.node.end,
      );
      const first = errors[0] ?? analysis.diagnostics.find((d) => d.severity === "error");
      const last = this.rendered.get(view.id);
      if (last) messages.push(last);
      messages.push({
        type: "stale",
        revision: analysis.revision,
        count: Math.max(1, errors.length),
        // A diagnostic's own message, or the session's when there is none.
        first: first
          ? { code: first.code, message: first.message, line: first.range.start.line }
          : { code: "", message: words.cannotDraw, line: view.diagram.range.start.line },
      });
    }
    if (render && this.pendingEdit) {
      messages.push({ type: "select", ids: [this.pendingEdit] });
      this.pendingEdit = undefined;
    }
    const model = this.inspect(view.id);
    if (model) messages.push({ type: "inspector", model });
    if (this.awaitedTheme !== undefined) {
      if (themeLocation(this.analysis!, view, this.path)?.id === this.awaitedTheme) {
        this.themeEditing = true;
        this.awaitedTheme = undefined;
      }
    }
    if (this.themeEditing) messages.push(this.themePanelMessage());
    messages.push(...this.storyMessages());
    return messages;
  }

  /**
   * Creates a theme that extends the diagram's. In the file, the diagram uses it at once; for the
   * project, the host writes `themes/<id>.meltemi` and the default of `project.json`, and the
   * diagram drops its own `theme` so that it follows the project's.
   */
  private newTheme(id: string, scope: "file" | "project"): SessionResult {
    const view = this.view();
    if (!view) return NONE;
    const words = wording().session;
    if (!isIdentifierText(id)) {
      return {
        messages: [{ type: "rejected", code: "edit.invalid-value", reason: words.invalidId(id) }],
      };
    }
    const base = baseName(this.analysis!, view);
    if (scope === "project") {
      if (!this.inProject()) {
        return {
          messages: [{ type: "rejected", code: "edit.invalid-value", reason: words.notInProject }],
        };
      }
      this.awaitedTheme = id;
      const own = view.diagram.properties.theme !== null;
      const plan = own
        ? this.planned(view, "setField", [
            { kind: "setDiagramProperty", diagram: view.id, property: "theme", value: null },
          ])
        : NONE;
      return { ...plan, project: { kind: "createTheme", theme: id, extends: base } };
    }
    const result = this.planned(view, "setField", [
      { kind: "createTheme", theme: id, extends: base },
      { kind: "setDiagramProperty", diagram: view.id, property: "theme", value: id },
    ]);
    if (result.plan) this.themeEditing = true;
    return result;
  }

  /** Writes a token of the theme in the panel, in the file that holds the theme's block. */
  private themeToken(token: string, value: string | number | null): SessionResult {
    const view = this.view();
    if (!view) return NONE;
    const location = themeLocation(this.analysis!, view, this.path);
    if (!location) {
      return {
        messages: [
          {
            type: "rejected",
            code: "edit.unsafe-target",
            reason: wording().session.builtInTheme,
          },
        ],
      };
    }
    // `custom` stands for a font stack written by hand; choosing it changes nothing.
    if (value === "custom") return NONE;
    const operation = themeTokenOperation(location, token, value);
    if (location.file !== null) {
      return { messages: [], project: { kind: "themeFile", file: location.file, operation } };
    }
    return this.planned(view, "setField", [operation]);
  }

  /** The previewed scenario of the diagram, when it still exists. */
  private scenarioOf(view: DiagramView): string | undefined {
    const scenario = this.scenario;
    if (!scenario || scenario.diagram !== view.id) return undefined;
    if (!view.diagram.scenarios.some((s) => s.id === scenario.id)) {
      this.scenario = undefined;
      return undefined;
    }
    return scenario.id;
  }

  private render(view: DiagramView): (HostMessage & { type: "render" }) | undefined {
    const analysis = this.analysis!;
    const scenario = this.scenarioOf(view);
    const effects = view.diagram.animations.filter((a) => a.effect !== null).length;
    const playing = this.playing && effects > 0;
    const rendered = renderDiagram(analysis, view.id, {
      ...(scenario ? { scenario } : {}),
      ...(playing ? { motion: "animated" as const } : {}),
    });
    if (!rendered) return undefined;
    const diagram = view.diagram;
    const geometry = rendered.geometry;
    const elements: ElementInfo[] = [];
    for (const element of diagram.elements) {
      const box = geometry.boxes.get(element.id);
      if (!box) continue;
      const placed = diagram.placement.some(
        (p) => p.statement === "place" && p.target === element.id,
      );
      const sized = diagram.placement.some(
        (p) => p.statement === "size" && p.target === element.id,
      );
      const text = geometry.texts.elements.get(element.id);
      const labelBox = geometry.elementLabels.get(element.id);
      const rotation = geometry.rotations.get(element.id);
      const radius = geometry.radii.get(element.id);
      elements.push({
        id: element.id,
        kind: element.kind,
        label: element.label,
        parent: element.groupPath[element.groupPath.length - 1] ?? null,
        box,
        placed,
        sized: element.kind === "group" ? placed && (sized || diagram.type === "free") : true,
        layer: element.layer,
        shape: geometry.shapes.get(element.id) ?? "rounded",
        ...(rotation !== undefined ? { rotation } : {}),
        ...(radius !== undefined ? { radius } : {}),
        ports: element.ports.map((p) => ({ name: p.name, side: p.side, position: p.position })),
        ...(text ? { text } : {}),
        takesIcon: takesIcon(diagram, element),
        icon: writtenIcon(diagram, element.id, "element"),
        ...(labelBox ? { labelBox } : {}),
      });
    }
    const relations: RelationInfo[] = [];
    for (const relation of diagram.relations) {
      const connector = geometry.connectors.get(relation.key);
      if (!connector) continue;
      const text = geometry.texts.relations.get(relation.key);
      relations.push({
        key: relation.key,
        named: relation.id !== null,
        from: relation.from,
        to: relation.to,
        label: relation.label,
        line: relation.line,
        points: connector.points,
        drawn: connector.line,
        via: connector.via,
        fromSide: connector.fromSide,
        toSide: connector.toSide,
        labelBox: geometry.labels.get(relation.key) ?? null,
        layer: relation.layer,
        ...(text ? { text } : {}),
      });
    }
    const events = (
      diagram.type === "sequence" && !scenario ? eventInfos(diagram, view.layout) : []
    ).map((event) => {
      const text = geometry.texts.events.get(event.key);
      return text ? { ...event, text } : event;
    });
    const valid = new Set([
      ...elements.map((e) => e.id),
      ...relations.map((r) => r.key),
      ...events.map((e) => e.key),
    ]);
    if (this.pendingSelection) {
      this.selection = this.pendingSelection.filter((id) => valid.has(id));
      this.pendingSelection = undefined;
    } else {
      this.selection = this.selection.filter((id) => valid.has(id));
    }
    const body: CanvasRender = {
      revision: analysis.revision,
      diagrams: analysis.diagrams.map((d) => ({ id: d.id, title: d.title })),
      diagram: view.id,
      profile: diagram.type,
      ...(diagram.definition ? { tools: diagram.definition.tools } : {}),
      layers: diagram.properties.layers,
      mode: view.mode,
      svg: rendered.svg,
      width: geometry.width,
      height: geometry.height,
      offset: geometry.offset,
      elements,
      relations,
      events,
      scenarios: diagram.scenarios.map((s) => ({ id: s.id, label: s.label })),
      scenario: scenario ?? null,
      effects,
      playing,
      entities: diagram.type === "c4" ? entityChoices(diagram) : [],
      selection: this.selection,
      ...(view.layout?.theme
        ? {
            colors: {
              selection: view.layout.theme.selection ?? view.layout.theme.accent,
              guide: view.layout.theme.guide ?? view.layout.theme.accent,
            },
          }
        : {}),
    };
    return { type: "render", ...body };
  }

  // ---------------------------------------------------------------- libraries

  /** The libraries of the current diagram: none for sequence diagrams and C4 views. */
  private libraries(): readonly Library[] {
    const analysis = this.analysis;
    if (!analysis) return [];
    const type = analysis.diagrams.find((d) => d.id === this.diagram)?.diagram.type;
    return type === "flow" || type === "free" ? analysis.libraries : [];
  }

  private libraryList(): LibraryInfo[] {
    return this.libraries().map((library) => ({
      id: library.id,
      title: library.title,
      categories: library.categories.map((c) => ({ id: c.id, title: c.title, count: c.count })),
    }));
  }

  /** A 24 px thumbnail of an icon, or null while its pack is not there yet. */
  private thumbnail(icon: string): string | null {
    const lookup = this.analysis?.icons?.lookup(icon);
    return lookup?.status === "found" ? geometrySvg(lookup.icon.geometry, 24, 24) : null;
  }

  private itemInfo(library: string, category: string, item: LibraryItem): LibraryItemInfo {
    return {
      library,
      category,
      label: item.label,
      icon: item.icon,
      ...(item.kind !== undefined ? { kind: item.kind } : {}),
      svg: this.thumbnail(item.icon),
    };
  }

  private libraryItems(library: string, category: string): LibraryItemInfo[] {
    const found = this.libraries()
      .find((l) => l.id === library)
      ?.categories.find((c) => c.id === category);
    return (found?.items ?? []).map((item) => this.itemInfo(library, category, item));
  }

  private librarySearch(query: string): LibraryItemInfo[] {
    const icons = this.analysis?.icons;
    if (!icons) return [];
    return searchLibraries(this.libraries(), icons, query, 60).map((m) =>
      this.itemInfo(m.library.id, m.category.id, m.item),
    );
  }

  /**
   * The icon picker's groups for a query. C4 views, whose entities draw icons, get the packs'
   * icons without the libraries (`libraries` has none for them); sequence diagrams, whose
   * participants draw none, get nothing.
   */
  private searchIcons(query: string): IconGroupInfo[] {
    const analysis = this.analysis;
    const type = analysis?.diagrams.find((d) => d.id === this.diagram)?.diagram.type;
    if (!analysis || type === undefined || type === "sequence") return [];
    return iconGroups(analysis, this.libraries(), query);
  }

  /** Highlights the element or relation of the statement at a text offset. */
  selectAt(offset: number): HostMessage[] {
    if (!this.analysis) return [];
    const found = selectionAt(this.analysis, offset);
    if (!found || found.diagram !== this.diagram) return [{ type: "highlight", ids: [] }];
    return [{ type: "highlight", ids: [found.id] }];
  }

  /** Handles a message from the canvas. */
  receive(message: unknown): SessionResult {
    if (!isCanvasMessage(message) || !this.analysis) return NONE;
    const analysis = this.analysis;
    switch (message.type) {
      case "ready":
        return { messages: this.state() };
      case "pickDiagram":
        if (!analysis.diagrams.some((d) => d.id === message.diagram)) return NONE;
        this.diagram = message.diagram;
        this.selection = [];
        return { messages: this.state() };
      case "playEffects":
        this.playing = message.on;
        return { messages: this.state() };
      case "libraries":
        return { messages: [{ type: "libraries", libraries: this.libraryList() }] };
      case "libraryItems":
        return {
          messages: [
            {
              type: "libraryItems",
              library: message.library,
              category: message.category,
              items: this.libraryItems(message.library, message.category),
            },
          ],
        };
      case "librarySearch":
        return {
          messages: [
            {
              type: "librarySearch",
              query: message.query,
              items: this.librarySearch(message.query),
            },
          ],
        };
      case "searchIcons":
        return {
          messages: [
            { type: "icons", token: message.token, groups: this.searchIcons(message.query) },
          ],
        };
      case "editTheme":
        this.themeEditing = message.open;
        this.awaitedTheme = undefined;
        return {
          messages: [message.open ? this.themePanelMessage() : { type: "themePanel", panel: null }],
        };
      case "newTheme":
        return this.newTheme(message.id, message.scope);
      case "themeToken":
        return this.themeToken(message.token, message.value);
      case "exportPlayer":
        return {
          messages: [],
          command: "exportPlayer",
          ...(message.story !== null ? { story: message.story } : {}),
        };
      case "pickStory":
        if (
          message.story !== null &&
          !analysis.compilation.document.stories.some((s) => s.id === message.story)
        ) {
          return NONE;
        }
        this.story = message.story ?? undefined;
        if (this.story && !storyPlayback(analysis, this.story)) {
          this.story = undefined;
          return {
            messages: [
              {
                type: "rejected",
                code: "edit.unsafe-target",
                reason: wording().session.storyNotDrawn(String(message.story)),
              },
            ],
          };
        }
        this.selection = [];
        return { messages: this.state() };
      case "pickScenario": {
        const view = this.view();
        if (!view) return NONE;
        if (message.scenario === null) this.scenario = undefined;
        else if (view.diagram.scenarios.some((s) => s.id === message.scenario)) {
          this.scenario = { diagram: view.id, id: message.scenario };
          this.selection = [];
        } else return NONE;
        return { messages: this.state() };
      }
      case "select": {
        this.selection = [...message.ids];
        const model = this.diagram ? this.inspect(this.diagram) : undefined;
        const reveal = this.rangeOf(this.selection[0]);
        return {
          messages: model ? [{ type: "inspector", model }] : [],
          ...(reveal ? { reveal: { ...reveal, focus: false } } : {}),
        };
      }
      case "focusText": {
        const reveal = this.rangeOf(message.id);
        return reveal ? { messages: [], reveal: { ...reveal, focus: true } } : NONE;
      }
      case "copy": {
        const text = this.diagram ? copyFragment(analysis, this.diagram, message.ids) : undefined;
        return text
          ? { messages: [{ type: "status", message: wording().session.copied }], clipboard: text }
          : NONE;
      }
      case "export":
        return { messages: [], command: "export" };
      case "openModel":
        return { messages: [], command: "openModel" };
      case "action":
        if (message.revision !== analysis.revision) {
          // A preview of an older text has no drawing; the render of the new text is on its way.
          if (message.action.kind === "preview") {
            return { messages: [{ type: "preview", token: message.action.token, svg: null }] };
          }
          return {
            messages: [
              {
                type: "rejected",
                code: "edit.stale-revision",
                reason: wording().session.textChanged,
              },
              ...this.state(),
            ],
          };
        }
        return this.act(message.action);
      case "presencePointer":
        // The host's to share; the document has nothing to do with it.
        return NONE;
    }
  }

  /** Pastes clipboard text at a point, or two grid steps off when no point is given. */
  paste(text: string, at?: Point): SessionResult {
    const view = this.view();
    if (!view) return NONE;
    const where = at ? { at: this.snap(at) } : { shift: { x: 2 * this.grid, y: 2 * this.grid } };
    const pasted = pasteOperations(this.analysis!, view.id, text, where);
    if (!pasted.ok) return { messages: [{ type: "status", message: pasted.reason }] };
    this.pendingSelection = [...pasted.ids];
    return this.planned(view, "paste", pasted.operations);
  }

  /** The scenario the canvas previews, if any. */
  get previewed(): string | undefined {
    const view = this.view();
    return view ? this.scenarioOf(view) : undefined;
  }

  /** Creates an `image` once the host has its file, or an `icon` with its reference. */
  createObject(kind: "icon" | "image", source: string, at: Point, parent?: string): SessionResult {
    return this.act({
      kind: "create",
      elementKind: kind,
      at,
      source,
      ...(parent ? { parent } : {}),
    });
  }

  private view(): DiagramView | undefined {
    return this.analysis && this.diagram ? diagramView(this.analysis, this.diagram) : undefined;
  }

  /**
   * The position to write for an element drawn centred at `point`: the point itself, or in free
   * diagrams, relative to the interior of the element's group.
   */
  private written(view: DiagramView, id: string, point: Point): Point {
    const origin = view.diagram.type === "free" ? view.layout?.origins?.get(id) : undefined;
    return {
      x: Math.round(point.x - (origin?.x ?? 0)),
      y: Math.round(point.y - (origin?.y ?? 0)),
    };
  }

  private rangeOf(id: string | undefined): { start: number; end: number } | undefined {
    const view = this.view();
    if (!view || id === undefined) return undefined;
    const element = view.diagram.elementsById.get(id);
    if (element) return { start: element.idRange.start.offset, end: element.idRange.end.offset };
    const relation = view.diagram.relationsByKey.get(id);
    const event = view.diagram.eventsByKey.get(id);
    if (!relation && event) {
      const range = event.idRange ?? event.range;
      return { start: range.start.offset, end: range.end.offset };
    }
    if (!relation) return undefined;
    const range = relation.idRange ?? relation.range;
    return { start: range.start.offset, end: range.end.offset };
  }

  private snap(point: Point): Point {
    return {
      x: snapValue(Math.round(point.x), this.grid),
      y: snapValue(Math.round(point.y), this.grid),
    };
  }

  /** The story actions of the timeline: each is one edit of the story's text. */
  private storyAction(action: CanvasAction): SessionResult | undefined {
    let operation: EditOperation;
    switch (action.kind) {
      case "setStoryTiming":
        operation = {
          kind: "setStoryTiming",
          story: action.story,
          path: action.path,
          durationMs: Math.round(action.durationMs),
        };
        break;
      case "removeStoryAction":
        operation = { kind: "removeStoryAction", story: action.story, path: action.path };
        break;
      case "addToScene": {
        const all =
          action.ids.length === 0 && (action.action === "focus" || action.action === "camera");
        operation = {
          kind: "insertStoryAction",
          story: action.story,
          scene: action.scene,
          action: action.action,
          targets: action.action === "hold" ? [] : [...action.ids],
          ...(all ? { all: true } : {}),
          ...(action.durationMs !== undefined
            ? { durationMs: Math.round(action.durationMs) }
            : action.action === "hold"
              ? { durationMs: 1000 }
              : {}),
        };
        break;
      }
      case "insertScene": {
        const story = this.analysis!.compilation.document.stories.find(
          (s) => s.id === action.story,
        );
        const ids = new Set(story?.scenes.map((s) => s.id) ?? []);
        let n = (story?.scenes.length ?? 0) + 1;
        while (ids.has(`scene${n}`)) n++;
        operation = {
          kind: "insertScene",
          story: action.story,
          id: `scene${n}`,
          ...(action.after !== undefined ? { after: action.after } : {}),
        };
        break;
      }
      default:
        return undefined;
    }
    const result = planEdit(this.analysis!.compilation, operation, {
      revision: this.analysis!.revision,
    });
    if (!result.ok) {
      return {
        messages: [
          { type: "rejected", code: result.rejection.code, reason: result.rejection.reason },
        ],
      };
    }
    return { messages: [], plan: result.plan };
  }

  /**
   * One plan for the operations, after the arrangement of an `auto` diagram when needed; undefined
   * without operations. It changes nothing in the session: previews plan with it too.
   */
  private plan(
    view: DiagramView,
    kind: CanvasAction["kind"],
    operations: readonly EditOperation[],
  ): PlanResult | undefined {
    if (operations.length === 0) return undefined;
    const all: EditOperation[] = [];
    if (GEOMETRY.has(kind)) {
      const materialize = materializeOperation(view);
      if (materialize) all.push(materialize);
    }
    all.push(...operations);
    return planEdit(
      this.analysis!.compilation,
      all.length === 1 ? all[0]! : { kind: "batch", operations: all },
      { revision: this.analysis!.revision },
    );
  }

  /** The plan of `plan` for the host to apply; a refusal drops what waited for the edit. */
  private planned(
    view: DiagramView,
    kind: CanvasAction["kind"],
    operations: readonly EditOperation[],
  ): SessionResult {
    const result = this.plan(view, kind, operations);
    if (!result) return NONE;
    if (!result.ok) {
      this.pendingSelection = undefined;
      this.pendingEdit = undefined;
      this.pendingDiagram = undefined;
      return {
        messages: [
          { type: "rejected", code: result.rejection.code, reason: result.rejection.reason },
        ],
      };
    }
    return { messages: [], plan: result.plan };
  }

  /**
   * The actions of a C4 view that differ from flow diagrams: entities are added from the model
   * and removed by excluding them; labels are local; ids rename the model's entities. Returns
   * undefined for the actions the flow code handles.
   */
  private c4Action(view: DiagramView, action: CanvasAction): SessionResult | undefined {
    const diagram = view.diagram;
    const d = view.id;
    const refused = refusal(wording().c4Refused, action, diagram);
    if (refused) {
      return { messages: [{ type: "rejected", code: "edit.invalid-value", reason: refused }] };
    }
    const model = diagram.c4?.resolved?.definition;
    switch (action.kind) {
      case "includeEntity": {
        const ops: EditOperation[] = [{ kind: "includeEntity", diagram: d, entity: action.entity }];
        if (action.at && view.mode !== "auto") {
          const at = this.snap(action.at);
          ops.push({ kind: "setPosition", diagram: d, element: action.entity, x: at.x, y: at.y });
        }
        this.pendingSelection = [action.entity];
        return this.planned(view, "includeEntity", ops);
      }
      case "remove": {
        const ops: EditOperation[] = [];
        const elements = action.ids.filter(
          (id) => diagram.elementsById.get(id)?.kind !== undefined,
        );
        for (const id of elements) {
          if (diagram.elementsById.get(id)!.kind === "group") continue;
          ops.push({ kind: "excludeEntity", diagram: d, entity: id, cascade: action.cascade });
        }
        for (const key of action.ids) {
          if (diagram.c4?.combined.includes(key))
            ops.push({ kind: "removeRelation", diagram: d, relation: key });
          else if (diagram.relationsByKey.has(key)) {
            return {
              messages: [
                {
                  type: "rejected",
                  code: "edit.invalid-value",
                  reason: wording().session.modelRelation(key),
                },
              ],
            };
          }
        }
        if (!action.cascade) {
          const dependents: DependentInfo[] = [];
          for (const operation of ops) {
            if (operation.kind !== "excludeEntity") continue;
            const probe = planEdit(this.analysis!.compilation, operation);
            if (!probe.ok && probe.rejection.code === "edit.has-dependents") {
              for (const dep of probe.rejection.dependents ?? [])
                dependents.push({ kind: dep.kind, description: dep.description });
            }
          }
          if (dependents.length > 0) {
            return {
              messages: [
                {
                  type: "rejected",
                  code: "edit.has-dependents",
                  reason: wording().session.removingFromView(dependents.length),
                  dependents,
                  retry: { ...action, cascade: true },
                },
              ],
            };
          }
        }
        this.pendingSelection = [];
        return this.planned(view, "remove", ops);
      }
      case "setLabel": {
        const label = action.label === "" ? null : action.label;
        const ops: EditOperation[] = diagram.c4?.combined.includes(action.id)
          ? [{ kind: "setRelationLabel", diagram: d, relation: action.id, label }]
          : [{ kind: "setLocalLabel", diagram: d, target: action.id, label }];
        return this.planned(view, "setLabel", ops);
      }
      case "renameId": {
        if (!model || !modelIsLocal(diagram)) {
          return {
            messages: [
              {
                type: "rejected",
                code: "edit.unsafe-target",
                reason: wording().session.modelElsewhere,
              },
            ],
          };
        }
        const entity = model.entitiesByPath.get(action.id);
        const relation = model.relationsByKey.get(action.id);
        const ops: EditOperation[] = entity
          ? [{ kind: "renameEntity", model: model.id, entity: action.id, newId: action.newId }]
          : relation
            ? [
                {
                  kind: "setModelRelationProperty",
                  model: model.id,
                  relation: action.id,
                  property: "id",
                  value: action.newId,
                },
              ]
            : [];
        if (entity) {
          const renamed = entity.parent ? `${entity.parent}.${action.newId}` : action.newId;
          this.pendingSelection = this.selection.map((s) =>
            s === action.id
              ? renamed
              : s.startsWith(`${action.id}.`)
                ? renamed + s.slice(action.id.length)
                : s,
          );
        }
        return this.planned(view, "renameId", ops);
      }
      default:
        return undefined;
    }
  }

  private act(action: CanvasAction): SessionResult {
    const story = this.storyAction(action);
    if (story) return story;
    // A file without diagrams can have one created.
    if (action.kind === "createDiagram") return this.createDiagram(action.type);
    if (action.kind === "preview") return this.preview(action.token, action.action);
    const view = this.view();
    if (!view) return NONE;
    const words = wording();
    if (!view.layout?.scene) {
      return {
        messages: [
          { type: "rejected", code: "edit.unsafe-target", reason: words.session.fixFirst },
        ],
      };
    }
    const diagram = view.diagram;
    const d = view.id;
    if (this.scenarioOf(view)) {
      return {
        messages: [
          { type: "rejected", code: "edit.unsafe-target", reason: words.session.scenario },
        ],
      };
    }
    if (diagram.type === "sequence") {
      const refused = refusal(words.sequenceRefused, action, diagram);
      if (refused) {
        return { messages: [{ type: "rejected", code: "edit.invalid-value", reason: refused }] };
      }
    }
    const boxes = view.layout.boxes ?? new Map<string, Box>();
    const centreOf = (id: string) => {
      const box = boxes.get(id);
      return box ? center(box) : undefined;
    };
    const ops: EditOperation[] = [];
    if (diagram.type === "c4") {
      const result = this.c4Action(view, action);
      if (result) return result;
    }
    switch (action.kind) {
      case "includeEntity":
        break;
      case "moveEvent":
      case "toggleActivation":
      case "insertEvent":
      case "wrap": {
        if (diagram.type !== "sequence") break;
        const result = sequenceAction(view, action);
        if (!result.ok) {
          return {
            messages: [{ type: "rejected", code: "edit.invalid-value", reason: result.reason }],
          };
        }
        if (result.select) this.pendingSelection = result.select;
        ops.push(...result.operations);
        break;
      }
      case "move": {
        if (diagram.type === "sequence") {
          ops.push(...sequenceMove(view, action.ids, action.delta));
          this.pendingSelection = [...this.selection];
          break;
        }
        ops.push(...this.moveOperations(view, action));
        // A box dropped on a box stays a drawing on top of it: say how to make it a container.
        const stack = stackedAfterMove(view, action.ids, action.delta);
        if (stack) {
          const planned = this.planned(view, action.kind, ops);
          return planned.plan
            ? {
                ...planned,
                messages: [
                  ...planned.messages,
                  { type: "status", message: words.session.stackedOn(stack.inner, stack.outer) },
                ],
              }
            : planned;
        }
        break;
      }
      case "resize":
        ops.push(...this.resizeOperations(view, action));
        break;
      case "moveLabel": {
        const relation = diagram.relationsByKey.get(action.relation);
        if (!relation) break;
        const { id, operations } = namedRelation(diagram, relation);
        const entry = relation.id
          ? diagram.placement.find(
              (p): p is LabelEntry => p.statement === "label" && p.target === relation.id,
            )
          : undefined;
        const offset = entry?.offset ?? { x: 0, y: 0 };
        ops.push(...operations, {
          kind: "setLabelAnchor",
          diagram: d,
          relation: id,
          at: entry?.at ?? 50,
          offset: {
            x: Math.round(offset.x + action.delta.x),
            y: Math.round(offset.y + action.delta.y),
          },
        });
        break;
      }
      case "setVia": {
        const relation = diagram.relationsByKey.get(action.relation);
        if (!relation) break;
        const { id, operations } = namedRelation(diagram, relation);
        ops.push(...operations, {
          kind: "setRoute",
          diagram: d,
          relation: id,
          via: action.via.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        });
        break;
      }
      case "setEnd": {
        const relation = diagram.relationsByKey.get(action.relation);
        if (!relation) break;
        const current = action.end === "from" ? relation.from : relation.to;
        if (current === action.element) {
          // An end handed back to the layout of a relation without a route changes nothing.
          if (action.port === null && relation.id === null) break;
          const { id, operations } = namedRelation(diagram, relation);
          ops.push(...operations, {
            kind: "setRoute",
            diagram: d,
            relation: id,
            via: currentVia(diagram, id),
            ...(action.end === "from"
              ? {
                  from: action.port,
                  ...(action.position !== undefined ? { fromPosition: action.position } : {}),
                }
              : {
                  to: action.port,
                  ...(action.position !== undefined ? { toPosition: action.position } : {}),
                }),
          });
        } else {
          ops.push({
            kind: "reconnectRelation",
            diagram: d,
            relation: relation.key,
            end: action.end,
            element: action.element,
            ...(action.port !== null ? { port: action.port } : {}),
            ...(action.position !== undefined ? { position: action.position } : {}),
          });
        }
        break;
      }
      case "create": {
        const kind = action.elementKind;
        if (kind === "image" && action.source === undefined) {
          return {
            messages: [],
            pick: { kind, at: action.at, ...(action.parent ? { parent: action.parent } : {}) },
          };
        }
        // A library element is named after its icon; one from the palette or the icon picker
        // after its kind.
        const id =
          action.icon !== undefined && action.label !== undefined
            ? libraryElementId(diagram, action.icon)
            : freeElementId(this.analysis!, diagram, kind);
        if (diagram.type === "sequence") {
          // A participant goes where it is dropped among the others.
          ops.push({ kind: "createElement", diagram: d, elementKind: kind, id });
          if (kind !== "group") {
            const index = diagram.elements.filter((e) => {
              const box = boxes.get(e.id);
              return (
                e.node && e.groupPath.length === 0 && box && box.x + box.width / 2 < action.at.x
              );
            }).length;
            ops.push({ kind: "reorderParticipant", diagram: d, participant: id, index });
          }
          this.pendingSelection = [id];
          this.pendingEdit = id;
          break;
        }
        const snapped = this.snap(action.at);
        // Groups too go inside the group under the point, so groups nest.
        const origin = interiorOf(view, action.parent ?? null);
        // A library element keeps its label; a shape from the palette, the keys or the grid is empty.
        const label = action.label ?? (EMPTY_KINDS.has(kind) ? "" : undefined);
        ops.push({
          kind: "createElement",
          diagram: d,
          elementKind: kind,
          id,
          at: { x: snapped.x - origin.x, y: snapped.y - origin.y },
          ...(kind === "group" ? { size: NEW_GROUP_SIZE } : {}),
          ...(action.parent ? { parent: action.parent } : {}),
          ...(action.source !== undefined ? { source: action.source } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(action.icon !== undefined ? { icon: action.icon } : {}),
          ...(action.shape !== undefined ? { shape: action.shape } : {}),
        });
        this.pendingSelection = [id];
        this.pendingEdit = id;
        break;
      }
      case "connect": {
        const pinned = action.pinned;
        // A relation pinned to points needs a route, and a route needs a named relation.
        const id = pinned ? freshRelationId(diagram, action) : undefined;
        ops.push({
          kind: "createRelation",
          diagram: d,
          from: action.from,
          to: action.to,
          line: action.line,
          ...(action.twoWay ? { twoWay: true } : {}),
          ...(pinned
            ? {
                id,
                ...(pinned.fromPort !== undefined ? { fromPort: pinned.fromPort } : {}),
                ...(pinned.fromPosition !== undefined ? { fromPosition: pinned.fromPosition } : {}),
                ...(pinned.toPort !== undefined ? { toPort: pinned.toPort } : {}),
                ...(pinned.toPosition !== undefined ? { toPosition: pinned.toPosition } : {}),
              }
            : {}),
        });
        // The new relation comes after the others of its pair, so its key is the next one.
        const pair = diagram.relations.filter((r) => r.from === action.from && r.to === action.to);
        this.pendingSelection = [id ?? `${action.from}->${action.to}#${pair.length + 1}`];
        break;
      }
      case "remove": {
        const elements = action.ids.filter((id) => diagram.elementsById.has(id));
        const gone = new Set(elements);
        for (const id of elements)
          ops.push({ kind: "removeElement", diagram: d, element: id, cascade: action.cascade });
        for (const key of action.ids) {
          const relation = diagram.relationsByKey.get(key);
          if (!relation || gone.has(relation.from) || gone.has(relation.to)) continue;
          ops.push({ kind: "removeRelation", diagram: d, relation: key });
        }
        // Events other than messages, unless a selected fragment around them goes too; the last
        // first, so that a `deactivate` goes before its `activate`.
        const removed = new Set(action.ids);
        const events = action.ids
          .map((key) => diagram.eventsByKey.get(key))
          .filter((e) => e !== undefined && e.kind !== "message")
          .filter((e) => !e!.path.some((p) => removed.has(p.fragment)))
          .sort((a, b) => b!.node.start - a!.node.start);
        for (const event of events)
          ops.push({ kind: "removeEvent", diagram: d, event: event!.key });
        if (!action.cascade) {
          // Ask before removing what depends on the elements.
          const dependents: DependentInfo[] = [];
          for (const operation of ops) {
            if (operation.kind !== "removeElement") continue;
            const probe = planEdit(this.analysis!.compilation, operation);
            if (!probe.ok && probe.rejection.code === "edit.has-dependents") {
              for (const dep of probe.rejection.dependents ?? [])
                dependents.push({ kind: dep.kind, description: dep.description });
            }
          }
          if (dependents.length > 0) {
            return {
              messages: [
                {
                  type: "rejected",
                  code: "edit.has-dependents",
                  reason: words.session.deleting(dependents.length),
                  dependents,
                  retry: { ...action, cascade: true },
                },
              ],
            };
          }
        }
        this.pendingSelection = [];
        break;
      }
      case "setLabel": {
        const event = diagram.eventsByKey.get(action.id);
        if (event && event.kind !== "message") {
          if (event.kind === "fragment") {
            ops.push({
              kind: "setFragmentCondition",
              diagram: d,
              fragment: event.key,
              branch: 0,
              condition: action.label === "" ? null : action.label,
            });
          } else {
            ops.push({
              kind: "setEventText",
              diagram: d,
              event: event.key,
              text: action.label === "" ? null : action.label,
            });
          }
          break;
        }
        if (diagram.elementsById.has(action.id)) {
          ops.push({
            kind: "setElementLabel",
            diagram: d,
            element: action.id,
            label: action.label,
          });
          break;
        }
        const relation = diagram.relationsByKey.get(action.id);
        if (!relation) break;
        const { id, operations } = namedRelation(diagram, relation);
        ops.push(...operations, {
          kind: "setRelationLabel",
          diagram: d,
          relation: id,
          label: action.label === "" ? null : action.label,
        });
        break;
      }
      case "renameId": {
        const event = diagram.eventsByKey.get(action.id);
        if (event && event.kind !== "message") {
          ops.push({ kind: "renameEvent", diagram: d, event: event.key, newId: action.newId });
        } else if (diagram.elementsById.has(action.id)) {
          ops.push({ kind: "renameElement", diagram: d, element: action.id, newId: action.newId });
        } else {
          const relation = diagram.relationsByKey.get(action.id);
          if (!relation) break;
          ops.push(
            relation.id
              ? { kind: "renameRelation", diagram: d, relation: relation.id, newId: action.newId }
              : {
                  kind: "materializeRelationId",
                  diagram: d,
                  relationKey: relation.key,
                  id: action.newId,
                },
          );
        }
        this.pendingSelection = this.selection.map((s) => (s === action.id ? action.newId : s));
        break;
      }
      case "group": {
        const ids = action.ids.filter((id) => diagram.elementsById.has(id));
        if (ids.length === 0) break;
        const id = freeElementId(this.analysis!, diagram, "group");
        // The label is what the person would have typed: in the interface language.
        const label = defaultLabel("group")!;
        ops.push({ kind: "groupElements", diagram: d, elements: ids, id, label });
        this.pendingSelection = [id];
        break;
      }
      case "convertToContainer": {
        const conversion = containerOperation(view, action.id);
        if (!conversion) break;
        this.pendingSelection = [action.id];
        const planned = this.planned(view, action.kind, [conversion.operation]);
        return planned.plan
          ? {
              ...planned,
              messages: [
                ...planned.messages,
                {
                  type: "status",
                  message: words.session.container(action.id, conversion.children),
                },
              ],
            }
          : planned;
      }
      case "ungroup": {
        ops.push({ kind: "ungroup", diagram: d, group: action.id });
        this.pendingSelection = diagram.elements
          .filter((e) => e.groupPath[e.groupPath.length - 1] === action.id)
          .map((e) => e.id);
        break;
      }
      case "align":
      case "distribute": {
        const selected = new Map<string, Box>();
        for (const id of action.ids) {
          const element = diagram.elementsById.get(id);
          const box = boxes.get(id);
          if (element && element.kind !== "group" && box) selected.set(id, box);
        }
        const centres =
          action.kind === "align"
            ? alignBoxes(selected, action.edge)
            : distributeBoxes(selected, action.axis);
        for (const [id, c] of centres) {
          const old = centreOf(id)!;
          if (Math.abs(old.x - c.x) < 0.5 && Math.abs(old.y - c.y) < 0.5) continue;
          const at = this.written(view, id, c);
          ops.push({ kind: "setPosition", diagram: d, element: id, x: at.x, y: at.y });
        }
        break;
      }
      case "reorder": {
        // Front and forward keep the selection's order by moving the last one first.
        const ids = action.ids.filter((id) => diagram.elementsById.has(id));
        const order = diagram.elements.map((e) => e.id).filter((id) => ids.includes(id));
        const sequence = action.to === "front" || action.to === "forward" ? order : order.reverse();
        for (const id of sequence) {
          ops.push({ kind: "reorderElement", diagram: d, element: id, to: action.to });
        }
        this.pendingSelection = [...this.selection];
        break;
      }
      case "addLayer":
      case "renameLayer":
      case "removeLayer":
      case "moveLayer":
      case "setLayer": {
        const refused = layerOperations(diagram, d, action, ops);
        if (refused) {
          return { messages: [{ type: "rejected", code: "edit.invalid-value", reason: refused }] };
        }
        this.pendingSelection = [...this.selection];
        break;
      }
      case "convert": {
        const operation = convertOperation(this.analysis!, d);
        if (!operation) {
          return {
            messages: [
              { type: "rejected", code: "edit.unsafe-target", reason: words.session.convert },
            ],
          };
        }
        ops.push(operation);
        this.pendingDiagram = operation.id;
        break;
      }
      case "setField": {
        const result = fieldOperations(this.analysis!, d, action.ids, action.field, action.value);
        if (!result.ok)
          return {
            messages: [{ type: "rejected", code: "edit.invalid-value", reason: result.reason }],
          };
        if ("select" in result && result.select) this.pendingSelection = [...result.select];
        // Moving into a group of a free diagram writes the place in the group's interior, and a
        // group left empty gets its place and size.
        const geometric =
          ["x", "y", "w", "h"].includes(action.field) ||
          (action.field === "inside" &&
            (diagram.type === "free" ||
              result.operations.some((op) => op.kind === "setPosition" || op.kind === "setSize")));
        const planned = this.planned(view, geometric ? "move" : "setField", result.operations);
        // Say what the edit did besides the field, such as naming a relation to style it.
        return result.notice && planned.plan
          ? {
              ...planned,
              messages: [...planned.messages, { type: "status", message: result.notice }],
            }
          : planned;
      }
      case "setIcon": {
        const targets = action.ids.filter((id) => {
          const element = diagram.elementsById.get(id);
          return element !== undefined && takesIcon(diagram, element);
        });
        if (targets.length === 0) {
          return {
            messages: [
              { type: "rejected", code: "edit.invalid-value", reason: words.session.noIconTarget },
            ],
          };
        }
        for (const id of targets) {
          // An element that already has this icon written keeps its statement as it is.
          if (writtenIcon(diagram, id, "element") === action.icon) continue;
          ops.push({
            kind: "setStyleProperty",
            diagram: d,
            target: id,
            targetKind: "element",
            property: "icon",
            value: action.icon,
          });
        }
        break;
      }
      case "removeIcon": {
        for (const id of action.ids) {
          if (!diagram.elementsById.has(id) || writtenIcon(diagram, id, "element") === null) {
            continue;
          }
          ops.push({
            kind: "setStyleProperty",
            diagram: d,
            target: id,
            targetKind: "element",
            property: "icon",
            value: null,
          });
        }
        break;
      }
      case "paste":
        return {
          messages: [],
          ...(action.at ? { readClipboard: { at: action.at } } : { readClipboard: {} }),
        };
      case "duplicate": {
        const fragment = copyFragment(this.analysis!, d, action.ids);
        if (!fragment) break;
        const pasted = pasteOperations(this.analysis!, d, fragment, {
          shift: { x: 2 * this.grid, y: 2 * this.grid },
        });
        if (!pasted.ok)
          return {
            messages: [{ type: "rejected", code: "edit.invalid-value", reason: pasted.reason }],
          };
        this.pendingSelection = [...pasted.ids];
        ops.push(...pasted.operations);
        break;
      }
      case "cut": {
        const fragment = copyFragment(this.analysis!, d, action.ids);
        if (!fragment) break;
        const removal = this.act({ kind: "remove", ids: action.ids, cascade: true });
        return { ...removal, clipboard: fragment };
      }
      case "arrange": {
        const attempt = arrangeAttempt(this.analysis!, d, action.scope);
        if (attempt.operation) ops.push(attempt.operation);
        else if (attempt.problem) {
          // Say why nothing moves, rather than doing nothing.
          return {
            messages: [
              {
                type: "rejected",
                code: "layout.cannot-arrange",
                reason: wording().session.cannotArrange(attempt.problem),
              },
            ],
          };
        }
        break;
      }
    }
    return this.planned(view, action.kind, ops);
  }

  /** Writes a new empty diagram of `type`, shown once the host has applied the edit. */
  private createDiagram(type: CreatableDiagram): SessionResult {
    const analysis = this.analysis!;
    const id = newDiagramId(analysis.compilation);
    const result = planEdit(
      analysis.compilation,
      { kind: "createDiagram", type, id },
      { revision: analysis.revision },
    );
    if (!result.ok) {
      return {
        messages: [
          { type: "rejected", code: result.rejection.code, reason: result.rejection.reason },
        ],
      };
    }
    this.pendingDiagram = id;
    return { messages: [], plan: result.plan };
  }

  /**
   * The operations of a move of elements of a flow or free diagram or a C4 view, as the drop
   * writes them: new places, and the declarations of those that land in another group.
   */
  private moveOperations(view: DiagramView, action: MoveAction): EditOperation[] {
    const diagram = view.diagram;
    const d = view.id;
    const ops: EditOperation[] = [];
    const boxes = view.layout?.boxes ?? new Map<string, Box>();
    const centreOf = (id: string) => {
      const box = boxes.get(id);
      return box ? center(box) : undefined;
    };
    const moved = new Set(action.ids.filter((id) => diagram.elementsById.has(id)));
    const landed = (id: string) => {
      const c = centreOf(id);
      return c ? { x: c.x + action.delta.x, y: c.y + action.delta.y } : undefined;
    };
    // The outermost moved elements whose parent differs go into the target group, placed where
    // they land in its interior; what a moved group holds stays in it, and so do all the
    // children of a group without place, which moves with them.
    const reparented = new Set<string>();
    if (action.parent !== undefined) {
      const target = action.parent;
      const origin = interiorOf(view, target);
      const carried = carriedChildren(
        diagram.elements.map((e) => ({
          id: e.id,
          kind: e.kind,
          parent: e.groupPath[e.groupPath.length - 1] ?? null,
          placed: isPlaced(diagram, e.id),
        })),
        [...moved],
      );
      for (const id of moved) {
        const element = diagram.elementsById.get(id)!;
        const parent = element.groupPath[element.groupPath.length - 1] ?? null;
        if (parent === target || carried.has(id) || element.groupPath.some((g) => moved.has(g)))
          continue;
        reparented.add(id);
        const to = landed(id);
        // A flow group without `place` is drawn around its children, which move below.
        const placed = diagram.type === "free" || element.kind !== "group" || isPlaced(diagram, id);
        ops.push({
          kind: "moveElement",
          diagram: d,
          element: id,
          parent: target,
          ...(to && placed
            ? { at: { x: Math.round(to.x - origin.x), y: Math.round(to.y - origin.y) } }
            : {}),
        });
      }
      // The groups left and entered stay drawn where they are.
      ops.push(...steadyGroups(view, [...reparented], target));
    }
    if (diagram.type === "free") {
      // Children are placed inside their group, so a moved group carries them.
      for (const id of moved) {
        const element = diagram.elementsById.get(id)!;
        if (reparented.has(id) || element.groupPath.some((g) => moved.has(g))) continue;
        const to = landed(id);
        if (!to) continue;
        const at = this.written(view, id, to);
        ops.push({ kind: "setPosition", diagram: d, element: id, x: at.x, y: at.y });
      }
      return ops;
    }
    const ids = new Set<string>();
    for (const id of action.ids) {
      const element = diagram.elementsById.get(id);
      if (!element) continue;
      if (!reparented.has(id) && (element.kind !== "group" || isPlaced(diagram, id))) {
        ids.add(id);
      }
      if (element.kind === "group") {
        for (const child of diagram.elements)
          if (child.groupPath.includes(id) && child.kind !== "group") ids.add(child.id);
        for (const child of diagram.elements)
          if (child.groupPath.includes(id) && child.kind === "group" && isPlaced(diagram, child.id))
            ids.add(child.id);
      }
    }
    for (const id of ids) {
      const c = centreOf(id);
      if (!c) continue;
      ops.push({
        kind: "setPosition",
        diagram: d,
        element: id,
        x: Math.round(c.x + action.delta.x),
        y: Math.round(c.y + action.delta.y),
      });
    }
    return ops;
  }

  /** The operations of a resize of an element of a flow or free diagram or a C4 view. */
  private resizeOperations(view: DiagramView, action: ResizeAction): EditOperation[] {
    const diagram = view.diagram;
    const d = view.id;
    const size: EditOperation = {
      kind: "setSize",
      diagram: d,
      element: action.id,
      width: Math.round(action.box.width),
      height: Math.round(action.box.height),
    };
    if (diagram.type !== "free") {
      const c = writtenCenter(action.box);
      return [size, { kind: "setPosition", diagram: d, element: action.id, x: c.x, y: c.y }];
    }
    const at = this.written(view, action.id, writtenCenter(action.box));
    const ops: EditOperation[] = [
      size,
      { kind: "setPosition", diagram: d, element: action.id, x: at.x, y: at.y },
    ];
    // The interior moves with the left and top edges; children stay where they are drawn.
    const old = view.layout?.boxes?.get(action.id);
    const shift = old
      ? { x: Math.round(action.box.x - old.x), y: Math.round(action.box.y - old.y) }
      : { x: 0, y: 0 };
    if (shift.x !== 0 || shift.y !== 0) {
      for (const child of diagram.elements) {
        if (child.groupPath[child.groupPath.length - 1] !== action.id) continue;
        const place = diagram.placement.find(
          (p): p is PlaceEntry => p.statement === "place" && p.target === child.id,
        );
        if (!place) continue;
        ops.push({
          kind: "setPosition",
          diagram: d,
          element: child.id,
          x: place.x - shift.x,
          y: place.y - shift.y,
        });
      }
    }
    return ops;
  }

  /**
   * The drawing a move or a resize would give, while the gesture goes on: the action is planned
   * as on the drop, its edits applied to a copy of the text, the copy compiled with the options of
   * the document (its project's imports) and the shown diagram laid out with the document's layout
   * options and drawn as the stage draws it. Nothing is written, sent or kept: the session's
   * state stays as it was. The drawing is null when the drop would be refused, the copy has more
   * errors than the text, or the diagram is a sequence diagram.
   */
  private preview(token: number, action: PreviewedAction): SessionResult {
    const none: SessionResult = { messages: [{ type: "preview", token, svg: null }] };
    const analysis = this.analysis!;
    const view = this.view();
    if (!view?.layout?.scene) return none;
    const diagram = view.diagram;
    // Sequence diagrams move their own events live; only they preview scenarios.
    if (diagram.type === "sequence") return none;
    if (diagram.type === "c4" && refusal(wording().c4Refused, action, diagram)) return none;
    let operations: EditOperation[];
    if (action.kind === "move") operations = this.moveOperations(view, action);
    else if (action.kind === "resize") operations = this.resizeOperations(view, action);
    else {
      // A rotation handle's angle, as its release writes it.
      const field = fieldOperations(
        this.analysis!,
        view.id,
        action.ids,
        action.field,
        action.value,
      );
      if (!field.ok) return none;
      operations = [...field.operations];
    }
    const result = this.plan(view, action.kind, operations);
    if (!result?.ok) return none;
    const compilation = compile(
      applyTextEdits(analysis.compilation.text, result.plan.edits),
      analysis.compilation.options,
    );
    const copy = compilation.document.diagrams.find((d) => d.id === view.id);
    if (!copy || copy.hasErrors || errorCount(compilation) > errorCount(analysis.compilation)) {
      return none;
    }
    const layout = layoutDiagram(compilation, copy, analysis.layoutOptions);
    // The stage's options: the effects run while it plays them.
    const playing = this.playing && copy.animations.some((a) => a.effect !== null);
    const drawn = renderLayout(copy, layout, analysis.fonts, playing ? { motion: "animated" } : {});
    if (!drawn) return none;
    const { width, height, offset } = drawn.geometry;
    return { messages: [{ type: "preview", token, svg: drawn.svg, width, height, offset }] };
  }
}

/** How many errors a compilation reports. */
function errorCount(compilation: Compilation): number {
  return compilation.diagnostics.filter((d) => d.severity === "error").length;
}

/** Fields of actions that a profile refuses while it takes the action without them. */
type RefusedField = "move.parent" | "create.shape" | "connect.twoWay";

/**
 * Why a canvas action does not apply to a profile, from the catalog's refusals of C4 views or of
 * sequence diagrams: of its kind, or of a field it carries (a move into another group, a shape, a
 * two-way arrow); undefined when it applies.
 */
function refusal(
  refused: Partial<Record<CanvasAction["kind"] | RefusedField, string>>,
  action: CanvasAction,
  diagram: FlowDiagram,
): string | undefined {
  const keys: (CanvasAction["kind"] | RefusedField)[] = [action.kind];
  if (action.kind === "move" && action.parent !== undefined) {
    const changes = action.ids.some((id) => {
      const element = diagram.elementsById.get(id);
      return element && (element.groupPath[element.groupPath.length - 1] ?? null) !== action.parent;
    });
    if (changes) keys.push("move.parent");
  }
  if (action.kind === "create" && action.shape !== undefined) keys.push("create.shape");
  if (action.kind === "connect" && action.twoWay) keys.push("connect.twoWay");
  const key = keys.find((k) => Object.hasOwn(refused, k));
  return key === undefined ? undefined : refused[key];
}

/** The `layers` statement's value for a list of layers, or null when only `main` is left. */
function layersValue(layers: readonly string[]): string | null {
  return layers.length === 1 && layers[0] === MAIN_LAYER ? null : layers.join(", ");
}

/**
 * The operations of a layer action, pushed onto `ops`; the reason when the action does not apply.
 * `layers` is back to front with `main` always present.
 */
function layerOperations(
  diagram: FlowDiagram,
  d: string,
  action: Extract<
    CanvasAction,
    { kind: "addLayer" | "renameLayer" | "removeLayer" | "moveLayer" | "setLayer" }
  >,
  ops: EditOperation[],
): string | undefined {
  const words = wording();
  if (diagram.type !== "flow" && diagram.type !== "free") return words.layers.notHere;
  const layers = [...diagram.properties.layers];
  switch (action.kind) {
    case "addLayer": {
      let n = 1;
      while (layers.includes(`layer${n}`)) n++;
      const main = layers.indexOf(MAIN_LAYER);
      layers.splice(main < 0 ? layers.length : main, 0, `layer${n}`);
      ops.push({
        kind: "setDiagramProperty",
        diagram: d,
        property: "layers",
        value: layers.join(", "),
      });
      return undefined;
    }
    case "renameLayer":
      ops.push({ kind: "renameLayer", diagram: d, layer: action.layer, name: action.name });
      return undefined;
    case "removeLayer": {
      if (action.layer === MAIN_LAYER || !layers.includes(action.layer))
        return words.layers.noLayer(action.layer);
      for (const element of diagram.elements) {
        if (element.layer !== action.layer) continue;
        ops.push({
          kind: "setElementProperty",
          diagram: d,
          target: element.id,
          targetKind: "element",
          property: "layer",
          value: null,
        });
      }
      for (const relation of diagram.relations) {
        if (relation.layer !== action.layer) continue;
        ops.push({
          kind: "setElementProperty",
          diagram: d,
          target: relation.key,
          targetKind: "relation",
          property: "layer",
          value: null,
        });
      }
      ops.push({
        kind: "setDiagramProperty",
        diagram: d,
        property: "layers",
        value: layersValue(layers.filter((l) => l !== action.layer)),
      });
      return undefined;
    }
    case "moveLayer": {
      const index = layers.indexOf(action.layer);
      // Front is the end of the list: up moves towards it.
      const target = action.direction === "up" ? index + 1 : index - 1;
      if (index < 0 || target < 0 || target >= layers.length) return words.layers.noMove;
      [layers[index], layers[target]] = [layers[target]!, layers[index]!];
      ops.push({
        kind: "setDiagramProperty",
        diagram: d,
        property: "layers",
        value: layers.join(", "),
      });
      return undefined;
    }
    case "setLayer": {
      if (action.layer !== null && !layers.includes(action.layer))
        return words.layers.noLayer(action.layer);
      for (const id of action.ids) {
        const element = diagram.elementsById.get(id);
        const relation = element ? undefined : diagram.relationsByKey.get(id);
        if (!element && !relation) continue;
        ops.push({
          kind: "setElementProperty",
          diagram: d,
          target: id,
          targetKind: element ? "element" : "relation",
          property: "layer",
          value: action.layer === MAIN_LAYER ? null : action.layer,
        });
      }
      return undefined;
    }
  }
}

/** A fresh id for a library element, from its icon's name: `aws:lambda` gives `lambda1`. */
function libraryElementId(diagram: FlowDiagram, icon: string): string {
  const base =
    icon
      .slice(icon.indexOf(":") + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(?=[0-9])/, "n") || "element";
  const taken = new Set([
    ...diagram.elementsById.keys(),
    ...diagram.relations.map((r) => r.id ?? ""),
  ]);
  let n = 1;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

function isPlaced(diagram: FlowDiagram, id: string): boolean {
  return diagram.placement.some((p): p is PlaceEntry => p.statement === "place" && p.target === id);
}

function currentVia(diagram: FlowDiagram, relationId: string): Point[] {
  const route = diagram.placement.find((p) => p.statement === "route" && p.target === relationId);
  return route && route.statement === "route" ? [...route.via] : [];
}

/** `<kind><n>` with the smallest free `n`, as `createElement` would choose. */
function freeElementId(
  analysis: DocumentAnalysis,
  diagram: FlowDiagram,
  kind: ElementKind,
): string {
  const used = new Set<string>([
    ...diagram.elementsById.keys(),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
    ...analysis.compilation.document.diagrams.map((x) => x.id),
    ...analysis.compilation.document.themes.map((t) => t.id),
  ]);
  for (let n = 1; ; n++) if (!used.has(`${kind}${n}`)) return `${kind}${n}`;
}
