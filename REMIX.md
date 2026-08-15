# 🚀 Remix do Vendus — Primeiros Passos

Ao fazer um **remix novo** deste projeto, o sistema **não cria** mais um Super Admin padrão. No primeiro acesso, a aplicação abre automaticamente a tela **`/setup`** ("Configuração Inicial") onde você cria sua própria conta de Super Admin.

---

## 🔑 Primeiro acesso

1. Abra qualquer URL do projeto após o remix.
2. Você será redirecionado para **`/setup`**.
3. Preencha:
   - **Seu nome** *(obrigatório)*
   - **Email** *(obrigatório)*
   - **Senha** *(obrigatório, mínimo 8 caracteres)*
   - **Confirmar senha** *(obrigatório)*
   - **Nome da empresa** *(opcional — já cria a primeira organização)*
   - **Telefone** *(opcional)*
4. Clique em **"Criar conta de Super Admin"**. Você é logado automaticamente e cai em `/super-admin`.

> ⚠️ A tela `/setup` aparece **uma única vez**. Assim que o Super Admin é criado, qualquer acesso futuro a `/setup` é redirecionado para `/login`.

---

## ✅ O que já vem pronto

- Estrutura completa do banco (tabelas, RLS, funções, triggers).
- Trigger automático que cria `profiles` para qualquer novo usuário (corrige todos os erros de FK em `team_invitations`, `platform_audit_logs`, etc.).
- Edge functions deployadas automaticamente, incluindo `setup-super-admin` e `super-admin-status`.

## ⚙️ O que você configura depois do setup

Pelo painel `/super-admin`:

1. **Identidade visual** — Identidade Visual (logo, cores, nome da plataforma).
2. **Domínio de e-mail** — Lovable Cloud → Emails.
3. **Servidor Evolution Go** — se for usar WhatsApp.
4. **Login com Google** — opcional, em Lovable Cloud → Auth.
5. **Pagamentos** — Stripe / Cakto / Hotmart, se aplicável.

---

## 🔐 Garantias técnicas

- A edge function `setup-super-admin` valida no servidor que **nenhum** Super Admin existe antes de criar um novo (proteção contra recriação).
- Após o setup, `platform_settings.super_admin_bootstrapped = true` marca a plataforma como inicializada.
- O componente `BootstrapGuard` consulta `super-admin-status` uma vez por sessão para decidir entre `/setup` e fluxo normal.
