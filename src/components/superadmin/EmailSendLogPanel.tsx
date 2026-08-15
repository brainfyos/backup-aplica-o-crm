import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';

interface SendLogRow {
  message_id: string;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string | null;
}

function maskEmail(email?: string | null) {
  if (!email || !email.includes('@')) return email ?? '—';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'secondary',
  failed: 'destructive',
  bounced: 'destructive',
  complained: 'destructive',
  suppressed: 'outline',
};

export function EmailSendLogPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-email-send-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_send_log')
        .select('message_id, template_name, recipient_email, status, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as SendLogRow[];
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Diagnóstico de envios</CardTitle>
          <CardDescription>Últimos 25 e-mails processados pela fila da plataforma</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum envio registrado ainda. Envie um e-mail de teste para validar a configuração.
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((row) => (
              <div
                key={`${row.message_id}-${row.created_at}`}
                className="flex items-start justify-between gap-3 p-3 border border-border rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{row.template_name ?? 'system'}</p>
                    <Badge variant={STATUS_VARIANT[row.status ?? ''] ?? 'secondary'} className="text-xs">
                      {row.status ?? 'desconhecido'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {maskEmail(row.recipient_email)}
                    {row.error_message ? ` — ${row.error_message}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
