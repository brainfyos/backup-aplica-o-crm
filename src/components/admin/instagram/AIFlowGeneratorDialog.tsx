import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2, Wand2, AlertTriangle } from 'lucide-react';
import { useGenerateInstagramFlowAI } from '@/hooks/useInstagramFlowAI';
import { useAuth } from '@/hooks/useAuth';
import type { InstagramConnection } from '@/hooks/useInstagramConnections';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connectionId?: string | null;
  connections?: InstagramConnection[];
  existingFlowId?: string;
  onGenerated: (flowId: string) => void;
}

const EXAMPLES = [
  'Quem comentar "LINK" em qualquer post do meu perfil recebe uma DM privada com o link do meu curso e ganha a etiqueta "Interessado Instagram".',
  'Toda vez que alguém responder meu story, curta o comentário, responda publicamente "Te chamei no DM!" e passe para a IA continuar a conversa.',
  'Quando receberem DM com "preço" ou "quanto custa", a IA assume, qualifica o lead e oferece um horário de reunião.',
];

export function AIFlowGeneratorDialog({ open, onOpenChange, connectionId, connections = [], existingFlowId, onGenerated }: Props) {
  const { profile } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState(connectionId ?? '');
  const gen = useGenerateInstagramFlowAI();

  useEffect(() => {
    if (!open) return;
    if (connectionId) {
      setSelectedConnectionId(connectionId);
      return;
    }
    if (connections.length > 0 && !connections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [open, connectionId, connections, selectedConnectionId]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (!existingFlowId && connections.length > 0 && !selectedConnectionId) return;
    setWarnings([]);
    const res = await gen.mutateAsync({
      prompt: prompt.trim(),
      organization_id: profile?.organization_id ?? undefined,
      connection_id: selectedConnectionId || null,
      existing_flow_id: existingFlowId,
    });
    setWarnings(res.warnings ?? []);
    if (res.flow_id) {
      onGenerated(res.flow_id);
      setPrompt('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {existingFlowId ? 'Refinar automação com IA' : 'Criar automação com IA'}
          </DialogTitle>
          <DialogDescription>
            Descreva em linguagem natural o que você quer que aconteça. A IA monta o fluxo completo — gatilhos, mensagens, tags e ramificações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!existingFlowId && connections.length > 0 && (
            <div className="space-y-1.5">
              <Label>Conta do Instagram</Label>
              <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
                <SelectTrigger><SelectValue placeholder="Escolha uma conta" /></SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      @{connection.ig_username ?? connection.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Quem comentar 'quero' no meu post do lançamento recebe DM com o link e ganha a tag 'Lead quente'..."
            autoFocus
          />

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase">Inspirações (clique para usar)</p>
            <div className="space-y-1.5">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(ex)}
                  className="w-full text-left rounded-lg border bg-muted/30 hover:bg-muted p-2.5 text-sm transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" /> Avisos da IA
              </div>
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300">• {w}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || gen.isPending || (!existingFlowId && connections.length > 0 && !selectedConnectionId)}
            className="gap-2"
          >
            {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {existingFlowId ? 'Refinar fluxo' : 'Gerar automação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
