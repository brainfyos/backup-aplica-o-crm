-- ============================================================================
-- LEGADO — NÃO EXECUTAR EM PRODUÇÃO, REMIX OU SQL EDITOR
-- ============================================================================
-- Este arquivo é preservado somente como registro histórico. O fluxo atual do
-- projeto proíbe SQL avulso e exige que toda alteração estrutural seja criada
-- como uma nova migration incremental em supabase/migrations/, revisada,
-- testada e aplicada pelo executor autorizado da Lovable após aprovação.
--
-- Alguns índices descritos abaixo já foram criados por migrations posteriores;
-- outros ainda precisam de evidência por plano de execução. Executar este
-- arquivo criaria risco de divergência entre produção e novos Remixes.
-- Consulte: docs/perf/PRD-OTIMIZACAO-PERFORMANCE-PRODUCAO-E-REMIX.md
-- ============================================================================

-- ============================================================
-- PERFORMANCE FIX — Vendus Produção
-- Aplicar via: Supabase Dashboard → SQL Editor
-- TODOS os comandos usam CONCURRENTLY → NÃO travam tabelas
-- Execute um bloco por vez. Cada CREATE INDEX demora 1-5 min.
-- ============================================================

-- ── BLOCO 1: Índices funcionais em webchat_messages.metadata ──
-- Corta 40+ min/dia de carga no banco (queries #1, #3 do diagnóstico)
-- Antes: sequential scan de toda a tabela a cada busca por message ID
-- Depois: index seek direto

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wcmsg_meta_external_id
  ON public.webchat_messages ((metadata->>'external_id'))
  WHERE metadata->>'external_id' IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wcmsg_meta_evolution_msg_id
  ON public.webchat_messages ((metadata->>'evolution_message_id'))
  WHERE metadata->>'evolution_message_id' IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wcmsg_meta_wa_lid
  ON public.webchat_messages ((metadata->>'wa_lid'))
  WHERE metadata->>'wa_lid' IS NOT NULL;

-- ── BLOCO 2: Índice composto para Inbox render (query #5 e #13) ──
-- Acelera listagem de mensagens por conversa (tela de chat)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wcmsg_conv_created
  ON public.webchat_messages (conversation_id, created_at DESC)
  WHERE is_deleted = false;

-- ── BLOCO 3: Índice parcial para leads quentes/sem-dono (queries #9, #10) ──
-- Acelera Kanban e distribuição de leads

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_temp_assigned
  ON public.leads (organization_id, temperature, assigned_to)
  WHERE temperature IN ('hot', 'warm');

-- ── BLOCO 4: Índice para evolution_instances lookup (query #12) ──
-- 155k chamadas/período — lookup de instância WhatsApp

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evolution_inst_name
  ON public.evolution_instances (instance_name)
  WHERE status = 'connected';

-- ── BLOCO 5: Remover índices mortos (0 scans) ──
-- Libera RAM e acelera writes — só execute após confirmar que os índices
-- abaixo estão mesmo com 0 scans no seu dashboard do Supabase

-- VERIFICAR ANTES com:
-- SELECT indexname, idx_scan FROM pg_stat_user_indexes
-- WHERE relname IN ('webchat_messages','leads','lead_semantic_memory')
-- ORDER BY idx_scan ASC;

-- Descomente e execute apenas após confirmar 0 scans:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_lead_semantic_memory_embedding;
-- DROP INDEX CONCURRENTLY IF EXISTS webchat_messages_inbound_evolution_msg_uniq;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_wcmsg_meta_n; -- (se existir)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_utm_source;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_squad_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_lead_origin;

-- ── VERIFICAÇÃO FINAL ──
-- Rode isso após aplicar os índices para confirmar que foram criados:
SELECT
  indexname,
  tablename,
  pg_size_pretty(pg_relation_size(indexname::text)) AS tamanho
FROM pg_indexes
WHERE indexname LIKE 'idx_wcmsg_meta_%'
   OR indexname LIKE 'idx_leads_org_%'
   OR indexname LIKE 'idx_evolution_inst_%'
ORDER BY tablename, indexname;
