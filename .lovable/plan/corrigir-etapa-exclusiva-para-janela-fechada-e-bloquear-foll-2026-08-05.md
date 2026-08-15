# Corrigir etapa exclusiva para janela fechada e bloquear follow-up do agente

## Diagnóstico confirmado

- A inscrição ocorreu às 10h57:54 (Brasília) após o clique em **“Quero entrar”**.
- A Etapa 1 foi enviada às 11h05 e a Etapa 2 também foi enviada às 11h10.
- A Etapa 2 está salva como `audience = no_reply` e `reply_since = previous_step`, mas o próprio run das 11h10 registrou `meta_window_open = true` e `decision = sent`.
- Portanto, o motor avaliou somente se houve nova resposta depois da Etapa 1. Ele não usou a janela Meta como condição de público; a janela hoje serve apenas para escolher mensagem livre ou template.
- A cadência e as mensagens enviadas pelo agente também podem criar/reativar registros em `ai_outreach_queue`. Não existe hoje uma trava geral que impeça follow-ups automáticos enquanto o lead está em uma cadência ativa.

## Comportamento correto

```text
Lead clica “Quero entrar”
  ├─ abre a janela de 24h da conversa oficial
  ├─ entra na cadência
  ├─ cancela qualquer follow-up automático pendente do agente
  └─ enquanto a cadência estiver ativa, nenhum novo follow-up do agente é criado ou enviado

Etapa 1
  └─ janela aberta → envia a mensagem configurada

Etapa 2 — somente janela fechada
  ├─ janela aberta → ignora completamente
  └─ janela fechada → envia uma das variações de template HSM
```

O bloqueio vale **somente durante a cadência ativa**. Ao concluir ou interromper a cadência, uma nova interação futura do agente poderá iniciar uma nova régua de follow-up.

## Correção funcional

### 1. "Somente quem NÃO respondeu" passa a significar "sem janela aberta"

- A opção **Somente quem NÃO respondeu** vale para qualquer etapa, seja a 1, a 2 ou a 100.
- Regra única: a etapa só é enviada quando a janela de 24h da Meta estiver **fechada** para aquele lead.
- Se a janela estiver aberta, a etapa é ignorada por completo, sem gerar texto por IA e sem chamar o transporte.
- Com a janela fechada, o envio é obrigatoriamente por template HSM aprovado.
- **Somente quem RESPONDEU** continua exigindo interação real do lead e sai como mensagem livre dentro da janela.
- **Todos os inscritos** mantém o comportamento atual: livre dentro da janela, template fora dela.
- A janela é avaliada com `is_within_24h_window` antes de qualquer decisão de conteúdo.
- Compatibilidade: etapas antigas continuam sendo lidas, e a nova regra passa a valer para todas as etapas marcadas como "não respondeu".

### 2. Usar a conversa oficial que originou a inscrição

- Usar primeiro o `conversation_id` salvo em `cadence_enrollments.source_ref` para localizar a conexão e calcular a janela.
- Não avaliar a janela em outra conversa recente do mesmo lead nem trocar para uma conexão Evolution quando a inscrição veio da API Oficial.
- Manter a conexão fixa para os runs daquela inscrição, com fallback ao padrão do agente apenas quando não houver conversa de origem válida.

### 3. Voltar o seletor de templates da Meta na etapa

- Ao marcar **Somente quem NÃO respondeu**, exibir imediatamente o seletor de templates HSM logo abaixo da opção, com rotação aleatória ou sequencial.
- Deixar explícito no texto que essa etapa só atinge quem está sem janela aberta e por isso sai por template.
- Bloquear salvar/ativar quando uma etapa dessas não tiver nenhum template selecionado, com aviso claro na etapa e na revisão.
- Manter o seletor também para "Todos os inscritos" como fallback de fora da janela.
- Na revisão, mostrar por etapa: quem recebe, exigência de janela e quantos templates estão em rodízio.


### 4. Bloquear follow-ups automáticos do agente durante a cadência

- Ao inscrever o lead com sucesso, encerrar filas de follow-up automático já abertas em `ai_outreach_queue`, sem cancelar os runs da cadência.
- Impedir que mensagens da própria cadência criem ou reativem uma régua de follow-up do agente.
- Aplicar a trava nos pontos que hoje podem enfileirar follow-up: trigger de mensagens, `outreach-core` e ferramentas acionáveis pelo agente.
- Antes de cada envio no `ai-followup-cron`, fazer uma última verificação de inscrição ativa; se houver, encerrar/pular a fila sem enviar.
- Não bloquear a resposta imediata ao botão configurada no webhook nem as mensagens das etapas da cadência; bloquear somente follow-ups autônomos paralelos.

### 5. Auditoria e relatório

- Registrar no run: conversa de origem, conexão usada, estado da janela, condição exigida e decisão final.
- Traduzir os novos motivos no relatório: “ignorada porque a janela está aberta”, “janela fechada sem template” e “follow-up bloqueado por cadência ativa”.
- Evitar duplicidade: um run pulado por janela deve avançar uma única vez para a próxima etapa.

## Validação de ponta a ponta

1. Inscrever pelo botão “Quero entrar” e confirmar a conversa oficial como origem.
2. Com a janela aberta, confirmar o envio da Etapa 1 e o **skip completo** da Etapa 2.
3. Confirmar que nenhuma linha ativa de follow-up do agente permaneceu ou foi recriada durante a cadência.
4. Repetir com janela fechada e confirmar que a Etapa 2 envia exatamente um template HSM pelo mesmo número oficial.
5. Repetir com janela fechada e sem template, confirmando skip legível e nenhum envio livre.
6. Concluir/interromper a cadência, gerar uma nova interação do agente e confirmar que a régua pode voltar a ser criada normalmente.
7. Conferir conversa, relatório e banco para garantir ausência de mensagem duplicada, troca de número ou follow-up paralelo.

## Detalhes técnicos

- Interpretar `conditions.audience = 'no_reply'` como exigência de janela fechada no `cadence-tick`, sem criar tabela nova (campo auxiliar apenas se necessário para leitura de etapas antigas).
- Refatorar `cadence-tick` para resolver conexão/janela antes das condições que dependem dela e usar `source_ref.conversation_id` como primeira referência.
- Ajustar `CadenceWizard` e `CadenceReports` para configuração, validação e diagnóstico.
- Atualizar a função/trigger `fn_schedule_agent_followup_on_bot_message`, `cadence-enroll`, `_shared/outreach-core.ts`, ferramentas de follow-up e `ai-followup-cron` com a guarda de cadência ativa.
- Publicar somente as funções afetadas após testes automatizados e validação dos dois cenários de janela.