// Tabela de preços por modelo (USD por 1M tokens).
// Atualize conforme os provedores divulgarem novos preços.
// Última atualização: 2026-06

export interface ModelPrice {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

// Lookup por "provider:model"
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // ---- OpenAI ----
  'openai:gpt-5':              { input: 5.0,  output: 15.0 },
  'openai:gpt-5.2':            { input: 5.0,  output: 15.0 },
  'openai:gpt-5-mini':         { input: 0.30, output: 1.20 },
  'openai:gpt-5-nano':         { input: 0.10, output: 0.40 },
  'openai:gpt-4o':             { input: 2.50, output: 10.0 },
  'openai:gpt-4o-mini':        { input: 0.15, output: 0.60 },
  'openai:gpt-4o-transcribe':  { input: 6.0,  output: 0 },
  'openai:gpt-4o-mini-transcribe': { input: 3.0, output: 0 },
  'openai:whisper-1':          { input: 0.36, output: 0 },
  'openai:text-embedding-3-large': { input: 0.13, output: 0 },
  'openai:text-embedding-3-small': { input: 0.02, output: 0 },

  // ---- Anthropic ----
  'anthropic:claude-opus-4-1':       { input: 15.0, output: 75.0 },
  'anthropic:claude-opus-4':         { input: 15.0, output: 75.0 },
  'anthropic:claude-sonnet-4-5':     { input: 3.0,  output: 15.0 },
  'anthropic:claude-sonnet-4':       { input: 3.0,  output: 15.0 },
  'anthropic:claude-haiku-4-5':      { input: 1.0,  output: 5.0 },
  'anthropic:claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'anthropic:claude-3-5-haiku-latest':  { input: 0.80, output: 4.0 },

  // ---- Google Gemini ----
  'gemini:gemini-3.1-pro-preview':   { input: 2.50, output: 10.0 },
  'gemini:gemini-3-flash-preview':   { input: 0.30, output: 2.50 },
  'gemini:gemini-2.5-pro':           { input: 1.25, output: 10.0 },
  'gemini:gemini-2.5-flash':         { input: 0.30, output: 2.50 },
  'gemini:gemini-2.5-flash-lite':    { input: 0.10, output: 0.40 },
  'gemini:gemini-2.0-flash':         { input: 0.10, output: 0.40 },
  'gemini:text-embedding-004':       { input: 0.02, output: 0 },

  // ---- Lovable Gateway (mesmos preços da OpenAI/Google na conta Lovable) ----
  'lovable:google/gemini-3-flash-preview':   { input: 0.30, output: 2.50 },
  'lovable:google/gemini-3.1-pro-preview':   { input: 2.50, output: 10.0 },
  'lovable:google/gemini-2.5-pro':           { input: 1.25, output: 10.0 },
  'lovable:google/gemini-2.5-flash':         { input: 0.30, output: 2.50 },
  'lovable:google/gemini-2.5-flash-lite':    { input: 0.10, output: 0.40 },
  'lovable:openai/gpt-5':                    { input: 5.0,  output: 15.0 },
  'lovable:openai/gpt-5.2':                  { input: 5.0,  output: 15.0 },
  'lovable:openai/gpt-5-mini':               { input: 0.30, output: 1.20 },
  'lovable:openai/gpt-5-nano':               { input: 0.10, output: 0.40 },
};

// Fallback médio por provedor quando o modelo não está no mapa
const PROVIDER_FALLBACK: Record<string, ModelPrice> = {
  openai:    { input: 1.0,  output: 3.0 },
  anthropic: { input: 3.0,  output: 15.0 },
  gemini:    { input: 0.30, output: 2.50 },
  lovable:   { input: 0.30, output: 2.50 },
};

export const DEFAULT_USD_BRL = 5.45;

export function getModelPrice(provider: string, model: string | null | undefined): ModelPrice {
  if (model) {
    const exact = MODEL_PRICING[`${provider}:${model}`];
    if (exact) return exact;
  }
  return PROVIDER_FALLBACK[provider] ?? { input: 0, output: 0 };
}

export function estimateCostUSD(provider: string, model: string | null | undefined, promptTokens: number, completionTokens: number): number {
  const p = getModelPrice(provider, model);
  return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
}

export function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export const PROVIDER_COLORS: Record<string, string> = {
  lovable:   'hsl(262 83% 58%)', // violet
  openai:    'hsl(160 84% 39%)', // emerald
  anthropic: 'hsl(25 95% 53%)',  // orange
  gemini:    'hsl(199 89% 48%)', // sky
};

export const PROVIDER_LABELS: Record<string, string> = {
  lovable: 'Lovable AI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};
