// meta-template-builder
// Helpers para montar o payload `components` da Meta Cloud API a partir
// de um template salvo + variable_mapping. Suporta preenchimento via IA.

import { aiChat } from './ai-call.ts';

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: any[];
  example?: any;
}

export interface VariableMapping {
  // ex: { "1": { source: "lead.name" }, "2": { source: "ai_fill", hint: "objetivo" } }
  [varNumber: string]: { source: string; hint?: string; static_value?: string };
}

function detectVarsInText(t: string): number[] {
  const re = /\{\{(\d+)\}\}/g;
  const set = new Set<number>();
  let m;
  while ((m = re.exec(t || '')) !== null) set.add(parseInt(m[1], 10));
  return Array.from(set).sort((a, b) => a - b);
}

function getByPath(obj: any, path: string): string {
  if (!obj) return '';
  const parts = path.split('.');
  let v: any = obj;
  for (const p of parts) {
    if (v == null) return '';
    v = v[p];
  }
  if (v == null) return '';
  return String(v);
}

async function aiFillVariables(args: {
  sb: any;
  organizationId: string;
  templateBody: string;
  vars: Array<{ num: number; hint?: string }>;
  lead: any;
  context?: string;
}): Promise<Record<string, string>> {
  const { sb, organizationId, templateBody, vars, lead, context } = args;
  if (!vars.length) return {};

  const sys = `Você preenche variáveis de templates HSM da Meta (WhatsApp Cloud).
Regras:
- Retorne APENAS JSON { "1": "valor", "2": "valor" }
- Use as informações do lead disponíveis
- Cada valor: máximo 60 caracteres, sem quebras de linha, sem emojis, sem variáveis literais
- Se não houver dado, gere algo neutro e seguro
- Nunca inclua claims promocionais agressivos`;

  const varList = vars.map((v) => `{{${v.num}}}${v.hint ? ` — ${v.hint}` : ''}`).join('\n');
  const usr = `Template body:\n"""${templateBody}"""

Variáveis a preencher:
${varList}

Lead:
- Nome: ${lead?.name ?? '—'}
- Email: ${lead?.email ?? '—'}
- Telefone: ${lead?.phone ?? '—'}
- Temperatura: ${lead?.temperature ?? '—'}

${context ? `Contexto adicional:\n${context}` : ''}

Retorne só o JSON.`;

  try {
    const { response } = await aiChat({
      supabase: sb,
      organizationId,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'meta-template-vars',
      body: {
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      },
    });
    if (!response.ok) return {};
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? '{}';
    const cleaned = String(raw).replace(/^```json\s*|\s*```$/g, '').trim();
    const obj = JSON.parse(cleaned);
    const out: Record<string, string> = {};
    for (const k of Object.keys(obj)) {
      const val = String(obj[k] ?? '').replace(/\n/g, ' ').slice(0, 60);
      out[String(k)] = val;
    }
    return out;
  } catch (e) {
    console.error('[meta-template-builder] AI fill error', e);
    return {};
  }
}

