# PRD — Otimização de performance em produção e propagação White Label

**Produto:** Vendus White Label

**Status:** Em execução — Fase 0 bloqueada por perda de ACLs no Remix controlado

**Versão do documento:** 1.0

**Data:** 14/08/2026

**Ambiente crítico:** produção Supabase/Lovable

**Fonte de verdade:** repositório Git

## 1. Resumo executivo

Este PRD organiza a correção dos principais vetores de lentidão identificados no ambiente de produção sem transformar capacidade adicional de banco em substituto para otimização de software.

O diagnóstico encontrou quatro frentes prioritárias:

1. a Central de Operações abre aproximadamente 38 a 39 consultas ao banco em paralelo;
2. a sincronização de marketing reprocessa, por padrão, 90 dias de informações a cada 10 minutos e regrava registros inalterados;
3. algumas experiências, especialmente o Cérebro e jornadas, carregam conjuntos grandes ou ilimitados para agregação no navegador;
4. o histórico contém migrations descritivas e versões UUID equivalentes geradas pela Lovable, exigindo uma validação explícita da cadeia usada por novos Remixes.

O banco não demonstrou bloqueio, deadlock, baixa taxa de cache ou volume de armazenamento que justifique um upgrade imediato como solução principal. Existe, porém, margem limitada para picos de conexão. A decisão de compute será tomada somente depois das otimizações e de uma nova medição comparável.

Este trabalho será executado em fases independentes, reversíveis e com gates formais. Toda mudança estrutural deverá ser uma migration incremental versionada e reproduzível em um Remix novo. Nenhuma etapa autoriza SQL avulso, alteração direta do banco, publicação automática ou uso do Agente da Lovable para análise exploratória.

## 2. Contexto e problema

### 2.1 Sintomas percebidos

- lentidão intermitente na aplicação;
- maior sensibilidade durante rotinas automáticas;
- consultas administrativas com elevado fan-out;
- picos históricos de conexões próximos do limite configurado;
- alta atividade de autovacuum e WAL em tabelas pequenas de marketing;
- risco de o ambiente principal e futuros Remixes divergirem silenciosamente.

### 2.2 Evidências da linha de base

As métricas abaixo são uma fotografia do diagnóstico realizado em 14/08/2026. Estatísticas acumuladas do `pg_stat_statements` devem ser interpretadas desde seu reset, ocorrido em 23/07/2026, e não como tráfego de um único dia.

| Indicador | Linha de base observada | Interpretação |
|---|---:|---|
| Versão PostgreSQL | 17.6 | versão atual do ambiente diagnosticado |
| Tamanho do banco | aproximadamente 561 MB | não indica pressão de armazenamento |
| Limite de conexões | 60 | pouca margem para fan-out e bursts simultâneos |
| Conexões médias, 7 dias | aproximadamente 32 | ocupação habitual moderada |
| P95 de conexões, 7 dias | 44 | já consome parcela relevante da margem |
| Pico amostrado | 62 | inclui processos internos; não representa necessariamente 62 clientes |
| Cache hit do banco | aproximadamente 99,98% | sem evidência atual de falta de RAM para o working set |
| Cache hit de tabelas | aproximadamente 99,95% | saudável |
| Cache hit de índices | aproximadamente 99,98% | saudável |
| Deadlocks | 0 | não é causa observada |
| Sessões aguardando lock | 0 na amostragem | não é causa observada |
| `idle in transaction` | 0 na amostragem | saudável |
| Visitantes recentes | 1 | a lentidão não coincidiu com pico real de usuários |

### 2.3 Evidências da aplicação

- `src/components/admin/operation/OperationCenter.tsx` monta seis hooks de dados na mesma tela.
- `src/hooks/useOperationCenter.ts` executa múltiplos blocos de `Promise.all`, com contagens repetidas, joins e agregações no cliente.
- `supabase/functions/marketing-sync/index.ts` usa uma janela padrão de 90 dias e efetua `SELECT` e `UPSERT` em loops.
- `src/hooks/useCerebroRealData.ts` carrega todas as conversas abertas sem limite e depois enriquece o conjunto com novas consultas.

### 2.4 Amplificação de escrita no marketing

Desde o reset das estatísticas:

| Tabela | Registros vivos aproximados | Atualizações acumuladas aproximadas | Diagnóstico |
|---|---:|---:|---|
| `marketing_conversion_metrics_daily` | 4.935 | 11,9 milhões | regravação extrema |
| `marketing_insights_daily` | 868 | 1,5 milhão | regravação extrema |
| `marketing_ads` | 138 | 205 mil | regravação desproporcional |
| `marketing_creatives` | 133 | 205 mil | regravação desproporcional |
| `marketing_adsets` | 57 | 125 mil | regravação desproporcional |
| `marketing_campaigns` | 23 | 35 mil | regravação desproporcional |

O comportamento produz WAL, autovacuum e autoanalyze repetidos, além de competir por conexões e CPU com o tráfego interativo.

### 2.5 Linhagem de migrations e sincronização local

A primeira inspeção foi feita sobre um checkout local 39 commits atrás do `origin/main`, o que produziu a hipótese incorreta de que as migrations `20260813155644` e `20260813160724` estavam ausentes do Git. Depois do `fetch` e do fast-forward, confirmou-se que ambas estão no GitHub, possuem conteúdo normalizado idêntico ao SQL registrado e foram aplicadas em produção.

O ponto de governança real é outro: o Git contém migrations descritivas e migrations UUID quase equivalentes produzidas no fluxo da Lovable. A produção possui os objetos esperados mesmo quando o nome do arquivo descritivo não aparece individualmente em `supabase_migrations.schema_migrations`. Portanto, presença no Git, existência do objeto e registro nominal da migration devem ser comparados antes de qualquer comando de aplicação; arquivos não podem ser reaplicados em lote apenas porque o nome não aparece no ledger.

## 3. Objetivos

### 3.1 Objetivos de produto

- reduzir a latência percebida nas telas operacionais;
- preservar atualização e consistência dos dados de marketing;
- evitar que rotinas automáticas degradem fluxos interativos;
- manter compatibilidade retroativa durante o rollout;
- tornar todas as otimizações parte da baseline de novos Remixes;
- obter dados suficientes para decidir objetivamente sobre upgrade de compute.

### 3.2 Objetivos técnicos mensuráveis

Os valores abaixo são metas iniciais. A Fase 1 confirmará os baselines e poderá ajustar metas antes da implementação, desde que a mudança seja registrada neste PRD.

| Métrica | Meta de aceite |
|---|---:|
| Chamadas de dados ao abrir a Central de Operações | no máximo 2 |
| P95 da resposta agregada da Central | até 500 ms em produção; alvo de 250 ms |
| Pico de conexões de clientes após estabilização | abaixo de 45 |
| Redução dos upserts de marketing por ciclo equivalente | pelo menos 90% |
| Redução de WAL das tabelas de marketing | pelo menos 80% em janela comparável |
| Sobreposição de execuções do marketing | zero |
| Conversas retornadas ao Cérebro por request | sempre limitado e documentado |
| Consultas de jornada/webhook sem paginação | zero nos fluxos incluídos no escopo |
| Deadlocks introduzidos | zero |
| Regressões de autorização cross-tenant | zero |
| Migrations sem classificação de linhagem | zero antes da primeira nova migration |
| `npm run audit:remix-db` | aprovado |
| Banco criado para Remix a partir do Git | estruturalmente equivalente ao contrato esperado |

