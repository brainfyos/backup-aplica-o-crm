---
name: Refatoração Voz — Perfis + Vozes Grok
description: voice_agents virou perfil fino ligado a product_agents; vozes Grok nativas + clonagem via xAI
type: feature
---

## Perfis de Voz
- `voice_agents` recebeu 4 colunas novas (aditivas, retrocompat):
  - `product_agent_id` → FK para agente de IA real (prompt/objetivo vêm dele)
  - `grok_voice_id` → voz Grok escolhida (nativa ou clone)
  - `voice_settings jsonb`, `context_override text`
- `system_prompt`/`objective`/`voice_option` viraram fallback nullable.
- `xai-voice-call-start` e `voice-campaign-tick` resolvem `product_agent_id` e usam seu prompt; passam `voice: grok_voice_id`.
- UI: `VoiceAgentsTab` renomeada para "Perfis de Voz" — seletor de agente + seletor de voz (com ▶ preview) + contexto extra.

## Vozes Grok
- Catálogo estático em `src/config/grokVoicesCatalog.ts` (ara, jade, eve, rex, sol, orion, aria).
- Tabela `voice_clones` (RLS por org; admin write) armazena clones da xAI.
- Bucket privado `voice-samples` (path `{org_id}/{clone_id}/…`), RLS admin.
- Edge functions:
  - `voice-preview` → xAI `/v1/audio/speech` retorna mp3 direto
  - `voice-clone-create` → upload samples + POST xAI `/v1/voices`
  - `voice-clone-delete` → DELETE xAI + storage + banco
- Nova aba "Vozes" (`VoiceVoicesTab`) lista nativas + clonadas, com preview e wizard de clonagem (até 3 amostras).
- Endpoints xAI provisórios — se retornarem 4xx, clone marca `failed` e UI mostra motivo.

## Como escolher voz nas campanhas
- `VoiceCampaignsTab` agora lista "Perfis de Voz" (mesma tabela `voice_agents`).
- Nenhum quebra: perfis antigos sem `product_agent_id` caem no fallback legado.
