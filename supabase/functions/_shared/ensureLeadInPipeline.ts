// Garante que um lead esteja posicionado no pipeline (primeiro estágio do produto).
// Idempotente: se o lead já tem current_stage_id, não faz nada.
// Se não tem product_id, escolhe o primeiro produto ativo da organização.

export async function ensureLeadInPipeline(
  supabase: any,
  leadId: string,
  fallbackOrgId?: string,
): Promise<{ stage_id: string | null; product_id: string | null }> {
  try {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, organization_id, product_id, current_stage_id')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead) return { stage_id: null, product_id: null };
    if (lead.current_stage_id) {
      return { stage_id: lead.current_stage_id, product_id: lead.product_id };
    }

    const orgId = lead.organization_id || fallbackOrgId;
    let productId: string | null = lead.product_id;

    if (!productId && orgId) {
      const { data: prod } = await supabase
        .from('products')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      productId = prod?.id ?? null;
    }

    if (!productId) return { stage_id: null, product_id: null };

    // Primeiro estágio (menor order_index, ignorando won/lost)
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', productId)
      .or('is_won.is.null,is_won.eq.false')
      .or('is_lost.is.null,is_lost.eq.false')
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!stage?.id) return { stage_id: null, product_id: productId };

    const updates: Record<string, unknown> = {
      current_stage_id: stage.id,
      updated_at: new Date().toISOString(),
    };
    if (!lead.product_id) updates.product_id = productId;

    await supabase.from('leads').update(updates).eq('id', leadId);

    // Auditoria (não-fatal se falhar)
    try {
      await supabase.from('lead_stage_history').insert({
        lead_id: leadId,
        stage_id: stage.id,
      });
    } catch (_) { /* ignore */ }


    return { stage_id: stage.id, product_id: productId };
  } catch (e) {
    console.warn('[ensureLeadInPipeline] error:', (e as Error).message);
    return { stage_id: null, product_id: null };
  }
}
