import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Smartphone, ShieldCheck, Instagram, ChevronRight } from 'lucide-react';

export type ConnectionProvider = 'evolution' | 'meta_whatsapp' | 'meta_instagram';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (provider: ConnectionProvider) => void;
}

interface OptionProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  badge?: { label: string; variant?: 'default' | 'secondary' | 'outline' };
  disabled?: boolean;
  onClick?: () => void;
}

function Option({ icon, iconBg, title, description, badge, disabled, onClick }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-lg border p-4 flex items-center gap-4 transition-colors ${
        disabled
          ? 'opacity-60 cursor-not-allowed border-border'
          : 'hover:border-primary hover:bg-accent/40 border-border'
      }`}
    >
      <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium">{title}</p>
          {badge && <Badge variant={badge.variant ?? 'secondary'} className="text-[10px]">{badge.label}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {!disabled && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </button>
  );
}

export function NewConnectionDialog({ open, onClose, onSelect }: Props) {
  const handle = (p: ConnectionProvider) => { onSelect(p); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conexão</DialogTitle>
          <DialogDescription>
            Escolha qual tipo de canal você quer conectar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Option
            icon={<Smartphone className="h-5 w-5 text-green-600" />}
            iconBg="bg-green-500/10"
            title="WhatsApp via QR Code"
            description="Evolution Go — conecta rápido escaneando o QR no celular. Sem precisar de Meta App."
            badge={{ label: 'Recomendado', variant: 'default' }}
            onClick={() => handle('evolution')}
          />
          <Option
            icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
            iconBg="bg-emerald-500/10"
            title="WhatsApp Oficial (Meta Cloud API)"
            description="API oficial da Meta com templates, automações e envio em escala. Requer que você crie seu próprio Meta App. Ideal para empresas que querem número próprio, templates aprovados e maior estabilidade."
            badge={{ label: 'Avançado', variant: 'outline' }}
            onClick={() => handle('meta_whatsapp')}
          />
          <Option
            icon={<Instagram className="h-5 w-5 text-pink-500" />}
            iconBg="bg-pink-500/10"
            title="Instagram Direct (Meta)"
            description="API oficial para receber e responder mensagens do Instagram profissional via Meta. Requer Instagram Business/Creator vinculado a uma Página do Facebook."
            badge={{ label: 'Avançado', variant: 'outline' }}
            onClick={() => handle('meta_instagram')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
