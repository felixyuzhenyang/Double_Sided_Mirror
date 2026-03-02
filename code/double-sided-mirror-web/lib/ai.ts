import { ActionStep, Citation } from "./types";
import { sanitizeCitations } from "./paValidation";
import { AiProvider, normalizeModel, normalizeProvider } from "./aiProviders";

export interface AiRuntimeOptions {
  provider?: string;
  model?: string;
}

interface ChatCallParams {
  apiKey: string;
  provider: AiProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface JsonObject {
  [key: string]: unknown;
}

interface AiAttemptDebug {
  provider: string;
  attempted: boolean;
  ok: boolean;
  statusCode?: number;
  errorMessage?: string;
}

interface AiCallResult {
  text: string | null;
  debug: AiAttemptDebug;
}

interface RuntimeConfig {
  provider: AiProvider;
  model: string;
}

function resolveRuntimeOptions(options?: AiRuntimeOptions): RuntimeConfig {
  const provider = normalizeProvider(options?.provider);
  const model = normalizeModel(provider, options?.model);
  return { provider, model };
}

function normalizeApiKey(apiKey: string | undefined): string | null {
  const normalized = apiKey?.trim();
  if (!normalized) {
    return null;
  }
  // Accept either raw token or "Bearer <token>" input from UI paste.
  const withoutBearer = normalized.replace(/^bearer\s+/i, "").trim();
  const unquoted = withoutBearer.replace(/^["']|["']$/g, "").trim();
  if (!unquoted) {
    return null;
  }
  return unquoted;
}

export function hasUsableApiKey(apiKey: string | undefined): boolean {
  return normalizeApiKey(apiKey) !== null;
}

function extractTextFromResponses(json: JsonObject): string | null {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const output = Array.isArray(json.output) ? json.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = Array.isArray((item as JsonObject).content)
      ? ((item as JsonObject).content as unknown[])
      : [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const text = (block as JsonObject).text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.length > 0 ? chunks.join("\n") : null;
}

function extractTextFromChatCompletion(json: JsonObject): string | null {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as JsonObject).message : null;
  if (!message || typeof message !== "object") {
    return null;
  }

  const rawContent = (message as JsonObject).content;
  if (typeof rawContent === "string" && rawContent.trim()) {
    return rawContent.trim();
  }

  if (Array.isArray(rawContent)) {
    const chunks = rawContent
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const text = (item as JsonObject).text;
        return typeof text === "string" ? text.trim() : "";
      })
      .filter(Boolean);
    if (chunks.length > 0) {
      return chunks.join("\n");
    }
  }

  return null;
}

function extractTextFromGemini(json: JsonObject): string | null {
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") {
    return null;
  }

  const content = (first as JsonObject).content;
  if (!content || typeof content !== "object") {
    return null;
  }

  const parts = Array.isArray((content as JsonObject).parts) ? ((content as JsonObject).parts as unknown[]) : [];
  const chunks = parts
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const text = (item as JsonObject).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);

  return chunks.length > 0 ? chunks.join("\n") : null;
}

function extractTextFromAnthropic(json: JsonObject): string | null {
  const content = Array.isArray(json.content) ? json.content : [];
  const chunks = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      if ((item as JsonObject).type !== "text") {
        return "";
      }
      const text = (item as JsonObject).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);

  return chunks.length > 0 ? chunks.join("\n") : null;
}

function extractJsonObject(raw: string): JsonObject | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? raw.trim();

  try {
    return JSON.parse(candidate) as JsonObject;
  } catch {
    // Continue with brace-based extraction.
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  const objectSlice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(objectSlice) as JsonObject;
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) {
      return `HTTP ${response.status}`;
    }
    try {
      const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
      return json.error?.message || json.message || text.slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

function missingKeyResult(provider: string): AiCallResult {
  return {
    text: null,
    debug: {
      provider,
      attempted: false,
      ok: false,
      errorMessage: "API key missing"
    }
  };
}

async function callOpenAiChatCompletionDetailed(params: ChatCallParams): Promise<AiCallResult> {
  const apiKey = normalizeApiKey(params.apiKey);
  if (!apiKey) {
    return missingKeyResult("openai_chat_completion");
  }

  const { systemPrompt, userPrompt, maxTokens = 800, model } = params;
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "openai_chat_completion",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromChatCompletion(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "openai_chat_completion",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty completion response"
        }
      };
    }

    return {
      text,
      debug: {
        provider: "openai_chat_completion",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "openai_chat_completion",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling OpenAI chat completions"
      }
    };
  }
}

