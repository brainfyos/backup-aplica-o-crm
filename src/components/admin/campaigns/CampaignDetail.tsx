import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Pause, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCampaignTargets } from '@/hooks/useCampaigns';
import { AICampaignAssistant } from './AICampaignAssistant';
import { formatBRPhone } from '@/lib/utils';

type LeadInfo = { name: string | null; phone: string | null };
type MsgInfo = { delivery_status: string | null; error: string | null };

const REASON_DICT: Record<string, string> = {
  bot_loop_detected: 'Outro bot detectado — IA pausada',
  whatsapp_opt_out: 'Lead optou por não receber',
  OPTED_OUT: 'Lead optou por não receber',
  BOT_LOOP_DETECTED: 'Outro bot detectado — IA pausada',
  OUT_OF_WINDOW_NEEDS_TEMPLATE: 'Fora da janela de 24h — exige template HSM',
  invalid_phone: 'Telefone inválido (não normaliza para DDI+DDD+9 dígitos)',
  'No phone': 'Lead sem telefone',
  'Conversation in human_active': 'Conversa em atendimento humano',
  'Conversation in waiting_human': 'Conversa aguardando humano',
  '131026': 'Número não está no WhatsApp ou não pode receber mensagens',
  '131047': 'Janela de 24h fechada — exige template HSM',
  '131051': 'Tipo de mensagem não suportado pelo destinatário',
  '132012': 'Erro de template (variáveis/header inválidos)',
  '470': 'Janela de 24h fechada',
  '63016': 'Mensagem fora da janela de 24h',
};

function friendlyReason(raw?: string | null): string | null {
  if (!raw) return null;
  // tenta achar código numérico embutido (ex.: "131026 (#131026) ...")
  const codeMatch = raw.match(/\b(\d{3,6})\b/);
  if (codeMatch && REASON_DICT[codeMatch[1]]) return REASON_DICT[codeMatch[1]];
  return REASON_DICT[raw] ?? raw;
}

function deliveryLabel(s?: string | null): { label: string; tone: 'ok' | 'warn' | 'err' | 'muted' } | null {
  if (!s) return null;
  switch (s) {
    case 'sent': return { label: 'Enviada', tone: 'muted' };
    case 'delivered': return { label: 'Entregue', tone: 'ok' };
    case 'read': return { label: 'Lida', tone: 'ok' };
    case 'failed':
    case 'undelivered':
      return { label: 'Falha na entrega', tone: 'err' };
    default: return { label: s, tone: 'muted' };
  }
}

