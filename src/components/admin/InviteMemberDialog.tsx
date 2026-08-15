import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSquads } from '@/hooks/useSquads';
import { Loader2, Mail, Shield, User, Users, Copy, Check, KeyRound, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getPublicAppUrl } from '@/lib/publicUrl';
import { generateProvisionalPassword } from '@/lib/generatePassword';
import { useQueryClient } from '@tanstack/react-query';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'seller'>('seller');
  const [squadId, setSquadId] = useState<string>('none');
  const [password, setPassword] = useState(() => generateProvisionalPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    loginUrl: string;
    emailSent: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: squads } = useSquads();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Digite o email do convidado');
      return;
    }
    if (!password || password.length < 10) {
      toast.error('A senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-team-member', {
        body: {
          email: email.trim(),
          full_name: fullName.trim() || email.trim(),
          password,
          role,
          squad_id: squadId !== 'none' ? squadId : null,
          public_app_url: getPublicAppUrl(),
        },
      });
      if (error || (data && data.ok === false)) {
        throw new Error(error?.message || data?.error || 'Erro ao provisionar usuário');
      }
      setCreated({
        email: data.login_email,
        password,
        loginUrl: data.login_url,
        emailSent: !!data.email_sent,
      });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['org-members'] });
      toast.success('Usuário provisionado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao provisionar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setFullName('');
    setRole('seller');
    setSquadId('none');
    setPassword(generateProvisionalPassword());
    setShowPassword(false);
    setCreated(null);
    setCopiedField(null);
    onOpenChange(false);
  };

  const copy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copiado!');
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Adicionar Membro
          </DialogTitle>
          <DialogDescription>
            Crie a conta com uma senha provisória — o usuário troca no primeiro acesso.
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                placeholder="Fulano de Tal"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="vendedor@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Senha provisória</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPassword(generateProvisionalPassword())}
                  title="Gerar nova"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v: 'admin' | 'seller') => setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Usuário
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      Admin
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Squad (opcional)</Label>
              <Select value={squadId} onValueChange={setSquadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Nenhum squad
                    </div>
                  </SelectItem>
                  {squads?.map((squad) => (
                    <SelectItem key={squad.id} value={squad.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: squad.color || '#6366F1' }}
                        />
                        {squad.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar acesso
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
              <p className="text-xs text-muted-foreground">
                {created.emailSent
                  ? 'Enviamos as credenciais por e-mail. Copie também abaixo por segurança.'
                  : 'Não conseguimos enviar o e-mail — copie e envie manualmente.'}
              </p>

              <div className="space-y-1">
                <Label className="text-xs">E-mail</Label>
                <div className="flex items-center gap-2">
                  <Input value={created.email} readOnly className="text-xs font-mono bg-background" />
                  <Button size="icon" variant="outline" onClick={() => copy(created.email, 'email')}>
                    {copiedField === 'email' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Senha provisória</Label>
                <div className="flex items-center gap-2">
                  <Input value={created.password} readOnly className="text-xs font-mono bg-background" />
                  <Button size="icon" variant="outline" onClick={() => copy(created.password, 'password')}>
                    {copiedField === 'password' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {created.loginUrl && (
                <div className="space-y-1">
                  <Label className="text-xs">Link de acesso</Label>
                  <div className="flex items-center gap-2">
                    <Input value={created.loginUrl} readOnly className="text-xs font-mono bg-background" />
                    <Button size="icon" variant="outline" onClick={() => copy(created.loginUrl, 'url')}>
                      {copiedField === 'url' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
