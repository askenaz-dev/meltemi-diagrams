// Model adapters: Anthropic's Messages API and OpenAI-compatible chat endpoints (local servers
// such as Ollama, llama.cpp or LM Studio, or remote ones). Keys come from the environment or the
// editor's secret storage, never from project files, and never appear in errors (decision 0029).
import { messages } from "./messages/index.js";

/** One turn of a conversation. */
export interface AssistMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface CompletionRequest {
  readonly system: string;
  readonly messages: readonly AssistMessage[];
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface ModelAdapter {
  /** `anthropic` or `openai-compatible`. */
  readonly provider: string;
  readonly model: string;
  /** Where requests go, without credentials. */
  readonly endpoint: string;
  /** False when the endpoint is on this machine: nothing leaves it. */
  readonly remote: boolean;
  complete(request: CompletionRequest): Promise<string>;
}

export type Fetch = typeof fetch;

/** The most capable Claude model, the default for Anthropic (decision 0029). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const ANTHROPIC_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 16000;
const TIMEOUT_MS = 300_000;

/** An error of a provider, its message in the interface language and free of credentials. */
export class AssistError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "AssistError";
  }
}

/** Whether a URL points at this machine. */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/** Text with every secret replaced, so that no error or log can show one. */
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) result = result.split(secret).join("[redacted]");
  }
  return result;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

async function post(
  fetcher: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  secrets: readonly (string | undefined)[],
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AssistError(
      redact(
        messages().provider.cannotReach(new URL(url).origin, (error as Error).message),
        secrets,
      ),
    );
  }
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      if (message) detail = message;
    } catch {
      // Not JSON: keep the start of the text.
    }
    throw new AssistError(
      redact(messages().provider.answered(response.status, detail), secrets),
      response.status,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AssistError(messages().provider.notJson);
  }
}

export interface AnthropicOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly fetch?: Fetch;
}

/** Claude through Anthropic's Messages API. */
export function anthropicAdapter(options: AnthropicOptions): ModelAdapter {
  const baseUrl = trimSlash(options.baseUrl ?? ANTHROPIC_URL);
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const fetcher = options.fetch ?? fetch;
  return {
    provider: "anthropic",
    model,
    endpoint: baseUrl,
    remote: !isLocalUrl(baseUrl),
    async complete(request) {
      const answer = (await post(
        fetcher,
        `${baseUrl}/v1/messages`,
        { "x-api-key": options.apiKey, "anthropic-version": ANTHROPIC_VERSION },
        {
          model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: request.system,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        [options.apiKey],
        request.signal,
      )) as { content?: { type: string; text?: string }[]; stop_reason?: string };
      if (answer.stop_reason === "max_tokens") throw new AssistError(messages().provider.cutOff);
      const text = (answer.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      if (text === "") throw new AssistError(messages().provider.noText);
      return text;
    },
  };
}

export interface OpenAiCompatibleOptions {
  /** Such as `http://127.0.0.1:11434/v1`. */
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly fetch?: Fetch;
}

/** A chat-completions endpoint: local model servers, or remote services that speak the protocol. */
export function openAiCompatibleAdapter(options: OpenAiCompatibleOptions): ModelAdapter {
  const baseUrl = trimSlash(options.baseUrl);
  const fetcher = options.fetch ?? fetch;
  return {
    provider: "openai-compatible",
    model: options.model,
    endpoint: baseUrl,
    remote: !isLocalUrl(baseUrl),
    async complete(request) {
      const answer = (await post(
        fetcher,
        `${baseUrl}/chat/completions`,
        options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {},
        {
          model: options.model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: 0.2,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        [options.apiKey],
        request.signal,
      )) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      const choice = answer.choices?.[0];
      if (choice?.finish_reason === "length") throw new AssistError(messages().provider.cutOff);
      const text = choice?.message?.content ?? "";
      if (text === "") throw new AssistError(messages().provider.noText);
      return text;
    },
  };
}

/** Where assistance is configured: provider, model, endpoint and the key, never from projects. */
export interface AssistConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
}

export const PROVIDERS = ["anthropic", "openai-compatible"] as const;

/**
 * The adapter of a configuration: explicit settings first, then the environment
 * (`MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`, `MELTEMI_AI_API_KEY`,
 * `ANTHROPIC_API_KEY`). A message in the interface language says what is missing.
 */
export function adapterFor(
  config: AssistConfig,
  env: Readonly<Record<string, string | undefined>> = {},
  fetcher?: Fetch,
): ModelAdapter | string {
  const provider =
    config.provider ?? env.MELTEMI_AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : undefined);
  const model = config.model ?? env.MELTEMI_AI_MODEL;
  const baseUrl = config.baseUrl ?? env.MELTEMI_AI_BASE_URL;
  const extra = fetcher ? { fetch: fetcher } : {};
  const t = messages().config;
  if (provider === undefined) return t.noProvider;
  if (provider === "anthropic") {
    const apiKey = config.apiKey ?? env.ANTHROPIC_API_KEY ?? env.MELTEMI_AI_API_KEY;
    if (!apiKey) return t.anthropicKey;
    return anthropicAdapter({
      apiKey,
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...extra,
    });
  }
  if (provider === "openai-compatible") {
    if (!baseUrl) return t.baseUrl;
    if (!model) return t.model;
    const apiKey = config.apiKey ?? env.MELTEMI_AI_API_KEY;
    return openAiCompatibleAdapter({ baseUrl, model, ...(apiKey ? { apiKey } : {}), ...extra });
  }
  return t.unknownProvider(provider, PROVIDERS);
}
