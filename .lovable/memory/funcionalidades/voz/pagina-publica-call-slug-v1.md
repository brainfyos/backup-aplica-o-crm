---
name: Public Call Landing Page
description: Página pública /call/:slug permite qualquer visitante iniciar ligação IA com voice_agent configurado, com captura opcional de nome/contato
type: feature
---
Voice agents ganham `public_slug` (unique) + `public_enabled` + `public_config` (headline/subheadline/cta_label/accent_color/require_name/require_contact/post_redirect_url).

Fluxo:
- `/call/:slug` (rota pública sem auth) chama `voice-agent-public-info` (verify_jwt=false) para carregar branding.
- Formulário mínimo: nome + WhatsApp/e-mail (configurável).
- Iniciar chamada → `useGrokVoiceCall({ publicSlug, visitor })` invoca `grok-voice-public-call` (verify_jwt=false).
- Edge function cria lead visitante (`source='ligacao_publica'`) + `call_log` com `direction='web_public'`, `initiated_by=null`, `metadata.visitor` — mesma pipeline de tools/outcomes.
- Após encerrar: se `public_config.post_redirect_url` definido, redireciona.

RLS: policy `voice_agents_public_read` permite SELECT anônimo apenas onde `public_enabled=true`.
Editor: aba "🌐 Página pública" no VoiceAgentsTab expõe slug + toggle + share link + copy.
