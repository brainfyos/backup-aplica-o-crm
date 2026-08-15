# Mensagens do webhook em bolhas, seguindo a humanização do agente

## Problema

O disparo pelo webhook (e cadências/formulários) passa pelo `_shared/outreach-core.ts`, que hoje ignora a configuração de humanização do agente. Ele chama a divisão de bolhas com valores fixos no código (`aggressiveness: 2`, `max_bubbles: 2`), enquanto o atendimento normal (`webchat-bot`) usa `humanize()` com o que está salvo no agente (Sônia): estilo, agressividade, mínimo/máximo de bolhas e delays.

Resultado: a mensagem chega em um bloco único e longo, como nos prints, em vez do ritmo de conversa configurado.

## O que será feito

1. **Usar a configuração do agente no outreach**
   - `outreach-core` passa a ler `humanization` do registro do agente (já carregado de `product_agents`) e a aplicar o mesmo `humanize(texto, config, canal)` usado no atendimento.
   - Divisão em bolhas, espaçamento entre parágrafos e número de bolhas passam a vir de `humanization.splitting` (agressividade, min/max) em vez dos valores fixos.
   - Canal correto: `whatsapp` / `instagram` / `webchat`, conforme o disparo.

2. **Delays naturais entre bolhas**
   - Trocar o intervalo fixo de 800 ms pelos `betweenDelaysMs` calculados pelo humanizador (com teto de segurança para não estourar o tempo de execução da função).
   - Teto absoluto de 4 bolhas no WhatsApp, igual ao `webchat-bot` (anti-spam).

3. **Preservar as exceções já existentes**
   - Texto fixo (`fixed_text`), template HSM e Contexto Extra em modo "formato literal" continuam em bolha única, sem alteração.
   - Modo `conversational` também segue como está.
   - Se o agente estiver com humanização desativada, mantém o comportamento atual.

## Detalhes técnicos

- `supabase/functions/_shared/outreach-core.ts`: importar `humanize` / tipos de `_shared/humanizer.ts`, substituir a chamada direta a `splitIntoBubbles`, e usar os delays retornados no laço de envio (Evolution e Meta).
- Deploy: `manual-outreach`, `manual-outreach-batch`, `cadence-tick`, `form-submit`, `webhook-receiver`.

## Validação

Disparar o webhook de teste com a Sônia e conferir no WhatsApp que a mensagem chega em 2–3 bolhas curtas, com as quebras de parágrafo do agente, e não como bloco único.
