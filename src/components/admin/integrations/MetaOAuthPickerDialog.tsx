import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Instagram, Megaphone, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface PageOpt {
  id: string; name: string; access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}
interface AdAcctOpt {
  id: string; account_id?: string; name?: string; account_status?: number; currency?: string;
  business?: { id: string; name: string };
}

async function fnError(e: any): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    try { const b = await e.context.json(); return b?.error || b?.details || e.message; } catch {}
  }
  return e?.message ?? String(e);
}

interface Props {
  sessionId: string;
  purpose: 'instagram' | 'ads' | 'both';
  onClose: () => void;
  onDone: (credentialId?: string) => void;
}

export function MetaOAuthPickerDialog({ sessionId, purpose, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<PageOpt[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAcctOpt[]>([]);
  const [pageId, setPageId] = useState<string>('');
  const [adId, setAdId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('meta_oauth_sessions')
        .select('discovered, status')
        .eq('id', sessionId)
        .maybeSingle();
      if (error) { toast.error(error.message); return; }
      const d = (data?.discovered ?? {}) as any;
      const igPages = (d.pages ?? []).filter((p: PageOpt) => !!p.instagram_business_account);
      setPages(purpose === 'ads' ? [] : igPages);
      setAdAccounts(purpose === 'instagram' ? [] : (d.ad_accounts ?? []));
      setLoading(false);
    })();
  }, [sessionId, purpose]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { session_id: sessionId };
      if (pageId) {
        const p = pages.find((x) => x.id === pageId);
        if (p?.instagram_business_account) {
          payload.instagram = { fb_page_id: p.id, ig_business_account_id: p.instagram_business_account.id };
        }
      }
      if (adId) payload.ads = { ad_account_id: adId };
      if (!payload.instagram && !payload.ads) {
        toast.error('Selecione ao menos 1 opção.');
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('meta-oauth-finalize', { body: payload });
      if (error) throw error;
      toast.success('Conexão criada.');
      onDone((data as any)?.ads?.id);
    } catch (e) {
      toast.error(await fnError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escolha o que conectar</DialogTitle>
          <DialogDescription>Selecione a Página + Instagram e/ou a conta de anúncios que essa empresa vai usar.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto">
            {purpose !== 'ads' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium"><Instagram className="h-4 w-4" /> Instagram Business (via Página do Facebook)</div>
                {pages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma Página com Instagram Business vinculado.</p>
                ) : (
                  <RadioGroup value={pageId} onValueChange={setPageId} className="space-y-2">
                    {pages.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent">
                        <RadioGroupItem value={p.id} id={`p-${p.id}`} />
                        <div className="flex-1">
                          <div className="font-medium">@{p.instagram_business_account?.username}</div>
                          <div className="text-xs text-muted-foreground">Página: {p.name}</div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>
            )}

            {purpose !== 'instagram' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium"><Megaphone className="h-4 w-4" /> Conta de anúncios (Meta Ads)</div>
                {adAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma conta de anúncios encontrada.</p>
                ) : (
                  <RadioGroup value={adId} onValueChange={setAdId} className="space-y-2">
                    {adAccounts.map((a) => (
                      <label key={a.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent">
                        <RadioGroupItem value={a.id} id={`a-${a.id}`} />
                        <div className="flex-1">
                          <div className="font-medium">{a.name || a.id}</div>
                          <div className="text-xs text-muted-foreground flex gap-2 items-center">
                            <span>{a.currency}</span>
                            {a.business?.name && <Badge variant="outline" className="text-xs">{a.business.name}</Badge>}
                            {a.account_status === 1 && <Badge variant="secondary" className="text-xs"><Check className="h-3 w-3 mr-1" />Ativa</Badge>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
