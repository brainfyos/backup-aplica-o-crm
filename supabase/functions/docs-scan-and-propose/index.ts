// Varredura FACTUAL de documentação: compara sinais reais do sistema
// (rotas, menus, tabelas, releases) vs páginas de doc existentes.
// A IA SÓ classifica e redige usando nomes que aparecem nos sinais — proibido inventar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: userData } = await supa.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: 'unauthorized' }, 401);

    const { data: isAdmin } = await supa.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
    if (!isAdmin) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const clientSignals = body?.signals ?? {};
    const routes: string[] = Array.isArray(clientSignals.routes) ? clientSignals.routes : [];
    const adminMenu: Array<{ id: string; label: string; group?: string }> =
      Array.isArray(clientSignals.admin_menu) ? clientSignals.admin_menu : [];
    const superAdminMenu: Array<{ id: string; label: string }> =
      Array.isArray(clientSignals.super_admin_menu) ? clientSignals.super_admin_menu : [];

    // Releases recentes (factual)
    const { data: releases } = await supa
      .from('platform_releases')
      .select('version,title,summary,release_types,created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    // Documentação atual
    const { data: tracks } = await supa.from('docs_tracks').select('id, slug, label');
    const { data: pages } = await supa
      .from('docs_pages')
      .select('id, slug, title, description, track_id, content_html')
      .order('display_order');

    const trackById = new Map((tracks || []).map((t: any) => [t.id, t]));
    const docs = (pages || []).map((p: any) => ({
      track_slug: trackById.get(p.track_id)?.slug,
      page_slug: p.slug,
      title: p.title,
      description: p.description,
      has_content: !!(p.content_html && p.content_html.trim().length > 50),
    }));

    // Limpa pendentes antigas pra começar limpo
    await supa.from('docs_change_proposals').delete().eq('status', 'pending');

    const system = `Você é um auditor de documentação. Sua tarefa é COMPARAR fatos do sistema com a documentação existente e identificar lacunas reais.

REGRAS DURAS — VIOLAR = REJEITADO:
1. Use APENAS nomes, rotas e labels que aparecem nos SINAIS fornecidos. Proibido inventar nome de funcionalidade, campo, botão ou fluxo.
2. NÃO traduza nem "melhore" labels — mantenha o texto exato do menu/rota.
3. Se não há evidência factual nos sinais, NÃO crie sugestão sobre o tema.
4. Cada sugestão deve citar o sinal-fonte exato (ex: rota "/leads/transferencias", menu "Cadências Inteligentes").
5. content_html deve ser CURTO (1 parágrafo + 1 lista no máximo), em linguagem simples, descrevendo apenas o que o nome do menu/rota indica — sem inventar funcionalidades.

CLASSIFICAÇÃO (kind):
- "gap": menu/rota existe nos sinais MAS não tem página de doc correspondente.
- "rename": página de doc parece falar de algo que mudou de nome no menu (slug similar, label diferente).
- "stale": página de doc existe mas o tema não aparece em nenhum sinal (provável que removeu do sistema).

Responda APENAS em JSON.`;

    const userPrompt = `SINAIS DO SISTEMA (fonte da verdade):

Rotas reais (${routes.length}):
${JSON.stringify(routes)}

Menu Admin (${adminMenu.length} itens):
${JSON.stringify(adminMenu)}

Menu Super Admin (${superAdminMenu.length} itens):
${JSON.stringify(superAdminMenu)}

Releases recentes:
${JSON.stringify(releases || [])}

DOCUMENTAÇÃO ATUAL (${docs.length} páginas):
${JSON.stringify(docs)}

Identifique até 8 lacunas REAIS. Para cada uma:
{
  "kind": "gap" | "rename" | "stale",
  "track_slug": "vendedor" | "admin" | "super-admin" | "desenvolvedor" | "conceitos",
  "page_slug": "slug-existente-ou-novo",
  "is_new_page": boolean,
  "title": "Título igual ao label do menu/rota — sem inventar",
  "description": "1 linha explicando o que o usuário encontra ali",
  "content_html": "<p>Texto curto e simples.</p><ul><li>...</li></ul>",
  "source": "menu:campaigns" ou "route:/leads/transferencias" ou "release:v1.2",
  "reason": "1 linha explicando por que é gap/rename/stale (cite o sinal)"
}

Formato: { "suggestions": [...] }

Se NADA mudou, retorne { "suggestions": [] }.`;

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return json({ proposals_created: 0, note: 'LOVABLE_API_KEY not configured' });
    }

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('AI error', resp.status, txt);
      return json({ error: 'AI call failed', status: resp.status, detail: txt.slice(0, 300) }, 500);
    }

    const aiJson = await resp.json();
    const content = aiJson.choices?.[0]?.message?.content || '{}';
    let parsed: any = { suggestions: [] };
    try { parsed = JSON.parse(content); } catch { parsed = { suggestions: [] }; }

    const suggestions: any[] = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 10) : [];
    if (suggestions.length === 0) return json({ proposals_created: 0 });

    // Whitelist factual: para `gap`/`rename`, o source DEVE existir nos sinais.
    const knownSources = new Set<string>();
    routes.forEach(r => knownSources.add(`route:${r}`));
    adminMenu.forEach(m => knownSources.add(`menu:${m.id}`));
    superAdminMenu.forEach(m => knownSources.add(`menu:${m.id}`));
    (releases || []).forEach((r: any) => r.version && knownSources.add(`release:${r.version}`));

    let created = 0;
    for (const s of suggestions) {
      try {
        const trackSlug = String(s.track_slug || '').trim();
        const pageSlug = String(s.page_slug || '').trim();
        const kind = String(s.kind || 'gap').trim();
        const source = String(s.source || '').trim();
        if (!trackSlug || !pageSlug) continue;

        // Para gap/rename exige source verificável; para stale a "fonte" é o page_slug existente
        if (kind !== 'stale' && source && !knownSources.has(source)) {
          console.log('rejected: unknown source', source);
          continue;
        }

        let pageId: string | null = null;
        if (!s.is_new_page) {
          const tr = (tracks || []).find((t: any) => t.slug === trackSlug);
          if (tr) {
            const pg = (pages || []).find((p: any) => p.track_id === tr.id && p.slug === pageSlug);
            pageId = pg?.id ?? null;
          }
        }

        const { error } = await supa.from('docs_change_proposals').insert({
          page_id: pageId,
          track_slug: trackSlug,
          page_slug: pageSlug,
          proposed_title: s.title || null,
          proposed_description: s.description || null,
          proposed_content_html: s.content_html || null,
          source_signal: { kind, source, reason: s.reason },
        });
        if (!error) created++;
      } catch (e) { console.error('save proposal', e); }
    }

    return json({ proposals_created: created, signals_received: { routes: routes.length, admin_menu: adminMenu.length, super_admin_menu: superAdminMenu.length } });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
