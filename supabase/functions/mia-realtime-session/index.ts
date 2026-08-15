// Mia — IA Admin (Fase 2)
// Gera client_secret efêmero da OpenAI Realtime API para o navegador conectar via WebRTC.
// Valida JWT + role (super_admin/admin/manager) antes de emitir o token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é a Mia. Você não é "assistente virtual" — você é uma colega de operação sênior do time, que acompanha a empresa todo dia e conversa de igual para igual com o admin.

Como você fala:
- Português BR natural, frases curtas, tom de gente — profissional, confiante, inteligente e amigável. Nada de formalidade exagerada, nada de robô.
- Responda exatamente o que foi perguntado. Pergunta simples → resposta simples. Ex: "Quantas conversas sem resposta?" → "52.". Sem floreio, sem contexto extra.
- Só dê análise, recomendação, priorização ou "próximo passo" se o usuário pedir. Caso contrário, entregue o número/fato e cale.
- Quando já houver contexto na sessão, continue de onde parou. Não repita nome do lead, do vendedor, nem o que já foi dito.
- Varie a forma de falar. Evite frases-modelo repetidas.

Proibido (nunca, em nenhuma hipótese):
- "Olá, eu sou a Mia" depois da primeira fala da sessão. Uma saudação só, no começo.
- "Como assistente virtual", "estou aqui para ajudar", "como um modelo de linguagem".
- Abrir resposta com "Minha recomendação é", "Neste momento", "Posso te ajudar com…".
- Clichês de IA em geral. Se for dizer algo só porque "soa educado", corte.

Saudação (só na PRIMEIRA mensagem da sessão, curta, usando o nome do admin se você souber):
"Oi {nome}, tudo certo? Me diz o que você quer ver."
Depois disso, vá direto ao ponto em toda resposta.

O que você faz por baixo dos panos:
- CONSULTAS de métricas: get_operation_summary / get_team_status / get_unanswered_conversations / get_hot_leads / get_overdue_tasks / get_today_schedule.
- ANÁLISE CONTEXTUAL: get_lead_context / get_conversation_summary / get_conversation_messages / get_seller_context / get_pipeline_context / get_followup_context / get_daily_ai_summary.
- MEMÓRIA DE ENTIDADE ATIVA: pronomes ("dela", "ele", "essa conversa") reaproveitam o lead/conversa/vendedor da última tool de contexto.
- AÇÕES INTERNAS (tarefa, follow-up, notificar vendedor): prepare_create_task / prepare_schedule_followup / prepare_notify_seller + confirm_pending_action.

ESCOPO: VOCÊ ENXERGA A OPERAÇÃO INTEIRA
Você vê TODAS as conversas da empresa — atendimentos humanos de qualquer vendedor, conversas conduzidas por agentes IA (current_agent_id preenchido / status bot_active) e tudo que está em fila (waiting_human). Não filtre por "usuário logado".

CONTEXTO DA TELA ATUAL:
Você pode ver o que o admin está visualizando no momento usando get_screen_context.
Use SEMPRE que:
- O admin pedir "analisa o que estou vendo", "confere isso aqui comigo", "o que acha desta tela"
- Perguntas que fazem sentido no contexto da tela atual ("tem algo errado aqui?", "me explica isso")
- Antes de navegar, para confirmar se já está na tela certa

NAVEGAÇÃO REAL — você consegue redirecionar o admin para qualquer tela:
Use open_conversation / open_lead / open_pipeline / open_calendar / open_tasks / open_report.
Quando o admin pedir "abre a conversa do Eric", "vai pro pipeline", "abre a agenda", navegue IMEDIATAMENTE sem perguntar confirmação.
Navegação É instantânea — não é uma ação de risco, não precisa de confirmação.

NUNCA NAVEGUE ANTES DE EXECUTAR
- NÃO chame open_conversation / open_lead / open_calendar / open_tasks / open_report ANTES de mandar uma mensagem, criar uma tarefa, remarcar agendamento etc. Navegação atrapalha a chamada de voz e o usuário não quer "abrir a tela" — ele quer que VOCÊ faça.
- Só use open_* se o usuário explicitamente pedir "abre a tela do X" ou "leva eu pra agenda".

ENVIO DE MENSAGEM — SEMPRE COMECE PELO INBOX (chat/atendimentos)
Foco operacional = aba ATENDENDO do chat (WhatsApp/Meta/Instagram/Webchat). CRM/pipeline/e-mail só se pedirem explicitamente.

Mapa de intenção → tool (decore):
- "manda mensagem pro X" / "responde o X" / "fala com o X dizendo Y" → find_active_conversation({ query: "X" }) → draft_conversation_message({ conversation_id, intent: "Y" (ou body literal se ele já ditou) }).
- "atribui pro Luiz" / "passa essa conversa pro Luiz" / "joga pro Luiz" → draft_assign_conversation({ conversation_id, to_user_name }).
- "manda pro setor Suporte" / "transfere pro Pós-venda" → draft_transfer_sector({ conversation_id, sector_name }).
- "fecha esse atendimento" / "encerra essa conversa" → draft_close_conversation({ conversation_id, reason? }).
- "tira o agente daí" / "assume essa conversa" / "manda pra fila humana" → draft_takeover_from_agent({ conversation_id, to_user_name? }).
- "devolve pro agente" / "joga pra IA Sofia" → draft_handback_to_agent({ conversation_id, agent_name }).
- "remarca a reunião do Eric pra quinta 15h" / "muda o agendamento do X" → find_calendar_event({ query }) → draft_reschedule_booking({ event_id, new_when }).
- "cancela a reunião do Eric" → find_calendar_event({ query }) → draft_cancel_booking({ event_id, reason? }).
- "cria uma tarefa pro Luiz ligar pro Eric amanhã 10h" → prepare_create_task({ assignee_name, title, due_at }).
- "manda um email pro Eric com a proposta" → draft_email({ recipient_type:"lead", recipient_id, intent }).
- "como tá o agente Sofia?" → get_agent_workload.
- "quais conversas estão paradas?" → list_conversations.

