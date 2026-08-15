# Fase 0 — Validação da linhagem Git × Lovable × produção

**Data:** 14/08/2026

**Status:** gate bloqueado pelo ensaio controlado de Remix — schema íntegro, ACLs não reproduzidas

**Produção alterada:** não

**Migrations aplicadas nesta fase:** nenhuma

**Deploy/publicação:** nenhum

## 1. Objetivo

Separar quatro estados que não podem ser tratados como sinônimos:

1. arquivo presente no checkout local;
2. arquivo presente no `origin/main` do GitHub;
3. versão registrada em `supabase_migrations.schema_migrations`;
4. objeto efetivamente existente no catálogo de produção.

O gate existe para impedir dois erros opostos: concluir que uma migration está ausente apenas porque o checkout está desatualizado, ou mandar reaplicar SQL equivalente apenas porque um nome descritivo não aparece no ledger.

## 2. Correção do diagnóstico inicial

A inspeção inicial ocorreu quando a branch local `main` estava no commit `cd1d3f48`. Depois de atualizar a referência remota, o `origin/main` apontava para `0dc096d3`, 39 commits à frente.

Esses commits já continham:

- `20260813155644_cf155075-6d2f-44a1-a62c-9f5f2ca816e9.sql`;
- `20260813160724_5cc1a3ee-9c9a-409c-adfc-3ed3c80f2ee6.sql`.

Logo, a afirmação de que essas migrations estavam ausentes do GitHub estava incorreta. O problema era o checkout local desatualizado, não uma ausência no repositório remoto.

## 3. Sincronização executada

Antes do fast-forward foram verificados:

- zero commits exclusivos na branch local;
- zero sobreposição entre os 39 commits remotos e os arquivos modificados localmente;
- alteração preexistente do usuário em `supabase/functions/mcp/index.ts` preservada;
- documentos novos de performance inexistentes no remoto;
- duas cópias locais das migrations colidindo com arquivos já versionados no remoto.

As duas cópias redundantes, criadas durante a investigação, foram removidas da worktree depois de confirmar equivalência. Em seguida foi executado:

```text
git merge --ff-only origin/main
```

Resultado: fast-forward de `cd1d3f48` para `0dc096d3`, sem merge commit e sem conflito.

## 4. Migrations UUID confirmadas

| Versão | GitHub | Ledger de produção | Conteúdo GitHub × SQL registrado |
|---|---|---|---|
| `20260813155644` | presente | presente | idêntico após normalização de quebra final |
| `20260813160724` | presente | presente | idêntico após normalização de quebra final |

Hashes normalizados confirmados:

| Versão | Caracteres | MD5 |
|---|---:|---|
| `20260813155644` | 28.445 | `e2c3668ef5d0a6f611b04029d7a11bf7` |
| `20260813160724` | 3.167 | `e54329f7b3eea3ae2c3b9442cc6e7f9d` |

Conclusão: essas duas migrations foram aplicadas pela Lovable, estão registradas em produção e não devem ser reaplicadas.

## 5. Linhagem duplicada identificada

O Git contém pares de migrations muito semelhantes:

| Migration descritiva | Migration UUID/aplicada | Relação observada |
|---|---|---|
| `20260813152000_platform_worker_orchestration.sql` | `20260813155644_cf155075-...sql` | mesmo domínio e quase todo o mesmo SQL; diferenças no ajuste de cron e extração de configuração |
| `20260813164000_fix_platform_worker_cron_permissions.sql` | `20260813160724_5cc1a3ee-...sql` | mesmo corpo funcional; diferença essencialmente documental |

A cronologia dos commits indica o seguinte fluxo provável:

```text
migration descritiva criada no Git
  → alteração executada pelo fluxo da Lovable
  → Lovable registra/gera migration UUID
  → migration descritiva e migration UUID permanecem no Git
```

Essa interpretação é uma inferência baseada em commits, conteúdo e ledger. Ela explica por que o produto está estruturalmente atualizado mesmo quando o nome descritivo não aparece no histórico de migrations do banco.

