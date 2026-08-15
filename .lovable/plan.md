# Remix 100% fiel à produção — diagnóstico e plano

## 1. Por que a pasta `migrations` não aparece no Remix

Neste projeto a pasta existe e está versionada: 442 arquivos em `supabase/migrations` (todos rastreados pelo Git) mais 7 baselines em `supabase/migrations_shared`, num total de ~1,6 MB.

O Remix da Lovable **não copia o histórico de migrations nem o ledger interno** (`supabase_migrations.schema_migrations`). Ele clona o banco por **snapshot do catálogo** (tabelas, colunas, tipos, constraints, índices, funções, triggers, views, RLS e policies, buckets) e não por replay dos arquivos SQL. Reexecutar 442 migrations sobre um banco já materializado quebraria — por isso o novo projeto nasce com histórico vazio.

Consequência prática: no Remix o banco está certo em estrutura, mas o projeto perde a "memória" de quais migrations foram aplicadas.

## 2. O que realmente fica diferente no Remix

Já documentado em `docs/perf/FASE-0-PARIDADE-ESTRUTURAL-REMIX.md` e na memória do projeto:

| Item | Vem no Remix? |
|---|---|
| Tabelas, colunas, tipos, constraints, índices | Sim |
| Funções, triggers, views | Sim |
| RLS habilitada e policies | Sim |
| Buckets de Storage | Sim (sem os arquivos) |
| GRANT/REVOKE explícitos (ACL) | **Não** — 57 funções e 11 tabelas divergiram |
| Publicação `supabase_realtime` | **Não** — 7 tabelas ficaram de fora |
| Ledger `supabase_migrations` | **Não** |
| Schema `auth` (usuários e triggers de auth) | **Não** |
| Jobs `cron` (9 jobs, incluindo o dispatcher) | **Não** |
| Secrets do `vault` e secrets de Edge Functions | **Não** |
| Dados operacionais | **Não** (intencional) |

Ou seja: o Remix não fica "faltando tabela", ele fica faltando **contrato de acesso, tempo real, automações e credenciais**. Isso é o que provoca os sintomas clássicos: Realtime que não atualiza, erro de permissão em RPC, crons parados, e-mails/WhatsApp sem chave.

## 3. O que já está resolvido

- Migration `20260814180000_remix_database_structure_parity.sql` (já aplicada) reconcilia as 57 ACLs de função, as 11 de tabela e os 7 membros de Realtime.
- `npm run audit:remix-db` roda no `prebuild` e bloqueia regressão do contrato.
- `ensure_platform_bootstrap` / `platform_health_report` + aba "Paridade / Remix" no Super Admin cobrem triggers de auth e reparo.
- `/setup` cria o Super Admin do novo Remix.

## 4. Plano para fechar a paridade

**Passo 1 — Migration de bootstrap do Remix (novo arquivo)**
Um único SQL idempotente que, além do que já existe, garanta no clone:
- os 9 cron jobs (dispatcher + workers), criados via `cron.schedule`/`cron.alter_job` com guarda de existência;
- a publicação Realtime e as ACLs (reaproveitando o contrato já versionado);
- os triggers do schema `auth` recriados pelo caminho suportado (`ensure_platform_bootstrap`).

**Passo 2 — Painel "Paridade / Remix" com checklist completo**
Estender o relatório de saúde para verificar e exibir, com botão de reparo: ACLs, Realtime, crons ativos, triggers de auth, buckets, secrets ausentes (só o nome, nunca o valor) e Edge Functions declaradas em `config.toml` versus publicadas.

**Passo 3 — Checklist pós-Remix documentado**
Atualizar `REMIX.md` com a sequência obrigatória: `/setup` → reparo de paridade → cadastro de secrets (Evolution/Meta/Resend/IA/pagamentos) → publicação das Edge Functions → validação do dispatcher.

**Passo 4 — Teste de regressão**
Um teste que falha se a migration de bootstrap perder qualquer item do contrato (ACL, Realtime, cron), no mesmo padrão de `tests/`.

## 5. Limite honesto

Secrets e dados nunca serão copiados pelo Remix — é uma barreira da plataforma, não do código. A meta viável é: **estrutura, permissões, tempo real e automações 100% idênticas, com secrets preenchidos por checklist guiado no primeiro acesso.**

## Detalhes técnicos

- Nenhuma alteração em produção nos Passos 2–4; o Passo 1 é idempotente e no-op em produção (mesmo padrão da migration de paridade já aplicada).
- Reuso de `pick`/`to_regprocedure` para resolver assinaturas de função sem hardcode frágil.
- Crons criados apenas se ausentes, respeitando as permissões corrigidas por `20260813164000_fix_platform_worker_cron_permissions.sql`.
