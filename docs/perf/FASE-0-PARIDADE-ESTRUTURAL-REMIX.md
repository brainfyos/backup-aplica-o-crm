# Fase 0 — Paridade estrutural do banco no Remix

**Data do contrato:** 14/08/2026

**Escopo autorizado:** somente estrutura do banco

**Produção modificada pelo diagnóstico:** não

**Migration aplicada:** não
**Status:** implementação local concluída; aguardando gate de aplicação controlada

## 1. Resultado do diagnóstico

O banco do Remix controlado já possui a mesma estrutura lógica de produção para:

- tabelas, views e colunas;
- tipos, constraints e índices;
- funções e respectivos corpos;
- triggers;
- RLS habilitada e policies;
- buckets de Storage.

A comparação exata de catálogos encontrou somente três classes de divergência:

| Classe | Produção | Remix antes da correção | Divergência |
|---|---:|---:|---:|
| ACL de funções | contrato restrito | privilégios padrão ampliados | 57 funções |
| ACL de relações | contrato por papel | `anon`/`authenticated` ampliados | 11 tabelas |
| tabelas públicas em `supabase_realtime` | 7 | 0 | 7 associações |

O ledger `supabase_migrations` não foi copiado pelo Remix. Ele não deve ser falsificado com as versões de produção: o histórico precisa representar somente migrations realmente executadas no ambiente. A paridade será certificada pelo estado do catálogo e pelo contrato versionado no Git.

## 2. Causa raiz

O mecanismo de Remix materializou corretamente objetos, definições, RLS e policies, mas não preservou completamente metadados de catálogo externos ao schema lógico clonado:

- `REVOKE` e `GRANT` específicos;
- associação de tabelas à publication `supabase_realtime`;
- histórico interno de migrations.

Isso explica por que as migrations existem no Git e seus objetos aparecem no Remix, mas parte das restrições de acesso não chegou ao clone.

## 3. Implementação preparada

Migration incremental:

`supabase/migrations/20260814180000_remix_database_structure_parity.sql`

Ela contém a matriz exata observada em produção e atua somente nos 75 pontos divergentes:

- 57 contratos `EXECUTE` de funções;
- 11 contratos de privilégios de tabelas;
- 7 membros obrigatórios da publication Realtime.

Ela não cria ou altera tabelas, colunas, dados, funções, RLS, policies, triggers, índices, buckets, usuários, configurações operacionais ou secrets.

## 4. Proteções de produção

### 4.1 Caminho sem alteração em produção

Antes de cada `GRANT`/`REVOKE`, a migration compara a ACL atual com a matriz desejada. Quando o objeto já está correto, o bloco de alteração não é executado. Como produção já corresponde ao contrato, o comportamento esperado nela é somente leitura de catálogo.

### 4.2 Falha fechada

A migration aborta se faltar qualquer:

- papel obrigatório (`anon`, `authenticated`, `service_role`, `sandbox_exec`);
- função da matriz;
- tabela da matriz;
- flag RLS nas 11 tabelas;
- publication `supabase_realtime`;
- tabela esperada para Realtime.

### 4.3 Atomicidade

Toda a reconciliação está dentro de um único comando `DO`. Qualquer erro ou falha de pós-check desfaz as alterações desse comando.

### 4.4 Limites operacionais

- `lock_timeout`: 5 segundos;
- `statement_timeout`: 60 segundos;
- nenhuma consulta a dados de negócio;
- nenhuma remoção de tabela da publication;
- nenhuma tentativa de copiar dados ou o ledger de produção.

## 5. Gates obrigatórios

### Gate A — contrato local

Status: **aprovado**.

- `npm run audit:remix-db`;
- teste temporário local do contrato (4/4 aprovado e removido após a validação);
- `git diff --check`;
- resolução em produção, somente por catálogo, das 57 assinaturas com `to_regprocedure`.

Critérios comprovados:

