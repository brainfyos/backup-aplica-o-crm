import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, MessageSquare, Smartphone, AlertTriangle, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import { Funnel } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { useEvolutionInstances } from '@/hooks/useEvolutionInstances';
import { toast } from 'sonner';

interface Props { funnel: Funnel; }

export function WhatsAppConnectionTab({ funnel }: Props) {
  const wa = (funnel.channels as any)?.whatsapp || { enabled: true };
  const [enabled, setEnabled] = useState<boolean>(wa.enabled !== false);
  const [instanceId, setInstanceId] = useState<string>(wa.evolution_instance_id || 'any');
  const { data: instances = [], isLoading: loadingInstances } = useEvolutionInstances();
  const update = useUpdateFunnel();

  const handleSave = async () => {
    const nextChannels = {
      ...(funnel.channels || {}),
      whatsapp: {
        enabled,
        evolution_instance_id: instanceId === 'any' ? null : instanceId,
      },
    };
    await update.mutateAsync({ id: funnel.id, channels: nextChannels as any } as any);
    toast.success('Conexão salva');
  };

  const selectedInstance = instances.find(i => i.id === instanceId);
  const isDirty = enabled !== (wa.enabled !== false)
    || (instanceId === 'any' ? null : instanceId) !== (wa.evolution_instance_id || null);

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            Conexão WhatsApp
          </h2>
          <p className="text-muted-foreground text-sm">
            Defina em qual instância Evolution este fluxo dispara.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!isDirty || update.isPending} className="gap-2">
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status do canal</CardTitle>
          <CardDescription>
            Quando habilitado, toda primeira mensagem recebida na instância selecionada inicia este fluxo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Fluxo ativo no WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                Desabilite para pausar o disparo sem despublicar o funil.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {!enabled && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Com o canal desabilitado, mensagens recebidas serão tratadas pelo agente IA padrão ou pela fila humana.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-emerald-600" />
            Instância vinculada
          </CardTitle>
          <CardDescription>
            Escolha uma instância específica para isolar o fluxo, ou deixe em "Qualquer instância" para que dispare em todas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instância Evolution</Label>
            <Select value={instanceId} onValueChange={setInstanceId} disabled={loadingInstances}>
              <SelectTrigger>
                <SelectValue placeholder={loadingInstances ? 'Carregando...' : 'Selecione'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Qualquer instância da empresa</span>
                  </div>
                </SelectItem>
                {instances.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    <div className="flex items-center gap-2">
                      {i.status === 'connected' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>{i.name}</span>
                      {i.phone_number && (
                        <span className="text-muted-foreground text-xs">· {i.phone_number}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instances.length === 0 && !loadingInstances && (
              <p className="text-xs text-muted-foreground">
                Nenhuma instância conectada. Conecte uma em <strong>Conexões → WhatsApp</strong>.
              </p>
            )}
          </div>

          {selectedInstance && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-sm">{selectedInstance.name}</span>
                </div>
                <Badge variant={selectedInstance.status === 'connected' ? 'default' : 'secondary'}>
                  {selectedInstance.status === 'connected' ? 'Conectada' : selectedInstance.status}
                </Badge>
              </div>
              {selectedInstance.phone_number && (
                <p className="text-xs text-muted-foreground">
                  Número: <span className="font-mono">{selectedInstance.phone_number}</span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como funciona o gatilho</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">1.</strong> Lead envia a primeira mensagem para a instância acima.
          </p>
          <p>
            <strong className="text-foreground">2.</strong> O sistema verifica funis ativos com WhatsApp habilitado e cria uma conversa.
          </p>
          <p>
            <strong className="text-foreground">3.</strong> Este fluxo assume — executa cada bloco em ordem, podendo passar para IA, agendar reunião ou transferir para humano.
          </p>
          <p className="pt-2 text-xs">
            Apenas um funil dispara por mensagem. Se houver múltiplos ativos, o primeiro encontrado prevalece — use a instância para segmentar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