async function callXaiChatCompletionDetailed(params: ChatCallParams): Promise<AiCallResult> {
  const apiKey = normalizeApiKey(params.apiKey);
  if (!apiKey) {
    return missingKeyResult("xai_chat_completion");
  }

  const { systemPrompt, userPrompt, maxTokens = 800, model } = params;
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "xai_chat_completion",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromChatCompletion(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "xai_chat_completion",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty completion response"
        }
      };
    }

    return {
      text,
      debug: {
        provider: "xai_chat_completion",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "xai_chat_completion",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling xAI chat completions"
      }
    };
  }
}

type GeminiApiVersion = "v1beta" | "v1";

interface GeminiTarget {
  apiVersion: GeminiApiVersion;
  requestedModel: string;
  model: string;
  availableModels: string[];
  usedFallback: boolean;
}

const GEMINI_API_VERSIONS: GeminiApiVersion[] = ["v1beta", "v1"];

function normalizeGeminiModelName(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    return "gemini-2.0-flash";
  }
  return normalized.replace(/^models\//i, "");
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function geminiFallbackCandidates(requestedModel: string): string[] {
  const requested = normalizeGeminiModelName(requestedModel);
  const lower = requested.toLowerCase();
  const candidates = [requested];

  if (lower.includes("1.5-flash")) {
    candidates.push("gemini-1.5-flash-latest");
  }
  if (lower.includes("1.5-pro")) {
    candidates.push("gemini-1.5-pro-latest");
  }

  candidates.push("gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash-latest");
  return uniqueStrings(candidates);
}

async function listGeminiGenerateContentModels(
  apiKey: string,
  apiVersion: GeminiApiVersion
): Promise<string[] | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as JsonObject;
    const models = Array.isArray(json.models) ? json.models : [];
    const available = models
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const raw = item as JsonObject;
        const name = typeof raw.name === "string" ? normalizeGeminiModelName(raw.name) : "";
        const methods = Array.isArray(raw.supportedGenerationMethods)
          ? (raw.supportedGenerationMethods as unknown[])
          : [];
        const supportsGenerateContent = methods.some((method) => method === "generateContent");
        if (!name || !supportsGenerateContent) {
          return null;
        }
        return name;
      })
      .filter((name): name is string => Boolean(name));

    return uniqueStrings(available);
  } catch {
    return null;
  }
}

function pickGeminiModelFromAvailable(requestedModel: string, availableModels: string[]): string {
  const requested = normalizeGeminiModelName(requestedModel);
  if (availableModels.includes(requested)) {
    return requested;
  }

  const candidates = geminiFallbackCandidates(requested);
  for (const candidate of candidates) {
    if (availableModels.includes(candidate)) {
      return candidate;
    }
  }

  return availableModels[0] ?? requested;
}

function pickGeminiBackupModel(
  requestedModel: string,
  availableModels: string[],
  currentModel: string
): string | null {
  const candidates = geminiFallbackCandidates(requestedModel);
  for (const candidate of candidates) {
    if (candidate !== currentModel && availableModels.includes(candidate)) {
      return candidate;
    }
  }
  for (const available of availableModels) {
    if (available !== currentModel) {
      return available;
    }
  }
  return null;
}

