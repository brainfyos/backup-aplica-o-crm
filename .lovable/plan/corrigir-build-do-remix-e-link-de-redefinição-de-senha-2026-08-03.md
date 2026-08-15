# Corrigir build do Remix e link de redefinição de senha

## Problema 1 — Build falha no Remix

O `package.json` roda `prebuild` → `audit:remix-db` → `scripts/audit-remix-database.mjs`. O script faz `readdirSync('supabase/migrations')` sem verificar existência. No projeto matriz a pasta existe (399 arquivos), mas o Remix não recebe o histórico de migrations, então o build morre com `ENOENT` antes mesmo de compilar o frontend.

A auditoria é uma checagem de contrato de banco — útil aqui, mas nunca deve impedir a publicação de uma cópia.

**Correção**
- Em `scripts/audit-remix-database.mjs`: se `supabase/migrations` ou `supabase/migrations_shared` não existirem (ou estiverem vazias), imprimir aviso e sair com código 0, pulando toda a auditoria.
- Trocar os `readdirSync` diretos por leitura segura (helper que retorna `[]` quando a pasta não existe).
- Permitir desativar explicitamente com `SKIP_REMIX_DB_AUDIT=1`.

Resultado: matriz continua auditada normalmente; Remix publica sem erro.

## Problema 2 — Link de recuperação aponta para o domínio do Supabase

Hoje `supabase/functions/auth-email-hook/index.ts` usa `confirmationUrl: payload.data.url`, que é a URL de verificação gerada pelo Auth (`https://<projeto>.supabase.co/auth/v1/verify?...`). Por isso o e-mail mostra o domínio técnico em vez do domínio da empresa.

**Correção**
Montar o link no próprio hook, usando o `token_hash` + `action_type` do payload e o domínio configurado:

```text
https://<dominio-configurado>/reset-password?token_hash=<hash>&type=recovery
```

- Base do domínio: `redirect_to` do payload quando presente; senão o site configurado em `platform_email_settings` (`getEmailSender().siteUrl`).
- Vale para todos os tipos: `recovery` e `invite` → `/reset-password`; `signup`, `magiclink`, `email_change` → rota de confirmação equivalente.
- Fallback: se o payload não trouxer `token_hash`, mantém `payload.data.url` (nada quebra).

Na página `src/pages/ResetPassword.tsx`, além do fluxo atual por hash, ler `token_hash` e `type` da query string e chamar `supabase.auth.verifyOtp({ token_hash, type })` para estabelecer a sessão antes de exibir o formulário. Mesmo tratamento na rota de aceite de convite.

Observação honesta: o link deixa de passar pelo domínio do Supabase na aparência **e** na navegação — a validação do token acontece via API a partir da própria página, então o usuário só vê o domínio da empresa.

## Passos
1. Tornar o script de auditoria tolerante à ausência de migrations.
2. Ajustar `auth-email-hook` para construir a URL no domínio configurado.
3. Ajustar `ResetPassword.tsx` (e o aceite de convite) para consumir `token_hash`.
4. Deploy de `auth-email-hook` e teste ponta a ponta: "esqueci a senha" e convite de equipe no Remix.
