import { PageHero, KeyValue, Callout, RelatedDocs, Tag } from "../components";
import {
  BookMarked, User, TrendingUp, MessageSquare, Layers, Users,
  Package, Brain, Bot, Sparkles, Workflow, TagIcon as TagI,
  Shield, ListChecks, Zap, UserCheck, Crown,
} from "lucide-react";
import { Tag as TagIcon } from "lucide-react";
import type { DocPage } from "../types";

function makeConcept(slug: string, title: string, icon: any, eyebrow: string, body: any): DocPage {
  return {
    slug,
    title,
    description: `Conceito do Vendus: ${title}`,
    track: "conceitos",
    section: eyebrow,
    order: 0,
    content: (
      <>
        <PageHero eyebrow={eyebrow} icon={icon} title={title} />
        {body}
      </>
    ),
  };
}

export const conceitosPages: DocPage[] = [
  makeConcept("lead", "Lead", User, "CRM",
    <>
      <p>
        <strong>Lead</strong> é a entidade central do Vendus. Representa qualquer contato (pessoa ou empresa) com
        potencial de virar cliente. Toda conversa nova cria um lead automaticamente, mesmo sem produto vinculado.
      </p>
      <h2>Campos centrais</h2>
      <KeyValue rows={[
        ["id", "UUID"],
        ["organization_id", "Isolamento multi-tenant. Sempre filtrar no client."],
        ["name / email / phone", "Identificação. Phone normalizado para DDI 55."],
        ["assigned_user_id", "Atendente atual (humano)."],
        ["sdr_id / closer_id", "Atribuição especializada."],
        ["sector_id / squad_id", "Visibilidade e distribuição."],
        ["score (0-100)", "Calculado por interações + BANT + funis."],
        ["tags (text[])", "Classificação livre. Dispara automações."],
        ["status / stage_id", "Estágio no funil."],
        ["custom_fields (JSONB)", "Campos personalizados por organização."],
      ]}/>
    </>
  ),

  makeConcept("deal", "Deal", TrendingUp, "CRM",
    <>
      <p>
        <strong>Deal</strong> = oportunidade comercial vinculada a um lead. Um lead pode ter vários deals (recompra,
        upsell, produtos diferentes).
      </p>
      <KeyValue rows={[
        ["lead_id", "Lead dono."],
        ["product_id", "Produto vendido."],
        ["deal_value", "Preenchido automaticamente pelo pricing JSONB do produto. Editável."],
        ["stage_id", "Estágio do pipeline."],
        ["probability", "0-100. Multiplicada por value gera forecast."],
        ["closed_at / lost_reason", "Quando e por quê (se perdido)."],
      ]}/>
    </>
  ),

  makeConcept("conversa", "Conversa", MessageSquare, "Atendimento",
    <>
      <p>
        <strong>Conversa</strong> (<code>webchat_conversations</code>) é o thread unificado de mensagens entre o lead
        e a empresa, em qualquer canal.
      </p>
      <KeyValue rows={[
        ["status", "waiting_human, bot_active, human_active, closed."],
        ["current_agent_id", "Agente IA ativo (ou null se humano)."],
        ["assigned_user_id", "Humano responsável (ou null se IA)."],
        ["channel", "whatsapp, webchat, instagram, messenger, telegram, email."],
        ["sector_id", "Setor responsável (governa visibilidade)."],
        ["evolution_instance_id", "Instância WhatsApp (se aplicável). Pode ser trocada preservando histórico."],
      ]}/>
      <Callout type="info" title="Atendente único">
        Trigger <code>enforce_single_attendant</code> garante: setar humano zera IA, setar IA zera humano. UI mostra
        apenas 1 badge (humano tem prioridade visual).
      </Callout>
    </>
  ),

  makeConcept("setor", "Setor", Layers, "Atendimento",
    <>
      <p>
        <strong>Setor</strong> é o agrupamento de atendentes por especialidade (Comercial, Suporte, Pós-venda). Governa
        a <strong>visibilidade</strong> da Inbox.
      </p>
      <p>
        Diferente do squad (que é distribuição), o setor é sobre quem vê o que. Um vendedor pode estar em vários
        setores.
      </p>
    </>
  ),

  makeConcept("squad", "Squad", Users, "Atendimento",
    <>
      <p>
        <strong>Squad</strong> é o time comercial que recebe leads via Auto Dispatch. Um vendedor pertence a 1 squad
        principal.
      </p>
      <p>
        Configurações de produto especificam qual squad recebe leads daquele produto. Auto Dispatch distribui dentro
        do squad respeitando capacidade (<code>active_leads_count</code>) e status do vendedor.
      </p>
    </>
  ),

  makeConcept("produto", "Produto", Package, "Catálogo",
    <>
      <p>
        <strong>Produto</strong> é o que você vende. Centraliza pitch, ICP, planos & preços, CTAs, Brain de
        conhecimento e agentes de IA.
      </p>
      <p>
        Pricing em JSONB alimenta automaticamente <code>deal_value</code>. Status pode ser rascunho, em revisão ou
        publicado.
      </p>
    </>
  ),

  makeConcept("brain", "Brain", Brain, "IA",
    <>
      <p>
        <strong>Brain</strong> é a base de conhecimento do produto que alimenta a IA. Aceita PDFs, URLs (via Firecrawl),
        FAQs, transcrições de YouTube e arquivos .docx.
      </p>
      <p>
        Cada produto tem seu Brain. A IA consulta sempre que precisa responder pergunta técnica ou tratar objeção.
        <strong>Health Score</strong> 0-100 indica qualidade da base.
      </p>
    </>
  ),

  makeConcept("agente-ia", "Agente IA", Bot, "IA",
    <>
      <p>
        <strong>Agente IA</strong> é um vendedor virtual configurado com persona, prompt, modelo e ferramentas. Conversa
        no lugar do humano em qualquer canal habilitado.
      </p>
      <h2>Hierarquia de seleção</h2>
      <p>Ao iniciar conversa, o Vendus escolhe agente assim:</p>
      <ol>
        <li>Agente explicitamente atribuído à conversa</li>
        <li>Agente padrão do produto vinculado</li>
        <li>Primeiro agente ativo da organização</li>
      </ol>
    </>
  ),

  makeConcept("copiloto", "Copiloto", Sparkles, "IA",
    <>
      <p>
        <strong>Copiloto</strong> é o assistente IA do vendedor humano. Sugere mensagens, trata objeções, transcreve
        áudios, analisa imagens. Não responde sozinho — sempre devolve sugestão para o vendedor revisar.
      </p>
      <p>Formato fixo: <strong>Intenção</strong> · <strong>Mensagem</strong> (sem markdown) · <strong>Pergunta</strong> de follow-up.</p>
    </>
  ),

  makeConcept("cadencia", "Cadência", Zap, "Automação",
    <>
      <p>
        <strong>Cadência</strong> é uma sequência automática de toques (mensagens, áudios, materiais) executada com
        tom contextual pela IA. Cron <code>cadence-tick</code> roda a cada 5 min via <code>manual-outreach</code>.
      </p>
      <p>Para automaticamente quando o lead responde (<code>cadence-on-response</code>).</p>
    </>
  ),

  makeConcept("funil", "Funil de captura", Workflow, "Captura",
    <>
      <p>
        <strong>Funil</strong> é uma árvore visual de blocos (input, condição, score, tag, agendamento, handoff)
        renderizada em webchat, formulário, quiz ou widget de site. Cada bloco modifica o lead em tempo real.
      </p>
      <p>
        Salvo em <code>capture_funnels</code> com <code>appearance</code> JSONB (4 temas independentes: chat, form,
        widget, quiz).
      </p>
    </>
  ),

  makeConcept("tag", "Tag", TagIcon, "Automação",
    <>
      <p>
        <strong>Tag</strong> é um rótulo livre aplicado ao lead. Cada tag pode disparar automações ao ser
        aplicada/removida: mudar estágio, criar tarefa, enrollar em cadência, enviar e-mail.
      </p>
      <p>
        Pacote padrão de tags pós-venda (cliente, churn, reembolso) com exclusões automáticas configurado pelo admin.
      </p>
    </>
  ),

  makeConcept("permissoes", "Permissões granulares", Shield, "Segurança",
    <>
      <p>
        Tabela <code>user_permissions</code> com chaves específicas que liberam capacidades. Estritamente scoped por
        organização e por usuário.
      </p>
      <KeyValue rows={[
        ["view_queue_conversations", "Ver fila do meu setor."],
        ["view_other_users_conversations", "Modo supervisor dentro do setor."],
        ["view_other_queues_conversations", "Ver outros setores (admin)."],
        ["view_unassigned_sector_tickets", "Ver conversas sem setor."],
        ["allow_inbox_panel", "Acessar o painel call-center."],
      ]}/>
    </>
  ),

  makeConcept("bant", "BANT", ListChecks, "CRM",
    <>
      <p>
        Framework de qualificação <strong>B</strong>udget / <strong>A</strong>uthority / <strong>N</strong>eed /
        <strong>T</strong>iming. 17 perguntas no Vendus, score 0-100, armazenadas como JSON em campos texto do lead.
      </p>
    </>
  ),

  makeConcept("auto-dispatch", "Auto Dispatch", Zap, "Automação",
    <>
      <p>
        Motor de distribuição automática de leads. Função <code>distribute-lead</code> escolhe vendedor por:
        status (online), capacidade (<code>active_leads_count</code>), squad do produto, modo (round-robin ou
        performance).
      </p>
    </>
  ),

  makeConcept("atendente-unico", "Atendente único", UserCheck, "Atendimento",
    <>
      <p>
        Regra rígida: cada conversa tem <strong>1 atendente</strong> (humano OU IA). Trigger
        <code>enforce_single_attendant</code> aplica isso no banco: setar <code>assigned_user_id</code> zera
        <code>current_agent_id</code> e vice-versa.
      </p>
    </>
  ),

  makeConcept("handoff", "Handoff", Bot, "IA",
    <>
      <p>
        <strong>Handoff</strong> é a transferência entre agentes. Dois tipos:
      </p>
      <KeyValue rows={[
        ["IA → humano", "Tool transfer_to_human ou bloco handoff. Status vira waiting_human, IA é desabilitada, conversa volta para fila do setor."],
        ["IA → IA (switch_to_agent)", "Bloco ai_takeover. Um agente passa para outro especialista (ex.: SDR → Closer)."],
      ]}/>
    </>
  ),

  makeConcept("white-label", "White Label", Crown, "Plataforma",
    <>
      <p>
        Engine de marca branca: HSL injetadas dinamicamente via <code>usePlatformBranding</code>, sobrescrevem
        referências fixas. Cada Super Admin tem sua marca; usuários finais nunca veem "Vendus".
      </p>
      <p>Override por organização permite que clientes parceiros tenham subdomínio próprio também.</p>
    </>
  ),
];