async function resolveGeminiTarget(apiKey: string, requestedModel: string): Promise<GeminiTarget> {
  const requested = normalizeGeminiModelName(requestedModel);

  for (const apiVersion of GEMINI_API_VERSIONS) {
    const availableModels = await listGeminiGenerateContentModels(apiKey, apiVersion);
    if (!availableModels || availableModels.length === 0) {
      continue;
    }
    const model = pickGeminiModelFromAvailable(requested, availableModels);
    return {
      apiVersion,
      requestedModel: requested,
      model,
      availableModels,
      usedFallback: model !== requested
    };
  }

  const fallbackCandidates = geminiFallbackCandidates(requested);
  const fallback = fallbackCandidates[1] ?? fallbackCandidates[0] ?? "gemini-2.0-flash";
  return {
    apiVersion: "v1beta",
    requestedModel: requested,
    model: fallback,
    availableModels: [],
    usedFallback: fallback !== requested
  };
}

function isGeminiModelUnavailableError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("not found for api version") ||
    (normalized.includes("not supported") && normalized.includes("generatecontent")) ||
    normalized.includes("model not found")
  );
}

interface GeminiCallParams {
  apiKey: string;
  target: GeminiTarget;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  withSearchTool: boolean;
}

async function callGeminiGenerateContentOnce(
  params: GeminiCallParams
): Promise<{ ok: true; json: JsonObject } | { ok: false; statusCode?: number; errorMessage: string }> {
  const { apiKey, target, systemPrompt, userPrompt, maxOutputTokens, withSearchTool } = params;
  const body: JsonObject = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens
    }
  };

  if (withSearchTool) {
    body.tools = [{ googleSearch: {} }];
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${target.apiVersion}/models/${encodeURIComponent(target.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        errorMessage: await readErrorMessage(response)
      };
    }

    const json = (await response.json()) as JsonObject;
    return {
      ok: true,
      json
    };
  } catch {
    return {
      ok: false,
      errorMessage: "Network error calling Gemini generateContent"
    };
  }
}

async function callGeminiGenerateContentDetailed(params: ChatCallParams): Promise<AiCallResult> {
  const apiKey = normalizeApiKey(params.apiKey);
  if (!apiKey) {
    return missingKeyResult("gemini_generate_content");
  }

  const { systemPrompt, userPrompt, maxTokens = 800, model } = params;
  const target = await resolveGeminiTarget(apiKey, model);
  let attempt = await callGeminiGenerateContentOnce({
    apiKey,
    target,
    systemPrompt,
    userPrompt,
    maxOutputTokens: maxTokens,
    withSearchTool: false
  });

  if (!attempt.ok && isGeminiModelUnavailableError(attempt.errorMessage)) {
    const backupModel = pickGeminiBackupModel(target.requestedModel, target.availableModels, target.model);
    if (backupModel) {
      attempt = await callGeminiGenerateContentOnce({
        apiKey,
        target: { ...target, model: backupModel, usedFallback: true },
        systemPrompt,
        userPrompt,
        maxOutputTokens: maxTokens,
        withSearchTool: false
      });
    }
  }

  if (!attempt.ok) {
    return {
      text: null,
      debug: {
        provider: "gemini_generate_content",
        attempted: true,
        ok: false,
        statusCode: attempt.statusCode,
        errorMessage: attempt.errorMessage
      }
    };
  }

  const text = extractTextFromGemini(attempt.json);
  if (!text) {
    return {
      text: null,
      debug: {
        provider: "gemini_generate_content",
        attempted: true,
        ok: false,
        statusCode: 200,
        errorMessage: "Empty Gemini response"
      }
    };
  }

  return {
    text,
    debug: {
      provider: "gemini_generate_content",
      attempted: true,
      ok: true,
      statusCode: 200
    }
  };
}

async function callAnthropicMessagesDetailed(params: ChatCallParams): Promise<AiCallResult> {
  const apiKey = normalizeApiKey(params.apiKey);
  if (!apiKey) {
    return missingKeyResult("anthropic_messages");
  }

  const { systemPrompt, userPrompt, maxTokens = 800, model } = params;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "anthropic_messages",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromAnthropic(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "anthropic_messages",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty Claude response"
        }
      };
    }

    return {
      text,
      debug: {
        provider: "anthropic_messages",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "anthropic_messages",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling Anthropic messages"
      }
    };
  }
}

