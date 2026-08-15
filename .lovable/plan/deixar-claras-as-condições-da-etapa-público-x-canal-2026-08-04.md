# Deixar claras as condições da etapa (público x canal)

## O problema

Hoje a etapa mistura duas decisões diferentes no mesmo bloco "Executar somente se":

- Os checkboxes ("Não respondeu", "Não comprou", "Não foi assumido por humano") decidem **se o lead deve receber** a etapa.
- O select "Janela de 24h (Meta)" decide **por qual caminho** a mensagem sai (texto livre dentro das 24h ou template HSM fora dela) — e ainda faz aparecer, logo abaixo, um bloco de templates sem explicação de por que surgiu.

Como estão colados, parece que a janela de 24h é "mais um filtro" igual aos checkboxes.

## Como vai ficar

Dois blocos separados e nomeados, na ordem lógica:

```text
1) Quem recebe esta etapa
   [x] Não respondeu   [ ] Não comprou   [ ] Não foi assumido por humano
   (sem nada marcado, todos os leads inscritos recebem)

2) Janela de 24h do WhatsApp
   ( ) Qualquer situação - envia para todos; fora das 24h usa template
   ( ) Somente com janela aberta - só quem clicou/respondeu nas ultimas 24h
   ( ) Somente sem janela aberta - só quem NAO interagiu; sai como template

   [quando a opção exigir template]
   -> Templates HSM (com aviso: "Esta etapa vai sair como template porque ...")
```

Ajustes de texto e comportamento:

- Cada opção da janela ganha uma linha de explicação abaixo do select, mudando conforme a escolha ("Leads fora da janela serão pulados", "Esta etapa sempre sai como template aprovado", etc.).
- O bloco de templates passa a ficar visualmente dentro da seção da janela de 24h (mesmo cartão, recuado), com o motivo em uma frase.
- Se a etapa for "Somente com janela aberta", nenhum template é pedido — hoje isso já acontece, mas fica explícito na tela.
- Se o número de envio da cadência for Evolution (não oficial), a seção de janela mostra que a regra só se aplica à API Oficial da Meta.
- O passo 4 do assistente, que hoje só diz "as regras estão dentro de cada etapa", passa a repetir esse resumo por etapa (quem recebe + janela + como envia) em vez de um texto solto.

## Detalhes técnicos

- Alteração apenas de apresentação em `src/components/admin/cadences/CadenceWizard.tsx` (linhas ~573-605): separar em dois containers com títulos, mover `TemplateMultiPicker` para dentro do container da janela, adicionar helper text dinâmico por valor de `window_requirement` e badge quando a conexão selecionada não for `meta_whatsapp`.
- Nenhuma mudança de schema, de validação de salvamento ou de `cadence-tick` — os campos `conditions`, `window_requirement`, `reengagement_templates` e `reengagement_rotation` continuam iguais.
- O passo 4 passa a renderizar um resumo derivado do estado `steps` (sem novos campos).
