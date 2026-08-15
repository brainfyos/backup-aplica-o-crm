// Remove vazamentos de tool call que alguns modelos (notadamente Gemini 3
// preview) emitem como texto livre em vez de preencher `tool_calls[]`.
// Padrões vistos em produção:
//   funcall:default_api:add_lead_note{content:...}
//   default_api.apply_tags({...})
//   ```tool_code\nprint(default_api.foo(...))\n```
//   {"name":"add_lead_note","arguments":{...}}
//
// Uso: `const { text, leaked } = sanitizeAgentOutput(raw)`

const PATTERNS: RegExp[] = [
  // funcall:namespace:tool_name{...} (com chaves balanceadas simples)
  /funcall\s*:\s*[a-z_][\w.]*\s*:\s*[a-z_][\w]*\s*\{[\s\S]*?\}/gi,
  // default_api.tool_name(...) ou default_api:tool_name{...}
  /default_api\s*[.:]\s*[a-z_][\w]*\s*[({][\s\S]*?[)}]/gi,
  // Blocos ```tool_code ... ``` ou ```tool ... ```
  /```tool(?:_code)?[\s\S]*?```/gi,
  // print(default_api.xxx(...))
  /print\s*\(\s*default_api[\s\S]*?\)\s*\)?/gi,
  // JSON solto tipo {"name":"tool_x","arguments":{...}}
  /\{\s*"name"\s*:\s*"[a-z_][\w]*"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/gi,
  // ReAct JSON tipo {"action":"tool_x","action_input":"..."} — Gemini
  // preview às vezes emite isso em vez de preencher tool_calls[]. Aceita
  // action_input como string escapada OU objeto (com um nível de aninhamento).
  /\{\s*"action"\s*:\s*"[a-z_][\w]*"\s*,\s*"action_input"\s*:\s*(?:"(?:[^"\\]|\\.)*"|\{(?:[^{}]|\{[^{}]*\})*\})\s*\}/gi,
  // Blocos <tool_call>...</tool_call> ou <function_call>...</function_call>
  /<\s*(?:tool_call|function_call)\s*>[\s\S]*?<\/\s*(?:tool_call|function_call)\s*>/gi,
  // ReAct clássico "Action: nome\nAction Input: {...}"
  /(?:^|\n)\s*Action\s*:\s*[a-z_][\w]*\s*\n\s*Action\s+Input\s*:\s*\{[\s\S]*?\}/gi,
  // Fallback tolerante: ReAct malformado / com aspas desbalanceadas —
  // pega tudo do `{ "action": "..."` até a próxima `}` seguida por
  // texto natural (espaço + letra minúscula) ou fim/quebra dupla.
  // Cobre o caso do lead Tiago (23/07) onde o JSON estava quebrado.
  /\{\s*"action"\s*:\s*"[a-z_][\w]*"[\s\S]*?\}(?=\s+[a-zçãõáéíóúâêôA-Z]|\s*$|\n\n)/gi,
];

export interface SanitizeResult {
  text: string;
  leaked: boolean;
  removed: string[];
  degenerate: boolean;
  degenerateReason?: string;
}

/**
 * Detecta saídas patológicas onde o modelo entrou em loop de token
 * (ex: "aminaseaminaseaminase..." 800x, JSON quebrado, mesma palavra colada).
 * Retorna motivo curto para log/audit, ou null se o texto parece saudável.
 */
export function detectDegenerateRepetition(input: string | null | undefined): string | null {
  const text = String(input ?? '').trim();
  if (!text || text.length < 200) return null; // textos curtos não avaliam

  // 1) Nenhum espaço nos primeiros 400 chars e texto > 400: colado suspeito.
  const head = text.slice(0, 400);
  if (text.length > 400 && !/\s/.test(head)) {
    return 'no_whitespace_in_head';
  }

  // 2) Poucas palavras únicas em texto longo.
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  if (text.length > 300 && uniqueWords.size < 5) {
    return `low_unique_words:${uniqueWords.size}`;
  }

  // 3) Diversidade de caracteres muito baixa.
  const uniqueChars = new Set(text.toLowerCase()).size;
  const ratio = uniqueChars / text.length;
  if (ratio < 0.02) {
    return `low_char_diversity:${ratio.toFixed(3)}`;
  }

  // 4) Substring curta (3-12 chars) que ocupa a maior parte do texto.
  //    Amostra em 3 tamanhos para pegar loops de token de tamanhos diferentes.
  for (const size of [3, 5, 7, 9, 12]) {
    if (text.length < size * 20) continue;
    const chunk = text.slice(0, size);
    // conta ocorrências não-sobrepostas
    let count = 0;
    let idx = 0;
    while ((idx = text.indexOf(chunk, idx)) !== -1) {
      count++;
      idx += size;
      if (count * size > text.length * 0.6) {
        return `repeating_substring:${JSON.stringify(chunk)}x${count}`;
      }
    }
  }

  return null;
}

export function sanitizeAgentOutput(input: string | null | undefined): SanitizeResult {
  const original = String(input ?? '');
  if (!original) return { text: '', leaked: false, removed: [], degenerate: false };


  let text = original;
  const removed: string[] = [];

  for (const re of PATTERNS) {
    text = text.replace(re, (match) => {
      removed.push(match.slice(0, 200));
      return '';
    });
  }

  // Limpa quebras de linha órfãs / espaços duplicados criados pela remoção.
  text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const degenerateReason = detectDegenerateRepetition(text);
  return {
    text,
    leaked: removed.length > 0,
    removed,
    degenerate: !!degenerateReason,
    degenerateReason: degenerateReason ?? undefined,
  };

}

export interface LeakedCall {
  name: string;
  args: Record<string, unknown>;
  raw: string;
}

// Tenta extrair pares {tool,args} dos vazamentos ReAct/JSON.
// Usado pelo webchat-bot para, quando possível, executar a intenção do modelo
// (ex: notify_team) mesmo tendo caído no formato textual.
export function extractLeakedToolCalls(input: string | null | undefined): LeakedCall[] {
  const txt = String(input ?? '');
  if (!txt) return [];
  const out: LeakedCall[] = [];

  const react = /\{\s*"action"\s*:\s*"([a-z_][\w]*)"\s*,\s*"action_input"\s*:\s*("(?:[^"\\]|\\.)*"|\{(?:[^{}]|\{[^{}]*\})*\})\s*\}/gi;
  let m: RegExpExecArray | null;
  while ((m = react.exec(txt)) !== null) {
    const name = m[1];
    let args: Record<string, unknown> = {};
    try {
      const first = JSON.parse(m[2]);
      args = typeof first === 'string' ? (JSON.parse(first) as Record<string, unknown>) : (first as Record<string, unknown>);
    } catch { /* JSON quebrado — args ficam vazios */ }
    out.push({ name, args, raw: m[0].slice(0, 500) });
  }

  const oai = /\{\s*"name"\s*:\s*"([a-z_][\w]*)"\s*,\s*"arguments"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})\s*\}/gi;
  while ((m = oai.exec(txt)) !== null) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(m[2]); } catch { /* ignore */ }
    out.push({ name: m[1], args, raw: m[0].slice(0, 500) });
  }

  return out;
}

