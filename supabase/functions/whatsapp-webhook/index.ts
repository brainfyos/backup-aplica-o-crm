// Webhook legado de WhatsApp (BotConversa/IsiChat) — DESATIVADO.
// Hoje a plataforma usa apenas Evolution Go via supabase/functions/evolution-webhook.

import { corsHeaders } from 'npm:@supabase/supabase-js/cors';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Este endpoint legado foi descontinuado. Configure os webhooks no Evolution Go (evolution-webhook).',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