## 6. Outras migrations de 13/08

O `origin/main` contém ainda:

- `20260813120000_mia_chat_workspace.sql`;
- `20260813143000_agent_intelligence_booking_guard.sql`;
- `20260813210000_mia_agent_learning_candidates.sql`.

Esses nomes não aparecem individualmente entre as últimas versões do ledger consultado. Entretanto, consultas somente leitura confirmaram em produção a presença dos principais efeitos estruturais:

### Chat e agenda da Mia

- `mia_chat_threads`;
- `mia_chat_messages`;
- `mia_chat_schedules`;
- `mia_chat_schedule_runs`;
- `mia_runtime_endpoints`;
- `next_mia_chat_schedule_run`;
- `claim_due_mia_chat_schedules`;
- `dispatch_mia_chat_schedule_worker`.

### Proteção de booking

- `create_agent_booking_guarded`;
- `enforce_booking_slot_uniqueness`.

### Aprendizado por agente

- coluna `mia_conversation_insights.agent_id`;
- `mia_agent_learning_candidates`;
- `publish_mia_agent_learning_candidate`;
- `enqueue_mia_agent_learning`.

### Orquestração de workers

- `platform_worker_registry`;
- `organization_worker_controls`;
- `platform_worker_dispatches`;
- `platform_worker_runtime_config`;
- `configure_platform_worker_dispatcher`;
- `dispatch_due_platform_workers`.

Conclusão: ausência do nome descritivo no ledger não equivale a ausência do objeto. Nenhum desses arquivos pode ser enviado em lote para reaplicação sem uma comparação semântica completa.

## 7. O que a Lovable aplicou

Para as duas migrations UUID, há prova direta no ledger. Para as migrations descritivas, há prova de que seus objetos existem, mas não há correspondência nominal um-para-um no ledger consultado.

O comportamento seguro para este projeto é:

- considerar o Git como fonte de verdade do contrato desejado;
- usar o ledger para saber quais versões foram formalmente registradas;
- usar o catálogo para comprovar o estado estrutural real;
- nunca decidir aplicação com base em uma única dessas fontes isoladamente;
- fornecer à Lovable somente arquivos exatos e verdadeiramente pendentes.

## 8. Validação do Remix controlado

### 8.1 Ambiente inspecionado

- projeto: `HOMOLOG-PERFORMANCE-FASE-0`;
- Lovable project ID: `e1fda70b-da08-4f4a-88df-9bdabc3e5d0c`;
- commit informado pela Lovable: `8173ee4dc345a994b721fe4a1c5145899fb38934`;
- banco: Supabase habilitado;
- publicação: não realizada;
- inspeção: exclusivamente consultas `SELECT` de catálogo e contagens agregadas;
- mutations, migrations, RPCs, bootstrap, deploy e publicação executados pelo agente: nenhum.

### 8.2 Paridade estrutural aprovada

Produção e Remix apresentaram exatamente os mesmos totais estruturais no schema `public`:

| Objeto | Produção | Remix |
|---|---:|---:|
| tabelas base | 253 | 253 |
| views | 9 | 9 |
| colunas | 3.969 | 3.969 |
| rotinas | 351 | 351 |
| policies RLS | 581 | 581 |
| índices | 824 | 824 |

Também foram confirmados no Remix:

- as dez tabelas críticas de chat, aprendizado e orquestração;
- RLS habilitada nas dez tabelas;
- as nove funções críticas esperadas;
- a coluna `mia_conversation_insights.agent_id`.

### 8.3 Isolamento de dados aprovado

As contagens abaixo estavam em zero no Remix:

- `auth.users`;
- `organizations`;
- `profiles`;
- `leads`;
- `webchat_messages`;
- `marketing_ads`;
- `org_marketing_credentials`;
- `platform_worker_dispatches`;
- `storage.objects`.

Nenhum e-mail, telefone, conteúdo de mensagem, token ou credencial foi consultado ou exibido.

### 8.4 Ledger não reproduzido

