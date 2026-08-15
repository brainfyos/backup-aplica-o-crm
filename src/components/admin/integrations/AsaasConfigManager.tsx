import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2, AlertCircle, Copy, Loader2, ExternalLink, Eye, EyeOff, Trash2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Credentials = {
  id: string;
  environment: 'sandbox' | 'production';
  webhook_token: string;
  account_name: string | null;
  account_email: string | null;
  is_active: boolean;
  last_verified_at: string | null;
};

type Charge = {
  id: string;
  asaas_id: string;
  status: string;
  billing_type: string | null;
  value: number | null;
  due_date: string | null;
  paid_at: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  description: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-amber-600 border-amber-500/40',
  CONFIRMED: 'text-emerald-600 border-emerald-500/40',
  RECEIVED: 'text-emerald-600 border-emerald-500/40',
  OVERDUE: 'text-red-600 border-red-500/40',
  REFUNDED: 'text-orange-600 border-orange-500/40',
  DELETED: 'text-muted-foreground border-muted',
};

function currency(n: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));
}

export function AsaasConfigManager() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const qc = useQueryClient();

  const { data: cred, isLoading } = useQuery({
    queryKey: ['asaas-credentials', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Credentials | null> => {
      const { data, error } = await supabase
        .from('asaas_credentials' as any)
        .select('id, environment, webhook_token, account_name, account_email, is_active, last_verified_at')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  const { data: charges = [], isFetching: chargesLoading } = useQuery({
    queryKey: ['asaas-charges', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Charge[]> => {
      const { data, error } = await supabase
        .from('asaas_charges' as any)
        .select('id, asaas_id, status, billing_type, value, due_date, paid_at, invoice_url, bank_slip_url, description, created_at')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const webhookUrl = useMemo(
    () => (orgId ? `${supaUrl}/functions/v1/asaas-webhook?org=${orgId}` : ''),
    [supaUrl, orgId],
  );

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  useEffect(() => {
    if (cred) setEnvironment(cred.environment);
  }, [cred]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('asaas-credentials-save', {
        body: { environment, api_key: apiKey.trim() },
      });
      if (error) throw new Error((data as any)?.error ?? error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      setApiKey('');
      toast.success('Credenciais Asaas validadas e salvas');
      qc.invalidateQueries({ queryKey: ['asaas-credentials', orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao validar credenciais'),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('asaas-credentials-save', {
        body: { action: 'delete' },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success('Integração desconectada');
      qc.invalidateQueries({ queryKey: ['asaas-credentials', orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  const isConnected = !!cred?.is_active;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Asaas
            {isConnected ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Conectado ({cred?.environment === 'production' ? 'Produção' : 'Sandbox'})
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" /> Não conectado
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Gere cobranças Pix, Boleto e Cartão pelo CRM e receba webhooks automaticamente.
          </p>
        </div>
        <a href="https://www.asaas.com/desenvolvedores" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Alert>
            <AlertDescription className="text-sm space-y-1">
              <p><strong>Como conectar:</strong></p>
              <ol className="list-decimal ml-5 space-y-0.5">
                <li>Acesse <a className="underline" href="https://www.asaas.com/desenvolvedores" target="_blank" rel="noreferrer">asaas.com/desenvolvedores</a> e gere uma <strong>API Key</strong>.</li>
                <li>Escolha o ambiente correspondente (Sandbox para testes, Produção para cobrar de verdade).</li>
                <li>Cole a chave abaixo — ela é validada em <code>/myAccount</code> antes de salvar.</li>
                <li>Na aba <strong>Webhook</strong>, copie a URL + Token e cadastre no Asaas em <em>Configurações → Notificações via API</em>.</li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <Label className="text-sm">Ambiente</Label>
              <p className="text-xs text-muted-foreground">
                {environment === 'production' ? 'Produção — cobra dinheiro real.' : 'Sandbox — teste sem cobrar.'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={environment === 'sandbox' ? 'font-medium' : 'text-muted-foreground'}>Sandbox</span>
              <Switch
                checked={environment === 'production'}
                onCheckedChange={(v) => setEnvironment(v ? 'production' : 'sandbox')}
              />
              <span className={environment === 'production' ? 'font-medium' : 'text-muted-foreground'}>Produção</span>
            </div>
          </div>

          <div>
            <Label htmlFor="asaas-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="asaas-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={cred ? '•••••• (chave salva) — cole para substituir' : '$aact_...'}
                className="font-mono pr-10"
              />
              <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowKey(v => !v)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A chave é armazenada apenas no backend. Nunca aparece no navegador após salvar.
            </p>
          </div>

          {cred?.account_name && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p><strong>Conta:</strong> {cred.account_name} {cred.account_email ? `· ${cred.account_email}` : ''}</p>
              {cred.last_verified_at && (
                <p className="text-xs text-muted-foreground">
                  Última validação: {format(new Date(cred.last_verified_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {isConnected ? (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm('Desconectar Asaas desta empresa?')) disconnect.mutate(); }}
                disabled={disconnect.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Desconectar
              </Button>
            ) : <div />}
            <Button onClick={() => save.mutate()} disabled={!apiKey.trim() || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isConnected ? 'Atualizar chave' : 'Validar e conectar'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="webhook" className="space-y-4">
          <Alert>
            <AlertDescription className="text-sm">
              No Asaas, acesse <strong>Configurações → Integrações → Notificações via API</strong>, cadastre um novo webhook com estes valores e ative os eventos <code>PAYMENT_*</code>.
            </AlertDescription>
          </Alert>
          <div>
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada'); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Token (campo "Token de autenticação")</Label>
            <div className="flex gap-2">
              <Input value={cred?.webhook_token ?? ''} readOnly className="font-mono text-xs" />
              <Button
                variant="outline" size="icon"
                onClick={() => { if (cred?.webhook_token) { navigator.clipboard.writeText(cred.webhook_token); toast.success('Token copiado'); } }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              O Asaas envia esse token no header <code>asaas-access-token</code>. Eventos com token inválido são registrados mas ignorados.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="charges" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {charges.length ? `${charges.length} cobrança(s) recentes` : 'Nenhuma cobrança gerada ainda.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['asaas-charges', orgId] })}>
              <RefreshCw className={`h-4 w-4 mr-1 ${chargesLoading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
          {charges.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(c.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[c.status] ?? ''}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{c.billing_type ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium">{currency(c.value)}</TableCell>
                        <TableCell className="text-xs">{c.due_date ?? '—'}</TableCell>
                        <TableCell>
                          {c.invoice_url ? (
                            <a href={c.invoice_url} target="_blank" rel="noreferrer" className="text-primary text-xs inline-flex items-center gap-1">
                              Fatura <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
