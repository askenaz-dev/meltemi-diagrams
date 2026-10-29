export const PACKAGE_NAME = "@meltemi/diagrams-edit";

export type * from "./types.js";
export { applyEdits, inversePlan, planEdit, removeListItems } from "./plan.js";
export { attachmentArgs, stripAttachment } from "./attachments.js";
export { renameEntity, entityReferences } from "./c4.js";
export { DEFAULT_LABELS, declarationText, defaultLabel } from "./create.js";
export { formatStyleValue } from "./styles.js";
export { formatThemeValue } from "./themes.js";
export {
  ANIMATION_PROPERTIES,
  animationPropertyApplies,
  formatAnimationValue,
  type AnimationProperty,
} from "./animate.js";
export { deleteStatements } from "./delete.js";
export { activationPair } from "./sequence.js";
export { CREATABLE_DIAGRAMS, newDiagramId } from "./diagrams.js";
export { formatNumber, quoteString } from "./text.js";
