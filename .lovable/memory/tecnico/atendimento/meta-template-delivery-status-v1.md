---
name: Meta WhatsApp Delivery Status & Phone Normalization
description: handleStatus do meta-webhook persiste motivo do Meta + propaga falha para campaign_targets; normalizePhoneBR é obrigatório em todo envio
type: feature
---

# Status de entrega Meta e normalização de telefone

## Por que existe
Antes, `campaign_targets.status` ficava `sent` baseado apenas no retorno HTTP da Graph API (`wamid`). Quando o Meta reportava `failed/undelivered` via webhook de status, atualizávamos só `webchat_messages.delivery_status` — a campanha continuava mostrando "Enviada" e o usuário não sabia que nada chegou.

## Regra
1. **`meta-whatsapp-webhook` → `handleStatus`**:
   - Sempre persiste em `webchat_messages.metadata.meta_status` o `{status, timestamp, recipient_id, code, title, details}` do Meta.
   - Quando `status ∈ {failed, undelivered}` e a mensagem tem `conversation_id`, faz UPDATE em `campaign_targets` (match por `conversation_id`, `status='sent'`, `sent_at` nas últimas 24h) marcando `status='failed'` com `error = "<code> <title>: <details>"`.

2. **Normalização de telefone (DDI 55 + DDD + 9 + 8 dígitos)** é obrigatória em todo caminho de envio:
   - `_shared/phone.ts::normalizePhoneBR` é a única fonte de verdade.
   - `manual-outreach`: chama `normalizePhoneBR(lead.phone)`; se retornar null → `skipped: invalid_phone`.
   - `campaign-dispatcher`: revalida phone do lead antes de invocar `manual-outreach`; se inválido → target `skipped` com `error='invalid_phone'` (não gasta token IA).
   - `_shared/campaign-audience.ts`: ao montar audiência, exclui leads cujo `phone` não normaliza (quando `audience.has_phone !== false`).

3. **UI `CampaignDetail`**:
   - Mostra `nome · telefone formatado BR` (helper `formatBRPhone` em `src/lib/utils.ts`).
   - Badge usa `delivery_status` real do Meta quando disponível (`Entregue`, `Lida`, `Falha na entrega`), senão status do target.
   - Motivo amigável em PT-BR (mapa de códigos comuns: 131026, 131047, 131051, 132012, etc.).
