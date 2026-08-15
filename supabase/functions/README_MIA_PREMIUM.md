# Stack Mia — projeto oficial

Este repositório privado passa a ser a fonte oficial do código da Mia. O antigo
`vendus-mia` deve permanecer somente como histórico até o fim do rollout; ele não
deve receber novos deploys porque está baseado numa versão antiga da plataforma.

As funções já publicadas `mia-tools`, `mia-realtime-session`,
`mia-prepare-action` e `mia-execute-action` continuam no Supabase e **não devem
ser removidas**. Elas serão reconciliadas com este repositório em etapas, sem
sobrescrever as correções recentes de autenticação, isolamento e roteamento de IA.

As tabelas existentes `mia_actions`, `mia_communications`, `mia_logs`,
`mia_daily_summaries` e `mia_user_memory` também permanecem intactas. Migrações
da Mia são sempre aditivas e idempotentes; nunca use `DROP TABLE` nesses objetos.

O primeiro módulo oficial é a inteligência de conversas abertas:

- `mia-open-conversations-report`: endpoint autenticado para admin/manager;
- `mia-open-conversation-worker`: worker restrito ao `service_role`;
- flags `organizations.features.mia` e `mia_open_analysis`, ambas opt-in;
- avaliações com citações verificadas contra a transcrição.

Consulte `docs/mia/ROLLOUT_MIA_OFICIAL.md` antes de aplicar qualquer mudança em
produção.
