import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit3, Loader2, Webhook as WebhookIcon, Copy, Check } from 'lucide-react';
import {
  useVoiceInboundWebhooks, useSaveVoiceInboundWebhook, useDeleteVoiceInboundWebhook,
  buildVoiceInboundWebhookUrl, type VoiceInboundWebhook,
} from '@/hooks/useVoiceInboundWebhooks';
import { useVoiceCampaigns, useVoiceAgents } from '@/hooks/useVoice';
import { toast } from 'sonner';

const MODES = [
  { value: 'enroll_campaign', label: 'Apenas inscrever na campanha' },
  { value: 'call_immediate', label: 'Ligar imediatamente' },
  { value: 'call_scheduled', label: 'Ligar agendado (offset)' },
];

export function VoiceWebhooksTab() {
  const { data: items = [], isLoading } = useVoiceInboundWebhooks();
  const del = useDeleteVoiceInboundWebhook();
  const [editing, setEditing] = useState<Partial<VoiceInboundWebhook> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyUrl = (token: string, id: string) => {
    navigator.clipboard.writeText(buildVoiceInboundWebhookUrl(token));
    setCopiedId(id);
    toast.success('URL copiada');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Webhooks de Captação</h2>
          <p className="text-sm text-muted-foreground">Endpoint público para receber leads de formulários/anúncios e disparar ligações automáticas.</p>
        </div>
        <Button onClick={() => setEditing({ active: true, mode: 'enroll_campaign' })}>
          <Plus className="mr-2 h-4 w-4" /> Novo webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <WebhookIcon className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>Nenhum webhook configurado.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((w) => (
            <Card key={w.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{w.name}</h3>
                    <Badge variant={w.active ? 'default' : 'secondary'}>{w.active ? 'ativo' : 'inativo'}</Badge>
                    <Badge variant="outline">{MODES.find((m) => m.value === w.mode)?.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Disparos: {w.trigger_count} · {w.last_triggered_at ? `último: ${new Date(w.last_triggered_at).toLocaleString('pt-BR')}` : 'nunca disparado'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => copyUrl(w.token, w.id)}>
                    {copiedId === w.id ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    URL
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(w)}><Edit3 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm('Remover webhook?') && del.mutate(w.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="text-[11px] font-mono bg-muted p-2 rounded break-all">
                {buildVoiceInboundWebhookUrl(w.token)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <WebhookEditor item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function WebhookEditor({ item, onClose }: { item: Partial<VoiceInboundWebhook> | null; onClose: () => void }) {
  const save = useSaveVoiceInboundWebhook();
  const { data: campaigns = [] } = useVoiceCampaigns();
  const { data: agents = [] } = useVoiceAgents();
  const [form, setForm] = useState<Partial<VoiceInboundWebhook>>(item || {});

  const handleSave = () => {
    if (!form.name?.trim()) { toast.error('Dê um nome'); return; }
    save.mutate(form as any, { onSuccess: () => onClose() });
  };

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" key={item?.id || 'new'}>
        <SheetHeader>
          <SheetTitle>{item?.id ? 'Editar webhook' : 'Novo webhook'}</SheetTitle>
          <SheetDescription>Endpoint público para receber leads e disparar campanhas.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Landing curso IA" />
          </div>

          <div className="space-y-2">
            <Label>Modo</Label>
            <Select value={form.mode || 'enroll_campaign'} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Campanha vinculada</Label>
            <Select value={form.campaign_id || 'none'} onValueChange={(v) => setForm({ ...form, campaign_id: v === 'none' ? null : v })}>
              <SelectTrigger><SelectValue placeholder="— nenhuma —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— nenhuma —</SelectItem>
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.mode === 'call_scheduled' && (
            <div className="space-y-2">
              <Label>Atraso (minutos)</Label>
              <Input type="number" min={1} value={form.schedule_offset_minutes ?? 5}
                onChange={(e) => setForm({ ...form, schedule_offset_minutes: Number(e.target.value) })} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Fonte padrão</Label>
            <Input value={form.default_source || ''} onChange={(e) => setForm({ ...form, default_source: e.target.value })} placeholder="Ex: landing_curso_ia" />
          </div>

          <div className="space-y-2">
            <Label>Etiquetas padrão (separadas por vírgula)</Label>
            <Input value={(form.default_tags || []).join(', ')}
              onChange={(e) => setForm({ ...form, default_tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="captação-voz, curso-ia" />
          </div>

          <div className="space-y-2">
            <Label>Mapeamento de campos (JSON, opcional)</Label>
            <Textarea rows={6} className="font-mono text-xs"
              value={JSON.stringify(form.field_mapping || {}, null, 2)}
              onChange={(e) => {
                try { setForm({ ...form, field_mapping: JSON.parse(e.target.value || '{}') }); } catch { /* ignora enquanto digita */ }
              }}
              placeholder='{"name": "full_name", "phone": "whatsapp", "utm_source": "utm.source"}' />
            <p className="text-xs text-muted-foreground">Chaves conhecidas: name, email, phone, utm_source, utm_medium, utm_campaign, utm_term, utm_content, tags.</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border">
            <Label>Ativo</Label>
            <Switch checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={save.isPending || !form.name?.trim()}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