export async function resolveVariableValues(args: {
  sb: any;
  organizationId: string;
  components: TemplateComponent[];
  mapping: VariableMapping;
  lead: any;
  context?: string;
}): Promise<Record<string, string>> {
  const { sb, organizationId, components, mapping, lead, context } = args;
  const body = components.find((c) => c.type === 'BODY')?.text ?? '';
  const header = components.find((c) => c.type === 'HEADER')?.text ?? '';

  // todas as variáveis (body + header), únicas
  const allVars = Array.from(new Set([...detectVarsInText(body), ...detectVarsInText(header)])).sort((a, b) => a - b);
  if (!allVars.length) return {};

  const out: Record<string, string> = {};
  const needAI: Array<{ num: number; hint?: string }> = [];

  for (const n of allVars) {
    const map = mapping?.[String(n)];
    if (!map || map.source === 'ai_fill') {
      needAI.push({ num: n, hint: map?.hint });
      continue;
    }
    if (map.source === 'static') {
      out[String(n)] = String(map.static_value ?? '').slice(0, 60);
    } else {
      // ex: "lead.name", "lead.email", "lead.metadata.custom_fields.empresa"
      const val = getByPath({ lead }, map.source);
      out[String(n)] = (val || '').slice(0, 60);
    }
  }

  if (needAI.length) {
    const filled = await aiFillVariables({ sb, organizationId, templateBody: body, vars: needAI, lead, context });
    for (const v of needAI) {
      out[String(v.num)] = filled[String(v.num)] || lead?.name || 'cliente';
    }
  }

  // header_media: a fonte de verdade é o próprio template (header_media_id +
  // header_media_url), populado quando o usuário sobe o vídeo/imagem na edição.
  // O `mapping.header_media` segue como override pontual (campanha/chat).
  // Nunca usamos `example.header_handle` — ele é só sample de revisão da Meta
  // e quebra com 131053 (403) ao tentar baixar.
  const headerComp = components.find((c) => c.type === 'HEADER');
  if (headerComp && headerComp.format && headerComp.format !== 'TEXT') {
    const tpl = (mapping as any)?.__template ?? null;
    const hm = (mapping as any)?.header_media;
    let mediaId = '';
    let link = '';

    if (hm && typeof hm === 'object') {
      if (hm.media_id) mediaId = String(hm.media_id);
      else if (hm.id) mediaId = String(hm.id);
      else if (hm.source === 'static') link = String(hm.static_value ?? hm.value ?? '');
      else if (hm.link) link = String(hm.link);
    } else if (typeof hm === 'string') {
      link = hm;
    }

    if (!mediaId && !link && tpl) {
      if (tpl.header_media_id) mediaId = String(tpl.header_media_id);
      else if (tpl.header_media_url) link = String(tpl.header_media_url);
    }

    if (mediaId) out['header_media_id'] = mediaId;
    if (link) out['header_media'] = link;
  }

  return out;
}

/** Constrói o array `components` no formato exigido pela Meta `/messages`. */
export function buildSendComponents(args: {
  components: TemplateComponent[];
  values: Record<string, string>;
}): any[] {
  const { components, values } = args;
  const out: any[] = [];

  for (const c of components || []) {
    if (c.type === 'HEADER') {
      const fmt = (c.format ?? 'TEXT').toUpperCase();
      if (fmt === 'TEXT') {
        const vars = detectVarsInText(c.text ?? '');
        if (vars.length) {
          out.push({
            type: 'header',
            parameters: vars.map((n) => ({ type: 'text', text: values[String(n)] ?? '' })),
          });
        }
      } else if (fmt === 'IMAGE' || fmt === 'VIDEO' || fmt === 'DOCUMENT') {
        const mediaId = values['header_media_id'];
        const link = values['header_media'];
        const mediaKey = fmt.toLowerCase(); // image | video | document
        let mediaObj: any | null = null;
        if (mediaId) mediaObj = { id: mediaId };
        else if (link) mediaObj = { link };
        if (mediaObj) {
          if (fmt === 'DOCUMENT') mediaObj.filename = mediaObj.filename ?? 'document.pdf';
          out.push({
            type: 'header',
            parameters: [{ type: mediaKey, [mediaKey]: mediaObj }],
          });
        } else {
          throw new Error('MISSING_HEADER_MEDIA');
        }
      }
    } else if (c.type === 'BODY') {
      const vars = detectVarsInText(c.text ?? '');
      if (vars.length) {
        out.push({
          type: 'body',
          parameters: vars.map((n) => ({ type: 'text', text: values[String(n)] ?? '' })),
        });
      }
    } else if (c.type === 'BUTTONS') {
      // Quick reply / URL buttons normalmente não levam parâmetros, exceto URL dinâmica
      // (não suportamos URL dinâmica aqui na v1).
    }
  }
  return out;
}

/** Renderiza o body do template substituindo {{n}} pelos values — usado para gravar a mensagem no inbox. */
export function renderTemplatePreview(components: TemplateComponent[], values: Record<string, string>): string {
  const body = components.find((c) => c.type === 'BODY')?.text ?? '';
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[String(n)] ?? `{{${n}}}`);
}
