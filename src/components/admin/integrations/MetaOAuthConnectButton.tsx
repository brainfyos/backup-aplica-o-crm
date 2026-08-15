import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Facebook, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MetaOAuthPickerDialog } from './MetaOAuthPickerDialog';

interface Props {
  organizationId: string;
  purpose?: 'instagram' | 'ads' | 'both';
  label?: string;
  className?: string;
  onConnected?: (credentialId?: string) => void;
}

async function fnError(e: unknown): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    try {
      const body = await e.context.json();
      return body?.error || body?.details || e.message;
    } catch {
      return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

export function MetaOAuthConnectButton({ organizationId, purpose = 'both', label, className, onConnected }: Props) {
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedSessionId = params.get('meta_oauth_session');
    const returnedError = params.get('meta_oauth_error');

    if (returnedSessionId) setSessionId(returnedSessionId);
    if (returnedError) toast.error(`Falha no OAuth: ${returnedError}`);

    if (returnedSessionId || returnedError) {
      params.delete('meta_oauth_session');
      params.delete('meta_oauth_error');
      const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth-start', {
        body: { organization_id: organizationId, purpose },
      });
      if (error) throw error;
      if (!data?.auth_url || !data?.session_id) {
        throw new Error('A Meta não retornou a URL de autorização.');
      }

      // Alguns modos do Facebook Login para Empresas fecham o popup sem visitar
      // o redirect_uri. Na aba principal, o callback sempre consegue voltar ao
      // Vendus e abrir o seletor de ativos.
      window.location.assign(data.auth_url);
    } catch (e) {
      setBusy(false);
      toast.error(await fnError(e));
    }
  };

  return (
    <>
      <Button onClick={start} disabled={busy} className={className}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Facebook className="h-4 w-4 mr-2" />}
        {label || 'Conectar com Facebook'}
      </Button>
      {sessionId && (
        <MetaOAuthPickerDialog
          sessionId={sessionId}
          purpose={purpose}
          onClose={() => setSessionId(null)}
          onDone={(credentialId) => {
            setSessionId(null);
            onConnected?.(credentialId);
          }}
        />
      )}
    </>
  );
}
