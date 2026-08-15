import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tag, Ban } from 'lucide-react';
import { useLeadTags } from '@/hooks/useLeadTags';
import type { VariableMapping } from './TemplatePicker';

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  connection_id: string;
  components: any[];
}

export type CampaignTemplateEntry = {
  template_id: string;
  variable_mapping: VariableMapping;
};

export type ButtonAction = {
  tag_id?: string | null;
  opt_out?: boolean;
};

export type CampaignMetaTemplateConfig = {
  templates: CampaignTemplateEntry[];
  strategy: 'random';
  button_actions: Record<string, ButtonAction>;
};

const SOURCE_OPTIONS = [
  { value: 'ai_fill', label: '🤖 Preencher com IA (recomendado)' },
  { value: 'lead.name', label: 'Nome do lead' },
  { value: 'lead.email', label: 'Email do lead' },
  { value: 'lead.phone', label: 'Telefone do lead' },
  { value: 'static', label: 'Texto fixo…' },
];

function detectVars(comps: any[] = []): number[] {
  const text =
    (comps.find((c) => c.type === 'BODY')?.text ?? '') +
    ' ' +
    (comps.find((c) => c.type === 'HEADER')?.text ?? '');
  const set = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) set.add(parseInt(m[1], 10));
  return Array.from(set).sort((a, b) => a - b);
}

function extractButtons(comps: any[] = []): { text: string; type: string }[] {
  const buttonsBlock = comps.find((c) => c.type === 'BUTTONS');
  const list: any[] = Array.isArray(buttonsBlock?.buttons) ? buttonsBlock.buttons : [];
  return list
    .filter((b) => (b?.text ?? '').toString().trim())
    .map((b) => ({ text: String(b.text).trim(), type: String(b.type ?? 'QUICK_REPLY') }));
}

function looksLikeOptOut(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(bloquear|sair( da lista)?|cancelar|parar|stop|unsubscribe|descadastrar|remover|n[aã]o quero receber)/i.test(t);
}

