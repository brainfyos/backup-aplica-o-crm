# Remover o passo a passo teleguiado do primeiro acesso do Super Admin

O wizard obrigatório após o `/setup` mistura coisas que só podem ser feitas fora do painel (e-mail na Lovable Cloud, VPS da Evolution Go, créditos de IA na Lovable). Ele será removido; a orientação passa a ser feita pelas aulas e por um checklist não bloqueante já existente no painel.

## O que muda

1. **Modal desativado**
   - Deixar de renderizar o `FirstAccessSuperAdminModal` onde ele é montado hoje (painel Super Admin / rota admin). O componente e seus passos permanecem no repositório, apenas não são abertos automaticamente — assim nada quebra e é fácil reativar.
   - `useSuperAdminFirstAccess` deixa de forçar a abertura (`shouldForceSetup` sempre falso), mantendo o restante do hook para quem consome os flags.

2. **Setup não fica "pendente" para sempre**
   - `setup-super-admin` volta a gravar `remix_setup_completed: true`, já que não existe mais wizard para concluí-lo. Assim nenhum outro ponto do sistema entende a plataforma como semi-configurada.

3. **O que continua existindo (sem bloquear o fluxo)**
   - O **checklist de configuração** no dashboard do Super Admin (`useSuperAdminSetupChecklist`) segue mostrando o que falta: plano, IA validada, WhatsApp, e-mail, primeira empresa — só que como guia, sem modal.
   - A **trava do botão "Nova Empresa"** enquanto a IA não for validada permanece, pois é a única que evita criar empresa que não funciona. (Se preferir remover também, é só avisar.)

## Detalhes técnicos

- Arquivos tocados: ponto de montagem do modal (`src/pages/SuperAdmin.tsx` ou layout equivalente), `src/hooks/useSuperAdminFirstAccess.ts`, `supabase/functions/setup-super-admin/index.ts`.
- Nenhuma migration necessária; colunas `remix_setup_completed`, `ai_mode` e `ai_validated_at` continuam em uso pelo checklist e pela trava de IA.
