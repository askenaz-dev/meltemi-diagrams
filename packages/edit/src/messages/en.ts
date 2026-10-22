import type { ElementKind } from "@meltemi/diagrams-model";

/** A syntax error of a diagram: its line and its message without the final period. */
export interface SyntaxErrorAt {
  readonly line: number;
  readonly message: string;
}

/** The entity that would hold a new one, or null for the root of the model. */
export interface EntityParent {
  readonly kind: string;
  readonly path: string;
}

/**
 * The edit package's words in English. `labels` are content: what the person would have typed.
 * The other groups are what the package says about the person's text, written in the interface
 * language when an edit is refused or planned: the reasons of `edit.*` rejections, the descriptions
 * of the statements that depend on a target, and the notes of plans. Sentences with values are
 * functions, so each language builds its own grammar; code in them (ids, keywords, operation names,
 * samples) stays as written.
 */
export const en = {
  /**
   * The labels of new elements created without one, by kind: what the person would have typed, so
   * they follow the interface language.
   */
  labels: {
    node: "Node",
    decision: "Decision",
    data: "Data",
    group: "Group",
    note: "Note",
    tag: "Tag",
    participant: "Participant",
    actor: "Actor",
    boundary: "Boundary",
    control: "Control",
    entity: "Entity",
    database: "Database",
    collections: "Collections",
    queue: "Queue",
    box: "Box",
    text: "Text",
    icon: "Icon",
    image: "Image",
    person: "Person",
    system: "System",
    container: "Container",
    datastore: "Datastore",
    component: "Component",
  } satisfies Record<ElementKind, string>,

  /** The reasons of refused edits, by theme; the code of each is in its comment. */
  rejections: {
    /** What an edit acts on: diagrams, blocks and the statements it reads. */
    targets: {
      /** `edit.unsafe-target`: a diagram of a type the language does not have. */
      unsupportedDiagram: (id: string, profile: string) =>
        `\`${id}\` is a ${profile} diagram, a type the language does not have; visual edits are only available for diagrams.`,
      /** `edit.unsafe-target`. */
      isModel: (id: string) => `\`${id}\` is a model; edit it with the entity operations.`,
      /** `edit.unsafe-target`. */
      isStory: (id: string) => `\`${id}\` is a story; edit it with the story operations.`,
      /** `edit.unsafe-target`. */
      isExport: (id: string) =>
        `\`${id}\` is an export profile; visual edits are only available for diagrams.`,
      /** `edit.unsafe-target`. */
      noDiagram: (id: string) => `There is no diagram \`${id}\` in this document.`,
      /** `edit.unsafe-target`: with the first syntax error of the diagram, when one is known. */
      syntaxError: (id: string, error: SyntaxErrorAt | null) =>
        `Diagram \`${id}\` has a syntax error${error ? ` on line ${error.line} (${error.message})` : ""}. Fix it before editing visually.`,
      /** `edit.unsafe-target`. */
      noBody: (id: string) => `Diagram \`${id}\` has no body.`,
      /** `edit.unsafe-target`. */
      blockNotClosed: "The block is not closed; fix the syntax first.",
      /** `edit.unsafe-target`. */
      notInBlock: "A statement to delete is not inside a block.",
      /** `edit.unsafe-target`: a placement statement the model could not read. */
      invalidStatement: (keyword: string, target: string, line: number) =>
        `The \`${keyword}\` statement for \`${target}\` on line ${line} is invalid; fix it before editing visually.`,
      /** `edit.unsafe-target`. */
      propertyUnreadable: "The property cannot be read.",
      /** `edit.unsafe-result`. */
      unparsable: "The edit would produce text that does not parse; it was not planned.",
      /** `edit.stale-revision`. */
      staleRevision: (planned: number, current: number) =>
        `The plan was made for revision ${planned} but the document is at revision ${current}. Plan again from the current text.`,
    },

    /** Ids of new and renamed elements, relations, events and themes. */
    ids: {
      /** `edit.invalid-id`. */
      invalid: (id: string) =>
        `\`${id}\` is not a valid id; use letters, digits and \`_\`, starting with a letter or \`_\`.`,
      /** `edit.invalid-id`: the new id of an entity. */
      invalidEntity: (id: string) => `\`${id}\` is not a valid id; use letters, digits and \`_\`.`,
      /** `edit.invalid-id`, or `edit.invalid-value` for themes. */
      notValid: (id: string) => `\`${id}\` is not a valid id.`,
      /** `edit.id-conflict`. */
      usedInDiagram: (id: string, diagram: string) =>
        `\`${id}\` is already used in diagram \`${diagram}\`.`,
      /** `edit.id-conflict`. */
      used: (id: string) => `\`${id}\` is already used.`,
      /** `edit.id-conflict`. */
      usedInFile: (id: string) => `\`${id}\` is already used in this file.`,
    },

    /** Values an operation writes. */
    values: {
      /** `edit.invalid-value`. */
      notCoordinate: (value: number) => `\`${value}\` is not a coordinate the language can write.`,
      /** `edit.invalid-value`. */
      positiveSize: "Width and height must be positive.",
      /** `edit.invalid-value`: a style property or a theme token. */
      takesNumber: (name: string) => `\`${name}\` takes a number.`,
      /** `edit.invalid-value`. */
      notValueOf: (value: string, property: string) =>
        `\`${value}\` is not a value of \`${property}\`.`,
      /** `edit.invalid-value`. */
      unsafeUrl: (value: string) =>
        `\`${value}\` is not a URL a link may use: \`https:\`, \`http:\`, \`mailto:\` or a relative one.`,
    },

    /** Elements: their declarations, kinds, labels and sources. */
    elements: {
      /** `edit.unsafe-target`. */
      missing: (id: string, diagram: string) =>
        `Element \`${id}\` does not exist in diagram \`${diagram}\`.`,
      /** `edit.has-dependents`: the number of statements that use the element. */
      usedBy: (id: string, count: number) =>
        `\`${id}\` is used by ${count} statement${count === 1 ? "" : "s"}; remove them first or remove with cascade.`,
      /** `edit.invalid-value`: a kind of the other profile, and the kinds of this diagram. */
      otherProfile: (kind: string, other: "flow" | "free", kinds: readonly string[]) =>
        `\`${kind}\` elements belong to ${other} diagrams; this diagram declares ${kinds.join(", ")}.`,
      /** `edit.invalid-value`. */
      badIcon: (icon: string) => `\`${icon}\` is not an icon reference such as \`tabler:server\`.`,
      /** `edit.invalid-value`: with the shapes of boxes and nodes. */
      notShape: (shape: string, shapes: readonly string[]) =>
        `\`${shape}\` is not a shape; the shapes are ${shapes.join(", ")}.`,
      /** `edit.invalid-value`: a shape given with another kind than `box` or `node`. */
      shapeKinds: (kind: string) =>
        `A new ${kind} takes no shape; shapes are for free boxes and flow nodes.`,
      needsSource: (kind: "icon" | "image") =>
        `A new ${kind} needs its ${kind === "icon" ? "icon" : "file path"}.`,
      /** `edit.invalid-value`. */
      participantsNotPlaced:
        "Sequence participants are not placed; reorder them with reorderParticipant.",
      /** `edit.unsafe-target`. */
      sourcedLabel: (id: string, kind: "icon" | "image") =>
        `\`${id}\` is an ${kind}; it has no label. Change its source instead.`,
      /** `edit.unsafe-target`. */
      declarationNoId: "The declaration has no id.",
      /** `edit.unsafe-target`. */
      labelUnreadable: "The declaration's label cannot be read; fix the syntax first.",
      /** `edit.unsafe-target`. */
      descriptionUnreadable: "The description cannot be read; fix the syntax first.",
      /** `edit.unsafe-target`. */
      groupKind: "A group cannot become another kind; ungroup it first.",
      /** `edit.invalid-value`: the kinds this diagram changes into each other. */
      cannotBecome: (id: string, kind: string, kinds: readonly string[]) =>
        `\`${id}\` cannot become ${kind === "icon" || kind === "image" ? "an" : "a"} ${kind}; this diagram changes ${kinds.join(", ")} into each other.`,
      /** `edit.invalid-value`. */
      notClass: (name: string) => `\`${name}\` is not a class name.`,
      /** `edit.unsafe-target`. */
      notSourced: (id: string) => `\`${id}\` is not an icon or an image.`,
      /** `edit.unsafe-target`. */
      sourceUnreadable: "The source cannot be read.",
    },

    /** Relations and their ids. */
    relations: {
      /** `edit.unsafe-target`. */
      missing: (name: string, diagram: string) =>
        `Relation \`${name}\` does not exist in diagram \`${diagram}\`.`,
      /** `edit.anonymous-relation`. */
      anonymous: (name: string) =>
        `Relation \`${name}\` has no id. Run materializeRelationId first so the edit can reference it.`,
      /** `edit.already-named`. */
      alreadyNamed: (id: string) => `The relation is already named \`${id}\`.`,
      /** `edit.invalid-value`: the label of a model relation in a C4 view. */
      modelLabel: (relation: string) =>
        `\`${relation}\` is a relation of the model; give it a label in this view with setLocalLabel, or change the model's label with setModelRelationProperty.`,
      /** `edit.invalid-value`: removing a model relation from a C4 view. */
      modelRemove: (relation: string) =>
        `\`${relation}\` is a relation of the model; remove it there with removeModelRelation, or stop drawing an end with excludeEntity.`,
      /** `edit.unsafe-target`. */
      routeUnreadable: "The route cannot be read.",
      /** `edit.invalid-value`. */
      messagesNoPorts: "Sequence messages have no ports.",
      /** `edit.invalid-value`: a two-way arrow in a C4 view. */
      oneWay: "Relations of C4 views go one way: `->` or `-->`.",
    },

    /** Statements of the `placement` block. */
    placement: {
      /** `edit.unsafe-target`. */
      expectedNumber: "Expected a number in the statement.",
      /** `edit.unsafe-target`. */
      expectedPoint: "Expected a point `(x, y)` in the statement.",
      /** `edit.unsafe-target`. */
      layoutUnreadable: "The `layout` statement cannot be read.",
      /** `edit.unsafe-target`. */
      expectedEndpoint: "Expected a route endpoint.",
      /** `edit.invalid-value`. */
      labelPosition: "The label position must be between 0 and 100 percent.",
    },

    /** Ports of elements. */
    ports: {
      /** `edit.invalid-value`: with the ports the element has, its own first. */
      unknown: (element: string, port: string, ports: readonly string[]) =>
        `\`${element}\` has no port \`${port}\`; its ports are ${ports.join(", ")}.`,
      /** `edit.invalid-id`. */
      invalidName: (name: string) =>
        `\`${name}\` cannot name a port; compass words and \`auto\` are built in.`,
      /** `edit.id-conflict`. */
      exists: (element: string, name: string) => `\`${element}\` already has a port \`${name}\`.`,
      /** `edit.invalid-value`. */
      position: "The position of a port is between 0 and 1.",
      /** `edit.invalid-value`: a route end's point needs a compass side. */
      endSide: (port: string) =>
        `A point of a side needs a compass side, \`north\`, \`south\`, \`east\` or \`west\`, not \`${port}\`.`,
      /** `edit.invalid-value`. */
      endPosition: "The point of a side is a percentage from 0 to 100.",
      /** `edit.unsafe-target`. */
      declareFirst: (element: string) => `Declare \`${element}\` before adding ports to it.`,
      /** `edit.unsafe-target`. */
      missing: (element: string, name: string) => `\`${element}\` has no port \`${name}\`.`,
      /** `edit.has-dependents`: the number of routes that use the port. */
      usedByRoutes: (name: string, count: number) =>
        `Port \`${name}\` is used by ${count} route${count === 1 ? "" : "s"}; change them first.`,
    },

    /** Groups of elements. */
    groups: {
      /** `edit.unsafe-target`. */
      notGroup: (id: string) => `\`${id}\` is not a group.`,
      /** `edit.unsafe-target`. */
      noBlock: (id: string) => `Group \`${id}\` has no block.`,
      /** `edit.unsafe-target`. */
      select: "Select the elements to group.",
      /** `edit.unsafe-target`. */
      sameGroup: "Only elements of the same group (or all outside groups) can be grouped.",
      /** `edit.has-dependents`: the number of relations that end at the group. */
      endOfRelations: (group: string, count: number) =>
        `Group \`${group}\` is the end of ${count} relation${count === 1 ? "" : "s"}; change them first.`,
      /** `edit.unsafe-target`: a group moved into itself, or into a group inside it. */
      intoItself: (element: string, parent: string) =>
        element === parent
          ? `\`${element}\` cannot be moved into itself.`
          : `\`${element}\` cannot be moved into \`${parent}\`, which is inside \`${element}\`.`,
      /** `edit.unsafe-target`: moving an element between groups of a sequence diagram or a C4 view. */
      notMovable: (profile: "sequence" | "c4"): string =>
        profile === "sequence"
          ? "Participants of sequence diagrams do not move between groups; reorder them with reorderParticipant."
          : "The elements of a C4 view sit where their entities are in the model; they do not move between groups.",
      /** `edit.unsafe-target`: a container in a sequence diagram or a C4 view. */
      containerProfile: "Only flow diagrams and free compositions have containers.",
      /** `edit.unsafe-target`: converting something other than a flow node or a free box. */
      containerKind: (id: string, kind: string) =>
        `\`${id}\` is a ${kind}: only flow nodes and free boxes become containers.`,
      /** `edit.unsafe-target`: an element that only relations mention. */
      containerImplicit: (id: string) =>
        `\`${id}\` has no declaration; declare it before converting it to a container.`,
      /** `edit.has-dependents`: the named ports of the element, which groups do not have. */
      containerPorts: (id: string, ports: readonly string[]) =>
        `\`${id}\` declares the port${ports.length === 1 ? "" : "s"} ${ports.map((p) => `\`${p}\``).join(", ")}; groups have no named ports, so remove ${ports.length === 1 ? "it" : "them"} first.`,
      /** `edit.unsafe-target`: a child that is not beside the element. */
      containerChild: (child: string, id: string) =>
        `\`${child}\` is not beside \`${id}\` in its group, so it cannot go into it.`,
    },

    /** Text pasted into a diagram. */
    insert: {
      /** `edit.invalid-value`. */
      notOneDiagram: "The text to insert is not one flow or free diagram without syntax errors.",
      /** `edit.id-conflict`: the ids of the text that the diagram already has. */
      idsExist: (ids: readonly string[], diagram: string) =>
        `${ids.map((id) => `\`${id}\``).join(", ")} already exist in diagram \`${diagram}\`.`,
    },

    /** The `kind`, `layer`, `url` and `link` of elements and relations, and their sources. */
    properties: {
      /** `edit.invalid-value`. */
      kindForMessages: "`kind` applies to the messages of sequence diagrams.",
      /** `edit.invalid-value`. */
      messageKind: "A message kind is `async` or `sync`.",
      /** `edit.invalid-value`. */
      layersFree: "Layers belong to flow diagrams and free compositions.",
      mainLayer: "The layer `main` always exists and keeps its name.",
      layerTaken: (name: string) =>
        `\`${name}\` is not a free layer name: use a word that no layer has.`,
      /** `edit.invalid-value`. */
      noLayer: (layer: string, layers: readonly string[]) =>
        `There is no layer \`${layer}\`; the layers are ${layers.join(", ")}.`,
      /** `edit.invalid-value`. */
      relationsNoUrl: "Relations take no `url`.",
      /** `edit.invalid-value`. */
      viewUrl: "The elements of a C4 view take the `url` of their entity.",
      /** `edit.invalid-value`. */
      relationsNoLink: "Relations take no `link`.",
      /** `edit.invalid-value`. */
      notLink: (value: string) => `\`${value}\` is not a link; write \`<diagram>.<element>\`.`,
    },

    /** The conversion of a flow diagram into a free one. */
    convert: {
      /** `edit.unsafe-target`. */
      notFlow: (id: string) => `\`${id}\` is not a flow diagram.`,
      /** `edit.unsafe-target`. */
      hasErrors: (id: string) => `Diagram \`${id}\` has errors; fix them before converting.`,
      /** `edit.unsafe-target`. */
      noBox: (id: string) => `\`${id}\` has no drawn box; lay the diagram out first.`,
    },

    /** New diagrams of a file. */
    diagrams: {
      /** `edit.invalid-value`: with the types `createDiagram` writes. */
      notCreatable: (type: string, types: readonly string[]) =>
        `\`${type}\` is not a type of diagram that can be created here; expected one of ${types.join(", ")}.`,
      /** `edit.invalid-value`. */
      invalidId: (id: string) =>
        `\`${id}\` is not a valid id for a diagram; use letters, digits and \`_\`, starting with a letter or \`_\`.`,
      /** `edit.invalid-value`: a diagram, model, theme, story, export or import already has it. */
      taken: (id: string) => `\`${id}\` is already used in this file; choose another id.`,
    },

    /** Styles and diagram properties. */
    styles: {
      /** `edit.invalid-value`. */
      notProperty: (property: string) => `\`${property}\` is not a style property.`,
      /** `edit.invalid-value`. */
      wordOrString: (property: string) => `\`${property}\` takes a word or a string.`,
      /** `edit.unsafe-target`. */
      unnamedEvent: (target: string) =>
        `\`${target}\` is not a named note or fragment; name it before styling it.`,
      /** `edit.invalid-value`. */
      relationsOnly: (property: string) => `\`${property}\` applies to relations only.`,
      /** `edit.anonymous-relation`. */
      nameRelation: "Name the relation first so a style can target it.",
      /** `edit.invalid-value`. */
      elementsOnly: (property: string) => `\`${property}\` applies to elements only.`,
      /** `edit.invalid-value`: a property the diagram's profile does not have. */
      notProfileProperty: (property: string, profile: string) =>
        `\`${property}\` is not a property of ${profile} diagrams.`,
      /** `edit.invalid-value`. */
      names: (property: string) => `\`${property}\` takes names separated by commas.`,
      /** `edit.invalid-value`. */
      entityPath: (path: string) => `\`${path}\` is not an entity path such as \`shop.api\`.`,
      /** `edit.invalid-value`: with the range of the property, when it has one. */
      numberRange: (property: string, min?: number, max?: number) =>
        `\`${property}\` takes a number${min !== undefined && max !== undefined ? ` from ${min} to ${max}` : ""}.`,
      /** `edit.invalid-value`. */
      canvasSize: "`canvas` takes a width and a height, such as `(1280, 720)`.",
      /** `edit.invalid-value`. */
      notDiagramProperty: (property: string) => `\`${property}\` is not a diagram property.`,
    },

    /** Effects of `animate` statements. */
    animations: {
      /** `edit.invalid-value`. */
      flowOnBoxes: "Flow particles run along relations, not boxes.",
      /** `edit.invalid-value`. */
      traceOnBoxes: "A trace runs along relations, not boxes.",
      /** `edit.invalid-value`. */
      noOutline: (target: string) => `\`${target}\` has no outline for a moving dash.`,
      /** `edit.anonymous-relation`. */
      nameRelation: "Name the relation first so an effect can target it.",
      /** `edit.unsafe-target`. */
      unnamedEvent: (target: string) =>
        `\`${target}\` is not a named note or fragment; name it before animating it.`,
      /** `edit.invalid-value`. */
      pulseOnly: "Notes and fragments take a pulse only.",
      /** `edit.invalid-value`: `duration` or `delay`. */
      timeRange: (property: string, min: number, max: number) =>
        `\`${property}\` takes ${min} to ${max} milliseconds.`,
      /** `edit.invalid-value`. */
      repeatRange: (max: number) => `\`repeat\` takes \`forever\` or 1 to ${max}.`,
      /** `edit.invalid-value`. */
      particlesRange: (max: number) => `\`particles\` takes 1 to ${max}.`,
      /** `edit.invalid-value`. */
      direction: "`direction` takes `forward` or `reverse`.",
      /** `edit.invalid-value`. */
      notProperty: (property: string) => `\`${property}\` is not a property of \`animate\`.`,
      /** `edit.invalid-value`. */
      notForEffect: (property: string, effect: string) =>
        `\`${property}\` does not apply to \`${effect}\` effects.`,
    },

    /** Theme blocks and their tokens. */
    themes: {
      /** `edit.unsafe-target`. */
      missing: (id: string) =>
        `There is no theme \`${id}\` in this file; built-in themes cannot be changed, create a theme that extends one.`,
      /** `edit.unsafe-target`. */
      noBlock: (id: string) => `Theme \`${id}\` has no block.`,
      /** `edit.invalid-value`: with the tokens a theme may write. */
      notToken: (token: string, tokens: readonly string[]) =>
        `\`${token}\` is not a theme token. Theme tokens: ${tokens.join(", ")}.`,
      /** `edit.invalid-value`. */
      needsValue: (token: string) => `\`${token}\` needs a value.`,
      /** `edit.invalid-value`. */
      notValue: (value: string, token: string, values: readonly string[]) =>
        `\`${value}\` is not a value of \`${token}\`; expected one of ${values.join(", ")}.`,
      /** `edit.invalid-value`. */
      takesTime: (token: string) => `\`${token}\` takes a time in milliseconds.`,
      /** `edit.invalid-value`. */
      notWritable: (token: string) => `\`${token}\` cannot be written from here.`,
      /** `edit.id-conflict`. */
      exists: (id: string) => `There is already a theme \`${id}\` in this file.`,
      /** `edit.unsafe-target`. */
      tokenUnreadable: (token: string) => `\`${token}\` cannot be read.`,
      /** `edit.invalid-value`. */
      keepsBase: "A theme keeps its base; change `extends` with setThemeToken.",
    },

    /** Sequence diagrams: participants, events and fragments. */
    sequence: {
      /** `edit.unsafe-target`. */
      notSequence: (id: string) => `\`${id}\` is not a sequence diagram.`,
      /** `edit.invalid-value`: a flow geometry operation. */
      flowGeometry: (operation: string) =>
        `\`${operation}\` does not apply to sequence diagrams, which keep the order of events; use reorderParticipant, moveEvent and setSpacing.`,
      /** `edit.unsafe-target`. */
      noEvent: (key: string, diagram: string) =>
        `Event \`${key}\` does not exist in diagram \`${diagram}\`.`,
      /** `edit.unsafe-target`. */
      notFragment: (key: string) => `\`${key}\` is not a fragment.`,
      /** `edit.unsafe-target`. */
      notParticipantOrGroup: (id: string) =>
        `\`${id}\` is not a participant or a participant group.`,
      /** `edit.unsafe-target`: an event kind such as `activate`. */
      noSpace: (kind: string) =>
        `A \`${kind}\` event has no space of its own; space the next message.`,
      /** `edit.unsafe-target`. */
      notParticipant: (id: string) => `\`${id}\` is not a participant.`,
      /** `edit.unsafe-target`. */
      amountUnreadable: "The amount cannot be read.",
      /** `edit.unsafe-target`: the number of the branch, from 1. */
      noBranch: (key: string, branch: number) => `\`${key}\` has no branch ${branch}.`,
      /** `edit.invalid-value`: wrapping events in a fragment. */
      notFragmentOperator: (operator: string, operators: readonly string[]) =>
        `\`${operator}\` is not a fragment; use ${operators.join(", ")}.`,
      /** `edit.unsafe-target`. */
      selectEvents: "Select the events to wrap.",
      /** `edit.unsafe-target`. */
      sameBlock: "Only events of the same block can be wrapped together.",
      /** `edit.unsafe-target`. */
      consecutive: "Only consecutive events can be wrapped together.",
      /** `edit.unsafe-target`. */
      otherBranches: (key: string) =>
        `\`${key}\` has other branches with events; remove them first.`,
      /** `edit.invalid-value`. */
      singleBranch: (operator: string) => `\`${operator}\` has a single branch.`,
      /** `edit.unsafe-target`. */
      removeMessage: "Messages are relations; remove them with removeRelation.",
      /** `edit.unsafe-target`. */
      renameMessage: "Messages are relations; rename them with renameRelation.",
      /** `edit.unsafe-target`: an event kind such as `divider`. */
      eventNoId: (kind: string) => `A \`${kind}\` event has no id.`,
      /** `edit.unsafe-target`. */
      notMessage: (id: string) => `\`${id}\` is not a message.`,
      /** `edit.unsafe-target`. */
      noText: (id: string) => `\`${id}\` has no text of its own.`,
      /** `edit.unsafe-target`. */
      textUnreadable: "The text cannot be read.",
      /** `edit.invalid-value`: a `note` or a `divider`. */
      needsText: (kind: string) => `A ${kind} needs its text.`,
      /** `edit.unsafe-target`. */
      notNote: (id: string) => `\`${id}\` is not a note.`,
      /** `edit.invalid-value`. */
      notePosition: "A note is `over`, `left` or `right` of its participants.",
      /** `edit.invalid-value`. */
      noteParticipant: "A note needs a participant.",
      /** `edit.invalid-value`: `left` or `right`. */
      oneParticipant: (position: string) => `\`${position} of\` takes one participant.`,
      /** `edit.invalid-value`: changing the operator of a fragment. */
      notOperator: (operator: string, operators: readonly string[]) =>
        `\`${operator}\` is not a fragment operator; use ${operators.map((o) => `\`${o}\``).join(", ")}.`,
      /** `edit.invalid-value`: the number of branches of the fragment. */
      singleBranchFor: (operator: string, key: string, branches: number) =>
        `\`${operator}\` has a single branch and \`${key}\` has ${branches}; remove the others first.`,
    },

    /** C4 views and models. */
    c4: {
      /** `edit.invalid-value`: an operation a view does not take, and the view's model. */
      notInView: (operation: string, model: string) =>
        `\`${operation}\` does not apply to C4 views, which draw the entities of the model \`${model}\`; change the model with the entity operations, and the view with includeEntity, excludeEntity, setLocalLabel, placement and styles.`,
      /** `edit.unsafe-target`. */
      notView: (id: string) => `\`${id}\` is not a C4 view.`,
      /** `edit.unsafe-target`. */
      viewNoBody: (id: string) => `\`${id}\` has no body.`,
      /** `edit.unsafe-target`. */
      unresolved: "The view's model is not resolved.",
      /** `edit.unsafe-target`. */
      noEntity: (model: string, path: string) =>
        `The model \`${model}\` has no entity \`${path}\`.`,
      /** `edit.unsafe-target`. */
      isScope: (entity: string) =>
        `\`${entity}\` is the scope of this view; change the scope instead.`,
      /** `edit.has-dependents`: the number of view statements that go with the entity. */
      removingFromView: (entity: string, count: number) =>
        `Removing \`${entity}\` from the view also removes ${count} statement${count === 1 ? "" : "s"}.`,
      /** `edit.unsafe-target`. */
      notDrawn: (target: string, view: string) =>
        `\`${target}\` is not drawn in the view \`${view}\`.`,
      /** `edit.anonymous-relation`. */
      nameRelation: "Name the relation in the model before giving it a local label.",
      /** `edit.unsafe-target`. */
      noModel: (id: string) => `There is no model \`${id}\` in this document.`,
      /** `edit.unsafe-target`. */
      modelErrors: (id: string) =>
        `The model \`${id}\` has syntax errors; fix them before editing.`,
      /** `edit.unsafe-target`. */
      noRelation: (model: string, key: string) =>
        `The model \`${model}\` has no relation \`${key}\`.`,
      /** `edit.unsafe-target`. */
      modelNoBody: "The model has no body.",
      /** `edit.id-conflict`. */
      entityExists: (path: string, model: string) =>
        `\`${path}\` is already an entity of the model \`${model}\`.`,
      /** `edit.unsafe-target`. */
      opensScope: (view: string, scope: string) =>
        `The view \`${view}\` opens \`${scope}\`; change its scope before removing it.`,
      /** `edit.has-dependents`: the number of statements that go with the entity. */
      removingEntity: (path: string, count: number) =>
        `Removing \`${path}\` also removes ${count} statement${count === 1 ? "" : "s"}.`,
      /** `edit.invalid-value`. */
      external: "`external` marks persons and systems.",
      /** `edit.invalid-value`: with the entity kinds. */
      notEntityKind: (kind: string, kinds: readonly string[]) =>
        `\`${kind}\` is not an entity kind; use ${kinds.join(", ")}.`,
      /** `edit.invalid-value`: an entity kind and where it would go. */
      misplaced: (kind: string, parent: EntityParent | null) =>
        `A ${kind} cannot be declared ${parent ? `in the ${parent.kind} \`${parent.path}\`` : "at the model's root"}.`,
      /** `edit.id-conflict`. */
      pathExists: (path: string) => `\`${path}\` already exists.`,
      /** `edit.id-conflict`. */
      relationExists: (id: string) => `\`${id}\` is already a relation of the model.`,
      /** `edit.invalid-value`. */
      keepsId: "A relation keeps its id once named; rename it instead.",
      /** `edit.has-dependents`: the statements and views that go with the relation. */
      removingRelation: (key: string, count: number) =>
        `Removing \`${key}\` from the model also touches ${count} ${count === 1 ? "statement or view" : "statements or views"}.`,
      /** `edit.unsafe-target`. */
      endUnreadable: (key: string) => `The end of \`${key}\` cannot be read.`,
    },

    /** Stories, their scenes and actions. */
    stories: {
      /** `edit.unsafe-target`: with the stories of the file. */
      missing: (id: string, stories: readonly string[]) =>
        `There is no story \`${id}\`${stories.length > 0 ? `; stories: ${stories.map((s) => `\`${s}\``).join(", ")}` : ""}.`,
      /** `edit.unsafe-target`. */
      noScene: (story: string, id: string) => `Story \`${story}\` has no scene \`${id}\`.`,
      /** `edit.unsafe-target`: the index of a scene, from 0. */
      noSceneAt: (story: string, index: number | undefined) =>
        `Story \`${story}\` has no scene ${index ?? ""}.`,
      /** `edit.unsafe-target`: the path of indexes of an action. */
      noAction: (scene: string, path: readonly number[]) =>
        `Scene \`${scene}\` has no action at [${path.join(", ")}].`,
      /** `edit.invalid-value`. */
      timeRange: (max: number) => `Story times run from 0 to ${max} milliseconds.`,
      /** `edit.unsafe-target`. */
      noTransition: (scene: string) => `Scene \`${scene}\` has no transition.`,
      /** `edit.invalid-value`. */
      cut: "A cut takes no time; make it a `fade` or a `morph` to time it.",
      /** `edit.invalid-value`. */
      parallel:
        "A `parallel` block lasts as long as its longest action; time one of its actions instead.",
      /** `edit.unsafe-target`. */
      sceneNoBlock: (scene: string) => `Scene \`${scene}\` has no block.`,
      /** `edit.invalid-value`. */
      holdTargets: "`hold` takes a time, not targets.",
      /** `edit.invalid-value`. */
      holdTime: "`hold` needs a time.",
      /** `edit.invalid-value`. */
      allActions: "Only `focus` and `camera` take `all`.",
      /** `edit.invalid-value`. */
      allTargets: "`all` replaces the targets.",
      /** `edit.invalid-value`. */
      needsTargets: (action: string) => `\`${action}\` needs targets.`,
      /** `edit.invalid-value`. */
      traceOne: "`trace` follows one relation.",
      /** `edit.unsafe-target`. */
      noTarget: (view: string, target: string) =>
        `\`${view}\` has no element or named relation \`${target}\`.`,
      /** `edit.invalid-value`. */
      traceRelation: (target: string) => `\`trace\` follows a relation; \`${target}\` is not one.`,
      /** `edit.invalid-id`. */
      invalidSceneId: (id: string) => `\`${id}\` is not a valid scene id.`,
      /** `edit.id-conflict`. */
      sceneExists: (story: string, id: string) =>
        `Story \`${story}\` already has a scene \`${id}\`.`,
      /** `edit.unsafe-target`. */
      noBody: (story: string) => `Story \`${story}\` has no body.`,
    },
  },

  /** The statements that depend on the target of an operation, as the delete dialog lists them. */
  dependents: {
    /**
     * A statement by its kind and the name it targets: a dependent kind (`relation`, `place`,
     * `style`, `constraint`…) or the kind of a nested entity (`container`).
     */
    statement: (kind: string, name: string, line: number) => `${kind} \`${name}\` on line ${line}`,
    /** The `include` or `exclude` list of a C4 view. */
    viewList: (keyword: string, view: string, line: number) =>
      `${keyword} in \`${view}\` on line ${line}`,
    /** A C4 view that draws a model relation about to be removed. */
    drawnIn: (relation: string, view: string, line: number) =>
      `\`${relation}\` drawn in the view \`${view}\` on line ${line}`,
    /** An entity a C4 view draws only for a relation about to be removed. */
    leavesView: (entity: string, view: string) =>
      `\`${entity}\` no longer drawn in the view \`${view}\``,
    /** The `link` of an element of another diagram. */
    link: (owner: string, line: number) => `link of \`${owner}\` on line ${line}`,
    /** An action of a story. */
    storyAction: (action: string, story: string, line: number) =>
      `\`${action}\` in story \`${story}\` on line ${line}`,
  },

  /** Notes of plans: what the person should know about an edit that was made. */
  notes: {
    /** A comment that names a renamed element. */
    commentMentions: (line: number, id: string) =>
      `The comment on line ${line} mentions \`${id}\` and was not changed.`,
    /** A comment removed with the statements it was in. */
    removedComment: (line: number, text: string) => `Removed the comment on line ${line}: ${text}`,
    /** An implicit element kept as a declaration when the relations that declared it go. */
    keptElement: (id: string, kind: string) =>
      `\`${id}\` was declared only by removed relations; it is kept as \`${kind} ${id}\`.`,
    /** The implicit ends of a removed relation, kept as declarations. */
    keptEnds: (ids: readonly string[]) =>
      `${ids.map((id) => `\`${id}\``).join(" and ")} ${ids.length === 1 ? "was" : "were"} declared only by the removed relation and ${ids.length === 1 ? "is" : "are"} kept declared.`,
    /** Links of other diagrams to an ungrouped group. */
    removedLinks: (count: number, group: string) =>
      `Removed ${count === 1 ? "the link" : `${count} links`} to \`${group}\` from other diagrams.`,
  },
};
