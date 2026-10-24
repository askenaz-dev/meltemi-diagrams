export const PACKAGE_NAME = "@meltemi/diagrams-layout";

export type * from "./scene.js";
export * from "./theme.js";
export * from "./geometry.js";
export * from "./markers.js";
export { strokeDash } from "./scene.js";
export { MELTEMI_MARK, MARK_GRADIENT_ID, markGradient, markGroup } from "./mark.js";
export { estimateTextWidth, splitLines } from "./text.js";
export {
  MIN_TEXT_MARGIN,
  TEXT_PADDING,
  TextMetrics,
  estimateMeasurer,
  type TextMeasurer,
} from "./measure.js";
export {
  c4TypeLine,
  c4TypeName,
  layoutDiagram,
  typeScale,
  DEFAULT_SIZES,
  DOCUMENT_MAX_WIDTH,
  PATTERN_SIZE,
  SLIDE_SIZE,
  type LayoutOptions,
  type LayoutResult,
  type ConnectorGeometry,
  type TypeScale,
} from "./layout.js";
export { StyleResolver, themeColor, type PatternKind, type ResolvedStyle } from "./styles.js";
export {
  CORNERED_POLYGONS,
  CORNERED_SHAPES,
  SHAPE_SIZES,
  boundaryToward,
  onOutline,
  onPolygon,
  pointInPolygon,
  pointInShape,
  segmentCrossesShape,
  shapeMagnets,
  shapeOutline,
  shapeTextArea,
  shapeTextCenter,
  turnPoint,
  turnedOutline,
  type BoxShape,
  type ShapeMagnet,
  type ShapeOptions,
  type ShapeOutline,
  type ShapeSize,
} from "./shapes.js";
export { groupHeaderOf, isUntitledGroup, type FrameTheme } from "./free.js";
export * from "./engine.js";
export { solveConstraints, type ConstraintConflict, type SolverBox } from "./constraints.js";
export { checkComposition, stacked, type CheckedConnector } from "./checks.js";
export { auditLabels, type LabelProblem, type PlacedText } from "./audit.js";
export {
  LANE_SPACING,
  anchorPoints,
  bezierThrough,
  orthogonalize,
  portPoint,
  type ConnectorEnd,
} from "./routing.js";

export { drawingWords } from "./messages/index.js";
