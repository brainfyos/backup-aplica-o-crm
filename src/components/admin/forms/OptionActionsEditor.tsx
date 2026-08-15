import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLeadTags, useCreateLeadTag } from '@/hooks/useLeadTags';
import { useSectors } from '@/hooks/useSectors';
import { useTeamMembers } from '@/hooks/useTeam';
import type {
  FormOptionAction,
  FormBlock,
} from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  ExternalLink,
  Tag,
  Bot,
  Send,
  CalendarClock,
  Users,
  UserCircle2,
  ArrowRightCircle,
  Trash2,
  Plus,
  Database,
} from 'lucide-react';
import { CustomFieldPicker } from './CustomFieldPicker';

const ACTION_LABELS: Record<FormOptionAction['type'], string> = {
  redirect: 'Redirecionar (URL/pagamento)',
  add_tags: 'Adicionar etiqueta',
  start_ai_agent: 'Atribuir agente IA (passivo)',
  start_ai_outreach: 'Agente IA inicia conversa no WhatsApp',
  open_calendar: 'Abrir calendário',
  assign_sector: 'Atribuir setor',
  assign_user: 'Atribuir a usuário',
  go_to_block: 'Pular para bloco',
  set_custom_field: 'Preencher campo personalizado',
};

const ACTION_ICONS: Record<FormOptionAction['type'], React.ComponentType<{ className?: string }>> = {
  redirect: ExternalLink,
  add_tags: Tag,
  start_ai_agent: Bot,
  start_ai_outreach: Send,
  open_calendar: CalendarClock,
  assign_sector: Users,
  assign_user: UserCircle2,
  go_to_block: ArrowRightCircle,
  set_custom_field: Database,
};

function useOrgBookingEventTypes() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['org-booking-event-types', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('booking_event_types')
        .select('id, name, slug, user_id, is_active')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

function useOrgAgents() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['org-product-agents', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('product_agents')
        .select('id, name, is_active, product:products(name)')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; product?: { name?: string } | null }>;
    },
    enabled: !!profile?.organization_id,
  });
}

interface Props {
  actions: FormOptionAction[];
  onChange: (next: FormOptionAction[]) => void;
  /** Other blocks in the same form, for go_to_block target picker */
  allBlocks: FormBlock[];
  currentBlockId: string;
}

