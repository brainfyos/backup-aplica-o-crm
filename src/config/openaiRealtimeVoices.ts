// Catálogo de vozes da OpenAI Realtime API (gpt-realtime-2.1).
// Vozes mais naturais e humanizadas que Grok — recomendado para atendimento
// premium onde a naturalidade importa mais que custo.

export interface OpenAIRealtimeVoice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  description: string;
  recommended?: boolean;
}

export const OPENAI_REALTIME_VOICES: OpenAIRealtimeVoice[] = [
  { id: 'alloy',   name: 'Alloy',   gender: 'neutral', description: 'Neutra, balanceada. Uso geral.' },
  { id: 'ash',     name: 'Ash',     gender: 'male',    description: 'Masculina, calma e clara.' },
  { id: 'ballad',  name: 'Ballad',  gender: 'male',    description: 'Masculina, suave e melódica.' },
  { id: 'cedar',   name: 'Cedar',   gender: 'male',    description: 'Masculina natural e premium.' },
  { id: 'coral',   name: 'Coral',   gender: 'female',  description: 'Feminina expressiva — muito humana.', recommended: true },
  { id: 'echo',    name: 'Echo',    gender: 'male',    description: 'Masculina profunda, confiante.' },
  { id: 'marin',   name: 'Marin',   gender: 'female',  description: 'Feminina natural e premium — recomendada para Realtime.', recommended: true },
  { id: 'sage',    name: 'Sage',    gender: 'female',  description: 'Feminina quente e natural — ideal para PT-BR.', recommended: true },
  { id: 'shimmer', name: 'Shimmer', gender: 'female',  description: 'Feminina brilhante, jovem.' },
  { id: 'verse',   name: 'Verse',   gender: 'male',    description: 'Masculina versátil e articulada.' },
];

export const DEFAULT_OPENAI_VOICE_ID = 'marin';

export const openaiVoiceById = (id?: string | null) =>
  OPENAI_REALTIME_VOICES.find((v) => v.id === id);

export const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