### 3.3 Objetivos de confiabilidade

- cada fase deve poder ser interrompida sem deixar o produto em estado parcialmente incompatível;
- frontend antigo e novo devem conviver com alterações aditivas de banco durante o rollout;
- falha de sincronização não pode avançar o watermark como se a execução tivesse concluído;
- retries não podem duplicar dados nem ampliar gravações indefinidamente;
- métricas não podem expor dados pessoais ou segredos.

## 4. Fora de escopo

- redesenho visual da Central de Operações ou do Cérebro;
- troca de Supabase, Lovable ou Meta por outro fornecedor;
- alteração de regras comerciais, definições de funil ou atribuição de marketing;
- cópia de leads, mensagens, usuários, mídias, tokens ou credenciais para Remixes;
- remoção em massa de índices apenas por baixa utilização histórica;
- atualização de compute antes da coleta pós-otimização, salvo incidente operacional aprovado separadamente;
- reset de estatísticas do PostgreSQL em produção;
- execução de migrations, deploy ou publicação pelo agente que implementa o código.

## 5. Princípios e restrições obrigatórias

### 5.1 Produção

- nenhum agente pode modificar diretamente o banco de produção;
- SQL de diagnóstico deve ser comprovadamente somente leitura;
- migrations podem ser criadas e revisadas localmente, mas só o usuário ou executor autorizado da Lovable pode aplicá-las;
- não usar SQL Editor para correções avulsas;
- não usar `service_role` em scripts locais para contornar o fluxo de migrations;
- não acionar deploy ou publicação automática da Lovable;
- o frontend só será publicado pelo usuário depois da validação do backend atualizado.

### 5.2 Git e Remix

- Git é a fonte de verdade;
- toda função, RPC, grant, policy, índice, constraint, cron versionável ou alteração estrutural deve chegar por migration incremental;
- nunca editar ou renomear migration já aplicada;
- migrations devem conter pré-check, pós-check e estratégia de rollback;
- uma nova instalação deve receber a mesma estrutura, segurança, funções e configuração versionável;
- configurações externas e secrets devem entrar apenas em checklist com nomes e procedimento, nunca com valores;
- dados específicos de tenant não fazem parte da baseline.

### 5.3 Segurança multi-tenant

- nenhuma RPC poderá confiar somente em um `organization_id` enviado pelo cliente;
- a identidade será obtida de `auth.uid()`;
- o banco deve validar associação do usuário à organização ou papel de super admin conforme o contrato vigente;
- funções `SECURITY DEFINER` deverão usar `search_path` fixo, nomes de objetos qualificados e grants mínimos;
- `PUBLIC` e `anon` não podem receber execução por herança acidental;
- respostas agregadas não podem incluir dados de outra organização.

### 5.4 Compatibilidade de rollout

- mudanças de banco serão aditivas sempre que possível;
- o frontend atual deve continuar funcionando depois da migration e antes da publicação do novo frontend;
- Edge Functions antigas devem continuar funcionando enquanto a migration nova aguarda publicação;
- remoções e renomes ocorrerão somente em fase posterior, após comprovação de ausência de consumidores.

## 6. Stakeholders e responsabilidades

| Papel | Responsabilidade |
|---|---|
| Responsável do produto | aprovar escopo, risco, janela e impacto funcional |
| Responsável técnico | aprovar desenho, migrations, testes e critérios de saída |
| Agente implementador | alterar somente código local aprovado, testar e preparar rollback |
| Usuário/executor Lovable autorizado | aplicar migrations aprovadas e publicar Edge Functions indicadas |
| Usuário publicador | publicar o frontend manualmente depois da validação |
| QA/operador | executar cenários controlados e registrar métricas antes/depois |

Uma mesma pessoa pode acumular papéis, mas os gates de aprovação permanecem obrigatórios.

## 7. Dependências e gates globais

Nenhuma fase de implementação pode avançar sem:

1. causa raiz daquela fase registrada;
2. menor escopo possível definido;
3. impacto e risco de produção revisados;
4. testes e validação definidos;
5. rollback preparado;
6. autorização explícita quando envolver banco, RLS, Auth, Storage, Edge Function, cron, integração ou infraestrutura;
7. worktree revisada para preservar alterações existentes do usuário;
8. migrations descritivas, UUID aplicadas e equivalências classificadas antes de criar nova migration.

## 8. Estratégia de entrega

```text
Fase 0  Reconciliação Git x produção
   ↓
Fase 1  Baseline e observabilidade comparável
   ↓
Fase 2  Marketing incremental e em lote
   ↓
Fase 3  RPC agregadora da Central de Operações
   ↓
Fase 4  Paginação e agregação de consultas volumosas
   ↓
Fase 5  Índices orientados por evidência
   ↓
Fase 6  Higiene de bloat e objetos subutilizados
   ↓
Fase 7  Reavaliação de compute
   ↓
Fase 8  Certificação e propagação para Remixes
```

As Fases 2 e 3 podem ser desenvolvidas em paralelo somente depois das Fases 0 e 1, mas devem ser publicadas em ondas separadas. Isso permite atribuir qualquer regressão a uma única mudança.

---

## 9. Fase 0 — Reconciliar linhagem, produção e Git

### 9.1 Objetivo

Garantir que checkout local, GitHub, ledger de migrations e estado estrutural de produção sejam interpretados corretamente antes de acrescentar novos objetos ao banco.

### 9.2 Causa raiz

O checkout local estava 39 commits atrás e o Git contém pares quase equivalentes de migrations descritivas e UUID geradas/aplicadas pela Lovable. Confundir arquivo não registrado nominalmente com objeto não aplicado pode levar tanto à reaplicação indevida quanto a um falso diagnóstico de divergência.

O ensaio real acrescentou uma segunda causa raiz: o Remix materializa o schema final, mas não preserva `supabase_migrations.schema_migrations` nem os ACLs explícitos das migrations. Os objetos são recriados com os privilégios padrão do Supabase, tornando o banco remixado mais permissivo que produção até que uma reconciliação incremental seja aplicada.

### 9.3 Escopo mínimo

- atualizar a referência remota e sincronizar `main` por fast-forward, preservando mudanças locais do usuário;
- confirmar que `20260813155644` e `20260813160724` estão simultaneamente no GitHub e no ledger de produção;
- comparar por hash o conteúdo do GitHub com o SQL registrado;
- classificar migrations descritivas, UUID aplicadas, equivalentes e verdadeiramente pendentes;
- confirmar no catálogo read-only a existência dos principais objetos produzidos pelas migrations de 13/08;
- atualizar o inventário documental se novos objetos públicos tiverem sido criados;
- revisar `docs/perf/DEPLOY-COMPLETO.md` e `docs/perf/APLICAR-PRODUCAO-AGORA.sql`, marcando o fluxo de SQL direto como legado e não autorizado.
- inventariar, por assinatura completa e relação, os ACLs que diferem entre produção e Remix;
- criar, somente após autorização explícita, uma migration incremental que restaure os `REVOKE`/`GRANT` do contrato sem alterar migrations aplicadas;
- ampliar `npm run audit:remix-db` para bloquear grants excessivos em funções e tabelas críticas;
- registrar que o ledger ausente no Remix não pode ser usado isoladamente como fonte de decisão.

### 9.4 Restrições

