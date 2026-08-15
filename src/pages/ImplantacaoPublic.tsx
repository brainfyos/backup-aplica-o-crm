// Landing pública do link de implantação.
// Antes: renderizava o wizard anonimamente (com bugs de RLS/persistência).
// Agora: valida o token e obriga o admin a fazer login antes de acessar
// o wizard autenticado em /admin/implantacao. Toda gravação passa a rodar
// com JWT do admin, reusando os componentes oficiais do painel.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldAlert, LogIn, KeyRound, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'Link inválido. Verifique se a URL está completa.',
  expired_token: 'Este link expirou. Solicite um novo ao seu contato.',
  link_revoked: 'Este link foi revogado pelo administrador.',
  already_applied: 'A implantação desta empresa já foi concluída.',
  org_not_found: 'Empresa não encontrada.',
  wrong_organization: 'Este usuário não pertence à empresa deste link.',
};

export default function ImplantacaoPublic() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, profile, isLoading: authLoading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgInfo, setOrgInfo] = useState<{ id: string; name?: string } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Valida o token e resolve a organização
  useEffect(() => {
    let active = true;
    async function run() {
      if (!token) { setError('invalid_token'); setChecking(false); return; }
      try {
        const { data, error: e } = await supabase.rpc('validate_onboarding_token', {
          _token: token, _session_token: null, _ip: null,
          _ua: navigator.userAgent.slice(0, 200),
        });
        if (e) throw e;
        const row: any = Array.isArray(data) ? data[0] : data;
        if (!active) return;
        if (!row) { setError('invalid_token'); return; }
        const orgId: string = row.organization_id;
        const { data: org } = await supabase.from('organizations')
          .select('name').eq('id', orgId).maybeSingle();
        setOrgInfo({ id: orgId, name: org?.name });
      } catch (e: any) {
        if (!active) return;
        const msg = String(e?.message || e);
        const known = Object.keys(ERROR_MESSAGES).find(k => msg.includes(k));
        setError(known ?? 'invalid_token');
      } finally {
        if (active) setChecking(false);
      }
    }
    run();
    return () => { active = false; };
  }, [token]);

  // Se já logado e pertence à mesma org → segue para o wizard autenticado
  useEffect(() => {
    if (authLoading || checking) return;
    if (!user || !orgInfo) return;
    if (profile?.organization_id && profile.organization_id !== orgInfo.id) {
      setError('wrong_organization');
      return;
    }
    navigate('/admin/implantacao', { replace: true });
  }, [authLoading, checking, user, profile?.organization_id, orgInfo, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      // O efeito acima faz o redirect após a sessão hidratar
    } catch (err: any) {
      toast({
        title: 'Não foi possível entrar',
        description: err?.message ?? 'Verifique e-mail e senha.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';

  const handleGoogle = async () => {
    try {
      await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.href,
      });
    } catch (err: any) {
      toast({
        title: 'Falha no login com Google',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const handleForgot = async () => {
    if (!email) {
      toast({
        title: 'Informe o e-mail',
        description: 'Digite o e-mail do admin para receber o link de definição de senha.',
      });
      return;
    }
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/definir-senha?next=${encodeURIComponent(currentPath)}`,
      });
      if (err) throw err;
      toast({
        title: 'E-mail enviado',
        description: 'Verifique sua caixa de entrada para definir uma nova senha.',
      });
    } catch (err: any) {
      toast({
        title: 'Não foi possível enviar',
        description: err?.message ?? 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    const friendly = ERROR_MESSAGES[error] ?? 'Não foi possível abrir a implantação.';
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Não foi possível abrir</h1>
          <p className="text-muted-foreground text-sm">{friendly}</p>
          {error === 'wrong_organization' && (
            <Button
              variant="outline"
              onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
            >
              Sair e entrar com outra conta
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Token válido, usuário não logado → tela de login
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Implantação — {orgInfo?.name ?? 'sua empresa'}</CardTitle>
          <CardDescription>
            Faça login com sua conta de administrador para iniciar a implantação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Primeiro acesso? Verifique seu e-mail e clique em <strong>Definir senha</strong> antes
              de entrar. Se já usou este e-mail no Google, entre pelo botão abaixo.
            </AlertDescription>
          </Alert>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
          >
            Entrar com Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou com e-mail</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-xs text-primary hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>
              <Input
                id="password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Entrar e iniciar implantação
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleForgot}
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Primeiro acesso? Definir senha
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Ainda não tem conta? Solicite o convite de administrador ao seu contato.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
