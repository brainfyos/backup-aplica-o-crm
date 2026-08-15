import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Copy, Trash2, Plus, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface Props { orgId: string | null }

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'cdn_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function CadenceApiKeys({ orgId }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('cadence_api_keys' as any)
      .select('id,name,key_prefix,created_at,last_used_at,revoked_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setKeys((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  const create = async () => {
    if (!orgId || !name.trim()) return;
    const token = randomToken();
    const hash = await sha256(token);
    const { error } = await supabase.from('cadence_api_keys' as any).insert({
      organization_id: orgId,
      name: name.trim(),
      key_hash: hash,
      key_prefix: token.slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    setGenerated(token);
    setName('');
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm('Revogar esta chave? Aplicações que usam ela deixarão de funcionar.')) return;
    const { error } = await supabase.from('cadence_api_keys' as any)
      .update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Chave revogada');
    load();
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cadence-api`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Chaves de API</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Use estas chaves para integrar a Cadência ao seu sistema via REST.</p>
          </div>
          <Button size="sm" onClick={() => { setGenerated(null); setShowNew(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova chave
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
            keys.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma chave criada.</p> : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {k.name}
                      {k.revoked_at && <Badge variant="destructive">Revogada</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</div>
                    <div className="text-xs text-muted-foreground">
                      {k.last_used_at ? `Último uso: ${new Date(k.last_used_at).toLocaleString('pt-BR')}` : 'Nunca utilizada'}
                    </div>
                  </div>
                  {!k.revoked_at && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Endpoints</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 font-mono">
          <div className="text-xs text-muted-foreground font-sans mb-2">
            Base URL: <code className="font-mono">{baseUrl}</code><br/>
            Header: <code>Authorization: Bearer cdn_…</code>
          </div>
          {[
            ['GET', '/cadences', 'Lista cadências'],
            ['GET', '/cadences/:id', 'Detalhe + steps'],
            ['GET', '/cadences/:id/stats', 'Métricas + breakdown por step'],
            ['POST', '/cadences/:id/enroll', 'Inscreve leads'],
            ['GET', '/enrollments?cadence_id=…&status=…', 'Lista inscrições'],
            ['GET', '/enrollments/:id', 'Detalhe + runs'],
            ['POST', '/enrollments/:id/stop', 'Interrompe inscrição'],
          ].map(([m, p, d]) => (
            <div key={p} className="flex gap-3 items-baseline border-b pb-1">
              <Badge variant="outline" className="font-mono">{m}</Badge>
              <span className="text-foreground">{p}</span>
              <span className="ml-auto text-xs text-muted-foreground font-sans">{d}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={(o) => { setShowNew(o); if (!o) setGenerated(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{generated ? 'Chave criada' : 'Nova chave de API'}</DialogTitle>
          </DialogHeader>
          {!generated ? (
            <div className="space-y-3">
              <Label>Nome da chave</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Integração CRM externo" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copie a chave agora — ela não poderá ser visualizada novamente.
              </p>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {generated}
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(generated); toast.success('Copiado'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            {!generated ? (
              <>
                <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
                <Button onClick={create} disabled={!name.trim()}>Gerar chave</Button>
              </>
            ) : (
              <Button onClick={() => setShowNew(false)}>Concluir</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