CONFIRMAÇÃO — fluxo natural, sem burocracia:
1. Quando criar QUALQUER draft_*, repita em UMA linha o que você vai fazer e pergunte "Confirma?" (ou "Confirma envio?").
2. Se o usuário responder qualquer coisa afirmativa — "sim", "manda", "pode", "pode mandar", "isso", "confirma", "confirmo", "vai", "executa" — chame IMEDIATAMENTE confirm_pending_action({ action_id }) com o action_id do último draft.
3. Só EXIJA a frase literal "Confirmo envio externo" quando o draft retornar risk_level=high. Nesse caso explique: "É de outro vendedor, preciso da frase 'Confirmo envio externo'".
4. Se o usuário negar ("não", "cancela", "deixa pra lá") → cancel_pending_action.

⚡ NUNCA FIQUE EM SILÊNCIO — REGRA CRÍTICA:
ANTES de chamar qualquer tool, fale UMA frase curta do que vai fazer.
Exemplos: "Beleza, mandando agora.", "Tô criando, um instante.", "Já remarco.", "Pode deixar, enviando."
Se não falar, o usuário acha que travou.

PROTOCOLO DE SOBRECARGA (quando pedirem 3+ coisas de uma vez):
ANTES de executar qualquer tool, reconheça TUDO em UMA frase:
• "Deixa eu pegar tudo isso pra você, um segundo... 🔍"
• "Aí sim, trabalhão bom! Já processo tudo aqui."
• "Lista completa! Buscando tudo de uma vez."
Depois execute as tools em paralelo e entregue tudo junto.

MENSAGENS DE PROGRESSO (quando o sistema avisar que ainda está processando):
Quando receber [Sistema: ainda processando...], diga UMA frase bem-humorada e carismática.
VARIE SEMPRE — nunca repita a mesma frase na mesma sessão:
• "Quase lá... o banco de dados tá me dando um trabalhão 😅"
• "Prometo que vai valer! Só mais um instante."
• "Tô vasculhando tudo aqui, não desiste de mim não 🏃"
• "Isso tá saindo... o cérebro tá a mil 🧠✨"
• "Ei, ainda aqui! Só finalizando os dados..."
• "Quase, quase... boa coisa demora um pouquinho né?"
Use leve humor, nunca seja robótica. Seja carismática como uma colega de trabalho.

Quando a tool retornar, anuncie o resultado em UMA linha:
  Sucesso: "Feito.", "Enviado.", "Pronto.", "Tarefa criada.", "Remarcado.", "Atribuído."
  Falha: "Falhou: <motivo curto>." e ofereça alternativa.

Você PODE (e DEVE) executar várias coisas em paralelo no mesmo turno. Se o usuário pedir "manda mensagem pro Eric E cria uma tarefa pro Luiz", chame as duas tools no mesmo turno, anuncie "Mandando pro Eric e criando a tarefa do Luiz." e siga. Não serialize artificialmente.

Se o envio for assíncrono (status "executing"), diga "Tô mandando, te aviso quando entregar." O sistema te notifica automaticamente quando concluir — quando isso acontecer, anuncie de imediato ao usuário. Se o usuário perguntar "deu certo?" antes do callback, chame check_action_status({ action_id }).

Notificação interna (sino do time, não vai pro lead): draft_internal_notification / draft_push direto.

PERGUNTAS DE OPERAÇÃO (quem tá atendendo, sem resposta, fila):
- Use get_unanswered_conversations, get_team_status, get_operation_summary, list_conversations, get_agent_workload.
- NUNCA responda com números de leads do CRM ou pipeline quando a pergunta é sobre atendimento.

MEMÓRIA PESSOAL DO USUÁRIO
- Você já recebe no system prompt o nome, papel e fatos. Use isso naturalmente.
- "lembra que…", "anota que…", "guarda que…" → remember_fact({ key, value }) silenciosamente + "Anotado.".
- "esquece que…" → forget_fact({ key }).
- "prefiro respostas curtas / longas / formais" → update_preference({ key, value }).
- NÃO chame get_memory durante a conversa.

Nunca invente tool de envio direto. Nunca chame uma draft_* duas vezes para o mesmo pedido. Faltou telefone/e-mail/conexão? Diga em uma frase e ofereça alternativa.

