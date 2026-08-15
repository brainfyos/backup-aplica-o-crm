# Fase 0 — Certificação runtime de produção e Remix

**Contrato:** `20260814.1`

**Migration incremental:** `20260814223000_remix_runtime_parity_certification.sql`
**Status:** implementação local; aplicação e publicação dependem do executor autorizado da Lovable

## Objetivo

Produção e um Remix novo devem apresentar equivalência funcional e de segurança para o banco: objetos, RLS/policies, ACLs, Realtime, Auth triggers, crons, configuração dos workers e buckets. Dados operacionais, arquivos e valores de secrets não são copiados e devem ser diferentes por ambiente.

## Causa raiz confirmada

O snapshot do Remix copia o schema lógico, inclusive RLS e policies, mas não preserva de forma confiável:

- ACLs explícitas de 58 funções e 11 relações;
- as sete associações da publication `supabase_realtime`;
- os dois triggers gerenciados em `auth.users`;
- a configuração runtime e o conjunto canônico de oito crons;
- valores de secrets e dados operacionais;
- o ledger histórico de migrations.

O painel anterior validava apenas nomes de triggers, seis crons, buckets e uma credencial. Por isso podia exibir “Plataforma íntegra” mesmo com ACLs e Realtime divergentes.

## Solução implementada

### Migration incremental

A migration cria um contrato JSON imutável, instala três RPCs restritas a `service_role` e executa somente a reconciliação de ACLs/Realtime durante sua aplicação:

- `remix_database_contract()` — manifesto sem valores secretos;
- `reconcile_remix_database_contract()` — reconciliação determinística de ACLs e Realtime;
- `platform_health_report()` — relatório read-only de todos os eixos;
- `ensure_platform_bootstrap(url, anon_key)` — materializa triggers e crons usando exclusivamente valores do ambiente atual.

O relatório também compara 13 fingerprints lógicos observados igualmente em
produção e no Remix: dez de schema (262 relações, 3.969 colunas, 1.083
constraints, 824 índices, 345 rotinas de negócio, 174 triggers, 9 views e 14
enums, além da configuração dos 17 buckets e das 10 extensões requeridas) e três de segurança (253 flags de RLS, 581 policies públicas e 59
policies de Storage). Posições físicas sem efeito lógico, como slots de colunas
removidas, são normalizadas.

A aplicação em produção **não chama** `ensure_platform_bootstrap`. Portanto, não recria crons/triggers, não cria usuários, não repara perfis e não toca dados de negócio. Ela instala o contrato, endurece o acesso às RPCs administrativas e confirma ACLs/Realtime.

### Fluxo do novo Remix

1. O `/setup` confirma que ainda não existe Super Admin.
2. Antes de criar o primeiro usuário, executa a reconciliação estrutural. Falha fechada se a RPC estiver ausente ou houver drift irrecuperável.
3. Cria o Super Admin.
4. Materializa exatamente dois triggers de Auth e oito crons com a URL/chave pública do próprio Remix.
5. O painel **Paridade / Remix** executa um relatório final independente.
6. O selo “Remix 100% certificado” só aparece se todos os eixos estruturais, secrets obrigatórios e pendências operacionais estiverem aprovados.

O botão de reparo não corrige usuários órfãos e nunca copia dados ou secrets.

## Controles de segurança

- RPCs mutáveis sem parâmetro de SQL, tabela ou função;
- execução somente por `service_role` e via Edge Function protegida por Super Admin;
- `lock_timeout` de 5 segundos e `statement_timeout` de 60 segundos;
- advisory lock para impedir reparos concorrentes;
- pré-check de papéis e objetos obrigatórios;
- pós-check atômico de ACLs, RLS das relações e Realtime;
- ausência de DML sobre dados operacionais na aplicação da migration;
- secrets verificados apenas por nome/presença, sem retornar valores;
- ledger não é falsificado.

## Ordem obrigatória de rollout

### Gate 1 — local

Executar:

```text
npm run audit:remix-db
npm run test:remix-parity
npm run build
git diff --check
```

Aceite: todos os comandos verdes e diff sem arquivos estranhos à entrega.

### Gate 2 — produção

O executor autorizado da Lovable deve:

1. aplicar exclusivamente `supabase/migrations/20260814223000_remix_runtime_parity_certification.sql`;
2. publicar exclusivamente as Edge Functions `platform-bootstrap` e `setup-super-admin`;
3. não publicar o frontend ainda;
4. não executar outras migrations nem SQL exploratório.

Aceite por leitura: contrato `20260814.1` presente; 10/10 fingerprints de schema;
3/3 fingerprints de RLS/policies; 58/58 ACLs de funções; 11/11 ACLs de relações;
7/7 Realtime; produção continua com 2/2 triggers e 8/8 crons; nenhuma alteração
inesperada em objetos ou dados.

### Gate 3 — frontend de produção

Depois do Gate 2 e da validação read-only, publicar o frontend. No Super Admin, **Verificar** deve mostrar estrutura íntegra. Uma pendência operacional preexistente, como perfil órfão, não invalida a estrutura nem deve ser reparada automaticamente.

### Gate 4 — Remix novo

1. Criar um Remix novo somente depois da sincronização do commit e conclusão do Gate 3.
2. Não copiar dados, arquivos ou valores de secrets.
3. Abrir `/setup` e criar o Super Admin de homologação.
4. Cadastrar `AGENT_IMPORT_TOKEN` e `LAUNCH_META_INSIGHTS_SECRET` pela interface segura da Lovable; nunca inserir valores no chat ou no Git.
5. Configurar no Vault o nome `email_queue_service_role_key` com a credencial do
   próprio projeto, somente pelo formulário seguro suportado; nunca copiar o
   valor da produção.
6. Confirmar a publicação das Edge Functions do projeto.
7. Abrir **Super Admin → Paridade / Remix**.
8. Clicar **Verificar**. Usar **Reparar estrutura** apenas se houver item estrutural vermelho.
9. Repetir **Verificar** e registrar somente as contagens sanitizadas.

Aceite: 10/10 fingerprints de schema, 3/3 fingerprints de segurança, 58/58
ACLs de funções, 11/11 ACLs de relações, 7/7 Realtime, 2/2 triggers, 8/8
crons, 0/0 jobs inesperados, 1/1 runtime config, 17/17 buckets, 2/2 Edge
secrets e 0/0 perfis órfãos.

## Critério para sair da Fase 0

A fase termina somente quando:

- produção estiver no contrato `20260814.1` e sem regressão;
- um Remix criado depois do rollout for certificado pelo painel;
- as comparações read-only não mostrarem drift de RLS, policies, ACLs, Realtime, triggers ou crons;
- smoke tests de login, criação de usuário, Realtime e dispatcher passarem no Remix;
- nenhum secret, arquivo ou dado operacional de produção tiver sido copiado.

## Rollback

- Se a migration falhar, a transação e os pós-checks preservam o estado anterior.
- Código/Edge/frontend: reverter por novo commit e publicar somente as duas Edge Functions afetadas.
- Banco: migrations aplicadas nunca são alteradas ou apagadas; qualquer correção deve ser uma nova migration compensatória.
- ACLs mais restritas e associações Realtime corretas não devem ser revertidas sem evidência de incompatibilidade.
- Como a aplicação não chama o bootstrap operacional, crons e triggers de produção permanecem intactos durante o rollout.