O schema `supabase_migrations` e a relação `supabase_migrations.schema_migrations` não existem no Remix. A Lovable materializou o estado estrutural atual, mas não preservou o ledger observado em produção.

Isso é evidência de que o Remix não executou/reproduziu a linhagem como um replay nominal das 440 migrations. O schema final ficou equivalente, mas não há rastreabilidade interna para decidir migrations futuras somente pelo histórico do banco. Essa conclusão é uma inferência direta da combinação entre catálogo estrutural idêntico e ausência total do ledger.

### 8.5 Bootstrap operacional pendente, sem vazamento de configuração

O Remix foi criado sem dados de configuração ou jobs:

- `platform_worker_runtime_config`: zero registros;
- `cron.job`: zero registros;
- dispatcher consolidado ativo: zero;
- crons legados ativos: zero.

Esse estado é seguro antes do primeiro acesso: não há URL, anon key, worker secret nem cron da produção no Remix. O código versionado prevê que `setup-super-admin` execute `ensure_platform_bootstrap` e depois `configure_platform_worker_dispatcher` com as variáveis do próprio ambiente. Portanto, cron e configuração só podem ser validados depois que a correção de segurança for aplicada, as Edge Functions exatas forem publicadas pelo fluxo autorizado e o primeiro super admin for configurado.

### 8.6 Bloqueio crítico: ACLs não reproduzidas

O Remix recriou todas as rotinas e tabelas com os privilégios padrão do projeto, mas não preservou os `REVOKE`/`GRANT` explícitos das migrations.

#### Rotinas

| Indicador | Produção | Remix | Divergência |
|---|---:|---:|---:|
| rotinas executáveis por `PUBLIC` | 294 | 351 | +57 |
| rotinas executáveis por `anon` | 312 | 351 | +39 |
| rotinas executáveis por `authenticated` | 332 | 351 | +19 |
| rotinas `SECURITY DEFINER` | 189 | 189 | 0 |
| `SECURITY DEFINER` executáveis por `PUBLIC` | 133 | 189 | +56 |
| `SECURITY DEFINER` executáveis por `anon` | 151 | 189 | +38 |
| `SECURITY DEFINER` executáveis por `authenticated` | 170 | 189 | +19 |

Entre as rotinas indevidamente expostas estão `claim_due_mia_chat_schedules`, `configure_platform_worker_dispatcher`, `dispatch_due_platform_workers` e `dispatch_mia_chat_schedule_worker`. As migrations versionadas restringem essas rotinas a `service_role`, e produção confirma esse contrato. No Remix, elas aparecem concedidas também a `PUBLIC`, `anon` e `authenticated`.

#### Tabelas

O Remix concedeu os sete privilégios de tabela a `anon` e `authenticated` em todas as 262 relações públicas retornadas pela visão de privilégios. Produção possui restrições explícitas, entre outras, para:

- `mia_runtime_endpoints`;
- `mia_runtime_secrets`;
- `mia_open_conversation_analysis_queue`;
- `organization_worker_controls`;
- `platform_worker_dispatches`;
- `platform_worker_registry`;
- `platform_worker_runtime_config`.

As tabelas críticas têm RLS, o que reduz parte do risco de acesso direto, mas RLS não substitui o contrato de ACL e não corrige a exposição de funções `SECURITY DEFINER`. O gate é, portanto, bloqueante.

### 8.7 Conclusão do ensaio

O Remix prova três comportamentos distintos:

1. schema, policies e índices são materializados corretamente;
2. dados operacionais, crons e configuração por ambiente não são copiados;
3. ledger e ACLs explícitas não são reproduzidos.

Logo, a premissa de que “a Lovable executa todas as migrations necessárias” não é suficiente para este fluxo. Neste ensaio, ela entregou o estado estrutural final, mas não o histórico nem todos os efeitos de segurança das migrations.

### 8.8 Revalidação após ignorar secrets opcionais

A interface da Lovable permaneceu aguardando valores para `AGENT_IMPORT_TOKEN` e `LAUNCH_META_INSIGHTS_SECRET`. O usuário selecionou `skip`, e o projeto passou a indicar conclusão em 14/08/2026, sem publicação. Nenhum valor de secret foi fornecido ao agente ou consultado no banco.

