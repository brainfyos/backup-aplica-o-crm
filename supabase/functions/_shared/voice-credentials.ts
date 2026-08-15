// Server-only helper: resolve chaves de IA (OpenAI, xAI) de uma organização
// diretamente da tabela `org_ai_credentials`, com descriptografia correta
// (AES-GCM via `meta-crypto.ts`). NUNCA faz fallback para env vars globais —
// tudo é multi-tenant e configurado em Admin → Integrações.
//
// Uso:
//   const key = await getOrgProviderKey(admin, orgId, 'openai');
//   if (!key) return jsonResponse({ error: 'AI_NO_CREDENTIAL', provider: 'openai' }, 400);

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.0';
import { decryptSecret } from './meta-crypto.ts';

export type ExternalAIProvider = 'openai' | 'anthropic' | 'gemini' | 'xai';

async function readStoredKey(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith('v1:')) {
    try { return await decryptSecret(stored); } catch { return null; }
  }
  return stored; // legacy plaintext
}

/**
 * Retorna a chave descriptografada da organização para o provedor pedido.
 * Retorna `null` quando não há credencial cadastrada — nunca cai em env global.
 */
export async function getOrgProviderKey(
  admin: SupabaseClient,
  orgId: string,
  provider: ExternalAIProvider,
): Promise<string | null> {
  if (!orgId) return null;
  const { data } = await admin
    .from('org_ai_credentials')
    .select('api_key_encrypted')
    .eq('organization_id', orgId)
    .eq('provider', provider)
    .maybeSingle();
  return await readStoredKey(data?.api_key_encrypted);
}

export const NO_CREDENTIAL_HINT: Record<ExternalAIProvider, string> = {
  openai: 'Cadastre sua chave OpenAI em Admin → Integrações → OpenAI.',
  anthropic: 'Cadastre sua chave Anthropic em Admin → Integrações → Anthropic.',
  gemini: 'Cadastre sua chave Google Gemini em Admin → Integrações → Gemini.',
  xai: 'Cadastre sua chave xAI em Admin → Integrações → xAI (Grok).',
};
