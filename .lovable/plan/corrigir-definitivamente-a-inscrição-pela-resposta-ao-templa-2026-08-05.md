# Corrigir definitivamente a inscrição pela resposta ao template

## Diagnóstico confirmado nos dois novos testes

Os dois testes chegaram corretamente ao webhook e encontraram a ação configurada no botão. Não faltou vínculo entre webhook, botão e cadência.

O bloqueio ocorreu dentro de `cadence-enroll`:

- 10:22:29 Brasília — clique **Quero entrar** → `all_fixed_times_passed`.
- 10:23:18 Brasília — clique **Já entrei** → `all_fixed_times_passed`.
- 10:25:14 Brasília — novo clique **Quero entrar** → `all_fixed_times_passed`.

A cadência **Link Live + Vagas Abertas** está ativa, mas foi salva assim:

| Etapa | Horário fixo | Dia adicional | Modo salvo |
|---|---:|---:|---|
| Etapa 1 | 08:00 | 0 | IA |
| Etapa 2 | 08:05 | 0 | IA |
| Etapa 3 | 08:10 | 0 | IA |

Como os cliques ocorreram depois de 10:22, todas as etapas do mesmo dia já estavam vencidas. O motor recusou a inscrição para não enviar mensagens de horário fixo atrasadas.

Também há uma inconsistência de configuração: a resposta imediata promete envio às **19:55**, mas nenhuma etapa está salva para 19:55. Além disso, as três etapas continuam em **modo IA** e a conversa está com IA habilitada; portanto, a configuração atual não corresponde ao fluxo “somente mensagens, sem agente”.

O novo print revelou um segundo bloqueio confirmado no frontend: `CadenceWizard` considera **toda etapa de horário fixo** como potencialmente fora da janela de 24h e impede a ativação sem HSM. Essa regra é genérica demais para a Etapa 1 deste fluxo. O clique em **Já entrei** ou **Quero entrar** é uma mensagem inbound real e abre/renova a janela Meta; portanto, uma etapa executada até 24 horas depois desse clique pode usar mensagem livre sem template.

O horário de teste `08:40` também já estava vencido quando o clique ocorreu às `10:25` (Brasília). Mesmo removendo a validação incorreta de HSM, a inscrição seria recusada por horário passado.

O banco já possui os campos globais `leads.whatsapp_opt_in` e `leads.whatsapp_opted_out_at`. O webhook já possui uma rotina que grava `whatsapp_opt_in=false`, encerra cadências ativas e cancela alvos pendentes quando a ação tem `opt_out=true`. O envio pela API Oficial e o núcleo de outreach já consultam esse bloqueio. A auditoria encontrou uma lacuna importante: o envio de baixo nível pela Evolution não aplica a mesma trava, e caminhos de agente podem produzir conteúdo antes de o provedor finalmente recusar o envio.

## Correção

### 1. Corrigir a configuração real da cadência

- Para o teste imediato, definir a Etapa 1 para pelo menos 5 minutos no futuro; para o fluxo real, usar o horário prometido ao lead, atualmente **19:55, horário de Brasília**.
- Revisar as etapas 2 e 3 e salvar explicitamente o dia relativo correto; não deixá-las implicitamente no mesmo dia quando forem follow-ups de dias posteriores.
- Trocar para **Texto exato (sem agente)** toda etapa que não deve ser escrita ou continuada por IA.
- Remover as exigências legadas de janela derivadas do público (`window_requirement=open/closed`), mantendo público e transporte independentes.
- Na Etapa 1 originada pelo clique, permitir mensagem livre sem exigir HSM enquanto o `inbound_at` de origem estiver dentro das 24h.
- Manter HSM apenas como fallback opcional para etapas que realmente possam executar depois das 24h; sem HSM e com janela fechada, pular com motivo claro em vez de impedir o salvamento de toda a cadência.

### 2. Impedir confirmação falsa no clique

Hoje o webhook envia “às 19h55 enviaremos...” mesmo quando `cadence-enroll` responde `enrolled: 0`.

- Considerar sucesso somente quando `enrolled > 0` ou quando o lead já estiver ativamente inscrito na mesma cadência.
- Enviar a resposta de confirmação configurada apenas depois desse sucesso.
- Em falha de agenda, não confirmar inscrição; registrar e devolver uma mensagem configurável de indisponibilidade.
- Não iniciar o agente padrão depois que a ação do botão já tiver sido tratada.

### 3. Tornar horários vencidos impossíveis de passar despercebidos

- No editor, calcular uma prévia da próxima execução em Brasília para cada etapa.
- Ao salvar/ativar, alertar quando todas as etapas fixas do dia já tiverem passado.
- Exigir que etapas futuras tenham `dia adicional` coerente; mostrar “hoje”, “amanhã” ou a data efetiva, em vez de apenas `0/1/2`.
- Na revisão final, mostrar horário, dia efetivo, público, modo da mensagem e fallback HSM.
- Se a regra continuar sendo “não enviar atrasado”, manter o bloqueio de horários vencidos, mas torná-lo visível e acionável.

### 4. Corrigir a validação de janela Meta no editor

- Remover a regra `horário fixo = exige HSM`, que causou o alerta do print e impediu salvar/ativar.
- Usar o clique inbound registrado em `source_ref.inbound_at` como início real da janela para inscrições por botão.
- Na revisão, classificar cada etapa como: **mensagem livre garantida**, **pode precisar de HSM** ou **fora da janela sem fallback**.
- Transformar ausência de HSM em alerta contextual, não em bloqueio indevido, quando a etapa pode ocorrer dentro da janela.
- No runtime, consultar a janela real imediatamente antes do envio; nunca confiar apenas na estimativa do editor.

