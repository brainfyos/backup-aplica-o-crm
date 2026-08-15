import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, PhoneCall, Info } from 'lucide-react';
import { useStartVoiceCall } from '@/hooks/useVoice';
import { useAllAgents } from '@/hooks/useProductAgents';
import { useVoiceClones, previewGrokVoice } from '@/hooks/useVoiceClones';
import { GROK_NATIVE_VOICES } from '@/config/grokVoicesCatalog';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadName?: string | null;
  leadPhone?: string | null;
}

export function CallVoiceAIDialog({ open, onOpenChange, leadId, leadName, leadPhone }: Props) {
  const { data: agents = [] } = useAllAgents();
  const { data: clones = [] } = useVoiceClones();
  const activeAgents = agents.filter((a: any) => a.is_active);
  const [agentId, setAgentId] = useState<string>('');
  const [voiceId, setVoiceId] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const start = useStartVoiceCall();

  const selected: any = activeAgents.find((a: any) => a.id === agentId);
  const effectiveVoice = voiceId || selected?.default_grok_voice_id || '';

  const handleCall = () => {
    if (!agentId) return;
    start.mutate(
      {
        lead_id: leadId,
        product_agent_id: agentId,
        grok_voice_id: voiceId || null,
        context_override: context.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Ligar com IA</DialogTitle>
          <DialogDescription>
            {leadName ? <>Ligar para <strong>{leadName}</strong></> : 'Ligar para o lead'}
            {leadPhone && <span className="text-muted-foreground"> — {leadPhone}</span>}
          </DialogDescription>
        </DialogHeader>

        {!leadPhone ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Este lead não possui telefone cadastrado.</AlertDescription>
          </Alert>
        ) : activeAgents.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Nenhum agente de IA ativo. Crie um em <strong>Automação &amp; IA → Agentes IA</strong>.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Agente de IA</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Escolha o agente" /></SelectTrigger>
                <SelectContent>
                  {activeAgents.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.product?.name ? ` — ${a.product.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">O agente entra na ligação com toda sua inteligência (persona, tom, sotaque, gírias, can/cannot_do).</p>
            </div>
            <div className="space-y-2">
              <Label>Voz</Label>
              <div className="flex gap-2">
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger><SelectValue placeholder={selected?.default_grok_voice_id ? `Padrão do agente (${selected.default_grok_voice_id})` : 'Voz'} /></SelectTrigger>
                  <SelectContent>
                    {GROK_NATIVE_VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name} · {v.gender} · {v.language}</SelectItem>
                    ))}
                    {clones.filter((c) => c.status === 'ready' && c.grok_voice_id).map((c) => (
                      <SelectItem key={c.id} value={c.grok_voice_id!}>{c.name} (clone)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Ouvir amostra"
                  disabled={!effectiveVoice}
                  onClick={async () => {
                    try {
                      const url = await previewGrokVoice(effectiveVoice);
                      new Audio(url).play().catch(() => {});
                    } catch (e: any) { toast.error(e?.message || 'Falha na prévia'); }
                  }}
                >▶</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contexto desta ligação (opcional)</Label>
              <Textarea
                rows={3}
                placeholder="Ex.: Follow-up da reunião de ontem — foco em fechar plano Pro."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A IA disca do número da xAI e conduz a conversa com todo o contexto do agente + este briefing.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCall} disabled={!agentId || !leadPhone || start.isPending}>
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <PhoneCall className="mr-2 h-4 w-4" /> Iniciar ligação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
