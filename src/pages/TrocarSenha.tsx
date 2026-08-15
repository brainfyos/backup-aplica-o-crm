import { useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function TrocarSenha() {
  const { user, isLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next');
  const safeNext = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/trocar-senha?next=${safeNext}`)}`} replace />;
  }

  // Se o guard não exige troca, apenas redireciona
  if (profile && !profile.must_change_password) {
    return <Navigate to={safeNext} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('A senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        const msg = (updErr.message || '').toLowerCase();
        if (msg.includes('pwned') || msg.includes('weak')) {
          throw new Error('Esta senha foi exposta em vazamentos. Escolha outra.');
        }
        if (msg.includes('same') || msg.includes('different from the old')) {
          throw new Error('A nova senha precisa ser diferente da senha provisória.');
        }
        throw new Error(updErr.message);
      }
      const { error: rpcErr } = await supabase.rpc('mark_password_changed' as any);
      if (rpcErr) console.warn('[trocar-senha] mark_password_changed:', rpcErr);
      toast.success('Senha atualizada!');
      // Força recarregar profile — reload é a forma mais simples
      window.location.replace(safeNext);
    } catch (err: any) {
      setError(err.message || 'Não foi possível atualizar a senha.');
      toast.error(err.message || 'Não foi possível atualizar a senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
          </div>
          <CardTitle>Defina sua nova senha</CardTitle>
          <CardDescription>
            Por segurança, no primeiro acesso é necessário substituir a senha provisória.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-9"
                  placeholder="Mínimo 10 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Digite novamente"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
