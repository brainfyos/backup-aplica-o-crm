import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TemplatePicker } from '@/components/admin/meta/TemplatePicker';
import { useMetaWAConnections } from '@/hooks/useMetaWhatsApp';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useCadences } from '@/hooks/useCadences';
import type { WebhookActionConfig } from '@/types/webhook';

function extractButtons(components: any[] = []): string[] {
  const comp = components.find((c: any) => c.type === 'BUTTONS');
  const btns = (comp?.buttons ?? []) as any[];
  return btns.map((b) => String(b.text ?? '')).filter(Boolean);
}

export function SendTemplateActionConfig({
  config,
  setConfig,
}: {
  config: WebhookActionConfig;
  setConfig: (fn: (prev: WebhookActionConfig) => WebhookActionConfig) => void;
}) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { data: connections } = useMetaWAConnections();
  const { data: leadTags } = useLeadTags();
  const { cadences } = useCadences();
  const [buttons, setButtons] = useState<string[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('product_agents')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      setAgents(data ?? []);
    })();
  }, [orgId]);


  const activeConnections = useMemo(
    () => (connections ?? []).filter((c: any) => c.is_active !== false),
    [connections],
  );

  // Seleciona automaticamente a única conexão disponível
  useEffect(() => {
    if (!config.template_connection_id && activeConnections.length === 1) {
      setConfig((prev) => ({ ...prev, template_connection_id: (activeConnections[0] as any).id }));
    }
  }, [activeConnections.length]);

  // Carrega botões do template escolhido
  useEffect(() => {
    if (!config.template_id) { setButtons([]); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('whatsapp_meta_templates')
        .select('components')
        .eq('id', config.template_id)
        .maybeSingle();
      setButtons(extractButtons((data as any)?.components ?? []));
    })();
  }, [config.template_id]);

  const updateButtonAction = (btn: string, patch: Record<string, any>) => {
    setConfig((prev) => ({
      ...prev,
      template_button_actions: {
        ...(prev.template_button_actions ?? {}),
        [btn]: { ...(prev.template_button_actions?.[btn] ?? {}), ...patch },
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Conexão (API Oficial da Meta) *</Label>
        <Select
          value={config.template_connection_id ?? ''}
          onValueChange={(v) =>
            setConfig((prev) => ({ ...prev, template_connection_id: v, template_id: undefined, template_variable_mapping: {} }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione a conexão" />
          </SelectTrigger>
          <SelectContent>
            {activeConnections.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name || c.display_phone_number || c.phone_number_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeConnections.length === 0 && (
          <p className="text-xs text-amber-600">
            Nenhuma conexão WhatsApp API Oficial ativa — configure em Conexões → API Oficial.
          </p>
        )}
      </div>

      <TemplatePicker
        organizationId={orgId}
        connectionIds={config.template_connection_id ? [config.template_connection_id] : undefined}
        required
        label="Template aprovado *"
        helperText="Somente templates APPROVED. O envio é 100% determinístico (sem IA)."
        value={{
          template_id: config.template_id ?? null,
          variable_mapping: (config.template_variable_mapping ?? {}) as any,
        }}
        onChange={(v) =>
          setConfig((prev) => ({
            ...prev,
            template_id: v.template_id ?? undefined,
            template_variable_mapping: v.variable_mapping as any,
          }))
        }
      />

      <div className="space-y-2">
        <Label>Quem conduz a conversa depois do envio</Label>
        <Select
          value={config.template_no_agent ? 'none' : 'ai'}
          onValueChange={(v) => setConfig((prev) => ({ ...prev, template_no_agent: v === 'none' }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">Agente de IA (responde às mensagens do lead)</SelectItem>
            <SelectItem value="none">Ninguém — apenas mensagens programadas</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Em "Ninguém", a IA não responde nada nessa conversa. Etiquetas, cadências e as respostas
          de botão abaixo continuam funcionando, e a conversa fica visível na caixa de entrada.
        </p>
      </div>

      {buttons.length > 0 && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Ações ao clicar nos botões</Label>
            <Badge variant="outline" className="text-[10px]">{buttons.length} botão(ões)</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando o lead clicar, aplicamos a etiqueta, inscrevemos em uma cadência e/ou
            respondemos na hora (texto fixo ou IA).
          </p>
          {buttons.map((btn) => {
            const a = config.template_button_actions?.[btn] ?? {};
            const replyMode = a.reply_mode ?? (a.reply_text ? 'text' : 'none');
            return (
              <div key={btn} className="space-y-2 border-t pt-2">
                <Badge className="text-[10px]">{btn}</Badge>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Select
                    value={a.tag_id ?? '__none'}
                    onValueChange={(v) => updateButtonAction(btn, { tag_id: v === '__none' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem etiqueta</SelectItem>
                      {(leadTags ?? []).map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={a.cadence_id ?? '__none'}
                    onValueChange={(v) => updateButtonAction(btn, { cadence_id: v === '__none' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cadência" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem cadência</SelectItem>
                      {(cadences ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 rounded-md bg-muted/40 p-2">
                  <Label className="text-xs">Resposta imediata ao clique</Label>
                  <Select
                    value={replyMode}
                    onValueChange={(v) => updateButtonAction(btn, { reply_mode: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="text">Mensagem fixa</SelectItem>
                      <SelectItem value="ai">Agente de IA responde</SelectItem>
                    </SelectContent>
                  </Select>

                  {replyMode === 'text' && (
                    <Textarea
                      rows={3}
                      className="text-xs"
                      placeholder="Ex.: Perfeito, {nome}! Aqui está o link do grupo: https://..."
                      value={a.reply_text ?? ''}
                      onChange={(e) => updateButtonAction(btn, { reply_text: e.target.value })}
                    />
                  )}
                  {replyMode === 'text' && (
                    <p className="text-[11px] text-muted-foreground">
                      Enviado exatamente como escrito. Variáveis: {'{nome}'}, {'{email}'}, {'{telefone}'} e campos personalizados.
                    </p>
                  )}

                  {replyMode === 'ai' && (
                    <Select
                      value={a.reply_agent_id ?? '__none'}
                      onValueChange={(v) => updateButtonAction(btn, { reply_agent_id: v === '__none' ? null : v })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Agente" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Agente atual da conversa</SelectItem>
                        {(agents ?? []).map((ag: any) => (
                          <SelectItem key={ag.id} value={ag.id}>{ag.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!a.opt_out}
                    onCheckedChange={(v) => updateButtonAction(btn, { opt_out: v })}
                  />
                  <Label className="text-xs">Este botão é "não quero receber" (opt-out)</Label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        Use cadências com etapas em "Horário fixo" (ex: 19:55 o link da live, 21:43 a oferta) para
        programar os envios após o clique.
      </div>

    </div>
  );
}
