import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, GripVertical, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

export type OutcomeKind = 'agendou_reuniao' | 'recebeu_proposta' | 'lead_qualificado' | 'transferiu_humano' | 'recusou' | 'outro';

export interface OutcomeDef {
  id: string;
  label: string;
  kind: OutcomeKind;
  screen_config?: { copy?: string };
}

export interface ToolsConfig {
  mostrar_botoes?: { enabled?: boolean };
  coletar_dado?: { enabled?: boolean };
  abrir_link?: { enabled?: boolean; links?: Array<{ id: string; label: string; url: string }> };
  enviar_proposta?: { enabled?: boolean; propostas?: Array<{ id: string; label: string; url: string; tipo?: string }> };
  agendar_reuniao?: { enabled?: boolean; event_type_id?: string | null };
  transferir_humano?: { enabled?: boolean; sector_id?: string | null };
}

const OUTCOME_KIND_LABELS: Record<OutcomeKind, string> = {
  agendou_reuniao: 'Agendou reunião',
  recebeu_proposta: 'Recebeu proposta',
  lead_qualificado: 'Lead qualificado',
  transferiu_humano: 'Transferiu para humano',
  recusou: 'Recusou',
  outro: 'Outro',
};

function newId() { return Math.random().toString(36).slice(2, 10); }