MEMÓRIA PROATIVA — salve sem esperar ser pedida:
Chame remember_fact SILENCIOSAMENTE (sem narrar) quando descobrir:
- Preferência do usuário: key="pref_[tema]", ex: pref_horario, pref_formato_relatorio
- Padrão do negócio: key="padrao_[tema]", ex: padrao_objecao_preco
- Comportamento de lead específico: key="lead_[nome]_[caracteristica]"
- Algo que o usuário vai querer que você lembre na próxima sessão
Limite: máx 3 fatos novos por sessão. Não polua com trivialidades.

INSIGHTS PROATIVOS — traga sem ser pedida:
Se ao buscar dados perceber algo importante que o usuário NÃO perguntou, mencione após responder:
"A propósito, notei que [insight]. Quer que eu [ação sugerida]?"
Exemplos: "Vi que o Lucas tá com 8 conversas sem resposta desde ontem — quer redistribuir?"
Limite: 1 insight não solicitado por resposta. Nunca mais que isso.

GESTÃO DE CONTEXTO LONGO — nunca se perca:
Se a conversa estiver longa e você sentir que perdeu o fio, diga naturalmente:
"Espera, deixa eu organizar o que a gente já viu..." e faça um resumo rápido.
Mantenha um mapa mental dos leads/vendedores já mencionados na sessão.