- não recriar ou reaplicar migrations equivalentes;
- não aplicar novamente migrations já registradas;
- não extrair dados de tenants;
- não renomear os timestamps existentes;
- não usar apenas o nome ausente no ledger como prova de schema ausente;
- não executar o bootstrap enquanto rotinas `SECURITY DEFINER` sensíveis estiverem expostas acima do contrato;
- não corrigir ACL por SQL avulso no Remix ou em produção;
- não iniciar a Fase 3 ou 5 enquanto a reconciliação estiver pendente.

### 9.5 Validação

- comparação textual e semântica entre migrations descritivas, UUID e estado estrutural;
- execução de `npm run audit:remix-db`;
- criação de Remix controlado usando o fluxo real da Lovable;
- confirmação de que funções, crons e tabelas esperadas existem sem SQL manual;
- confirmação de que nenhum arquivo equivalente é aplicado duas vezes com efeito colateral;
- confirmação de que o Remix recebe configuração do próprio projeto, nunca URL ou chave de outro ambiente.
- comparação dos grants de rotinas e tabelas entre Git, produção e Remix;
- pós-check exigindo que nenhuma rotina crítica tenha `EXECUTE` para papel não autorizado;
- pós-check exigindo que tabelas internas não tenham privilégios acima do contrato;
- revalidação read-only depois que o executor autorizado aplicar somente a migration aprovada;
- bootstrap e criação do cron consolidados somente após a paridade de ACLs.

### 9.6 Riscos

- checkout desatualizado produzir diagnóstico falso;
- migration duplicada alterar cron ou configuração já válida;
- ledger nominal incompleto ser confundido com ausência estrutural;
- reaplicação acidental colidir com objetos existentes.
- função `SECURITY DEFINER` executável por `PUBLIC` ou `anon` permitir escrita ou leitura privilegiada fora do contrato;
- grants amplos em tabelas internas dependerem apenas de RLS e perderem defesa em profundidade;
- uma lista incompleta de assinaturas revogar acesso legítimo ou deixar overload exposto;
- corrigir apenas o Remix atual e repetir a falha em futuros clientes.

### 9.7 Rollback

Antes da aplicação, código, auditor e documentação podem ser revertidos pelo Git. Depois que a migration de ACL for aplicada pelo executor autorizado, ela nunca será editada ou removida: qualquer correção usará uma nova migration compensatória que restaure os grants anteriores. Produção não receberá alteração se o pré-check confirmar que já possui o contrato desejado.

### 9.8 Critério de saída

- checkout local alinhado ao `origin/main`;
- migrations UUID aplicadas presentes no Git e conferidas por hash;
- pares equivalentes classificados sem reaplicação;
- audit aprovado;
- Remix controlado reproduz os objetos e não contém dados operacionais do projeto de origem;
- ACLs de funções e tabelas do Remix equivalentes ao contrato de produção;
- nenhuma rotina crítica `SECURITY DEFINER` executável por papel não autorizado;
- auditor bloqueia regressão futura de grants;
- bootstrap cria somente a configuração e o cron do próprio Remix;
- ausência do ledger documentada e tratada pelo processo de reconciliação;
- documentação antiga não orienta mais SQL avulso.

---

## 10. Fase 1 — Baseline, observabilidade e orçamento de performance

### 10.1 Objetivo

Criar uma linha de base repetível para medir melhora ou regressão sem resetar estatísticas e sem coletar dados pessoais.

### 10.2 Escopo mínimo

- definir janelas comparáveis de baixa, média e alta atividade;
- registrar métricas antes de cada rollout e por pelo menos 24 horas depois;
- separar conexões de clientes, workers internos, replicação e sessões administrativas;
- correlacionar cron, Edge Functions e consultas do frontend pelo horário;
- definir orçamento de requests por tela e de writes por sincronização.

### 10.3 Métricas obrigatórias

#### Banco

- conexões de clientes: atual, média, P95 e pico;
- queries ativas e tempo da mais antiga;
- lock waiters e deadlocks;
- cache hit de banco, tabelas e índices;
- `calls`, tempo total, média, máximo, rows, buffers e WAL de statements-alvo;
- tuplas inseridas, atualizadas, HOT updated e removidas por tabela;
- execuções e duração dos crons;
- tamanho de heap, índices e TOAST das tabelas-alvo;
- arquivos e bytes temporários acumulados, interpretados como tendência histórica.

#### Aplicação

- quantidade de requests ao abrir cada tela-alvo;
- TTFB e duração total das requisições;
- tempo até dados úteis visíveis;
- taxa de erro, timeout e cancelamento;
- quantidade de refetches por foco, remount e atualização realtime.

#### Marketing

- janela solicitada à Meta;
- páginas recebidas;
- registros lidos, novos, alterados, inalterados e gravados;
- duração por etapa;
- watermark inicial e final;
- motivo do full backfill;
- existência de execução concorrente.

### 10.4 Requisitos de privacidade

- métricas devem usar IDs técnicos somente quando indispensáveis;
- não registrar nome, telefone, email, conteúdo de mensagem, token, cookie ou payload de anúncio completo;
- sanitizar erros externos antes de apresentá-los;
- não incluir connection strings em documentos ou logs.

### 10.5 Método de comparação

- capturar counters no início e no fim da janela;
- calcular deltas, sem chamar funções de reset;
- comparar dias/horários semelhantes;
- anotar deploys, crons e ações de teste na linha do tempo;
- não concluir causalidade a partir de um único cancelamento do conector.

### 10.6 Entregáveis

- relatório de baseline anexado ao PR da primeira fase;
- checklist reutilizável de coleta read-only;
- tabela de metas aprovada;
- lista dos statements identificados com seus consumidores no código.

### 10.7 Critério de saída

- todas as métricas essenciais possuem baseline;
- cenários controlados estão definidos;
- é possível comparar antes/depois sem alterar produção.

---

## 11. Fase 2 — Otimizar a sincronização de marketing

### 11.1 Objetivo

Manter a exatidão e atualização dos dados de marketing reduzindo consultas, upserts, WAL, autovacuum e tempo de ocupação de conexões.

### 11.2 Causa raiz

- janela padrão de 90 dias em toda execução agendada;
- loops sequenciais de campanha, conjunto, anúncio, criativo e insight;
- buscas repetidas de campanha/adset por item;
- atualização de `synced_at` mesmo quando o conteúdo não mudou;
- regravação de métricas diárias já consolidadas;
- cron frequente em relação ao custo de cada execução.

### 11.3 Requisitos funcionais

#### MKT-FR-001 — Modo incremental

A execução agendada deve partir do último sucesso confirmado e aplicar uma janela de segurança configurável para capturar conversões tardias. A janela inicial recomendada é de 7 dias, mas deverá ser validada com a regra real de atribuição usada pela conta Meta.

#### MKT-FR-002 — Full backfill explícito

O período de até 90 dias deve existir apenas como modo explícito, autenticado e observável. O cron comum nunca deve acionar full backfill implicitamente.

#### MKT-FR-003 — Watermark transacional do processo

O watermark só poderá avançar depois que todas as páginas e tabelas obrigatórias tiverem sido processadas com sucesso. Erro parcial mantém o último watermark confirmado.

#### MKT-FR-004 — Idempotência

Reexecutar a mesma janela com o mesmo payload deve produzir os mesmos dados finais e um volume mínimo de writes adicionais.

#### MKT-FR-005 — Escrita somente quando houver mudança

