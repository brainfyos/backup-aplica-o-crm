// Helper de assinatura de atendente humano.
// Forma final: `*Nome:*\n` prefixado em texto/caption de envios manuais.
// Ordem de verificação:
//   1. organizations.signature_enabled (global) — se false, retorna null
//   2. user_permissions.signature_enabled (override por usuário) — se false, retorna null
//   3. profiles.signature_display_name || profiles.full_name
// Não aplica em mensagens automáticas (IA, cadências, templates, follow-ups).

export type SignatureParams = {
  orgId: string | null | undefined;
  userId: string | null | undefined;
};

export async function getAttendantSignature(
  supabase: any,
  { orgId, userId }: SignatureParams,
): Promise<string | null> {
  if (!orgId || !userId) return null;

  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('signature_enabled')
      .eq('id', orgId)
      .maybeSingle();
    if (!org?.signature_enabled) return null;

    const { data: perms } = await supabase
      .from('user_permissions')
      .select('signature_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    if (perms && perms.signature_enabled === false) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('signature_display_name, full_name')
      .eq('id', userId)
      .maybeSingle();

    const raw = (profile?.signature_display_name || profile?.full_name || '').trim();
    if (!raw) return null;

    return `*${raw}:*\n`;
  } catch (err) {
    console.warn('[signature] failed to resolve attendant signature:', err);
    return null;
  }
}

/** Prefixa texto se houver assinatura E texto não estiver vazio. */
export function applySignature(text: string | null | undefined, signature: string | null): string {
  const t = (text ?? '').toString();
  if (!signature) return t;
  if (!t.trim()) return t; // não assina vazio (ex.: áudio puro sem caption)
  return `${signature}${t}`;
}