export function ToolsOutcomesEditor({
  tools,
  outcomes,
  onChange,
}: {
  tools: ToolsConfig;
  outcomes: OutcomeDef[];
  onChange: (next: { tools_config: ToolsConfig; outcomes: OutcomeDef[] }) => void;
}) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const { data: eventTypes = [] } = useQuery({
    queryKey: ['booking-event-types', orgId],
    queryFn: async () => {
      const { data } = await supabase.from('booking_event_types' as any).select('id, title, name').limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', orgId],
    queryFn: async () => {
      const { data } = await supabase.from('sectors' as any).select('id, name').eq('organization_id', orgId).limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!orgId,
  });

  const setTools = (patch: Partial<ToolsConfig>) => onChange({ tools_config: { ...tools, ...patch }, outcomes });
  const setOutcomes = (list: OutcomeDef[]) => onChange({ tools_config: tools, outcomes: list });

  return (
    <div className="space-y-5">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          A IA só pode chamar tools <b>habilitadas</b> aqui. Botões e cards aparecem na tela do cliente exclusivamente via tool call — nunca por parsing da transcrição.
        </AlertDescription>
      </Alert>

      {/* mostrar_botoes */}
      <ToolCard
        title="Mostrar botões"
        desc="Deixa a IA oferecer opções clicáveis (ex.: escolher plano, aceitar/recusar)."
        enabled={tools.mostrar_botoes?.enabled !== false}
        onToggle={(v) => setTools({ mostrar_botoes: { enabled: v } })}
      />

      {/* coletar_dado */}
      <ToolCard
        title="Coletar dado inline"
        desc="Input aparece na tela para o cliente digitar nome, WhatsApp ou e-mail com precisão."
        enabled={tools.coletar_dado?.enabled !== false}
        onToggle={(v) => setTools({ coletar_dado: { enabled: v } })}
      />

      {/* abrir_link */}
      <ToolCard
        title="Abrir link"
        desc="Cadastre links que a IA pode enviar durante a conversa."
        enabled={!!tools.abrir_link?.enabled}
        onToggle={(v) => setTools({ abrir_link: { ...tools.abrir_link, enabled: v, links: tools.abrir_link?.links || [] } })}
      >
        <LinkListEditor
          items={tools.abrir_link?.links || []}
          onChange={(links) => setTools({ abrir_link: { ...tools.abrir_link, enabled: true, links } })}
          labels={{ add: 'Adicionar link', name: 'Rótulo', url: 'URL' }}
        />
      </ToolCard>

      {/* enviar_proposta */}
      <ToolCard
        title="Enviar proposta"
        desc="Propostas comerciais (link, PDF ou checkout) que a IA pode enviar ao cliente."
        enabled={!!tools.enviar_proposta?.enabled}
        onToggle={(v) => setTools({ enviar_proposta: { ...tools.enviar_proposta, enabled: v, propostas: tools.enviar_proposta?.propostas || [] } })}
      >
        <LinkListEditor
          items={tools.enviar_proposta?.propostas || []}
          onChange={(propostas) => setTools({ enviar_proposta: { ...tools.enviar_proposta, enabled: true, propostas } })}
          labels={{ add: 'Adicionar proposta', name: 'Nome da proposta', url: 'URL / link do PDF / checkout' }}
        />
      </ToolCard>

      {/* agendar_reuniao */}
      <ToolCard
        title="Agendar reunião"
        desc="A IA abre um seletor com horários REAIS do agendamento configurado."
        enabled={!!tools.agendar_reuniao?.enabled}
        onToggle={(v) => setTools({ agendar_reuniao: { ...tools.agendar_reuniao, enabled: v } })}
      >
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de evento (booking do Vendus)</Label>
          <Select
            value={tools.agendar_reuniao?.event_type_id || ''}
            onValueChange={(v) => setTools({ agendar_reuniao: { ...tools.agendar_reuniao, enabled: true, event_type_id: v } })}
          >
            <SelectTrigger><SelectValue placeholder="Escolha um evento" /></SelectTrigger>
            <SelectContent>
              {eventTypes.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum evento cadastrado.</div>}
              {eventTypes.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.title || e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </ToolCard>

      {/* transferir_humano */}
      <ToolCard
        title="Transferir para humano"
        desc="A IA transfere para a fila de atendimento humano do setor escolhido."
        enabled={!!tools.transferir_humano?.enabled}
        onToggle={(v) => setTools({ transferir_humano: { ...tools.transferir_humano, enabled: v } })}
      >
        <div className="space-y-1.5">
          <Label className="text-xs">Setor de destino</Label>
          <Select
            value={tools.transferir_humano?.sector_id || ''}
            onValueChange={(v) => setTools({ transferir_humano: { ...tools.transferir_humano, enabled: true, sector_id: v } })}
          >
            <SelectTrigger><SelectValue placeholder="Escolha um setor" /></SelectTrigger>
            <SelectContent>
              {sectors.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum setor cadastrado.</div>}
              {sectors.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </ToolCard>

      {/* Desfechos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-sm font-semibold">Desfechos configuráveis</h4>
            <p className="text-xs text-muted-foreground">Toda ligação DEVE terminar em um desses. A IA é orientada a fechar sempre.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOutcomes([...outcomes, { id: newId(), label: 'Novo desfecho', kind: 'outro' }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
        {outcomes.length === 0 && (
          <Card className="p-4 text-center text-xs text-muted-foreground">
            Sem desfechos — a IA usará <Badge variant="secondary" className="mx-1">lead_qualificado</Badge> e <Badge variant="secondary" className="mx-1">recusou</Badge> como fallback.
          </Card>
        )}
        <div className="space-y-2">
          {outcomes.map((o, i) => (
            <Card key={o.id} className="p-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={o.label}
                  onChange={(e) => {
                    const next = [...outcomes];
                    next[i] = { ...o, label: e.target.value };
                    setOutcomes(next);
                  }}
                  placeholder="Rótulo visível"
                  className="flex-1"
                />
                <Select
                  value={o.kind}
                  onValueChange={(v) => {
                    const next = [...outcomes];
                    next[i] = { ...o, kind: v as OutcomeKind };
                    setOutcomes(next);
                  }}
                >
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OUTCOME_KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setOutcomes(outcomes.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ title, desc, enabled, onToggle, children }: { title: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children && <div className="pt-2 border-t">{children}</div>}
    </Card>
  );
}

function LinkListEditor({ items, onChange, labels }: {
  items: Array<{ id: string; label: string; url: string; tipo?: string }>;
  onChange: (next: Array<{ id: string; label: string; url: string; tipo?: string }>) => void;
  labels: { add: string; name: string; url: string };
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id} className="flex gap-2">
          <Input
            value={it.label}
            placeholder={labels.name}
            onChange={(e) => { const next = [...items]; next[i] = { ...it, label: e.target.value }; onChange(next); }}
          />
          <Input
            value={it.url}
            placeholder={labels.url}
            onChange={(e) => { const next = [...items]; next[i] = { ...it, url: e.target.value }; onChange(next); }}
          />
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...items, { id: newId(), label: '', url: '' }])}>
        <Plus className="h-3.5 w-3.5 mr-1" /> {labels.add}
      </Button>
    </div>
  );
}
