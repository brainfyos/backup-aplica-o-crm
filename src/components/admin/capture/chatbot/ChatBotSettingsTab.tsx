import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save, Loader2, Users, Target, Brain, MessageCircle, AlertTriangle } from 'lucide-react';
import { Funnel, DistributionRule } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { useSquads } from '@/hooks/useSquads';
import { useTeamMembers } from '@/hooks/useTeam';
import { toast } from 'sonner';

interface Props { funnel: Funnel; }

export function ChatBotSettingsTab({ funnel }: Props) {
  const [formData, setFormData] = useState({
    product_id: funnel.product_id,
    name: funnel.name,
    description: funnel.description || '',
    slug: funnel.slug,
    distribution_rule: funnel.distribution_rule,
    assigned_squad_id: funnel.assigned_squad_id || '',
    assigned_user_id: funnel.assigned_user_id || '',
    default_temperature: funnel.default_temperature,
    default_tags: funnel.default_tags.join(', '),
    ai_enabled: funnel.ai_enabled,
    ai_context: funnel.ai_context || '',
  });

  const updateFunnel = useUpdateFunnel();
  const { data: products } = useProducts();
  const { data: squads } = useSquads();
  const { data: teamMembers } = useTeamMembers();

  const handleSave = async () => {
    const updates = {
      ...formData,
      default_tags: formData.default_tags.split(',').map(t => t.trim()).filter(Boolean),
      assigned_squad_id: formData.assigned_squad_id || null,
      assigned_user_id: formData.assigned_user_id || null,
    };
    await updateFunnel.mutateAsync({ id: funnel.id, ...updates });
    toast.success('Configurações do ChatBot salvas');
  };

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Configurações do ChatBot
          </h2>
          <p className="text-muted-foreground text-sm">
            Apenas opções relevantes para conversas em chat público.
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateFunnel.isPending} className="gap-2">
          {updateFunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* Identidade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade</CardTitle>
          <CardDescription>Produto, nome e URL pública.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Produto vinculado</Label>
            <Select
              value={formData.product_id}
              onValueChange={(v) => setFormData(p => ({ ...p, product_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">A IA usará o Cérebro deste produto.</p>
          </div>

          {formData.product_id !== funnel.product_id && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>Os agentes IA vinculados aos blocos passarão a ser do novo produto.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Slug público</Label>
              <Input value={formData.slug} onChange={(e) => setFormData(p => ({ ...p, slug: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">URL: /c/{formData.slug}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição interna</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Distribuição */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Distribuição de leads do chat</CardTitle>
          </div>
          <CardDescription>Para quem vai o lead quando o ChatBot capturar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Regra</Label>
            <Select
              value={formData.distribution_rule}
              onValueChange={(v) => setFormData(p => ({
                ...p, distribution_rule: v as DistributionRule, assigned_squad_id: '', assigned_user_id: '',
              }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="squad">Squad</SelectItem>
                <SelectItem value="user">Usuário específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.distribution_rule === 'squad' && (
            <div className="space-y-2">
              <Label>Squad</Label>
              <Select value={formData.assigned_squad_id} onValueChange={(v) => setFormData(p => ({ ...p, assigned_squad_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {squads?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.distribution_rule === 'user' && (
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={formData.assigned_user_id} onValueChange={(v) => setFormData(p => ({ ...p, assigned_user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {teamMembers?.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Qualificação */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Qualificação inicial</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperatura padrão</Label>
              <Select value={formData.default_temperature} onValueChange={(v) => setFormData(p => ({ ...p, default_temperature: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold">🥶 Frio</SelectItem>
                  <SelectItem value="warm">😊 Morno</SelectItem>
                  <SelectItem value="hot">🔥 Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etiquetas padrão (separadas por vírgula)</Label>
              <Input
                value={formData.default_tags}
                onChange={(e) => setFormData(p => ({ ...p, default_tags: e.target.value }))}
                placeholder="chatbot, qualificado"
              />
              <p className="text-[10px] text-muted-foreground">
                Aplicadas automaticamente em todo lead capturado por este ChatBot.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IA */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Inteligência Artificial</CardTitle>
          </div>
          <CardDescription>Contexto extra entregue à IA durante a conversa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.ai_enabled}
              onCheckedChange={(c) => setFormData(p => ({ ...p, ai_enabled: c }))}
            />
            <Label>Habilitar IA neste ChatBot</Label>
          </div>

          {formData.ai_enabled && (
            <div className="space-y-2">
              <Label>Contexto adicional</Label>
              <Textarea
                value={formData.ai_context}
                onChange={(e) => setFormData(p => ({ ...p, ai_context: e.target.value }))}
                placeholder="Ex.: foque em vendas consultivas, evite mencionar concorrentes..."
                rows={4}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
