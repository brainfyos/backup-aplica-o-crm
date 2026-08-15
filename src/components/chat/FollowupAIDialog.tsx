import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RefreshCw, Send, AlertTriangle, Wand2 } from 'lucide-react';
import { useFollowupAIDraft } from '@/hooks/useFollowupAIDraft';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  leadName?: string | null;
}

const MAX_LEN = 800;

export function FollowupAIDialog({
  open,
  onOpenChange,
  conversationId,
  leadName,
}: Props) {
  const { draft, isLoading, generate, reset, canRegenerate } = useFollowupAIDraft();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Gera ao abrir
  useEffect(() => {
    if (open && conversationId) {
      reset();
      setText('');
      generate(conversationId, false).then((d) => {
        if (d?.draft_message) setText(d.draft_message);
      });
    }
  }, [open, conversationId, generate, reset]);

  const handleRegenerate = async () => {
    if (!conversationId) return;
    const d = await generate(conversationId, true);
    if (d?.draft_message) setText(d.draft_message);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !draft || !conversationId) return;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('webchat-inbox?action=send', {
        body: {
          action: 'send',
          conversation_id: conversationId,
          content: trimmed,
          metadata: {
            followup_ai: true,
            followup_strategy: draft.strategy,
            followup_model: draft.model || null,
            followup_at: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Follow-up enviado');
      onOpenChange(false);
    } catch (e: any) {
      console.error('[FollowupAIDialog] send', e);
      toast.error(e?.message || 'Falha ao enviar follow-up');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Follow-up estratégico com IA
          </DialogTitle>
          <DialogDescription>
            A IA leu toda a conversa{leadName ? ` com ${leadName}` : ''} e preparou um rascunho para
            você. <strong>A mensagem será enviada como sua</strong> — revise antes de mandar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && !draft && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {draft && (
            <>
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Resumo da conversa
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{draft.summary || '—'}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    Estratégia: {draft.strategy_label}
                  </Badge>
                  {draft.model && (
                    <span className="text-[10px] text-muted-foreground">{draft.model}</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Mensagem (editável)
                  </label>
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      text.length > MAX_LEN ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {text.length}/{MAX_LEN}
                  </span>
                </div>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                  rows={6}
                  className="resize-none text-sm"
                  placeholder="A IA vai escrever aqui…"
                  disabled={isLoading}
                />
              </div>

              {draft.warnings && draft.warnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>{draft.warnings.join(' · ')}</div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={handleRegenerate}
            disabled={isLoading || !canRegenerate || !conversationId}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Gerar outra
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || !text.trim() || isSending}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Enviando…' : 'Enviar como meu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
