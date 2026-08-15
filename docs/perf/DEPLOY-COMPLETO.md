# Deploy Completo — Mia Intelligence

> **Documento legado — não utilizar como procedimento de produção.** As
> instruções abaixo que usam `supabase db push`, SQL Editor, deploy direto ou
> invocação com `service_role` não fazem parte do fluxo atual. Toda mudança deve
> ser versionada no Git, aplicada pelo executor autorizado da Lovable e seguir
> `docs/perf/PRD-OTIMIZACAO-PERFORMANCE-PRODUCAO-E-REMIX.md`. Este arquivo é
> mantido apenas para contexto histórico até sua substituição definitiva.

Execute na ordem abaixo. Cada passo é seguro e reversível.

## Passo 1 — Banco de dados (migrations)

```bash
cd "C:\Documentos Gui\Claude Code\sales-guide-buddy-11"
supabase link --project-ref syvhrtaksjcvhrzhbltt
supabase db push
```

O que vai ao banco:
- `mia_business_knowledge` (vetorial de padrões aprendidos)
- `mia_conversation_insights` (análise por conversa)
- `mia_learn_queue` + trigger automático ao fechar conversa
- `mia_business_metrics` (métricas por canal/vendedor/hora)
- `mia_action_catalog` + `mia_autonomy_settings` + `mia_action_outcomes`
- ADD COLUMNs em `mia_actions` (autonomy_level, undo_payload, etc.)

---

## Passo 2 — Indexes de performance (Supabase Dashboard → SQL Editor)

Abra: https://supabase.com/dashboard/project/syvhrtaksjcvhrzhbltt/sql/new

Execute o arquivo `docs/perf/APLICAR-PRODUCAO-AGORA.sql` bloco por bloco.
Cada bloco usa CONCURRENTLY — sem travar tabelas.

---

## Passo 3 — Edge Functions

```bash
supabase functions deploy mia-chat
supabase functions deploy mia-learn
supabase functions deploy mia-learn-worker
supabase functions deploy mia-aggregate
supabase functions deploy mia-briefing-generator
supabase functions deploy mia-generate
supabase functions deploy mia-undo-action
supabase functions deploy mia-measure-outcomes
supabase functions deploy mia-execute-action
supabase functions deploy mia-tools
supabase functions deploy mia-realtime-session
supabase functions deploy campaign-dispatcher
```

---

## Passo 4 — Crons (Supabase Dashboard → Edge Functions → Schedules)

| Function              | Cron               | O que faz |
|-----------------------|--------------------|-----------|
| `mia-learn-worker`    | `*/5 * * * *`      | Processa fila de conversas encerradas (5min) |
| `mia-aggregate`       | `0 * * * *`        | Computa métricas horárias |
| `mia-briefing-generator` | `0 10,21 * * *` | Gera briefing 7h e 18h (Brasília = 10h e 21h UTC) |
| `mia-measure-outcomes`| `*/30 * * * *`     | Mede resultado das ações da Mia |

---

## Passo 5 — Processar histórico de conversas existentes (uma vez)

Para a Mia aprender do histórico fechado, rode manualmente:

```bash
# Chama a função uma vez para enfileirar as conversas já encerradas
curl -X POST "https://syvhrtaksjcvhrzhbltt.supabase.co/functions/v1/mia-learn-worker" \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

Ou no Supabase Dashboard → Edge Functions → mia-learn-worker → Invoke.

Depois execute mia-aggregate para popular mia_business_metrics:
```bash
curl -X POST "https://syvhrtaksjcvhrzhbltt.supabase.co/functions/v1/mia-aggregate" \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

---

## O que ativa com cada passo

| Passo | O que passa a funcionar |
|-------|------------------------|
| 1 (db push) | Governança completa, aprendizado automático, undo de ações |
| 2 (indexes) | Inbox e webhook WhatsApp muito mais rápidos |
| 3 (functions) | Chat com GPT-4o real, Geradores, aprendizado automático |
| 4 (crons) | Mia aprende sozinha a cada 5min, briefing diário automático |
| 5 (histórico) | Mia aprende das conversas já encerradas imediatamente |

---

## Verificação rápida após deploy

```bash
# Testa se mia-chat está respondendo
curl -X POST "https://syvhrtaksjcvhrzhbltt.supabase.co/functions/v1/mia-chat" \
  -H "Authorization: Bearer TOKEN_DO_USUARIO" \
  -H "Content-Type: application/json" \
  -d '{"message": "como está a operação?"}'
```
