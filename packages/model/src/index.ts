export const PACKAGE_NAME = "@meltemi/diagrams-model";

export * from "./types.js";
export * from "./schema.js";
export { SOURCE_LIMITS, compile } from "./compile.js";
export {
  LAYOUT_ALGORITHMS,
  MODEL_API_VERSION,
  RESERVED_WORDS,
  readDiagramType,
  relationAllowed,
  type DiagramTypeDefinition,
  type KindDefinition,
  type LayoutAlgorithm,
  type PropertyDefinition,
} from "./diagram-types.js";
export { declaredProfile } from "./flow.js";
export { outlined, type OutlineSource } from "./outline.js";
export { allowedEntities, childLevel, defaultEntities, isChildView } from "./c4.js";
export { closePaths } from "./model.js";
export { readPoint } from "./flow.js";
export { flattenEvents, resolveScenario } from "./scenario.js";
export { headerHasError, isSafeUrl, singleIdent } from "./style-values.js";
export { storyTargetKind } from "./story.js";
export { BACKGROUND_WORDS, effectsEnd } from "./export.js";
export {
  describeChange,
  describeFact,
  diffDocuments,
  type ChangedPart,
  type ChangeFact,
  type ChangeKind,
  type ChangeState,
  type ChangeSubject,
  type ModelChange,
} from "./diff.js";
export * from "./json.js";
