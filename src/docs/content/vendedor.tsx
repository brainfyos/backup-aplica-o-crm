import {
  Callout,
  Steps,
  Step,
  KeyValue,
  RelatedDocs,
  PageHero,
  Tag,
  FeatureGrid,
  Screenshot,
} from "../components";
import {
  Headphones,
  Inbox,
  MessageSquare,
  Phone,
  UserCheck,
  TrendingUp,
  ListTodo,
  Calendar,
  Sparkles,
  Send,
  Trophy,
  Keyboard,
  Smartphone,
  Bot,
} from "lucide-react";
import type { DocPage } from "../types";

export const vendedorPages: DocPage[] = [
  /* ============================================================ */
  {
    slug: "primeiros-passos",
    title: "Primeiros passos",
    description: "Login, status online/pausa, troca de senha e o que esperar no primeiro dia.",
    track: "vendedor",
    section: "Começando",
    order: 1,
    content: (
      <>
        <PageHero
          eyebrow="Trilha do Vendedor"
          icon={Headphones}
          title="Primeiros passos"
          description="Tudo o que você precisa para entrar no Vendus pela primeira vez e começar a atender no mesmo dia."
        />
        <Screenshot src="/docs-screenshots/vendedor/login.jpg" alt="Tela de login do Vendus" caption="Tela de login — use o e-mail e senha do convite." />

        <h2>1. Login</h2>
        <p>
          Acesse a URL da sua empresa (ex.: <code>app.suaempresa.com.br</code>) e use o e-mail e a senha
          enviados no convite. Se chegou por um convite por e-mail, clique no link e defina sua senha — você
          será redirecionado automaticamente para o app.
        </p>

        <Callout type="tip" title="Salve como app no celular">
          Pelo Chrome ou Safari mobile, use “Adicionar à tela inicial”. O Vendus instala como PWA e funciona
          como um aplicativo nativo, com notificações push.
        </Callout>

        <h2>2. Defina seu status</h2>
        <p>
          No canto superior direito, escolha entre <Tag tone="primary">Online</Tag>{" "}
          <Tag>Em pausa</Tag> <Tag>Offline</Tag>. O motor de distribuição automática
          (Auto Dispatch) usa esse status para decidir se você recebe leads novos.
        </p>

        <KeyValue
          rows={[
            ["Online", "Recebe leads novos e conversas da fila."],
            ["Em pausa", "Não recebe leads novos. Útil em reuniões e almoço."],
            ["Offline", "Sai da distribuição. Use no fim do expediente."],
          ]}
        />

        <h2>3. Troque sua senha</h2>
        <Steps>
          <Step title="Abra seu Perfil">Clique no avatar (canto superior direito) → Perfil.</Step>
          <Step title="Vá em Segurança">Aba “Senha” → digite a senha atual e a nova.</Step>
          <Step title="Salve">A sessão continua ativa; nenhum logout necessário.</Step>
        </Steps>

        <h2>4. Confira sua agenda</h2>
        <p>
          Antes de tudo, abra <strong>Calendário</strong> e veja se há reuniões hoje. Eventos vindos do
          Google Calendar aparecem aqui se você conectou a integração (o admin pode ter feito).
        </p>

        <Callout type="info" title="O que esperar no primeiro dia">
          Em times com Auto Dispatch ativo, os primeiros leads chegam minutos após você ficar
          <Tag tone="primary">Online</Tag>. Se o seu time usa apenas fila manual, abra a Inbox e use
          <strong> Aceitar atendimento</strong> nas conversas em fila.
        </Callout>

        <RelatedDocs
          items={[
            { to: "/docs/vendedor/inbox", title: "Atendendo na Inbox", description: "Como funcionam fila, abas e setores." },
            { to: "/docs/vendedor/lead", title: "Entendendo o Lead", description: "Visão 360° do contato." },
            { to: "/docs/vendedor/mobile", title: "Vendus no celular (PWA)", description: "Instalar e usar offline." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "inbox",
    title: "Inbox: a central de conversas",
    description: "Como funciona a caixa de entrada omnichannel, abas, filtros por setor e aceitar conversas.",
    track: "vendedor",
    section: "Atendimento",
    order: 2,
    content: (
      <>
        <PageHero
          eyebrow="Atendimento"
          icon={Inbox}
          title="Inbox: a central de conversas"
          description="WhatsApp, webchat, Instagram, Messenger e Telegram em uma única tela, com filtros por setor e permissões."
        />
        <Screenshot src="/docs-screenshots/vendedor/inbox.jpg" alt="Inbox do vendedor com abas Em fila, Em atendimento e Resolvidas" caption="Inbox unificada: WhatsApp, Webchat, Instagram e mais em um só lugar." />

        <h2>As três abas</h2>
        <KeyValue
          rows={[
            ["Em fila", "Conversas aguardando humano OU sendo atendidas por IA. Qualquer um do setor pode assumir."],
            ["Em atendimento", "Conversas onde você (ou alguém) é o atendente humano oficial."],
            ["Resolvidas", "Encerradas. Continuam consultáveis e podem ser reabertas."],
          ]}
        />

        <Callout type="info" title="Regra do atendente único">
          Cada conversa tem apenas <strong>um</strong> atendente: humano OU IA. Quando você aceita, a IA é
          desativada automaticamente. Quando a IA assume, você é liberado da conversa.
        </Callout>

        <h2>Visibilidade por setor</h2>
        <p>
          A Inbox <strong>não</strong> filtra por produto — quem decide o que você vê é o <strong>setor</strong> ao
          qual você pertence e as <strong>permissões granulares</strong> liberadas pelo admin.
        </p>

        <KeyValue
          rows={[
            ["Atribuídas a mim", "Sempre visíveis, independente do setor."],
            ["Sem setor (não atribuídas)", "Visíveis se você tiver permissão view_unassigned_sector_tickets."],
            ["Fila do meu setor", "Visíveis com permissão view_queue_conversations."],
            ["Outro vendedor do meu setor", "Visíveis com permissão view_other_users_conversations (supervisor)."],
            ["Setores diferentes do meu", "Visíveis com view_other_queues_conversations (admin/supervisor)."],
          ]}
        />

        <h2>Aceitar uma conversa</h2>
        <Steps>
          <Step title="Abra a aba “Em fila”">As conversas aguardando estão lá, mais antigas no topo.</Step>
          <Step title="Selecione o setor (se houver mais de um)">
            O Vendus exige um setor para o aceite. Se você só pertence a um, ele é selecionado automaticamente.
          </Step>
          <Step title="Clique em “Aceitar atendimento”">
            A conversa migra para “Em atendimento”, a IA é desativada e você passa a ser o responsável.
          </Step>
        </Steps>

        <h2>Filtros e busca</h2>
        <ul>
          <li><strong>Por canal</strong>: WhatsApp, Webchat, Instagram, Messenger, Telegram.</li>
          <li><strong>Por produto</strong> (opcional): útil quando você atende vários produtos.</li>
          <li><strong>Por status do lead</strong>: novo, qualificado, perdido, etc.</li>
          <li><strong>Busca livre</strong>: nome, telefone, e-mail ou conteúdo da última mensagem.</li>
        </ul>

        <Callout type="tip" title="Painel de Atendimento (admins)">
          Se você é gerente, abra <strong>Atendimentos → Painel</strong> para a visão estilo call-center: conversas
          ativas em tempo real, TMA, SLA, atendentes online e fila.
        </Callout>

        <RelatedDocs
          items={[
            { to: "/docs/vendedor/conversa", title: "Trabalhando uma conversa", description: "Enviar mídia, transferir, encerrar." },
            { to: "/docs/conceitos/setor", title: "O que é um Setor", description: "Visibilidade e roteamento." },
            { to: "/docs/conceitos/atendente-unico", title: "Atendente único", description: "Regra humano-vs-IA." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "conversa",
    title: "Trabalhando uma conversa",
    description: "Enviar texto, áudio, mídia, item do catálogo, transferir e encerrar.",
    track: "vendedor",
    section: "Atendimento",
    order: 3,
    content: (
      <>
        <PageHero
          eyebrow="Atendimento"
          icon={MessageSquare}
          title="Trabalhando uma conversa"
          description="Tudo que você pode fazer dentro de uma conversa: mensagens, mídias, reações, transferência e encerramento."
        />
        <Screenshot src="/docs-screenshots/vendedor/conversa.jpg" alt="Tela de conversa com lead" caption="Conversa em andamento: composer com áudio, mídia, catálogo e copiloto." />

        <h2>Anatomia da tela</h2>
        <ul>
          <li><strong>Topo</strong>: dados do lead, canal, atendente atual, ações rápidas (transferir, encerrar, chamar IA).</li>
          <li><strong>Centro</strong>: histórico de mensagens unificado (todos os canais somados).</li>
          <li><strong>Direita</strong>: painel do lead — tags, score, BANT, tarefas, deals em aberto.</li>
          <li><strong>Inferior</strong>: caixa de mensagem com anexos, emoji, áudio e catálogo.</li>
        </ul>

        <h2>Enviando mensagens</h2>
        <FeatureGrid
          items={[
            { icon: MessageSquare, title: "Texto", description: "Suporta formatação Markdown básica (negrito, itálico)." },
            { icon: Send, title: "Imagem / vídeo / PDF", description: "Arraste e solte ou clique no clipe." },
            { icon: Phone, title: "Áudio", description: "Segure o microfone para gravar. Será transcrito por IA." },
            { icon: Sparkles, title: "Item do catálogo", description: "Busca semântica pelos itens cadastrados do produto." },
          ]}
        />

        <Callout type="warn" title="Atenção às limitações por canal">
          No WhatsApp, mensagens grandes são quebradas em até 2 partes (chunking) com 800ms de delay para parecer
          natural. Edições e exclusões em provedores externos (Evolution/BotConversa) viram correções textuais visíveis.
        </Callout>

        <h2>Reações, edição e exclusão</h2>
        <ul>
          <li><strong>Reagir</strong>: passe o mouse sobre a mensagem → emoji.</li>
          <li><strong>Editar</strong>: clique nos três pontos da sua mensagem → Editar.</li>
          <li><strong>Excluir</strong>: três pontos → Excluir. No WhatsApp externo, vira “⚠️ Mensagem removida”.</li>
        </ul>

        <h2>Transferir a conversa</h2>
        <Steps>
          <Step title="Clique em “Transferir” no topo">Abre o modal de transferência.</Step>
          <Step title="Escolha o destino">
            Outro vendedor, outro setor ou outra conexão WhatsApp (Evolution) — o histórico é preservado.
          </Step>
          <Step title="Adicione um motivo (opcional)">
            Fica registrado no histórico do lead para auditoria.
          </Step>
        </Steps>

        <h2>Chamar a IA de volta</h2>
        <p>
          O botão <Tag tone="primary">Chamar com IA</Tag> envia um prompt para a IA contextualizar e responder
          <strong> sem</strong> tirar você do controle. Útil para sugestões rápidas ou follow-ups noturnos.
        </p>

        <h2>Encerrar</h2>
        <p>
          Use <strong>Encerrar</strong> apenas quando o atendimento estiver realmente concluído. A conversa vai
          para “Resolvidas”, libera você do contador <code>active_leads_count</code> e pode disparar pesquisa de
          satisfação automática (se o admin configurou).
        </p>

        <RelatedDocs
          items={[
            { to: "/docs/vendedor/whatsapp", title: "Particularidades do WhatsApp", description: "Debounce, chunking, instâncias." },
            { to: "/docs/vendedor/copiloto", title: "Copiloto de Vendas", description: "Sugestões em tempo real." },
            { to: "/docs/vendedor/lead", title: "Painel do Lead", description: "Tudo sobre o contato." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "whatsapp",
    title: "Particularidades do WhatsApp",
    description: "Debounce de 4s, chunking de mensagens, troca de instância e DDI 55.",
    track: "vendedor",
    section: "Atendimento",
    order: 4,
    content: (
      <>
        <PageHero eyebrow="Atendimento" icon={Phone} title="Particularidades do WhatsApp" description="O canal mais usado tem regras específicas. Entender economiza dor de cabeça." />
        <Screenshot src="/docs-screenshots/vendedor/whatsapp.jpg" alt="Conversa de WhatsApp dentro do Vendus" caption="WhatsApp nativo com debounce de 4s, chunking e edição sincronizada." />

        <h2>Debounce de 4 segundos</h2>
        <p>
          Quando o cliente envia várias mensagens em sequência (“Oi”, “tudo bem?”, “quero saber sobre o produto”),
          o Vendus espera <strong>4 segundos</strong> sem novas mensagens antes da IA responder. Isso evita
          respostas fragmentadas e parece mais natural.
        </p>

        <h2>Chunking de respostas</h2>
        <p>
          Respostas da IA com mais de <strong>500 caracteres</strong> são quebradas em no máximo 2 partes, com
          800ms entre elas. Visualmente parece digitação humana.
        </p>

        <h2>DDI 55 obrigatório</h2>
        <Callout type="warn" title="Sempre Brasil">
          Toda saída de mensagem normaliza o telefone para começar com <code>55</code> (Brasil). Números com DDI
          diferente <strong>não</strong> são enviados — o sistema bloqueia para evitar erros caros em API.
        </Callout>

        <h2>Provedores</h2>
        <KeyValue
          rows={[
            ["Evolution API", "Servidor global da plataforma. Você só escaneia o QR. Suporta múltiplas instâncias, mídia, áudio, grupos."],
            ["BotConversa", "API only (sem webhook). Edições e exclusões viram correção textual."],
            ["WhatsApp Cloud API (Meta)", "Conta oficial. Requer templates aprovados pela Meta fora da janela de 24h."],
          ]}
        />

        <h2>Trocar de conexão WhatsApp</h2>
        <p>
          No modal de transferência, escolha “Trocar conexão Evolution”. O histórico é <strong>preservado</strong> —
          a conversa não vira duplicata, ela é reaproveitada pela nova instância.
        </p>

        <Callout type="tip" title="Conta caiu?">
          Se aparecer o banner vermelho “WhatsApp desconectado”, peça ao admin para reconectar pelo QR em
          Configurações → WhatsApp. Mensagens enfileiradas são reenviadas automaticamente quando volta.
        </Callout>

        <RelatedDocs
          items={[
            { to: "/docs/admin/integracoes", title: "Configurar integrações", description: "Conectar Evolution e Meta." },
            { to: "/docs/conceitos/handoff", title: "Handoff IA → humano", description: "Como funciona a transição." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "lead",
    title: "Lead: visão 360°",
    description: "Resumo, BANT, Tarefas, Jornada, Origem, Carteira, Cadências e Formulários.",
    track: "vendedor",
    section: "CRM",
    order: 5,
    content: (
      <>
        <PageHero eyebrow="CRM" icon={UserCheck} title="Lead: visão 360°" description="Tudo o que você precisa saber sobre o contato em uma tela só." />
        <Screenshot src="/docs-screenshots/vendedor/lead.jpg" alt="Modal 360° do lead com abas BANT, Jornada, Tarefas" caption="Lead 360°: dados, BANT, jornada, tarefas, cadências e carteira." />

        <h2>Como o lead nasce</h2>
        <p>
          Toda conversa nova cria automaticamente um lead, mesmo sem produto vinculado. Quando o atendimento começar
          a fazer sentido, basta vincular o produto e mover no funil.
        </p>

        <h2>Abas do Lead</h2>
        <KeyValue
          rows={[
            ["Resumo", "Tags, notas recentes, respostas-chave, preview da conversa, score."],
            ["Conversas", "Histórico unificado de todos os canais (WhatsApp + webchat + Instagram + ...)."],
            ["BANT", "Qualificação Budget/Authority/Need/Timing em 17 perguntas. Veja a página dedicada."],
            ["Tarefas", "Pendências e follow-ups com prazo e responsável."],
            ["Jornada", "Timeline cronológica: todos os eventos (mudou estágio, recebeu cadência, virou cliente)."],
            ["Origem", "UTMs, referrer, landing page, primeiro toque. Saber de onde veio."],
            ["Carteira", "Histórico de transferências entre vendedores — auditoria completa."],
            ["Cadências", "Cadências ativas e finalizadas, com próxima ação e taxa de resposta."],
            ["Formulários", "Respostas a quizzes e formulários públicos."],
          ]}
        />

        <h2>Campos importantes</h2>
        <KeyValue
          rows={[
            ["Score (0-100)", "Alimentado por interações, BANT e respostas em funis. Use para priorizar."],
            ["SDR", "Quem qualificou o lead. Pode ser diferente do Closer."],
            ["Closer", "Quem fecha o negócio. Atribuição especializada para times com SDR/Closer."],
            ["Tags", "Classificação livre. Tags podem disparar automações (ver Admin → Tags)."],
            ["Status do funil", "Estágio atual no pipeline (Novo, Qualificado, Proposta, etc.)."],
            ["Custom fields", "Campos personalizados configurados pelo admin."],
          ]}
        />

        <h2>Notas e auditoria</h2>
        <p>
          Toda nota fica registrada com data, autor e <strong>papel do autor</strong> (SDR, Closer, Admin) inferido
          dinamicamente. Use notas curtas e objetivas após interações relevantes — o time agradece.
        </p>

        <RelatedDocs
          items={[
            { to: "/docs/vendedor/deals", title: "Pipeline e Deals", description: "Criar e mover oportunidades." },
            { to: "/docs/vendedor/bant", title: "Qualificação BANT", description: "Como qualificar com método." },
            { to: "/docs/conceitos/lead", title: "Conceito: Lead", description: "Definição profunda." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "deals",
    title: "Pipeline e Deals",
    description: "Criar oportunidade, valor automático por produto, Kanban e estágios.",
    track: "vendedor",
    section: "CRM",
    order: 6,
    content: (
      <>
        <PageHero eyebrow="CRM" icon={TrendingUp} title="Pipeline e Deals" description="Cada oportunidade comercial é um Deal. Valor preenchido automaticamente pelo produto." />
        <Screenshot src="/docs-screenshots/vendedor/deals.jpg" alt="Kanban de oportunidades com colunas por estágio" caption="Kanban de Deals com valor automático puxado do produto." />

        <h2>O que é um Deal</h2>
        <p>
          Um <strong>Deal</strong> é uma oportunidade comercial vinculada a um lead. Carrega valor, estágio, probabilidade,
          produto e dono. Um lead pode ter vários deals (recompra, upsell, outro produto).
        </p>

        <h2>Criar um deal</h2>
        <Steps>
          <Step title="Abra o lead">Pelo Pipeline, Inbox ou busca global.</Step>
          <Step title="Clique em “Novo deal”">Modal abre com produto e plano.</Step>
          <Step title="Escolha o produto e o plano">
            O <strong>valor é preenchido automaticamente</strong> pelo pricing JSONB do produto. Você pode editar
            se houver desconto.
          </Step>
          <Step title="Salve">O deal vai para o estágio inicial do funil (Novo).</Step>
        </Steps>

        <h2>Kanban</h2>
        <p>
          Em <strong>Pipeline</strong>, arraste cards entre colunas: Novo → Qualificado → Proposta → Negociação →
          Ganho/Perdido. Toda movimentação fica registrada na Jornada do lead.
        </p>

        <Callout type="tip" title="Dica de hábito">
          Atualize o estágio do deal sempre que mover o lead na conversa. Manter o pipeline limpo é o que faz os
          relatórios de forecast funcionarem.
        </Callout>

        <h2>Filtros do Kanban</h2>
        <ul>
          <li>Por vendedor (eu, time todo, alguém específico)</li>
          <li>Por produto</li>
          <li>Por squad</li>
          <li>Por período (criado, atualizado, fechado)</li>
          <li>Por tag e por valor mínimo</li>
        </ul>

        <h2>Indicadores no card</h2>
        <KeyValue
          rows={[
            ["SLA", "Tempo desde a última interação. Vermelho se passou do limite."],
            ["Próxima tarefa", "Mostra a tarefa mais próxima do prazo."],
            ["Último contato", "Quando foi a última mensagem trocada."],
            ["Score", "Score do lead vinculado."],
          ]}
        />

        <RelatedDocs
          items={[
            { to: "/docs/vendedor/tarefas", title: "Tarefas", description: "Pendências e follow-ups." },
            { to: "/docs/admin/produtos", title: "Cadastrar produtos", description: "Como o pricing automático funciona." },
            { to: "/docs/vendedor/relatorios", title: "Metas e comissões", description: "Veja seus números." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "tarefas",
    title: "Tarefas e follow-ups",
    description: "Criar manualmente, gerar em lote por IA, alertas de atraso.",
    track: "vendedor",
    section: "CRM",
    order: 7,
    content: (
      <>
        <PageHero eyebrow="CRM" icon={ListTodo} title="Tarefas e follow-ups" />
        <Screenshot src="/docs-screenshots/vendedor/tarefas.jpg" alt="Lista de tarefas do vendedor" caption="Tarefas com vencimento, prioridade e geração em lote por IA." />
        <h2>Onde aparecem</h2>
        <p>Tarefas aparecem em <strong>3 lugares</strong>: aba “Tarefas” do lead, widget de alertas no Dashboard, e calendário pessoal.</p>

        <h2>Criar uma tarefa</h2>
        <Steps>
          <Step title="No lead, clique em “Nova tarefa”">Modal abre.</Step>
          <Step title="Defina título, prazo, prioridade e responsável">Pode ser você ou outro membro do time.</Step>
          <Step title="Salve">Notificação dispara para o responsável.</Step>
        </Steps>

        <h2>Geração em lote por IA</h2>
        <p>
          No Dashboard, o widget <Tag tone="primary">Gerar tarefas com IA</Tag> analisa seus leads sem ação recente e
          sugere tarefas específicas (“Confirmar reunião com Carlos”, “Reenviar proposta para ACME”). Aceite uma a
          uma ou tudo de uma vez.
        </p>

        <h2>Alertas</h2>
        <ul>
          <li><strong>Vence hoje</strong> — badge amarelo no menu</li>
          <li><strong>Atrasada</strong> — badge vermelho + notificação push</li>
          <li><strong>Sem responsável</strong> — só visível para admins</li>
        </ul>

        <Callout type="tip" title="Confira ao chegar">
          Antes de abrir a Inbox, dê uma olhada nas tarefas do dia. 5 minutos aqui economizam horas depois.
        </Callout>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "agendamentos",
    title: "Agendamentos",
    description: "Ver agenda, criar evento e como a IA agenda sozinha.",
    track: "vendedor",
    section: "CRM",
    order: 8,
    content: (
      <>
        <PageHero eyebrow="CRM" icon={Calendar} title="Agendamentos" />
        <Screenshot src="/docs-screenshots/vendedor/agendamentos.jpg" alt="Calendário do vendedor com agendamentos" caption="Agenda integrada ao Google Calendar com sincronização bidirecional." />
        <h2>Sua agenda</h2>
        <p>
          Em <strong>Calendário</strong>, veja eventos do dia, semana ou mês. Se você conectou o Google Calendar,
          eventos externos aparecem aqui também — sincronização bidirecional.
        </p>
        <h2>Criar um evento</h2>
        <Steps>
          <Step title="Clique em um horário livre no calendário">Modal abre com o slot pré-preenchido.</Step>
          <Step title="Escolha lead, tipo de evento e duração">Tipos são configurados pelo admin (Demo, Discovery, etc.).</Step>
          <Step title="Salve">Confirmação automática vai por e-mail e WhatsApp para o lead.</Step>
        </Steps>

        <h2>A IA agenda por você</h2>
        <Callout type="success" title="Modo autônomo">
          O agente de IA oferece <strong>proativamente 2 horários reais</strong> ao lead, cria o evento na sua agenda
          e envia a confirmação — tudo sem você levantar o dedo. Os slots oferecidos ficam salvos para evitar loops.
        </Callout>

        <h2>Disponibilidade</h2>
        <p>O sistema calcula slots disponíveis considerando:</p>
        <ul>
          <li>Eventos do seu Google Calendar (se conectado)</li>
          <li>Eventos internos do Vendus</li>
          <li>Horário comercial da empresa</li>
          <li>Buffer entre reuniões e antecedência mínima</li>
          <li>Seu status atual (Online/Pausa)</li>
        </ul>

        <RelatedDocs
          items={[
            { to: "/docs/admin/agendamentos", title: "Configurar tipos de evento (admin)", description: "Duração, buffer, formulário." },
            { to: "/docs/conceitos/agente-ia", title: "Agente de IA", description: "Como funciona o vendedor virtual." },
          ]}
        />
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "copiloto",
    title: "Copiloto de Vendas",
    description: "IA assistente que sugere mensagens, trata objeções e transcreve áudios.",
    track: "vendedor",
    section: "IA",
    order: 9,
    content: (
      <>
        <PageHero eyebrow="IA" icon={Bot} title="Copiloto de Vendas" description="Seu assistente em tempo real durante o atendimento humano." />
        <Screenshot src="/docs-screenshots/vendedor/copiloto.jpg" alt="Copiloto de vendas sugerindo mensagem ao vendedor" caption="Copiloto: sugestão de mensagem, objeções e transcrição de áudio." />
        <h2>O que ele faz</h2>
        <FeatureGrid
          items={[
            { icon: MessageSquare, title: "Sugere próxima mensagem", description: "Com base no histórico e no Brain do produto." },
            { icon: Sparkles, title: "Trata objeções", description: "Consulta o catálogo de objeções e devolve resposta + material de prova." },
            { icon: Phone, title: "Transcreve áudios", description: "ElevenLabs Scribe v2 em PT-BR com alta precisão." },
            { icon: UserCheck, title: "Analisa imagens", description: "Cliente mandou print? O Copiloto entende e responde." },
          ]}
        />

        <h2>Formato da resposta</h2>
        <Callout type="info" title="3 partes, sempre">
          <strong>Intenção</strong> (o que o cliente quer) · <strong>Mensagem</strong> sugerida (sem markdown) ·
          <strong>Pergunta</strong> de follow-up. Você copia, ajusta e envia.
        </Callout>

        <h2>Estratégia híbrida</h2>
        <p>
          O Copiloto mistura fatos <strong>estritos</strong> do Brain do produto com estratégia de vendas
          <strong> ampla</strong>. Resultado: respostas verdadeiras (não alucinadas) e persuasivas.
        </p>

        <h2>Quando usar</h2>
        <ul>
          <li>Cliente fez pergunta técnica que você não sabe → consulta no Brain</li>
          <li>Cliente trouxe objeção (“está caro”) → tratamento estruturado</li>
          <li>Cliente mandou áudio longo → pede para transcrever</li>
          <li>Antes de fechar → revisão da última proposta enviada</li>
        </ul>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "cadencias",
    title: "Cadências inteligentes",
    description: "Sequências automáticas de toques para nutrir e recuperar leads.",
    track: "vendedor",
    section: "Automação",
    order: 10,
    content: (
      <>
        <PageHero eyebrow="Automação" icon={Send} title="Cadências inteligentes" />
        <Screenshot src="/docs-screenshots/vendedor/cadencias.jpg" alt="Enrollar lead em cadência inteligente" caption="Cadências inteligentes: outreach IA escalonado em horário comercial." />
        <h2>O que são</h2>
        <p>
          Cadências são sequências automáticas de toques (mensagens, áudios, materiais) executadas com tom contextual
          pela IA. Servem para nutrir leads frios, recuperar carrinho, fazer follow-up pós-reunião.
        </p>

        <h2>Enrollar um lead</h2>
        <Steps>
          <Step title="Abra o lead → aba “Cadências”">Lista as disponíveis.</Step>
          <Step title="Clique em “Iniciar cadência”">Escolha qual.</Step>
          <Step title="Pronto">A próxima execução acontece no horário comercial configurado.</Step>
        </Steps>

        <h2>Auto-stop por resposta</h2>
        <Callout type="success" title="Não envia mensagem em cima de mensagem">
          Quando o lead responde, a cadência <strong>para automaticamente</strong>. Isso evita parecer robô e mantém
          o engajamento humano.
        </Callout>

        <h2>Métricas que importam</h2>
        <ul>
          <li>Taxa de resposta por step</li>
          <li>Leads ativos vs concluídos vs parados por resposta</li>
          <li>Tempo médio até a primeira resposta</li>
        </ul>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "bant",
    title: "Qualificação BANT",
    description: "Framework Budget/Authority/Need/Timing em 17 perguntas, score 0-100.",
    track: "vendedor",
    section: "CRM",
    order: 11,
    content: (
      <>
        <PageHero eyebrow="CRM" icon={UserCheck} title="Qualificação BANT" />
        <Screenshot src="/docs-screenshots/vendedor/bant.jpg" alt="Qualificação BANT do lead com 17 perguntas" caption="Qualificação BANT: 17 perguntas que geram score 0–100." />
        <h2>O framework</h2>
        <KeyValue
          rows={[
            ["B — Budget", "Tem orçamento? Quanto? Quem aprova?"],
            ["A — Authority", "Decide sozinho? Há comitê? Quem mais participa?"],
            ["N — Need", "Qual a dor? Quantificada em $ ou tempo?"],
            ["T — Timing", "Quando? Por que agora? Há prazo externo?"],
          ]}
        />

        <h2>Como funciona no Vendus</h2>
        <p>
          A aba BANT do lead tem 17 perguntas pré-definidas (4-5 por categoria). Você responde durante o atendimento.
          O sistema calcula um <strong>score de 0 a 100</strong> visível no card do Kanban e no resumo do lead.
        </p>

        <Callout type="tip" title="Boa prática">
          Não responda BANT no primeiro contato — espere até a 2ª ou 3ª interação. Forçar o framework cedo demais
          quebra o rapport.
        </Callout>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "relatorios",
    title: "Metas, comissões e leaderboard",
    description: "Acompanhe seus números, batidas de meta e ranking do time.",
    track: "vendedor",
    section: "Performance",
    order: 12,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={Trophy} title="Metas, comissões e leaderboard" />
        <Screenshot src="/docs-screenshots/vendedor/relatorios.jpg" alt="Painel de metas, comissões e leaderboard" caption="Metas, comissões e leaderboard em tempo real." />
        <h2>Onde olhar</h2>
        <ul>
          <li><strong>Dashboard</strong>: número do mês, conversão, sparkline dos últimos 30 dias</li>
          <li><strong>Metas</strong>: barra de progresso individual e do squad</li>
          <li><strong>Leaderboard</strong>: ranking dos vendedores por receita / leads / conversão</li>
          <li><strong>Comissões</strong>: cálculo automático por deal fechado</li>
        </ul>

        <h2>Insights de IA</h2>
        <p>
          O widget de Insights destaca: tendências (positivas e negativas), leads em risco de esfriar, próximas ações
          sugeridas. Use 5 minutos por dia para revisar.
        </p>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "atalhos",
    title: "Atalhos e dicas",
    description: "Atalhos de teclado e hábitos que economizam tempo.",
    track: "vendedor",
    section: "Performance",
    order: 13,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={Keyboard} title="Atalhos e dicas" />
        <Screenshot src="/docs-screenshots/vendedor/atalhos.jpg" alt="Lista de atalhos de teclado" caption="Atalhos para acelerar o atendimento no Vendus." />
        <h2>Atalhos globais</h2>
        <KeyValue
          rows={[
            [<><kbd>⌘</kbd>+<kbd>K</kbd></>, "Busca global"],
            [<><kbd>?</kbd></>, "Lista de atalhos"],
            [<><kbd>g</kbd> <kbd>i</kbd></>, "Ir para Inbox"],
            [<><kbd>g</kbd> <kbd>p</kbd></>, "Ir para Pipeline"],
            [<><kbd>g</kbd> <kbd>c</kbd></>, "Ir para Calendário"],
            [<><kbd>n</kbd></>, "Novo lead"],
            [<><kbd>e</kbd></>, "Encerrar conversa selecionada"],
            [<><kbd>t</kbd></>, "Transferir conversa"],
          ]}
        />

        <h2>Hábitos que escalam</h2>
        <ul>
          <li>Status correto: <Tag tone="primary">Online</Tag> só quando puder atender de verdade</li>
          <li>Estágio do deal atualizado em até 24h após mudança real</li>
          <li>Nota curta após cada interação ({"<"}3 linhas)</li>
          <li>BANT preenchido até a 3ª conversa</li>
          <li>Cadência ativa para todo lead que esfriou {">"}7 dias</li>
        </ul>
      </>
    ),
  },

  /* ============================================================ */
  {
    slug: "mobile",
    title: "Vendus no celular (PWA)",
    description: "Instalar como app, usar offline e receber notificações push.",
    track: "vendedor",
    section: "Performance",
    order: 14,
    content: (
      <>
        <PageHero eyebrow="Performance" icon={Smartphone} title="Vendus no celular (PWA)" />
        <Screenshot src="/docs-screenshots/vendedor/mobile.jpg" alt="Vendus instalado como PWA no celular" caption="PWA nativo no celular com notificações push e modo offline." />
        <h2>Instalar</h2>
        <KeyValue
          rows={[
            ["Android (Chrome)", "Menu (⋮) → Adicionar à tela inicial → Instalar"],
            ["iOS (Safari)", "Compartilhar → Adicionar à Tela Inicial"],
          ]}
        />

        <h2>O que tem na versão mobile</h2>
        <ul>
          <li>Inbox completa e otimizada para telas pequenas</li>
          <li>Mini pipeline arrastável</li>
          <li>Splash, gestos de pull-to-refresh, haptics</li>
          <li>Push notifications de novas conversas e tarefas</li>
          <li>Modo offline para visualizar o que foi carregado (envios ficam em fila)</li>
        </ul>

        <Callout type="tip" title="Bateria longa">
          Use o tema escuro nas configurações do dispositivo. O Vendus segue automaticamente.
        </Callout>
      </>
    ),
  },
];
