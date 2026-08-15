# [Backup] Aplicação CRM

## 1) Conceito do sistema

### Nome interno (Tuca Sales)

**SalesOS (Playbooks & Enablement)** — “o sistema que transforma lead em rotina de venda”.

### Objetivo principal

Garantir que qualquer closer/SDR consiga:

1. **Entender o produto** (o que é, para quem é, promessa, diferenciais)
2. **Executar a venda** (cadência diária, mensagens prontas, follow-up, objeções)
3. **Responder dúvidas com segurança** (IA + base de conhecimento + scripts aprovados)
4. **Entregar consistência** (todo mundo fala a mesma linguagem, mesma oferta, mesmo processo)

### Resultado esperado

* Onboarding rápido de vendedores
* Redução de perda por “não sabia o que falar”
* Melhor conversão por consistência de scripts, follow-up e objeções
* Menos dependência de você para “explicar tudo de novo”

---

## 2) Estrutura por produto (template replicável)

Cada produto (ex.: **PoupeJá White Label**, **IsiChat WL**, **TucaPay**, etc.) será uma “pasta viva” com:

### A) Visão de Produto (1 tela)

* **Pitch de 15s / 30s / 2min**
* Promessa / destino (o que o cliente “compra de verdade”)
* Avatar/ICP (quem compra, dores, desejos, linguagem)
* Diferenciais / comparação com alternativas
* Pricing e regras comerciais (valores, planos, promoções, condições)
* Requisitos / limitações (o que pode e não pode prometer)

### B) Playbook Comercial (guia completo)

* Fluxo de qualificação (perguntas essenciais)
* Roteiro de call (abertura, descoberta, proposta, fechamento)
* Objeções e contornos (biblioteca)
* Provas (cases, prints, depoimentos, números)
* Fechamento (gatilhos, oferta, ancoragem, urgência/escassez)
* Pós-fechamento (próximos passos, onboarding, handoff)

### C) Cadência (Dia 1 a Dia N)

Um “calendário de ações” pronto:

* **Dia 1:** primeira mensagem + follow-up + áudio + CTA
* **Dia 2:** prova + quebra de objeção + CTA
* **Dia 3:** comparativo/âncora + CTA
* **Dia 4:** escassez + bônus + CTA
* **Dia 5:** última chamada + alternativa (call) + CTA
  E assim por diante.

Cada dia contém:

* Mensagens prontas (WhatsApp / DM / e-mail)
* Variações por persona (curto, médio, longo)
* Áudios sugeridos (texto para áudio)
* Gatilho principal do dia
* “Se o lead responder X, use Y” (árvore simples de decisão)

### D) Materiais

* PDFs, banners, criativos, VSL, vídeo demo, links, páginas, comparativos
* “Pasta do vendedor”: tudo em formato fácil de encaminhar
* Materiais marcados por objetivo: **prova**, **apresentação**, **objeção**, **fechamento**

### E) FAQ e Objeções

* FAQ público (dúvidas comuns)
* FAQ interno (como lidar com situações difíceis)
* Objeções por categoria: preço, confiança, timing, “vou pensar”, “vou ver com sócio”, “já tenho algo”

### F) “Cenários prontos”

* Lead frio / morno / quente
* Lead curioso / cético / sem dinheiro / apressado
* Reativação (lead antigo)
* Recuperação de carrinho / pós-oferta

### G) Checklist operacional (para não quebrar o processo)

* O que fazer quando o lead chega (tempo máximo de resposta, tags, próximo passo)
* O que registrar no CRM (campos obrigatórios)
* Quando oferecer call
* Quando encerrar e como reativar

---

## 3) O “Agente de IA” dentro de cada produto

### Função

Um copiloto do vendedor. Ele não é “assistente genérico”, ele é:

* **Treinado na sua base** daquele produto
* **Responde no tom comercial aprovado**
* **Sugere a próxima ação** conforme etapa do funil e resposta do lead

### O que ele faz na prática

* “O lead falou X, me dá 3 respostas (curta, média, persuasiva)”
* “Qual a melhor pergunta para qualificar agora?”
* “Ele pediu preço cedo: como contornar e voltar para valor?”
* “Gera um áudio de 20s para essa situação”
* “Qual material devo enviar agora? (e já puxa o link certo)”
* “Simula a negociação comigo (roleplay)”

### Regras críticas (governança)

