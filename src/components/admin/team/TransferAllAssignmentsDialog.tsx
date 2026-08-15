import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRightLeft, Loader2, MessageSquare, Clock, CheckCircle2, UserCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMembers, TeamMember } from '@/hooks/useTeam';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromMember: TeamMember | null;
}

interface Counts {
  human_active: number;
  waiting_human: number;
  closed: number;
  leads: number;
}

export function TransferAllAssignmentsDialog({ open, onOpenChange, fromMember }: Props) {
  const [toUserId, setToUserId] = useState('');
  const [reason, setReason] = useState('');
  const { data: teamMembers } = useTeamMembers();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setToUserId('');
      setReason('');
    }
  }, [open]);

  const orgId = fromMember?.organization_id;

  const { data: counts, isLoading: loadingCounts } = useQuery({
    queryKey: ['transfer-preview', fromMember?.id, orgId],
    enabled: !!fromMember && !!orgId && open,
    queryFn: async (): Promise<Counts> => {
      const base = supabase
        .from('webchat_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId!)
        .eq('assigned_user_id', fromMember!.id);
      const [a, w, r, l] = await Promise.all([
        base.eq('status', 'human_active'),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).eq('assigned_user_id', fromMember!.id).eq('status', 'waiting_human'),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).eq('assigned_user_id', fromMember!.id).eq('status', 'closed'),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).eq('assigned_to', fromMember!.id),
      ]);
      return {
        human_active: a.count ?? 0,
        waiting_human: w.count ?? 0,
        closed: r.count ?? 0,
        leads: l.count ?? 0,
      };
    },
  });

  const transfer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('transfer-user-assignments', {
        body: { from_user_id: fromMember!.id, to_user_id: toUserId, reason: reason || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { moved: { conversations_total: number; leads: number } };
    },
    onSuccess: (data) => {
      toast.success(
        `Transferido: ${data.moved.conversations_total} conversa(s) e ${data.moved.leads} lead(s).`
      );
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['transfer-preview'] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Falha ao transferir');
    },
  });

  const available = (teamMembers || []).filter((m) => m.id !== fromMember?.id && m.is_active !== false);

  const handleSubmit = () => {
    if (!toUserId) {
      toast.error('Selecione o destinatário');
      return;
    }
    transfer.mutate();
  };

  const cards = [
    { label: 'Ativas', value: counts?.human_active ?? 0, Icon: MessageSquare, color: 'text-emerald-600' },
    { label: 'Em espera', value: counts?.waiting_human ?? 0, Icon: Clock, color: 'text-amber-600' },
    { label: 'Encerradas', value: counts?.closed ?? 0, Icon: CheckCircle2, color: 'text-blue-600' },
    { label: 'Leads', value: counts?.leads ?? 0, Icon: UserCircle, color: 'text-violet-600' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferir atendimentos
          </DialogTitle>
          <DialogDescription>
            Move todas as conversas (ativas, em espera e resolvidas) e leads atribuídos de{' '}
            <strong>{fromMember?.full_name}</strong> para outro membro do time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2">
            {cards.map(({ label, value, Icon, color }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold">
                  {loadingCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : value}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Transferir para</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o destinatário" />
              </SelectTrigger>
              <SelectContent>
                {available.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={m.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {m.full_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span>{m.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder="Ex.: desligamento, férias, redistribuição..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transfer.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={transfer.isPending || !toUserId}>
            {transfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transferir tudo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
