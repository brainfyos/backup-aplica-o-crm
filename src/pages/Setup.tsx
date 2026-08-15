import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function Setup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  // Se já existe Super Admin, não permite acesso à tela.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('super-admin-status');
        if (!mounted) return;
        if (data?.hasSuperAdmin) {
          navigate('/login', { replace: true });
          return;
        }
      } catch {
        // segue mostrando o formulário; backend valida de novo no submit
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error('Informe seu nome');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error('Email inválido');
    if (password.length < 8) return toast.error('A senha precisa ter no mínimo 8 caracteres');
    if (password !== confirmPassword) return toast.error('As senhas não conferem');

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-super-admin', {
        body: {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          companyName: companyName.trim() || undefined,
          phone: phone.trim() || undefined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Não foi possível concluir a configuração');

      // Login automático
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signErr) {
        toast.success('Super Admin criado. Faça login para continuar.');
        navigate('/login', { replace: true });
        return;
      }
      toast.success('Configuração concluída!');
      navigate('/super-admin', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar Super Admin');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Configuração Inicial</CardTitle>
          <CardDescription>
            Crie sua conta de Super Admin para começar a usar a plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Seu nome *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="João Silva"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da empresa (opcional)</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Minha Empresa Ltda"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone (opcional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar conta de Super Admin
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
