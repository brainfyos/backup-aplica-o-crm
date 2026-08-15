import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Lock, ArrowRight, AlertTriangle } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { translateAuthError } from '@/lib/auth-errors';

type Phase = 'checking' | 'ready' | 'expired';

/**
 * Página usada tanto para reset de senha quanto para "definir senha" após
 * aceite de convite. Ambos os fluxos dependem de o Supabase JS consumir o
 * hash do link (#access_token=…&type=recovery|invite) e estabelecer a sessão.
 *
 * Se o hash já foi consumido em outra aba/browser, chegamos aqui sem
 * sessão de recovery — nesse caso mostramos aviso claro em vez de tentar
 * updateUser (que falharia com "Auth session missing").
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next');
  const isSafeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Detecta se o link trouxe um hash de recovery/invite. Se sim, esperamos
    // o Supabase disparar PASSWORD_RECOVERY/SIGNED_IN. Se não, checamos se
    // já existe sessão (link recém-clicado ou usuário logado querendo trocar
    // a senha) — caso contrário, marcamos como expirado.
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const hashHasRecoveryToken = /access_token=/.test(hash) && /type=(recovery|invite|magiclink|signup)/.test(hash);
    const tokenHash = searchParams.get('token_hash');
    const otpType = searchParams.get('type');

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setPhase('ready');
      }
    });

    (async () => {
      // Link novo (domínio próprio): troca o token_hash por uma sessão.
      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as 'recovery' | 'invite' | 'magiclink' | 'signup' | 'email_change',
        });
        if (error) {
          console.error('[reset-password] verifyOtp failed', error);
          setPhase('expired');
        } else {
          setPhase('ready');
        }
        return;
      }

      // Se veio hash de recovery, aguardamos onAuthStateChange (até 8s).
      if (hashHasRecoveryToken) {
        const start = Date.now();
        const poll = async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            setPhase('ready');
            return;
          }
          if (Date.now() - start > 8000) {
            setPhase('expired');
            return;
          }
          setTimeout(poll, 300);
        };
        poll();
        return;
      }

      // Sem hash: só é válido se já existir sessão ativa.
      const { data } = await supabase.auth.getSession();
      setPhase(data.session ? 'ready' : 'expired');
    })();

    return () => sub.subscription.unsubscribe();
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error('A senha deve ter pelo menos 10 caracteres');
      return;
    }
    if (password !== confirm) {
      toast.error('As senhas não conferem');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      // Loga o erro real para diagnóstico e mostra mensagem específica.
      console.error('[reset-password] updateUser failed', error);
      toast.error(translateAuthError(error.message || error));
      return;
    }
    toast.success('Senha atualizada! Redirecionando...');
    navigate(isSafeNext ? nextParam! : '/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">
            {phase === 'expired' ? 'Link expirado' : 'Redefinir senha'}
          </h2>
          <p className="text-muted-foreground mt-2">
            {phase === 'checking' && 'Validando link de recuperação...'}
            {phase === 'ready' && 'Escolha uma nova senha forte para sua conta'}
            {phase === 'expired' &&
              'Este link já foi usado ou expirou. Solicite um novo convite ou um novo link de redefinição.'}
          </p>
        </div>

        {phase === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                  minLength={10}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres. Combine letras, números e símbolos.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="pl-10 h-12 bg-card border-border"
                  required
                  minLength={10}
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Salvar nova senha
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>
        )}

        {phase === 'checking' && (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {phase === 'expired' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              O link de definição de senha só funciona uma vez e expira em algumas horas.
              Peça a quem enviou o convite para gerar um novo, ou use "Esqueci minha senha"
              na tela de login.
            </div>
          </div>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-primary hover:underline text-sm"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
