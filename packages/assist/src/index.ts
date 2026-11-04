export const PACKAGE_NAME = "@meltemi/diagrams-assist";

export {
  ANTHROPIC_URL,
  AssistError,
  DEFAULT_ANTHROPIC_MODEL,
  PROVIDERS,
  adapterFor,
  anthropicAdapter,
  isLocalUrl,
  openAiCompatibleAdapter,
  redact,
  type AnthropicOptions,
  type AssistConfig,
  type AssistMessage,
  type CompletionRequest,
  type Fetch,
  type ModelAdapter,
  type OpenAiCompatibleOptions,
} from "./adapters.js";
export {
  describeDisclosure,
  disclosure,
  explainChanges,
  propose,
  requestMessage,
  systemPrompt,
  type AssistRequest,
  type AssistRun,
  type Disclosure,
  type SharedFile,
} from "./assist.js";
export { GUIDE_PAGES } from "./guide.js";
export { messages as assistMessages } from "./messages/index.js";
export {
  PROPOSAL_FORMAT,
  PROPOSAL_VERSION,
  applyProposal,
  blocksOf,
  buildProposal,
  newErrors,
  parseAnswer,
  revisionOf,
  withImports,
  type ApplyResult,
  type AssistOperation,
  type Proposal,
  type ProposalItem,
  type ProposalSource,
} from "./proposal.js";
