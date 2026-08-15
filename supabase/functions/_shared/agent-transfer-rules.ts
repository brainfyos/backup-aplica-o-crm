// ─────────────────────────────────────────────────────────────────────────────
// Regras de transferência entre agentes (aba Regras → "Transferência entre agentes")
// Armazenadas em product_agents.tool_configs.transfer_rules (JSONB já existente).
// Nenhuma migration: agente sem regras = comportamento atual, intacto.
// ─────────────────────────────────────────────────────────────────────────────

export interface TransferRule {
  id: string;
  name: string;
  keywords: string[];
  target_agent_id: string | null;
  active?: boolean;
  /** Overrides opcionais — vazio = herda o padrão do agente */
  farewell?: string;
  greeting?: string;
  delay_seconds?: number | null;
  message_delay_seconds?: number | null;
  include_summary?: boolean | null;
}

export function normalizeRuleText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê e sanitiza as regras ativas de um agente. */
export function getTransferRules(agent: any): TransferRule[] {
  const raw = agent?.tool_configs?.transfer_rules;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r: any) => r && typeof r === 'object')
    .map((r: any) => ({
      id: String(r.id ?? crypto.randomUUID()),
      name: String(r.name ?? '').trim(),
      keywords: Array.isArray(r.keywords)
        ? r.keywords.map((k: any) => String(k)).filter((k: string) => k.trim())
        : [],
      target_agent_id: r.target_agent_id ?? null,
      active: r.active !== false,
      farewell: typeof r.farewell === 'string' ? r.farewell : undefined,
      greeting: typeof r.greeting === 'string' ? r.greeting : undefined,
      delay_seconds: typeof r.delay_seconds === 'number' ? r.delay_seconds : null,
      message_delay_seconds:
        typeof r.message_delay_seconds === 'number' ? r.message_delay_seconds : null,
      include_summary: typeof r.include_summary === 'boolean' ? r.include_summary : null,
    }))
    .filter((r: TransferRule) => r.active && !!r.target_agent_id);
}

/** Match determinístico por palavra-chave na mensagem do lead. */
export function matchTransferRule(
  message: string,
  rules: TransferRule[],
): { rule: TransferRule; term: string } | null {
  const text = normalizeRuleText(message);
  if (!text) return null;
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      const term = normalizeRuleText(kw);
      if (!term) continue;
      // termos de 1 palavra curta exigem limite de palavra p/ evitar falso positivo
      const isShortSingleWord = term.length <= 4 && !term.includes(' ');
      const hit = isShortSingleWord
        ? new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|[.,!?])`).test(text)
        : text.includes(term);
      if (hit) return { rule, term: kw };
    }
  }
  return null;
}

/** Bloco rígido de prompt com as únicas transferências permitidas. */
export function buildTransferRulesPrompt(
  rules: TransferRule[],
  agentNameById: Record<string, string>,
): string {
  if (!rules.length) return '';
  const lines = rules
    .map((r, i) => {
      const name = agentNameById[r.target_agent_id!] || 'agente';
      const when = r.keywords.length ? r.keywords.join(', ') : r.name;
      return `${i + 1}. ${r.name || name} → transferir para "${name}" (agent_id: ${r.target_agent_id})\n   Quando: ${when}`;
    })
    .join('\n');

  return `

🔀 REGRAS DE TRANSFERÊNCIA (obrigatórias e exclusivas):
${lines}

- Estas são as ÚNICAS transferências permitidas. Ao bater a condição, chame a tool transfer_to_agent com o agent_id EXATO indicado acima.
- NUNCA invente destino, NUNCA transfira para agente fora desta lista e NUNCA anuncie uma transferência que não está nela.
- Se nenhuma condição bater, siga o atendimento normalmente sem transferir.`;
}
