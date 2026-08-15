---
name: Forms — Cadastro manual no mobile
description: 1 form do Captação por empresa pode ser marcado como "Cadastro manual" e substitui o diálogo fixo do atalho mobile "Cadastrar cliente"; usa o engine de Forms via iframe com ?internal=1
type: feature
---
- Coluna `forms.use_for_manual_lead` + índice único parcial por org (1 form por empresa).
- RPCs `set_manual_lead_form(_form_id)` / `unset_manual_lead_form(_form_id)` (SECURITY DEFINER) alternam a marcação e ativam o form. Permissão: super_admin ou membro da mesma org.
- Admin → Captação → Formulários: menu `⋮` "Usar como cadastro manual" / "Remover do cadastro manual" + badge "Cadastro manual" no card. Hook `useManualLeadForm`.
- Mobile (`MobileLayout`): atalho "Cadastrar cliente" abre `ManualLeadFormSheet` (iframe full-screen para `/f/:slug?internal=1`) se houver form marcado; senão cai no `CreateLeadDialog` padrão.
- `PublicForm` detecta `?internal=1` e envia `internal: true` para `form-submit`; no sucesso faz `window.parent.postMessage({type:'internal-form-submitted', lead_id})` e o sheet fecha sozinho.
- Edge `form-submit` valida JWT quando `internal:true`, confere `profile.organization_id === form.organization_id`, força `assigned_to = userId`, desliga auto-dispatch, marca lead com `lead_origin='manual_app'` e `lead_channel='manual'`. Mantém tags, scoring, cadências e `start_ai_outreach`.
