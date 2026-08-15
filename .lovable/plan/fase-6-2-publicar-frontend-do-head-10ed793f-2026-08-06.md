# Fase 6.2 — Publicar frontend do HEAD 10ed793f

Exceção de segurança autorizada: `chat_media_bucket_public_read` aceito **temporariamente**, restrito à conclusão da Fase 6.2, com correção obrigatória na Fase 7. O risco não é considerado definitivamente aceito.

## O que será feito

1. Registrar a exceção do achado `chat_media_bucket_public_read` na base de segurança, com o texto de justificativa: temporária, restrita à Fase 6.2, correção obrigatória na Fase 7.
2. Registrar as contagens de referência **antes** da publicação:
   - objetos em `storage.objects` do bucket `chat-media`;
   - registros em `webchat_messages`.
3. Publicar somente o frontend correspondente ao HEAD `10ed793f`.
4. Smokes pós-publicação (somente leitura):
   - painel de configuração Evolution abre;
   - instâncias existentes continuam visíveis;
   - configurações e proxy respondem;
   - mensagens históricas de texto visíveis;
   - abrir ao menos uma imagem, um áudio e um documento antigos;
   - recontar `storage.objects` (chat-media) e `webchat_messages` e comparar com o passo 2.
5. Parar e devolver os resultados sanitizados. A Fase 7 não é iniciada.

## Restrições respeitadas

- Nenhuma migration executada, editada ou reaplicada.
- Nenhuma alteração em policies, buckets ou objetos de Storage.
- Nenhuma Edge Function publicada ou republicada.
- Apenas publicação de frontend.

## Rollback

Se qualquer mídia histórica deixar de abrir: interromper, reverter somente o frontend para a última versão estável, não tocar no banco e não excluir arquivos.

## Nota técnica

O smoke de mídia usará URLs já gravadas nas mensagens (`/storage/v1/object/public/chat-media/...`) — leitura pura, sem gravação. A verificação de contagens é feita por consulta somente leitura ao banco.