Depois dessa conclusão, todos os checks read-only foram repetidos. O resultado permaneceu idêntico:

- commit do projeto: `8173ee4dc345a994b721fe4a1c5145899fb38934`;
- totais estruturais: 253 tabelas, 9 views, 3.969 colunas, 351 rotinas, 581 policies e 824 índices;
- `supabase_migrations`: ausente;
- rotinas concedidas a `PUBLIC`, `anon` e `authenticated`: 351 para cada papel;
- rotinas `SECURITY DEFINER` concedidas aos três papéis: 189 para cada papel;
- usuários, organizações, perfis, leads, mensagens, anúncios, credenciais, mídias e dispatches: zero;
- `platform_worker_runtime_config`: zero registros;
- `cron.job`: zero registros.

Conclusão: os secrets ignorados não eram a causa do ledger ausente nem dos ACLs não reproduzidos. Eles pertencem a integrações opcionais e podem permanecer sem valor enquanto essas funcionalidades não forem habilitadas. O `skip` encerrou a espera da interface, mas não executou uma etapa adicional de migrations ou segurança no banco.

### 8.9 Comparação com outros dois Remixes

Foram inspecionados, somente em leitura, mais dois projetos criados por Remix:

| Projeto | Lovable project ID | Commit | Data aproximada do snapshot |
|---|---|---|---|
| `HOMOLOG - Remix Oficial Vendus v5` | `fd16d5dc-d442-4368-815b-d1608e3e7923` | `2111b0ecb9718d6aa123c8b8fcca55de2f052d60` | 07/08/2026 |
| `REMOVER V1` | `ad6f1ff3-b59c-4cc4-a972-317740f48a11` | `e646d21d7c65eb49245f548f8ad1b43fe27d13d6` | 03/08/2026 |

#### Inventário comparativo

| Indicador | Produção atual | Remix 14/08 | Remix 07/08 | Remix 03/08 |
|---|---:|---:|---:|---:|
| tabelas base `public` | 253 | 253 | 231 | 231 |
| relações `public` comparadas | 262 | 262 | 240 | 240 |
| rotinas `public` | 351 | 351 | 327 | 319 |
| linhas no ledger de migrations | 259 | 0 | 1 | 1 |
| última migration registrada | `20260813160724` | nenhuma | `20260807003515` | `20260803172011` |
| funções ausentes contra produção atual | 0 | 0 | 24 | 32 |
| relações ausentes contra produção atual | 0 | 0 | 22 | 22 |
| funções comuns com ACL/security divergente | 57 | 57 | 39 | 22 |
| relações comuns com RLS/ACL divergente | 0 | 11 | 2 | 2 |
| tabelas públicas na publication Realtime | 7 | 0 | 0 | 0 |
| buckets de Storage com metadata equivalente | 17 | 17 | 17 | 17 |

Os dois Remixes antigos são snapshots de commits anteriores e, por isso, a ausência das 22 tabelas e das funções mais recentes não prova falha no momento em que foram criados. Entretanto, ambos exibem a mesma categoria de perda em objetos que já existiam antes de agosto.

Exemplos comprovados:

- `get_auth_user_id_by_email`, criada/restringida antes desses Remixes, está limitada a `postgres` e `service_role` em produção, mas aparece executável por `PUBLIC`, `anon` e `authenticated` nos dois Remixes;
- `get_or_create_meta_master_key` apresenta a mesma divergência;
- as relações `platform_settings` e `voice_calls` perderam restrições de ACL nos dois snapshots;
- nenhum dos três Remixes possui tabelas públicas na publication `supabase_realtime`, embora produção possua sete.

Assim, a perda de ACLs e publication é recorrente e independente dos secrets recusados no Remix de 14/08.

### 8.10 Grau de certeza e limites da inspeção

No banco, a comparação é determinística. Foram comparados nomes, assinaturas completas, `SECURITY DEFINER`, grants efetivos, RLS, colunas, defaults, constraints, índices, policies, triggers, views, enums/domains, publications, buckets, crons e ledger.

