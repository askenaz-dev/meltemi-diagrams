/**
 * The assistance's words in English: errors of providers and configurations, the list of what a
 * request sends, and the problems of answers and proposals. Prompts, repair messages and anything
 * else sent to a model stay in English in the code whatever the interface language: they are
 * content for the model, not words for people. Environment variables, provider names and URLs are
 * code. Sentences with values are functions, so each language builds its own grammar.
 */
export const en = {
  /** Errors of a provider, as `AssistError` messages; secrets are redacted from them afterwards. */
  provider: {
    /** The provider cannot be reached: its origin and why, such as a network error. */
    cannotReach: (origin: string, reason: string) => `Cannot reach ${origin}: ${reason}`,
    /** An HTTP error: its status and what the provider said, or the start of its answer. */
    answered: (status: number, detail: string) => `The provider answered ${status}: ${detail}`,
    notJson: "The provider's answer is not JSON.",
    cutOff: "The answer was cut off at its length limit; ask for less at once.",
    noText: "The provider's answer has no text.",
  },
  /** What a configuration lacks (`adapterFor`). */
  config: {
    noProvider:
      "No AI provider is set: set MELTEMI_AI_PROVIDER to anthropic (with ANTHROPIC_API_KEY) or openai-compatible (with MELTEMI_AI_BASE_URL and MELTEMI_AI_MODEL). Validation, layout and export never need one.",
    anthropicKey: "Anthropic needs a key in ANTHROPIC_API_KEY.",
    baseUrl:
      "An OpenAI-compatible provider needs MELTEMI_AI_BASE_URL, such as http://127.0.0.1:11434/v1.",
    model: "An OpenAI-compatible provider needs MELTEMI_AI_MODEL, the model's name.",
    /** The provider written, and the providers there are. */
    unknownProvider: (provider: string, providers: readonly string[]) =>
      `Unknown AI provider "${provider}"; use ${providers.join(" or ")}.`,
  },
  /** What a request sends, listed for the person before it goes (`describeDisclosure`). */
  disclosure: {
    /** The first line: where the request goes; `remote` is false for an endpoint on this machine. */
    goesTo: (provider: string, model: string, endpoint: string, remote: boolean) =>
      `This request goes to ${provider} (${model}) at ${endpoint}${remote ? "" : ", on this machine"}, with:`,
    /** The size of a file sent, in bytes or kilobytes. */
    size: (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`),
    /** The person's own words, by their number of characters. */
    instruction: (characters: number) => `your request (${characters} characters)`,
    guide: "the language guide",
    /** The changes of a review, listed where the path of a file goes. */
    changes: "the list of changes",
  },
  /** Why a file is sent, after its size. */
  reasons: {
    /** The file the request is about. */
    file: "the file",
    /** For a new file, files of the project it may import. */
    model: "a model of the project",
    themes: "themes of the project",
    /** Files the file imports, itself or through another import. */
    importedByIt: "imported by it",
    importedByImport: "imported by an import",
    /** An explanation of changes: a file as it is after them, and the list of the changes. */
    changed: "changed",
    review: "what the review found",
  },
  /** Answers that are not what was asked for, and proposals that cannot be applied. */
  proposal: {
    noJsonObject: "The answer holds no JSON object.",
    notJsonObject: "The answer is not a JSON object.",
    /** The last answer still cannot be read: why. */
    notAsAsked: (reason: string) => `The assistant did not answer as asked: ${reason}`,
    /**
     * The reason of a suggested relation when the answer gives none. It is written into the file
     * as its `assumption`, so it takes the language of written files, not the interface's.
     */
    inferred: "Inferred",
    noItem: "No item was accepted.",
    allChanged: "Every accepted item changed since the proposal.",
  },
};
