import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Snowflake, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  provider: 'evolution' | 'meta_whatsapp';
  connectionId: string;
  cooldownUntil?: string | null;
  lastFailureReason?: string | null;
  canReset?: boolean;
  queryKeyToInvalidate?: unknown[];
}

export function ProviderCooldownBadge({
  provider,
  connectionId,
  cooldownUntil,
  lastFailureReason,
  canReset,
  queryKeyToInvalidate,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  if (!cooldownUntil) return null;
  const until = new Date(cooldownUntil).getTime();
  if (until <= now) return null;

  const time = new Date(until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const reset = async () => {
    const { error } = await supabase.rpc('clear_provider_cooldown', {
      p_provider: provider,
      p_connection_id: connectionId,
    });
    if (error) {
      toast.error('Falha ao resetar cooldown: ' + error.message);
      return;
    }
    toast.success('Cooldown removido');
    if (queryKeyToInvalidate) qc.invalidateQueries({ queryKey: queryKeyToInvalidate });
  };

  return (
    <div className="flex items-center gap-1">
      <Badge variant="destructive" className="gap-1" title={lastFailureReason || undefined}>
        <Snowflake className="h-3 w-3" />
        Em cooldown até {time}
      </Badge>
      {canReset && (
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={reset} title="Resetar cooldown">
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
