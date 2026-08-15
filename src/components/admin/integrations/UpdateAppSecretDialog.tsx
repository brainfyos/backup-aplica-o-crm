import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useUpdateInstagramAppSecret, type InstagramConnection } from '@/hooks/useInstagramConnections';

interface Props {
  connection: InstagramConnection | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UpdateAppSecretDialog({ connection, open, onOpenChange }: Props) {
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const update = useUpdateInstagramAppSecret();

  const handleSave = async () => {
    if (!connection || secret.trim().length < 8) return;
    await update.mutateAsync({ connection_id: connection.id, app_secret: secret.trim() });
    setSecret('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setSecret(''); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Atualizar App Secret
          </DialogTitle>
          <DialogDescription>
            Cole o <strong>App Secret</strong> do App da Meta ({connection?.app_id ? `ID ${connection.app_id}` : 'App'}).
            Ele é usado para validar a assinatura HMAC dos eventos recebidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-medium">Onde encontrar</p>
            <p className="text-muted-foreground">
              Meta App Dashboard → seu App → <em>Configurações</em> → <em>Básico</em> → campo <strong>Chave secreta do app</strong> → botão <em>Mostrar</em>. Copie o valor exato.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>App Secret</Label>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="cole aqui"
                autoFocus
                className="pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={secret.trim().length < 8 || update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
