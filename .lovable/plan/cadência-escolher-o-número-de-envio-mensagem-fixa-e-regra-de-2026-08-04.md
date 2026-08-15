# Cadência: escolher o número de envio, mensagem fixa e regra de janela de 24h

## O que muda para você

### 1. Escolher o número de envio na cadência
Hoje a cadência não pergunta o número: ela resolve sozinho a conexão do agente (Evolution conectada > Meta conectada > primeira ativa). Por isso a Sônia, que tem Evolution + WhatsApp Oficial, sai pela Evolution — e não pela API Oficial, como você precisa.

Na aba **1. Configuração**, abaixo do agente, entra o campo **"Número de envio"**, listando apenas as conexões daquele agente (ex.: `Evolution — org-conexaodogui` e `WhatsApp Oficial (+55 34 9961-2324) — API Oficial`), com a opção **"Automático (padrão do agente)"** para não quebrar as cadências existentes. Escolhendo a API Oficial, todos os passos daquela cadência saem por ela.

### 2. Mensagem: IA seguindo seu modelo (padrão) ou texto exato
Sim — o "Contexto inline" já é enviado ao agente como **formato obrigatório**: se você escrever "Olá {nome}, a nossa live já começou. Clique e venha participar. <link>", a IA envia nesse formato, variando só o tom/nome, mantendo linhas e o link literalmente (o `outreach-core` interpola variáveis e proíbe reescrever a estrutura).

O risco residual é a IA encurtar ou reescrever o link em casos raros. Por isso a etapa terá **"Como enviar"** com duas opções, e o padrão continua sendo a IA:
- **Gerada pela IA seguindo o contexto** (padrão — use este para "estamos ao vivo");
- **Texto exato (sem IA)** — opcional, para quando você quer risco zero de variação (copy de vendas, link de pagamento).


### 3. Regra de janela de 24h por etapa
No bloco **"Executar somente se"** entra a opção **Janela de 24h**:
- **Tanto faz** (atual);
- **Somente com janela aberta** — para quem clicou no botão do template do webhook: recebe sua mensagem fixa;
- **Somente sem janela aberta** — para quem não clicou: essa etapa envia o **template HSM** que você selecionar no próprio passo (campo "Template HSM de reabertura" já existente), com o texto "Estamos ao vivo. Assistir agora".

Assim a mesma cadência atende os dois públicos: a Etapa 1 (janela aberta → texto fixo) e a Etapa 2 (sem janela → template) podem ter o mesmo horário fixo (ex.: 19:55), e cada lead recebe só a que se aplica a ele.

### Como fica na prática
```text
Webhook -> Template oficial com botões
   Lead clicou  -> janela 24h aberta
   Lead não clicou -> janela fechada

Cadência "Inscrevi na Live" (número: WhatsApp Oficial)
  Etapa 1  19:55  Somente com janela aberta   -> texto fixo "Estamos ao vivo..."
  Etapa 2  19:55  Somente sem janela aberta   -> template HSM "Estamos ao vivo. Assistir agora"
  Etapa 3  21:43  ...                          -> copy das vagas
```

## Detalhes técnicos

- Migration: `cadences.send_connection_id` (uuid, null) e `send_connection_type` (text: 'evolution' | 'meta_whatsapp'); `cadence_steps.message_mode` (text default 'ai' | 'fixed_text'), `fixed_message` (text), `window_requirement` (text default 'any' | 'open' | 'closed').
- `_shared/outreach-core.ts`: novo campo opcional `fixed_text` em `OutreachTarget` — quando presente, pula a geração de IA e envia o texto literal (mesmo pipeline de bolhas/humanizer, dedupe, conversa no Inbox, `delivery_status`).
- `cadence-tick/index.ts`: usa `cadences.send_connection_id/type` quando definido, senão mantém `resolveAgentSendConnection`; avalia `window_requirement` contra o RPC `is_within_24h_window` da conversa correspondente (skip com motivo `window_requirement_not_met`, sem travar o próximo passo); repassa `fixed_text` quando `message_mode='fixed_text'`.
- Validação: etapa com `window_requirement='closed'` em conexão Meta exige `reengagement_template_id`; etapa `fixed_text` exige texto preenchido.
- `CadenceWizard.tsx`: seletor de conexão no passo 1 (via `product_agent_connections` do agente escolhido + `evolution_instances`/`whatsapp_meta_connections`), seletor "Como enviar" + textarea de texto fixo, e select de janela no bloco de condições. `CadenceDetail`/revisão mostram o número e o modo de cada etapa.
- Deploy: `cadence-tick`, `cadence-enroll`.

## Validação
Criar a cadência apontando para a API Oficial, inscrever dois leads (um que clicou no botão, outro que não) e conferir: o primeiro recebe o texto fixo, o segundo recebe o template, ambos no horário fixo e pelo número oficial.
