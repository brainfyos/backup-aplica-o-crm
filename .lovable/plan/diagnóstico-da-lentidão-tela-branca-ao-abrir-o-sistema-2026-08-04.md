# Diagnóstico da lentidão (tela branca ao abrir o sistema)

Análise feita agora sobre o banco de produção, logs do Postgres, logs das Edge Functions e o código do app. Abaixo está o que foi **medido**, não suposição.

## O que os dados mostram

**1. Banco quase sem memória e inchado por lixo de cron**
- Memória: **84% usada**; conexões 35/60; banco com 3,29 GB.
- A maior "tabela" do banco é `cron.job_run_details` com **2.943 MB (~90% do banco)** e 0 linhas vivas — é histórico de execução de cron nunca limpo. Isso mantém o cache de disco poluído e força autovacuum constante, deixando **todas** as consultas lentas.
- `_http_response` (histórico do pg_net) com 92 MB, mesma natureza.
- WAL em 1.024 MB.

**2. Uma consulta domina o banco**
- Listagem de conversas (`webchat_conversations` por organização, ordenada por `last_message_at`): **87.950 chamadas, média 409 ms, pico 3,9 s, 36.000 segundos de CPU acumulados** — sozinha, mais que todo o resto somado.
- O índice correto existe e está sendo usado (`idx_webchat_conv_org_lastmsg`), e a tabela tem só 1.935 linhas. Ou seja, **o problema não é falta de índice**: é volume de chamadas + custo de RLS + banco saturado.
- O índice primário de `webchat_conversations` acumula **111 milhões de varreduras**, sinal clássico de a política RLS `can_access_conversation(auth.uid(), id)` ser executada **linha a linha**. Essa função é plpgsql e faz até 5 subconsultas (`user_roles`, `profiles`, `user_permissions`, `sector_members`) por linha retornada.

**3. Polling agressivo multiplicando a carga**
- Há cerca de 15 hooks com `refetchInterval` entre **5 e 60 segundos** (inbox, contadores, conversa aberta a cada 15 s, Instagram a cada 8 s, tracking a cada 15 s, fila de leads, follow-up, etc.). Cada aba aberta soma um fluxo constante de requisições, mesmo sem o usuário fazer nada.

**4. Erros repetidos gerando transações abortadas**
- **1.257.359 transações revertidas** desde o boot.
- Logs do Postgres, agora mesmo, repetindo em loop:
  - `invalid input value for enum task_status: "cancelled"` (valor inválido usado pelo app/edge function)
  - `column pipeline_stages.organization_id does not exist`
- Cada uma dessas é uma query que executa, falha e é descartada — desperdício puro, repetido milhares de vezes.

**5. Edge Functions lentas**
- Nas últimas 3 horas: uma função com **média de 24 s** (pico 76 s), outra com média 4,8 s (pico 56 s), várias entre 1,2 s e 4 s. A função mais chamada (827 chamadas) está em 251 ms de média, com picos de 3,7 s.

**6. Por que a tela fica branca**
- O boot do app espera respostas de rede antes de renderizar: `BootstrapGuard` chama a Edge Function `super-admin-status` e o `useAuth` busca o perfil. Com o banco saturado, essas chamadas levam segundos — e o usuário vê só o spinner. Não é bug de build; é latência de backend.

## Plano de correção (por ordem de impacto)

### Fase 1 — Aliviar o banco (efeito imediato, sem tocar em código de produto)
1. Limpeza e retenção automática de `cron.job_run_details` (manter só os últimos 7 dias) e de `_http_response`, com job de purga diário. Libera ~3 GB e reduz a pressão de memória.
2. `VACUUM/ANALYZE` nas tabelas quentes após a limpeza.
3. Reavaliar o tamanho da instância do Lovable Cloud depois da limpeza — se a memória seguir acima de 80% com o banco enxuto, o caminho é aumentar a instância (Backend > Configurações avançadas).

### Fase 2 — Corrigir os erros que geram transações abortadas
4. Corrigir o uso de `task_status = 'cancelled'` (usar o valor válido do enum ou adicionar o valor, conforme o que o app realmente precisa).
5. Corrigir a consulta que referencia `pipeline_stages.organization_id` (coluna inexistente) — passa a filtrar pela coluna real.

### Fase 3 — Tornar a listagem de conversas barata
6. Reescrever a política RLS de `webchat_conversations` para não chamar uma função plpgsql por linha: pré-calcular o contexto do usuário (papel, organização, permissões, setores) em funções `STABLE` de resultado único e transformar a política em comparação direta de colunas (`organization_id`, `assigned_user_id`, `sector_id`).
7. Padronizar a listagem do inbox para passar pela Edge Function `webchat-inbox` (que já roda com privilégio de serviço e filtra por escopo), eliminando as leituras diretas da tabela feitas pelo `SellerInbox`.

### Fase 4 — Reduzir o volume de requisições
8. Revisar os `refetchInterval`: subir os intervalos curtos (8–15 s) para 45–60 s onde já existe Realtime cobrindo a atualização, e desligar polling de telas fora de foco.
9. Boot não bloqueante: renderizar o layout imediatamente e resolver `super-admin-status` em segundo plano, com cache curto — a tela branca some mesmo se o backend estiver lento.

## Detalhes técnicos
- Migrações necessárias: purga/retention de `cron.job_run_details` e `_http_response`; reescrita das policies SELECT/UPDATE de `webchat_conversations`; ajuste do enum/valor de `task_status`.
- Código: `src/components/seller/SellerInbox.tsx` (leitura direta da tabela), `src/hooks/useWebChat.ts` e demais hooks com `refetchInterval`, `src/components/BootstrapGuard.tsx` (boot bloqueante), e a query com `pipeline_stages.organization_id`.
- Nenhuma mudança de layout ou funcionalidade visível está prevista — o objetivo é só velocidade.

Sugestão: aprovar Fases 1 e 2 primeiro, medir de novo, e então seguir para 3 e 4.
