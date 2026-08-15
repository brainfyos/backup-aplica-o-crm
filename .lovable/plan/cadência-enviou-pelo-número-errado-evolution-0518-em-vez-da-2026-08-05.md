# Cadência enviou pelo número errado (Evolution 0518 em vez da API Oficial)

## Por que aconteceu (confirmado no banco)

A cadência **Link Live + Vagas Abertas** está salva com o número de envio em **"Automático (padrão do agente)"** (`send_connection_id` vazio).

Nesse modo o motor chama a resolução padrão do agente, que segue a ordem fixa **Evolution conectada > Meta conectada**. O agente Sônia tem as duas conexões:

- Evolution `org-conexaodogui` — **55 34 9684-0518** (foi essa que enviou)
- WhatsApp Oficial — **+55 34 9961-2324** (era a esperada, com a janela de 24h aberta pelo clique no botão)

Ou seja: não foi erro de janela nem de template. Foi a regra de desempate do modo automático, que ignora por qual número a conversa começou.

## Correção

### 1. Ajuste imediato (resolve o seu caso hoje)
Na cadência, passo **1. Configuração**, trocar **Número de envio** de "Automático" para **WhatsApp Oficial (+55 34 9961-2324) — API Oficial** e salvar. A partir daí todas as etapas saem por esse número.

### 2. Modo automático passa a seguir a conversa (evita repetir o problema)
Hoje "Automático" adivinha pelo agente. Vai passar a resolver assim, nesta ordem:

1. **A conexão da conversa que originou a inscrição** — se o lead entrou clicando no botão do template da API Oficial, a cadência responde pelo mesmo número;
2. se não houver conversa identificada, mantém a regra atual do agente (Evolution > Meta).

Assim o lead sempre recebe a continuidade no mesmo número em que já estava falando.

### 3. Deixar visível na interface
- No passo 1, o texto do campo passa a explicar que "Automático" segue o número da conversa de origem.
- Na revisão e no detalhe da cadência, mostrar o número efetivo escolhido.
- No relatório de execução, registrar por qual número cada etapa saiu.

## Detalhes técnicos

- `cadence-tick/index.ts`: quando `cadences.send_connection_id` for nulo, antes de chamar `resolveAgentSendConnection`, buscar a conversa WhatsApp do lead (a mesma usada para o cálculo da janela 24h) e usar `instance_id` + `connection_type` dela; fallback para a resolução atual do agente.
- `_shared/agent-connection.ts`: nova função `resolveConnectionFromConversation(supabase, leadId/conversationId)`; `resolveAgentSendConnection` permanece como fallback (sem mudar sua ordem).
- Persistir no run (`cadence_step_runs`) o `connection_type`/`connection_id` efetivamente usado, para auditoria.
- `CadenceWizard.tsx` / `CadenceDetail.tsx` / `CadenceReports.tsx`: textos e exibição do número.
- Deploy: `cadence-tick`.

## Validação
Inscrever um lead pelo botão do template oficial e conferir que as etapas saem por **+55 34 9961-2324**, tanto com a cadência em "Automático" quanto com o número fixado manualmente.
