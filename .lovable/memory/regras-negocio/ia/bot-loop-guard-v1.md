---
name: AI Bot-Loop Guard
description: Global pre-check that aborts AI replies when the other side is detected as another bot/autoresponder, before any token is spent
type: feature
---

Regra global de economia de tokens: antes de chamar o gateway de IA em qualquer canal conversacional (WhatsApp Evolution, WhatsApp Meta Cloud, Webchat, Instagram Direct, futuros), o sistema avalia se o outro lado é outro bot/IA/autoresponder. Se sim, **aborta a chamada de IA** e marca a conversa para humano.

## Sensibilidade: Balanceada

- **1 sinal forte** dispara imediatamente
- **2 sinais fracos** em 3 turnos / 30min disparam

### Sinais fortes
Autodeclaração ("sou (um) assistente/atendente/bot/robô/IA/inteligência artificial", "I'm an AI", "as an AI", "I am a chatbot/virtual assistant"), "este atendimento é automático", "auto-reply", "out of office", prefixos `[bot]`, `🤖`, `Bot:`, `Assistant:`.

### Sinais fracos
1. Cadência sub-humana: 3 mensagens em <4s
2. Primeira resposta >280 chars + ≥2 bullets/numerações
3. Eco literal (≥80% das palavras da nossa última saída)
4. Mensagem inbound idêntica 2x seguidas (>20 chars)
5. Saudação genérica massiva vinda do lead ("Olá! Em que posso ajudar?")

## Efeito ao disparar
- Conversa `status = 'waiting_human'`, `current_agent_id = NULL`
- `bot_loop_detected_at = now()`, `bot_loop_reason = <motivo>`
- `cadence-stop` em enrollments ativos do lead
- `campaign_targets` queued/sending → cancelled com `error='bot_loop_detected'`
- Insere `admin_notifications` (severity warning)
- Log em `ai_router_failures` (provider='guard')
- **Silencioso** — nenhuma mensagem é enviada de volta

## Onde está implementado
- `supabase/functions/_shared/bot-loop-guard.ts` — heurísticas + `checkBotLoop` + `tripBotLoop` + `isBotLoopActive`
- `webchat-bot/index.ts` (entry-point único de IA conversacional — cobre Evolution, Meta WA, IG, Webchat via delegação) — chama `checkBotLoop` após o human-takeover precheck
- `cadence-tick/index.ts`, `campaign-dispatcher/index.ts`, `manual-outreach/index.ts` — chamam check passivo (skip se flag ativa em qualquer conversa do lead)
- Colunas em `webchat_conversations`: `bot_loop_detected_at`, `bot_loop_reason`, `bot_loop_strike_count`, `bot_loop_last_strike_at`
- RPC `public.reset_bot_loop(_conversation_id uuid)` — limpa flag e zera strikes (super_admin / admin/manager da org / membro do setor)

## Reativar IA
Quando humano confirmar que do outro lado é gente, chamar `supabase.rpc('reset_bot_loop', { _conversation_id })` (ou via UI futura na inbox).

## Testes manuais
- "Olá! Sou um assistente virtual da empresa X" → trip imediato (sinal forte `virtual_assistant_pt`)
- 3 mensagens em 2s, primeira com bullets longos → trip no 2º strike
- Conversa humana normal não dispara