Registros existentes serão comparados por campos canônicos ou fingerprint estável. `synced_at` não poderá, sozinho, forçar a atualização de uma linha de fatos ou dimensão.

#### MKT-FR-006 — Upsert em lote

Campanhas, adsets, anúncios, criativos, insights e conversões deverão ser agrupados em lotes com tamanho seguro e documentado. Não deve existir um round-trip por item quando um lote produzir o mesmo resultado.

#### MKT-FR-007 — Mapas em memória

IDs internos de campanha, adset e criativo devem ser carregados ou retornados em lote e indexados em memória. Não repetir `SELECT ... maybeSingle()` para cada anúncio.

#### MKT-FR-008 — Concorrência controlada

Uma nova execução deve recusar, adiar ou assumir com segurança quando outra execução equivalente estiver ativa. Locks precisam ter ownership e expiração; um worker não pode liberar o lock de outro.

#### MKT-FR-009 — Paginação completa

Toda paginação da API Meta deve respeitar limite máximo defensivo, detectar ciclos e distinguir fim normal de falha parcial.

#### MKT-FR-010 — Telemetria resumida

Cada execução deve registrar apenas contadores sanitizados: lidos, novos, alterados, ignorados, falhos, páginas e duração por etapa.

### 11.4 Desenho recomendado

1. resolver credencial e conta sem expor token;
2. adquirir lock por organização, provedor e conta;
3. determinar modo: incremental, intervalo explícito ou backfill;
4. buscar catálogos externos com paginação;
5. normalizar objetos, removendo campos voláteis da comparação;
6. carregar chaves existentes em conjuntos, sem N+1;
7. separar linhas novas, alteradas e inalteradas;
8. escrever novas/alteradas em chunks;
9. processar insights e ações em lotes;
10. confirmar watermark somente após sucesso completo;
11. liberar lock pertencente à execução;
12. retornar relatório resumido.

### 11.5 Decisões que devem ser tomadas durante o desenho

- reutilizar `last_sync_at` existente ou criar um registro de execução versionado;
- fingerprint calculado na Edge Function ou coluna/hash no banco;
- tamanho inicial dos lotes;
- política para exclusões e objetos removidos da Meta;
- atraso de atribuição que define a sobreposição;
- manter cron de 10 minutos após otimização ou adotar 30 minutos como mitigação.

Qualquer nova tabela, coluna, RPC, cron ou grant exige migration incremental e aprovação específica.

### 11.6 Cenários de teste

- primeira sincronização sem watermark;
- sincronização incremental sem mudança;
- uma campanha alterada entre centenas inalteradas;
- novas conversões para data antiga dentro da sobreposição;
- paginação com duas ou mais páginas;
- falha na página intermediária;
- timeout antes de persistir watermark;
- retry após falha parcial;
- duas execuções concorrentes para a mesma conta;
- execuções simultâneas para organizações distintas;
- objeto externo removido/inativado;
- payload com ação desconhecida;
- ausência temporária da API Meta;
- backfill manual de 90 dias;
- garantia de que dados de uma organização não alcançam outra.

### 11.7 Testes de regressão obrigatórios

- dashboards preservam totais de spend, impressions, clicks, purchases e revenue;
- métricas diárias antes/depois são equivalentes para um intervalo controlado;
- o modo incremental captura alteração tardia dentro da janela;
- retries não criam duplicatas;
- nenhuma credencial aparece em logs;
- testes existentes `npm run test:marketing-p0` continuam aprovados;
- build e audit aprovados.

### 11.8 Rollout

1. implementar e testar localmente;
2. remover logs e artefatos temporários;
3. revisar diff, risco e rollback;
4. commit e push;
5. aguardar sincronização automática da Lovable;
6. se houver migration aprovada, usuário manda a Lovable aplicar somente o arquivo exato;
7. usuário manda publicar somente `marketing-sync`;
8. executar sincronização controlada de uma organização autorizada;
9. comparar dados e counters;
10. observar pelo menos dois ciclos agendados;
11. manter frontend inalterado nesta onda.

### 11.9 Critérios de aceite

- ciclo sem mudanças grava no máximo o necessário para o controle de execução;
- redução de pelo menos 90% no número de upserts em janela equivalente;
- redução de pelo menos 80% no WAL das tabelas-alvo;
- nenhum desvio nos totais funcionais validados;
- nenhuma sobreposição de execução;
- falha parcial não avança watermark;
- full backfill continua disponível, mas não pelo cron normal.

### 11.10 Riscos e mitigação

| Risco | Mitigação |
|---|---|
| perder conversão tardia | janela de sobreposição configurável e teste com dados controlados |
| avançar watermark cedo | confirmação somente no final do processamento completo |
| payload em lote exceder limite | chunks limitados e retry por chunk |
| comparação ignorar campo relevante | lista canônica revisada e testes de equivalência |
| intervalo de 30 min reduzir frescor | usar somente como mitigação temporária e comunicar SLA |
| retry duplicar métricas | chaves únicas existentes + idempotência comprovada |

### 11.11 Rollback

- reverter o commit da Edge Function;
- aguardar sincronização Lovable;
- republicar somente `marketing-sync` na versão anterior;
- manter migrations aditivas compatíveis, se não afetarem o código antigo;
- se a migration precisar ser desfeita, criar nova migration compensatória a partir de script em `supabase/rollbacks/`;
- não restaurar a rotina por SQL avulso.

---

## 12. Fase 3 — Consolidar a Central de Operações

### 12.1 Objetivo

Substituir dezenas de requests e agregações no cliente por um contrato server-side seguro, consistente e eficiente.

### 12.2 Causa raiz

- seis hooks são montados juntos;
- cerca de 38 a 39 consultas podem ocorrer na primeira carga;
- filtros iguais são repetidos;
- várias consultas usam `count: exact` separadamente;
- tarefas exigem join com leads para recuperar organização;
- desempenho por vendedor é agregado no JavaScript após buscar linhas individuais;
- refocus/remount pode recriar o burst depois do `staleTime`.

### 12.3 Escopo mínimo

- uma RPC agregadora para resumo, prioridades, operação realtime e radar;
- avaliar se performance por vendedor deve ficar no mesmo contrato ou em segunda RPC paginada/cacheada;
- manter `leadsAtRisk` limitado ou incorporá-lo somente se não degradar a RPC principal;
- adaptar hooks/frontend sem redesenho visual;
- preservar formato dos componentes sempre que possível.

### 12.4 Contrato funcional mínimo

A resposta deverá possuir versão explícita e timestamps calculados no servidor:

```json
{
  "version": 1,
  "generatedAt": "timestamp",
  "timezone": "America/Sao_Paulo",
  "health": {
    "openConversations": 0,
    "unanswered": 0,
    "hotLeads": 0,
    "hotNeedAction": 0,
    "todayAgenda": 0,
    "todayMeetings": 0,
    "overdueActivities": 0,
    "scheduledMessagesToday": 0,
    "onlineAttendants": 0,
    "attendingNow": 0
  },
  "priorities": {},
  "realtime": {},
  "team": [],
  "leadsAtRisk": [],
  "radar": []
}
```

O formato definitivo deve cobrir as interfaces atuais de `useOperationCenter.ts`. Campos depreciados, como `pendingMeetings`, poderão permanecer temporariamente como alias para compatibilidade.

### 12.5 Requisitos de autorização da RPC

