---
name: Exclusão de membro por empresa
description: Remoção de usuário é escopada na empresa; conta de login só é apagada no último vínculo; recriação adota contas órfãs
type: feature
---
Excluir membro da Equipe usa a Edge Function `delete-team-member` (não a RPC direta):

- Limpa apenas o escopo da empresa atual: `user_organizations`, `user_permissions`, `sector_members` (setores da org), `squad_members` (squads da org) e libera `leads.assigned_to` / `deals.seller_id` da org.
- Se sobrar vínculo com outra empresa: mantém conta + perfil, reaponta `profiles.organization_id` para a empresa restante, marca `is_default` e recalcula `user_roles` a partir do vínculo restante (papel é global hoje).
- Se era o último vínculo: roda a RPC `delete_team_member` e apaga a conta em `auth.users` (evita conta fantasma).

Recriação: `create-team-member` e `provision-team-member` só tratam o e-mail como "usuário de outra empresa" quando existe perfil. Sem perfil = conta órfã → adota: aplica a senha informada e faz o bootstrap completo (perfil, papel, permissões, setores).
