import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateInstagramFlow, type IGTriggerType } from '@/hooks/useInstagramFlows';
import type { InstagramConnection } from '@/hooks/useInstagramConnections';
import { Instagram, Loader2, Sparkles } from 'lucide-react';
import { InstagramPostPicker } from './InstagramPostPicker';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connections: InstagramConnection[];
  onCreated: (id: string) => void;
}

const triggers: { value: IGTriggerType; label: string; hint: string }[] = [
  { value: 'comment_keyword', label: 'Comentário em publicação', hint: 'Qualquer comentário ou somente palavras escolhidas' },
  { value: 'dm_keyword',      label: 'Palavra-chave no Direct',      hint: 'Escuta somente mensagens privadas no Direct' },
  { value: 'story_reply',     label: 'Resposta ou menção no Story',   hint: 'Alguém responde ou menciona a conta em um Story' },
  { value: 'message_reaction', label: 'Reação a uma mensagem',        hint: 'Alguém reage a uma DM enviada pela conta' },
];

function blk(type: string, data: any) {
  return {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    data,
    position: { x: 0, y: 0 },
    next_block_id: null,
  };
}

function manyChatPreset() {
  const b1 = blk('ig_like_comment', {});
  const b2 = blk('ig_reply_comment', { text: 'Te enviei no direct! 🚀' });
  const b3 = blk('ig_private_reply', {
    text: 'Oi! Aqui está o material que você pediu 👇',
    buttons: [{ type: 'web_url', title: 'Abrir link', url: 'https://seu-link.com' }],
  });
  const chain = [b1, b2, b3].map((b, i, arr) => ({ ...b, next_block_id: arr[i + 1]?.id ?? null }));
  return chain;
}

export function NewInstagramFlowDialog({ open, onOpenChange, connections, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<IGTriggerType>('comment_keyword');
  const [connectionId, setConnectionId] = useState<string>(connections[0]?.id ?? '');
  const [keywords, setKeywords] = useState('');
  const [postIds, setPostIds] = useState<string[]>([]);

  const createFlow = useCreateInstagramFlow();

  useEffect(() => {
    if (!open) return;
    if (connections.length === 0) {
      setConnectionId('');
      return;
    }
    if (!connections.some((connection) => connection.id === connectionId)) {
      setConnectionId(connections[0].id);
    }
  }, [open, connections, connectionId]);

  const buildAndCreate = async (opts: { preset?: 'manychat' } = {}) => {
    if (!name.trim()) return;
    if (connections.length > 0 && !connectionId) return;
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
    const blocks = opts.preset === 'manychat' ? manyChatPreset() : [];
    const flow = await createFlow.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      connection_id: connectionId || null,
      trigger_config: {
        keywords: kws,
        match: 'any',
        post_ids: triggerType === 'comment_keyword' ? postIds : [],
        also_private_reply: triggerType === 'comment_keyword',
        ...(triggerType === 'message_reaction' ? { reaction_action: 'react', emoji: '' } : {}),
      },
      flow_blocks: blocks as any,
      start_block_id: blocks[0]?.id ?? null,
    });
    if (flow?.id) onCreated(flow.id);
    setName(''); setDescription(''); setKeywords(''); setPostIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" /> Nova automação do Instagram
          </DialogTitle>
          <DialogDescription>Escolha um gatilho e vamos criar seu fluxo em segundos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lançamento – palavra-chave no post" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para quê serve esta automação" />
          </div>

          <div className="space-y-1.5">
            <Label>Gatilho</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as IGTriggerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {triggers.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex flex-col">
                      <span>{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(triggerType === 'comment_keyword' || triggerType === 'dm_keyword' || triggerType === 'story_reply') && (
            <div className="space-y-1.5">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="quero, info, link, preço" />
              <p className="text-xs text-muted-foreground">Deixe em branco para disparar em qualquer comentário ou mensagem recebida.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Conta do Instagram</Label>
            {connections.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
                Nenhuma conta conectada ainda. O fluxo será salvo como rascunho e ativa quando você conectar uma conta em Integrações.
              </p>
            ) : (
              <Select
                value={connectionId}
                onValueChange={(value) => {
                  setConnectionId(value);
                  setPostIds([]);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Escolha uma conta" /></SelectTrigger>
                <SelectContent>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.id}>@{c.ig_username ?? c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {triggerType === 'comment_keyword' && connectionId && (
            <div className="space-y-1.5">
              <Label>Publicações que disparam o fluxo</Label>
              <InstagramPostPicker
                connectionId={connectionId}
                selectedIds={postIds}
                onChange={setPostIds}
              />
              <p className="text-xs text-muted-foreground">
                Sem seleção, o fluxo escuta todas as publicações dessa conta.
              </p>
            </div>
          )}

          {triggerType === 'message_reaction' && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Qualquer nova reação</p>
              <p className="mt-1 text-xs text-muted-foreground">
                O fluxo ignora remoções por padrão. Você poderá filtrar o emoji no editor.
              </p>
            </div>
          )}

          {triggerType === 'comment_keyword' && (
            <button
              type="button"
              onClick={() => buildAndCreate({ preset: 'manychat' })}
              disabled={!name.trim() || createFlow.isPending}
              className="w-full text-left rounded-lg border border-pink-500/40 bg-pink-500/5 hover:bg-pink-500/10 p-3 transition-colors disabled:opacity-50"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 text-pink-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Preset: Comentário → DM (estilo ManyChat)</p>
                  <p className="text-xs text-muted-foreground">
                    Cria com 3 blocos seguros: curtir comentário → responder publicamente → Opening DM com botão para o link.
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => buildAndCreate()} disabled={!name.trim() || createFlow.isPending || (connections.length > 0 && !connectionId)}>
            {createFlow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar em branco'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
