import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SendFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  widgetProductId?: string;
}

export function SendFlowDialog({
  open,
  onOpenChange,
  conversationId,
  widgetProductId,
}: SendFlowDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: flows, isLoading } = useQuery({
    queryKey: ['chat-flows-active', profile?.organization_id, widgetProductId],
    queryFn: async () => {
      let query = supabase
        .from('chat_flows')
        .select('id, name, description')
        .eq('organization_id', profile!.organization_id!)
        .eq('is_active', true)
        .order('name');

      if (widgetProductId) {
        query = query.or(`product_id.eq.${widgetProductId},product_id.is.null`);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: open && !!profile?.organization_id,
  });

  const handleSend = async () => {
    if (!selectedFlowId) return;
    setIsSending(true);
    try {
      await supabase.functions.invoke('webchat-inbox', {
        body: {
          action: 'trigger-flow',
          conversationId,
          flowId: selectedFlowId,
        },
      });
      toast({ title: 'Fluxo enviado com sucesso!' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao enviar fluxo', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Enviar Fluxo
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-72">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : flows?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum fluxo ativo encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {flows?.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => setSelectedFlowId(flow.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    selectedFlowId === flow.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="text-sm font-medium">{flow.name}</p>
                  {flow.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{flow.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!selectedFlowId || isSending}>
            {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar Fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
