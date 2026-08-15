# Correção da importação de catálogo por site (ComprAluga)

## O que está acontecendo hoje

Verifiquei os itens realmente gravados no banco desta operação. Três problemas distintos:

1. **Imagens quebradas porque são inventadas.** A importação só lê o texto da página (markdown) e pede para a IA "devolver as URLs das fotos". Como as URLs das fotos não estão nesse texto, a IA cria endereços plausíveis mas falsos. Exemplos gravados: `images.kenlo.io/imovel/123/img1.jpg`, `jucaimoveis.com/imoveis/CA1507/foto1.jpg`. Em outro item, a única "foto" salva é o logotipo do site (`kenlo.svg`).
2. **Informações faltando.** O conteúdo da página é cortado em 8.000 caracteres e só a "área principal" é lida, então preço, área, quartos e vagas ficam `null` em vários imóveis. Também entraram páginas que não são imóveis (Política de Privacidade, Termos de Uso, página de listagem), porque não houve filtro de URL de item.
3. **"Não vai para o treinamento".** O catálogo é um banco separado da aba de Treinamento (por isso ela aparece vazia) — isso é o comportamento correto. O agente já tem as ferramentas de buscar e enviar item do catálogo, e elas ligam automaticamente quando existem itens ativos na empresa. O que impede o envio hoje é o item estar sem foto válida e sem preço, não a falta de ligação.

## O que vou fazer

### 1. Fotos reais, nunca inventadas
- Passar a capturar o HTML da página junto com o texto e extrair dali a lista real de imagens (`<img>`, `srcset`, `og:image`, JSON-LD de produto/imóvel).
- A IA deixa de escrever URLs: ela apenas **escolhe** dentre as URLs reais encontradas, e a escolha é validada contra essa lista antes de salvar.
- Converter caminhos relativos em absolutos, descartar logos, ícones, `.svg`, sprites, pixels de rastreio e imagens minúsculas.
- Checar cada imagem (requisição leve) antes de gravar; só entram URLs que respondem imagem válida. Item sem foto válida fica com `thumbnail_url` vazio e sinalizado, em vez de guardar link quebrado.

### 2. Dados completos
- Aumentar o trecho de página enviado para extração e incluir também os blocos estruturados (JSON-LD / microdados), onde preço, área e quartos costumam estar.
- Normalizar preço (venda x aluguel), área, quartos, banheiros, suítes e vagas; quando o campo aparecer na página, ele não fica mais `null`.

### 3. Só imóveis entram
- Filtrar automaticamente páginas institucionais (privacidade, termos, contato, blog, listagens) e exigir sinal mínimo de item (preço ou atributos de imóvel) antes de gravar.
- Manter o campo "padrão da URL" como filtro opcional adicional.

### 4. Limpeza e reprocessamento
- Ação "Revalidar imagens" no catálogo: varre os itens existentes, remove URLs quebradas/logos e marca o que precisa de nova sincronização.
- Reimportar os itens desta empresa após o ajuste, para substituir os registros ruins.

### 5. Envio no WhatsApp
- No envio de item, pular imagens que não respondem em vez de falhar o envio, e enviar foto + título + preço + link apenas com dados verificados.

## Detalhes técnicos

- `supabase/functions/catalog-sync-website/index.ts`: scrape com `formats: ["markdown","html","links"]`; novo extrator de mídia a partir do HTML (img/src, srcset, og:image, JSON-LD); a tool de extração passa a receber `image_candidates` e a devolver índices; validação `HEAD`/`content-type` com timeout curto; heurística de descarte (svg, logo, sprite, icon, placeholder, dimensões < 200px quando declaradas); filtro de páginas não-item; limite de conteúdo elevado de 8k para ~20k com priorização do bloco estruturado.
- `supabase/functions/send-catalog-item/index.ts`: verificação de disponibilidade da imagem antes do envio e fallback para próxima imagem/somente texto.
- Nova ação de revalidação (edge `catalog-revalidate-media`) e botão correspondente na tela de Catálogo.
- Sem mudança de schema: `images`, `thumbnail_url` e `attributes` já existem.