export function MultiTemplatePicker({
  organizationId,
  connectionIds,
  value,
  onChange,
}: {
  organizationId: string | null;
  connectionIds?: string[];
  value: CampaignMetaTemplateConfig;
  onChange: (v: CampaignMetaTemplateConfig) => void;
}) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: tags = [] } = useLeadTags();

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('whatsapp_meta_templates')
        .select('id, name, language, status, connection_id, components')
        .eq('organization_id', organizationId)
        .eq('status', 'APPROVED')
        .order('name');
      let rows = (data ?? []) as MetaTemplate[];
      if (connectionIds && connectionIds.length) {
        rows = rows.filter((t) => connectionIds.includes(t.connection_id));
      }
      setTemplates(rows);
      setLoading(false);
    })();
  }, [organizationId, JSON.stringify(connectionIds)]);

  const selectedIds = useMemo(() => new Set(value.templates.map((t) => t.template_id)), [value.templates]);

  const toggleTemplate = (tpl: MetaTemplate, checked: boolean) => {
    if (checked) {
      const vars = detectVars(tpl.components);
      const mapping: VariableMapping = {};
      vars.forEach((n) => (mapping[String(n)] = { source: 'ai_fill' }));
      onChange({
        ...value,
        templates: [...value.templates, { template_id: tpl.id, variable_mapping: mapping }],
      });
    } else {
      onChange({
        ...value,
        templates: value.templates.filter((t) => t.template_id !== tpl.id),
      });
    }
  };

  const updateMapping = (templateId: string, num: number, patch: Partial<VariableMapping[string]>) => {
    onChange({
      ...value,
      templates: value.templates.map((t) =>
        t.template_id !== templateId
          ? t
          : {
              ...t,
              variable_mapping: {
                ...t.variable_mapping,
                [String(num)]: {
                  ...(t.variable_mapping?.[String(num)] ?? { source: 'ai_fill' }),
                  ...patch,
                },
              },
            },
      ),
    });
  };

  // Coletar botões únicos dos templates selecionados (pelo texto exibido)
  const allButtons = useMemo(() => {
    const map = new Map<string, { text: string; type: string }>();
    for (const sel of value.templates) {
      const tpl = templates.find((t) => t.id === sel.template_id);
      if (!tpl) continue;
      for (const b of extractButtons(tpl.components)) {
        const key = b.text;
        if (!map.has(key)) map.set(key, b);
      }
    }
    return Array.from(map.values());
  }, [value.templates, templates]);

  const updateButtonAction = (key: string, patch: Partial<ButtonAction>) => {
    const current = value.button_actions?.[key] ?? {};
    onChange({
      ...value,
      button_actions: { ...value.button_actions, [key]: { ...current, ...patch } },
    });
  };

  return (
    <div className="space-y-4">
      {/* LISTA DE TEMPLATES (MULTI) */}
      <div className="space-y-2">
        <Label className="text-sm">Templates HSM aprovados</Label>
        <p className="text-xs text-muted-foreground">
          Selecione um ou mais templates. Quando houver mais de um, cada disparo escolherá aleatoriamente — útil para
          diversificar a abordagem e proteger a reputação do número.
        </p>

        <div className="border rounded-md divide-y">
          {loading && <div className="p-3 text-sm text-muted-foreground">Carregando templates…</div>}
          {!loading && !templates.length && (
            <div className="p-3 text-sm text-muted-foreground">
              Nenhum template APPROVED encontrado para as conexões Meta selecionadas.
            </div>
          )}
          {templates.map((tpl) => {
            const checked = selectedIds.has(tpl.id);
            const vars = detectVars(tpl.components);
            return (
              <div key={tpl.id} className="p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleTemplate(tpl, !!v)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{tpl.name}</span>
                      <Badge variant="outline" className="text-[10px]">{tpl.language}</Badge>
                      <Badge variant="outline" className="text-[10px]">{vars.length} var.</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {tpl.components.find((c: any) => c.type === 'BODY')?.text ?? '—'}
                    </p>
                  </div>
                </label>

                {/* Mapeamento de variáveis quando selecionado */}
                {checked && vars.length > 0 && (
                  <div className="ml-7 mt-2 space-y-1.5 pt-2 border-t">
                    {vars.map((n) => {
                      const sel = value.templates.find((t) => t.template_id === tpl.id);
                      const m = sel?.variable_mapping?.[String(n)] ?? { source: 'ai_fill' };
                      return (
                        <div key={n} className="grid grid-cols-12 gap-2 items-center">
                          <Badge className="col-span-1 justify-center text-[10px]">{`{{${n}}}`}</Badge>
                          <Select
                            value={m.source}
                            onValueChange={(v) => updateMapping(tpl.id, n, { source: v, static_value: '' })}
                          >
                            <SelectTrigger className="col-span-5 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SOURCE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {m.source === 'static' && (
                            <Input
                              className="col-span-6 h-8 text-xs"
                              placeholder="Texto fixo (máx 60)"
                              value={m.static_value ?? ''}
                              onChange={(e) =>
                                updateMapping(tpl.id, n, { static_value: e.target.value.slice(0, 60) })
                              }
                            />
                          )}
                          {m.source === 'ai_fill' && (
                            <Input
                              className="col-span-6 h-8 text-xs"
                              placeholder="Dica para a IA (ex: nome do evento)"
                              value={m.hint ?? ''}
                              onChange={(e) => updateMapping(tpl.id, n, { hint: e.target.value })}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AÇÕES POR BOTÃO */}
      {allButtons.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Ações quando o lead clicar em um botão</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Aplique uma etiqueta automaticamente e/ou bloqueie novos envios quando o lead responder com um botão do
            template. Sugerimos marcar “Bloquear envios” em botões como <em>Bloquear</em> ou <em>Sair da lista</em>.
          </p>

          <div className="border rounded-md divide-y">
            {allButtons.map((b) => {
              const action = value.button_actions?.[b.text] ?? {};
              const optDefault = action.opt_out ?? looksLikeOptOut(b.text);
              return (
                <div key={b.text} className="p-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase">{b.type.replace('_', ' ')}</Badge>
                    <span className="text-sm font-medium truncate">{b.text}</span>
                  </div>

                  <div className="col-span-5">
                    <Select
                      value={action.tag_id ?? '__none'}
                      onValueChange={(v) =>
                        updateButtonAction(b.text, { tag_id: v === '__none' ? null : v })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione uma etiqueta…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem etiqueta</SelectItem>
                        {tags.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ background: t.color }}
                              />
                              {t.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="col-span-3 flex items-center gap-2 cursor-pointer text-xs">
                    <Switch
                      checked={!!optDefault}
                      onCheckedChange={(v) => updateButtonAction(b.text, { opt_out: !!v })}
                    />
                    <span className="inline-flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Bloquear envios
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
