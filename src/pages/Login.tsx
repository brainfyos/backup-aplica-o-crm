import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { translateAuthError } from '@/lib/auth-errors';
import { Logo } from '@/components/ui/Logo';
import { usePlatformName } from '@/hooks/usePlatformName';

type View = 'login' | 'forgot';

export default function Login() {
  const [view, setView] = useState<View>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next');
  const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  const { platformName, loginHeadline, loginSubheadline, loginStatsEnabled, footerText, loginBgImageUrl, loginBgLayout } = usePlatformName();



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(translateAuthError(error.message));
      } else {
        toast.success('Bem-vindo de volta!');
        navigate(safeNext);
      }
    } catch (error) {
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Digite seu email');
      return;
    }
    setIsLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Mensagem genérica — não expõe se o email existe (anti-enumeração)
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setIsLoading(false);
    }
  };


  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { lovable } = await import('@/integrations/lovable');
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri:
          safeNext === '/'
            ? window.location.origin
            : `${window.location.origin}/login?next=${encodeURIComponent(safeNext)}`,
      });
      if (result.error) {
        toast.error(translateAuthError(result.error.message));
      }
      // Se result.redirected === true, o navegador será redirecionado automaticamente
    } catch (error) {
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Processar headline com quebra de linha
  const headlineParts = loginHeadline.split('\n');

  const layout = loginBgImageUrl ? loginBgLayout : 'split-left';
  const isFullscreen = layout === 'fullscreen';
  const isSplitRight = layout === 'split-right';

  return (
    <div
      className={`min-h-screen bg-background flex relative ${
        isSplitRight ? 'lg:flex-row-reverse' : ''
      }`}
      style={
        isFullscreen && loginBgImageUrl
          ? {
              backgroundImage: `url(${loginBgImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: 'hsl(var(--primary))',
            }
          : undefined
      }
    >
      {/* Overlay quando imagem ocupa a tela toda, garante legibilidade do form */}
      {isFullscreen && loginBgImageUrl && (
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-none" />
      )}

      {/* No mobile, mostra a imagem como fundo + overlay para legibilidade do form */}
      {!isFullscreen && loginBgImageUrl && (
        <>
          <div
            className="lg:hidden absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${loginBgImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="lg:hidden absolute inset-0 bg-background/85 backdrop-blur-sm pointer-events-none" />
        </>
      )}

      {/* Branding lateral — oculto em layout fullscreen */}
      {!isFullscreen && (
        <div
          className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative overflow-hidden"
          style={
            loginBgImageUrl
              ? {
                  backgroundImage: `url(${loginBgImageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: 'hsl(var(--primary))',
                }
              : { background: 'var(--gradient-primary)' }
          }
        >
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative">
            <Logo size="lg" />
          </div>

          <div className="space-y-6 relative">
            <h1 className="text-4xl font-bold text-white leading-tight drop-shadow-sm">
              {headlineParts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < headlineParts.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="text-lg text-white/90 max-w-md">
              {loginSubheadline}
            </p>

            {loginStatsEnabled && (
              <div className="flex gap-8 pt-8">
                <div>
                  <p className="text-3xl font-bold text-white">+40%</p>
                  <p className="text-sm text-white/80">Conversão</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">-50%</p>
                  <p className="text-sm text-white/80">Tempo resposta</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">15+</p>
                  <p className="text-sm text-white/80">Empresas</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm text-white/80 relative">
            {footerText || `© ${new Date().getFullYear()} ${platformName}. Todos os direitos reservados.`}
          </p>
        </div>
      )}

      {/* Form — em fullscreen ocupa toda a largura e é centralizado em um card */}
      <div
        className={`w-full ${
          isFullscreen ? '' : 'lg:w-1/2'
        } flex items-center justify-center p-8 relative z-10`}
      >
        <div
          className={`w-full max-w-md space-y-8 ${
            isFullscreen
              ? 'bg-background/95 backdrop-blur-md rounded-2xl border border-border shadow-2xl p-8'
              : ''
          }`}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <Logo size="lg" />
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">
              {view === 'login' ? 'Entrar na conta' : 'Recuperar senha'}
            </h2>
            <p className="text-muted-foreground mt-2">
              {view === 'login'
                ? 'Entre com suas credenciais para acessar'
                : 'Digite seu email e enviaremos um link para redefinir sua senha'}
            </p>
          </div>

          {view === 'login' && (
            <>
              {/* Google Sign In Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 text-base gap-3"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continuar com Google
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    ou continue com email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 bg-card border-border"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 bg-card border-border"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Entrar
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot');
                    setForgotSent(false);
                  }}
                  className="text-primary hover:underline text-sm"
                >
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}

          {view === 'forgot' && (
            <>
              {forgotSent ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                    Se este email estiver cadastrado, enviaremos um link de recuperação em alguns instantes. Verifique sua caixa de entrada e a pasta de spam.
                  </div>
                  <Button
                    type="button"
                    className="w-full h-12 text-base"
                    onClick={() => {
                      setView('login');
                      setForgotSent(false);
                    }}
                  >
                    Voltar ao login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12 bg-card border-border"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Enviar link de recuperação
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setView('login')}
                      className="text-primary hover:underline text-sm"
                    >
                      Voltar ao login
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
