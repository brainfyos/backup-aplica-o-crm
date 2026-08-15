---
name: Rotação de templates HSM na cadência
description: Etapa de cadência aceita várias variações de template HSM com rodízio aleatório/sequencial por lead
type: feature
---
- `cadence_steps.reengagement_templates` (jsonb `[{template_id, variable_mapping}]`) + `reengagement_rotation` ('random' | 'round_robin'). Campos legados `reengagement_template_id`/`reengagement_variable_mapping` continuam gravados com a 1ª variação (fallback de leitura).
- UI: `TemplateMultiPicker` (checkbox por template aprovado + variáveis por variação) usado no `CadenceWizard` no lugar do `TemplatePicker` na etapa.
- `cadence-tick` sorteia a variação por lead (random) ou usa `count(runs sent do step) % n` (round_robin) e grava `cadence_step_runs.metadata.template_id`.