#### OPS-SEC-001

Usuário não autenticado recebe erro sem qualquer dado.

#### OPS-SEC-002

A organização efetiva deve ser derivada da identidade autenticada ou validada por função canônica de associação.

#### OPS-SEC-003

Super admin deve seguir regra explícita já existente; não criar bypass implícito novo.

#### OPS-SEC-004

`SECURITY DEFINER`, se necessário, deverá fixar `search_path`, qualificar tabelas e revogar execução de `PUBLIC` e `anon`.

#### OPS-SEC-005

Somente `authenticated` e `service_role`, quando realmente necessário para consumidores internos, recebem grant explícito.

#### OPS-SEC-006

Testes devem provar isolamento entre pelo menos duas organizações.

### 12.6 Requisitos de consistência

- limites de “hoje” e “próxima hora” devem ser calculados uma única vez no servidor;
- timezone deve ser explícito;
- todos os contadores de uma resposta devem observar a mesma referência temporal;
- status e thresholds devem manter a semântica atual;
- nulos devem ser normalizados para zero/lista vazia;
- erro de um subagregado não pode resultar silenciosamente em zero sem indicação.

### 12.7 Estratégia SQL

- preferir CTEs ou subqueries agregadas com filtros compartilhados;
- evitar materializar linhas completas quando apenas contagem/agrupamento é necessário;
- agrupar vendedor diretamente no banco;
- evitar chamadas repetidas a funções de autorização por linha quando for possível resolver a organização uma vez com segurança;
- avaliar reutilização de RPCs existentes, como contagens do inbox, sem acoplar formatos incompatíveis;
- não introduzir materialized view nesta primeira versão;
- não criar índice antes de obter o plano da consulta final em ambiente controlado.

### 12.8 Estratégia frontend

- criar um hook principal com uma query key por organização e versão do contrato;
- usar um único request para a carga inicial;
- derivar os formatos dos componentes a partir do payload agregado;
- preservar loading, empty state e error state;
- manter refetch explícito e intervalo coerente;
- impedir que realtime invalide a mesma query dezenas de vezes em sequência; aplicar debounce/coalescing;
- durante transição, permitir feature flag local ou fallback para os hooks anteriores, sem habilitá-lo indefinidamente.

### 12.9 Cenários de teste

- organização sem dados;
- organização com todos os tipos de status;
- usuário comum, manager, admin e super admin;
- tentativa cross-tenant;
- tarefas sem lead válido;
- vendedor sem perfil completo;
- virada do dia no timezone da organização/plataforma;
- horário de verão quando aplicável ao timezone configurado;
- atualização realtime durante carregamento;
- erro/timeout da RPC;
- comparação de todos os contadores entre implementação antiga e nova usando dataset controlado.

### 12.10 Teste de carga

- executar em ambiente controlado com 1, 5, 10 e 20 aberturas concorrentes;
- medir chamadas, tempo total, buffers, rows e conexões;
- confirmar que cada abertura produz no máximo duas chamadas;
- validar P95 abaixo de 500 ms no volume representativo;
- garantir ausência de lock e de crescimento anormal de temp files.

### 12.11 Migration obrigatória

A RPC e seus grants devem ser criados em nova migration timestampada. A migration deve conter:

- pré-check de dependências;
- `CREATE OR REPLACE FUNCTION` com assinatura versionada/compatível;
- owner e grants explícitos;
- `COMMENT` quando permitido pelo fluxo de migration;
- pós-checks de existência, security mode, `search_path` e grants;
- referência ao rollback compensatório;
- nenhuma execução manual no banco.

### 12.12 Ordem de rollout

1. aplicar a migration da RPC;
2. validar a RPC com identidades de teste autorizadas;
3. publicar frontend ainda não — manter versão anterior consumindo consultas antigas;
4. confirmar que a migration é aditiva e não alterou fluxos existentes;
5. publicar o frontend pelo botão da Lovable;
6. monitorar requests, latência e conexões;
7. remover fallback somente em entrega posterior.

### 12.13 Critérios de aceite

- no máximo duas chamadas de dados na abertura;
- contadores equivalentes ao comportamento aprovado;
- P95 até 500 ms;
- nenhum acesso cross-tenant;
- nenhum grant para `PUBLIC`/`anon`;
- nenhuma regressão visual ou funcional;
- pico de conexão inferior ao baseline sob a mesma carga.

### 12.14 Rollback

- reverter frontend para hooks anteriores;
- RPC aditiva pode permanecer sem consumidores;
- se houver problema de segurança, desabilitar por migration compensatória aprovada e reverter frontend antes;
- nunca apagar ou editar a migration aplicada.

---

## 13. Fase 4 — Limitar e agregar consultas volumosas

### 13.1 Objetivo

Eliminar consultas ilimitadas e agregações de dezenas de milhares de linhas no cliente.

### 13.2 Frente A — Cérebro operacional

Problema atual: todas as conversas abertas são carregadas sem `limit`, ordenadas por última mensagem, e depois enriquecidas por consultas adicionais.

Requisitos:

- definir limite máximo inicial configurado no código;
- usar paginação por cursor estável, preferencialmente `(last_message_at, id)`;
- manter contadores totais separados da página de itens;
- carregar detalhes/enriquecimentos somente para IDs visíveis;
- deduplicar invalidações realtime;
- indicar visualmente quando o canvas representa uma janela/página, caso isso altere a semântica percebida;
- considerar RPC de grafo/agregado se a experiência exigir visão global sem transferir todas as linhas.

Critérios:

- nenhuma consulta sem limite;
- payload previsível mesmo com crescimento de tenants;
- scroll/pan não dispara reload completo;
- atualização realtime altera somente itens impactados ou invalida uma única query agrupada.

### 13.3 Frente B — Jornada

Problema atual: consultas de `journey_events` podem carregar dezenas de milhares de linhas para agrupamento no cliente.

Requisitos:

- identificar visualizações que precisam de detalhe versus contagem;
- usar agregação server-side por período, tipo e entidade;
- paginar timeline detalhada;
- exigir intervalo máximo padrão;
- permitir exportação/backfill apenas por fluxo assíncrono separado se volume justificar.

### 13.4 Frente C — Webhook logs

Requisitos:

- selecionar somente colunas exibidas;
- filtrar por organização e intervalo;
- paginar por cursor;
- nunca carregar payload bruto por padrão;
- proteger conteúdo potencialmente sensível;
- carregar detalhe de um log somente sob ação explícita e autorização adequada.

### 13.5 Frente D — Lookups N+1

- consolidar consultas `id = ANY(...)` em lote;
- evitar buscar profiles individualmente;
- estabelecer limite para arrays enviados via URL;
- migrar para RPC/POST quando o conjunto não couber com segurança numa query string;
- medir se o problema permanece ativo; estatística histórica sozinha não autoriza refactor amplo.

### 13.6 Testes

- tenant vazio, pequeno, médio e dataset sintético acima do volume atual;
- ordenação determinística com timestamps iguais;
- paginação sem duplicar ou pular itens;
- item alterado entre páginas durante navegação;
- filtros combinados;
- realtime durante paginação;
- autorização e isolamento multi-tenant;
- payload máximo e tempo de renderização.

### 13.7 Rollback

- feature flag/fallback temporário quando necessário;
- revert do frontend;
- RPCs aditivas podem permanecer;
- migrations compensatórias apenas se um objeto introduzido gerar risco.

