// Traduções de objetivos/status da Graph API do Meta Ads para labels amigáveis pt-BR.

export const META_OBJECTIVE_LABELS: Record<string, string> = {
  // ODAX (novos)
  OUTCOME_LEADS: 'Captação de Leads',
  OUTCOME_SALES: 'Vendas',
  OUTCOME_ENGAGEMENT: 'Mensagens',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_APP_PROMOTION: 'Instalações de App',
  // Legados
  LEAD_GENERATION: 'Captação de Leads',
  CONVERSIONS: 'Vendas',
  PRODUCT_CATALOG_SALES: 'Vendas do Catálogo',
  MESSAGES: 'Mensagens',
  BRAND_AWARENESS: 'Reconhecimento',
  REACH: 'Alcance',
  LINK_CLICKS: 'Tráfego',
  PAGE_LIKES: 'Engajamento',
  POST_ENGAGEMENT: 'Engajamento',
  VIDEO_VIEWS: 'Visualizações de vídeo',
  STORE_VISITS: 'Visitas à loja',
  EVENT_RESPONSES: 'Eventos',
  APP_INSTALLS: 'Instalações de App',
};

export function objectiveLabel(raw?: string | null): string {
  if (!raw) return '—';
  const hit = META_OBJECTIVE_LABELS[raw];
  if (hit) return hit;
  // Fallback: title case
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const META_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  DELETED: 'Excluída',
  ARCHIVED: 'Arquivada',
  PENDING_REVIEW: 'Em revisão',
  DISAPPROVED: 'Reprovada',
  PREAPPROVED: 'Pré-aprovada',
  PENDING_BILLING_INFO: 'Aguardando pagamento',
  CAMPAIGN_PAUSED: 'Campanha pausada',
  ADSET_PAUSED: 'Conjunto pausado',
  IN_PROCESS: 'Processando',
  WITH_ISSUES: 'Com problemas',
};

export function statusLabel(raw?: string | null): string {
  if (!raw) return '—';
  return META_STATUS_LABELS[raw] ?? raw;
}

export function statusTone(raw?: string | null): 'active' | 'paused' | 'muted' | 'destructive' {
  if (!raw) return 'muted';
  if (raw === 'ACTIVE') return 'active';
  if (raw === 'PAUSED' || raw === 'CAMPAIGN_PAUSED' || raw === 'ADSET_PAUSED') return 'paused';
  if (raw === 'DISAPPROVED' || raw === 'WITH_ISSUES') return 'destructive';
  return 'muted';
}

// Lista para o filtro de Objetivo (deduplica labels)
export function objectiveOptions(): { value: string; label: string }[] {
  const seen = new Set<string>();
  const opts: { value: string; label: string }[] = [];
  for (const [value, label] of Object.entries(META_OBJECTIVE_LABELS)) {
    if (seen.has(label)) continue;
    seen.add(label);
    opts.push({ value, label });
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label));
}
