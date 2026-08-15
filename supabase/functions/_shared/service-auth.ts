const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Defense in depth for cron/worker functions that must never accept user JWTs. */
export function isServiceRoleRequest(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const authHeader = req.headers.get('Authorization')?.trim();
  if (!serviceKey || !authHeader?.startsWith('Bearer ')) return false;
  return authHeader.slice('Bearer '.length).trim() === serviceKey;
}

export function serviceRoleUnauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'service_role_required' }), {
    status: 403,
    headers: { ...corsHeaders, ...JSON_HEADERS },
  });
}
