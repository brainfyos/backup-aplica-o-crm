import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowRightLeft, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ProductAgent } from '@/types/agents';
import { useState } from 'react';

export interface TransferRule {
  id: string;
  name: string;
  keywords: string[];
  target_agent_id: string | null;
  active: boolean;
  farewell?: string;
  greeting?: string;
  delay_seconds?: number | null;
  message_delay_seconds?: number | null;
  include_summary?: boolean | null;
}

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (patch: Partial<ProductAgent>) => void;
}

function blankRule(): TransferRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    keywords: [],
    target_agent_id: null,
    active: true,
  };
}

/** Lista de palavras-chave (mesmo padrão visual do ArrayField do editor). */
function KeywordsField({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState('');

  const add = () => {
    const v = value.trim();
    if (!v || items.includes(v)) {
      setValue('');
      return;
    }
    onChange([...items, v]);
    setValue('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ex: já comprei, acesso, suporte técnico"
          className="text-sm"
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <Badge key={`${item}-${i}`} variant="secondary" className="gap-1 text-xs font-normal">
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentTransferRules({ formData, onChange }: Props) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const { data: agentsData } = useQuery({
    queryKey: ['transfer-rule-target-agents', orgId, formData.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('id, name, agent_type, product_id, products:product_id(name)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const isGlobalAgent = !formData.product_id;

  // Mesmas travas do backend: agente de produto só alcança o mesmo produto
  // ou agentes globais; bots normais nunca alcançam o agente admin.
  const targets = useMemo(() => {
    return (agentsData || [])
      .filter((a: any) => a.id !== formData.id)
      .map((a: any) => {
        const targetIsGlobal = !a.product_id;
        const sameProduct = !!formData.product_id && a.product_id === formData.product_id;
        const isAdminTarget = a.agent_type === 'admin';
        let reason = '';
        if (isAdminTarget && formData.agent_type !== 'admin') {
          reason = 'agente admin é privado do gestor';
        } else if (!isGlobalAgent && !targetIsGlobal && !sameProduct) {
          reason = 'outro produto';
        }
        return {
          id: a.id as string,
          name: a.name as string,
          productName: (a.products as any)?.name || (targetIsGlobal ? 'Global' : ''),
          disabled: !!reason,
          reason,
        };
      });
  }, [agentsData, formData.id, formData.product_id, formData.agent_type, isGlobalAgent]);

  const rules: TransferRule[] = Array.isArray((formData.tool_configs as any)?.transfer_rules)
    ? ((formData.tool_configs as any).transfer_rules as TransferRule[])
    : [];

  const persist = (next: TransferRule[]) => {
    onChange({
      tool_configs: { ...(formData.tool_configs || {}), transfer_rules: next } as any,
    });
  };

  const updateRule = (id: string, patch: Partial<TransferRule>) =>
    persist(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const nameOf = (id: string | null) =>
    targets.find((t) => t.id === id)?.name || 'selecione o agente';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold">Regras de transferência</Label>
          <p className="text-xs text-muted-foreground">
            O agente obedece exatamente estas regras. Sem regras, nada muda.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => persist([...rules, blankRule()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nenhuma regra configurada. As transferências continuam dependendo apenas do prompt.
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {rules.map((rule) => (
            <AccordionItem
              key={rule.id}
              value={rule.id}
              className="rounded-lg border border-border bg-background px-3"
            >
              <div className="flex items-center gap-2">
                <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                  <div className="flex min-w-0 items-center gap-2 text-left">
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-sm font-medium">
                      {rule.name?.trim() || 'Nova transferência'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      → {nameOf(rule.target_agent_id)}
                    </span>
                  </div>
                </AccordionTrigger>
                <Switch
                  checked={rule.active !== false}
                  onCheckedChange={(v) => updateRule(rule.id, { active: v })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => persist(rules.filter((r) => r.id !== rule.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <AccordionContent className="space-y-4 pb-4">
                <div className="space-y-2">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                    placeholder="Ex: Pós-venda"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">
                    Quando <span className="text-muted-foreground">(palavras-chave ou termos)</span>
                  </Label>
                  <KeywordsField
                    items={rule.keywords || []}
                    onChange={(next) => updateRule(rule.id, { keywords: next })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Qual agente</Label>
                  <Select
                    value={rule.target_agent_id || ''}
                    onValueChange={(v) => updateRule(rule.id, { target_agent_id: v })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione o agente destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.id} value={t.id} disabled={t.disabled}>
                          {t.name}
                          {t.productName ? ` · ${t.productName}` : ''}
                          {t.disabled ? ` (bloqueado: ${t.reason})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Deixe vazio para usar o padrão do agente.
                  </p>


                  <div className="space-y-2">
                    <Label className="text-xs">Mensagem ao transferir (despedida)</Label>
                    <Textarea
                      value={rule.farewell ?? ''}
                      onChange={(e) => updateRule(rule.id, { farewell: e.target.value })}
                      rows={2}
                      className="text-sm"
                      placeholder="Vazio = usa o padrão do agente"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Mensagem ao assumir (apresentação automática)</Label>
                    <Textarea
                      value={rule.greeting ?? ''}
                      onChange={(e) => updateRule(rule.id, { greeting: e.target.value })}
                      rows={3}
                      className="text-sm"
                      placeholder="Vazio = usa a apresentação do agente destino"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Atraso da apresentação (s)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={rule.delay_seconds ?? ''}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            delay_seconds:
                              e.target.value === '' ? null : Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)),
                          })
                        }
                        className="text-sm"
                        placeholder="padrão"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Atraso entre mensagens (s)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={rule.message_delay_seconds ?? ''}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            message_delay_seconds:
                              e.target.value === '' ? null : Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)),
                          })
                        }
                        className="text-sm"
                        placeholder="padrão"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Incluir resumo da conversa anterior</Label>
                    <Switch
                      checked={rule.include_summary ?? formData.handoff_include_summary !== false}
                      onCheckedChange={(v) => updateRule(rule.id, { include_summary: v })}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
