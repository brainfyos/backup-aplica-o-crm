import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Mic, Info } from 'lucide-react';
import { toast } from 'sonner';

const UNITS = [
  { value: 'minute', label: 'Por minuto de conversa' },
  { value: 'audio_second', label: 'Por segundo de áudio (in+out)' },
  { value: 'audio_second_in', label: 'Por segundo de áudio de entrada' },
  { value: 'audio_second_out', label: 'Por segundo de áudio de saída' },
  { value: 'token_in', label: 'Por token de entrada' },
  { value: 'token_out', label: 'Por token de saída' },
];

interface Rate {
  id: string;
  provider: string;
  model: string;
  voice_id: string | null;
  unit: string;
  usd_per_unit: number;
  is_active: boolean;
  notes: string | null;
  effective_from: string;
}

export function VoicePricingManager() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ['voice-pricing'],
    queryFn: async (): Promise<Rate[]> => {
      const { data, error } = await supabase.from('voice_pricing' as any)
        .select('*')
        .order('provider').order('model').order('unit');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Rate>) => {
      if (payload.id) {
        const { error } = await supabase.from('voice_pricing' as any).update(payload).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('voice_pricing' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['voice-pricing'] }); toast.success('Tarifa salva'); setOpen(false); setEditing(null); },
    onError: (e: any) => toast.error(e.message || 'Falha ao salvar'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('voice_pricing' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['voice-pricing'] }); toast.success('Tarifa removida'); },
  });

  const toggle = useMutation({
    mutationFn: async (r: Rate) => {
      const { error } = await supabase.from('voice_pricing' as any).update({ is_active: !r.is_active }).eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-pricing'] }),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Mic className="h-6 w-6" /> Tarifas de Voz</h1>
          <p className="text-sm text-muted-foreground">
            Configure o custo em USD por unidade (minuto, segundo de áudio, token). Aplicado às ligações web ao calcular consumo.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1" /> Nova tarifa</Button>
          </DialogTrigger>
          <RateDialog rate={editing} onSave={(p) => save.mutate(p)} saving={save.isPending} />
        </Dialog>
      </div>

      <div className="text-xs text-muted-foreground flex items-start gap-2 rounded border border-blue-500/20 bg-blue-500/5 p-3">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <b>Como funciona:</b> a cada ligação encerrada, o sistema busca a tarifa <b>ativa</b> mais recente do provider/modelo da sessão. Preferimos <i>audio_second_in/out</i> quando disponível; caindo para <i>audio_second</i> e por último <i>minute</i>. Se você mudar uma tarifa, sessões anteriores <b>não</b> são recalculadas — cada sessão guarda seu snapshot.
        </div>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Provider</th>
                  <th className="px-3 py-2 text-left">Modelo</th>
                  <th className="px-3 py-2 text-left">Voz</th>
                  <th className="px-3 py-2 text-left">Unidade</th>
                  <th className="px-3 py-2 text-right">USD por unidade</th>
                  <th className="px-3 py-2 text-left">Ativo</th>
                  <th className="px-3 py-2 text-left">Observações</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rates.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma tarifa cadastrada.</td></tr>
                ) : rates.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2"><Badge variant="outline">{r.provider}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                    <td className="px-3 py-2 text-xs">{r.voice_id || <span className="text-muted-foreground">qualquer</span>}</td>
                    <td className="px-3 py-2 text-xs">{UNITS.find((u) => u.value === r.unit)?.label || r.unit}</td>
                    <td className="px-3 py-2 text-right font-mono">${Number(r.usd_per_unit).toFixed(8)}</td>
                    <td className="px-3 py-2"><Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px] truncate">{r.notes}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('Remover tarifa?')) remove.mutate(r.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RateDialog({ rate, onSave, saving }: { rate: Rate | null; onSave: (r: Partial<Rate>) => void; saving: boolean }) {
  const [provider, setProvider] = useState(rate?.provider || 'openai');
  const [model, setModel] = useState(rate?.model || '');
  const [voiceId, setVoiceId] = useState(rate?.voice_id || '');
  const [unit, setUnit] = useState(rate?.unit || 'audio_second_in');
  const [usd, setUsd] = useState(String(rate?.usd_per_unit ?? '0'));
  const [notes, setNotes] = useState(rate?.notes || '');
  const [isActive, setIsActive] = useState(rate?.is_active ?? true);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{rate ? 'Editar' : 'Nova'} tarifa</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs">Provider</label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="grok">Grok (xAI)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs">Modelo</label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex: gpt-4o-realtime-preview" />
        </div>
        <div>
          <label className="text-xs">Voz (opcional, vazio = qualquer)</label>
          <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="ex: sage" />
        </div>
        <div>
          <label className="text-xs">Unidade</label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs">USD por unidade (ex: 0.00017 = $0,01/min de áudio)</label>
          <Input type="number" step="0.00000001" value={usd} onChange={(e) => setUsd(e.target.value)} />
        </div>
        <div>
          <label className="text-xs">Observações</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span className="text-sm">Ativa</span>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !provider || !model || !unit || !usd}
          onClick={() => onSave({
            id: rate?.id,
            provider, model, voice_id: voiceId || null, unit,
            usd_per_unit: Number(usd), notes: notes || null, is_active: isActive,
          } as any)}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