* O agente só usa conteúdos **aprovados** (scripts, políticas, preços vigentes)
* Ele mostra fontes internas (ex.: “isso está no Playbook > Pricing”)
* Ele tem um “modo compliance”: **o que é proibido prometer**

### Treinamento (sem complicar)

* Base do produto = documentos + páginas internas + Q&A estruturado
* Atualização fácil: quando você muda um preço, muda 1 vez no “Pricing” e a IA já acompanha

---

## 4) Módulos do SaaS (arquitetura funcional)

### 4.1 Gestão de Produtos

* Criar produto com “template”
* Duplicar produto (clone)
* Versões (ex.: Playbook v1.2)
* Status: rascunho / em revisão / publicado
* Segmentação: produto A tem cadência e materiais próprios

### 4.2 Biblioteca de Conteúdo (DAM)

* Upload e organização de arquivos
* Tags (prova, abertura, fechamento, objeção-preço…)
* Links rápidos
* Controle de validade (material “expira” quando oferta muda)
* Permissão: quem pode editar/aprovar

### 4.3 Cadência Builder (o coração)

* Editor visual por “Dia”
* Blocos: mensagem texto, áudio (script), CTA, material recomendado
* Condições simples: “se lead respondeu” / “se não respondeu”
* Variações por persona (iniciante, avançado, B2B, B2C, etc.)
* Botão “copiar para outro produto”

### 4.4 Playbook Editor

* Editor tipo Notion (seções e páginas)
* Componentes prontos: pitch, ICP, objeções, comparativos, roteiros

### 4.5 Central de Objeções/FAQ (indexado)

* Cadastro de objeções com:

  * “O que o lead diz”
  * “O que ele quer dizer”
  * “Resposta sugerida”
  * “Pergunta de retorno”
  * “Material de prova”
* Busca rápida por palavras-chave

### 4.6 Assistente de IA (por produto)

* Chat com contexto do produto + etapa do funil
* “Sugestão de próxima ação”
* Gerador de mensagens e áudios
* Roleplay e simulação de call
* Salvamento de respostas como “script aprovado”

### 4.7 Área do Vendedor (UX muito simples)

* Escolhe produto
* Vê “Hoje (Dia X)”
* Clica e copia mensagens
* Envia materiais
* Consulta objeções
* Abre IA para responder o lead
* Checklist do que fazer com esse lead

### 4.8 Gestão do Time e Permissões

Perfis típicos:

* **Admin (você)**: tudo
* **Gestor Comercial**: edita, aprova, publica
* **Vendedor**: consome e usa IA, não altera base
* **Marketing (opcional)**: sobe materiais, mas precisa aprovação para publicar

### 4.9 Analytics e Qualidade

* Adoção: quais materiais e scripts mais usados
* Cadência: qual dia tem mais resposta
* Tempo de resposta do time
* Objeções mais frequentes
* “Conteúdos sem uso” (limpar e melhorar)

---

## 5) Fluxo operacional (como isso roda na vida real)

### Fluxo 1 — Criar um novo produto no sistema (padrão)

1. Admin cria produto a partir do Template
2. Preenche: promessa, ICP, pricing, diferenciais
3. Importa materiais (pastas)
4. Monta cadência (Dia 1–7 mínimo)
5. Preenche objeções top 20
6. IA é “conectada” ao produto (indexa base)
7. Gestor revisa e publica
8. Time comercial já consegue vender

### Fluxo 2 — Lead chegou, o vendedor executa

1. Seleciona produto e estágio do lead
2. Sistema sugere “Dia 1” + melhor abordagem
3. Vendedor copia e envia
4. Se o lead responde, vendedor cola a resposta no “IA”
5. IA gera 3 variações + pergunta de qualificação + material indicado
6. Vendedor escolhe, envia e marca etapa

### Fluxo 3 — Atualizou oferta/preço

1. Admin altera a seção “Pricing”
2. Versão nova do playbook é publicada
3. Materiais antigos expiram automaticamente
4. IA passa a responder com base atual

---

## 6) Modelo de dados (para construir direito)

Entidades principais:

* **Produto**
* **PlaybookPage** (páginas do playbook)
* **Cadencia** (conjunto) → **CadenciaDia** → **CadenciaBloco**
* **Material** (arquivo/link) + tags + status (ativo/expirado)
* **Objeção** (categoria, resposta, prova)
* **FAQ**
* **Persona** (segmentos de ICP)
* **Script** (mensagens/áudios aprovados)
* **Versão/Publicação**
* **Usuário / Time / Permissões**
* **Uso & Eventos** (analytics)