### 5. Aplicar “Bloquear contato” como opt-out global

- Processar `opt_out=true` antes de qualquer inscrição, resposta fixa ou chamada de agente e encerrar o tratamento do botão imediatamente.
- Gravar no lead `whatsapp_opt_in=false` e `whatsapp_opted_out_at=agora`; o nome do campo é opt-in, mas `false` significa que o lead não quer receber.
- Encerrar cadências ativas, cancelar runs/alvos pendentes e impedir novas inscrições enquanto o lead estiver opt-out.
- Aplicar a trava no nível mais baixo de ambos os provedores: API Oficial **e Evolution**, cobrindo templates, mensagens fixas, agentes, cadências, campanhas, follow-ups, materiais e envios manuais.
- Aplicar uma verificação antecipada no bot/agente para não gastar IA nem gerar resposta para um lead bloqueado.
- Retornar `OPTED_OUT` de forma padronizada e mostrar ao operador que o envio foi bloqueado por preferência do contato.
- Manter a etiqueta configurada como sinal visual, mas usar `leads.whatsapp_opt_in=false` como fonte de verdade; remover a etiqueta não poderá reativar envios.
- Não reativar automaticamente quando o lead enviar outra mensagem. Um futuro opt-in deve ser explícito e auditável.

### 6. Registrar tentativas recusadas

- Persistir uma tentativa de inscrição/execução com motivo `all_fixed_times_passed`, lead, cadência, botão e horários avaliados.
- Exibir no relatório: **Não inscrito — todos os horários fixos de hoje já passaram**.
- Incluir no log o horário atual em Brasília e a próxima configuração válida, sem dados sensíveis.
- Diferenciar “novo lead recusado”, “já inscrito” e “sem etapas futuras”.

### 7. Validar o fluxo completo

1. Salvar a primeira etapa para pelo menos 5 minutos no futuro, em **Texto exato (sem agente)**.
2. Conferir na revisão a data/hora efetiva em Brasília.
3. Enviar o template para um lead novo e clicar **Quero entrar**.
4. Confirmar: uma inscrição ativa, `source_ref.inbound_message_id` preenchido e um run agendado.
5. Confirmar que a resposta imediata só foi enviada após a inscrição bem-sucedida.
6. Aguardar o horário e verificar uma única mensagem exata, sem resposta adicional do agente.
7. Clicar novamente com o mesmo lead e verificar deduplicação sem criar outra inscrição.
8. Testar propositalmente uma cadência com todos os horários vencidos e verificar que não há confirmação falsa e que o relatório mostra o motivo correto.
9. Testar janela Meta aberta e fechada: texto livre na aberta, HSM na fechada.
10. Clicar **Bloquear contato** e confirmar `whatsapp_opt_in=false`, horário do opt-out, ausência de enrollment e cancelamento de pendências.
11. Tentar enviar por agente, texto fixo, template, cadência, API Oficial e Evolution; todos devem retornar `OPTED_OUT` sem mensagem entregue.

## Configuração necessária para o teste de agora

- **Etapa 1 para teste:** escolha um horário pelo menos 5 minutos à frente do horário atual, dia `0/hoje`, público `respondeu desde a entrada`; HSM não deve ser obrigatório porque o clique acabou de abrir a janela.
- **Etapa 1 real:** horário `19:55`, dia `0/hoje`. Use `Texto exato (sem agente)` se a mensagem não deve ser criada pela IA; mantenha `Agente IA` apenas se deseja uma mensagem personalizada.
- **Etapa 2:** definir o horário e o dia real desejados; para follow-up após a primeira mensagem, usar `não respondeu desde a etapa anterior`.
- **Etapa 3:** definir explicitamente o ramo e o dia; não manter `dia 0` se ela pertence a outro dia.
- **Botão Quero entrar:** manter a cadência já selecionada e a resposta fixa com o link — essa ligação está correta.
- **Condução:** selecionar sem agente tanto na ação do template quanto nas etapas da cadência.
- **Botão Bloquear contato:** manter somente etiqueta + `opt_out`; não associar cadência nem resposta de agente.

## Detalhes técnicos

- Ajustar `meta-whatsapp-webhook` para condicionar `reply_text` ao resultado real de `cadence-enroll`.
- No mesmo webhook, executar opt-out antes das demais ações e fazer short-circuit.
- Ajustar `cadence-enroll` para retornar resultado estruturado com `reason`, horários avaliados e estado de duplicidade.
- Fazer `cadence-enroll` rejeitar leads com `whatsapp_opt_in=false` antes de criar enrollment.
- Atualizar `CadenceWizard` com validação e prévia de data/hora no fuso `America/Sao_Paulo`, removendo a exigência indiscriminada de HSM para horário fixo.
- Atualizar `CadenceReports` para incluir tentativas recusadas antes da criação do enrollment.
- Centralizar a proteção no `_shared/optin-guard.ts`; manter `meta-whatsapp-send` protegido e adicionar a mesma verificação em `evolution-send`.
- Adicionar guarda antecipada em `webchat-bot` e preservar a já existente em `outreach-core`, evitando geração de IA para opt-out.
- Auditar as rotas diretas de envio para garantir que todas terminem em um dos provedores protegidos.
- Corrigir os registros atuais da cadência somente depois de confirmar os horários/dias desejados para as etapas 2 e 3; a etapa 1 já está determinada pela mensagem enviada ao lead: 19:55.