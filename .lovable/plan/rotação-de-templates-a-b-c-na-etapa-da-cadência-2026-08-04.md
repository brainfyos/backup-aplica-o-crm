# Rotação de templates (A/B/C) na etapa da cadência

## O que muda para você

No campo **"Template HSM de reabertura"** da etapa, em vez de escolher um único template, você poderá marcar **vários templates aprovados** (ex.: suas 3 variações). Na hora do envio, cada lead recebe **uma das variações sorteada aleatoriamente** — assim as mensagens não saem todas idênticas.

Como fica o campo:

```text
Templates HSM de reabertura  (marque 1 ou mais)
  [x] vendus_live_v1
  [x] vendus_live_v2
  [x] vendus_live_v3        Rodízio: Aleatório
  ...variáveis de cada template marcado (IA preenche por padrão)
```

- Marcando só um, funciona exatamente como hoje.
- Cada template marcado mantém seu próprio mapeamento de variáveis ({{1}} = nome do lead etc.), já que as variações podem ter estruturas diferentes.
- Um seletor de **rodízio** ao lado: **Aleatório** (padrão, o que você pediu) ou **Sequencial** (distribui em ordem circular, mantendo as variações equilibradas).
- Cadências já criadas continuam válidas: o template único atual vira automaticamente uma lista de um item.
- Nos runs da cadência fica registrado qual variação foi enviada para cada lead, para você comparar desempenho depois.

O mesmo campo aparece na etapa quando a janela é "Somente sem janela aberta" e quando é "Qualquer situação" com risco de estar fora das 24h — o comportamento de rotação vale nos dois casos.

## Detalhes técnicos

- Migration: `cadence_steps.reengagement_templates` (jsonb, default `[]`) no formato `[{ template_id, variable_mapping }]` e `reengagement_rotation` (text, default `random` | `round_robin`). Backfill a partir de `reengagement_template_id` / `reengagement_variable_mapping`, que ficam como fallback de leitura (sem drop nesta etapa).
- Novo componente `TemplateMultiPicker` (em `src/components/admin/meta/`), reaproveitando o carregamento de `whatsapp_meta_templates` e o editor de variáveis já existentes no `TemplatePicker`; usado por `CadenceWizard.tsx` no lugar do `TemplatePicker` da etapa.
- Validação no wizard: etapa com `window_requirement='closed'` (ou 'any' fora de janela) exige pelo menos 1 template marcado — substitui a checagem atual de `reengagement_template_id`.
- `cadence-tick/index.ts`: ao montar `templateConfig`, lê a lista; `random` = sorteio por lead; `round_robin` = índice pelo contador de runs do enrollment. Grava o `template_id` escolhido em `cadence_step_runs.metadata.template_id`. Mantém fallback ao campo único quando a lista estiver vazia.
- Deploy: `cadence-tick`.