- 57 assinaturas únicas;
- 11 relações únicas;
- 7 tabelas Realtime exatas;
- ausência de DML em dados da aplicação;
- ausência de `DROP TABLE`, `ALTER TABLE`, `TRUNCATE` ou abertura de `EXECUTE` para `PUBLIC`;
- pré-check, limites de lock/tempo e pós-check presentes.

### Gate B — revisão antes da aplicação

Status: **pendente**.

Antes de enviar ao Git/Lovable:

1. revisar o diff final e confirmar que somente a migration, o auditor, o teste e esta documentação fazem parte da entrega;
2. manter fora do commit qualquer alteração preexistente não relacionada;
3. confirmar novamente, por `SELECT`, que produção continua com zero drift no contrato;
4. confirmar que o Remix de homologação continua sem dados operacionais;
5. obter autorização explícita para commit/push e para a aplicação pela Lovable.

### Gate C — aplicação controlada

Status: **não autorizado e não executado**.

Quando autorizado, a Lovable deve aplicar somente:

`supabase/migrations/20260814180000_remix_database_structure_parity.sql`

Não pedir análise exploratória, reaplicação de migrations antigas, publicação de frontend ou deploy de Edge Functions nesta fase.

### Gate D — validação pós-aplicação

Status: **pendente**.

Executar apenas consultas de catálogo, sem RPCs:

1. comparar novamente fingerprints de tabelas, colunas, constraints, índices, funções, triggers, policies, RLS, views e tipos;
2. comparar ACLs explícitas das 57 funções;
3. comparar ACLs explícitas das 11 tabelas;
4. confirmar os 7 membros obrigatórios da publication;
5. confirmar que nenhuma tabela adicional, policy, função ou coluna foi criada;
6. confirmar que as contagens de dados operacionais continuam zero no Remix;
7. executar smoke tests por papel somente depois da aprovação do catálogo.

O Gate D só é aprovado se o drift estrutural produção × Remix for zero para o contrato versionado.

## 6. Riscos residuais

| Risco | Mitigação |
|---|---|
| objeto ausente ou versão incompatível | pré-check aborta atomicamente |
| lock concorrente | espera máxima de 5 segundos |
| aplicação parcial | comando único e pós-check com exceção |
| regressão de segurança | nunca concede `EXECUTE` a `PUBLIC`; restaura somente papéis observados em produção |
| remoção indevida de Realtime | migration é somente aditiva para a publication |
| divergência futura | auditor e teste permanente bloqueiam remoção silenciosa do contrato |

## 7. Rollback

Não existe rollback seguro que restaure o estado anterior do Remix, porque esse estado concedia privilégios excessivos, inclusive execução pública. Reabrir esses acessos seria uma regressão de segurança.

O procedimento correto é forward-fix:

1. se a migration falhar, a atomicidade já restaura automaticamente o estado anterior;
2. se algum fluxo autorizado falhar depois da aplicação, identificar por consulta de catálogo o papel e o objeto exatos;
3. criar uma nova migration compensatória que conceda somente o privilégio mínimo comprovadamente necessário;
4. não devolver privilégios a `PUBLIC` e não reaplicar ACL ampla a `anon`;
5. manter as associações Realtime, que são aditivas e compatíveis com o código anterior, salvo evidência específica em contrário.

Em produção, a migration é esperada como no-op. Portanto, não se deve executar uma migration de “reversão” em produção: isso alteraria um contrato que já estava correto.

## 8. Critério para sair da Fase 0

A Fase 0 termina somente quando:

- a migration estiver versionada e aplicada pelo executor autorizado;
- produção permanecer sem alteração estrutural inesperada;
- o Remix controlado apresentar zero drift no contrato de banco;
- a auditoria e os testes locais continuarem aprovados;
- um Remix novo, criado a partir do Git atualizado, repetir o mesmo resultado;
- todo resultado estiver registrado sem secrets ou dados pessoais.

Até lá, o sistema permanece na Fase 0 e nenhuma otimização de índices, procedures, consultas ou upgrade de banco deve ser iniciada.
