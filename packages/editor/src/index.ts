export const PACKAGE_NAME = "@meltemi/diagrams-editor";

export {
  analyzeDocument,
  diagramView,
  type AnalysisInput,
  type DiagramView,
  type DocumentAnalysis,
  type ImportedViews,
} from "./analysis.js";
export {
  effectsPlayerDocument,
  storyChoices,
  storyPlayback,
  storyPlayerDocument,
  type StoryPlayback,
} from "./story.js";
export { STORY_DOCS } from "./services/stories.js";
export {
  arrangeAttempt,
  arrangeOperation,
  containerOperation,
  stackedAfterMove,
  convertOperation,
  freeDiagramId,
  materializeOperation,
} from "./arrange.js";
export {
  exportFileName,
  renderDiagram,
  type RenderGeometry,
  type RenderedDiagram,
} from "./render.js";
export {
  completions,
  iconChoices,
  type CompletionItem,
  type CompletionKind,
} from "./services/completion.js";
export { KEYWORD_DOCS } from "./services/docs.js";
export { hover, type Hover } from "./services/hover.js";
export {
  definition,
  documentSymbols,
  highlights,
  prepareRename,
  references,
  rename,
  selectionAt,
  type PrepareRename,
  type SymbolKind,
  type SymbolNode,
} from "./services/navigation.js";
export { formatDocument, minimalEdit } from "./services/format.js";
export {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPES,
  semanticTokens,
  type SemanticToken,
  type SemanticTokenType,
} from "./services/tokens.js";
export { codeActions, editDistance, type CodeAction } from "./services/actions.js";
export { CanvasSession, type SessionResult } from "./session.js";
export {
  ProjectSessions,
  type ProjectDefaults,
  type ProjectSessionsOptions,
  stepsRejected,
  type ProjectStep,
  type StepsResult,
  type AssetSteps,
} from "./projects.js";
export {
  changedAssetFile,
  libraryCategoryId,
  PROJECT_LIBRARY,
  type AssetFileChange,
} from "./asset-files.js";
export { DEFAULT_ICON_PREFIX, addIcons, checkIconFiles, checkIconPrefix } from "./add-icons.js";
export { importSpec, moveFileEdits, type FileMove, type MoveEdits } from "./move-file.js";
export {
  MAX_PIXELS,
  VIDEO_DEFAULTS,
  WRITABLE_FORMATS,
  produceExport,
  profileRequest,
  type ExportContext,
  type ExportOutput,
  type ExportRequest,
  type WritableFormat,
} from "./exports.js";
export { layoutIn, storyLayoutsIn } from "./layouts.js";
export {
  buildCatalog,
  isExcluded,
  type CatalogBuild,
  type CatalogOptions,
  type SkippedEntry,
} from "./catalog.js";
export {
  fieldOperations,
  freshRelationId,
  inspect,
  namedRelation,
  type FieldResult,
} from "./inspector.js";
export { copyFragment, pasteOperations, type PasteResult } from "./clipboard.js";
export { setJsonField, setJsonObjectField } from "./json-edit.js";
export {
  allEvents,
  eventInfos,
  gapOf,
  isParticipant,
  sequenceAction,
  sequenceMove,
  spaceOf,
} from "./sequence.js";
export type {
  CanvasAction,
  CanvasMessage,
  CanvasProfile,
  CanvasRender,
  CreatableDiagram,
  MoveAction,
  ResizeAction,
  RotationAction,
  PreviewedAction,
  EventInfo,
  EventKind,
  FragmentOperator,
  CanvasSettings,
  HostMessage,
  PresencePerson,
  ColorSwatch,
  FieldGlyphs,
  IconChoiceInfo,
  IconGroupInfo,
  IconFileInput,
  IconFileCheck,
  IconPrefixCheck,
  AddedIconInfo,
  InspectorField,
  InspectorModel,
  ThemePanelModel,
  SceneActionKind,
  StoryPlaybackInfo,
} from "./canvas/protocol.js";
export { isCanvasMessage } from "./canvas/protocol.js";
