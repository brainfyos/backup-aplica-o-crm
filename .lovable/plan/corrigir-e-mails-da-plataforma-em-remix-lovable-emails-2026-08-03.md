# Corrigir e-mails da plataforma em Remix (Lovable Emails)

## O que está acontecendo

O envio de e-mail do sistema não usa o domínio configurado no Lovable Cloud daquele projeto: o domínio remetente está **fixo no código** apontando para o projeto matriz.

Verificado no repositório:

- `supabase/functions/auth-email-hook/index.ts` — constantes fixas:
  `SITE_NAME = "vendus"`, `SENDER_DOMAIN = "notify.vendus.com.br"`, `FROM_DOMAIN = "vendus.com.br"`, `ROOT_DOMAIN = "vendus.com.br"`. Ao enfileirar, envia `from: vendus <noreply@vendus.com.br>` e `sender_domain: notify.vendus.com.br`.
- `supabase/functions/send-transactional-email/index.ts` — as mesmas três constantes fixas (linhas 8-16, usadas em 316-317).
- Todo o resto (convites, notificações, e-mails da plataforma) passa por `_shared/platform-email-send.ts` → `send-transactional-email`, ou seja, herda o mesmo domínio fixo.

No Remix de testes o domínio verificado é `notify.aulavendus.atendezapi.com.br`. O "Send test" do painel Cloud funciona porque quem envia é o próprio Lovable (usa o domínio real do projeto). Já o "esqueci a senha" passa pelo `auth-email-hook`, que enfileira com um domínio remetente que **não pertence** àquele projeto — a mensagem é rejeitada/descartada no dispatcher e nunca chega. O mesmo vale para convites de equipe e notificações.

Observação: a checagem exata do motivo da rejeição (registro em `email_send_log` / fila `auth_emails` do Remix) só pode ser feita no banco do Remix; o passo 0 abaixo cobre isso.

## Plano de ação

**0. Confirmar no Remix (diagnóstico rápido)**
Consultar `email_send_log` e a fila de e-mails do Remix para ver se o pedido de recovery chegou como `pending`/`failed` e qual o erro do dispatcher. Isso confirma a causa antes das mudanças (e já valida se o cron `process-email-queue` está ativo naquele Remix).

**1. Tornar o domínio remetente dinâmico**
Criar `supabase/functions/_shared/email-sender.ts` com `getEmailSender()`, que resolve nesta ordem:
1. colunas novas em `platform_settings`: `email_sender_domain`, `email_from_domain`, `email_from_name`;
2. variáveis de ambiente `EMAIL_SENDER_DOMAIN` / `EMAIL_FROM_DOMAIN`;
3. fallback atual (matriz), apenas para não quebrar o projeto principal.

Usar esse helper em `auth-email-hook` e `send-transactional-email` no lugar das constantes fixas (inclusive `siteName`/`siteUrl` dos templates, hoje travados em `vendus.com.br`).

**2. Migration**
Adicionar as três colunas em `platform_settings` (nullable), sem alterar RLS existente.

**3. UI no Super Admin › Configurações › E-mail**
Campos para "Domínio remetente verificado" (ex.: `notify.suaempresa.com.br`), "Domínio do From" e "Nome do remetente", com texto explicando que devem ser idênticos ao domínio verificado em Lovable Cloud › Emails.

**4. Autodetecção + validação**
Botão "Detectar/validar domínio": envia um e-mail de teste real pela fila (não o teste do painel Lovable) e mostra o resultado lido de `email_send_log`. Enquanto o domínio não estiver preenchido, exibir aviso de que recuperação de senha, convites e notificações não serão entregues.

**5. Painel de diagnóstico de e-mail**
Na mesma aba, listar os últimos registros de `email_send_log` (status, template, destinatário mascarado, erro) para o Super Admin ver falhas sem acesso ao banco.

**6. Paridade / Remix**
Incluir "Domínio de e-mail configurado" como item verificado na aba Paridade / Remix e no checklist do Super Admin.

**7. Deploy e teste ponta a ponta**
Deploy de `auth-email-hook`, `send-transactional-email` e `process-email-queue`; testar no Remix: esqueci a senha, convite de equipe e notificação.

## Detalhes técnicos

- Arquivos alterados: `supabase/functions/auth-email-hook/index.ts`, `supabase/functions/send-transactional-email/index.ts`, novo `_shared/email-sender.ts`, nova migration, UI de e-mail do Super Admin, `useSuperAdminSetupChecklist.ts`, `PlatformParityTab.tsx`.
- O nome da função `auth-email-hook` permanece inalterado (contrato do sistema de e-mails).
- Nenhum segredo novo é necessário; o envio continua pelo Lovable Emails.
