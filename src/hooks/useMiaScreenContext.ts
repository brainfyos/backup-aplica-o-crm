// useMiaScreenContext — registra o contexto da tela atual para a Mia.
// Singleton de módulo: qualquer página importa e chama useMiaScreenContext(data).
// A Mia acessa via get_screen_context tool para saber o que o usuário está vendo.

import { useEffect } from "react";

// ── Mapa de tabs → descrição humana ──────────────────────────────────────────

export const TAB_META: Record<string, { label: string; description: string }> = {
  dashboard:        { label: "Dashboard",              description: "Visão geral da operação com métricas de conversas, leads e equipe" },
  mia:              { label: "Mia Intelligence",       description: "Painel de inteligência da Mia com dashboard, cérebro de conhecimento e insights" },
  pipeline:         { label: "Pipeline / Kanban",      description: "Funil de vendas com leads organizados por etapa de negociação" },
  leads:            { label: "Lista de Leads",         description: "Todos os leads com filtros por temperatura, responsável e etapa" },
  calendar:         { label: "Agenda",                 description: "Calendário com reuniões e eventos agendados da equipe" },
  "inbox-chat":     { label: "Chat / Atendimentos",    description: "Inbox com conversas ativas de WhatsApp, Instagram, webchat e outros canais" },
  "inbox-panel":    { label: "Painel de Atendimentos", description: "Visão consolidada do status de todos os atendimentos em andamento" },
  "inbox-radar":    { label: "Radar IA",               description: "Análise de atendimentos e oportunidades por inteligência artificial" },
  "inbox-followup": { label: "Follow-Up / Cadências",  description: "Sequências de follow-up agendadas e cadências ativas" },
  "inbox-reports":  { label: "Relatórios",             description: "Relatórios de atendimento, conversão e desempenho da equipe" },
  agents:           { label: "Agentes IA",             description: "Configuração e gestão dos agentes de inteligência artificial" },
  campaigns:        { label: "Campanhas",              description: "Campanhas de mensagem automatizadas para leads em lote" },
  cadences:         { label: "Cadências Inteligentes", description: "Sequências automáticas de follow-up por IA" },
  team:             { label: "Equipe",                 description: "Gestão de vendedores, setores e squads" },
  products:         { label: "Negócios / Produtos",    description: "Produtos e serviços cadastrados com pipelines associados" },
  sectors:          { label: "Setores",                description: "Setores e filas de atendimento" },
  operation:        { label: "Central de Operação",    description: "Visão central de toda a operação em tempo real" },
  connections:      { label: "Conexões",               description: "Integrações com WhatsApp, Instagram e outros canais" },
};

// ── Singleton de contexto (módulo-level, acessível de qualquer lugar) ─────────

export interface MiaScreenContext {
  tab:         string;
  label:       string;
  description: string;
  url:         string;
  capturedAt:  string;
  entityType?: "lead" | "conversation" | "seller" | "agent" | null;
  entityId?:   string | null;
  entityLabel?: string | null;
  extra?:      Record<string, any>; // dados adicionais registrados pela página
}

let _ctx: MiaScreenContext = {
  tab:         "dashboard",
  label:       "Dashboard",
  description: "Visão geral da operação",
  url:         "/admin",
  capturedAt:  new Date().toISOString(),
};

/** Retorna o contexto atual da tela (usado pelo useMiaSession via callback) */
export function getCurrentScreenContext(): MiaScreenContext {
  return { ..._ctx, capturedAt: new Date().toISOString() };
}

/** Atualiza o contexto — chamado pelo MiaContext ao mudar de rota */
export function updateScreenContextFromRoute(tab: string, url: string) {
  const meta = TAB_META[tab] ?? { label: tab, description: `Tela: ${tab}` };
  _ctx = { ..._ctx, tab, label: meta.label, description: meta.description, url, capturedAt: new Date().toISOString() };
}

// ── Hook para páginas registrarem contexto adicional ──────────────────────────

/**
 * Hook que páginas chamam para fornecer contexto extra à Mia.
 * Exemplo de uso no Pipeline:
 *   useMiaScreenContext({ entityType: 'lead', extra: { stage: 'Proposta', total: 23 } })
 */
export function useMiaScreenContext(ctx: Partial<Omit<MiaScreenContext, "tab" | "label" | "description" | "url" | "capturedAt">>) {
  useEffect(() => {
    _ctx = { ..._ctx, ...ctx, capturedAt: new Date().toISOString() };
    return () => {
      // Limpa campos específicos ao desmontar
      _ctx = {
        ..._ctx,
        entityType: null,
        entityId:   null,
        entityLabel:null,
        extra:      undefined,
        capturedAt: new Date().toISOString(),
      };
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ctx)]);
}
