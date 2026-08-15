# Corrigir e validar o fluxo completo de cadências

## Diagnóstico confirmado no teste

A inscrição funcionou. O lead **Luiz Paulo** entrou na cadência **Link Live + Vagas Abertas** pelo botão **Quero entrar** às 07:59 (Brasília), e as três etapas foram executadas pelo agendador nos horários corretos: 08:00, 08:05 e 08:10.

As mensagens não foram enviadas porque as três etapas foram puladas por regras conflitantes:

1. **Etapa 1 — “Somente quem respondeu”**: o clique no botão ocorreu imediatamente antes da inscrição e ficou fora do recorte `após a inscrição`; resultado: `Lead ainda não respondeu`.
2. **Etapa 2 — “Somente quem não respondeu”**: a condição de público passou, mas o motor associou “não respondeu após entrar” a “janela Meta fechada”. Como o próprio clique abriu a janela de 24h, a etapa foi pulada com `window_requirement_closed_not_met`.
3. **Etapa 3 — “Somente quem respondeu”**: repetiu o problema da Etapa 1.

O cron está ativo e executando a cada minuto. Não houve falha de credencial, conexão, template ou agendador neste teste.

## Correção funcional

### 1. Separar duas regras que hoje estão misturadas

- **Público da etapa** decide quem recebe: todos, respondeu ou não respondeu desde o marco escolhido.
- **Janela de 24h da Meta** decide apenas o meio de envio: mensagem livre quando aberta; template HSM quando fechada.
- Remover do motor a exigência automática de `janela aberta/fechada` derivada do público. “Não respondeu desde a etapa anterior” não significa necessariamente que a janela de 24h está fechada.
- Manter compatibilidade de leitura com cadências já salvas, sem deixar o campo legado bloquear envios válidos.

### 2. Registrar corretamente o clique que iniciou a cadência

- Ao inscrever pelo botão do template, gravar no vínculo da inscrição o identificador e o horário do inbound que disparou a ação.
- Considerar esse clique como resposta para a primeira etapa quando o marco for “desde a entrada na cadência”, evitando a diferença de milissegundos entre mensagem recebida e inscrição.
- Continuar contando somente mensagens inbound reais; envios do bot, templates e ecos do provedor não poderão satisfazer a regra.

### 3. Escolher o envio correto em cada etapa

- Se o lead for elegível e a janela Meta estiver aberta, enviar mensagem livre, por IA ou texto exato conforme configurado.
- Se estiver fechada, usar uma das variações HSM configuradas, respeitando random ou round-robin.
- Se estiver fechada e não existir template, marcar como pulada com motivo claro e acionável.
- Evolution continuará sem a restrição de 24h.

### 4. Tornar a configuração inequívoca

- Atualizar os textos do Cronograma para explicar separadamente **quem recebe** e **como a mensagem será enviada**.
- Não afirmar mais que “somente quem não respondeu” sempre sai por template.
- Exibir alerta quando uma etapa depender de HSM fora da janela e não tiver template configurado.
- Na revisão, mostrar o marco de resposta, o modo da mensagem e o fallback de transporte.

### 5. Melhorar relatório e diagnóstico

- Traduzir códigos técnicos de `skip_reason` para motivos claros no relatório.
- Diferenciar visualmente: pulada por público, pulada por janela/template, falha de envio e enviada.
- Registrar no run o estado da janela, público avaliado e template escolhido, sem dados sensíveis, para auditoria do próximo teste.

## Ajuste da cadência de teste

Para o comportamento mostrado nos prints, a configuração coerente será:

```text
Clique “Quero entrar”
  └─ Etapa 1 às 08:00: público “respondeu desde a entrada”
       └─ envia o link/mensagem inicial
  └─ Etapa 2 às 08:05: público “não respondeu desde a etapa anterior”
       └─ envia follow-up somente se não houve nova resposta
  └─ Etapa 3 às 08:10: definir explicitamente o ramo desejado
       ├─ respondeu desde a etapa anterior → continuação
       └─ não respondeu desde a etapa anterior → novo follow-up
```

A Etapa 2 atual está configurada como “não respondeu **desde a entrada**”; depois da correção, o clique inicial contará como resposta e essa etapa será corretamente pulada. Para testar follow-up após a Etapa 1, ela deve usar “desde a etapa anterior”.

## Validação de ponta a ponta

1. Criar uma cópia de teste com horários futuros, separados por 3 minutos.
2. Etapa 1: respondeu desde a entrada; texto exato com identificador `TESTE E1`.
3. Etapa 2: não respondeu desde a etapa anterior; texto/template com `TESTE E2`.
4. Clicar no botão que inscreve o lead e confirmar imediatamente: uma inscrição ativa e um run agendado.
5. Confirmar que a Etapa 1 é enviada uma única vez no horário.
6. **Cenário A:** não responder após E1; confirmar envio de E2.
7. **Cenário B:** repetir com outro lead e responder após E1; confirmar que E2 é pulada por público, com motivo legível.
8. Repetir uma execução com janela Meta fechada; confirmar uso do HSM e a variação escolhida.
9. Confirmar que não surgem mensagens automáticas do agente quando o fluxo estiver configurado sem IA.
10. Conferir relatório, conversa, status da inscrição e logs do run nos dois cenários.

## Detalhes técnicos

- Ajustar `meta-whatsapp-webhook` e `cadence-enroll` para transportar e persistir o marco do inbound que originou a inscrição.
- Refatorar `cadence-tick` para avaliar público e janela Meta de forma independente e registrar metadados de decisão.
- Atualizar `CadenceWizard` e os relatórios para refletir as regras reais.
- Criar migração somente se for necessário um campo dedicado; preferir o `source_ref` JSON já existente para manter a mudança compatível e pequena.
- Publicar apenas as funções afetadas e executar os cenários A/B antes de concluir.