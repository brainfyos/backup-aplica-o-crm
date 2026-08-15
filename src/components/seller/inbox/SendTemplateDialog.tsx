import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { TemplatePicker, type VariableMapping } from '@/components/admin/meta/TemplatePicker';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { metaErrorMessage } from '@/lib/metaErrors';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | null;
  metaConnectionId: string;
  conversationId: string;
  leadId?: string | null;
  to: string; // telefone destino
  onSent?: () => void;
}

export function SendTemplateDialog({
  open, onOpenChange, organizationId, metaConnectionId,
  conversationId, leadId, to, onSent,
}: Props) {
  const [value, setValue] = useState<{ template_id: string | null; variable_mapping: VariableMapping }>(
    { template_id: null, variable_mapping: {} },
  );
  const [sending, setSending] = useState(false);
  const connectionIds = useMemo(() => [metaConnectionId], [metaConnectionId]);

  const handleSend = async () => {
    if (!value.template_id) {
      toast.error('Selecione um template');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-whatsapp-send', {
        body: {
          connection_id: metaConnectionId,
          organization_id: organizationId,
          conversation_id: conversationId,
          to,
          type: 'template',
          template: {
            template_id: value.template_id,
            variable_mapping: value.variable_mapping,
            lead_id: leadId ?? null,
          },
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.error) {
        const msg = metaErrorMessage({ code: resp.error, title: resp.error, details: resp.message }, resp.message ?? resp.error);
        throw new Error(msg);
      }
      toast.success('Template enviado');
      onSent?.();
      onOpenChange(false);
      setValue({ template_id: null, variable_mapping: {} });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar template');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar template HSM</DialogTitle>
          <DialogDescription>
            Selecione um template aprovado para abrir/reabrir a conversa via WhatsApp Cloud API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <TemplatePicker
            organizationId={organizationId}
            connectionIds={connectionIds}
            value={value}
            onChange={setValue}
            required
            label="Template aprovado"
            helperText="Apenas templates APROVADOS da conexão atual."
          />
          <div className="text-[11px] text-muted-foreground flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Templates com vídeo/imagem usam a mídia configurada na edição do template — uma vez só.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || !value.template_id}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
