---
name: Inbox bloqueio janela 24h
description: Composer bloqueia mensagens livres fora da janela 24h para conexões Meta API Oficial e exige envio de template HSM
type: feature
---
Inbox + Meta WhatsApp Cloud API:

- `ChatArea`: quando `channel === 'meta_whatsapp'` e `metaConnectionId`, consulta `useLeadWAWindow(leadId)`. Se `withinWindow === false`, substitui `ChatInput` por banner com botão "Enviar template" abrindo `SendTemplateDialog`.
- `LeadContextPanel`: bloco "Template HSM" sempre presente nas conexões Meta. Mostra estado da janela (verde dentro / âmbar fora) + botão "Enviar template" como atalho permanente.
- `SendTemplateDialog`: usa `TemplatePicker` filtrado por `connectionIds=[metaConnectionId]`. Chama `meta-whatsapp-send` com `type: 'template'`. Erros são traduzidos via `metaErrorMessage`.
- `MessageBubble`: lê `metadata.meta_status` (code/title/details) via `metaErrorFromMetadata` para tooltip PT-BR em bolhas falhadas.
- Dict de erros: `src/lib/metaErrors.ts` (códigos Meta como 131026, 131047, 131051, 131053, etc.) — compartilhado com `CampaignDetail`.