export function OptionActionsEditor({ actions, onChange, allBlocks, currentBlockId }: Props) {
  const [open, setOpen] = useState(false);
  const list = actions || [];

  const addAction = (type: FormOptionAction['type']) => {
    let next: FormOptionAction;
    switch (type) {
      case 'redirect': next = { type, url: '' }; break;
      case 'add_tags': next = { type, tag_ids: [] }; break;
      case 'start_ai_agent': next = { type, agent_id: '' }; break;
      case 'start_ai_outreach': next = { type, agent_id: '', objective: '' }; break;
      case 'open_calendar': next = { type, event_type_id: '', ask_email: true }; break;
      case 'assign_sector': next = { type, sector_id: '' }; break;
      case 'assign_user': next = { type, user_id: '', as: 'human' }; break;
      case 'go_to_block': next = { type, target_block_id: '' }; break;
      case 'set_custom_field': next = { type, field_key: '', value_source: 'option_label' }; break;
    }
    onChange([...list, next]);
  };

  const updateAction = (idx: number, patch: Partial<FormOptionAction>) => {
    const next = list.slice();
    next[idx] = { ...(next[idx] as any), ...patch } as FormOptionAction;
    onChange(next);
  };

  const removeAction = (idx: number) => {
    const next = list.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={list.length ? 'default' : 'outline'}
          size="sm"
          className="h-7 px-2 gap-1"
          title="Configurar ações desta opção"
        >
          <Zap className="w-3 h-3" />
          {list.length > 0 && <span className="text-xs">{list.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" sideOffset={6}>
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">Ações ao escolher esta opção</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Combine quantas ações quiser. Executadas ao enviar o formulário.
          </p>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug bg-muted/40 rounded p-2 border border-border/40">
            ✅ As respostas do formulário são <strong>sempre enviadas</strong> antes
            de qualquer ação de saída (calendário, redirect, agente, setor). O CRM
            também registra <strong>qual opção</strong> o lead escolheu.
          </p>
        </div>

        <ScrollArea className="max-h-[420px]">
          <div className="p-3 space-y-3">
            {list.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                Nenhuma ação ainda. Adicione abaixo.
              </p>
            )}

            {list.map((a, idx) => {
              const Icon = ACTION_ICONS[a.type];
              return (
                <div key={idx} className="border rounded-lg p-2.5 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Icon className="w-3.5 h-3.5" />
                      {ACTION_LABELS[a.type]}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeAction(idx)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <ActionForm
                    action={a}
                    onUpdate={(patch) => updateAction(idx, patch)}
                    allBlocks={allBlocks}
                    currentBlockId={currentBlockId}
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-3 border-t bg-muted/30">
          <Label className="text-xs">Adicionar ação</Label>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            {(Object.keys(ACTION_LABELS) as FormOptionAction['type'][]).map((type) => {
              const Icon = ACTION_ICONS[type];
              return (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  className="h-8 justify-start gap-1.5 text-xs px-2"
                  onClick={() => addAction(type)}
                >
                  <Icon className="w-3 h-3" />
                  <span className="truncate">{ACTION_LABELS[type]}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActionForm({
  action,
  onUpdate,
  allBlocks,
  currentBlockId,
}: {
  action: FormOptionAction;
  onUpdate: (patch: Partial<FormOptionAction>) => void;
  allBlocks: FormBlock[];
  currentBlockId: string;
}) {
  const { data: tags } = useLeadTags();
  const { data: sectors } = useSectors();
  const { data: team } = useTeamMembers();
  const { data: eventTypes } = useOrgBookingEventTypes();
  const { data: agents } = useOrgAgents();

  switch (action.type) {
    case 'redirect':
      return (
        <div className="space-y-1.5">
          <Input
            value={action.url}
            placeholder="https://pay.exemplo.com/checkout"
            onChange={(e) => onUpdate({ url: e.target.value } as any)}
            className="h-8 text-xs"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Abrir em nova aba</span>
            <Switch
              checked={!!action.new_tab}
              onCheckedChange={(v) => onUpdate({ new_tab: v } as any)}
            />
          </div>
        </div>
      );

    case 'add_tags': {
      return (
        <TagAutocomplete
          selectedIds={action.tag_ids || []}
          tags={tags || []}
          onChange={(ids) => onUpdate({ tag_ids: ids } as any)}
        />
      );
    }


    case 'start_ai_agent':
      return (
        <div className="space-y-1.5">
          <Select value={action.agent_id} onValueChange={(v) => onUpdate({ agent_id: v } as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha um agente IA" /></SelectTrigger>
            <SelectContent>
              {(agents || []).map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name}{a.product?.name ? ` · ${a.product.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Marca o agente como responsável. Ele só responde quando o lead falar.
          </p>
        </div>
      );

    case 'start_ai_outreach':
      return (
        <div className="space-y-1.5">
          <Select value={action.agent_id} onValueChange={(v) => onUpdate({ agent_id: v } as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha um agente IA" /></SelectTrigger>
            <SelectContent>
              {(agents || []).map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name}{a.product?.name ? ` · ${a.product.name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={action.objective || ''}
            placeholder="Objetivo da abordagem (opcional). Ex: tirar dúvidas e agendar reunião."
            onChange={(e) => onUpdate({ objective: e.target.value } as any)}
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground leading-tight">
            Requer telefone capturado no formulário (DDI 55) e instância WhatsApp ativa.
            O agente envia a 1ª mensagem usando as respostas como contexto.
          </p>
        </div>
      );

    case 'open_calendar':
      return (
        <div className="space-y-2">
          <Select
            value={action.event_type_id}
            onValueChange={(v) => onUpdate({ event_type_id: v } as any)}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo de evento" /></SelectTrigger>
            <SelectContent>
              {(eventTypes || []).map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pedir e-mail se faltar</span>
            <Switch
              checked={action.ask_email !== false}
              onCheckedChange={(v) => onUpdate({ ask_email: v } as any)}
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Ao enviar, o lead será redirecionado para o calendário com nome e WhatsApp já preenchidos.
          </p>
        </div>
      );

    case 'assign_sector':
      return (
        <Select value={action.sector_id} onValueChange={(v) => onUpdate({ sector_id: v } as any)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha um setor" /></SelectTrigger>
          <SelectContent>
            {(sectors || []).map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'assign_user':
      return (
        <div className="space-y-1.5">
          <Select value={action.user_id} onValueChange={(v) => onUpdate({ user_id: v } as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
            <SelectContent>
              {(team || []).map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.full_name || m.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={action.as || 'human'}
            onValueChange={(v) => onUpdate({ as: v as 'human' | 'closer' | 'sdr' } as any)}
          >
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="human" className="text-xs">Atendente (responsável)</SelectItem>
              <SelectItem value="sdr" className="text-xs">SDR</SelectItem>
              <SelectItem value="closer" className="text-xs">Closer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case 'go_to_block': {
      const targets = allBlocks.filter((b) => b.id !== currentBlockId);
      return (
        <Select
          value={action.target_block_id}
          onValueChange={(v) => onUpdate({ target_block_id: v } as any)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pular para…" /></SelectTrigger>
          <SelectContent>
            {targets.map((b) => (
              <SelectItem key={b.id} value={b.id} className="text-xs">
                {b.label || `(${b.block_type})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case 'set_custom_field':
      return (
        <CustomFieldPicker
          fieldKey={action.field_key}
          valueSource={action.value_source}
          staticValue={action.static_value}
          onChange={(patch) => onUpdate(patch as any)}
        />
      );
  }
}

function TagAutocomplete({
  selectedIds,
  tags,
  onChange,
}: {
  selectedIds: string[];
  tags: { id: string; name: string; color: string }[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const createTag = useCreateLeadTag();

  const selectedSet = new Set(selectedIds);
  const selectedTags = tags.filter((t) => selectedSet.has(t.id));
  const q = query.trim().toLowerCase();
  const suggestions = tags
    .filter((t) => !selectedSet.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
    .slice(0, 8);
  const exact = tags.find((t) => t.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  const addTag = (id: string) => {
    if (selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
    setQuery('');
  };

  const removeTag = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const handleCreate = async () => {
    if (!q || createTag.isPending) return;
    try {
      const created = await createTag.mutateAsync({
        name: query.trim(),
        color: '#3B82F6',
        is_automatic: false,
      });
      if (created?.id) addTag(created.id);
    } catch {
      // toast já tratado pelo hook
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (exact) addTag(exact.id);
      else if (suggestions[0]) addTag(suggestions[0].id);
      else if (canCreate) handleCreate();
    } else if (e.key === 'Backspace' && !query && selectedIds.length > 0) {
      removeTag(selectedIds[selectedIds.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((t) => (
            <Badge
              key={t.id}
              variant="default"
              className="text-[10px] gap-1 pr-1"
            >
              {t.name}
              <button
                type="button"
                onClick={() => removeTag(t.id)}
                className="ml-0.5 rounded hover:bg-background/20 px-0.5"
                aria-label={`Remover ${t.name}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ou criar etiqueta…"
          className="h-8 text-xs"
        />

        {open && (suggestions.length > 0 || canCreate) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(t.id);
                }}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                disabled={createTag.isPending}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent border-t flex items-center gap-1 text-primary"
              >
                <Plus className="h-3 w-3" />
                Criar etiqueta «{query.trim()}»
              </button>
            )}
          </div>
        )}
      </div>

      {tags.length === 0 && !query && (
        <p className="text-[10px] text-muted-foreground italic">
          Digite para criar sua primeira etiqueta.
        </p>
      )}
    </div>
  );
}

