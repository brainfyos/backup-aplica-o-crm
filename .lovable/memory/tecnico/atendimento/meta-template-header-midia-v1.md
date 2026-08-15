---
name: Meta Template Header Mídia
description: Builder envia componente header IMAGE/VIDEO/DOCUMENT com link explícito (mapping.header_media) ou fallback do sample aprovado (example.header_handle[0]); sem isso a Meta retorna #132012.
type: feature
---
- `_shared/meta-template-builder.ts` resolve `values.header_media` em `resolveVariableValues` (mapping `header_media: { source: 'static', static_value }` ou string; fallback `example.header_handle[0]`).
- `buildSendComponents` emite `{ type: 'header', parameters: [{ type: 'image'|'video'|'document', [fmt]: { link, [filename?] } }] }` para HEADER não-TEXT quando há link; HEADER TEXT segue só com `parameters` de variáveis.
- `campaign-dispatcher`: target só vai pra `status='sent'` quando `result.sent===true && !result.error`; demais casos (erro da Meta) vão pra `failed` com `error`, parando de mascarar falha como sucesso.
