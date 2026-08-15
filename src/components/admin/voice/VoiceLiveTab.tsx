import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PhoneCall, PhoneIncoming, PhoneOutgoing, Radio, User, Bot, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CallLog } from '@/hooks/useVoice';
import { useVoiceAgents } from '@/hooks/useVoice';
import { VoiceCallStage } from './call/VoiceCallStage';

interface CallEvent {
  id: string;
  call_log_id: string;
  event_type: string;
  role: string | null;
  content: string | null;
  occurred_at: string;
}

const LIVE_STATUSES = ['initiated', 'ringing', 'in_progress'];

function elapsed(startedAt: string | null) {
  if (!startedAt) return '—';
  const sec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceLiveTab() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const orgId = profile?.organization_id;

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['live-calls', orgId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // último 1h
      const { data, error } = await supabase
        .from('call_logs' as any)
        .select('*')
        .eq('organization_id', orgId!)
        .in('status', LIVE_STATUSES)
        .gte('started_at', cutoff)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as CallLog[];
    },
    enabled: !!orgId,
    refetchInterval: 5000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = calls.find((c) => c.id === selectedId) || calls[0] || null;
  const activeId = selected?.id;

  // Refresh ticker for "elapsed"
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime: call_logs status changes → invalidate list
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel(`live-calls-${orgId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'call_logs', filter: `organization_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ['live-calls', orgId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, qc]);

  // Test call
  const { data: agents = [] } = useVoiceAgents();
  const [testAgentId, setTestAgentId] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState(false);
  const activeAgents = agents.filter((a) => a.is_active);
  const testAgent = agents.find((a) => a.id === testAgentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500 animate-pulse" /> Ao Vivo
          </h2>
          <p className="text-sm text-muted-foreground">Ligações em andamento e teste de agentes com IA no navegador.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={testAgentId || ''} onValueChange={(v) => setTestAgentId(v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Agente para testar" /></SelectTrigger>
            <SelectContent>
              {activeAgents.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum perfil ativo.</div>}
              {activeAgents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenStage(true)} disabled={!testAgentId}>
            <Play className="h-4 w-4 mr-2" /> Testar chamada
          </Button>
          <Badge variant="outline">{calls.length} ativa(s)</Badge>
        </div>
      </div>

      {testAgent && (
        <VoiceCallStage
          open={openStage}
          onOpenChange={setOpenStage}
          voiceAgentId={testAgent.id}
          agentName={testAgent.name}
        />
      )}


      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : calls.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <PhoneCall className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p>Nenhuma ligação em andamento.</p>
          <p className="text-xs mt-1">Quando a IA iniciar uma ligação, ela aparecerá aqui em tempo real.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            {calls.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  (activeId === c.id) ? 'bg-primary/5 border-primary' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  {c.direction === 'inbound'
                    ? <PhoneIncoming className="h-3.5 w-3.5 text-green-600" />
                    : <PhoneOutgoing className="h-3.5 w-3.5 text-blue-600" />}
                  <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                  <span className="ml-auto font-mono text-muted-foreground">{elapsed(c.started_at)}</span>
                </div>
                <div className="mt-1 text-sm font-medium truncate">{c.to_number || c.from_number || '—'}</div>
              </button>
            ))}
          </div>

          {selected ? (
            <LiveTranscript call={selected} />
          ) : (
            <Card className="p-8 text-center text-muted-foreground">Selecione uma ligação</Card>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTranscript({ call }: { call: CallLog }) {
  const { data: events = [] } = useQuery({
    queryKey: ['call-events', call.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_events' as any)
        .select('*')
        .eq('call_log_id', call.id)
        .order('occurred_at', { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as CallEvent[];
    },
  });

  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`call-events-${call.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_events', filter: `call_log_id=eq.${call.id}` },
        () => qc.invalidateQueries({ queryKey: ['call-events', call.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [call.id, qc]);

  const transcript = useMemo(
    () => events.filter((e) => e.event_type?.startsWith('transcript.') && e.content),
    [events],
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <div className="text-xs text-muted-foreground">
            {call.direction === 'inbound' ? 'Recebida de' : 'Ligando para'}
          </div>
          <div className="font-mono font-medium">{call.to_number || call.from_number}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Duração</div>
          <div className="font-mono text-lg text-red-500">{elapsed(call.started_at)}</div>
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
        {transcript.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10 flex flex-col items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando transcrição em tempo real…
          </div>
        ) : (
          transcript.map((e) => {
            const isAgent = e.role === 'agent';
            return (
              <div key={e.id} className={`flex gap-2 ${isAgent ? 'justify-start' : 'justify-end'}`}>
                <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                  isAgent ? 'bg-primary/10 text-foreground' : 'bg-muted'
                }`}>
                  <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground mb-0.5">
                    {isAgent ? <><Bot className="h-3 w-3" /> Agente IA</> : <><User className="h-3 w-3" /> Cliente</>}
                    <span className="ml-2 font-mono">{new Date(e.occurred_at).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <div>{e.content}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