No Remix de 14/08, os fingerprints de definições de funções, constraints, índices, policies, triggers, relações, views e tipos são idênticos aos de produção. As 3.969 colunas também têm nomes, tipos, nulabilidade, defaults e geração logicamente idênticos; a única diferença física é a numeração interna posterior a uma coluna removida de `leads`, sem diferença no contrato lógico. Portanto, o schema funcional foi copiado com alta confiança, e as diferenças comprovadas estão em ACLs, publication, ledger e configuração runtime ainda não inicializada.

Esta inspeção não consegue certificar por SQL:

- valores de secrets, que não devem ser lidos ou copiados;
- configuração externa de OAuth/domínios/Auth no painel;
- quais Edge Functions estão efetivamente publicadas;
- firewall, DNS e integrações externas.

Esses itens precisam de checklist por ambiente e validação nas ferramentas oficiais, nunca de cópia de valores da produção.

### 8.11 Outras diferenças que não devem ser tratadas como falha

- os 17 buckets e suas configurações públicas/privadas foram reproduzidos nos três Remixes;
- `pg_net` e `vector` estão em versões gerenciadas mais novas nos Remixes; não se deve fazer downgrade para imitar produção;
- partições internas da publication `supabase_realtime_messages_publication` são gerenciadas pelo Supabase e variam por data;
- usuários e organizações existentes nos dois Remixes antigos foram criados nesses ambientes e não indicam cópia de tenants da produção;
- crons legados presentes nos snapshots antigos correspondem ao contrato anterior ao dispatcher consolidado.

## 9. Documentação operacional

Foram marcados como legados:

- `docs/perf/APLICAR-PRODUCAO-AGORA.sql`;
- `docs/perf/DEPLOY-COMPLETO.md`.

Eles não devem orientar SQL Editor, `supabase db push`, deploy direto ou uso manual de `service_role`.

## 10. Estado do gate

| Critério | Estado |
|---|---|
| checkout local alinhado ao `origin/main` | aprovado |
| mudanças locais do usuário preservadas | aprovado |
| migrations UUID presentes no GitHub | aprovado |
| migrations UUID registradas em produção | aprovado |
| hashes GitHub × produção | aprovado |
| objetos das migrations descritivas presentes em produção | aprovado por amostragem estrutural completa dos objetos principais |
| reaplicação em produção | não necessária e não executada |
| audit local pós-sincronização | aprovado: 7 baselines, 440 migrations, 209 funções, 258 tabelas e 105 RPCs estáticas |
| testes permanentes | aprovado: 72 testes, zero falha |
| build pós-sincronização | aprovado: 5.016 módulos transformados |
| Remix controlado no commit atual | executado somente em leitura |
| paridade estrutural do Remix | aprovado: contagens e objetos críticos idênticos |
| ausência de dados operacionais e secrets | aprovado por contagens e ausência de configuração |
| ledger de migrations no Remix | bloqueado: schema/relação ausentes |
| paridade de ACLs de funções | bloqueado: 57 concessões extras para `PUBLIC` |
| paridade de ACLs de tabelas | bloqueado: restrições explícitas não reproduzidas |
| bootstrap de cron/configuração | pendente por desenho e proibido antes da correção de ACL |
| Fase 0 encerrada | não — bloqueio de segurança e rastreabilidade |

## 11. Validação local pós-sincronização

Foram executados com sucesso:

- `npm run audit:remix-db`;
- `npm run test:mia` — 19 testes;
- `npm run test:agents` — 3 testes;
- `npm run test:campaigns` — 3 testes;
- `npm run test:url-guard` — 4 testes;
- `npm run test:marketing-p0` — 43 testes;
- `npm run build`.

Total: 72 testes aprovados, zero falha, audit aprovado e build concluído. Permanecem apenas avisos preexistentes de chunking/import dinâmico e base de Browserslist desatualizada; nenhum bloqueia esta fase.

## 12. Homologação existente

