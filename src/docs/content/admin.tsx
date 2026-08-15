import {
  Callout,
  Screenshot,
  Steps,
  Step,
  KeyValue,
  RelatedDocs,
  PageHero,
  Tag,
  FeatureGrid,
  CodeBlock,
} from "../components";
import {
  Settings as SettingsIcon,
  Users,
  Shield,
  Package,
  Brain,
  Bot,
  Workflow,
  FileText,
  Globe,
  Calendar,
  Zap,
  Tag as TagIcon,
  Plug,
  Webhook,
  Mail,
  Bell,
  Radar,
  BarChart3,
  Sparkles,
  Boxes,
  ListChecks,
} from "lucide-react";
import type { DocPage } from "../types";

export const adminPages: DocPage[] = [
  {
    slug: "conceitos",
    title: "Conceitos rápidos",
    description: "Organização, setor, squad, produto e papel — antes de mergulhar.",
    track: "admin",
    section: "Começando",
    order: 1,
    content: (
      <>
        <PageHero eyebrow="Trilha do Admin" icon={SettingsIcon} title="Conceitos rápidos" description="5 palavras que você vai ouvir todo dia. Entenda agora para não se confundir depois." />
        <Screenshot src="/docs-screenshots/admin/conceitos.jpg" alt="Painel administrativo do Vendus" caption="Centro do Admin: equipe, produtos, IA e integrações em um só lugar." />


        <KeyValue
          rows={[
            ["Organização", "Sua empresa dentro do Vendus. Tudo (leads, conversas, produtos) é isolado por organização. Multi-tenant real."],
            ["Setor", "Agrupamento de atendentes por especialidade (Comercial, Suporte, Pós-venda). Governa visibilidade da Inbox."],
            ["Squad", "Time comercial que recebe leads via Auto Dispatch. Um vendedor pertence a 1 squad principal."],
            ["Produto", "O que você vende. Carrega pitch, ICP, planos & preços, Brain de conhecimento, agentes de IA."],
            ["Papel", "Super Admin / Admin / Manager / Vendedor. Define o que cada um pode fazer."],
          ]}
        />

        <Callout type="tip" title="Diferença entre setor e squad">
          <strong>Setor</strong> = visibilidade (quem vê o quê na Inbox). <strong>Squad</strong> = distribuição (quem
          recebe leads novos). Um vendedor pode estar em vários setores e em 1 squad.
        </Callout>

        <RelatedDocs items={[
          { to: "/docs/admin/equipe", title: "Equipe", description: "Convidar e gerenciar usuários." },
          { to: "/docs/admin/permissoes", title: "Permissões granulares", description: "Matriz da Inbox." },
        ]}/>
      </>
    ),
  },

  {
    slug: "equipe",
    title: "Equipe: convidar e gerenciar",
    description: "Convites por e-mail, papéis, squads, setores e exclusão segura.",
    track: "admin",
    section: "Gestão",
    order: 2,
    content: (
      <>
        <PageHero eyebrow="Gestão" icon={Users} title="Equipe: convidar e gerenciar" />
        <Screenshot src="/docs-screenshots/admin/equipe.jpg" alt="Tela de gestão de equipe com lista de membros" caption="Equipe: convidar membros, definir papel, squad e setores." />

        <h2>Convidar um novo membro</h2>
        <Steps>
          <Step title="Configurações → Equipe → Convidar">Insira e-mail, nome, papel, squad e setores.</Step>
          <Step title="Confirme">O convite é enviado via Resend.</Step>
          <Step title="O convidado clica no link">Define senha → conta criada com papel, squad e setores já atribuídos.</Step>
        </Steps>

        <h2>Papéis</h2>
        <KeyValue
          rows={[
            ["Admin", "Tudo dentro da organização. Pode configurar IA, integrações, equipe."],
            ["Manager", "Vendedor com visão supervisora (vê outros vendedores). Não mexe em configurações."],
            ["Vendedor", "Operação. Vê só o que as permissões liberam."],
          ]}
        />

        <h2>Excluir um membro (com segurança)</h2>
        <Callout type="danger" title="Use sempre a opção “Excluir membro”">
          Nunca delete pelo banco. A RPC <code>delete_team_member</code> faz cascata correta: zera{" "}
          <code>assigned_user_id</code> em leads/deals/conversas (mantém histórico), revoga convites, remove
          do squad e do setor.
        </Callout>
      </>
    ),
  },

  {
    slug: "permissoes",
    title: "Permissões granulares",
    description: "Matriz completa de visibilidade da Inbox por setor.",
    track: "admin",
    section: "Gestão",
    order: 3,
    content: (
      <>
        <PageHero eyebrow="Gestão" icon={Shield} title="Permissões granulares" description="A Inbox é governada por setor + estas chaves. Configure por usuário." />
        <Screenshot src="/docs-screenshots/admin/permissoes.jpg" alt="Matriz de permissões granulares da Inbox" caption="Permissões granulares: controle fino da visibilidade da Inbox." />


        <KeyValue
          rows={[
            ["view_queue_conversations", "Ver conversas em fila do meu setor (sem atendente atribuído)."],
            ["view_other_users_conversations", "Ver conversas atribuídas a outros vendedores do meu setor (modo supervisor)."],
            ["view_other_queues_conversations", "Ver conversas de setores diferentes do meu (modo admin/auditor)."],
            ["view_unassigned_sector_tickets", "Ver conversas sem nenhum setor atribuído."],
            ["allow_inbox_panel", "Acessar o Painel de Atendimento (call-center view)."],
            ["transfer_leads", "Transferir leads entre vendedores."],
            ["delete_messages", "Excluir mensagens próprias e de outros."],
          ]}
        />

        <Callout type="warn" title="Princípio do menor privilégio">
          Comece restritivo. Libere permissões só quando o vendedor pedir e justificar. Permissões demais geram
          confusão e exposição entre setores.
        </Callout>
      </>
    ),
  },

  {
    slug: "produtos",
    title: "Produtos",
    description: "Pitch, ICP, planos, preços, CTAs e otimização por IA.",
    track: "admin",
    section: "Catálogo",
    order: 4,
    content: (
      <>
        <PageHero eyebrow="Catálogo" icon={Package} title="Produtos" />
        <Screenshot src="/docs-screenshots/admin/produtos.jpg" alt="Lista de produtos da organização" caption="Produtos: cada um traz pitch, ICP, planos & preços, Brain e agentes." />

        <h2>Por que produtos importam</h2>
        <p>
          O produto é o centro do Vendus: alimenta agentes de IA, define pricing automático para deals,
          conecta Brain de conhecimento, vincula squads e agentes específicos.
        </p>

        <h2>Campos essenciais</h2>
        <KeyValue
          rows={[
            ["Nome e descrição", "Como o time e a IA vão se referir."],
            ["Pitch 15s / 30s / 2min", "Três versões para diferentes contextos (elevador, intro, demo)."],
            ["ICP", "Ideal Customer Profile — quem é o melhor cliente."],
            ["Diferenciais", "Lista de bullets do que te diferencia."],
            ["Planos & preços (JSONB)", "Cada plano alimenta o deal_value automaticamente."],
            ["CTAs", "Botões de ação configuráveis."],
            ["Status", "Rascunho / Em revisão / Publicado."],
          ]}
        />

        <Callout type="tip" title="Botão “Otimizar com IA”">
          Cada campo tem um botão de otimização. A IA reescreve o texto seguindo SPIN Selling e mantendo seu tom
          de voz. Você aprova antes de salvar.
        </Callout>

        <RelatedDocs items={[
          { to: "/docs/admin/brain", title: "Alimentar o Brain do produto", description: "Onde a IA bebe conhecimento." },
          { to: "/docs/admin/agentes", title: "Agentes de IA por produto", description: "Vendedor virtual dedicado." },
        ]}/>
      </>
    ),
  },

  {
    slug: "brain",
    title: "Brain: base de conhecimento",
    description: "PDFs, URLs, FAQs, YouTube, .docx. Health Score e otimização.",
    track: "admin",
    section: "Catálogo",
    order: 5,
    content: (
      <>
        <PageHero eyebrow="Catálogo" icon={Brain} title="Brain: base de conhecimento" description="Tudo o que a IA precisa saber sobre o produto fica aqui." />
        <Screenshot src="/docs-screenshots/admin/brain.jpg" alt="Brain do produto com documentos e FAQ" caption="Brain: base de conhecimento que alimenta a IA do produto." />


        <h2>Fontes suportadas</h2>
        <FeatureGrid items={[
          { icon: FileText, title: "PDFs", description: "Arrastar e soltar. O Vendus extrai e indexa." },
          { icon: Globe, title: "URLs", description: "Crawler via Firecrawl. Pode listar todas as páginas do site." },
          { icon: Boxes, title: "FAQs", description: "Pergunta + resposta direto na UI." },
          { icon: Sparkles, title: "YouTube", description: "Cola URL → transcrição automática." },
          { icon: FileText, title: ".docx", description: "Parser nativo, extrai texto do word/document.xml." },
        ]} />

        <h2>Health Score</h2>
        <p>
          Indicador 0-100 da qualidade do Brain. Considera: quantidade de fontes, atualização recente, cobertura de
          objeções comuns, exemplos práticos. Mire em <strong>80+</strong>.
        </p>

        <Callout type="info" title="Atualize quando o produto mudar">
          Mudou preço, lançou módulo, virou ano? Reupload do material. Brain desatualizado = IA mentindo para o
          cliente.
        </Callout>
      </>
    ),
  },

  {
    slug: "catalogo",
    title: "Catálogo de itens",
    description: "Importar CSV, busca semântica e envio na conversa.",
    track: "admin",
    section: "Catálogo",
    order: 6,
    content: (
      <>
        <PageHero eyebrow="Catálogo" icon={Boxes} title="Catálogo de itens" />
        <Screenshot src="/docs-screenshots/admin/catalogo.jpg" alt="Catálogo de produtos enviado no WhatsApp" caption="Catálogo: itens enviáveis em conversas com 1 clique." />

        <p>
          Diferente do produto (que é um item comercial alto nível), o <strong>Catálogo</strong> guarda itens
          individuais: SKUs, peças, planos detalhados, módulos. Vendedores e IA buscam e enviam direto na conversa.
        </p>
        <h2>Importar</h2>
        <ul>
          <li><strong>CSV</strong>: coluna obrigatória <code>name</code>; opcionais <code>price</code>, <code>sku</code>, <code>image_url</code>, <code>description</code>, <code>tags</code>.</li>
          <li><strong>Site (Firecrawl)</strong>: cole a URL da loja. O Vendus identifica produtos e importa.</li>
        </ul>
        <h2>Buscar e enviar</h2>
        <p>
          Na conversa, clique no ícone de catálogo → digite parte do nome. A busca é <strong>semântica</strong>
          (entende sinônimos). Selecione o item para enviar com imagem, preço e link.
        </p>
      </>
    ),
  },

  {
    slug: "agentes",
    title: "Agentes de IA",
    description: "Persona, prompt, modelo, canais, hierarquia de seleção, 18+ ferramentas nativas.",
    track: "admin",
    section: "IA",
    order: 7,
    content: (
      <>
        <PageHero eyebrow="IA" icon={Bot} title="Agentes de IA" description="Crie vendedores virtuais que conversam como humanos e executam ações reais no CRM." />
        <Screenshot src="/docs-screenshots/admin/agentes.jpg" alt="Configuração do agente de IA" caption="Agentes IA: persona, ferramentas, canais e produto vinculado." />


        <h2>Configurar um agente</h2>
        <Steps>
          <Step title="Configurações → Agentes IA → Novo">Escolha nome e produto vinculado.</Step>
          <Step title="Defina a persona">Tom, especialidade, gatilhos.</Step>
          <Step title="Escreva o prompt (ou gere com IA)">Botão <Tag tone="primary">Gerar com IA</Tag> cria um prompt SPIN Selling baseado no produto.</Step>
          <Step title="Escolha o modelo">Gemini 2.5 Pro/Flash, GPT-5, etc.</Step>
          <Step title="Ative canais">8 canais (WhatsApp, Webchat, Instagram, Messenger, Telegram, Email, SMS, Voz).</Step>
        </Steps>

        <h2>Hierarquia de seleção</h2>
        <Callout type="info" title="Qual agente atende?">
          1. Agente explicitamente atribuído à conversa →
          2. Agente padrão do produto →
          3. Primeiro agente ativo da organização.
        </Callout>

        <h2>18+ ferramentas nativas (tools)</h2>
        <FeatureGrid items={[
          { icon: Bot, title: "create_lead / update_lead", description: "Cria e atualiza o lead na hora." },
          { icon: TagIcon, title: "aplicar_etiqueta", description: "Adiciona tag — dispara automações." },
          { icon: Calendar, title: "check_available_slots / schedule_meeting", description: "Agenda na sua agenda real." },
          { icon: Workflow, title: "transfer_to_human / switch_to_agent", description: "Handoff para humano ou outro agente." },
          { icon: ListChecks, title: "create_task", description: "Cria tarefa para vendedor." },
          { icon: Package, title: "criar_deal / gerar_link_pagamento", description: "Abre oportunidade e link de checkout." },
        ]}/>

        <h2>Persona consultiva (obrigatório)</h2>
        <ul>
          <li>SPIN Selling estrito (Situação, Problema, Implicação, Necessidade)</li>
          <li>Máximo <strong>2 linhas por bloco</strong>, <strong>1 pergunta por mensagem</strong></li>
          <li>Sem clichês ("como vai?", "espero que esteja bem")</li>
          <li>Agendamento: oferece <strong>proativamente 2 horários reais</strong></li>
        </ul>

        <Callout type="warn" title="Limites de segurança">
          Cada organização tem teto diário de execuções de tools e orçamento de IA em centavos. Ultrapassou, o agente
          para. Ajustável em Configurações → Segurança IA.
        </Callout>
      </>
    ),
  },

  {
    slug: "funis",
    title: "Funis visuais",
    description: "Editor no-code com 18 blocos, geração por IA, 4 temas independentes.",
    track: "admin",
    section: "Captura",
    order: 8,
    content: (
      <>
        <PageHero eyebrow="Captura" icon={Workflow} title="Funis visuais" />
        <Screenshot src="/docs-screenshots/admin/funis.jpg" alt="Editor visual de funis de captura" caption="Funis de captura: builder visual com blocos de mensagem, condição e IA." />

        <h2>Quando usar</h2>
        <p>
          Para qualquer entrada controlada: webchat, formulário multi-step, quiz, widget de site. O Vendus monta
          a árvore visual e renderiza no canal escolhido.
        </p>

        <h2>Blocos disponíveis</h2>
        <KeyValue
          rows={[
            ["input", "Pergunta com captura (text/email/phone/select). Variável sincroniza no lead."],
            ["score", "Soma X pontos ao score do lead."],
            ["tag", "Aplica/remove tags."],
            ["condition", "Bifurca o fluxo (equals/contains/greater/less)."],
            ["create_task", "Cria tarefa com template {{variável}}."],
            ["schedule", "Bloco de agendamento (marker __CALENDAR__)."],
            ["handoff", "Manda para humano (status=waiting_human)."],
            ["ai_takeover", "Transfere para outro agente IA via switch_to_agent."],
            ["message", "Mensagem fixa."],
            ["media", "Imagem/vídeo/PDF."],
          ]}
        />

        <h2>Geração por IA</h2>
        <p>
          Botão <Tag tone="primary">Gerar funil com IA</Tag>. Descreva o objetivo ("captar leads de imóveis com renda
          mínima 8k"), a IA monta a árvore inteira com coordenadas visuais — pronta para editar.
        </p>

        <h2>Aparência por canal</h2>
        <p>
          A aba <strong>Aparência</strong> tem 4 temas independentes (chat, form, widget, quiz). Edite cada um com
          live preview. Salvos em <code>capture_funnels.appearance</code> (JSONB).
        </p>
      </>
    ),
  },

  {
    slug: "formularios",
    title: "Formulários públicos",
    description: "Wizard estilo Typeform em /f/:slug, captura UTMs e calcula score.",
    track: "admin",
    section: "Captura",
    order: 9,
    content: (
      <>
        <PageHero eyebrow="Captura" icon={FileText} title="Formulários públicos" />
        <Screenshot src="/docs-screenshots/admin/formularios.jpg" alt="Editor de formulário público estilo Typeform" caption="Formulários públicos: wizard com lógica condicional e scoring." />

        <p>
          Cada formulário gera uma URL pública <code>/f/:slug</code> que você compartilha em ads, e-mail, bio.
          UTMs são automaticamente capturados e atribuídos ao lead criado.
        </p>

        <h2>Recursos</h2>
        <ul>
          <li>Renderização tipo Typeform (uma pergunta por tela, animações suaves)</li>
          <li>Lógica condicional (mostrar X se respondeu Y)</li>
          <li>Score calculado em tempo real</li>
          <li>Atribuição automática de SDR via Auto Dispatch</li>
          <li>Tela de agradecimento personalizável</li>
          <li>Webhook de submissão (opcional)</li>
        </ul>

        <Callout type="tip" title="Geração por IA">
          Botão <Tag tone="primary">Gerar formulário com IA</Tag>: descreve o objetivo, ele monta com perguntas BANT,
          regras condicionais e tela final.
        </Callout>
      </>
    ),
  },

  {
    slug: "quizzes",
    title: "Quizzes",
    description: "Templates de qualificação com regras condicionais.",
    track: "admin",
    section: "Captura",
    order: 10,
    content: (
      <>
        <PageHero eyebrow="Captura" icon={Sparkles} title="Quizzes" />
        <Screenshot src="/docs-screenshots/admin/quizzes.jpg" alt="Editor de quiz interativo" caption="Quizzes: capture leads qualificados com gamificação." />

        <p>Quizzes são funis especializados em qualificação por perfil. Resultado classifica o lead em segmentos.</p>
        <h2>Templates incluídos</h2>
        <ul>
          <li>Qualificação BANT (17 perguntas)</li>
          <li>Perfil de comprador (3 segmentos: explorador, comparador, decidido)</li>
          <li>Maturidade de processo (vendarketing, marketing, RH, etc.)</li>
        </ul>
        <p>Customize livremente, adicione branding, mude lógica de resultado.</p>
      </>
    ),
  },

  {
    slug: "widget",
    title: "Widget de site",
    description: "Instalar funnel-widget.js em qualquer site externo.",
    track: "admin",
    section: "Captura",
    order: 11,
    content: (
      <>
        <PageHero eyebrow="Captura" icon={Globe} title="Widget de site" />
        <Screenshot src="/docs-screenshots/admin/widget.jpg" alt="Configuração do widget de captura para site externo" caption="Widget embed: instale o funil em qualquer site com 1 linha." />

        <p>Adicione um chat/quiz/formulário em qualquer site externo (WordPress, Webflow, código próprio).</p>
        <h2>Instalação</h2>
        <CodeBlock lang="html">{`<script src="https://app.vendus.com.br/funnel-widget.js"
  data-funnel="seu-slug-aqui"
  data-tags="origem-site,landing-home"
  data-score="10"
  async defer>
</script>`}</CodeBlock>
        <Callout type="info" title="O que o widget faz">
          Sem dependências externas. Renderiza o funil, captura UTMs do site host, aplica tags e score informados,
          e cria o lead via API pública do Vendus.
        </Callout>
      </>
    ),
  },

  {
    slug: "cadencias",
    title: "Cadências inteligentes",
    description: "Sequências automáticas com tom contextual, business hours, gerador por IA.",
    track: "admin",
    section: "Automação",
    order: 12,
    content: (
      <>
        <PageHero eyebrow="Automação" icon={Zap} title="Cadências inteligentes" />
        <Screenshot src="/docs-screenshots/admin/cadencias.jpg" alt="Lista de cadências inteligentes do produto" caption="Cadências inteligentes: outreach IA escalonado em horário comercial." />

        <h2>Anatomia</h2>
        <p>
          Cada cadência tem N passos (steps). Cada step pode ser <strong>mensagem</strong> (texto/áudio/material/CTA)
          + <strong>delay</strong> (horas/dias). O Vendus executa via cron <code>cadence-tick</code> a cada 5 min,
          respeitando business hours.
        </p>

        <h2>Gerador por IA</h2>
        <p>
          Descreva: produto, objetivo (recuperar carrinho, follow-up demo, nutrir lead frio), tom (formal, casual,
          provocador). O Vendus cria 5-7 steps prontos para revisar.
        </p>

        <h2>Disparadores</h2>
        <KeyValue
          rows={[
            ["Manual", "Vendedor enrolla na aba do lead."],
            ["Formulário", "post_cadence_id no form dispara automaticamente após submit."],
            ["Pós-venda", "Evento Hotmart/Cakto/Doppus dispara cadência específica."],
            ["Campanha", "Toda audiência de uma campanha é enrollada."],
          ]}
        />

        <Callout type="success" title="Auto-stop por resposta">
          Quando o lead responde por qualquer canal, a cadência para — evita mensagem em cima de conversa real.
        </Callout>
      </>
    ),
  },

  {
    slug: "agendamentos",
    title: "Configurar agendamentos",
    description: "Tipos de evento, Google Calendar, horário comercial.",
    track: "admin",
    section: "Automação",
    order: 13,
    content: (
      <>
        <PageHero eyebrow="Automação" icon={Calendar} title="Configurar agendamentos" />
        <Screenshot src="/docs-screenshots/admin/agendamentos.jpg" alt="Configuração de eventos de agendamento" caption="Agendamentos: eventos com Google Calendar e booking público." />

        <h2>Tipos de evento</h2>
        <KeyValue
          rows={[
            ["Nome", "Ex: Demo Comercial, Discovery, Onboarding."],
            ["Duração", "15, 30, 45, 60 ou customizado."],
            ["Buffer", "Tempo livre antes e depois (5-15 min)."],
            ["Antecedência mínima", "Ex: lead só pode marcar com 2h de antecedência."],
            ["Formulário", "Padrão (campos fixos) ou conversacional (chat com IA)."],
            ["Atribuição", "Vendedor fixo, round-robin do squad ou primeiro disponível."],
          ]}
        />

        <h2>Google Calendar</h2>
        <p>
          Cada vendedor conecta o próprio Google em Perfil → Integrações. A sincronização é <strong>bidirecional</strong>:
          eventos do Google bloqueiam slots, eventos do Vendus aparecem no Google.
        </p>

        <h2>Horário comercial</h2>
        <p>
          Define os dias e horários úteis da empresa. Cadências, agendamentos da IA e Auto Dispatch só rodam dentro
          dessa janela.
        </p>
      </>
    ),
  },

  {
    slug: "auto-dispatch",
    title: "Auto Dispatch",
    description: "Distribuição automática de leads novos por capacidade e status.",
    track: "admin",
    section: "Automação",
    order: 14,
    content: (
      <>
        <PageHero eyebrow="Automação" icon={Zap} title="Auto Dispatch" />
        <Screenshot src="/docs-screenshots/admin/auto-dispatch.jpg" alt="Painel do Auto Dispatch de leads" caption="Auto Dispatch: distribui leads automaticamente por squad e status." />

        <h2>Como funciona</h2>
        <p>
          A função <code>distribute-lead</code> roda toda vez que um lead novo entra. Considera:
        </p>
        <ul>
          <li><strong>Status do vendedor</strong> — só Online recebe</li>
          <li><strong>active_leads_count</strong> — não passa do limite configurado</li>
          <li><strong>Squad</strong> — distribui dentro do squad correto do produto</li>
          <li><strong>Modo</strong> — round-robin balanceado ou prioridade por performance</li>
        </ul>

        <h2>Configuração</h2>
        <Steps>
          <Step title="Configurações → Auto Dispatch">Habilite por produto e squad.</Step>
          <Step title="Defina o limite de leads ativos por vendedor">Padrão 20.</Step>
          <Step title="Escolha o modo">Round-robin (justo) ou por performance (top performers recebem mais)."</Step>
        </Steps>

        <Callout type="info" title="Lead sem squad?">
          Cai em uma fila genérica visível por todos os vendedores com permissão <code>view_unassigned_sector_tickets</code>.
        </Callout>
      </>
    ),
  },

  {
    slug: "tags",
    title: "Tags e automações",
    description: "Apply/remove, pós-venda, exclusões automáticas.",
    track: "admin",
    section: "Automação",
    order: 15,
    content: (
      <>
        <PageHero eyebrow="Automação" icon={TagIcon} title="Tags e automações" />
        <Screenshot src="/docs-screenshots/admin/tags.jpg" alt="Gestão de tags e automações por tag" caption="Tags: classificação + automações disparadas ao aplicar/remover." />

        <h2>Tags simples</h2>
        <p>Tags são rótulos livres aplicáveis a leads (Quente, Cliente VIP, Aguardando proposta...).</p>

        <h2>Tag automations</h2>
        <p>
          Cada tag pode <strong>disparar ações</strong> ao ser aplicada ou removida: mudar estágio, enrollar em
          cadência, criar tarefa, enviar e-mail, abrir deal.
        </p>

        <h2>Eventos pós-venda</h2>
        <p>
          Webhooks da Hotmart/Cakto/Doppus mapeiam eventos (PURCHASE, REFUND, CHARGEBACK) para tags. Eventos
          finais cancelam runs pendentes em <code>post_sale_scheduled_runs</code>.
        </p>

        <Callout type="tip" title="Pacote padrão">
          Use o botão <Tag tone="primary">Aplicar pacote padrão</Tag> para criar de uma vez as tags e regras de
          exclusão clássicas de pós-venda (cliente, churn, reembolso, etc.).
        </Callout>
      </>
    ),
  },

  {
    slug: "integracoes",
    title: "Integrações",
    description: "Hotmart, Cakto, Doppus, Sankhya, Facebook, Google, Firecrawl, ElevenLabs, Resend, Twilio.",
    track: "admin",
    section: "Integrações",
    order: 16,
    content: (
      <>
        <PageHero eyebrow="Integrações" icon={Plug} title="Integrações" description="Conecte o Vendus aos sistemas que sua empresa já usa." />
        <Screenshot src="/docs-screenshots/admin/integracoes.jpg" alt="Central de integrações disponíveis" caption="Integrações: Hotmart, Sankhya, Facebook Lead Ads, ERPs e mais." />


        <KeyValue
          rows={[
            ["Hotmart", "Postback (PURCHASE → tag automations) + OAuth client_credentials para sync de vendas."],
            ["Cakto", "Webhook de pedidos + recuperação de checkout abandonado."],
            ["Doppus", "Webhook de pós-venda com persistência completa."],
            ["Sankhya ERP", "Sync 2-way: parceiros, produtos, pedidos."],
            ["Facebook Lead Ads", "Webhook Graph API direto no CRM, com distribuição."],
            ["Google Calendar", "OAuth pessoal por vendedor, sync bidirecional."],
            ["Firecrawl", "Crawler para Brain e catálogo via URL."],
            ["ElevenLabs", "Transcrição de áudio (Scribe v2 em PT-BR)."],
            ["Resend", "E-mails transacionais e em massa, com domínio próprio."],
            ["Twilio", "Chamadas de voz com IA."],
          ]}
        />

        <Callout type="info" title="Credenciais globais vs por organização">
          Credenciais de serviços compartilhados (Resend, Firecrawl) são gerenciadas pelo Super Admin. Já Hotmart,
          Sankhya, Facebook Pages são por organização.
        </Callout>
      </>
    ),
  },

  {
    slug: "webhooks",
    title: "Webhooks",
    description: "Receiver genérico de entrada + dispatch de saída por produto/squad.",
    track: "admin",
    section: "Integrações",
    order: 17,
    content: (
      <>
        <PageHero eyebrow="Integrações" icon={Webhook} title="Webhooks" />
        <Screenshot src="/docs-screenshots/admin/webhooks.jpg" alt="Central de webhooks com mapeamento de campos" caption="Webhooks: receba leads de qualquer origem com mapeamento visual." />


        <h2>Webhook de entrada (receiver)</h2>
        <p>
          Endpoint genérico que aceita qualquer payload JSON. Você mapeia campos para <code>leads.*</code> e
          <code>custom_fields</code> e o lead é criado/atualizado.
        </p>
        <CodeBlock lang="bash">{`curl -X POST https://SEU_PROJETO.functions.supabase.co/webhook-receiver \\
  -H "x-webhook-token: SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Silva",
    "email": "maria@empresa.com",
    "phone": "+5511999998888",
    "custom": { "cargo": "CMO" }
  }'`}</CodeBlock>

        <Callout type="warn" title="Segurança">
          JWT desabilitado por design (terceiros não autenticam Supabase). Use sempre validação por <code>x-webhook-token</code>
          configurado por webhook.
        </Callout>

        <h2>Webhooks de saída</h2>
        <p>
          Configure URLs externas que recebem eventos (lead.created, deal.won, conversation.closed). Retries
          automáticos com backoff exponencial.
        </p>
      </>
    ),
  },

  {
    slug: "email-massa",
    title: "E-mail em massa",
    description: "Templates com variáveis, segmentação, supressão e unsubscribe.",
    track: "admin",
    section: "Comunicação",
    order: 18,
    content: (
      <>
        <PageHero eyebrow="Comunicação" icon={Mail} title="E-mail em massa" />
        <Screenshot src="/docs-screenshots/admin/email-massa.jpg" alt="Campanha de e-mail em massa" caption="E-mail em massa: campanhas segmentadas com templates do Resend." />

        <h2>Fluxo</h2>
        <Steps>
          <Step title="Crie um template">Visual editor com variáveis {`{{nome}}, {{email}}, {{cargo}}`}.</Step>
          <Step title="Selecione a audiência">Filtros por tag, score, estágio, data de criação.</Step>
          <Step title="Agende ou dispare">Worker pgmq processa em lotes, respeitando rate limit do Resend.</Step>
        </Steps>

        <h2>Recursos importantes</h2>
        <ul>
          <li>Supressão automática de bounces e marcados como spam</li>
          <li>Link de unsubscribe público (compliance LGPD)</li>
          <li>Mapeamento de aliases (ex.: <code>{`{{nome_lead}}`}</code> → <code>leads.name</code>) na execução</li>
          <li>Pré-visualização com dados reais antes de enviar</li>
          <li>Métricas: enviados, abertos, clicados, bounce, unsubscribe</li>
        </ul>
      </>
    ),
  },

  {
    slug: "notificacoes",
    title: "Notificações automáticas",
    description: "Multicanal (in-app, e-mail, push) com regras configuráveis.",
    track: "admin",
    section: "Comunicação",
    order: 19,
    content: (
      <>
        <PageHero eyebrow="Comunicação" icon={Bell} title="Notificações automáticas" />
        <Screenshot src="/docs-screenshots/admin/notificacoes.jpg" alt="Central de notificações administrativas" caption="Notificações: alertas multicanal (in-app + e-mail) para admins." />

        <p>
          Configure quem é notificado quando algo acontece. Função <code>auto-notifications</code> avalia regras a
          cada evento.
        </p>
        <h2>Eventos disponíveis</h2>
        <KeyValue
          rows={[
            ["Novo lead", "Para o vendedor atribuído ou squad inteiro."],
            ["Tarefa vencendo / atrasada", "Para o responsável."],
            ["Conversa parada >24h", "Para o vendedor e admin."],
            ["Meta batida", "Celebra para o time inteiro com confete."],
            ["Conversa em fila >X min", "Para os admins (escalation)."],
            ["Deal ganho / perdido", "Para o vendedor e gerente."],
          ]}
        />
      </>
    ),
  },

  {
    slug: "radar",
    title: "Radar de IA",
    description: "Escaneia leads e conversas, identifica oportunidades esquecidas.",
    track: "admin",
    section: "IA",
    order: 20,
    content: (
      <>
        <PageHero eyebrow="IA" icon={Radar} title="Radar de IA" description="A IA varre toda a base e devolve um relatório de oportunidades acionáveis." />
        <Screenshot src="/docs-screenshots/admin/radar.jpg" alt="Radar de operação em tempo real" caption="Radar: leads em risco, conversas paradas e IA travada em tempo real." />


        <h2>O que detecta</h2>
        <ul>
          <li>Leads quentes parados há mais de X dias</li>
          <li>Propostas enviadas sem follow-up</li>
          <li>Conversas com sinal de compra ignorado</li>
          <li>Leads que voltaram a interagir (ex.: abriram e-mail 3x)</li>
        </ul>

        <h2>Ações 1-clique</h2>
        <FeatureGrid items={[
          { icon: Bot, title: "Chamar com IA", description: "IA inicia conversa com contexto." },
          { icon: Users, title: "Atribuir humano", description: "Define vendedor para retomar." },
          { icon: ListChecks, title: "Criar tarefa", description: "Para um membro do time." },
          { icon: Webhook, title: "Abrir conversa", description: "Vai direto na thread real (não duplica)." },
        ]}/>

        <Callout type="tip" title="Use semanalmente">
          Reserve 15 min toda segunda para revisar o Radar. Receita esquecida costuma ser maior do que receita nova.
        </Callout>
      </>
    ),
  },

  {
    slug: "relatorios",
    title: "Relatórios",
    description: "Funil, conversão, TMA/TMR/SLA, qualidade de conversa.",
    track: "admin",
    section: "Performance",
    order: 21,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={BarChart3} title="Relatórios" />
        <Screenshot src="/docs-screenshots/admin/relatorios.jpg" alt="Painel de relatórios e métricas" caption="Relatórios: conversão, comissões, leaderboard e funil." />

        <h2>Dashboards</h2>
        <ul>
          <li><strong>Comercial</strong>: funil, conversão por estágio, ticket médio, ciclo de venda, forecast</li>
          <li><strong>Atendimento</strong>: TMA (atendimento), TMR (resposta), SLA, distribuição por hora</li>
          <li><strong>IA</strong>: execuções de tools, custo por agente, taxa de handoff, qualidade média</li>
          <li><strong>Equipe</strong>: leaderboard, metas, comissões</li>
        </ul>

        <h2>Avaliação automática de conversas</h2>
        <p>
          A função <code>evaluate-conversation</code> roda após cada encerramento e dá nota 0-5 baseada em
          critérios (cordialidade, objetivo, próximos passos, técnica de venda). Use para coaching.
        </p>
      </>
    ),
  },

  {
    slug: "configuracoes",
    title: "Configurações da empresa",
    description: "Dados gerais, fuso, moeda, business hours, customização.",
    track: "admin",
    section: "Performance",
    order: 22,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={SettingsIcon} title="Configurações da empresa" />
        <Screenshot src="/docs-screenshots/admin/configuracoes.jpg" alt="Configurações gerais da organização" caption="Configurações: dados da empresa, horário, idioma e marca." />

        <KeyValue
          rows={[
            ["Dados gerais", "Razão social, CNPJ, telefone público, endereço."],
            ["Fuso horário", "Define horários de envio, business hours e relatórios."],
            ["Moeda", "Padrão BRL. Afeta exibição de valores."],
            ["Business hours", "Dias e horas úteis (alimenta cadências e IA)."],
            ["Logo e cores", "Branding interno (white label vem do Super Admin)."],
            ["Domínio de e-mail", "Configurado em Lovable Cloud → Emails."],
          ]}
        />
      </>
    ),
  },

  {
    slug: "playbook",
    title: "Boas práticas (playbook)",
    description: "BANT, tratamento de objeções, biblioteca de materiais.",
    track: "admin",
    section: "Performance",
    order: 23,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={ListChecks} title="Boas práticas (playbook)" />
        <Screenshot src="/docs-screenshots/admin/playbook.jpg" alt="Playbook do admin com checklists" caption="Playbook: checklist de configuração inicial e operação contínua." />

        <h2>Playbook vivo</h2>
        <p>Documento estruturado com pitch, ICP, scripts, comparativos com concorrentes e técnicas de fechamento.</p>
        <h2>Materiais</h2>
        <p>
          PDFs, vídeos, imagens, links e banners. Cada material é taggeado por objetivo (prova, apresentação,
          objeção, fechamento). Vendedor e IA buscam e enviam direto na conversa.
        </p>
        <h2>Objeções</h2>
        <p>
          Catálogo por categoria (preço, confiança, tempo, pensar, sócio, concorrente). Cada uma com: o que dizem /
          o que querem dizer / resposta sugerida / pergunta de follow-up / material de prova.
        </p>
        <Callout type="tip" title="Gerador de objeções por IA">
          A IA cria um catálogo inicial a partir do produto. Você revisa, edita e publica.
        </Callout>
      </>
    ),
  },
];
