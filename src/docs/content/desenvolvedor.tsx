import {
  Callout,
  Steps,
  Step,
  KeyValue,
  RelatedDocs,
  PageHero,
  Tag,
  CodeBlock,
  EndpointCard,
  ExtLink,
} from "../components";
import {
  Code2,
  KeyRound,
  Database,
  Webhook,
  Cable,
  Phone,
  Send,
  Calendar,
  Globe,
  Radio,
  ShieldAlert,
  AlertTriangle,
  Facebook,
} from "lucide-react";
import type { DocPage } from "../types";

export const devPages: DocPage[] = [
  {
    slug: "autenticacao",
    title: "Autenticação",
    description: "Bearer JWT, anon key, RLS e quando usar service role.",
    track: "desenvolvedor",
    section: "Básico",
    order: 1,
    content: (
      <>
        <PageHero eyebrow="Trilha do Dev" icon={Code2} title="Autenticação" description="O Vendus roda sobre Supabase Postgres com RLS. Toda chamada é autenticada." />

        <h2>Chaves</h2>
        <KeyValue
          rows={[
            ["anon key", "Pública. Permite chamar endpoints com RLS aplicado para usuários anônimos."],
            ["JWT do usuário", "Obtido via signIn. RLS aplica políticas baseadas em auth.uid()."],
            ["service_role", "Bypass de RLS. Somente edge functions (server-side). NUNCA exponha no frontend."],
          ]}
        />

        <h2>Header de autenticação</h2>
        <CodeBlock lang="bash">{`curl https://SEU_PROJETO.supabase.co/rest/v1/leads \\
  -H "apikey: $ANON_KEY" \\
  -H "Authorization: Bearer $USER_JWT"`}</CodeBlock>

        <Callout type="danger" title="Multi-tenant">
          Toda query a tabelas multi-tenant <strong>DEVE</strong> filtrar por <code>organization_id</code> mesmo
          com RLS — super_admins veem tudo via RLS, então sem o filtro no client há vazamento entre empresas.
        </Callout>
      </>
    ),
  },

  {
    slug: "modelo-dados",
    title: "Modelo de dados",
    description: "Tabelas principais e relações.",
    track: "desenvolvedor",
    section: "Básico",
    order: 2,
    content: (
      <>
        <PageHero eyebrow="Básico" icon={Database} title="Modelo de dados" />
        <KeyValue
          rows={[
            ["organizations", "Cada empresa-cliente. organization_id é a chave do isolamento."],
            ["profiles", "Espelho de auth.users com dados extras. NUNCA FK direto para auth.users."],
            ["user_roles", "Tabela separada de papéis (anti privilege escalation)."],
            ["user_permissions", "Permissões granulares por usuário (view_queue_conversations, etc.)."],
            ["leads", "Contatos. Tem assigned_user_id, sdr_id, closer_id, sector_id, squad_id."],
            ["deals", "Oportunidades. Valor calculado pelo pricing JSONB do produto."],
            ["webchat_conversations", "Conversas omnichannel. status, current_agent_id, assigned_user_id."],
            ["messages", "Mensagens. metadata JSONB carrega contexto (scheduling, edits)."],
            ["tasks", "Tarefas. created_by + role inferido."],
            ["products", "Produtos. pricing JSONB."],
            ["product_agents", "Agentes IA por produto e canal."],
            ["capture_funnels", "Funis visuais. appearance JSONB com 4 temas."],
            ["cadences / cadence_steps / cadence_runs", "Engine de cadências."],
            ["agent_action_logs / agent_tool_executions", "Auditoria de IA."],
          ]}
        />
      </>
    ),
  },

  {
    slug: "webhook-entrada",
    title: "Webhook de entrada (receiver)",
    description: "Endpoint genérico para receber leads de qualquer sistema.",
    track: "desenvolvedor",
    section: "Webhooks",
    order: 3,
    content: (
      <>
        <PageHero eyebrow="Webhooks" icon={Webhook} title="Webhook de entrada (receiver)" />
        <EndpointCard method="POST" path="/functions/v1/webhook-receiver" description="Aceita qualquer payload JSON. Mapeamento configurado no admin." />
        <CodeBlock lang="bash">{`curl -X POST https://SEU_PROJETO.functions.supabase.co/webhook-receiver \\
  -H "x-webhook-token: $WEBHOOK_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria",
    "email": "maria@x.com",
    "phone": "+5511999998888",
    "utm_source": "ads",
    "custom": { "cargo": "CEO" }
  }'`}</CodeBlock>
        <Callout type="warn" title="Segurança">
          JWT desabilitado (terceiros não autenticam Supabase). Validação por <code>x-webhook-token</code>
          configurado por webhook. Cada webhook pode ter token único.
        </Callout>
      </>
    ),
  },

  {
    slug: "webhook-saida",
    title: "Webhooks de saída",
    description: "Eventos do Vendus que sua aplicação recebe.",
    track: "desenvolvedor",
    section: "Webhooks",
    order: 4,
    content: (
      <>
        <PageHero eyebrow="Webhooks" icon={Webhook} title="Webhooks de saída" />
        <h2>Eventos disponíveis</h2>
        <KeyValue
          rows={[
            ["lead.created", "Novo lead criado em qualquer canal."],
            ["lead.assigned", "Lead atribuído a vendedor (Auto Dispatch ou manual)."],
            ["lead.stage_changed", "Estágio do funil mudou."],
            ["deal.created / deal.won / deal.lost", "Eventos de oportunidade."],
            ["conversation.created / conversation.closed", "Início e fim de conversa."],
            ["task.created / task.completed", "Eventos de tarefas."],
            ["cadence.enrolled / cadence.stopped", "Cadências."],
          ]}
        />

        <h2>Payload</h2>
        <CodeBlock lang="json">{`{
  "event": "lead.created",
  "timestamp": "2026-06-02T12:34:56Z",
  "organization_id": "uuid",
  "data": {
    "lead": { "id": "uuid", "name": "...", "email": "...", "phone": "..." }
  }
}`}</CodeBlock>

        <h2>Retries</h2>
        <p>Backoff exponencial: 1min, 5min, 30min, 2h, 12h. Após 5 falhas, marca como falhado e notifica admin.</p>
      </>
    ),
  },

  {
    slug: "edge-functions",
    title: "Edge Functions (81)",
    description: "Catálogo completo das funções servless do Vendus.",
    track: "desenvolvedor",
    section: "Webhooks",
    order: 5,
    content: (
      <>
        <PageHero eyebrow="Webhooks" icon={Cable} title="Edge Functions (81)" description="Todas vivem em supabase/functions/. Deploy automático." />

        <h2>Atendimento / WhatsApp / Webchat</h2>
        <KeyValue
          rows={[
            ["webchat-api", "Endpoint público do widget."],
            ["webchat-bot", "Roteador omnichannel da IA."],
            ["webchat-inbox", "Lista conversas filtradas por setor/permissões."],
            ["whatsapp-webhook", "Eventos do WhatsApp Cloud API."],
            ["evolution-webhook", "Eventos da Evolution API."],
            ["evolution-send", "Envio via Evolution."],
            ["start-whatsapp-conversation", "Inicia WA a partir do CRM."],
            ["process-media-message", "Download/upload de mídia."],
            ["transcribe-audio", "ElevenLabs Scribe v2."],
          ]}
        />

        <h2>Agentes IA / Copilot</h2>
        <KeyValue
          rows={[
            ["sales-copilot", "Copiloto multimodal."],
            ["generate-agent-ai", "Gera persona via IA."],
            ["ai-followup-cron", "Cron de cadências IA."],
            ["manual-outreach", "Disparo manual de mensagem IA."],
          ]}
        />

        <h2>Captura</h2>
        <KeyValue
          rows={[
            ["funnel-api / funnel-submit", "Execução pública de funil."],
            ["funnel-generate-ai", "Gera funil visual."],
            ["form-submit / form-generate-ai", "Formulários."],
          ]}
        />

        <h2>Pagamentos</h2>
        <KeyValue
          rows={[
            ["cakto-webhook / cakto-proxy / cakto-recovery-trigger", "Cakto."],
            ["doppus-webhook", "Doppus."],
            ["hotmart-webhook / hotmart-sync-orders", "Hotmart."],
          ]}
        />

        <h2>Calendário</h2>
        <KeyValue
          rows={[
            ["booking-availability / booking-submit", "Disponibilidade e reserva."],
            ["google-calendar-auth / -callback / -refresh / -sync", "OAuth Google."],
            ["send-booking-confirmation", "Email de confirmação."],
          ]}
        />

        <Callout type="info" title="Como chamar uma edge function">
          POST para <code>https://SEU_PROJETO.functions.supabase.co/NOME</code> com header <code>Authorization: Bearer JWT</code>
          (exceto webhooks externos que têm JWT desativado).
        </Callout>
      </>
    ),
  },

  {
    slug: "whatsapp-cloud",
    title: "WhatsApp Cloud API (Meta)",
    description: "Webhook payload e fluxo de configuração com Meta.",
    track: "desenvolvedor",
    section: "Canais",
    order: 6,
    content: (
      <>
        <PageHero eyebrow="Canais" icon={Phone} title="WhatsApp Cloud API (Meta)" />
        <h2>Webhook</h2>
        <p>
          A função <code>whatsapp-webhook</code> recebe eventos da Meta (mensagens, status). Validação por
          <code>hub.verify_token</code> (configurado por organização).
        </p>
        <CodeBlock lang="json">{`{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5511999998888",
          "id": "wamid.XYZ",
          "type": "text",
          "text": { "body": "Olá" }
        }]
      }
    }]
  }]
}`}</CodeBlock>
        <Callout type="warn" title="Templates obrigatórios">
          Fora da janela de 24h, só dá para enviar mensagens com templates aprovados pela Meta. Configure no Meta
          Business e referencie pelo nome no Vendus.
        </Callout>
      </>
    ),
  },

  {
    slug: "evolution",
    title: "Evolution API",
    description: "QR, status e envio multi-instância.",
    track: "desenvolvedor",
    section: "Canais",
    order: 7,
    content: (
      <>
        <PageHero eyebrow="Canais" icon={Phone} title="Evolution API" />
        <h2>Fluxo</h2>
        <Steps>
          <Step title="Super Admin cria instância">No servidor Evolution Go global.</Step>
          <Step title="Atrelar à organização">Empresa vê só suas instâncias (RLS)."</Step>
          <Step title="Empresa escaneia QR">Modal com polling de status. evolution-proxy obtém QR base64."</Step>
          <Step title="Eventos chegam em evolution-webhook">Cria conversa, mensagem, lead se for novo."</Step>
        </Steps>

        <Callout type="info" title="Histórico preservado">
          <code>evolution-webhook</code> nunca auto-fecha duplicatas. Se a mesma empresa tem instância A e B,
          conversa do mesmo telefone é reaproveitada e o histórico é mantido. Modal de transferência permite
          trocar a conexão Evolution.
        </Callout>
      </>
    ),
  },

  {
    slug: "facebook-leads",
    title: "Facebook Lead Ads",
    description: "Integração nativa Graph API direto no CRM.",
    track: "desenvolvedor",
    section: "Canais",
    order: 8,
    content: (
      <>
        <PageHero eyebrow="Canais" icon={Facebook} title="Facebook Lead Ads" />
        <p>
          <code>facebook-leads-webhook</code> recebe via Graph API. Faz match com formulário do Facebook → leadgen_id
          → busca via API → mapeia para campos do lead → entra no Auto Dispatch.
        </p>
        <h2>Setup</h2>
        <Steps>
          <Step title="Conecte sua Página do Facebook">OAuth via /admin → Integrações."</Step>
          <Step title="Selecione formulários do Lead Ads">O Vendus inscreve no webhook automaticamente."</Step>
          <Step title="Mapeie campos">Telefone → phone, Nome Completo → name, etc."</Step>
        </Steps>
      </>
    ),
  },

  {
    slug: "hotmart",
    title: "Hotmart",
    description: "Postback (validação hottok) + OAuth para sync de vendas.",
    track: "desenvolvedor",
    section: "Pagamentos",
    order: 9,
    content: (
      <>
        <PageHero eyebrow="Pagamentos" icon={Send} title="Hotmart" />
        <h2>Postback</h2>
        <p>
          <code>hotmart-webhook</code> valida o <code>hottok</code> da organização e mapeia o evento (PURCHASE,
          REFUND, etc.) para o motor de <code>apply_tag_automations</code>.
        </p>
        <h2>OAuth + Sync</h2>
        <p>
          <code>hotmart-sync-orders</code> usa <code>client_credentials</code> da API Hotmart para puxar histórico
          completo de vendas e popular leads/deals retroativamente.
        </p>
      </>
    ),
  },

  {
    slug: "cakto-doppus",
    title: "Cakto e Doppus",
    description: "Webhooks de pedidos, recuperação de checkout abandonado.",
    track: "desenvolvedor",
    section: "Pagamentos",
    order: 10,
    content: (
      <>
        <PageHero eyebrow="Pagamentos" icon={Send} title="Cakto e Doppus" />
        <h2>Cakto</h2>
        <ul>
          <li><code>cakto-webhook</code> — eventos de pedido</li>
          <li><code>cakto-proxy</code> — proxy autenticado para a API</li>
          <li><code>cakto-recovery-trigger</code> — recuperação de checkout abandonado (enrolla em cadência)</li>
        </ul>
        <h2>Doppus</h2>
        <p>
          <code>doppus-webhook</code> persiste o postback completo em <code>doppus_webhook_logs</code> e mapeia
          eventos para tags.
        </p>
      </>
    ),
  },

  {
    slug: "google-calendar",
    title: "Google Calendar",
    description: "OAuth, refresh token e sync bidirecional.",
    track: "desenvolvedor",
    section: "Pagamentos",
    order: 11,
    content: (
      <>
        <PageHero eyebrow="Calendário" icon={Calendar} title="Google Calendar" />
        <h2>Fluxo OAuth</h2>
        <ol>
          <li><code>google-calendar-auth</code> redireciona para consentimento Google.</li>
          <li><code>google-calendar-callback</code> recebe o code, troca por tokens, salva criptografado.</li>
          <li><code>google-calendar-refresh</code> renova access_token quando expira.</li>
          <li><code>google-calendar-sync</code> roda em cron, espelha eventos nos dois sentidos.</li>
        </ol>
      </>
    ),
  },

  {
    slug: "widget-js",
    title: "Widget JS embedável",
    description: "funnel-widget.js sem dependências, instala em qualquer site.",
    track: "desenvolvedor",
    section: "Widget",
    order: 12,
    content: (
      <>
        <PageHero eyebrow="Widget" icon={Globe} title="Widget JS embedável" />
        <CodeBlock lang="html">{`<script src="https://app.vendus.com.br/funnel-widget.js"
  data-funnel="seu-slug"
  data-tags="tag1,tag2"
  data-score="10"
  data-position="bottom-right"
  async defer>
</script>`}</CodeBlock>
        <h2>Atributos</h2>
        <KeyValue
          rows={[
            ["data-funnel", "slug do funil (obrigatório)"],
            ["data-tags", "tags adicionadas ao lead (separadas por vírgula)"],
            ["data-score", "score inicial (default 0)"],
            ["data-position", "bottom-right | bottom-left | inline"],
            ["data-color", "cor primária override (HSL ou hex)"],
            ["data-greeting", "texto inicial do balão"],
          ]}
        />
        <Callout type="info" title="Captura automática">
          O widget captura UTMs do <code>window.location</code> do site host e referrer. Tudo vai pro lead criado.
        </Callout>
      </>
    ),
  },

  {
    slug: "realtime",
    title: "Realtime",
    description: "Supabase Realtime para Inbox, presença e notificações.",
    track: "desenvolvedor",
    section: "Avançado",
    order: 13,
    content: (
      <>
        <PageHero eyebrow="Avançado" icon={Radio} title="Realtime" />
        <h2>Canais usados</h2>
        <KeyValue
          rows={[
            ["postgres_changes em messages", "Nova mensagem aparece sem refresh."],
            ["postgres_changes em webchat_conversations", "Status, atribuição, takeover."],
            ["postgres_changes em tasks", "Notificação instantânea de nova tarefa."],
            ["broadcast em presence:user-{id}", "Quem está online/digitando."],
            ["broadcast em admin_notifications", "Alertas administrativos."],
          ]}
        />

        <CodeBlock lang="ts">{`const channel = supabase
  .channel('messages')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'messages',
    filter: 'conversation_id=eq.' + id
  }, (payload) => handle(payload))
  .subscribe();`}</CodeBlock>
      </>
    ),
  },

  {
    slug: "limites",
    title: "Limites e quotas",
    description: "Safety limits da IA, rate limits da API, paginação.",
    track: "desenvolvedor",
    section: "Avançado",
    order: 14,
    content: (
      <>
        <PageHero eyebrow="Avançado" icon={ShieldAlert} title="Limites e quotas" />
        <KeyValue
          rows={[
            ["Execuções de tools / dia / org", "Default 5000. Configurável em agent_safety_limits."],
            ["Custo IA / dia / org (centavos)", "Default 50000 (R$500). Configurável."],
            ["Rate limit Supabase API", "1000 req/s padrão. Subir requer upgrade do plano."],
            ["Paginação default", "1000 linhas. Use range(from, to) para grandes consultas."],
            ["WebSocket connections", "Subir Realtime channels conforme plano."],
          ]}
        />
        <Callout type="info" title="Default 1000 rows">
          Toda query Supabase tem limite default de 1000 linhas. Sintoma de "dados sumidos" muitas vezes é só
          paginação faltando.
        </Callout>
      </>
    ),
  },

  {
    slug: "erros",
    title: "Erros comuns e códigos",
    description: "Como diagnosticar problemas de RLS, permissões e payload.",
    track: "desenvolvedor",
    section: "Avançado",
    order: 15,
    content: (
      <>
        <PageHero eyebrow="Avançado" icon={AlertTriangle} title="Erros comuns e códigos" />
        <KeyValue
          rows={[
            ["42501 — permission denied", "RLS bloqueou. Verifique políticas + GRANT na tabela. anon/authenticated precisam de GRANT explícito."],
            ["PGRST301 — JWT expired", "Refresh token. Use supabase.auth.refreshSession()."],
            ["PGRST116 — no rows", "Query retornou vazio. Verifique organization_id no filtro."],
            ["429 — rate limit", "Reduza polling. Use Realtime ao invés de loops."],
            ["webhook 401 invalid token", "x-webhook-token errado. Confira em /admin → Webhooks."],
            ["Evolution: disconnected", "Instância caiu. Super Admin reconecta pelo QR."],
            ["IA não responde", "Confira webchat-bot logs. Provável: provider sem chave em org_ai_credentials e créditos Lovable esgotados."],
          ]}
        />
        <Callout type="tip" title="Logs">
          Toda edge function logga em <code>edge_function_logs</code>. Filtre por function_name e timestamp para
          investigar.
        </Callout>
      </>
    ),
  },
];
