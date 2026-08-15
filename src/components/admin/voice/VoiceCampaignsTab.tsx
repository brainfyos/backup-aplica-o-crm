import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit3, Loader2, Megaphone, Play, Pause, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  useVoiceCampaigns, useDeleteVoiceCampaign, useSetCampaignStatus, useVoiceAgents,
  type VoiceCampaign,
} from '@/hooks/useVoice';
import { VoiceCampaignWizard } from './VoiceCampaignWizard';
import { VoiceCampaignDetail } from './VoiceCampaignDetail';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  running: 'bg-green-500/15 text-green-700',
  paused: 'bg-amber-500/15 text-amber-700',
  completed: 'bg-blue-500/15 text-blue-700',
};

type View = { kind: 'list' } | { kind: 'wizard'; editing: Partial<VoiceCampaign> | null } | { kind: 'detail'; id: string };

export function VoiceCampaignsTab() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const { data: items = [], isLoading } = useVoiceCampaigns();
  const { data: agents = [] } = useVoiceAgents();
  const del = useDeleteVoiceCampaign();
  const setStatus = useSetCampaignStatus();

  const agentName = (id?: string | null) => agents.find((a) => a.id === id)?.name || '—';

  if (view.kind === 'wizard') {
    return <VoiceCampaignWizard campaign={view.editing} onClose={() => setView({ kind: 'list' })} />;
  }
  if (view.kind === 'detail') {
    return <VoiceCampaignDetail campaignId={view.id} onBack={() => setView({ kind: 'list' })} onEdit={(c) => setView({ kind: 'wizard', editing: c })} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Campanhas de Voz</h2>
          <p className="text-sm text-muted-foreground">Discagem automática com IA — funil completo do lead.</p>
        </div>
        <Button onClick={() => setView({ kind: 'wizard', editing: null })}>
          <Plus className="mr-2 h-4 w-4" /> Nova campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Megaphone className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>Nenhuma campanha criada.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Card key={c.id} className="p-4 hover:border-primary/50 transition cursor-pointer" onClick={() => setView({ kind: 'detail', id: c.id })}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{c.name}</h3>
                    <Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                  <div className="text-xs text-muted-foreground mt-2 flex gap-4 flex-wrap">
                    <span>Perfil: <b>{agentName(c.voice_agent_id)}</b></span>
                    <span>Simultâneas: {c.max_concurrent}</span>
                    <span>Tentativas: {c.max_attempts}</span>
                    {c.totals?.will_receive != null && <span>Audiência: <b>{c.totals.will_receive}</b></span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {c.status !== 'running' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: c.id, status: 'running' })}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                    </Button>
                  )}
                  {c.status === 'running' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: c.id, status: 'paused' })}>
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                    </Button>
                  )}
                  {c.status !== 'completed' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: c.id, status: 'completed' })}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Encerrar
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => setView({ kind: 'wizard', editing: c })}><Edit3 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm('Remover campanha?') && del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
