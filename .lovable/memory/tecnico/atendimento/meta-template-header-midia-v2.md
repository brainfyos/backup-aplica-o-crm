---
name: Meta Template Header Media v2
description: Mídia (vídeo/imagem/documento) do header HSM mora no próprio template (header_media_id + header_media_url), nunca em example.header_handle
type: feature
---
Template Meta WhatsApp Cloud com header IMAGE/VIDEO/DOCUMENT:

- A mídia mora no próprio template em `whatsapp_meta_templates.header_media_*`:
  - `header_media_id` (id retornado por `POST /{phone_number_id}/media`, válido ~30d)
  - `header_media_url` (signed URL no bucket privado `whatsapp-media`, 7d, regerada quando necessário)
  - `header_media_storage_path`, `header_media_uploaded_at`, `header_media_mime`, `header_media_filename`
- `example.header_handle` é APENAS sample de revisão Meta e quebra com 131053/403 — NUNCA usar em runtime.
- Upload: usuário sobe no Storage via `MetaWhatsAppTemplatesPanel → TemplateMediaConfig`, depois a edge function `meta-whatsapp-media-upload` faz POST resumable em `/{phone_number_id}/media` e popula as colunas.
- `meta-whatsapp-send` checa idade da mídia: ≥25 dias chama `meta-whatsapp-media-upload` em background para refresh do `media_id`.
- `meta-template-builder` resolve header em cascata: `mapping.header_media.media_id|link` → `__template.header_media_id|url` → erro `MISSING_HEADER_MEDIA` (422 com guidance).
- Builder envia `{ id: media_id }` como primária e cai para `{ link }` só quando não tiver id.
