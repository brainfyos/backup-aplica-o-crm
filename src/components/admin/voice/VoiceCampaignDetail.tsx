import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit3, Users, PhoneCall, Activity, Settings, Loader2, Phone } from 'lucide-react';
import {
  useVoiceCampaign, useCampaignTargets, useAddCampaignTargets,
  useVoiceAgents, useVoiceCampaignJourney, type VoiceCampaign,
} from '@/hooks/useVoice';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  campaignId: string;
  onBack: () => void;
  onEdit: (c: VoiceCampaign) => void;
}

const STAGE_COLORS: Record<string, string> = {
  enrolled: 'bg-muted',
  dialing: 'bg-blue-500/15 text-blue-700',
  talked: 'bg-indigo-500/15 text-indigo-700',
  chose_meeting: 'bg-green-500/15 text-green-700',
  chose_whatsapp: 'bg-emerald-500/15 text-emerald-700',
  chose_checkout: 'bg-purple-500/15 text-purple-700',
  lost: 'bg-destructive/15 text-destructive',
  no_answer: 'bg-amber-500/15 text-amber-700',
};

export function VoiceCampaignDetail({ campaignId, onBack, onEdit }: Props) {
  const { profile } = useAuth();
  const { data: campaign, isLoading } = useVoiceCampaign(campaignId);
  const { data: agents = [] } = useVoiceAgents();
  const { data: targets = [] } = useCampaignTargets(campaignId);
  const { data: journeys = [] } = useVoiceCampaignJourney(campaignId);
  const add = useAddCampaignTargets();
  const [loadingAdd, setLoadingAdd] = useState(false);

  const kpis = useMemo(() => {
    const total = targets.length;
    const called = targets.filter((t) => ['calling', 'completed', 'failed'].includes(t.status)).length;
    const meetings = journeys.filter((j) => j.stage === 'chose_meeting').length;
    const checkouts = journeys.filter((j) => j.stage === 'chose_checkout').length;
    const lost = journeys.filter((j) => j.stage === 'lost').length;
    return { total, called, meetings, checkouts, lost };
  }, [targets, journeys]);

  const agentName = agents.find((a) => a.id === campaign?.voice_agent_id)?.name || '—';

  const addLeads = async (mode: 'all_with_phone' | 'new_only') => {
    if (!profile?.organization_id) return;
    setLoadingAdd(true);
    try {
      let q: any = supabase
        .from('leads').select('id, phone')
        .eq('organization_id', profile.organization_id)
        .not('phone', 'is', null).neq('phone', '')
        .limit(500);
      if (mode === 'new_only') q = q.eq('stage', 'new');
      const { data } = await q;
      const existing = new Set(targets.map((t) => t.lead_id));
      const fresh = (data || []).filter((l: any) => !existing.has(l.id));
      if (!fresh.length) { toast.info('Nenhum lead novo encontrado'); return; }
      add.mutate({ campaign_id: campaignId, leads: fresh });
    } finally { setLoadingAdd(false); }
  };

  if (isLoading || !campaign) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-xl font-semibold">{campaign.name}</h2>
            <p className="text-xs text-muted-foreground">Perfil: {agentName} · {campaign.status}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => onEdit(campaign)}><Edit3 className="h-4 w-4 mr-1" /> Editar</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPI label="Alvos" value={kpis.total} />
        <KPI label="Discados" value={kpis.called} />
        <KPI label="Agendou" value={kpis.meetings} tone="success" />
        <KPI label="Checkout" value={kpis.checkouts} tone="success" />
        <KPI label="Perdidos" value={kpis.lost} tone="destructive" />
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads"><Users className="h-3.5 w-3.5 mr-1" /> Leads</TabsTrigger>
          <TabsTrigger value="timeline"><Activity className="h-3.5 w-3.5 mr-1" /> Timeline</TabsTrigger>
          <TabsTrigger value="calls"><PhoneCall className="h-3.5 w-3.5 mr-1" /> Ligações</TabsTrigger>
          <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1" /> Config</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => addLeads('new_only')} disabled={loadingAdd}>
              <Phone className="mr-1 h-3.5 w-3.5" /> Leads novos com telefone
            </Button>
            <Button size="sm" variant="outline" onClick={() => addLeads('all_with_phone')} disabled={loadingAdd}>
              <Users className="mr-1 h-3.5 w-3.5" /> Todos com telefone
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Telefone</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Tentativas</th>
                  <th className="text-left p-2">Última tentativa</th>
                </tr>
              </thead>
              <tbody>
                {targets.slice(0, 200).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-2 font-mono">{t.phone}</td>
                    <td className="p-2"><Badge variant="outline">{t.status}</Badge></td>
                    <td className="p-2">{t.attempts}</td>
                    <td className="p-2">{t.last_attempt_at ? new Date(t.last_attempt_at).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
                {targets.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhum lead ainda.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <div className="space-y-2">
            {journeys.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Nenhum evento ainda.</Card>
            ) : journeys.map((j) => (
              <Card key={j.id} className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={STAGE_COLORS[j.stage] || 'bg-muted'}>{j.stage}</Badge>
                    {j.chosen_channel && <span className="text-xs text-muted-foreground">via {j.chosen_channel}</span>}
                  </div>
                  {j.notes && <p className="text-xs mt-1 text-muted-foreground">{j.notes}</p>}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(j.created_at).toLocaleString('pt-BR')}
                </span>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calls">
          <Card className="p-4 text-sm text-muted-foreground">
            Consulte o Histórico de Ligações para ver a lista completa filtrada por esta campanha.
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card className="p-4 space-y-2 text-sm">
            <div><b>Números origem:</b> {(campaign.dial_numbers || []).join(', ') || '—'}</div>
            <div><b>Estratégia:</b> {campaign.dial_strategy}</div>
            <div><b>Horário comercial:</b> {campaign.business_hours_only ? 'Sim' : 'Não'} · {campaign.timezone}</div>
            <div><b>Agendado:</b> {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString('pt-BR') : '—'}</div>
            <div><b>Simultâneas:</b> {campaign.max_concurrent} · <b>Tentativas:</b> {campaign.max_attempts} · <b>Retry:</b> {campaign.retry_interval_minutes} min</div>
            <div><b>Regras pós-call:</b> {campaign.post_call_actions?.rules?.length || 0}</div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'destructive' }) {
  const cls = tone === 'success' ? 'text-green-600' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </Card>
  );
}
