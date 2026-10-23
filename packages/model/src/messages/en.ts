/** Code inside a sentence: `text`. */
const code = (text: string) => `\`${text}\``;

/** `a style`, `an element`. */
const article = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

/** Where each entity kind of a model belongs, for `model.invalid-nesting`. */
const HOMES: Readonly<Record<string, string>> = {
  person: "at the model's root",
  system: "at the model's root",
  container: "in a system",
  datastore: "in a system",
  component: "in a container",
};

/** An entity that holds a statement: its kind and path. */
export interface Parent {
  readonly kind: string;
  readonly path: string;
}

/**
 * The words of compilation: the messages of the diagnostics of `compile()` (diagrams, models,
 * themes, stories and export profiles), their hints and related notes, and the problems of the
 * diagram types plugins declare. Code in them (keywords, values, ids and samples) stays as written
 * in every language.
 */
export const en = {
  /** Pieces that messages put together. */
  words: {
    /** How a message names a tuple or a list it did not expect. */
    tuple: "a tuple",
    list: "a list",
    /** The values a property takes, completing "`<name>` expects …" and "needs a value: …". */
    spec: {
      oneOf: (values: readonly (string | number)[]) => `one of ${values.join(", ")}`,
      string: "a quoted string",
      color: "a quoted color",
      colorOrToken: "a quoted color or a color token",
      icon: 'an icon such as "tabler:server"',
      /** A time within limits, in milliseconds; no `max` for any length. */
      timeRange: (min: number, max: number | undefined) =>
        `a time from ${min} ms to ${max !== undefined ? `${max / 1000} s` : "any length"}, such as \`1200ms\``,
      time: "a time such as `1200ms`",
      repeatUpTo: (max: number) => `\`forever\` or a whole number from 1 to ${max}`,
      repeat: "`forever` or a positive whole number",
      /** A keyword such as `auto`, or a number within limits. */
      keywordOrNumber: (keywords: readonly string[], min: number, max: number) =>
        `${keywords.map(code).join(", ")} or a number from ${min} to ${max}`,
      numberRange: (min: number, max: number) => `a number from ${min} to ${max}`,
      size: (min: number, max: number) => `\`(width, height)\` with numbers from ${min} to ${max}`,
      classes: "one or more class ids",
      name: "a name",
      names: "one or more names",
      link: "a reference `<diagram>.<element>`",
      url: 'a quoted URL such as "https://example.com"',
    },
    /** The forms of a sequence note and of `choose`, which offer alternatives. */
    noteForm:
      '`note [<id>] over <p>[, <p>] "Text"`, `note [<id>] left of <p> "Text"` or `note [<id>] right of <p> "Text"`',
    chooseForm: '`choose <fragment> "<condition>"` or `choose <fragment> <n>`',
  },

  /** Messages of diagnostics, by the part of compilation that reports them. */
  diagnostics: {
    /** Messages several parts share. */
    common: {
      /** A statement that does not match its form, written as code. */
      expected: (form: string) => `Expected ${form}.`,
      singleBlock: (keyword: string) => `\`${keyword}\` takes a single block.`,
      needsOneBlock: (keyword: string, form: string) => `\`${keyword}\` needs one block: ${form}.`,
      takesNoBlock: (keyword: string) => `\`${keyword}\` takes no block.`,
      takesNoBlockExpected: (keyword: string, form: string) =>
        `\`${keyword}\` takes no block; expected ${form}.`,
      doesNotTakeBlock: (keyword: string) => `\`${keyword}\` does not take a block.`,
      takesNoValue: (keyword: string) => `\`${keyword}\` takes no value.`,
      expectsString: (name: string) => `\`${name}\` expects a quoted string.`,
      /** `prop.duplicate`. */
      setMoreThanOnce: (name: string) => `\`${name}\` is set more than once.`,
      /** `ref.unknown-element`. */
      unknownElement: (id: string) => `Unknown element \`${id}\`.`,
      /** `ref.unknown-entity`. */
      unknownEntity: (path: string, model: string) =>
        `Unknown entity \`${path}\` in the model \`${model}\`.`,
      /** `placement.unknown-port`. */
      unknownPort: (element: string, port: string) => `\`${element}\` has no port \`${port}\`.`,
    },

    /** The file: top-level blocks, imports, models of views, links and limits. */
    compile: {
      /** `ref.duplicate-id`. */
      duplicateTopLevelId: (id: string) =>
        `\`${id}\` is already used by another top-level block in this file.`,
      /** `language.unsupported-version`. */
      unsupportedVersion: (version: string, supported: string) =>
        `Language version "${version}" is not supported; this compiler implements ${supported}.`,
      /** `profile.unknown`. */
      unknownDiagramType: (type: string, types: readonly string[]) =>
        `Unknown diagram type \`${type}\`; expected one of ${types.join(", ")}.`,
      /** `ref.unknown-model`. */
      viewWithoutModel: "A c4 view names its model: `diagram <id>: c4 using <model> { }`.",
      unknownModel: (name: string) => `Unknown model \`${name}\`.`,
      /** `limit.too-complex`: what is counted is `elements`, `relations` or `events`. */
      tooComplex: (id: string, count: number, what: string, limit: number) =>
        `\`${id}\` has ${count} ${what}; a diagram may have at most ${limit}.`,
      /** `limit.too-large`. */
      tooLarge: (characters: number, limit: number) =>
        `The file has ${characters} characters; a .meltemi file may have at most ${limit}.`,
      /** `ref.unknown-link`. */
      linkNamesModel: (link: string) =>
        `\`${link}\` names a model; a link names one of its entities, such as \`link ${link}.<entity>\`.`,
      linkUnknownEntity: (model: string, path: string) =>
        `The model \`${model}\` has no entity \`${path}\`.`,
      linkDiagramShape: (diagram: string) =>
        `A link to a diagram names one element: \`link ${diagram}.<element>\`.`,
      linkToItself: (link: string) =>
        `\`${link}\` points to this diagram; links point to elements of other diagrams.`,
      linkUnknownElement: (diagram: string, element: string) =>
        `\`${diagram}\` has no element \`${element}\`.`,
      linkNamespace: (namespace: string) =>
        `\`${namespace}\` is a namespace; write \`link ${namespace}.<diagram>.<element>\` or \`link ${namespace}.<model>.<entity>\`.`,
      linkUnknownTarget: (name: string, link: string) =>
        `Unknown diagram or model \`${name}\` in the link \`${link}\`.`,
    },

    /** Flow and free diagrams, and what sequence diagrams and C4 views share with them. */
    flow: {
      /** `type.missing-property`: the kind's label, as its type declares it. */
      missingProperty: (label: string, id: string, name: string) =>
        `${label} \`${id}\` needs \`${name}\`.`,
      /** `type.relation-not-allowed`: the type's title. */
      relationNotAllowed: (title: string, from: string, to: string) =>
        `${title} diagrams do not allow relations from \`${from}\` to \`${to}\`.`,
      /** `asset.outside-project`. */
      imageEmpty: "An image path cannot be empty.",
      imageAbsolute: (path: string) =>
        `Image paths are relative to the file; \`${path}\` is absolute.`,
      imageUrl: (path: string) => `Image paths are files of the project; \`${path}\` is a URL.`,
      imageBackslash: (path: string) => `Image paths use \`/\` between folders: \`${path}\`.`,
      /** `prop.unknown`. */
      unknownInGroup: (keyword: string) => `Unknown statement \`${keyword}\` in a group.`,
      /** `prop.unknown`: the profile is `flow`, `free` or `sequence`. */
      unknownInDiagram: (keyword: string, profile: string) =>
        `Unknown statement \`${keyword}\` in a ${profile} diagram.`,
      /** The written text or source of an element: `icon`, `image` or `label`. */
      quotedSource: (source: string, id: string) =>
        `The ${source} of \`${id}\` must be a quoted string.`,
      /** `text`, `icon` or `image` without what it shows. */
      needsSource: (kind: string, id: string, form: string) =>
        `\`${kind} ${id}\` needs ${kind === "text" ? "its text" : kind === "icon" ? "an icon" : "an image path"}; expected ${form}.`,
      /** After the `text`, `icon`, `image` or `label` of a declaration. */
      valueAfter: (after: string, form: string) =>
        `Unexpected value after the ${after}; expected ${form}.`,
      /** `ref.duplicate-id`. */
      duplicateElement: (id: string) => `\`${id}\` is already declared in this diagram.`,
      builtInPort: (name: string) => `\`${name}\` is a built-in port; name the port differently.`,
      portSide: (name: string, sides: readonly string[]) =>
        `The side of port \`${name}\` must be one of ${sides.join(", ")}.`,
      portPosition: "The position of a port is a percentage from 0% to 100%.",
      unexpectedValue: (form: string) => `Unexpected value; expected ${form}.`,
      duplicatePort: (name: string) => `Port \`${name}\` is already declared here.`,
      setTwiceInGroup: (name: string) => `\`${name}\` is set twice for this group.`,
      relationIdUsedByElement: (id: string) =>
        `\`${id}\` is already used by an element in this diagram.`,
      relationIdUsed: (id: string) => `\`${id}\` is already used by another relation.`,
      arrowUnavailable: (arrow: string, arrows: readonly string[]) =>
        `\`${arrow}\` is not available here; write ${arrows
          .slice(0, -1)
          .map(code)
          .join(", ")} or ${code(arrows[arrows.length - 1]!)}.`,
      relationAsEndpoint: (name: string) =>
        `\`${name}\` is a relation, not an element; relation endpoints must be elements.`,
      setMoreThanOnceInDiagram: (name: string) =>
        `\`${name}\` is set more than once in this diagram.`,
      canvasConflict: (name: string, other: string) =>
        `\`${name}\` cannot be combined with \`${other}\`; a diagram has one canvas.`,
      layersEmpty: "`layers` needs one or more layer names, back to front.",
      /** The argument as messages describe it. */
      invalidLayer: (arg: string) => `Invalid layer ${arg}; expected a name.`,
      layerTwice: (name: string) => `Layer \`${name}\` is listed twice.`,
      /** `ref.unknown-layer`. */
      unknownLayer: (name: string) => `Unknown layer \`${name}\`.`,
      placementArguments: "`placement` takes no arguments.",
      placementBlock: "`placement` needs one block: `placement { ... }`.",
      relationsInPlacement: "Relations are not allowed inside `placement`.",
      declarationsInPlacement: "Declarations are not allowed inside `placement`.",
      unknownPlacement: (keyword: string) => `Unknown placement statement \`${keyword}\`.`,
      noBlock: (keyword: string, form: string) =>
        `\`${keyword}\` does not take a block; expected ${form}.`,
      /** `placement.duplicate`. */
      duplicatePlacement: (target: string, statement: string) =>
        `\`${target}\` already has a \`${statement}\` statement.`,
      position: "Expected a position `(x, y)` with two plain numbers.",
      size: "Expected a size `(width, height)` with two positive numbers.",
      viaList: "Expected a list of points after `via`, such as `[(520, 180)]`.",
      waypoint: "Each waypoint must be a point `(x, y)` with two plain numbers.",
      /** `placement.route-mismatch`. */
      routeStart: (relation: string, source: string, start: string) =>
        `The route of \`${relation}\` must start at \`${source}\`, the source of the relation, but starts at \`${start}\`.`,
      routeEnd: (relation: string, target: string, end: string) =>
        `The route of \`${relation}\` must end at \`${target}\`, the target of the relation, but ends at \`${end}\`.`,
      endpointShape: (ref: string) => `Expected \`<element>.<port>\` but found \`${ref}\`.`,
      /** A percentage after a route end that is not a compass side. */
      endPosition: (ref: string, element: string) =>
        `A position goes after a compass side, such as \`${element}.east 50%\`; \`${ref}\` is not one.`,
      /** A route end's position outside 0..100. */
      endPositionRange: "The position of a route end is a percentage from 0% to 100%.",
      alignEdge: (edges: readonly string[]) =>
        `\`align\` needs an edge after the elements: one of ${edges.join(", ")}.`,
      distanceGap: "`distance` needs a positive minimum gap in pixels after the two elements.",
      constraintGroup: (id: string) =>
        `\`${id}\` is a group; constraints apply to boxes, notes and tags.`,
      constraintTwice: (id: string) => `\`${id}\` appears twice in this constraint.`,
      constraintCount: (kind: string, exactlyTwo: boolean) =>
        `\`${kind}\` needs ${exactlyTwo ? "exactly two" : "two or more"} elements.`,
      labelPosition: "Expected a position along the route as a percentage, such as `50%`.",
      labelOutside: (at: string) => `Label position \`${at}\` is outside 0% to 100%.`,
      offset: "Expected an offset `(dx, dy)` with two plain numbers.",
      relationNotElement: (name: string, statement: string) =>
        `\`${name}\` is a relation; \`${statement}\` needs an element.`,
      /** `ref.unknown-relation`. */
      elementNotRelation: (name: string, statement: string) =>
        `\`${name}\` is an element; \`${statement}\` needs a relation.`,
      unknownRelation: (name: string) => `Unknown relation \`${name}\`.`,
      notForTargets: (name: string, relations: boolean, target: string) =>
        `\`${name}\` does not apply to ${relations ? "relations" : "elements"} such as \`${target}\`.`,
      /** `animate.conflict`. */
      effectConflict: (target: string, effect: string) =>
        `\`${target}\` already has a \`${effect}\` effect; one target takes one effect of each kind.`,
      alreadySetFor: (name: string, target: string) =>
        `\`${name}\` is already set for \`${target}\`.`,
      /** `animate.missing-effect`. */
      missingEffect: "An `animate` block needs an `effect`: `flow`, `pulse`, `dash` or `trace`.",
      effectProperty: (name: string, effects: readonly string[], effect: string) =>
        `\`${name}\` applies to ${effects.map(code).join(" and ")} effects, not to \`${effect}\`.`,
      /** `animate.invalid-target`. */
      flowTarget:
        "Flow particles run along relations; name the relation (`a -> b as r`) and animate it.",
      traceTarget:
        "A trace runs along relations; name the relation (`a -> b as r`) and animate it.",
      dashOnEvent: "A moving dash runs along relations and the outlines of boxes.",
      /** An element kind drawn without an outline, such as `note`. */
      dashWithoutOutline: (target: string, kind: string) =>
        `\`${target}\` is a ${kind} without an outline; a moving dash needs a line or a box.`,
      unknownTarget: (name: string) => `Unknown element or relation \`${name}\`.`,
    },

    /** Values of properties, property blocks, classes and rules. */
    values: {
      /** The argument as messages describe it. */
      invalidEnum: (arg: string, name: string, values: readonly string[]) =>
        `Invalid value ${arg} for \`${name}\`; expected one of ${values.join(", ")}.`,
      notColorToken: (word: string) => `\`${word}\` is not a color token.`,
      /** What the property takes, from `words.spec`. */
      expects: (name: string, spec: string) => `\`${name}\` expects ${spec}.`,
      expectsIcon: (name: string) =>
        `\`${name}\` expects an icon reference such as "tabler:server".`,
      timeUnit: (name: string) => `\`${name}\` needs a time unit.`,
      expectsTime: (name: string) =>
        `\`${name}\` expects a positive time such as \`1200ms\` or \`1.2s\`.`,
      classNoBlock: "`class` here applies classes and takes no block.",
      classEmpty: "`class` needs one or more class ids.",
      invalidClass: (arg: string) => `Invalid class ${arg}; expected a class id.`,
      needsValue: (name: string, spec: string) => `\`${name}\` needs a value: ${spec}.`,
      oneValue: (name: string) => `\`${name}\` takes one value; remove the extra value.`,
      /** The owner of a block: `element`, `relation`, `style`, `animate`, `class` or `rule`. */
      onlyProperties: (owner: string) => `Only properties are allowed in ${article(owner)} block.`,
      unknownProperty: (name: string, owner: string) =>
        `Unknown property \`${name}\` in ${article(owner)} block.`,
      freeOnly: (name: string) => `\`${name}\` applies to free diagrams only.`,
      /** `shape` on a kind that draws its own shape (or on relations), and the target when named. */
      shapeNotFor: (kind: string, target: string | null) =>
        `\`shape\` does not apply to ${kind === "relation" ? "relations" : `\`${kind}\` elements`}${target === null ? "" : ` such as \`${target}\``}; it applies to \`node\` and \`box\` elements.`,
      /** `rotation` on a kind it does not turn (groups), in a style statement or a rule. */
      rotationNotFor: (kind: string, target: string | null) =>
        `\`rotation\` does not turn \`${kind}\` elements${target === null ? "" : ` such as \`${target}\``}; it turns the other elements of flow diagrams and free compositions.`,
      /** `rotation` in a sequence diagram or a C4 view. */
      rotationInProfile: (profile: string) =>
        `\`rotation\` turns the elements of flow diagrams and free compositions; ${profile === "c4" ? "C4 views draw" : `${profile} diagrams draw`} theirs upright.`,
      /** `shape` in a class or rule of a profile without nodes or boxes (`sequence`, `c4`). */
      shapeInProfile: (profile: string) =>
        `\`shape\` applies to \`node\` and \`box\` elements; ${profile === "c4" ? "C4 views draw" : `${profile} diagrams draw`} each kind with its own shape.`,
      duplicateClass: (id: string) => `Class \`${id}\` is already declared here.`,
      ruleShape: "Expected `rule <kind> { ... }`.",
      invalidRuleKind: (arg: string, kinds: readonly string[]) =>
        `Invalid rule kind ${arg}; expected one of ${kinds.join(", ")}.`,
      ruleBlock: (kind: string) => `\`rule ${kind}\` needs one block.`,
      /** The profiles whose rules take the kind (`flow`, `free`, `sequence`), and this one. */
      ruleProfile: (kind: string, profiles: readonly string[], profile: string) =>
        `\`${kind}\` elements belong to ${profiles.join(" and ")} diagrams; this is a ${profile} diagram.`,
      ruleNotFor: (name: string, kind: string) =>
        `\`${name}\` does not apply to ${kind === "relation" ? "relations" : `\`${kind}\` elements`}.`,
      ruleAlreadySet: (name: string, kind: string) =>
        `\`${name}\` is already set for \`${kind}\` by another rule.`,
    },

    /** Theme blocks and their bases. */
    theme: {
      onlyTokens: "Only tokens, classes and rules are allowed in a theme block.",
      unknownToken: (name: string) => `Unknown theme token \`${name}\`.`,
      /** `theme.unknown-base`. */
      unknownBase: (id: string, base: string) =>
        `Theme \`${id}\` extends "${base}", which is neither built in nor defined in this file.`,
      /** `theme.cycle`. */
      cycle: (id: string) => `Theme \`${id}\` inherits from itself through \`extends\`.`,
    },

    /** C4 views: levels are `context`, `container` and `component`; kinds are the entities'. */
    c4: {
      notDrawn: (path: string) => `\`${path}\` is not drawn in this view.`,
      /** `c4.invalid-level`. */
      invalidLevel: "Expected `level context`, `level container` or `level component`.",
      missingLevel: "A c4 view needs `level context`, `level container` or `level component`.",
      /** `include` or `exclude`. */
      listTwice: (which: string) =>
        `\`${which}\` is written more than once; list every entity in one statement.`,
      listShape: (which: string) => `Expected \`${which} <entity>, <entity>...\`.`,
      listByPath: (which: string) =>
        `\`${which}\` lists entities by their path, such as \`shop.api\`.`,
      listedTwice: (path: string, which: string) => `\`${path}\` appears twice in \`${which}\`.`,
      /** `c4.out-of-level`. */
      scopeIncluded: (path: string, level: string) =>
        `\`${path}\` is the scope of this view; it is drawn as the boundary of its ${level === "container" ? "containers" : "components"}.`,
      outOfLevel: (level: string, kind: string, path: string) =>
        `A ${level} view does not draw the ${kind} \`${path}\`.`,
      viewDeclares: "Views draw the model's entities; they declare none.",
      unknownInView: (keyword: string) => `Unknown statement \`${keyword}\` in a c4 view.`,
      /** `c4.scope-required`. */
      scopeRequired: (level: string) =>
        `A ${level} view needs a scope: the ${level === "container" ? "system" : "container"} it opens.`,
      scopeShape: "Expected `scope <entity>`, such as `scope shop`.",
      /** `c4.invalid-scope`. */
      datastoreScope: (path: string) =>
        `\`${path}\` is a datastore; datastores have no components.`,
      invalidScope: (level: string, expected: string, path: string, kind: string) =>
        `The scope of a ${level} view is a ${expected}; \`${path}\` is a ${kind}.`,
      alreadyCombined: (from: string, to: string) =>
        `\`${from} -> ${to}\` is already combined by another relation of this view.`,
      relationIdUsed: (id: string) =>
        `\`${id}\` is already used by a relation of the model or this view.`,
      /** `c4.unsupported-relation`. */
      unsupportedRelation: (from: string, to: string) =>
        `No relation of the model goes from \`${from}\` to \`${to}\`; a view draws no arrow for convenience.`,
      labelShape:
        'Expected `label <entity-or-relation> "Text"`; in `placement`, `label <relation> at <n>%` moves a label.',
      labelTwice: (path: string) => `\`${path}\` already has a local label.`,
    },

    /** Architecture models: entities and their relations. */
    model: {
      brackets: "Model entities are declared with their kind, not with brackets.",
      unknownStatement: (keyword: string, parent: Parent | null) =>
        `Unknown statement \`${keyword}\` in ${parent ? `the ${parent.kind} \`${parent.path}\`` : "a model"}.`,
      /** `model.invalid-nesting`. */
      invalidNesting: (kind: string, parent: Parent | null) =>
        `A ${kind} cannot be declared ${parent ? `in the ${parent.kind} \`${parent.path}\`` : "at the model's root"}; ${kind}s belong ${HOMES[kind] ?? ""}.`,
      duplicateEntity: (path: string) => `\`${path}\` is already declared in this model.`,
      external: "`external` marks persons and systems outside the organisation.",
      /** `description`, `technology` or `url` without a string, with a sample. */
      quotedExample: (word: string) =>
        `\`${word}\` expects a quoted string, such as \`${word} "${word === "technology" ? "PostgreSQL" : word === "url" ? "https://example.com" : "What it does"}"\`.`,
      url: "`url` takes an `https:`, `http:` or `mailto:` URL, or a relative one.",
      arrow: "Model relations are written with `->`.",
      /** `model.invalid-relation`. */
      selfRelation: (from: string) =>
        `A relation from \`${from}\` to itself says nothing in a model.`,
      nestedRelation: (from: string, to: string) =>
        `\`${from}\` and \`${to}\` are nested in each other; a relation connects separate entities.`,
      relationIdUsed: (id: string) => `\`${id}\` is already used by another relation of the model.`,
      unknownInRelation: (word: string) => `Unknown statement \`${word}\` in a model relation.`,
    },

    /** Sequence diagrams: participants, events, fragments and scenarios. */
    sequence: {
      groupHoldsParticipants:
        "Participant groups hold participant declarations; events go at the diagram level or in fragments.",
      groupEnd: (end: string) =>
        `\`${end}\` is a participant group; messages go between participants.`,
      idUsed: (name: string) => `\`${name}\` is already used in this diagram.`,
      unknownParticipant: (id: string) => `Unknown participant \`${id}\`.`,
      participantGroup: (id: string) => `\`${id}\` is a participant group.`,
      participantsAtTop: "Participants are declared at the diagram level, not inside fragments.",
      unknownInFragment: (keyword: string) => `Unknown statement \`${keyword}\` in a fragment.`,
      divider: 'Expected `divider "Label"`.',
      delay: 'Expected `delay` or `delay "Label"`.',
      /** `left` or `right`. */
      noteSide: (position: string) => `Expected \`${position} of <participant>\`.`,
      noteText: (form: string) => `A note needs its text; expected ${form}.`,
      noteParticipant: (form: string) => `A note needs a participant; expected ${form}.`,
      oneParticipant: (position: string) => `\`${position} of\` takes one participant.`,
      invalidParticipant: (arg: string) => `Invalid participant ${arg}.`,
      branchKeyword: (operator: string, branch: string, written: string) =>
        `\`${operator}\` continues with \`${branch}\`, not \`${written}\`.`,
      needsBlock: (keyword: string) => `\`${keyword}\` needs a block.`,
      /** `sequence.lifecycle`. */
      destroyedBeforeMessage: (participant: string) =>
        `\`${participant}\` was destroyed before this message.`,
      destroyedBeforeEvent: (participant: string) =>
        `\`${participant}\` was destroyed before this event.`,
      destroyedBeforeNote: (participant: string) =>
        `\`${participant}\` was destroyed before this note.`,
      createdTwice: (participant: string) => `\`${participant}\` is created twice.`,
      createAfterUse: (participant: string) =>
        `\`${participant}\` already took part in the sequence; \`create\` comes before its first event.`,
      destroyedTwice: (participant: string) => `\`${participant}\` is destroyed twice.`,
      /** `sequence.activation`. */
      notActive: (participant: string) => `\`${participant}\` is not active here.`,
      placementStatement: (keyword: string) =>
        `\`${keyword}\` does not apply to sequence diagrams.`,
      pixels: (form: string) => `Expected ${form} with a number of pixels, 0 or more.`,
      unknownEvent: (id: string) => `Unknown event \`${id}\`.`,
      duplicateScenario: (id: string) => `Scenario \`${id}\` is already declared.`,
      scenarioStatements: "Scenarios hold `choose`, `repeat`, `skip` and `take`.",
      decidedTwice: (fragment: string) => `\`${fragment}\` is already decided in this scenario.`,
      /** `sequence.scenario`. */
      unknownFragment: (id: string) => `Unknown fragment \`${id}\`.`,
      choiceOperator: (kind: string, operator: string, id: string, operators: readonly string[]) =>
        `\`${kind}\` does not apply to the \`${operator}\` fragment \`${id}\`; it decides ${operators.map(code).join(" and ")} fragments.`,
      noBranch: (id: string, condition: string) => `\`${id}\` has no branch "${condition}".`,
      branchCount: (id: string, count: number) =>
        `\`${id}\` has ${count} branches; choose 1 to ${count}.`,
      loopCount: "A loop repeats 1 to 100 times in a scenario.",
    },

    /** Stories: scenes, actions, targets and times. */
    story: {
      /** `story.unknown-diagram`. */
      unknownDiagram: (name: string) => `There is no diagram \`${name}\` to tell a story about.`,
      namesDiagram: "A story names its diagram: `story <id> for <diagram> { }`.",
      /** `over` or `hold`. */
      time: (keyword: string) =>
        `\`${keyword}\` takes a time from \`0ms\` to \`600s\`, such as \`800ms\`.`,
      contents: "A story holds `title`, `description` and `scene` blocks.",
      notStoryStatement: (word: string) =>
        `\`${word}\` is not a story statement; a story holds \`title\`, \`description\` and \`scene\` blocks.`,
      sceneShape: 'A scene is `scene <id> ["Title"] { … }`.',
      duplicateScene: (id: string) => `The story already has a scene \`${id}\`.`,
      sceneContents: "A scene holds `view`, `transition` and actions.",
      viewFirst: "`view <diagram>` comes first in a scene and names one diagram.",
      transitionFirst:
        "`transition cut|fade|morph [over <time>]` comes before the scene's actions, once.",
      notAction: (word: string) => `\`${word}\` is not a story action.`,
      /** `story.missing-transition`. */
      missingTransition: (view: string) =>
        `The scene changes to \`${view}\`; say how with \`transition cut\`, \`fade\` or \`morph\`.`,
      /** `story.empty-scene`. */
      emptyScene: (id: string) => `The scene \`${id}\` has no actions and takes no time.`,
      afterOver: "Nothing follows the time of `over`.",
      hold: "`hold` takes one time, such as `hold 1s`.",
      parallel: "`parallel { … }` holds actions that start together.",
      namesTargets: (kind: string) => `\`${kind}\` names what it acts on, such as \`${kind} api\`.`,
      traceOne: "`trace` follows one relation; use `parallel` to trace several.",
      ids: (kind: string) => `\`${kind}\` takes ids separated by commas.`,
      /** `ref.unknown-element`. */
      unknownTarget: (view: string, id: string) =>
        `\`${view}\` has no element or named relation \`${id}\`.`,
      /** `story.invalid-target`. */
      traceTarget: (id: string, element: boolean) =>
        `\`trace\` follows a relation; \`${id}\` is ${element ? "an element" : "a note or fragment"}.`,
      /** `story.conflict`: the channel is `visibility`, `highlight`, `trace`, `focus` or `camera`. */
      conflict: (action: string, channel: string, target: string) =>
        `\`${action}\` overlaps an earlier action on the same ${channel} of \`${target}\`.`,
    },

    /** Export profiles. */
    export: {
      /** `export.unknown-target`. */
      namesTarget: "A profile names what it exports: `export <id> for <diagram-or-story> { }`.",
      unknownTarget: (name: string) => `There is no diagram or story \`${name}\` to export.`,
      options: "An export profile holds options such as `format png`.",
      notOption: (name: string) => `\`${name}\` is not an option of export profiles.`,
      oneValue: (name: string) => `\`${name}\` takes one value.`,
      fps: "`fps` takes a whole number from 1 to 60.",
      file: "`file` takes a path relative to this file, inside its folder, with `/` between folders.",
      /** `export.missing-format`. */
      missingFormat: (id: string, formats: readonly string[]) =>
        `The profile \`${id}\` needs a \`format\`: ${formats.join(", ")}.`,
      /** `export.invalid-option`. */
      notForFormat: (name: string, format: string, formats: readonly string[]) =>
        `\`${name}\` does not apply to ${format} exports; it applies to ${formats.join(", ")}.`,
      atWithMotion: "`at` writes one frame; it does not go with `motion animated`.",
      extension: (format: string, extension: string) =>
        `\`file\` of a ${format} export ends in \`.${extension}\`.`,
      storyMotion: "A story's export draws its frames; `motion` applies to diagrams.",
      storyScenario: "A story shows its own views; `scenario` applies to sequence diagrams.",
      atPastEnd: (duration: number) => `The story lasts ${duration} ms; \`at\` is within it.`,
      unknownScenario: (target: string, scenario: string, scenarios: readonly string[]) =>
        `\`${target}\` has no scenario \`${scenario}\`; its scenarios: ${scenarios.join(", ")}.`,
      noScenarios: (target: string) => `\`${target}\` has no scenarios.`,
    },
  },

  /** Hints of diagnostics, by the part of compilation that gives them. */
  hints: {
    /** A sample of code to write. */
    example: (sample: string) => `Example: \`${sample}\`.`,
    /** Close alternatives of an unknown name. */
    didYouMean: (candidates: readonly string[]) =>
      `Did you mean ${candidates.map(code).join(", ")}?`,

    compile: {
      version: (supported: string) => `Change the header to \`language "${supported}"\`.`,
      declareModel: "Declare `model <id> { … }` in this file, or import the file that declares it.",
      /** The models of the file, those imported by name, and the namespaces of imports. */
      models: (
        local: readonly string[],
        imported: readonly string[],
        namespaces: readonly string[],
      ) =>
        `Models: ${[...local, ...imported.map((b) => `${b} (imported)`), ...namespaces.map((n) => `${n}.<model>`)].join(", ")}.`,
      splitDiagram: "Split it into several diagrams; views of a model can share its entities.",
      splitFile: "Split it into several files that import each other.",
      elementsOf: (diagram: string, ids: readonly string[]) =>
        `Elements of \`${diagram}\`: ${ids.join(", ")}.`,
      diagramsAndModels: (names: readonly string[]) =>
        `Diagrams and models in this file: ${names.join(", ")}.`,
      linkTargets: "Link to a diagram or a model of this file, or of a file you import.",
    },

    flow: {
      /** The type's title, the property and the kind, as the type declares them. */
      requiredProperty: (title: string, name: string, kind: string) =>
        `${title} diagrams require \`${name}\` on every ${kind}.`,
      /** Pairs written `a -> b`. */
      allowedRelations: (pairs: readonly string[]) => `Allowed: ${pairs.join(", ") || "none"}.`,
      imagePath: 'Write a path relative to this file inside the project, such as "logo.png".',
      diagramLevel: (keyword: string) =>
        `\`${keyword}\` belongs at the diagram level, not inside a group.`,
      groupContents:
        "Groups contain element declarations, relations, nested groups, `description` and `url`.",
      /** The keyword, and the kind the profile's shorthand declares. */
      declareElement: (keyword: string, box: string) =>
        `Declare an element with \`${keyword}["Label"]\` or \`${box} ${keyword}\`.`,
      freeStatements:
        "Free diagrams accept `box`, `text`, `icon`, `image` and `group` declarations, relations, `direction`, `layout`, `theme`, `title`, `description`, `preset`, `canvas`, `routing`, `layers`, `placement`, `style`, `animate`, `class` and `rule`.",
      flowStatements:
        "Flow diagrams accept element declarations, relations, `direction`, `layout`, `theme`, `title`, `description`, `preset`, `canvas`, `routing`, `placement`, `style`, `animate`, `class` and `rule`.",
      freeDeclarations: "Free diagrams declare `box`, `text`, `icon`, `image` and `group`.",
      flowDeclarations: (keyword: string) =>
        `Flow diagrams declare \`node\`, \`decision\`, \`data\`, \`group\`, \`note\` and \`tag\`; \`${keyword}\` belongs to free diagrams.`,
      sharedNamespace: "Elements and relations share one namespace per diagram.",
      /** The statements an element or relation block accepts. */
      elementBlock: (words: readonly string[]) => blockAccepts("Element", words),
      relationBlock: (words: readonly string[]) => blockAccepts("Relation", words),
      compassPorts:
        "Compass ports (`north`, `south`, `east`, `west`) and `auto` need no declaration.",
      oneCanvas: "Keep either `preset` or `canvas (width, height)`.",
      qualifiedEndpoint:
        "Qualified references are not available in flow diagrams; use the element id. Ports belong in `route` statements.",
      layers: (layers: readonly string[]) => `Layers: ${layers.join(", ")}.`,
      declareLayer: (layers: readonly string[]) =>
        `Declare it with \`layers ${layers.join(", ")}\`.`,
      placementAccepts: (statements: readonly string[]) =>
        `A \`placement\` block accepts ${statements.map(code).join(", ")}.`,
      ports: (element: string, ports: readonly string[]) =>
        `Ports of \`${element}\`: ${ports.join(", ")}.`,
      constraintElements: "Constraints apply to elements declared in this diagram.",
      form: (form: string) => `Form: ${form}.`,
      declareFirst: (name: string) => `Declare it first, for example \`${name}["Label"]\`.`,
      nameRelation:
        "Anonymous relations need `as <id>` before they can be referenced, for example `a -> b as save`.",
      styleAccepts: (words: readonly string[]) =>
        `\`style\` blocks accept ${words.map(code).join(", ")}.`,
      animateAccepts: "`animate` blocks accept `effect`, `duration` and `repeat`.",
      mergeEffects: "Remove one of the statements, or merge their properties into one.",
      /** `style` or `animate`. */
      styleTargets: (kind: string) =>
        `\`${kind}\` targets an element or a relation named with \`as <id>\`.`,
    },

    values: {
      colorTokens: (tokens: readonly string[]) => `Color tokens: ${tokens.join(", ")}.`,
      cssColor: (name: string, word: string) => `Write \`${name} "${word}"\` for a CSS color.`,
      colorOrToken: (name: string) => `Example: \`${name} "#1f6feb"\` or \`${name} accent\`.`,
      iconForm: 'Icons are written as "<pack>:<name>".',
      timeUnit: "Add `ms` or `s`, for example `1200ms` or `1.2s`.",
      link: "Example: `link checkout.api`, or `link shop.checkout.api` through a namespace import.",
      url: "Links may use `https:`, `http:` or `mailto:`, or be relative to the exported file.",
      declareClasses: "Declare classes at the top level of a diagram or in a theme block.",
      /** Properties that apply only to elements, or only to relations. */
      appliesToElements: (name: string) => `\`${name}\` applies to elements.`,
      appliesToRelations: (name: string) => `\`${name}\` applies to relations.`,
      classesCannotApply: "Classes cannot apply other classes; list every class where it is used.",
      styleProperties: (names: readonly string[]) =>
        `Classes and rules accept ${names.map(code).join(", ")}.`,
      freeProperties:
        "Flow, sequence and C4 diagrams set text in the theme's type scale; free diagrams choose its size, weight and alignment.",
      applyClasses: "Apply classes inside element, relation or `style` blocks.",
      kinds: (kinds: readonly string[]) => `Kinds: ${kinds.join(", ")}.`,
    },

    theme: {
      tokens: (tokens: readonly string[]) =>
        `Theme tokens: ${tokens.join(", ")}; theme blocks also accept \`class <id> { }\` and \`rule <kind> { }\`.`,
      builtIn: (themes: readonly string[]) => `Built-in themes: ${themes.join(", ")}.`,
      cycle: "Make one theme of the chain extend a built-in theme instead.",
    },

    c4: {
      entityPath: "Entities are named by their path from the model's root, such as `shop.api`.",
      ports: (ports: readonly string[]) => `Ports: ${ports.join(", ")}.`,
      routeEnds: "Route ends are entities of the view, optionally with a port: `shop.api.east`.",
      nameEntity: "Name an entity of the view by its path, such as `shop.api`.",
      include: (path: string) => `Add it with \`include ${path}\`, or remove it from \`exclude\`.`,
      notAtLevel: (path: string, kind: string, level: string) =>
        `\`${path}\` is a ${kind}, which a ${level} view does not draw.`,
      removeScope: (path: string) => `Remove \`${path}\` from \`include\`.`,
      contextLevel: "Context views draw persons and software systems.",
      /** The scope's path, or null without one. */
      containerLevel: (scope: string | null) =>
        `Container views draw the containers and datastores of \`${scope ?? "the scope"}\`, persons and other systems.`,
      componentLevel: (scope: string | null) =>
        `Component views draw the components of \`${scope ?? "the scope"}\`, the other containers of its system, persons and other systems.`,
      declareInModel: (id: string, model: string) =>
        `Declare \`${id}\` in the model \`${model}\` and list it in \`include\`.`,
      entitiesInModel: (model: string) =>
        `Entities are declared in the model \`${model}\`; a view lists them in \`include\`.`,
      viewStatements:
        "C4 views accept `level`, `scope`, `include`, `exclude`, `label`, relations that combine model relations, `direction`, `layout`, `routing`, `theme`, `title`, `description`, `preset`, `canvas`, `placement`, `style`, `animate`, `class` and `rule`.",
      addLevel: "Add `level container` and `scope <system>` for a container view.",
      systemScope: "Add `scope <system>`, such as `scope shop`.",
      containerScope: "Add `scope <container>`, such as `scope shop.api`.",
      addToModel: "Add the relation to the model, or remove this one.",
      localLabel: "A local label names an entity or a relation drawn in this view.",
    },

    model: {
      kindNotBrackets: (id: string) => `Write \`container ${id} "Label"\` or another entity kind.`,
      /** The kind of the entity, and the words its block accepts besides relations. */
      blockAccepts: (kind: string, words: readonly string[]) =>
        `${kind[0]!.toUpperCase()}${kind.slice(1)} blocks accept ${words.map(code).join(", ")} and relations.`,
      modelAccepts:
        "Models declare `person` and `system` entities, with containers, datastores and components inside, and relations `a -> b`.",
      canDeclare: (kinds: readonly string[]) =>
        `Here you can declare ${kinds.map(code).join(" and ")}.`,
      holdsNothing: (kind: string) => `A ${kind} holds no entities.`,
      declareEntity:
        'Declare it in the model first, such as `container api "API"` inside a system.',
      dashed: "Replies and dashed lines belong to sequence and flow diagrams.",
      relationAccepts: "Model relations accept `technology`, `description` and `assumption`.",
    },

    sequence: {
      /** A declaration of the `free` or `flow` profile, and the participant kinds. */
      otherDeclaration: (keyword: string, profile: string, kinds: readonly string[]) =>
        `\`${keyword}\` belongs to ${profile} diagrams. Sequence diagrams declare ${kinds.map(code).join(", ")} and \`group\`.`,
      statements:
        "Sequence diagrams accept participants, `group`, messages, `activate`, `deactivate`, `create`, `destroy`, `note`, the fragments `alt`, `opt`, `loop`, `par`, `break`, `critical` and `region`, `divider`, `delay`, `title`, `description`, `theme`, `preset`, `canvas`, `autonumber`, `placement`, `style`, `animate`, `class`, `rule` and `scenario`.",
      sharedNamespace: "Elements, relations, notes and fragments share one namespace per diagram.",
      declareParticipant: (id: string) =>
        `Declare it first, for example \`participant ${id} "${id}"\`.`,
      fragmentContents: "Fragments hold messages and the other events, and nested fragments.",
      activate: (participant: string) =>
        `Add \`activate ${participant}\` before it, or remove this \`deactivate\`.`,
      placement:
        "Sequence diagrams keep the order of events: use `space <event> <n>`, `gap <participant> <n>` and `label <message> at <n>% offset (dx, dy)`.",
      spaceTarget:
        '`space` names a message with `as <id>`, or a note or fragment with an id, such as `alt check "OK" { }`.',
      namedFragments: (fragments: readonly { readonly id: string; readonly operator: string }[]) =>
        `Named fragments: ${fragments.map((f) => `\`${f.id}\` (${f.operator})`).join(", ")}.`,
      nameFragment: 'Name a fragment to decide it, such as `alt check "Approved" { }`.',
      branches: (conditions: readonly string[]) =>
        `Branches: ${conditions.map((c) => `"${c}"`).join(", ")}.`,
    },

    story: {
      diagrams: (names: readonly string[]) => `Diagrams: ${names.join(", ")}.`,
      declareDiagram: "Declare a diagram or import one.",
      actionsInScene: "Actions such as `reveal` go inside `scene <id> { … }`.",
      actions: "Actions: reveal, hide, highlight, focus, camera, trace, hold and parallel.",
      transition:
        "A change of composition between scenes needs an explicit transition, matched by id.",
      conflict:
        "Two actions on one property of a target must not run at the same time; move one out of the `parallel` block.",
    },

    export: {
      targets: (names: readonly string[]) => `Diagrams and stories: ${names.join(", ")}.`,
      declareTarget: "Declare a diagram or a story.",
      options: (names: readonly string[]) => `Options: ${names.join(", ")}.`,
      background: "`background transparent`, a quoted colour or a colour token.",
    },
  },

  /** Notes of related ranges. */
  related: {
    firstUsed: "First used here.",
    firstDeclared: "First declared here.",
    firstSet: "First set here.",
    firstOne: "First one here.",
    elementDeclared: "Element declared here.",
    firstEffect: "The first effect.",
    firstWritten: "First written here.",
    firstDecided: "First decided here.",
    firstScene: "The first scene.",
    earlierAction: "The earlier action.",
  },

  /**
   * Problems of a diagram type a plugin declares, reported as `plugin.invalid-manifest`. Each starts
   * with where it is (`where`, `kindWhere`, `relationsWhere`).
   */
  problems: {
    notObject: "A diagram type must be an object.",
    where: (type: string) => `diagram type \`${type}\``,
    kindWhere: (where: string, kind: string) => `${where}, kind \`${kind}\``,
    relationsWhere: (where: string) => `${where}, relations`,
    styleObject: (where: string) => `${where}: the style must be an object.`,
    styleWords: (where: string, name: string, words: readonly (string | number)[]) =>
      `${where}: \`${name}\` takes ${words.join(", ")}.`,
    styleColor: (where: string, name: string) =>
      `${where}: \`${name}\` takes a colour token such as "@accent" or a CSS colour.`,
    styleNumber: (where: string, name: string) => `${where}: \`${name}\` takes a number in range.`,
    styleIcon: (where: string) => `${where}: \`icon\` takes a reference such as "tabler:table".`,
    styleUnknown: (where: string, name: string) => `${where}: unknown style property \`${name}\`.`,
    propertiesObject: (where: string) => `${where}: \`properties\` must be an object.`,
    propertyName: (where: string, name: string) => `${where}: \`${name}\` cannot name a property.`,
    propertyKind: (where: string, name: string) =>
      `${where}: property \`${name}\` takes "string", "number", "boolean" or { "kind": "enum", "values": [...] }.`,
    enumValues: (where: string, name: string) =>
      `${where}: enum property \`${name}\` needs "values".`,
    typeWord: (where: string) =>
      `${where}: \`type\` must be a lower-case word that is not a word of the language.`,
    /** `mode`, `algorithm` or `direction` of the type's layout. */
    layoutValue: (where: string, key: string, values: readonly string[]) =>
      `${where}: layout \`${key}\` takes ${values.join(", ")}.`,
    noKinds: (where: string) => `${where}: \`elements\` must name at least one kind.`,
    kindWord: (where: string) =>
      `${where}: a kind must be a lower-case word that is not a word of the language.`,
    requiredUndeclared: (where: string, name: string) =>
      `${where}: required property \`${name}\` is not declared.`,
    allowedPairs: (where: string) =>
      `${where}: relations \`allowed\` must be a list of [from, to] pairs.`,
    /** The pair as JSON. */
    unknownPair: (where: string, pair: string) =>
      `${where}: relation pair ${pair} names an unknown kind.`,
    unknownTool: (where: string, kind: string) => `${where}: tool for unknown kind \`${kind}\`.`,
  },
};

/** `Element blocks accept `a`, `b` and `c`.` */
function blockAccepts(owner: string, words: readonly string[]): string {
  const accepted = words.map(code);
  return `${owner} blocks accept ${accepted.slice(0, -1).join(", ")} and ${accepted[accepted.length - 1]}.`;
}
