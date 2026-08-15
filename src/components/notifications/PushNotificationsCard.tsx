import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, Smartphone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  useNotificationSettings,
  useUpsertNotificationSettings,
  NOTIFICATION_LABELS,
} from '@/hooks/useNotificationSettings';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const PUSH_KEYS = [
  'push_new_message',
  'push_queue_lead',
  'push_assigned_lead',
  'push_sale_won',
  'push_new_booking',
  'push_booking_reminder',
] as const;


export function PushNotificationsCard() {
  const { user } = useAuth();
  const { supported, permission, subscribed, localSubscribed, backendRegistered, needsIosInstall, loading, enable, disable } =
    usePushNotifications();
  const { data: settings } = useNotificationSettings(user?.id);
  const upsert = useUpsertNotificationSettings();

  const handleEnable = async () => {
    const r = await enable();
    if (r.ok) {
      toast.success('Notificações ativadas neste dispositivo');
    } else if (r.reason === 'ios_needs_install') {
      toast.error('Instale o app na tela inicial antes de ativar', {
        description: 'No Safari: Compartilhar → Adicionar à Tela de Início. Depois abra o ícone.',
      });
    } else if (r.reason === 'denied') {
      toast.error('Permissão negada nas configurações do navegador');
    } else if (r.reason === 'unsupported') {
      toast.error('Este navegador não suporta notificações push');
    } else {
      toast.error('Falha ao ativar notificações', { description: r.reason || 'backend_failed' });
    }
  };

  const handleDisable = async () => {
    await disable();
    toast.success('Notificações desativadas neste dispositivo');
  };

  const togglePref = (key: (typeof PUSH_KEYS)[number], value: boolean) => {
    if (!user?.id) return;
    upsert.mutate({ userId: user.id, settings: { [key]: value } });
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell size={20} />
            Notificações
          </CardTitle>
          <CardDescription>
            Este navegador não suporta notificações push. Acesse pelo Chrome ou Safari atualizado.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={20} />
          Notificações push
        </CardTitle>
        <CardDescription>
          Receba alertas no celular mesmo com o app fechado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsIosInstall && (
          <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <Smartphone className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                No iPhone, instale o app primeiro
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                Toque em <strong>Compartilhar</strong> no Safari → <strong>Adicionar à Tela de Início</strong>.
                Depois abra o app pelo ícone e volte aqui.
              </p>
              <Link to="/install" className="inline-block text-amber-900 dark:text-amber-200 underline font-medium">
                Ver passo a passo
              </Link>
            </div>
          </div>
        )}

        {permission === 'denied' && (
          <div className="flex gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              Você bloqueou notificações para este site. Libere nas configurações do navegador para ativar.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-3">
            {subscribed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {subscribed ? 'Ativado neste dispositivo' : 'Desativado neste dispositivo'}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscribed
                  ? 'Você receberá pushes aqui'
                  : localSubscribed && !backendRegistered
                    ? 'Permissão concedida; falta registrar no backend'
                    : 'Toque em ativar para começar a receber'}
              </p>
            </div>
          </div>
          {subscribed ? (
            <Button variant="outline" size="sm" onClick={handleDisable} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desativar'}
            </Button>
          ) : (
            <Button size="sm" onClick={handleEnable} disabled={loading || needsIosInstall || permission === 'denied'}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : localSubscribed ? 'Concluir' : 'Ativar'}
            </Button>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">O que você quer receber</p>
          {PUSH_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={key} className="text-sm font-normal cursor-pointer">
                {NOTIFICATION_LABELS[key]}
              </Label>
              <Switch
                id={key}
                checked={settings?.[key] ?? true}
                onCheckedChange={(v) => togglePref(key, v)}
                disabled={upsert.isPending}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