export function CampaignDetail({
  campaignId,
  onBack,
  onEdit,
}: {
  campaignId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [campaign, setCampaign] = useState<any>(null);
  const { counts, targets } = useCampaignTargets(campaignId);
  const [leads, setLeads] = useState<Record<string, LeadInfo>>({});
  const [convMsgs, setConvMsgs] = useState<Record<string, MsgInfo>>({});

  useEffect(() => {
    supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle()
      .then(({ data }) => setCampaign(data));
  }, [campaignId, counts]);

  // Hidrata leads e última mensagem por conversa
  useEffect(() => {
    const leadIds = Array.from(new Set(targets.map((t) => t.lead_id).filter(Boolean)));
    const convIds = Array.from(new Set(targets.map((t) => t.conversation_id).filter(Boolean)));
    if (leadIds.length) {
      supabase.from('leads').select('id, name, phone').in('id', leadIds).then(({ data }) => {
        const map: Record<string, LeadInfo> = {};
        (data ?? []).forEach((l: any) => { map[l.id] = { name: l.name, phone: l.phone }; });
        setLeads(map);
      });
    }
    if (convIds.length) {
      supabase
        .from('webchat_messages')
        .select('conversation_id, delivery_status, metadata, created_at')
        .in('conversation_id', convIds)
        .in('direction', ['outbound'])
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          const map: Record<string, MsgInfo> = {};
          (data ?? []).forEach((m: any) => {
            if (!map[m.conversation_id]) {
              map[m.conversation_id] = {
                delivery_status: m.delivery_status ?? null,
                error: m.metadata?.meta_status?.title
                  || m.metadata?.meta_status?.details
                  || m.metadata?.error
                  || null,
              };
            }
          });
          setConvMsgs(map);
        });
    }
  }, [targets]);

  const togglePause = async () => {
    if (!campaign) return;
    const next = campaign.status === 'paused' ? 'active' : 'paused';
    const { error } = await supabase.from('campaigns').update({ status: next }).eq('id', campaignId);
    if (error) toast.error(error.message);
    else { setCampaign({ ...campaign, status: next }); toast.success(next === 'active' ? 'Retomada' : 'Pausada'); }
  };

  if (!campaign) return <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const done = counts.sent + counts.responded + counts.failed + counts.skipped + counts.cancelled;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const statusLabel: Record<string, string> = {
    draft: 'Rascunho', active: 'Ativa', paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
  };
  const countLabel: Record<string, string> = {
    queued: 'Em fila', sending: 'Enviando', sent: 'Enviadas', responded: 'Respondidas',
    failed: 'Falharam', skipped: 'Puladas', cancelled: 'Canceladas',
  };
  const targetStatusLabel: Record<string, string> = {
    queued: 'Em fila', sending: 'Enviando', sent: 'Enviada', responded: 'Respondeu',
    failed: 'Falhou', skipped: 'Pulada', cancelled: 'Cancelada',
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <h1 className="flex-1 font-semibold truncate">{campaign.name}</h1>
        <Badge>{statusLabel[campaign.status] ?? campaign.status}</Badge>
        {(campaign.status === 'active' || campaign.status === 'paused') && (
          <Button variant="outline" size="sm" onClick={togglePause}>
            {campaign.status === 'paused' ? <><Play className="h-4 w-4 mr-2" />Retomar</> : <><Pause className="h-4 w-4 mr-2" />Pausar</>}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onEdit}><Edit className="h-4 w-4 mr-2" />Editar</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 bg-muted rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center text-xs">
            {(['queued','sending','sent','responded','failed','skipped','cancelled'] as const).map((k) => (
              <div key={k} className="p-2 rounded border">
                <p className="text-muted-foreground">{countLabel[k]}</p>
                <p className="text-lg font-semibold">{counts[k]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AICampaignAssistant campaignId={campaignId} />

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos envios</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[500px] overflow-auto text-sm">
            {targets.slice(0, 100).map((t) => {
              const lead = leads[t.lead_id];
              const phone = lead?.phone ? formatBRPhone(lead.phone) : null;
              const name = lead?.name || 'Lead';
              const msg = t.conversation_id ? convMsgs[t.conversation_id] : null;
              const delivery = t.status === 'sent' ? deliveryLabel(msg?.delivery_status) : null;
              const reason = friendlyReason(t.error || msg?.error);
              const tone = delivery?.tone ?? (t.status === 'failed' ? 'err' : t.status === 'skipped' || t.status === 'cancelled' ? 'warn' : 'muted');
              const badgeClass =
                tone === 'ok' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' :
                tone === 'err' ? 'border-red-500/40 text-red-700 dark:text-red-400' :
                tone === 'warn' ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' :
                '';
              const label = delivery?.label ?? (targetStatusLabel[t.status] ?? t.status);
              return (
                <div key={t.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <Badge variant="outline" className={`text-xs w-32 justify-center shrink-0 ${badgeClass}`}>{label}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="truncate"><span className="font-medium">{name}</span>{phone && <span className="text-muted-foreground"> · {phone}</span>}</p>
                    {reason && <p className="text-xs text-muted-foreground truncate">{reason}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t.sent_at ? new Date(t.sent_at).toLocaleString('pt-BR') : new Date(t.scheduled_for).toLocaleString('pt-BR')}
                  </span>
                </div>
              );
            })}
            {!targets.length && <p className="text-xs text-muted-foreground text-center py-4">Nenhum envio ainda.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