### 13.8 Critério de saída

- nenhuma consulta ilimitada nos fluxos priorizados;
- volume transferido cresce conforme tamanho da página, não conforme tamanho total do tenant;
- agregações são executadas no banco com planos validados.

---

## 14. Fase 5 — Índices orientados por evidência

### 14.1 Objetivo

Adicionar somente índices que reduzam o custo dos contratos finais, sem ampliar desnecessariamente escrita, WAL, memória e manutenção.

### 14.2 Regra de decisão

Um índice só será aprovado quando houver:

1. consulta ativa e consumidor identificado;
2. frequência/latência ou impacto funcional relevante;
3. plano de execução em ambiente controlado;
4. estimativa de seletividade e tamanho;
5. comparação do plano antes/depois;
6. análise do custo de INSERT/UPDATE/DELETE;
7. ausência de índice equivalente por prefixo, expressão ou partial predicate;
8. migration incremental e rollback.

### 14.3 Candidatos iniciais — não aprovados automaticamente

#### Leads

Padrões frequentes por `organization_id`, `temperature` e `assigned_to` justificam avaliar:

- índice composto geral; ou
- índice parcial para leads não atribuídos;
- inclusão de colunas somente se evitar heap fetch relevante e sem aumentar excessivamente o índice.

#### Tasks

As consultas vencidas passam por `tasks → leads → organization`. Avaliar:

- índice por `lead_id` e `due_date`;
- índice parcial para status não concluído, se a distribuição justificar;
- alternativa estrutural somente se o join continuar caro depois da RPC.

Não desnormalizar `organization_id` em `tasks` nesta fase sem PRD/adendo próprio, pois isso adicionaria consistência, trigger/backfill e RLS ao escopo.

#### Agenda e mensagens agendadas

Avaliar cobertura para:

- `calendar_events (organization_id, start_time, status)`;
- `scheduled_messages (organization_id, status, scheduled_at)`.

Antes de criar, comparar com índices existentes e ordem real dos filtros.

### 14.4 Índices que não devem ser criados por impulso

- duplicatas dos índices funcionais de metadata de `webchat_messages` adicionados em 10/08;
- índice em `evolution_instances.name` para uma tabela com poucas dezenas de linhas e consulta já submilissegundo;
- todos os índices de foreign keys ausentes de uma vez;
- índices para queries administrativas/Supabase Studio que não afetam usuários;
- índices baseados somente em `idx_scan = 0` sem considerar reset das estatísticas e frequência do recurso.

### 14.5 Validação de cada índice

- plano antes/depois em banco controlado com estatísticas representativas;
- redução de buffers e tempo;
- tamanho estimado e real do índice;
- impacto em upsert de marketing quando envolver tabelas escritas pelo sync;
- teste de migration em banco vazio e banco já atualizado;
- confirmação de índice válido e pronto;
- monitoramento pós-rollout.

### 14.6 Rollout

- um pequeno conjunto por migration, agrupado por domínio;
- janela de baixo movimento;
- criação compatível com o executor/migration runner autorizado;
- não assumir transação para comandos que tecnicamente não podem executá-la;
- comando Lovable deve citar somente o arquivo exato, proibir análise exploratória e não solicitar mudança de código.

### 14.7 Rollback

- índice aditivo pode permanecer se não causar impacto;
- remoção, se necessária, somente por migration compensatória;
- nunca usar `DROP INDEX` avulso em produção;
- preservar histórico aplicado.

---

## 15. Fase 6 — Bloat, manutenção e objetos subutilizados

### 15.1 Objetivo

Tratar efeitos residuais somente depois de eliminar a origem das regravações.

### 15.2 Alvos de investigação

- índice GIN de `marketing_ads.metadata`, com tamanho desproporcional ao número de linhas vivas;
- tabelas de marketing submetidas a milhões de updates;
- `lead_semantic_memory`, cujo índice vetorial tem custo de escrita e precisa ter consumidor confirmado;
- `net._http_response`, considerando que pertence à extensão e não deve ser alterada sem documentação oficial e autorização;
- tabelas com `REPLICA IDENTITY FULL` sem participação comprovada na publication.

### 15.3 Regras

- não executar manutenção pesada antes da Fase 2 estabilizar;
- não remover índice com base em uma única janela estatística;
- confirmar consumers no código e queries reais;
- não alterar objetos gerenciados por extensão;
- planejar rebuild/reindex como manutenção separada, versionada quando aplicável e aprovada;
- estimar locks, duração, espaço temporário e impacto de replicação.

### 15.4 Critérios de aceite

- causa de bloat removida antes da manutenção;
- objeto candidato sem consumidor ou substituído com prova;
- plano de rollback e janela aprovados;
- nenhuma perda de suporte a consulta funcional ou realtime.

---

## 16. Fase 7 — Reavaliar compute e banco

### 16.1 Objetivo

Decidir upgrade somente com métricas pós-otimização e necessidade residual comprovada.

### 16.2 Métricas necessárias

- CPU média, P95 e tempo sustentado acima de 70–80%;
- memória utilizada e pressão de cache;
- Disk IOPS, throughput e latência;
- consumo/esgotamento de burst em compute compartilhado;
- conexões de clientes, separadas de workers internos;
- latência P50/P95/P99 dos fluxos críticos;
- tempo e sobreposição das Edge Functions;
- crescimento projetado em 3, 6 e 12 meses.

Parte dessas métricas não está disponível por SQL e deverá ser obtida do painel oficial, sem expor credenciais.

### 16.3 Matriz de decisão

| Situação pós-otimização | Decisão recomendada |
|---|---|
| CPU e conexões saudáveis, latência dentro da meta | manter plano atual |
| conexões P95 acima de 45, mas CPU/I/O saudáveis | revisar pool/fan-out; Small pode fornecer margem |
| burst frequentemente esgotado com carga legítima | considerar compute dedicado/maior conforme métricas |
| cache abaixo de 99% com leituras físicas e working set crescente | avaliar mais RAM após revisar queries |
| I/O alto por writes residuais | corrigir origem antes do upgrade |
| crescimento contratado exige margem imediata | upgrade planejado como capacidade, não correção de bug |

### 16.4 Critério de aceite

Uma decisão formal será registrada com:

- métricas antes/depois;
- custo mensal;
- benefício esperado;
- risco/downtime da troca;
- plano de retorno ao tier anterior, quando suportado;
- aprovação do responsável do produto.

---

## 17. Fase 8 — Certificação White Label e novos Remixes

### 17.1 Objetivo

Garantir que toda melhoria aplicada à produção faça parte do produto distribuído a novos clientes.

### 17.2 Matriz de propagação

| Tipo de mudança | Fonte de verdade | Como chega ao Remix |
|---|---|---|
| RPCs, funções, grants e índices | `supabase/migrations/` | migrations incrementais em ordem |
| Edge Function de marketing | `supabase/functions/marketing-sync/` | Git + publicação no projeto remixado |
| Hooks e componentes | `src/` | Git/Lovable Remix |
| Crons e jobs versionáveis | migration/config versionado | execução do bootstrap autorizado |
| Secrets Meta/Supabase | não versionar valor | checklist com nome e procedimento |
| Configuração externa | documentação de bootstrap | ação manual por ambiente |
| Dados operacionais | não propagar | cada tenant cria seus próprios dados |
| Dados de referência globais | migration/seed idempotente | baseline controlada |

