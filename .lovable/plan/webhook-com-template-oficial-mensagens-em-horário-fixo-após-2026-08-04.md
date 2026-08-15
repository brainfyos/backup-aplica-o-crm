# Webhook com template oficial + mensagens em horário fixo após o clique no botão

## O que você precisa

1. O webhook dispara um **template HSM pela API Oficial** (sem risco de bloqueio, funciona fora da janela 24h).
2. O lead **clica em um botão do template**.
3. A partir daí, o sistema envia mensagens em **horário absoluto** (19h55 link da live, 21h43 copy de vagas).

## O que já existe hoje (confirmado no código)

- `_shared/outreach-core.ts` já sabe enviar template HSM (`template_config: { template_id, variable_mapping }`) pela conexão Meta — é o mesmo caminho usado no "Chamar com IA".
- A ação `ai_agent_outreach` do webhook chama esse core, mas **não passa template nem conexão**: se estiver fora da janela 24h ela falha com `OUT_OF_WINDOW_NEEDS_TEMPLATE`.
- `meta-whatsapp-webhook` já detecta resposta de botão (`button` / `interactive.button_reply`) e já aplica ações por botão — porém **só quando a mensagem veio de uma campanha** (`campaign.button_actions`).
- Cadências (`cadence-enroll` + `cadence-tick` a cada 5 min) já executam passos por lead, mas os passos só aceitam **atraso relativo** (`delay_value` + `delay_unit`), não "às 19h55".

Ou seja: 80% da infraestrutura existe. Faltam 3 encaixes.

## Proposta (reaproveitando tudo)

### 1. Nova ação de webhook: "Enviar Template (WhatsApp Oficial)"
Em vez de sobrecarregar a ação de IA, criar uma **ação própria** na lista de ações do webhook: `send_whatsapp_template`. Ela é determinística (não gasta IA, não improvisa texto) e configura:
- **Conexão WhatsApp API Oficial** (Meta) a usar;
- **Template HSM aprovado** + mapeamento de variáveis (componente `TemplatePicker` já existente);
- **Ações por botão** do template (ver item 2).

A ação "Acionar Agente IA (WhatsApp)" continua exatamente como está hoje, para os casos em que você quer texto gerado pela IA. Internamente a nova ação usa o mesmo caminho canônico `processOutreachTarget` (com `template_config` + `instance_id`), garantindo conversa no Inbox, `delivery_status`, dedupe e histórico.


### 2. Ações por botão fora de campanha
Generalizar o trecho de `button_actions` do `meta-whatsapp-webhook` para ler as ações do próprio envio (gravadas no `metadata` da conversa/mensagem quando o webhook dispara o template), não só de campanhas. Ações disponíveis por botão: **aplicar etiqueta**, **remover etiqueta**, **inscrever em cadência**, **opt-out**.

Isso mantém uma única engine de botão para campanha e webhook.

### 3. Cadência com horário fixo (é aqui que entra a nova capacidade)
Adicionar ao passo de cadência um modo de agendamento **"Horário fixo"**: `hoje/amanhã/dia específico` + `HH:MM` (fuso da empresa), além do modo relativo atual.
- `cadence-enroll` e `cadence-tick` calculam `scheduled_at` para esse horário absoluto; se o horário já passou no momento da inscrição, o passo é pulado (nunca dispara a live atrasada).
- Cada passo pode ser **texto fixo** (a copy exata da live/vagas) ou gerado pela IA, como hoje.
- Frequência do cron da cadência passa de 5 min para 1 min, para respeitar 19h55 e 21h43 com precisão.

### Fluxo final montado por você na interface
```text
Webhook recebe lead
  └─ Ação "Enviar Template (WhatsApp Oficial)": template "Confirmação da live" (botão "Quero participar")
       └─ Lead clica no botão
            └─ Ação do botão: inscrever na cadência "Live 03/08"
                 ├─ Passo 1 — horário fixo 19:55 → link da live
                 └─ Passo 2 — horário fixo 21:43 → copy das vagas abertas
```

## Por que não usar Campanhas Inteligentes para isso
Campanha resolve o público no momento em que é iniciada e agenda os envios naquele instante. Quem clicar no botão depois disso não entra mais. Como aqui o público só se forma conforme os cliques chegam, a cadência (que é por lead, inscrição contínua) é o lugar certo — falta só o horário absoluto.

## Detalhes técnicos
- `src/types/webhook.ts`: novo tipo de ação `send_whatsapp_template` (entra em `LEAD_DEPENDENT_ACTIONS` e em `ACTION_TYPES` com label "Enviar Template (WhatsApp Oficial)"), com config `wa_connection_id`, `wa_template_id`, `wa_template_variables`, `wa_button_actions`.
- `ActionConfigDialog.tsx`: novo bloco de configuração dessa ação (seletor de conexão Meta + `TemplatePicker` + editor de ações por botão).
- `webhook-receiver/index.ts`: novo `case 'send_whatsapp_template'` chamando `processOutreachTarget` com `template_config` + `instance_id`/`connection_type='meta_whatsapp'`; grava `button_actions` no metadata da conversa criada.

- `meta-whatsapp-webhook/index.ts`: extrair o handler de botão para `_shared/button-actions.ts` e resolver a origem por campanha **ou** metadata da conversa; nova ação `enroll_cadence` chamando `cadence-enroll`.
- Migration: colunas `schedule_mode` ('relative' | 'fixed_time'), `fixed_time` (time), `fixed_day_offset` (int) em `cadence_steps`; sem quebra do modo atual (default 'relative').
- `cadence-enroll` / `cadence-tick`: `computeScheduledAt` passa a considerar `schedule_mode`; job do cron reagendado para 1 min.
- `CadenceWizard.tsx` / `CadenceDetail.tsx`: seletor de modo de agendamento e exibição "às 19:55".
- Deploy: `webhook-receiver`, `meta-whatsapp-webhook`, `cadence-enroll`, `cadence-tick`.

## Validação
Disparar o webhook de teste, receber o template, clicar no botão e conferir na aba Cadências do lead os dois passos agendados para 19:55 e 21:43, com entrega no horário.
