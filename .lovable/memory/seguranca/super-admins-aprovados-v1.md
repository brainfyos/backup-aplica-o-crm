---
name: Super admins aprovados (inventário de segurança)
description: Lista aprovada pelo proprietário de identity_id com papel super_admin; qualquer novo super_admin é desvio
type: constraint
---

Somente estes dois identity_id estão aprovados como `super_admin` (aprovação registrada pelo proprietário em 06/08/2026, sem alteração de papéis):

- `5fa86a85-64cc-4d94-bb2c-cc6908462a60`
- `f795cc90-e81b-46d9-bf67-a4bea773225b`

Qualquer outro registro `super_admin` em `user_roles`, `user_organizations` ou `team_invitations` deve ser tratado como desvio de segurança e investigado antes de qualquer rollout.