### 17.3 Checklist para um Remix novo

1. criar projeto sem copiar dados de produção;
2. aplicar `migrations_shared` na ordem canônica;
3. aplicar todas as migrations incrementais por timestamp;
4. configurar somente os secrets listados no checklist;
5. publicar somente as Edge Functions versionadas necessárias;
6. confirmar cron/dispatcher conforme configuração versionada;
7. executar `npm run audit:remix-db`;
8. executar build e testes permanentes aprovados;
9. criar duas organizações sintéticas e validar isolamento;
10. testar Central de Operações vazia e populada;
11. testar marketing sem credencial e com credencial controlada;
12. confirmar que nenhum backfill de produção é iniciado automaticamente;
13. confirmar que nenhum dado de tenant original aparece no Remix;
14. registrar versão/commit utilizado.

### 17.4 Critérios de certificação

- zero objeto estrutural necessário criado manualmente;
- audit aprovado;
- migrations reexecutáveis em banco vazio conforme desenho;
- RPC segura e funcional;
- Edge Function incremental por padrão;
- frontend consome apenas contratos presentes no Git;
- checklist de configuração não contém secrets;
- dados de produção ausentes.

---

## 18. Plano de testes consolidado

### 18.1 Testes locais

- lint dos arquivos alterados;
- typecheck/build;
- testes unitários das funções de normalização e comparação do marketing;
- testes de idempotência e watermark;
- testes dos mapeadores do payload da RPC;
- testes de paginação e cursores;
- `npm run test:marketing-p0`;
- `npm run audit:remix-db`;
- `npm run build`.

### 18.2 Testes de banco controlado

- migration em banco vazio;
- migration em banco atualizado até a versão anterior;
- pré e pós-checks;
- grants e `search_path`;
- isolamento entre organizações;
- plano de execução antes/depois;
- volume sintético representativo;
- rollback compensatório ensaiado quando o risco justificar.

### 18.3 Testes integrados

- abrir Central e validar todos os cards;
- comparar contadores antigos/novos em dataset congelado;
- disparar eventos realtime em rajada;
- executar sync incremental sem mudança;
- executar sync com mudança pontual;
- simular falha e retry;
- executar paginação do Cérebro e jornada;
- monitorar conexões durante carga controlada.

### 18.4 Testes em produção

- usar organização e dados controlados;
- minimizar efeitos e número de execuções;
- nunca testar com escrita SQL direta;
- capturar apenas métricas sanitizadas;
- interromper se houver erro cross-tenant, divergência de totais, fila crescente ou aumento relevante de latência;
- publicar frontend somente depois de backend validado.

### 18.5 Testes temporários e permanentes

- scripts, capturas e logs específicos da investigação devem ser removidos antes do commit;
- teste só entra na suíte permanente quando representa regressão de produto e houver acordo explícito;
- relatórios podem preservar métricas agregadas, nunca credenciais ou dados pessoais.

## 19. Plano de rollout em produção

Cada onda seguirá exatamente esta sequência:

1. confirmar aprovação da fase;
2. implementar localmente;
3. executar testes proporcionais ao risco;
4. remover artefatos temporários;
5. revisar diff, segurança, impacto e rollback;
6. criar commit e enviar ao GitHub;
7. aguardar sincronização automática da Lovable;
8. fornecer comando curto ao Agente da Lovable com migrations exatas, em ordem;
9. no mesmo comando ou em comando posterior, solicitar publicação somente das Edge Functions exatas;
10. proibir no comando qualquer análise exploratória ou mudança de código;
11. validar localmente contra o backend atualizado usando dados controlados;
12. observar métricas pelo período definido;
13. usuário publica o frontend manualmente;
14. observar novamente e declarar sucesso ou acionar rollback.

### 19.1 Template do comando operacional para Lovable

O comando final deve substituir os placeholders por nomes reais e conter somente itens aprovados:

```text
Aplique, nesta ordem, somente as migrations [ARQUIVO_1.sql, ARQUIVO_2.sql] já versionadas no Git e depois publique somente as Edge Functions [FUNCAO_1, FUNCAO_2]. Não faça análise exploratória, não altere código, não crie SQL adicional e não publique o frontend. Interrompa e reporte se qualquer arquivo ou função não existir exatamente com esse nome.
```

Se uma onda não possuir migration ou Edge Function, omitir a categoria em vez de usar placeholder vazio.

## 20. Plano de rollback consolidado

### 20.1 Frontend e código

- usar revert no Git ou histórico da Lovable;
- aguardar sincronização;
- publicar manualmente a versão revertida;
- evitar force push ou alteração de histórico.

### 20.2 Edge Functions

- reverter código;
- publicar somente as funções afetadas;
- preservar funções não relacionadas;
- validar novamente com dados controlados.

### 20.3 Banco

- nunca editar, renomear ou apagar migration aplicada;
- manter alteração aditiva se for compatível com o código anterior;
- para correção necessária, preparar SQL em `supabase/rollbacks/` e copiá-lo para nova migration timestampada somente quando o rollback for aprovado;
- preferir desativação reversível a exclusão;
- não apagar dados operacionais como rollback de performance.

### 20.4 Gatilhos de rollback

- vazamento ou acesso cross-tenant;
- divergência relevante nos totais de marketing;
- aumento de erros/timeouts acima do baseline;
- crescimento sustentado de conexões ou CPU após rollout;
- watermark avançando após falha;
- perda/duplicação de itens em paginação;
- frontend incapaz de operar com backend novo;
- migration não reproduzível em banco limpo.

## 21. Monitoramento pós-rollout

### 21.1 Janelas

- imediatamente após a mudança;
- após dois ciclos do cron afetado;
- 1 hora;
- 6 horas;
- 24 horas;
- 7 dias para decisão final de capacidade.

### 21.2 Sinais de sucesso

- queda de calls e tempo acumulado dos statements-alvo;
- menor pico de conexões na abertura da Central;
- queda abrupta de updates e WAL no marketing;
- autovacuum retorna a uma frequência compatível com o volume real;
- contadores funcionais preservados;
- ausência de novos alertas de lock, timeout ou cross-tenant.

### 21.3 Sinais de atenção

- redução de requests sem redução de tempo da RPC;
- RPC com plano dependente de seq scan crescente;
- lote do marketing grande demais para timeout/payload;
- aumento de memória da Edge Function;
- dados tardios não capturados;
- refetch realtime reintroduzindo burst;
- índice novo pouco usado e com alto custo de escrita.

## 22. Backlog priorizado

| Prioridade | Item | Dependência | Tipo |
|---|---|---|---|
| P0 | reconciliar linhagem Git/Lovable/produção | nenhuma | governança |
| P0 | estabelecer baseline comparável | Fase 0 para schema | observabilidade |
| P0 | tornar marketing incremental e em lote | baseline | Edge Function |
| P0 | criar RPC agregadora da Central | reconciliação + autorização | migration + frontend |
| P1 | paginar Cérebro | baseline | frontend/RPC opcional |
| P1 | agregar jornada no servidor | baseline | RPC + frontend |
| P1 | paginar webhook logs | baseline | frontend |
| P1 | validar índices de leads/tasks/agenda | contratos finais | migration |
| P2 | analisar bloat de marketing | Fase 2 estabilizada | manutenção |
| P2 | confirmar uso do índice vetorial | janela estatística suficiente | análise |
| P2 | revisar replica identity/publication | consumidores confirmados | migration/config |
| P2 | decidir compute | 7 dias pós-otimização | infraestrutura |