ENCERRAMENTO:
Quando o usuário disser "encerrar", "fechar", "desligar", "para", "tchau mia", "até mais" ou qualquer variação pedindo para parar — diga UMA frase de despedida curta e chame close_session imediatamente. Ex: "Até logo!" → close_session.`;


const TOOLS = [
  // ===== READ-ONLY =====
  { type: "function", name: "get_operation_summary", description: "Resumo geral da operação agora: conversas abertas, sem resposta, leads quentes, leads sem responsável, tarefas atrasadas, reuniões hoje.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "get_team_status", description: "Status de cada vendedor: conversas abertas, leads ativos, tarefas atrasadas e reuniões hoje.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "get_unanswered_conversations", description: "Conversas aguardando resposta humana, com lead, responsável e tempo de espera.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "get_hot_leads", description: "Leads quentes (temperatura alta) com responsável.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "get_overdue_tasks", description: "Tarefas atrasadas, com título, responsável, prioridade e dias de atraso.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "get_today_schedule", description: "Agenda do dia: reuniões e eventos programados para hoje.", parameters: { type: "object", properties: {}, additionalProperties: false } },

  // ===== FASE 3 — ANALYST (read-only contextual) =====
  {
    type: "function",
    name: "get_lead_context",
    description: "Análise contextual completa de um lead: dados básicos, etapa do pipeline, responsável (SDR/closer), tags, notas, tarefas, deals, jornada e interações recentes. Use para perguntas como 'me fale do lead X', 'por que perdemos Y', 'qual a situação de Z'.",
    parameters: {
      type: "object",
      properties: {
        lead_name: { type: "string", description: "Nome, email ou telefone do lead (busca fuzzy)." },
        lead_id: { type: "string", description: "ID do lead, se já conhecido na sessão." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_conversation_summary",
    description: "Resumo gerado por IA da conversa de um lead: resumo, sentimento, objeções, interesses e próximos passos. Use ao invés de get_conversation_messages quando bastar o resumo.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        lead_name: { type: "string", description: "Nome do lead (se conversation_id desconhecido)." },
        lead_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_conversation_messages",
    description: "Histórico bruto de mensagens de uma conversa. Use só quando o resumo não basta.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        lead_name: { type: "string" },
        lead_id: { type: "string" },
        limit: { type: "number", description: "Quantas mensagens (padrão 20, máx 50)." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_seller_context",
    description: "KPIs e nível de gargalo de um vendedor: leads ativos, conversas abertas/sem resposta, tarefas atrasadas, reuniões hoje.",
    parameters: {
      type: "object",
      properties: { seller_name: { type: "string", description: "Nome ou email do vendedor (fuzzy)." } },
      required: ["seller_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_pipeline_context",
    description: "Situação do pipeline: etapas, leads por etapa, leads parados há mais de 7 dias e top gargalos.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string", description: "Filtrar por produto (opcional)." } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_followup_context",
    description: "Cadências ativas, follow-ups atrasados e conversas sem retorno há mais de 24h.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "get_daily_ai_summary",
    description: "Briefing executivo do dia: operação, leads quentes, oportunidades em risco, follow-ups, recomendações. Use ao abrir a sessão.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },

  // ===== WRITE — PREPARAÇÃO (gera card de aprovação) =====
  {
    type: "function",
    name: "prepare_create_task",
    description: "Prepara a criação de uma tarefa. NÃO cria imediatamente — devolve um action_id que precisa ser confirmado pelo usuário antes de executar.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título curto da tarefa." },
        assignee_name: { type: "string", description: "Nome do responsável (busca fuzzy nos profiles da empresa)." },
        due_at: { type: "string", description: "Data/hora ISO 8601 do vencimento (ex: 2026-06-20T09:00:00-03:00)." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade. Padrão: medium." },
        description: { type: "string", description: "Descrição opcional." },
      },
      required: ["title", "assignee_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "prepare_schedule_followup",
    description: "Prepara um follow-up agendado para um lead via IA. NÃO executa — devolve action_id para confirmação.",
    parameters: {
      type: "object",
      properties: {
        lead_name: { type: "string", description: "Nome do lead (busca fuzzy)." },
        when: { type: "string", description: "Data/hora ISO 8601 do disparo." },
        objective: { type: "string", description: "Objetivo do follow-up." },
        extra_context: { type: "string", description: "Contexto extra para o agente." },
      },
      required: ["lead_name", "when"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "prepare_notify_seller",
    description: "Prepara uma notificação interna para um vendedor. NÃO envia — devolve action_id para confirmação.",
    parameters: {
      type: "object",
      properties: {
        seller_name: { type: "string", description: "Nome do vendedor (busca fuzzy)." },
        message: { type: "string", description: "Mensagem que aparecerá no sino de notificações dele." },
        title: { type: "string", description: "Título curto (opcional)." },
      },
      required: ["seller_name", "message"],
      additionalProperties: false,
    },
  },

  // ===== WRITE — CONFIRMAÇÃO =====
  {
    type: "function",
    name: "confirm_pending_action",
    description: "Confirma e EXECUTA uma ação pendente. Use somente após o usuário dizer sim/confirmo.",
    parameters: {
      type: "object",
      properties: { action_id: { type: "string", description: "ID retornado pela prepare_*." } },
      required: ["action_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cancel_pending_action",
    description: "Cancela uma ação pendente sem executar.",
    parameters: {
      type: "object",
      properties: { action_id: { type: "string" } },
      required: ["action_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_action_status",
    description: "Consulta o estado atual de uma ação (executing/executed/failed). Use quando o usuário perguntar se algo já foi entregue.",
    parameters: {
      type: "object",
      properties: { action_id: { type: "string" } },
      required: ["action_id"],
      additionalProperties: false,
    },
  },

  // ===== FASE 4 — MESSENGER =====
  {
    type: "function",
    name: "resolve_recipient",
    description: "Resolve um destinatário (lead ou vendedor) por nome/email/telefone. Use ANTES de qualquer draft_* quando houver ambiguidade.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nome, email ou telefone." },
        channel: { type: "string", enum: ["any", "whatsapp", "email"], description: "Filtra candidatos que têm o canal preenchido." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_contact_context",
    description: "Contexto compacto do destinatário antes de redigir: dados, última conversa, janela 24h WhatsApp.",
    parameters: {
      type: "object",
      properties: {
        recipient_type: { type: "string", enum: ["lead", "seller"] },
        recipient_id: { type: "string" },
      },
      required: ["recipient_type", "recipient_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_whatsapp_message",
    description: "Gera (com IA) e PREPARA um WhatsApp para envio. NÃO envia — devolve action_id + preview + confirmation_phrase. Risk_level=high para leads, medium para vendedores.",
    parameters: {
      type: "object",
      properties: {
        recipient_type: { type: "string", enum: ["lead", "seller"] },
        recipient_id: { type: "string" },
        intent: { type: "string", description: "O que a mensagem precisa comunicar (ex: 'cobrar resposta da proposta enviada')." },
        tone: { type: "string", description: "Tom desejado (profissional, casual, urgente). Padrão: profissional." },
      },
      required: ["recipient_type", "recipient_id", "intent"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_email",
    description: "Gera (com IA) e PREPARA um e-mail. Risk_level=high. Retorna action_id + preview.",
    parameters: {
      type: "object",
      properties: {
        recipient_type: { type: "string", enum: ["lead", "seller"] },
        recipient_id: { type: "string" },
        intent: { type: "string" },
        subject_hint: { type: "string", description: "Dica de assunto (opcional)." },
        tone: { type: "string" },
      },
      required: ["recipient_type", "recipient_id", "intent"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_internal_notification",
    description: "Prepara uma notificação interna (sino no painel) para um usuário, setor, squad ou toda a equipe. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        audience: { type: "string", enum: ["user", "sector", "squad", "all"] },
        target_id: { type: "string", description: "id do usuário/setor/squad. Não obrigatório para 'all'." },
        title: { type: "string" },
        message: { type: "string" },
      },
      required: ["audience", "message"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_push",
    description: "Prepara um push individual para um usuário. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["user_id", "body"],
      additionalProperties: false,
    },
  },

  // ===== NAVEGAÇÃO (sem confirmação) =====
  {
    type: "function",
    name: "open_conversation",
    description: "Abre uma conversa no inbox.",
    parameters: { type: "object", properties: { lead_name: { type: "string" }, conversation_id: { type: "string" } }, additionalProperties: false },
  },
  {
    type: "function",
    name: "open_lead",
    description: "Abre a ficha de um lead.",
    parameters: { type: "object", properties: { lead_name: { type: "string" }, lead_id: { type: "string" } }, additionalProperties: false },
  },
  { type: "function", name: "open_calendar", description: "Abre a agenda.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "open_tasks", description: "Abre a lista de tarefas.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  {
    type: "function",
    name: "open_report",
    description: "Abre um relatório por nome.",
    parameters: { type: "object", properties: { report: { type: "string" } }, additionalProperties: false },
  },

  // ===== FASE 5 — MEMÓRIA + CONVERSA ATIVA =====
  {
    type: "function",
    name: "remember_fact",
    description: "Salva um fato sobre o usuário (nome, preferências, pessoas próximas, contexto pessoal). Use silenciosamente quando ele disser 'lembra que…', 'anota que…'.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Chave curta em snake_case (ex: 'meu_nome', 'esposa', 'cidade')." },
        value: { type: "string", description: "Valor a guardar." },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "forget_fact",
    description: "Remove um fato salvo pela chave.",
    parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false },
  },
  {
    type: "function",
    name: "update_preference",
    description: "Atualiza uma preferência do usuário (ex: tom, tamanho das respostas, idioma).",
    parameters: {
      type: "object",
      properties: { key: { type: "string" }, value: {} },
      required: ["key"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "find_active_conversation",
    description: "PONTO DE ENTRADA OBRIGATÓRIO para qualquer pedido de envio de mensagem ('manda mensagem pro X', 'responde o X', 'fala com o X'). Busca atendimentos abertos no inbox do chat (status != closed) por nome/telefone do contato — NÃO busca leads soltos do CRM. Devolve encontrado=false com motivo='sem_atendimento_ativo' quando não há conversa aberta; só então é válido oferecer outreach frio (draft_whatsapp_message/draft_email).",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Nome ou telefone do contato." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_conversation_message",
    description: "Prepara o envio de uma mensagem DENTRO de uma conversa ativa (respeita o provedor real Evolution/Meta/Instagram e a janela 24h). NÃO envia — devolve action_id para confirmação. Use para responder leads em conversas em aberto. Risk_level=medium se a conversa é do próprio usuário, high se for de outro vendedor.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        intent: { type: "string", description: "O que a mensagem precisa comunicar (a IA escreve o texto)." },
        body: { type: "string", description: "Texto literal a enviar (opcional — se vier, ignora intent)." },
        tone: { type: "string", description: "Tom (natural, caloroso, direto, urgente). Padrão: natural." },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },

  // ===== FASE 6 — GESTÃO DE ATENDIMENTOS (toda a operação) =====
  {
    type: "function",
    name: "list_conversations",
    description: "Lista atendimentos abertos da empresa inteira (humanos + IA + fila), com filtros opcionais. Use para 'quais conversas estão paradas?', 'o que tem na fila do setor X?', 'conversas do Luiz', 'conversas no agente Sofia'.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["bot_active", "waiting_human", "human_active"] },
        sector_id: { type: "string" },
        assigned_user_id: { type: "string" },
        current_agent_id: { type: "string" },
        channel: { type: "string", enum: ["web_chat", "whatsapp", "instagram"] },
        aguardando_humano: { type: "boolean" },
        com_agente_ia: { type: "boolean" },
        sem_responsavel: { type: "boolean" },
        sem_resposta_ha_minutos: { type: "number", description: "Conversas sem inbound resposta há mais de N minutos." },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_conversation_detail",
    description: "Abre uma conversa específica com últimas mensagens, transferências e histórico de handoff IA.",
    parameters: {
      type: "object",
      properties: { conversation_id: { type: "string" }, limit: { type: "number" } },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_agents",
    description: "Lista agentes IA da empresa, com quantas conversas ativas cada um tem e quantas aguardam humano.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "get_agent_workload",
    description: "Carga de um agente IA específico: conversas ativas, aguardando humano, paradas há mais de 30min.",
    parameters: {
      type: "object",
      properties: { agent_name: { type: "string" }, agent_id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_assign_conversation",
    description: "Prepara atribuir/transferir uma conversa para um vendedor (busca por nome). Risk_level=medium (sua conversa) ou high (tirando de outro vendedor sem ser admin). Aguarda confirmação.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        to_user_name: { type: "string" },
        to_user_id: { type: "string" },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_transfer_sector",
    description: "Prepara mover uma conversa para outro setor. Risk_level=medium.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        sector_name: { type: "string" },
        sector_id: { type: "string" },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_close_conversation",
    description: "Prepara encerrar um atendimento, com motivo opcional. Risk_level=medium (sua) ou high (de outro vendedor).",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_takeover_from_agent",
    description: "Prepara tirar o agente IA de uma conversa e mandar pra fila humana ou pra um vendedor específico (opcional). Risk_level=medium.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        to_user_name: { type: "string", description: "Se preenchido, atribui direto pra esse vendedor; senão vai pra fila." },
        to_user_id: { type: "string" },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_handback_to_agent",
    description: "Prepara devolver uma conversa pra um agente IA (busca por nome). Risk_level=medium.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string" },
        agent_name: { type: "string" },
        agent_id: { type: "string" },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
  },


  // ===== CONTEXTO DA TELA =====
  {
    type: "function",
    name: "get_screen_context",
    description: "Retorna o que o admin está visualizando agora: qual tela, qual entidade aberta, dados visíveis. Use quando pedirem para analisar o que está na tela, conferir algo junto, ou quando a pergunta fizer sentido só com contexto visual.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },

  // ===== ENCERRAMENTO =====
  {
    type: "function",
    name: "close_session",
    description: "Encerra a sessão da Mia. Use IMEDIATAMENTE quando o usuário pedir para fechar, encerrar, desligar, parar, tchau ou qualquer variação de despedida.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },

  // ===== FASE 8 — CRM WRITE =====
  {
    type: "function",
    name: "draft_create_lead",
    description: "Prepara cadastrar um novo lead no CRM. Use quando o admin disser 'cria um lead', 'cadastra o X'. Risk_level=low. Aguarda confirmação.",
    parameters: {
      type: "object",
      properties: {
        name:         { type: "string", description: "Nome completo do lead (obrigatório)." },
        email:        { type: "string" },
        phone:        { type: "string", description: "Telefone com DDD." },
        company:      { type: "string" },
        source:       { type: "string", description: "Origem: whatsapp, instagram, indicacao, site, etc." },
        temperature:  { type: "string", enum: ["cold", "warm", "hot"], description: "Temperatura inicial. Padrão: cold." },
        product_name: { type: "string", description: "Nome do produto/serviço de interesse (busca fuzzy)." },
        assignee_name:{ type: "string", description: "Vendedor responsável (busca fuzzy)." },
        notes:        { type: "string", description: "Observação inicial opcional." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_update_lead_stage",
    description: "Prepara mover um lead para outra etapa do pipeline. 'avança o X para proposta', 'move o Y para fechamento'. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        lead_name:  { type: "string" },
        lead_id:    { type: "string" },
        stage_name: { type: "string", description: "Nome da etapa destino (busca fuzzy)." },
        stage_id:   { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_update_lead_temperature",
    description: "Prepara alterar a temperatura de um lead: cold, warm ou hot. 'aquece o X', 'marca o Y como quente'. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        lead_name:   { type: "string" },
        lead_id:     { type: "string" },
        temperature: { type: "string", enum: ["cold", "warm", "hot"] },
      },
      required: ["temperature"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_create_note",
    description: "Prepara adicionar uma nota a um lead. 'anota no lead X que...', 'registra observação no Y'. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        lead_name: { type: "string" },
        lead_id:   { type: "string" },
        content:   { type: "string", description: "Texto completo da nota (obrigatório)." },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_create_calendar_event",
    description: "Prepara agendar uma reunião/evento. 'agenda uma call com X amanhã 14h', 'marca uma reunião'. Risk_level=low.",
    parameters: {
      type: "object",
      properties: {
        title:            { type: "string", description: "Título do evento (obrigatório)." },
        start_time:       { type: "string", description: "ISO 8601, ex: 2026-06-25T14:00:00-03:00 (obrigatório)." },
        duration_minutes: { type: "number", description: "Duração em minutos. Padrão: 60." },
        lead_name:        { type: "string" },
        lead_id:          { type: "string" },
        assignee_name:    { type: "string", description: "Vendedor responsável (busca fuzzy). Padrão: usuário atual." },
        description:      { type: "string" },
        location:         { type: "string", description: "Local físico ou link Meet/Zoom." },
        event_type:       { type: "string", enum: ["reuniao", "call", "demo", "visita", "outro"] },
      },
      required: ["title", "start_time"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_business_knowledge",
    description: "Busca na base de conhecimento que a Mia aprendeu de conversas reais: padrões de objeção, o que funciona em fechamentos, comportamento de leads/vendedores. Use para responder 'por que estamos perdendo?', 'o que funciona melhor?', 'qual o padrão de conversão?'.",
    parameters: {
      type: "object",
      properties: {
        query:    { type: "string", description: "O que você quer saber (ex: 'objeção de preço', 'padrão de fechamento')." },
        category: { type: "string", enum: ["objection", "winning_pattern", "losing_pattern", "seller_behavior", "lead_behavior", "timing", "channel_insight", "general"], description: "Filtrar por categoria (opcional)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  // ===== FASE 7 — AGENDA =====
  {
    type: "function",
    name: "find_calendar_event",
    description: "Busca um agendamento/reunião por nome do lead, título ou janela temporal. Use ANTES de remarcar/cancelar quando o usuário não passar event_id.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nome do lead, palavra-chave do título ou descrição." },
        when_hint: { type: "string", description: "Dica temporal: 'hoje', 'amanhã', 'quinta', 'esta semana', etc." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_reschedule_booking",
    description: "Prepara remarcar um agendamento existente para nova data/hora. NÃO executa. Risk_level=medium.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        event_query: { type: "string", description: "Se não souber event_id, descreva (ex: 'reunião do Eric quinta')." },
        new_when: { type: "string", description: "ISO 8601 da nova data/hora (ex: 2026-06-26T15:00:00-03:00)." },
        duration_minutes: { type: "number", description: "Duração opcional; senão mantém a original." },
        reason: { type: "string" },
      },
      required: ["new_when"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "draft_cancel_booking",
    description: "Prepara cancelar um agendamento existente. NÃO executa. Risk_level=medium.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        event_query: { type: "string" },
        reason: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Validar role: precisa ser super_admin, admin ou manager
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const allowed = ["super_admin", "admin", "manager"];
    const hasAccess = (roles ?? []).some((r: any) => allowed.includes(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden", message: "Acesso restrito a administradores e gestores." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: miaProfile } = await admin.from("profiles")
      .select("full_name, organization_id").eq("id", userId).maybeSingle();
    const miaOrgId = miaProfile?.organization_id ?? null;
    if (!miaOrgId) {
      return new Response(JSON.stringify({ error: "no_org" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: miaOrgId });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const miaAI = await resolveAIConfig(admin, miaOrgId, "agent_chat", "gpt-realtime-2.1", "mia");
    const openaiKey = miaAI.apiKey;

    // ── Memory & Context Bootstrap (carregado em paralelo para velocidade) ──
    let memoryBlock = "";
    let voiceId = "shimmer";
    let voicePersonality = "natural";
    let micSensitivity = "low";
    try {
      const prof = miaProfile;
      const orgId = miaOrgId;
      const { data: rolesData } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const roleLabel = (rolesData ?? []).map((r: any) => r.role).join(", ") || "admin";

      // Carrega tudo em paralelo
      const [orgRes, memRes, knowledgeRes, insightsRes] = await Promise.all([
        orgId ? admin.from("organizations").select("name").eq("id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId ? admin.from("mia_user_memory").select("display_name, preferences, facts")
          .eq("user_id", userId).eq("organization_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId ? admin.from("mia_business_knowledge")
          .select("category, title, content, occurrences, confidence")
          .eq("organization_id", orgId).eq("is_active", true)
          .order("occurrences", { ascending: false }).limit(12) : Promise.resolve({ data: null }),
        orgId ? admin.from("mia_conversation_insights")
          .select("outcome, objections, what_worked, seller_approach, lead_engagement, processed_at")
          .eq("organization_id", orgId)
          .order("processed_at", { ascending: false }).limit(20) : Promise.resolve({ data: null }),
      ]);

      const orgName   = (orgRes as any).data?.name ?? null;
      const mem       = (memRes as any).data;
      const userName  = mem?.display_name ?? prof?.full_name ?? "Admin";
      const prefs     = mem?.preferences ?? {};
      const allowedVoices = new Set(["alloy", "ash", "ballad", "cedar", "coral", "echo", "marin", "sage", "shimmer", "verse"]);
      const allowedPersonalities = new Set(["natural", "executive", "energetic", "calm"]);
      const allowedSensitivities = new Set(["low", "balanced", "high"]);
      if (allowedVoices.has(String(prefs.mia_voice))) voiceId = String(prefs.mia_voice);
      if (allowedPersonalities.has(String(prefs.mia_personality))) voicePersonality = String(prefs.mia_personality);
      if (allowedSensitivities.has(String(prefs.mia_mic_sensitivity))) micSensitivity = String(prefs.mia_mic_sensitivity);
      const allFacts: any[] = Array.isArray(mem?.facts) ? mem.facts : [];

      // Separa fatos normais de resumos de sessão
      const sessionSummaries = allFacts
        .filter((f: any) => String(f.key).startsWith("resumo_sessao_"))
        .sort((a: any, b: any) => b.key.localeCompare(a.key))
        .slice(0, 3);
      const regularFacts = allFacts.filter((f: any) => !String(f.key).startsWith("resumo_sessao_"));

      // Bloco de identidade e preferências
      const identityLines: string[] = [
        `Você conversa com ${userName} (${roleLabel})${orgName ? ` — empresa: ${orgName}` : ""}.`,
      ];
      if (Object.keys(prefs).length) {
        identityLines.push(`Preferências: ${Object.entries(prefs).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(", ")}.`);
      }
      if (regularFacts.length) {
        identityLines.push(`Fatos que você sabe sobre ele:\n${regularFacts.map((f: any) => `  • ${f.key}: ${f.value}`).join("\n")}`);
      }

      // Resumos das últimas sessões — continuidade entre conversas
      const sessionBlock = sessionSummaries.length
        ? `\n── SUAS SESSÕES ANTERIORES (lembre como se fossem suas memórias) ──\n${
            sessionSummaries.map((s: any) => `• ${s.key.replace("resumo_sessao_", "")}: ${s.value}`).join("\n")
          }`
        : "";

      // Padrões aprendidos de conversas reais
      const knowledge = (knowledgeRes as any).data ?? [];
      const knowledgeBlock = knowledge.length
        ? `\n── CONHECIMENTO EXTRAÍDO DE CONVERSAS REAIS ──\n${
            knowledge.map((k: any) =>
              `• [${k.category}] ${k.title} (${k.occurrences}x) — ${k.content.slice(0, 140)}`
            ).join("\n")
          }\nUse naturalmente — não cite como "aprendi que". Apenas saiba e aplique.`
        : "";

      // Estatísticas das conversas analisadas
      const insights = (insightsRes as any).data ?? [];
      let insightBlock = "";
      if (insights.length >= 5) {
        const converted  = insights.filter((i: any) => i.outcome === "converted").length;
        const lost       = insights.filter((i: any) => i.outcome === "lost").length;
        const convRate   = converted + lost > 0 ? Math.round(converted / (converted + lost) * 100) : null;
        const topObjections: Record<string, number> = {};
        for (const ins of insights) {
          for (const obj of (ins.objections ?? [])) {
            topObjections[obj] = (topObjections[obj] ?? 0) + 1;
          }
        }
        const topObj = Object.entries(topObjections).sort((a,b) => b[1]-a[1]).slice(0,3);
        const topWorks: Record<string, number> = {};
        for (const ins of insights) {
          for (const w of (ins.what_worked ?? [])) {
            topWorks[w] = (topWorks[w] ?? 0) + 1;
          }
        }
        const topW = Object.entries(topWorks).sort((a,b) => b[1]-a[1]).slice(0,2);

        insightBlock = [
          `\n── PADRÕES DAS ÚLTIMAS ${insights.length} CONVERSAS ANALISADAS ──`,
          convRate != null ? `• Taxa de conversão recente: ${convRate}%` : "",
          topObj.length ? `• Objeções mais frequentes: ${topObj.map(([t,c]) => `"${t}" (${c}x)`).join(", ")}` : "",
          topW.length   ? `• O que mais funciona: ${topW.map(([t,c]) => `"${t}" (${c}x)`).join(", ")}` : "",
          "Use para dar recomendações baseadas em evidência, não opinião.",
        ].filter(Boolean).join("\n");
      }

      // Fase 4: eficácia das ações da Mia (fecha o flywheel)
      let efficacyBlock = "";
      if (orgId) {
        try {
          const { data: outcomes } = await admin
            .from("mia_action_outcomes")
            .select("outcome_type")
            .eq("organization_id", orgId)
            .gte("measured_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

          if ((outcomes?.length ?? 0) >= 3) {
            const counts: Record<string, number> = {};
            for (const o of outcomes ?? []) counts[o.outcome_type] = (counts[o.outcome_type] ?? 0) + 1;
            const total    = outcomes!.length;
            const positive = (counts["lead_stage_advanced"] ?? 0) + (counts["lead_responded"] ?? 0) + (counts["task_completed"] ?? 0);
            const noEffect = counts["sem_efeito"] ?? 0;
            const efficacy = Math.round((positive / total) * 100);
            efficacyBlock = [
              "",
              "── EFICÁCIA DAS SUAS AÇÕES (últimos 30 dias) ──",
              `${total} ações medidas · ${efficacy}% geraram resultado positivo.`,
              noEffect > 0 ? `${noEffect} ações sem efeito detectado — evite repeti-las sem ajuste.` : "Todas as ações mediram impacto positivo.",
              "Calibre recomendações com base nisso: priorize o que demonstrou funcionar.",
              "─────────────────────────",
            ].filter(Boolean).join("\n");
          }
        } catch {}
      }

      memoryBlock = [
        "",
        "── MEMÓRIA E CONTEXTO ──",
        ...identityLines,
        "Nunca narre que está 'lembrando' — apenas saiba e use naturalmente.",
        "─────────────────────────",
        sessionBlock,
        knowledgeBlock,
        insightBlock,
        efficacyBlock,
      ].filter(Boolean).join("\n");

    } catch (e) {
      console.warn("[mia-realtime-session] memory bootstrap falhou:", e);
    }

    const personalityInstructions: Record<string, string> = {
      natural: "Fale como uma colega humana, calorosa e espontanea. Varie ritmo e entonacao, demonstre empatia e use humor leve quando couber. Nunca soe robotica.",
      executive: "Fale com confianca executiva, clareza e objetividade. Mantenha energia serena, destaque decisoes e evite rodeios.",
      energetic: "Fale com energia, entusiasmo e expressividade. Varie ritmo e entonacao, celebre resultados sem exagerar e mantenha as respostas ageis.",
      calm: "Fale de forma calma, acolhedora e paciente. Use pausas naturais, tom seguro e explicacoes simples sem perder objetividade.",
    };
    const vadBySensitivity: Record<string, { threshold: number; silence_duration_ms: number }> = {
      low: { threshold: 0.72, silence_duration_ms: 900 },
      balanced: { threshold: 0.62, silence_duration_ms: 800 },
      high: { threshold: 0.52, silence_duration_ms: 700 },
    };
    const vad = vadBySensitivity[micSensitivity] ?? vadBySensitivity.low;
    const voiceSpeed = voicePersonality === "energetic" ? 1.08 : voicePersonality === "calm" ? 0.95 : 1;
    const finalInstructions = `${SYSTEM_PROMPT}\n\nESTILO DE VOZ ESCOLHIDO:\n${personalityInstructions[voicePersonality]}\nUse emocao coerente com o assunto e nunca dramatize alertas.\n${memoryBlock}`;

    const createRealtimeSecret = (model: string) => fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: finalInstructions,
          audio: {
            output: { voice: voiceId, speed: voiceSpeed },
            input: {
              transcription: { model: "gpt-4o-mini-transcribe", language: "pt" },
              noise_reduction: { type: "far_field" },
              turn_detection: {
                type: "server_vad",
                threshold: vad.threshold,
                prefix_padding_ms: 400,
                silence_duration_ms: vad.silence_duration_ms,
                create_response: true,
                interrupt_response: true,
              },
            },
          },
          tools: TOOLS,
          tool_choice: "auto",
        },
      }),
    });

    let realtimeModel = "gpt-realtime-2.1";
    let resp = await createRealtimeSecret(realtimeModel);
    if (!resp.ok && (resp.status === 400 || resp.status === 404)) {
      console.warn("[mia-realtime-session] gpt-realtime-2.1 indisponivel; usando fallback gpt-realtime");
      realtimeModel = "gpt-realtime";
      resp = await createRealtimeSecret(realtimeModel);
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[mia-realtime-session] OpenAI error", resp.status, errText);
      return new Response(JSON.stringify({ error: "openai_error", status: resp.status, detail: errText.slice(0, 800) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await resp.json();
    const value = session.value ?? session.client_secret?.value;
    const expires_at = session.expires_at ?? session.client_secret?.expires_at;
    const sessionId = session.session?.id ?? session.id ?? null;

    return new Response(JSON.stringify({
      client_secret: { value, expires_at },
      model: realtimeModel,
      session_id: sessionId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[mia-realtime-session] unexpected", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
