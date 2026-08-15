# Causa da queda do login e do banco

## O que foi verificado agora (medido, não suposto)

Estado atual do banco (pós-restart, saudável):
- Memória 65%, disco 17%, conexões 20/60, pool 1/200, 0 reinícios desde o boot.
- Banco 492 MB, WAL em 1024 MB.
- **Transações revertidas desde o boot: 2.364.201** — número altíssimo para poucas horas de operação.

Consultas que dominam o banco (`pg_stat_statements`):
- Listagem do inbox (`webchat_conversations` por organização, ordenada por `last_message_at`): **206.463 chamadas, média 198 ms, pico 3,9 s, ~40.800 segundos de CPU acumulados** — sozinha, várias vezes mais que todo o resto somado.
- Busca de leads por lote: 136.494 chamadas.
- Busca em `webchat_messages` por campos dentro de `metadata` (JSON, sem índice adequado): 73.210 chamadas, pico 4,3 s.
- Insert de memória semântica com embeddings: média 406 ms por chamada.

Erros que se repetem em loop nos logs do Postgres (ainda hoje):
- `column pipeline_stages.organization_id does not exist`
- `column profiles.user_id does not exist`
- `permission denied for table platform_settings`

Cada um desses é uma consulta que executa, falha e é descartada — é exatamente o que produz o volume de transações revertidas.

## Causa mais provável

A indisponibilidade não veio de acesso externo nem de perda de dados. O padrão é de **esgotamento de conexões no pooler causado por carga interna própria**:

1. O inbox e telas relacionadas fazem polling contínuo e consultas caras (a listagem de conversas, sujeita a checagem de RLS linha a linha, e buscas em JSON sem índice).
2. Somam-se milhares de consultas que falham por erros de esquema/permissão, cada uma consumindo uma conexão e sendo revertida.
3. Com todas as conexões ocupadas por consultas lentas e por retentativas, o PgBouncer abriu o circuit breaker; a partir daí tudo passou a dar timeout — inclusive o `/token` do login e o painel de tabelas.
4. O restart limpou as conexões presas e o serviço voltou. Isso explica por que o status externo dizia "saudável" enquanto nenhuma consulta respondia.

## Sobre acesso externo

Não há indício de invasão: os registros de autenticação disponíveis mostram apenas logins legítimos por senha e renovação de token, sem rajada de tentativas falhas, e não houve reinício não planejado nem alteração de credenciais.

Ressalva honesta: a retenção de logs da plataforma cobre apenas a última hora, então **não é possível provar retroativamente** o que ocorreu na janela exata do incidente. A conclusão acima se apoia em métricas cumulativas (que sobrevivem ao restart) e nos erros ainda ativos, não em logs da janela.

## Plano para não repetir

### Fase 1 — Eliminar as consultas que falham em loop
1. Corrigir a consulta que referencia `pipeline_stages.organization_id` (coluna inexistente) para filtrar pela relação real.
2. Corrigir a consulta que referencia `profiles.user_id` (a coluna correta é `id`).
3. Identificar quem lê `platform_settings` sem privilégio e ajustar o acesso (função com privilégio de serviço ou política adequada), em vez de repetir a chamada negada.

### Fase 2 — Baratear a listagem de conversas
4. Revisar a política de RLS de `webchat_conversations` para não executar função por linha: pré-calcular contexto do usuário em funções estáveis e comparar colunas diretamente.
5. Criar índice adequado para a busca de `webchat_messages` pelos campos usados dentro de `metadata`.

### Fase 3 — Reduzir volume de chamadas
6. Aumentar os intervalos de polling curtos onde já existe atualização em tempo real, e pausar polling de telas fora de foco.
7. Tornar o boot do app não bloqueante, para que uma lentidão de backend não gere tela branca.

### Fase 4 — Visibilidade
8. Registrar um verificador periódico de saúde (conexões, transações revertidas, consultas lentas) para detectar a saturação antes de virar indisponibilidade.

## Detalhes técnicos
- Correções de código: função que consulta `pipeline_stages`, consulta que usa `profiles.user_id`, chamadas a `platform_settings`, hooks com `refetchInterval` curto e o guard de boot.
- Migrações: reescrita das policies de `webchat_conversations` e índice em `webchat_messages(metadata)`.
- Nenhuma mudança visual ou de funcionalidade prevista.

Sugestão: aprovar Fases 1 e 2, medir de novo as transações revertidas e o tempo médio da listagem, e então seguir para 3 e 4.
