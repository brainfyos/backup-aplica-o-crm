// Radar IA — cron: executa agendamentos ativos
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: schedules } = await supabase
      .from('opportunity_scan_schedules')
      .select('*')
      .eq('is_active', true);

    let triggered = 0;
    const now = new Date();
    for (const sch of schedules || []) {
      if (!shouldRunNow(sch.cron_expression, sch.last_run_at, now)) continue;

      const projectUrl = Deno.env.get('SUPABASE_URL')!;
      const res = await fetch(`${projectUrl}/functions/v1/opportunity-scan-run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        },
        body: JSON.stringify({
          organization_id: sch.organization_id,
          filters: sch.filters,
          actions_config: sch.actions_config,
          trigger_type: 'scheduled',
          schedule_id: sch.id,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        await supabase.from('opportunity_scan_schedules').update({
          last_run_at: now.toISOString(),
          last_scan_id: json.scan_id,
        }).eq('id', sch.id);
        triggered++;
      }
    }

    return new Response(JSON.stringify({ triggered, total: schedules?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Simplified cron check: supports "daily HH:MM" via JSON-like "0 8 * * *"
function shouldRunNow(cron: string, lastRunAt: string | null, now: Date): boolean {
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return false;
    const [min, hour] = parts;
    const nowMin = now.getUTCMinutes();
    const nowHour = now.getUTCHours();

    // Compatível com listas tipo "8,14"
    const matchHour = hour === '*' || hour.split(',').map(Number).includes(nowHour);
    const matchMin = min === '*' || Math.abs(nowMin - Number(min)) <= 5;
    if (!matchHour || !matchMin) return false;

    if (lastRunAt) {
      const diffH = (now.getTime() - new Date(lastRunAt).getTime()) / 3600000;
      if (diffH < 0.5) return false;
    }
    return true;
  } catch {
    return false;
  }
}
