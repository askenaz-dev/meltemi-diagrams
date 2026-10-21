import type { AlignEdge } from "@meltemi/diagrams-model";

/** What cuts a label in the label audit: its own shape, the label behind it, or the picture. */
export type CutBy = "shape" | "background" | "picture";

/** What a label lies on in the label audit. An owner of `null` is the frame. */
export type LabelObstacle =
  | { readonly kind: "text"; readonly owner: string | null; readonly text: string }
  | { readonly kind: "box" | "connector"; readonly owner: string };

const ids = (values: readonly string[]) => values.map((id) => `\`${id}\``).join(", ");
const subject = (owner: string | null) => (owner === null ? "the frame" : `\`${owner}\``);

/**
 * The layout's words in English. `drawing` holds the words the layout adds to drawings, which are
 * content: they are read only in the content language a caller passes (`drawingWords`). The other
 * groups are what the layout says about the person's text, written in the interface language when
 * a diagnostic is made. Sentences with values are functions, so each language builds its own
 * grammar; code in them (keywords, ids, samples) stays as written.
 */
export const en = {
  /** The type lines of C4 entities, drawn under their names, and the titles of boundaries. */
  drawing: {
    c4: {
      person: "Person",
      system: "Software System",
      container: "Container",
      component: "Component",
      externalPerson: "External Person",
      externalSystem: "External Software System",
      externalContainer: "External Container",
      externalComponent: "External Component",
    },
  },
  /** The messages of the layout's diagnostics; the code of each is in its comment. */
  diagnostics: {
    /** `layout.overlap`: two boxes of the same layer. */
    overlap: (a: string, b: string) => `\`${a}\` and \`${b}\` overlap.`,
    /** `layout.overlap`: a box out of the group that declares it. */
    crossesGroup: (shape: string, group: string) =>
      `\`${shape}\` crosses the edge of its group \`${group}\`.`,
    /** `layout.overlap`: a box on a group that does not declare it. */
    overlapsGroup: (shape: string, group: string) =>
      `\`${shape}\` overlaps the group \`${group}\`, which does not declare it.`,
    /** `layout.container-margin`. */
    containerMargin: (shape: string, group: string) =>
      `\`${shape}\` is too close to the edge or title band of its group \`${group}\`.`,
    /** `layout.label-under-connector`: the relation whose label it is, the connector it lies on. */
    labelUnderConnector: (label: string, connector: string) =>
      `The label of \`${label}\` lies on the connector of \`${connector}\`.`,
    /** `layout.connector-overlap`: two relations and the length they share, in pixels. */
    connectorOverlap: (a: string, b: string, length: number) =>
      `The connectors of \`${a}\` and \`${b}\` run along each other for ${length} px.`,
    /** `layout.connector-crossing`: a relation and the box it runs through. */
    connectorCrossing: (relation: string, box: string) =>
      `The connector of \`${relation}\` runs through \`${box}\`.`,
    /** `layout.label-cut`: a text (shortened), its owner, how far it goes beyond, and what. */
    labelCut: (text: string, owner: string | null, overflow: number, by: CutBy) =>
      `The text "${text}" of ${subject(owner)} goes ${overflow} px beyond ${
        by === "picture" ? "the picture" : by === "background" ? "its label" : "its shape"
      }.`,
    /** `layout.label-overlap`: a text (shortened), its owner, and what it lies on. */
    labelOverlap: (text: string, owner: string | null, other: LabelObstacle) =>
      `The text "${text}" of ${subject(owner)} overlaps ${
        other.kind === "text"
          ? `the text "${other.text}" of ${subject(other.owner)}`
          : other.kind === "box"
            ? `the box of \`${other.owner}\``
            : `the connector of \`${other.owner}\``
      }.`,
    /** `layout.unknown-theme`: the name written and the theme drawn instead. */
    unknownTheme: (written: string, fallback: string) =>
      `Unknown theme "${written}"; rendering with ${fallback}.`,
    /** `layout.missing-placement`: a group of a free diagram without `place`. */
    groupWithoutPlace: (group: string) =>
      `Group \`${group}\` has no \`place\` statement; in free diagrams the places of its children are relative to its interior.`,
    /** `layout.missing-placement`: an element of a `layout manual` diagram without `place`. */
    elementWithoutPlace: (element: string) =>
      `\`${element}\` has no \`place\` statement; \`layout manual\` needs a position for every element.`,
    /** `layout.missing-placement`: a group with only one of `place` and `size`. */
    groupHalfPlaced: (group: string, written: "place" | "size") =>
      `Group \`${group}\` has ${written === "place" ? "a `place` but no `size`" : "a `size` but no `place`"}; give both, or neither to fit its children.`,
    /** `layout.missing-placement`: a group with nothing to fit and no place or size. */
    groupUnplaced: (group: string) =>
      `Group \`${group}\` has no placed children and no \`place\`/\`size\` of its own.`,
    /** `layout.mode-unsupported`: the mode and the elements that are not placed. */
    modeUnsupported: (mode: string, elements: readonly string[]) =>
      `\`layout ${mode}\` needs a layout engine to position ${ids(elements)}.`,
    /** `layout.placement-ignored`. */
    placementIgnored:
      "`layout auto` arranges every element, so `place` statements and route waypoints are ignored.",
    /** `layout.image-unavailable`: the path written and the image object. */
    imageUnavailable: (source: string, element: string) =>
      `The image "${source}" of \`${element}\` cannot be drawn; a placeholder is drawn instead.`,
    /** `layout.icon-missing`: an element drawn as its icon (`shape icon`) without one. */
    iconMissing: (element: string) =>
      `\`${element}\` is drawn as its icon, but it has no \`icon\`; a placeholder is drawn instead.`,
    /** `layout.label-position-ignored`: an element whose icon is not the centre piece. */
    labelPositionIgnored: (element: string) =>
      `The \`labelPosition\` of \`${element}\` has no effect: its icon is not the centre piece.`,
    /**
     * `layout.label-position-ignored` of a `labelPosition` the theme gives: the first element it
     * styles. Reported once, when no element it styles has its icon as the centre piece.
     */
    labelPositionIgnoredByTheme: (element: string) =>
      `The \`labelPosition\` the theme gives \`${element}\` and the elements styled like it has no effect: none has its icon as the centre piece.`,
    /**
     * `layout.text-overflow` of an icon shape whose written size leaves its icon under its least
     * size: the element, its size and the size that holds the icon.
     */
    iconTooSmall: (
      element: string,
      width: number,
      height: number,
      needsWidth: number,
      needsHeight: number,
    ) =>
      `\`${element}\` is ${width} × ${height} px, too small to draw its icon: it needs ${needsWidth} × ${needsHeight} px.`,
    /** `layout.engine-failed`: the engine's name and its own words, which end the sentence. */
    engineFailed: (engine: string, reason: string) =>
      `The ${engine} layout engine failed: ${reason}`,
    /**
     * `layout.constraint-conflict` of `align`, `row` and `column`: the constraint, its elements,
     * the edge, the element furthest off, by how many pixels, and the first element.
     */
    alignConflict: (
      kind: string,
      elements: readonly string[],
      edge: AlignEdge,
      worst: string,
      off: number,
      first: string,
    ) =>
      `\`${kind}\` cannot hold for ${ids(elements)}: the ${edge} of \`${worst}\` is ${off} px off \`${first}\`.`,
    /** `layout.constraint-conflict` of `order`: the element out of order and the one before it. */
    orderConflict: (
      elements: readonly string[],
      current: string,
      axis: "x" | "y",
      previous: string,
    ) =>
      `\`order\` cannot hold for ${ids(elements)}: \`${current}\` is not ${axis === "x" ? "right of" : "below"} \`${previous}\`.`,
    /** `layout.constraint-conflict` of `distance`: the gap there is and the one asked for. */
    distanceConflict: (a: string, b: string, gap: number, distance: number) =>
      `\`distance\` cannot hold: \`${a}\` and \`${b}\` are ${gap} px apart, less than ${distance} px.`,
    /** `layout.unmeasured-font`: fonts that are not bundled and characters no font covers. */
    unmeasuredFont: (fonts: readonly string[], characters: readonly string[]) => {
      const parts: string[] = [];
      if (fonts.length > 0) parts.push(`font ${ids(fonts)} is not bundled`);
      if (characters.length > 0) {
        const verb = characters.length === 1 ? "is" : "are";
        parts.push(`${characters.join(" ")} ${verb} not covered by the bundled fonts`);
      }
      return `Some text is measured with estimates: ${parts.join("; ")}.`;
    },
    /** `layout.too-large` of `preset document`. */
    tooWideForDocument: (width: number, max: number) =>
      `The content is ${width} px wide; \`preset document\` reads best up to ${max} px.`,
    /** `layout.too-large` of `preset slide`. */
    tooLargeForSlide: (width: number, height: number, slideWidth: number, slideHeight: number) =>
      `The content is ${width} × ${height} px; a slide is ${slideWidth} × ${slideHeight} px.`,
    /** `layout.too-large` of `canvas`. */
    tooLargeForCanvas: (width: number, height: number, canvasWidth: number, canvasHeight: number) =>
      `The content is ${width} × ${height} px; the canvas is ${canvasWidth} × ${canvasHeight} px.`,
    /** `layout.text-overflow`: the element, its width, the widest text and the width it needs. */
    textOverflow: (
      element: string,
      width: number,
      withIcon: boolean,
      text: string,
      needs: number,
    ) =>
      `\`${element}\` is ${width} px wide but ${withIcon ? "its icon and text" : "its text"} "${text}" needs ${needs} px.`,
    /**
     * `layout.text-overflow` of a shape whose text needs a taller box: the element, its size, the
     * widest text and the size it needs; only the heights when the width is enough.
     */
    textOverflowTall: (
      element: string,
      width: number,
      height: number,
      withIcon: boolean,
      text: string,
      needsWidth: number,
      needsHeight: number,
    ) =>
      `\`${element}\` is ${needsWidth === width ? `${height} px tall` : `${width} × ${height} px`} but ${withIcon ? "its icon and text" : "its text"} "${text}" needs ${needsWidth === width ? needsHeight : `${needsWidth} × ${needsHeight}`} px.`,
  },
  /** The hints of the layout's diagnostics. */
  hints: {
    /** `layout.label-cut` by the edge of the picture. */
    labelCutByPicture: "Give the diagram room: a larger `canvas`, or move the element inward.",
    /** `layout.label-cut` by a shape or a label. */
    labelCut: "Shorten the text, or give the element a `size` that fits it.",
    /** `layout.label-overlap` on a connector. */
    labelOnConnector:
      "Move one of them, give the connector a `route`, or place the label with `label <relation> at <n>%`.",
    /** `layout.label-overlap` on a text or a box. */
    labelOverlap: "Move one of them apart, or place the label with `label <relation> at <n>%`.",
    /** `layout.unknown-theme`: the built-in themes and those the file can name. */
    themes: (builtIn: readonly string[], inScope: readonly string[]) =>
      `Built-in themes: ${builtIn.join(", ")}${inScope.length > 0 ? `; themes in scope: ${inScope.join(", ")}` : ""}.`,
    /** `layout.missing-placement`. */
    addPlace: (id: string) => `Add \`place ${id} at (x, y)\` to a placement block.`,
    /** `layout.missing-placement` of a group without placed children. */
    addPlaceAndSize: (id: string) => `Add \`place ${id} at (x, y)\` and \`size ${id} (w, h)\`.`,
    /** `layout.mode-unsupported`. */
    engine:
      "Hosts pass an engine in `LayoutOptions.engine`; the command line uses ELK. Or place every element.",
    /** `layout.placement-ignored`. */
    assisted: "Use `layout assisted` to keep placed elements where they are.",
    /** `layout.image-unavailable` when the host reads images. */
    imageFile:
      "Check that the file exists in the project and is a PNG, JPEG, GIF, WebP or SVG image.",
    /** `layout.image-unavailable` when the host does not read images. */
    imageHost:
      "Hosts pass `LayoutOptions.images`; the command line and the editor read the project's images.",
    /** `layout.icon-missing`: the element, as code. */
    iconMissing: (element: string) =>
      `Give \`${element}\` an icon with \`style ${element} { icon "<pack>:<name>" }\`, or another shape.`,
    /** `layout.label-position-ignored`. */
    labelPositionIgnored:
      "Set `iconPosition center` or `shape icon` to put the label at an edge, or remove `labelPosition`.",
    /**
     * `layout.label-position-ignored` on kinds whose icon is never the centre piece: groups, tags,
     * notes, free texts, icons and images, sequence and C4 kinds.
     */
    labelPositionNeverUsed:
      "Remove `labelPosition`: it only places the label of a node, decision, data store or box whose icon is the centre piece.",
    /** `layout.label-position-ignored` of a `labelPosition` the theme gives. */
    labelPositionIgnoredByTheme:
      "Set `iconPosition center` or `shape icon` on the elements, or remove `labelPosition` from the theme.",
    /** `layout.text-overflow` of an icon shape too small for its icon: the size that holds it. */
    iconTooSmall: (element: string, width: number, height: number) =>
      `Use \`size ${element} (${width}, ${height})\`, or remove its \`size\` to draw the icon at its \`iconSize\`.`,
    /** `layout.constraint-conflict`. */
    constraint: "Placed elements never move; change a `place` or the constraint.",
    /** `layout.unmeasured-font`. */
    bundledFonts:
      "Bundled fonts: Inter, IBM Plex Sans and Cascadia Mono. Leave extra room with `size` if needed.",
    /** `layout.too-large`. */
    tooLarge:
      "Split the diagram into views or story scenes; text is never shrunk to fit the canvas.",
    /** `layout.text-overflow`: the size that fits, as code. */
    textOverflow: (element: string, width: number, height: number) =>
      `Use \`size ${element} (${width}, ${height})\`, or shorten the text.`,
    /** `layout.overlap` of a box declared before a box that holds it: the outer and inner boxes. */
    stackOrder: (outer: string, inner: string) =>
      `Declare \`${outer}\` before \`${inner}\` to draw a stack.`,
  },
};
