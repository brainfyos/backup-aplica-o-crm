import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Loader2, LogIn, Mail, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import {
  useAcceptInvitation,
  useInvitationByToken,
} from '@/hooks/useTeamInvitations';
import { translateAuthError } from '@/lib/auth-errors';
import { supabase } from '@/integrations/supabase/client';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const nextParam = searchParams.get('next');
  const destination = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  const returnToInvite = token
    ? `/aceitar-convite?token=${encodeURIComponent(token)}${
        nextParam ? `&next=${encodeURIComponent(destination)}` : ''
      }`
    : '/aceitar-convite';

  const { user, isLoading: loadingAuth } = useAuth();
  const {
    data: invitation,
    isLoading: loadingInvitation,
    isError: invitationQueryFailed,
    refetch: refetchInvitation,
  } = useInvitationByToken(token);
  const acceptInvitation = useAcceptInvitation();
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const attemptedForUserRef = useRef<string | null>(null);

  const invitationEmail = (invitation?.email || '').trim().toLowerCase();
  const currentUserEmail = (user?.email || '').trim().toLowerCase();
  const emailMatches = Boolean(invitationEmail && currentUserEmail && invitationEmail === currentUserEmail);
  const invitationState = invitation?.state || invitation?.status;

  const acceptForCurrentUser = useCallback(async () => {
    if (!token || !user || invitationState !== 'pending' || !emailMatches) return;
    if (attemptedForUserRef.current === user.id) return;

    attemptedForUserRef.current = user.id;
    setAcceptError(null);

    try {
      await acceptInvitation.mutateAsync({ token, userId: user.id });
      setAccepted(true);
      toast.success('Convite aceito com sucesso!');
      window.setTimeout(() => navigate(destination, { replace: true }), 1200);
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : 'Erro ao aceitar convite';
      const message = translateAuthError(rawMessage) || rawMessage;
      setAcceptError(message);
      toast.error(message);
    }
  }, [acceptInvitation, destination, emailMatches, invitationState, navigate, token, user]);

  useEffect(() => {
    if (!invitation) return;
    void acceptForCurrentUser();
  }, [
    acceptForCurrentUser,
    invitation,
  ]);

  const handleRetry = () => {
    attemptedForUserRef.current = null;
    setAcceptError(null);
    void acceptForCurrentUser();
  };

  const handleUseInvitedAccount = async () => {
    await supabase.auth.signOut();
    navigate(`/login?next=${encodeURIComponent(returnToInvite)}`, { replace: true });
  };

  if (loadingAuth || loadingInvitation) {
    return (
      <InviteShell>
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Consultando convite...</p>
      </InviteShell>
    );
  }

  if (!token || invitationQueryFailed) {
    return (
      <InviteShell>
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <h1 className="text-xl font-semibold">Não foi possível consultar o convite</h1>
        <p className="text-center text-sm text-muted-foreground">
          Confira o link recebido ou tente novamente em alguns instantes.
        </p>
        {token && <Button onClick={() => refetchInvitation()}>Tentar novamente</Button>}
      </InviteShell>
    );
  }

  if (!invitation || invitationState === 'invalid') {
    return (
      <InviteShell>
        <XCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Convite inválido</h1>
        <p className="text-center text-sm text-muted-foreground">
          Este link não existe ou não está mais disponível.
        </p>
        <Button asChild><Link to="/login">Ir para o login</Link></Button>
      </InviteShell>
    );
  }

  if (invitationState === 'expired') {
    return (
      <InviteShell>
        <XCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Convite expirado</h1>
        <p className="text-center text-sm text-muted-foreground">
          Solicite ao administrador da empresa o reenvio do convite.
        </p>
        <Button asChild><Link to="/login">Ir para o login</Link></Button>
      </InviteShell>
    );
  }

  if (invitationState === 'accepted' || accepted) {
    return (
      <InviteShell>
        <CheckCircle className="h-12 w-12 text-emerald-500" />
        <h1 className="text-xl font-semibold">
          {accepted ? 'Convite aceito!' : 'Convite já aceito'}
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          {accepted ? 'Redirecionando para o painel...' : 'Esta conta já foi vinculada à empresa.'}
        </p>
        {!accepted && (
          <Button asChild>
            <Link to={user ? destination : `/login?next=${encodeURIComponent(destination)}`}>
              {user ? 'Continuar' : 'Fazer login'}
            </Link>
          </Button>
        )}
      </InviteShell>
    );
  }

  if (invitationState === 'processing') {
    return (
      <InviteShell>
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <h1 className="text-xl font-semibold">Convite em processamento</h1>
        <p className="text-center text-sm text-muted-foreground">
          Aguarde alguns instantes e tente novamente.
        </p>
        <Button variant="outline" onClick={() => refetchInvitation()}>Atualizar</Button>
      </InviteShell>
    );
  }

  if (user && !emailMatches) {
    return (
      <InviteShell>
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <h1 className="text-xl font-semibold">Entre com a conta convidada</h1>
        <p className="text-center text-sm text-muted-foreground">
          A conta conectada não corresponde ao e-mail deste convite.
        </p>
        <Button className="w-full" onClick={handleUseInvitedAccount}>
          Sair e fazer outro login
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <Link to={destination}>Cancelar</Link>
        </Button>
      </InviteShell>
    );
  }

  if (user && emailMatches) {
    return (
      <InviteShell>
        {acceptError ? (
          <>
            <XCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold">Não foi possível aceitar</h1>
            <p role="alert" className="text-center text-sm text-muted-foreground">{acceptError}</p>
            <Button onClick={handleRetry}>Tentar novamente</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <h1 className="text-xl font-semibold">Aceitando convite...</h1>
            <p className="text-center text-sm text-muted-foreground">
              Estamos vinculando sua conta à empresa.
            </p>
          </>
        )}
      </InviteShell>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-7 w-7 text-primary" />
            </div>
          </div>
          <CardTitle>Você recebeu um convite</CardTitle>
          <CardDescription>
            Faça login com o e-mail convidado para entrar na empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link to={`/login?next=${encodeURIComponent(returnToInvite)}`}>
              <LogIn className="mr-2 h-4 w-4" />
              Aceitar convite
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
