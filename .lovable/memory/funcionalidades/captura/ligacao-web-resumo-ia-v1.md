---
name: Ligação Web Resumo IA Pós-Chamada
description: Fase 6 — Ao encerrar, voice-call-end dispara voice-call-analyze (fire-and-forget) que gera resumo/sentimento/intenção/score/objeções/próximos passos e grava em voice_call_sessions.ai_analysis; painel de respostas mostra a análise e permite regerar
type: feature
---
`voice-call-end` chama `voice-call-analyze` em background após persistir a sessão (só se houver transcrição). A função é pública (verify_jwt=false), roda com service role e valida via `session_id`.

`voice-call-analyze` usa `aiChat` do `_shared/ai-call.ts` respeitando o roteamento IA da organização (Lovable Gateway ou chave própria). Modelo padrão: `google/gemini-3-flash-preview`, capability `analysis_insights`. Response format `json_object`.

Estrutura salva em `voice_call_sessions.ai_analysis` (jsonb) + timestamp em `ai_analysis_at`:
- `summary`, `sentiment` (positivo/neutro/negativo), `intent` (alta/media/baixa)
- `lead_score` 0-100, `objections[]`, `interests[]`, `next_steps[]`, `highlights[]`

UI: `VoiceCallResponsesTab` → `SessionDetail` renderiza seção "Análise IA" com badges de sentimento/intenção/score, resumo, falas marcantes, interesses (chips), objeções e próximos passos. Botão "Gerar/Regerar" invoca a edge diretamente.