## 23. Definition of Done do programa

O programa só estará concluído quando:

- migrations descritivas, UUID e estado de produção estiverem reconciliados;
- Central de Operações usar no máximo duas chamadas;
- sincronização de marketing for incremental, idempotente e em lote;
- consultas volumosas priorizadas estiverem limitadas/paginadas;
- índices adicionados tiverem evidência antes/depois;
- métricas pós-rollout atenderem às metas ou houver exceção formal aprovada;
- cada mudança possuir testes proporcionais ao risco;
- produção possuir procedimento de validação documentado;
- todos os rollbacks estiverem definidos;
- `npm run audit:remix-db` e build estiverem aprovados;
- um Remix novo reproduzir schema, segurança, funções e comportamento sem SQL avulso;
- nenhum dado operacional ou secret tiver sido propagado;
- alterações estiverem commitadas e enviadas ao GitHub;
- frontend tiver sido publicado manualmente somente após validação do backend.

## 24. Registro de decisões

| ID | Decisão | Status | Evidência necessária |
|---|---|---|---|
| DEC-001 | janela incremental inicial do marketing | pendente | regra de atribuição e teste de conversões tardias |
| DEC-002 | manter cron em 10 ou 30 minutos | pendente | duração e custo após otimização |
| DEC-003 | uma ou duas RPCs para a Central | pendente | plano e payload de performance por vendedor |
| DEC-004 | índice composto ou parcial em leads | pendente | plano da RPC final e seletividade |
| DEC-005 | índice de tasks | pendente | plano da consulta final |
| DEC-006 | manutenção do GIN de marketing_ads | pendente | uso real e bloat após Fase 2 |
| DEC-007 | upgrade de compute | pendente | 7 dias de métricas pós-otimização |

## 25. Aprovações exigidas por fase

| Fase | Aprovação necessária antes de implementar |
|---|---|
| 0 — Reconciliação | responsável técnico |
| 1 — Observabilidade | responsável técnico; produção somente leitura |
| 2 — Marketing | produto + técnico; Edge Function/cron/integração |
| 3 — Central/RPC | produto + técnico; banco/RLS/grants/frontend |
| 4 — Paginação | produto para mudanças perceptíveis + técnico |
| 5 — Índices | técnico + janela de produção |
| 6 — Manutenção | técnico + operação + janela de produção |
| 7 — Compute | produto/financeiro + técnico |
| 8 — Certificação Remix | produto + técnico |

## 26. Referências no repositório

- `src/components/admin/operation/OperationCenter.tsx`
- `src/hooks/useOperationCenter.ts`
- `src/hooks/useCerebroRealData.ts`
- `supabase/functions/marketing-sync/index.ts`
- `supabase/migrations/`
- `supabase/migrations_shared/`
- `supabase/rollbacks/`
- `scripts/audit-remix-database.mjs`
- `docs/DATABASE.md`
- `docs/EDGE_FUNCTIONS.md`
- `docs/perf/DEPLOY-COMPLETO.md`
- `docs/perf/APLICAR-PRODUCAO-AGORA.sql`

## 27. Situação da execução

A **Fase 0 — Reconciliação Git x produção** foi iniciada em 14/08/2026. Depois de atualizar a referência remota, constatou-se que o checkout local estava 39 commits atrás e que as duas migrations UUID já estavam no GitHub e em produção. A branch local foi sincronizada por fast-forward, sem sobrepor a alteração preexistente do usuário.

O Remix controlado `HOMOLOG-PERFORMANCE-FASE-0` reproduziu integralmente os totais do schema `public` e não copiou dados operacionais, secrets, configurações ou crons. Entretanto, não criou `supabase_migrations.schema_migrations` e recriou os objetos com ACLs padrão: as 351 rotinas ficaram executáveis por `PUBLIC`, `anon` e `authenticated`, incluindo todas as 189 rotinas `SECURITY DEFINER`. Produção possui 57, 39 e 19 restrições adicionais, respectivamente. Também foram perdidas restrições explícitas de tabelas críticas.

Uma segunda inspeção foi executada depois que o usuário ignorou a solicitação dos secrets opcionais `AGENT_IMPORT_TOKEN` e `LAUNCH_META_INSIGHTS_SECRET` e a Lovable marcou o Remix como concluído. Schema, ledger, ACLs, crons, configuração e contagens de dados permaneceram idênticos. O `skip` finalizou a interação pendente, mas não executou migrations ou reconciliação adicional de segurança.

Dois Remixes adicionais, criados em 03/08 e 07/08, confirmaram o padrão. Cada um possui somente uma migration no ledger, apesar de conter 231 tabelas, e ambos perderam ACLs de funções sensíveis que já existiam antes de sua criação. Os três Remixes também ficaram sem qualquer tabela pública na publication `supabase_realtime`. Isso elimina como causa tanto os secrets ignorados quanto somente as migrations de 13/08: trata-se de uma limitação recorrente do fluxo de materialização do Remix.

Para o Remix de 14/08, uma comparação por fingerprints confirmou igualdade lógica de funções, colunas, constraints, índices, policies, triggers, relações, views, tipos e metadata dos 17 buckets. As divergências de banco comprovadas são: 57 ACLs de função, 11 ACLs de relação, publication Realtime vazia, ledger ausente e bootstrap runtime ainda não executado.

O desenho de correção passa a exigir um **contrato pós-Remix versionado e determinístico**, composto por:

1. migration incremental de hardening com ACLs por assinatura completa;
2. grants explícitos de relações internas e defaults seguros para novos objetos;
3. reconciliação idempotente da lista aprovada de tabelas Realtime;
4. pré-checks e pós-checks que comparem o estado efetivo, não apenas arquivos SQL;
5. auditor estático ampliado — o auditor atual valida presença de SQL, mas não o banco materializado e hoje ignora explicitamente cópias sem diretórios de migrations;
6. aplicação explícita dessa migration pelo executor autorizado após cada Remix;
7. publicação somente das Edge Functions versionadas necessárias;
8. configuração de secrets próprios do cliente por checklist, sem copiar valores;
9. criação do primeiro super admin e execução do bootstrap idempotente de crons/configuração;
10. certificação read-only antes de publicar o frontend.

“100% igual” significa equivalência do contrato de plataforma: schema, segurança, RLS, funções, grants, publication, buckets, jobs versionáveis e dados de referência globais. Não significa copiar usuários, organizações, leads, mensagens, mídias, tokens, credenciais, secrets, partições internas gerenciadas ou versões antigas de extensões.

O resultado completo e o plano mínimo de correção estão registrados em `docs/perf/FASE-0-VALIDACAO-RECONCILIACAO.md`. Este documento não autoriza avanço automático. A Fase 1 só poderá começar depois de uma migration incremental de reconciliação de ACLs e uma regra permanente no audit serem explicitamente aprovadas, implementadas localmente, aplicadas pelo executor autorizado no Remix e revalidadas somente em leitura.

O plano operacional completo para obter paridade de banco, segurança, RLS, Realtime, Storage, Edge Functions, JWT, secrets, Auth e bootstrap está em `docs/perf/PLANO-FASE-0-CERTIFICACAO-REMIX-PARIDADE-INTEGRAL.md`. Ele exige a correção do Remix atual e a certificação de um segundo Remix novo antes do encerramento da Fase 0.
