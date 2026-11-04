// Pure helpers shared by the canvas webview and the session. Nothing here imports the engine.
export * from "./geometry.js";
export * from "./snapping.js";
export * from "./selection.js";
export * from "./arrange.js";
export * from "./routes.js";
export * from "./keyboard.js";
export * from "./protocol.js";
export * from "./palette.js";
export * from "./pens.js";
export * from "./turning.js";
// The outlines of the shapes, from the layout's pure geometry module (no engine, no model at run
// time), so the canvas draws what the layout draws: pictures, ghosts, hit tests and magnets.
export {
  CORNERED_SHAPES,
  SHAPE_SIZES,
  onOutline,
  pointInShape,
  turnPoint,
  turnedOutline,
  shapeMagnets,
  shapeOutline,
  type ShapeMagnet,
  type ShapeOptions,
  type ShapeOutline,
  type ShapeSize,
} from "@meltemi/diagrams-layout/shapes";