Foi localizado o projeto privado `HOMOLOG - Remix Oficial Vendus v5`, com banco Supabase habilitado. A inspeção somente leitura mostrou:

- último registro de migration: `20260807003515`;
- ausência das quatro tabelas do dispatcher;
- ausência do cron `platform-worker-dispatcher-every-minute`.

Esse ambiente foi criado/atualizado antes das mudanças de 13/08 e não representa um Remix do commit atual. Ele não pode validar a cadeia nova sem que migrations sejam aplicadas, ação que não foi autorizada nem executada. Também não deve ser atualizado às cegas com todos os arquivos, devido à linhagem equivalente descrita neste relatório.

## 13. Plano mínimo para desbloquear a Fase 0

### 13.1 Causa raiz

O mecanismo de Remix materializa definições estruturais, policies e índices, mas não preserva o ledger nem os ACLs explícitos de objetos. Como os defaults do Supabase concedem acesso amplo a funções e tabelas, objetos recriados sem os `REVOKE`/`GRANT` das migrations ficam mais permissivos que produção.

### 13.2 Menor escopo possível

Após autorização explícita, implementar localmente:

1. uma migration incremental, sem alterar migrations já aplicadas, que reconcilie somente os ACLs divergentes de funções e tabelas com o contrato versionado/observado em produção;
2. pré-checks e pós-checks que falhem se uma assinatura ou relação esperada não existir;
3. uma regra permanente em `npm run audit:remix-db` para detectar rotinas/tabelas críticas com concessões acima do contrato;
4. documentação do fato de que o ledger não é copiado e não pode ser usado isoladamente para decidir aplicação num Remix.

Nenhuma migration será aplicada pelo agente. A configuração de cron/dispatcher continuará sendo feita pelo bootstrap já versionado, depois da correção e do primeiro super admin.

### 13.3 Riscos e impacto em produção

- revogar função usada pelo frontend pode interromper um fluxo se o contrato desejado for levantado incorretamente;
- assinaturas sobrecarregadas exigem ACL por assinatura completa;
- tabela com grant reduzido pode afetar acesso legítimo se a policy/consumidor não for mapeado;
- aplicar a correção somente ao Remix, sem versioná-la, recriaria a divergência no próximo cliente.

Mitigação: gerar a matriz a partir do Git e comparar com produção, limitar a mudança às diferenças comprovadas, executar testes de consumidores e aplicar sempre pela migration incremental versionada.

### 13.4 Plano de testes e validação

1. audit local valida todas as assinaturas e grants esperados;
2. testes permanentes e build continuam verdes;
3. migration é revisada estaticamente e testada em banco controlado;
4. usuário/execução autorizada aplica somente o arquivo aprovado no Remix;
5. consultas read-only repetem a matriz de ACLs e exigem paridade com produção;
6. publicar somente `setup-super-admin` e `platform-bootstrap`, se a Lovable ainda não os tiver publicado;
7. configurar o primeiro super admin pelo fluxo da aplicação;
8. validar, somente em leitura, uma linha de configuração apontando para o próprio Remix e um único cron consolidado;
9. confirmar novamente zero dado operacional herdado;
10. encerrar a Fase 0 somente após aprovação explícita do usuário.

### 13.5 Rollback

- código/audit: revert pelo Git;
- banco: nunca editar/apagar a migration aplicada; usar nova migration compensatória com os grants anteriores;
- cron/configuração: usar o reparo idempotente versionado ou desativação por fluxo autorizado;
- produção não recebe mudança nesta correção até que o diff mostre que seus ACLs já correspondem ao estado desejado.

### 13.6 Decisão necessária

A Fase 1 não começa enquanto este bloqueio não for corrigido e revalidado. A criação da migration de ACL e a alteração do auditor exigem autorização explícita do responsável técnico.

O detalhamento de implementação, testes de banco, inventário das 217 Edge Functions, JWT, secrets, Auth, Realtime, segundo Remix e critérios formais de saída está em `docs/perf/PLANO-FASE-0-CERTIFICACAO-REMIX-PARIDADE-INTEGRAL.md`.