---

## 7) MVP (entrega rápida, mas forte)

Se você quiser lançar rápido com impacto real, o MVP precisa ter:

### MVP – Escopo mínimo que resolve 80%

1. Cadastro de produtos (com template)
2. Playbook (editor simples)
3. Cadência (Dia 1–7) com mensagens copiáveis
4. Materiais (upload + links + tags)
5. Objeções/FAQ (busca)
6. IA por produto (chat + gerar respostas + sugerir próximo passo)
7. Permissões (Admin, Gestor, Vendedor)

O que fica para v2:

* Analytics avançado
* Condições complexas na cadência
* Roleplay completo com scoring
* Integrações com CRM/WhatsApp automatizadas

---

## 8) V1 (produto “absurdamente completo”)

Depois do MVP validado com o time:

### V1 – Diferenciais que viram “sistema nervoso” do comercial

* **Cadência com árvore de decisão** (respostas do lead guiam o próximo bloco)
* **Painel “Hoje” por vendedor** (com leads e tarefas)
* **Playbook com versão e aprovação**
* **Sugeridor de material automático** (baseado na objeção detectada)
* **Treinamento interno** (microaulas por produto, quiz rápido)
* **Score de prontidão do vendedor** (domina pitch? pricing? objeções?)
* **Relatórios de adoção e gargalos**
* **Changelog do produto** (o que mudou na oferta/argumentos)

---

## 9) Integrações (quando fizer sentido)

Integrações úteis, por ordem de ROI:

1. **CRM** (Pipedrive/Hubspot/Kommo): puxar estágio do lead e sugerir “Dia X”
2. **WhatsApp (API / Evolution / Baileys / oficial)**: copiar e colar é MVP; automação é V2
3. **Drive/Dropbox/Notion**: importar materiais
4. **Slack/WhatsApp grupo**: avisos de atualização (“Playbook do PoupeJá atualizado hoje”)
5. **LMS** (se quiser): treinamento formal

---

## 10) Padrões de qualidade (para não virar “pasta bagunçada”)

### Governança de publicação

* Tudo que é “oficial” precisa de **aprovador**
* Toda mudança gera **versão**
* Materiais antigos ficam “expirados” (sem confundir o time)

### Padrão de escrita e linguagem

* Todo produto deve ter:

  * Pitch 15s/30s/2min
  * Top 20 objeções
  * Cadência 7 dias
  * 10 provas/materiais essenciais
  * Regras do que NÃO prometer

---

## 11) Tela a tela (UX sugerida)

### Home do Vendedor

* Selecionar Produto
* “Trabalho de hoje”
* Busca rápida (objeção, material, script)
* Botão “Perguntar para IA”

### Dentro do Produto (abas)

1. **Hoje (Cadência)**
2. **Playbook**
3. **Scripts**
4. **Objeções/FAQ**
5. **Materiais**
6. **IA do Produto**
7. **Atualizações** (changelog)

### Home do Gestor

* Produtos e status (rascunho/publicado)
* Pendências de aprovação
* Conteúdos expirando
* Uso do time (adoção)

---

## 12) Plano de implantação (prático para sua operação)

### Semana 1: Estrutura e primeiro produto (PoupeJá)

* Subir template
* Preencher playbook completo
* Cadência 7 dias
* Objeções top 30
* Materiais essenciais
* Treinar IA

### Semana 2: Replicação para 2–3 produtos

* Clonar template
* Ajustar ICP/pitch/pricing
* Validar com o time (feedback real)

### Semana 3: Padronização e governança

* Aprovação/versões
* Checklist “produto pronto para venda”
* Definir dono do playbook por produto

---

## 13) “Checklist: Produto pronto para vender” (o padrão interno)

Um produto só entra no “Publicado” se tiver:

* Pitch 15s/30s/2min
* ICP e linguagem do avatar
* Oferta e pricing (com regras e condições)
* Cadência Dia 1–7
* 10 scripts essenciais (abertura, qualificação, preço, fechamento)
* Top 20 objeções preenchidas
* 10 materiais (prova/demo/explicação)
* Regras do que não prometer
* IA testada (5 cenários)

---

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/27b1415c-62ec-4a11-a7d3-647153c5bf18).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
