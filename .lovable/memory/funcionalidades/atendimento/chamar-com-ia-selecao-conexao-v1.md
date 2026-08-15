---
name: Chamar com IA — seleção explícita de conexão + template HSM
description: Diálogo "Chamar com IA" exige template HSM aprovado quando canal é API Oficial (Meta) fora da janela 24h; cria conversa no Inbox antes do envio e loga falhas
type: feature
---
`CallWithAIDialog` resolve a conexão ativa (escolha explícita ou auto). Quando o canal é Meta API Oficial e o lead não tem janela 24h aberta (verificada via `useLeadWAWindow` → RPC `is_within_24h_window`), o dialog:
- esconde o seletor "Modo de contato" (Direto/Conversacional não se aplica a HSM);
- renderiza `<TemplatePicker>` obrigatório, filtrado pela connection_id ativa, listando só templates `APPROVED`;
- bloqueia "Iniciar" até template + variáveis estarem preenchidos;
- envia `template_config: { template_id, variable_mapping }` para `manual-outreach`.

Para Evolution OU Meta dentro da janela 24h: fluxo de texto livre IA segue inalterado.

Backend `manual-outreach`:
- Cria/recupera `webchat_conversations` ANTES do envio (com `meta_connection_id` ou `evolution_instance_id` setados) para que a conversa sempre apareça no Inbox, mesmo se o envio falhar.
- Guard explícito: `connection_type==='meta_whatsapp'` sem `template_config` e fora da janela 24h → retorna `OUT_OF_WINDOW_NEEDS_TEMPLATE` antes de chamar a IA (economiza tokens).
- Em falha de envio, insere mensagem com `delivery_status='failed'` + `metadata.error` em `webchat_messages` para diagnóstico no Inbox.
- Path template: chama `meta-whatsapp-send` com `type:'template'`, passando `conversation_id` (a função já registra a mensagem renderizada com preview do HSM).
- Path Meta texto livre: passa `conversation_id` para `meta-whatsapp-send` registrar; path Evolution: insere mensagem própria após sucesso.

`useLeadWAWindow(leadId)`: busca última conversa do lead e chama RPC `is_within_24h_window`. Retorna `{ withinWindow, hasConversation }`.
