import {
  Callout,
  Steps,
  Step,
  KeyValue,
  RelatedDocs,
  PageHero,
  Tag,
  FeatureGrid,
} from "../components";
import {
  Crown,
  Palette,
  Layers,
  Building2,
  Smartphone,
  KeyRound,
  Copy,
  ShieldCheck,
  Bell,
  Globe,
  LifeBuoy,
} from "lucide-react";
import type { DocPage } from "../types";

export const superAdminPages: DocPage[] = [
  {
    slug: "visao-geral",
    title: "O que é o modo white label",
    description: "Você dono da plataforma, várias empresas como clientes, sua marca em tudo.",
    track: "super-admin",
    section: "Visão geral",
    order: 1,
    content: (
      <>
        <PageHero eyebrow="Super Admin" icon={Crown} title="Visão geral do white label" description="Você opera a plataforma sob sua marca. Cada cliente vê o Vendus como seu próprio sistema." />

        <h2>O que muda</h2>
        <KeyValue
          rows={[
            ["Marca", "Logo, cores (HSL), nome da plataforma e domínio próprio."],
            ["Isolamento", "Cada empresa é uma organização totalmente isolada (RLS + organization_id)."],
            ["Planos", "Você cria os planos e cobra. O Vendus aplica os limites."],
            ["Suporte", "Você é o ponto de contato. A Central de Ajuda mostra sua marca."],
          ]}
        />

        <RelatedDocs items={[
          { to: "/docs/super-admin/identidade", title: "Identidade visual", description: "Logo, cores, nome." },
          { to: "/docs/super-admin/planos", title: "Planos da plataforma" },
          { to: "/docs/super-admin/empresas", title: "Gerenciar empresas" },
        ]}/>
      </>
    ),
  },

  {
    slug: "identidade",
    title: "Identidade visual",
    description: "Logo, cores HSL, nome, favicon e textos do login.",
    track: "super-admin",
    section: "Marca",
    order: 2,
    content: (
      <>
        <PageHero eyebrow="Marca" icon={Palette} title="Identidade visual" />
        <h2>Onde configurar</h2>
        <p><strong>/super-admin → Identidade Visual</strong>. Mudanças são aplicadas em tempo real para todos os usuários via <code>usePlatformBranding</code>.</p>

        <h2>O que você pode customizar</h2>
        <KeyValue
          rows={[
            ["Nome da plataforma", "Substitui 'Vendus' em todos os lugares."],
            ["Logo principal", "Header e tela de login. Recomendado SVG ou PNG transparente."],
            ["Favicon", "Aparece na aba do navegador e PWA."],
            ["Cor primária (HSL)", "Injetada em --primary. Use HSL ou hex; o sistema converte."],
            ["Layout do login", "Split-left, split-right, full ou centered."],
            ["Headline e subheadline do login", "Texto promocional na tela de entrada."],
            ["Imagem de fundo do login", "Hero personalizado."],
            ["Texto de rodapé", "Aparece no footer global."],
            ["Esconder branding do widget", "Remove 'Powered by' do chat externo (planos pagos)."],
          ]}
        />

        <Callout type="warn" title="Cores devem ser HSL">
          O Vendus usa HSL nas variáveis CSS para temas claro/escuro. Se você colar hex, o sistema converte — mas
          o ideal é já enviar HSL para garantir contraste correto.
        </Callout>
      </>
    ),
  },

  {
    slug: "planos",
    title: "Planos da plataforma",
    description: "Criar planos com limites de leads, usuários, mensagens IA e integrações.",
    track: "super-admin",
    section: "Marca",
    order: 3,
    content: (
      <>
        <PageHero eyebrow="Marca" icon={Layers} title="Planos da plataforma" />
        <h2>Limites configuráveis</h2>
        <KeyValue
          rows={[
            ["Leads ativos", "Quantos leads simultâneos cabem na base."],
            ["Usuários da equipe", "Vendedores + admins."],
            ["Mensagens de IA / mês", "Inclui tokens consumidos por agentes."],
            ["Conversas / mês", "Soma de todos os canais."],
            ["Integrações ativas", "Hotmart, Cakto, Sankhya, etc."],
            ["Funis ativos", "Captura."],
            ["E-mails / mês", "Massa + transacional."],
          ]}
        />

        <h2>Como funciona o enforcement</h2>
        <p>
          Ao atingir o limite, o Vendus mostra um banner pedindo upgrade e bloqueia novas criações (não apaga
          existente). O fluxo de upgrade é via Stripe/Cakto/Hotmart (você escolhe).
        </p>
      </>
    ),
  },

  {
    slug: "empresas",
    title: "Empresas (organizações)",
    description: "Criar, suspender, mover e auditar empresas-cliente.",
    track: "super-admin",
    section: "Operação",
    order: 4,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={Building2} title="Empresas (organizações)" />
        <h2>Criar uma empresa</h2>
        <Steps>
          <Step title="/super-admin → Empresas → Nova">Nome, e-mail do admin inicial, plano.</Step>
          <Step title="Convite automático">O admin recebe e-mail com link para definir senha.</Step>
          <Step title="Empresa criada">Tabelas isoladas, RLS aplicado, contadores zerados.</Step>
        </Steps>

        <h2>Ações disponíveis</h2>
        <ul>
          <li><strong>Suspender</strong>: bloqueia login mas mantém dados</li>
          <li><strong>Reativar</strong>: restaura acesso</li>
          <li><strong>Mover de plano</strong>: aplica novos limites na hora</li>
          <li><strong>Login como</strong> (impersonation): para suporte (gera log de auditoria)</li>
          <li><strong>Exportar dados</strong>: LGPD compliance</li>
        </ul>
      </>
    ),
  },

  {
    slug: "whatsapp-server",
    title: "Servidor Evolution global",
    description: "Crie instâncias e atrele a empresas. Empresa escaneia o QR.",
    track: "super-admin",
    section: "Operação",
    order: 5,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={Smartphone} title="Servidor Evolution global" />
        <p>
          O servidor Evolution Go fica em <code>platform_settings</code> (global). Você cria instâncias e atrela
          a empresas. Empresas <strong>não conseguem</strong> criar ou apagar instâncias (RLS bloqueia).
        </p>

        <h2>Fluxo</h2>
        <Steps>
          <Step title="Configure o servidor uma vez">URL, API key, secret.</Step>
          <Step title="Crie uma instância para a empresa">Nome único (ex: cliente-acme-1).</Step>
          <Step title="Atrele à organização">Modal de seleção.</Step>
          <Step title="A empresa escaneia o QR">Modal com polling automático de status.</Step>
        </Steps>

        <Callout type="warn" title="Empresa só vê suas próprias instâncias">
          RLS aplicada em <code>evolution_instances</code> filtra por organization_id. Empresa A nunca vê instância
          da empresa B.
        </Callout>
      </>
    ),
  },

  {
    slug: "credenciais",
    title: "Credenciais globais",
    description: "Resend, Firecrawl, OpenAI override e outras chaves compartilhadas.",
    track: "super-admin",
    section: "Operação",
    order: 6,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={KeyRound} title="Credenciais globais" />
        <p>
          Algumas integrações usam <strong>uma chave por plataforma</strong> (não por empresa). Configure em
          /super-admin → Integrações Globais.
        </p>
        <KeyValue
          rows={[
            ["Resend API key", "E-mails transacionais e em massa."],
            ["Firecrawl API key", "Crawler para Brain e catálogo."],
            ["ElevenLabs API key", "Transcrição e voz."],
            ["OpenAI override", "Empresa pode usar chave própria via org_ai_credentials (não consome créditos Lovable)."],
          ]}
        />
        <Callout type="info" title="Roteamento de IA inteligente">
          Se uma empresa configurou <code>org_ai_credentials</code> + provider externo, a função <code>webchat-bot</code>
          chama a API direto. Senão, usa o Lovable AI Gateway (consumindo créditos da plataforma).
        </Callout>
      </>
    ),
  },

  {
    slug: "templates",
    title: "Templates globais",
    description: "E-mail, agentes, funis e cadências reutilizáveis por todas as empresas.",
    track: "super-admin",
    section: "Operação",
    order: 7,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={Copy} title="Templates globais" />
        <p>
          Crie templates que aparecem como "modelos" para todas as empresas-cliente. Eles copiam o template e
          customizam — você atualiza o original sem afetar as cópias.
        </p>
        <h2>Tipos suportados</h2>
        <ul>
          <li>Templates de e-mail (transacional e massa)</li>
          <li>Templates de agentes IA (persona + prompt + ferramentas)</li>
          <li>Templates de funis (estruturas prontas: captação SaaS, recuperação carrinho, etc.)</li>
          <li>Templates de cadências (5 passos, 7 passos, recuperação fria, etc.)</li>
        </ul>
      </>
    ),
  },

  {
    slug: "auditoria",
    title: "Auditoria global",
    description: "platform_audit_logs: tudo que aconteceu, quem fez, quando.",
    track: "super-admin",
    section: "Operação",
    order: 8,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={ShieldCheck} title="Auditoria global" />
        <p>
          A tabela <code>platform_audit_logs</code> registra: criação/suspensão de empresas, mudanças de plano,
          impersonations (login como), reset de senha forçado, alteração de credenciais globais, exclusão de
          dados.
        </p>
        <Callout type="success" title="Compliance">
          Filtros por empresa, ator, ação e período. Exportável em CSV para auditoria externa (LGPD, SOC 2).
        </Callout>
      </>
    ),
  },

  {
    slug: "notificacoes",
    title: "Notificações administrativas",
    description: "Alertas multicanal para você, dono da plataforma.",
    track: "super-admin",
    section: "Operação",
    order: 9,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={Bell} title="Notificações administrativas" />
        <p>
          Tabela <code>admin_notifications</code> + Realtime + Resend. Você recebe alertas quando:
        </p>
        <ul>
          <li>Empresa próxima do limite do plano</li>
          <li>Falha em integração crítica (Evolution caiu, Hotmart sem postback há 24h)</li>
          <li>Spike de uso de IA</li>
          <li>Nova empresa criada</li>
          <li>Pagamento recusado</li>
        </ul>
        <p>
          Um <strong>agente IA do admin</strong> também envia resumos diários e identifica padrões
          ("Empresa X dobrou volume essa semana").
        </p>
      </>
    ),
  },

  {
    slug: "dominio",
    title: "Domínio próprio",
    description: "CNAME, SSL automático e e-mails do seu domínio.",
    track: "super-admin",
    section: "Operação",
    order: 10,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={Globe} title="Domínio próprio" />
        <h2>App</h2>
        <Steps>
          <Step title="Em Project Settings → Domains, clique em Connect Domain">Insira seu domínio.</Step>
          <Step title="Crie os registros DNS no seu registrador">A (185.158.133.1) + TXT (_lovable).</Step>
          <Step title="SSL é provisionado automaticamente">Em até 72h, normalmente em minutos.</Step>
        </Steps>

        <h2>E-mail (envio)</h2>
        <p>
          Em <strong>Lovable Cloud → Emails</strong>, configure o domínio de envio. Configure SPF, DKIM e DMARC
          conforme o painel mostra. Após verificação, e-mails saem como <code>vendas@suaempresa.com.br</code>.
        </p>

        <h2>Docs (esta documentação)</h2>
        <p>
          Aponte <code>docs.suaempresa.com.br</code> para o mesmo projeto. Como o app é SPA, qualquer caminho cai
          em <code>index.html</code> e o React Router resolve <code>/docs</code>.
        </p>
      </>
    ),
  },

  {
    slug: "suporte",
    title: "Suporte e Central de Ajuda",
    description: "Tickets, base de conhecimento e SLAs.",
    track: "super-admin",
    section: "Operação",
    order: 11,
    content: (
      <>
        <PageHero eyebrow="Operação" icon={LifeBuoy} title="Suporte e Central de Ajuda" />
        <h2>Central de Ajuda interna</h2>
        <p>
          Acessível dentro do app por <code>/ajuda</code>. Artigos categorizados, busca, badge de "novidade" no menu
          quando você publica algo.
        </p>
        <h2>Tickets de suporte</h2>
        <p>
          Vendedores e admins abrem tickets pela UI. Você recebe na sua caixa de tickets, responde, marca como
          resolvido. SLA configurável (resposta em até X horas).
        </p>
      </>
    ),
  },
];
