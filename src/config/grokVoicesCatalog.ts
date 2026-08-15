// Catálogo estático de vozes nativas da xAI Grok.
// Ajuste conforme a xAI publicar novas vozes ou renomear IDs.
// Cada voz aparece automaticamente na aba "Vozes" e nos seletores.

export interface GrokVoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  language: string;
  description: string;
  origin: 'native';
}

export const GROK_NATIVE_VOICES: GrokVoiceOption[] = [
  { id: 'ara',   name: 'Ara',   gender: 'female',  language: 'pt-BR', description: 'Feminina, natural e acolhedora — padrão BR', origin: 'native' },
  { id: 'jade',  name: 'Jade',  gender: 'female',  language: 'pt-BR', description: 'Feminina, tom mais executivo', origin: 'native' },
  { id: 'eve',   name: 'Eve',   gender: 'female',  language: 'en-US', description: 'Feminina EN, tom leve', origin: 'native' },
  { id: 'rex',   name: 'Rex',   gender: 'male',    language: 'pt-BR', description: 'Masculina, tom firme e claro', origin: 'native' },
  { id: 'sol',   name: 'Sol',   gender: 'male',    language: 'pt-BR', description: 'Masculina, tom jovem e amigável', origin: 'native' },
  { id: 'orion', name: 'Orion', gender: 'male',    language: 'en-US', description: 'Masculina EN, tom profundo', origin: 'native' },
  { id: 'aria',  name: 'Aria',  gender: 'neutral', language: 'multi', description: 'Neutra, uso geral', origin: 'native' },
];

export const DEFAULT_GROK_VOICE_ID = 'ara';

export const grokVoiceById = (id?: string | null) =>
  GROK_NATIVE_VOICES.find((v) => v.id === id);
