import { useState } from 'react';
import { Form, DistributionRule, FormBlock } from '@/types/forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, User, Shuffle, Inbox, Code, BarChart3, CalendarClock, CheckCircle, Tag as TagIcon, Plus, X, Thermometer } from 'lucide-react';
import { CadencePicker } from '@/components/admin/cadences/CadencePicker';
import { useLeadTags, useCreateLeadTag } from '@/hooks/useLeadTags';

interface FormSettingsProps {
  form: Form;
  blocks?: FormBlock[];
  onUpdate: (updates: Partial<Form>) => void;
}

export function FormSettings({ form, blocks = [], onUpdate }: FormSettingsProps) {
  const { data: allTags = [] } = useLeadTags();
  const createTag = useCreateLeadTag();
  const [newTagName, setNewTagName] = useState('');

  const submitTagIds: string[] = (form.settings as any)?.submit_tag_ids || [];
  const selectedTags = allTags.filter((t) => submitTagIds.includes(t.id));

  const toggleTag = (tagId: string) => {
    const next = submitTagIds.includes(tagId)
      ? submitTagIds.filter((id) => id !== tagId)
      : [...submitTagIds, tagId];
    onUpdate({ settings: { ...form.settings, submit_tag_ids: next } as any });
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const created = await createTag.mutateAsync({ name, color: '#6B7280' });
    if (created?.id) {
      onUpdate({ settings: { ...form.settings, submit_tag_ids: [...submitTagIds, created.id] } as any });
      setNewTagName('');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
          <CardDescription>Nome, descrição e identificação do formulário</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Formulário</Label>
              <Input
                value={form.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={form.slug}
                onChange={(e) => onUpdate({ slug: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Descrição interna do formulário..."
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Distribution Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Distribuição de Leads
          </CardTitle>
          <CardDescription>
            Defina como os leads serão distribuídos ao serem capturados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: 'manual', label: 'Manual', icon: Inbox, description: 'Leads entram sem atribuição' },
              { value: 'user', label: 'Usuário Específico', icon: User, description: 'Sempre atribuir a um vendedor' },
              { value: 'squad', label: 'Squad', icon: Users, description: 'Distribuir para fila do time' },
              { value: 'round_robin', label: 'Round Robin', icon: Shuffle, description: 'Rotação automática entre vendedores' },
            ].map((rule) => {
              const Icon = rule.icon;
              const isSelected = form.distribution_rule === rule.value;
              
              return (
                <button
                  key={rule.value}
                  onClick={() => onUpdate({ distribution_rule: rule.value as DistributionRule })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{rule.label}</p>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          
          <div className="space-y-2">
            <Label>Temperatura Padrão do Lead</Label>
            <Select
              value={form.default_temperature}
              onValueChange={(value) => onUpdate({ default_temperature: value })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cold">🥶 Frio</SelectItem>
                <SelectItem value="warm">☀️ Morno</SelectItem>
                <SelectItem value="hot">🔥 Quente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Temperature thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Classificação por Pontuação
          </CardTitle>
          <CardDescription>
            Conforme o lead acumula pontos respondendo este formulário, ele é classificado automaticamente em <strong>Frio / Morno / Quente</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const t = (form.settings as any)?.temperature_thresholds || { warm_min: 30, hot_min: 70 };
            const warmMin = Number(t.warm_min ?? 30);
            const hotMin = Number(t.hot_min ?? 70);
            const setThresholds = (next: { warm_min: number; hot_min: number }) => {
              onUpdate({
                settings: { ...form.settings, temperature_thresholds: next } as any,
              });
            };
            return (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Morno a partir de</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={warmMin}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10) || 0;
                          setThresholds({ warm_min: v, hot_min: Math.max(v + 1, hotMin) });
                        }}
                      />
                      <span className="text-sm text-muted-foreground">pts</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Quente a partir de</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={warmMin + 1}
                        value={hotMin}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10) || 0;
                          setThresholds({ warm_min: Math.min(warmMin, v - 1), hot_min: v });
                        }}
                      />
                      <span className="text-sm text-muted-foreground">pts</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-600 dark:text-blue-400">
                    🥶 Frio
                  </Badge>
                  <span className="text-muted-foreground">0 – {Math.max(warmMin - 1, 0)} pts</span>
                  <span className="text-muted-foreground">·</span>
                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                    ☀️ Morno
                  </Badge>
                  <span className="text-muted-foreground">{warmMin} – {Math.max(hotMin - 1, warmMin)} pts</span>
                  <span className="text-muted-foreground">·</span>
                  <Badge variant="outline" className="gap-1 border-red-500/40 text-red-600 dark:text-red-400">
                    🔥 Quente
                  </Badge>
                  <span className="text-muted-foreground">{hotMin}+ pts</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Os pontos são definidos por opção em cada pergunta (Seleção, Sim/Não e Escala). Cada nova submissão <strong>acumula</strong> no score do lead.
                </p>
              </>
            );
          })()}
        </CardContent>
      </Card>
      
      {/* Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Rastreamento e Analytics
          </CardTitle>
          <CardDescription>
            Configure pixels e scripts de tracking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Capturar UTMs</Label>
              <p className="text-sm text-muted-foreground">
                Salvar parâmetros UTM automaticamente
              </p>
            </div>
            <Switch
              checked={form.utm_capture}
              onCheckedChange={(checked) => onUpdate({ utm_capture: checked })}
            />
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Facebook Pixel ID</Label>
              <Input
                value={form.facebook_pixel_id || ''}
                onChange={(e) => onUpdate({ facebook_pixel_id: e.target.value })}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-2">
              <Label>Google Tag ID</Label>
              <Input
                value={form.google_tag_id || ''}
                onChange={(e) => onUpdate({ google_tag_id: e.target.value })}
                placeholder="G-XXXXXXXXXX"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Final screen (thank-you) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Página de Obrigado
          </CardTitle>
          <CardDescription>
            Escolha qual bloco será exibido como tela final após o envio. Por padrão usamos o bloco "Tela Final".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Tela final personalizada</Label>
          <Select
            value={form.settings?.final_block_id || '__default__'}
            onValueChange={(value) => onUpdate({
              settings: {
                ...form.settings,
                final_block_id: value === '__default__' ? null : value,
              },
            })}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Padrão (Tela Final)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Padrão (Tela Final)</SelectItem>
              {blocks
                .filter((b) => b.block_type !== 'welcome_screen')
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label || b.block_type}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            O bloco selecionado será exibido <strong>após o envio</strong>. O botão <strong>Enviar</strong> aparecerá automaticamente na pergunta anterior — assim o lead já é gravado antes da página de obrigado.
          </p>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5" />
            Etiquetas ao enviar
          </CardTitle>
          <CardDescription>
            Estas etiquetas serão aplicadas automaticamente ao lead quando ele clicar em <strong>Enviar</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((t) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="gap-1.5 pl-2 pr-1 py-1"
                  style={{ borderLeft: `3px solid ${t.color}` }}
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className="ml-1 rounded-full hover:bg-muted p-0.5"
                    aria-label="Remover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="border rounded-lg max-h-56 overflow-auto divide-y">
            {allTags.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma etiqueta criada ainda.</p>
            ) : (
              allTags.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    checked={submitTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: t.color }}
                  />
                  <span className="text-sm">{t.name}</span>
                </label>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Criar nova etiqueta..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateTag();
                }
              }}
            />
            <Button
              type="button"
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTag.isPending}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Post-submit cadence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Após criar o lead
          </CardTitle>
          <CardDescription>
            Inscreva automaticamente cada novo lead em uma cadência inteligente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Inserir em cadência</Label>
          <div className="mt-2">
            <CadencePicker
              value={(form as any).post_cadence_id ?? null}
              onChange={(id) => onUpdate({ post_cadence_id: id } as any)}
              placeholder="Nenhuma — não inscrever"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
