export type AiProvider = "openai" | "gemini" | "anthropic" | "xai";

export interface ProviderOption {
  value: AiProvider;
  label: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: "openai", label: "GPT (OpenAI)" },
  { value: "gemini", label: "Gemini (Google)" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "xai", label: "Grok (xAI)" }
];

export const PROVIDER_MODEL_OPTIONS: Record<AiProvider, ModelOption[]> = {
  openai: [
    { value: "gpt-4.1-mini", label: "gpt-4.1-mini (recommended)" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4.1", label: "gpt-4.1" }
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "gemini-2.0-flash (recommended)" },
    { value: "gemini-2.0-flash-lite", label: "gemini-2.0-flash-lite" },
    { value: "gemini-1.5-flash-latest", label: "gemini-1.5-flash-latest" }
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet-latest (recommended)" },
    { value: "claude-3-7-sonnet-latest", label: "claude-3-7-sonnet-latest" },
    { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest" }
  ],
  xai: [
    { value: "grok-2-latest", label: "grok-2-latest (recommended)" },
    { value: "grok-2-mini-latest", label: "grok-2-mini-latest" },
    { value: "grok-beta", label: "grok-beta" }
  ]
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  openai: PROVIDER_MODEL_OPTIONS.openai[0].value,
  gemini: PROVIDER_MODEL_OPTIONS.gemini[0].value,
  anthropic: PROVIDER_MODEL_OPTIONS.anthropic[0].value,
  xai: PROVIDER_MODEL_OPTIONS.xai[0].value
};

export function normalizeProvider(provider: string | undefined): AiProvider {
  const normalized = provider?.trim().toLowerCase();
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "gemini") {
    return "gemini";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }
  if (normalized === "xai") {
    return "xai";
  }
  return "openai";
}

export function normalizeModel(provider: AiProvider, model: string | undefined): string {
  const value = model?.trim();
  if (value) {
    return value;
  }
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}
