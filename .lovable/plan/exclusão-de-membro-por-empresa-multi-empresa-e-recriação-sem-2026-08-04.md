# Exclusão de membro por empresa (multi-empresa) e recriação sem conta fantasma

## O que está acontecendo hoje

Diagnóstico confirmado no banco e no código:

- `carol@bmcpisos.com.br` **ainda existe na base de autenticação** (id `b94d414a-…`), mas não tem perfil nem convite em nenhuma tabela da aplicação.
- A função `delete_team_member` apaga perfil, papéis, setores, status e notificações — e **não apaga a conta de login**. Sobra uma conta órfã.
- Ao recriar, `create-team-member` encontra o e-mail na autenticação, marca `reused = true` e **pula perfil, papel e senha**, apenas vinculando a empresa. Daí a mensagem "usuário já existe" e o membro não aparecer na lista.

Hoje existem 36 vínculos usuário↔empresa, sendo 3 usuários em mais de uma empresa — então a exclusão precisa mesmo ser por empresa.

## Minha recomendação como especialista

Você está certo no princípio, mas com um detalhe importante: **excluir é sempre por empresa; apagar a conta de login só quando não sobrar nenhum vínculo.** Apagar sempre a conta destruiria o acesso de quem gerencia várias empresas; nunca apagar deixa contas fantasmas como a da Carol.

Regra proposta (uma única função, decidindo pelo estado real):

```text
Excluir membro X da empresa A
├── remove vínculo (user_organizations), setores, permissões e squads da empresa A
├── libera leads/deals da empresa A (assigned_to / seller_id = NULL)
├── ainda tem vínculo com outra empresa?
│   ├── SIM  → mantém conta e perfil; se profiles.organization_id era A,
│   │          aponta para a empresa restante (marca is_default) e ajusta o papel
│   └── NÃO  → apaga perfil e, em seguida, apaga a conta de login
└── nunca deixa conta sem perfil
```

Ponto de atenção técnico: `user_roles` e `sector_members` **não têm coluna de empresa** (papel é global hoje). Então, na saída parcial, o papel é recalculado a partir do vínculo restante em `user_organizations`; na saída total, tudo é removido.

E, no sentido inverso, a recriação precisa ser tolerante: se o e-mail existe na autenticação **mas não tem perfil**, tratar como criação normal — cria perfil, papel, permissões, setores e aplica a senha informada. Assim, mesmo que uma conta fantasma surja por qualquer outro caminho, o admin consegue recriar o usuário sem depender de suporte.

## O que será feito

### 1. Nova Edge Function `delete-team-member`
Valida que quem chama é admin/super admin da empresa e executa a regra acima (saída parcial x saída total). `useTeam.ts` (`useRemoveTeamMember`) passa a chamá-la no lugar da RPC direta. A RPC `delete_team_member` continua existindo, usada apenas no caso de saída total.

### 2. Diálogo de exclusão mais claro
Quando o usuário pertence a mais de uma empresa, o texto de confirmação diz explicitamente: "Ele será removido apenas de <empresa>; o acesso às outras empresas é mantido." Caso contrário: "A conta de acesso será excluída permanentemente."

### 3. Recriação adota contas órfãs
`create-team-member` e `provision-team-member`: só tratam como "usuário de outra empresa" quando existe perfil de fato; sem perfil, fazem o bootstrap completo com a senha informada.

### 4. Reparo imediato
Remover a conta órfã de `carol@bmcpisos.com.br` da autenticação para destravar a BMC hoje.

### 5. Remix
Tudo acima é código (Edge Functions + hook), então acompanha qualquer Remix. Em **Super Admin > Paridade / Remix**, adicionar a checagem "Contas órfãs" (existem na autenticação e não têm perfil) com botão para limpar.

## Detalhes técnicos
- Novo: `supabase/functions/delete-team-member/index.ts` (service role, autorização validada em código).
- Alterações: `supabase/functions/create-team-member/index.ts`, `supabase/functions/provision-team-member/index.ts` — condicionar `reused` à existência de perfil.
- Alteração: `src/hooks/useTeam.ts` — invocar a nova função e expor se foi saída parcial ou total.
- Alteração: componente de confirmação de exclusão na tela de Equipe.
- Alteração: `PlatformParityTab.tsx` — diagnóstico de contas órfãs.
- Sem migration de schema.