async function callChatCompletionDetailed(params: ChatCallParams): Promise<AiCallResult> {
  switch (params.provider) {
    case "openai":
      return callOpenAiChatCompletionDetailed(params);
    case "gemini":
      return callGeminiGenerateContentDetailed(params);
    case "anthropic":
      return callAnthropicMessagesDetailed(params);
    case "xai":
      return callXaiChatCompletionDetailed(params);
    default:
      return {
        text: null,
        debug: {
          provider: "unsupported_provider",
          attempted: false,
          ok: false,
          errorMessage: "Unsupported provider"
        }
      };
  }
}

async function callChatCompletion(params: ChatCallParams): Promise<string | null> {
  const result = await callChatCompletionDetailed(params);
  return result.text;
}

async function callOpenAiResponsesWithWebSearch(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 1400
): Promise<AiCallResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return missingKeyResult("openai_responses_web_search");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedApiKey}`
      },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search_preview" }],
        temperature: 0.2,
        max_output_tokens: maxOutputTokens,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "openai_responses_web_search",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromResponses(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "openai_responses_web_search",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty responses output"
        }
      };
    }
    return {
      text,
      debug: {
        provider: "openai_responses_web_search",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "openai_responses_web_search",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling OpenAI responses API"
      }
    };
  }
}

async function callGeminiWithSearch(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 1400
): Promise<AiCallResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return missingKeyResult("gemini_google_search");
  }

  const target = await resolveGeminiTarget(normalizedApiKey, model);
  let attempt = await callGeminiGenerateContentOnce({
    apiKey: normalizedApiKey,
    target,
    systemPrompt,
    userPrompt,
    maxOutputTokens,
    withSearchTool: true
  });

  if (!attempt.ok && isGeminiModelUnavailableError(attempt.errorMessage)) {
    const backupModel = pickGeminiBackupModel(target.requestedModel, target.availableModels, target.model);
    if (backupModel) {
      attempt = await callGeminiGenerateContentOnce({
        apiKey: normalizedApiKey,
        target: { ...target, model: backupModel, usedFallback: true },
        systemPrompt,
        userPrompt,
        maxOutputTokens,
        withSearchTool: true
      });
    }
  }

  if (!attempt.ok) {
    return {
      text: null,
      debug: {
        provider: "gemini_google_search",
        attempted: true,
        ok: false,
        statusCode: attempt.statusCode,
        errorMessage: attempt.errorMessage
      }
    };
  }

  const text = extractTextFromGemini(attempt.json);
  if (!text) {
    return {
      text: null,
      debug: {
        provider: "gemini_google_search",
        attempted: true,
        ok: false,
        statusCode: 200,
        errorMessage: "Empty Gemini response"
      }
    };
  }

  return {
    text,
    debug: {
      provider: "gemini_google_search",
      attempted: true,
      ok: true,
      statusCode: 200
    }
  };
}

async function callAnthropicWithSearch(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 1400
): Promise<AiCallResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return missingKeyResult("anthropic_web_search");
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": normalizedApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "anthropic_web_search",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromAnthropic(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "anthropic_web_search",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty Claude web-search response"
        }
      };
    }

    return {
      text,
      debug: {
        provider: "anthropic_web_search",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "anthropic_web_search",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling Anthropic web search"
      }
    };
  }
}

async function callXaiWithSearch(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 1400
): Promise<AiCallResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return missingKeyResult("xai_web_search");
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedApiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [{ type: "web_search" }]
      })
    });

    if (!response.ok) {
      return {
        text: null,
        debug: {
          provider: "xai_web_search",
          attempted: true,
          ok: false,
          statusCode: response.status,
          errorMessage: await readErrorMessage(response)
        }
      };
    }

    const json = (await response.json()) as JsonObject;
    const text = extractTextFromChatCompletion(json);
    if (!text) {
      return {
        text: null,
        debug: {
          provider: "xai_web_search",
          attempted: true,
          ok: false,
          statusCode: 200,
          errorMessage: "Empty Grok web-search response"
        }
      };
    }

    return {
      text,
      debug: {
        provider: "xai_web_search",
        attempted: true,
        ok: true,
        statusCode: 200
      }
    };
  } catch {
    return {
      text: null,
      debug: {
        provider: "xai_web_search",
        attempted: true,
        ok: false,
        errorMessage: "Network error calling xAI web search"
      }
    };
  }
}

async function callWebSearchWithProvider(
  apiKey: string,
  provider: AiProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens = 1400
): Promise<AiCallResult> {
  switch (provider) {
    case "openai":
      return callOpenAiResponsesWithWebSearch(apiKey, model, systemPrompt, userPrompt, maxOutputTokens);
    case "gemini":
      return callGeminiWithSearch(apiKey, model, systemPrompt, userPrompt, maxOutputTokens);
    case "anthropic":
      return callAnthropicWithSearch(apiKey, model, systemPrompt, userPrompt, maxOutputTokens);
    case "xai":
      return callXaiWithSearch(apiKey, model, systemPrompt, userPrompt, maxOutputTokens);
    default:
      return {
        text: null,
        debug: {
          provider: "unsupported_web_search_provider",
          attempted: false,
          ok: false,
          errorMessage: "Unsupported provider"
        }
      };
  }
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function readCitations(value: unknown, extraDomains: string[]): Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const citations: Citation[] = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const raw = item as JsonObject;
      return {
        title: readString(raw.title, "Official source"),
        url: readString(raw.url),
        agency: readString(raw.agency, "Pennsylvania Government"),
        publishedOrUpdated: readString(raw.publishedOrUpdated, "Official source"),
        snippet: readString(raw.snippet, "Official source related to this request.")
      };
    })
    .filter((item): item is Citation => Boolean(item && item.url));

  return sanitizeCitations(citations, extraDomains);
}

export interface CitizenCoreExtraction {
  goal?: string;
  city?: string;
}

export async function extractCitizenCoreWithAi(
  apiKey: string | undefined,
  latestMessage: string,
  transcriptText: string,
  options?: AiRuntimeOptions
): Promise<CitizenCoreExtraction | null> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return null;
  }

  const runtime = resolveRuntimeOptions(options);

  const prompt = [
    "Extract the user's core government-service request from this Pennsylvania conversation.",
    "Return strict JSON only:",
    '{"goal":"string or empty","city":"Pennsylvania city/town/county string or empty"}',
    "",
    `Latest user message: ${latestMessage}`,
    `Conversation transcript:\n${transcriptText}`
  ].join("\n");

  const raw = await callChatCompletion({
    apiKey: normalizedApiKey,
    provider: runtime.provider,
    model: runtime.model,
    systemPrompt:
      "You extract structured intake fields for Pennsylvania civic-service workflows. Return JSON only.",
    userPrompt: prompt,
    maxTokens: 220
  });

  if (!raw) {
    return null;
  }
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return null;
  }

  const goal = readString(parsed.goal);
  const city = readString(parsed.city);
  return {
    goal: goal || undefined,
    city: city || undefined
  };
}

export interface CitizenResearchPackage {
  intentTitle: string;
  policySummary: string;
  citations: Citation[];
  followUpQuestions: string[];
  nextQuestion: string;
  readyForFinalCheck: boolean;
  missingInfoChecklist: string[];
  liveSearchUsed: boolean;
  liveSearchAttempted: boolean;
  liveSearchError?: string;
  completionFallbackUsed?: boolean;
  completionFallbackError?: string;
}

const DEFAULT_CITIZEN_NEXT_QUESTIONS = [
  "Are you doing this for yourself, your household, or a business?",
  "When do you want to finish this process?",
  "Do you already have a case number, application number, or denial letter?",
  "Do you already have your key documents ready (ID, proof of address, and income/business records)?",
  "Do you want to complete this online, in person, or by phone?"
];

function defaultNextQuestionByTurn(followUpAnswers: Record<string, string>): string {
  const turn = Object.keys(followUpAnswers).length;
  return (
    DEFAULT_CITIZEN_NEXT_QUESTIONS[Math.min(turn, DEFAULT_CITIZEN_NEXT_QUESTIONS.length - 1)] ??
    DEFAULT_CITIZEN_NEXT_QUESTIONS[0]
  );
}

export async function researchCitizenPolicyWithAi(
  apiKey: string | undefined,
  goal: string,
  city: string,
  extraAllowedDomains: string[],
  transcriptText = "",
  followUpAnswers: Record<string, string> = {},
  options?: AiRuntimeOptions
): Promise<CitizenResearchPackage | null> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return null;
  }

  const runtime = resolveRuntimeOptions(options);

  const systemPrompt = [
    "You are a Pennsylvania policy-retrieval analyst.",
    "Use web search to gather official policy and service sources for the request.",
    "Prioritize Pennsylvania state and Pennsylvania city/county government sources.",
    "On every call, reassess what information is still missing and ask exactly one best next question.",
    "Return strict JSON only."
  ].join(" ");

  const userPrompt = [
    `User goal: ${goal}`,
    `Pennsylvania city or locality: ${city}`,
    `Conversation transcript:\n${transcriptText || "(empty)"}`,
    `Known follow-up answers: ${JSON.stringify(followUpAnswers)}`,
    "Required output JSON schema:",
    "{",
    '  "intentTitle": "short task title",',
    '  "policySummary": "brief synthesis (<= 120 words)",',
    '  "citations": [',
    "    {",
    '      "title": "source title",',
    '      "url": "https://...",',
    '      "agency": "agency name",',
    '      "publishedOrUpdated": "date or official page label",',
    '      "snippet": "how this source applies"',
    "    }",
    "  ],",
    '  "missingInfoChecklist": ["missing item 1", "missing item 2"],',
    '  "readyForFinalCheck": false,',
    '  "nextQuestion": "single best next question if not ready",',
    '  "followUpQuestions": ["optional backup question list"]',
    "}",
    "Rules:",
    "- You must perform live web search now and use current conversation details.",
    "- Include both state-level and city-level sources when available.",
    "- Sources must be official government sources tied to Pennsylvania.",
    "- Only include links that are directly relevant to the user's specific goal. Exclude unrelated policy areas.",
    "- Ask only one follow-up question in plain language that a non-expert citizen can answer.",
    "- Do not ask the citizen to provide legal text, zoning code details, or policy interpretation.",
    "- Ask for practical facts (timeline, applicant type, case number, available documents, preferred channel).",
    '- If enough information is already available, set readyForFinalCheck=true and nextQuestion="".'
  ].join("\n");

  const responsesAttempt = await callWebSearchWithProvider(
    normalizedApiKey,
    runtime.provider,
    runtime.model,
    systemPrompt,
    userPrompt
  );

  let effectiveRaw = responsesAttempt.text;
  let fallbackAttempt: AiCallResult | null = null;
  let parsed = effectiveRaw ? extractJsonObject(effectiveRaw) : null;

  if (!parsed) {
    const repairPrompt = [
      "Convert this policy analysis into the required JSON schema exactly.",
      "If a field is unknown, still provide a reasonable plain-language value.",
      "",
      "Required schema:",
      "{",
      '  "intentTitle": "short task title",',
      '  "policySummary": "brief synthesis (<= 120 words)",',
      '  "citations": [',
      "    {",
      '      "title": "source title",',
      '      "url": "https://...",',
      '      "agency": "agency name",',
      '      "publishedOrUpdated": "date or official page label",',
      '      "snippet": "how this source applies"',
      "    }",
      "  ],",
      '  "missingInfoChecklist": ["missing item 1", "missing item 2"],',
      '  "readyForFinalCheck": false,',
      '  "nextQuestion": "single best next question if not ready",',
      '  "followUpQuestions": ["optional backup question list"]',
      "}",
      "",
      `Goal: ${goal}`,
      `City/locality: ${city}`,
      `Known follow-up answers: ${JSON.stringify(followUpAnswers)}`,
      "",
      "Source text to convert:",
      effectiveRaw || "(no text returned from search tool)"
    ].join("\n");

    // Fallback: still use user API key for structured reasoning on every turn.
    fallbackAttempt = await callChatCompletionDetailed({
      apiKey: normalizedApiKey,
      provider: runtime.provider,
      model: runtime.model,
      systemPrompt:
        "You assist Pennsylvania policy intake. Return strict JSON only using the required schema.",
      userPrompt: repairPrompt,
      maxTokens: 900
    });

    if (fallbackAttempt.text) {
      effectiveRaw = fallbackAttempt.text;
      parsed = extractJsonObject(fallbackAttempt.text);
    }
  }

  const defaultNextQuestion = defaultNextQuestionByTurn(followUpAnswers);

  if (!parsed) {
    const fallbackSummary =
      (effectiveRaw || "").trim().replace(/\s+/g, " ").slice(0, 240) ||
      `I reviewed official Pennsylvania and ${city} sources for "${goal}" and need one more practical detail to continue.`;

    return {
      intentTitle: goal || "Pennsylvania service request",
      policySummary: fallbackSummary,
      citations: [],
      followUpQuestions: [defaultNextQuestion],
      nextQuestion: defaultNextQuestion,
      readyForFinalCheck: false,
      missingInfoChecklist: [defaultNextQuestion],
      liveSearchUsed: responsesAttempt.debug.ok,
      liveSearchAttempted: responsesAttempt.debug.attempted,
      liveSearchError: responsesAttempt.debug.ok ? undefined : responsesAttempt.debug.errorMessage,
      completionFallbackUsed: Boolean(fallbackAttempt?.debug.attempted),
      completionFallbackError:
        fallbackAttempt && !fallbackAttempt.debug.ok ? fallbackAttempt.debug.errorMessage : undefined
    };
  }

  const citations = readCitations(parsed.citations, extraAllowedDomains);
  const parsedFollowUpQuestions = readStringArray(parsed.followUpQuestions).slice(0, 5);
  const missingInfoChecklist = readStringArray(parsed.missingInfoChecklist).slice(0, 6);
  const readyForFinalCheck = readBoolean(parsed.readyForFinalCheck, false);
  const nextQuestion = readString(parsed.nextQuestion, defaultNextQuestion);
  const followUpQuestions =
    parsedFollowUpQuestions.length > 0 ? parsedFollowUpQuestions : [nextQuestion || defaultNextQuestion];
  const policySummary = readString(
    parsed.policySummary,
    `I reviewed official Pennsylvania and ${city} sources for "${goal}" and need one more practical detail to continue.`
  );
  const intentTitle = readString(parsed.intentTitle, "Pennsylvania service request");

  return {
    intentTitle,
    policySummary,
    citations,
    followUpQuestions,
    nextQuestion,
    readyForFinalCheck,
    missingInfoChecklist,
    liveSearchUsed: responsesAttempt.debug.ok,
    liveSearchAttempted: responsesAttempt.debug.attempted,
    liveSearchError: responsesAttempt.debug.ok ? undefined : responsesAttempt.debug.errorMessage,
    completionFallbackUsed: Boolean(fallbackAttempt?.debug.attempted),
    completionFallbackError:
      fallbackAttempt && !fallbackAttempt.debug.ok ? fallbackAttempt.debug.errorMessage : undefined
  };
}

export interface CitizenPlanPackage {
  summary: string;
  actionPlan: ActionStep[];
}

export interface ApiKeyVerificationResult {
  ok: boolean;
  message: string;
}

export async function verifyApiKeyWithAi(
  apiKey: string | undefined,
  options?: AiRuntimeOptions
): Promise<ApiKeyVerificationResult> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return {
      ok: false,
      message: "API key missing"
    };
  }

  const runtime = resolveRuntimeOptions(options);

  const attempt = await callChatCompletionDetailed({
    apiKey: normalizedApiKey,
    provider: runtime.provider,
    model: runtime.model,
    systemPrompt: "Return one short line: 'api_ok'.",
    userPrompt: "Health check",
    maxTokens: 20
  });

  if (attempt.debug.ok) {
    return {
      ok: true,
      message: `API key verified for ${runtime.provider}/${runtime.model}`
    };
  }

  return {
    ok: false,
    message: attempt.debug.errorMessage || "API verification failed"
  };
}

export async function generateCitizenPlanWithAi(
  apiKey: string | undefined,
  goal: string,
  city: string,
  intentTitle: string,
  policySummary: string,
  followUpAnswers: Record<string, string>,
  finalSupplement: string,
  citations: Citation[],
  transcriptText: string,
  options?: AiRuntimeOptions
): Promise<CitizenPlanPackage | null> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return null;
  }

  const runtime = resolveRuntimeOptions(options);

  const prompt = [
    "Build a Pennsylvania government service package for this citizen.",
    `Goal: ${goal}`,
    `City/locality: ${city}`,
    `Intent title: ${intentTitle}`,
    `Policy summary: ${policySummary}`,
    `Follow-up answers: ${JSON.stringify(followUpAnswers)}`,
    `Final supplement: ${finalSupplement || "none"}`,
    `Official citations: ${JSON.stringify(citations)}`,
    `Conversation transcript:\n${transcriptText}`,
    "",
    "Return strict JSON with schema:",
    "{",
    '  "summary": "plain-language overview",',
    '  "actionPlan": [',
    "    {",
    '      "order": 1,',
    '      "title": "action title",',
    '      "details": "what to do",',
    '      "timing": "when",',
    '      "materials": ["doc 1", "doc 2"],',
    '      "agency": "responsible agency"',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Provide 4 to 7 action steps.",
    "- Keep sequence practical and specific.",
    "- If uncertainty exists, include verification reminders in summary."
  ].join("\n");

  const raw = await callChatCompletion({
    apiKey: normalizedApiKey,
    provider: runtime.provider,
    model: runtime.model,
    systemPrompt:
      "You produce procedural guidance for Pennsylvania services. Keep it factual and concise. No legal advice.",
    userPrompt: prompt,
    maxTokens: 1100
  });

  if (!raw) {
    return null;
  }

  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return null;
  }

  const summary = readString(parsed.summary);
  const rawActionPlan = Array.isArray(parsed.actionPlan) ? parsed.actionPlan : [];
  const actionPlan: ActionStep[] = rawActionPlan
    .map((item, idx) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const rawStep = item as JsonObject;
      const materials = Array.isArray(rawStep.materials)
        ? rawStep.materials
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter((value) => value.length > 0)
        : [];
      const orderCandidate =
        typeof rawStep.order === "number" && Number.isFinite(rawStep.order)
          ? Math.max(1, Math.floor(rawStep.order))
          : idx + 1;

      const title = readString(rawStep.title, `Step ${idx + 1}`);
      const details = readString(rawStep.details, "Follow the official process and submit required forms.");
      const timing = readString(rawStep.timing, "As early as possible");
      const agency = readString(rawStep.agency, "Relevant Pennsylvania agency");

      return {
        order: orderCandidate,
        title,
        details,
        timing,
        materials,
        agency
      } satisfies ActionStep;
    })
    .filter((step): step is ActionStep => Boolean(step))
    .slice(0, 7);

  if (!summary || actionPlan.length === 0) {
    return null;
  }

  return {
    summary,
    actionPlan
  };
}

export async function generateStaffDraftWithAi(
  apiKey: string | undefined,
  caseSummary: string,
  citations: Citation[],
  options?: AiRuntimeOptions
): Promise<string | null> {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) {
    return null;
  }

  const runtime = resolveRuntimeOptions(options);

  const userPrompt = [
    `Citizen summary: ${caseSummary}`,
    `Official citations: ${JSON.stringify(citations)}`,
    "Draft a professional English response with concrete next steps, expected timeline, and agency contact path."
  ].join("\n");

  return callChatCompletion({
    apiKey: normalizedApiKey,
    provider: runtime.provider,
    model: runtime.model,
    systemPrompt:
      "You draft government staff replies. Keep it factual, procedural, and concise. Include uncertainty notice when evidence is incomplete.",
    userPrompt,
    maxTokens: 450
  });
}
