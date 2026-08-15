import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by: string;
  subject: string;
  category: string | null;
  status: SupportStatus;
  priority: SupportPriority;
  assigned_super_admin: string | null;
  last_message_at: string;
  last_message_by_role: string;
  unread_for_admin: boolean;
  unread_for_super_admin: boolean;
  created_at: string;
  updated_at: string;
  organization?: { name: string } | null;
  creator?: { full_name: string | null; email: string } | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: 'admin' | 'super_admin';
  content: string;
  created_at: string;
  author?: { full_name: string | null; email: string } | null;
  attachments?: import('@/lib/supportAttachments').SupportAttachmentRow[];
}


export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export function useSupportTickets(scope: 'admin' | 'super_admin' = 'admin') {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['support-tickets', scope, profile?.organization_id],
    queryFn: async (): Promise<SupportTicket[]> => {
      let q = supabase
        .from('support_tickets')
        .select('*, organization:organizations(name)')
        .order('last_message_at', { ascending: false });
      if (scope === 'admin' && profile?.organization_id) {
        q = q.eq('organization_id', profile.organization_id);
      }
      const { data, error } = await q;
      if (error) throw error;
      const tickets = (data ?? []) as any[];
      const creatorIds = Array.from(new Set(tickets.map((t) => t.created_by).filter(Boolean)));
      if (creatorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        tickets.forEach((t) => {
          const p: any = map.get(t.created_by);
          t.creator = p ? { full_name: p.full_name, email: p.email } : null;
        });
      }
      return tickets as any;
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`support-tickets-${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        qc.invalidateQueries({ queryKey: ['support-tickets'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [scope, qc]);

  return query;
}

export function useSupportUnreadCount(scope: 'admin' | 'super_admin') {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['support-unread', scope, profile?.organization_id],
    queryFn: async () => {
      let q = supabase.from('support_tickets').select('id', { count: 'exact', head: true });
      if (scope === 'super_admin') {
        q = q.eq('unread_for_super_admin', true);
      } else if (profile?.organization_id) {
        q = q.eq('organization_id', profile.organization_id).eq('unread_for_admin', true);
      }
      const { count } = await q;
      return count ?? 0;
    },
    refetchInterval: 120000,
  });
}

export function useSupportMessages(ticketId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['support-messages', ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at');
      if (error) throw error;
      const msgs = (data ?? []) as any[];
      const authorIds = Array.from(new Set(msgs.map((m) => m.author_id).filter(Boolean)));
      if (authorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', authorIds);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        msgs.forEach((m) => {
          const p: any = map.get(m.author_id);
          m.author = p ? { full_name: p.full_name, email: p.email } : null;
        });
      }
      // Anexos por mensagem
      const msgIds = msgs.map((m) => m.id);
      if (msgIds.length > 0) {
        const { fetchAttachmentsByMessages } = await import('@/lib/supportAttachments');
        const atts = await fetchAttachmentsByMessages(msgIds);
        const byMsg = new Map<string, any[]>();
        atts.forEach((a) => {
          const arr = byMsg.get(a.message_id!) ?? [];
          arr.push(a);
          byMsg.set(a.message_id!, arr);
        });
        msgs.forEach((m) => { m.attachments = byMsg.get(m.id) ?? []; });
      }
      return msgs as any;
    },
  });


  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`support-messages-${ticketId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` }, () => {
        qc.invalidateQueries({ queryKey: ['support-messages', ticketId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, qc]);

  return query;
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      subject: string;
      category?: string;
      priority?: SupportPriority;
      firstMessage: string;
      attachments?: import('@/components/admin/support/SupportAttachmentPicker').PreparedAttachment[];
    }) => {
      if (!profile?.organization_id || !user) throw new Error('Sem usuário');
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({
          organization_id: profile.organization_id,
          created_by: user.id,
          subject: input.subject,
          category: input.category ?? null,
          priority: input.priority ?? 'normal',
          status: 'open',
        })
        .select()
        .single();
      if (error) throw error;
      const { data: msg, error: msgErr } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticket.id,
          author_id: user.id,
          author_role: 'admin',
          content: input.firstMessage,
        })
        .select()
        .single();
      if (msgErr) throw msgErr;
      if (input.attachments && input.attachments.length > 0) {
        const { uploadSupportAttachments } = await import('@/lib/supportAttachments');
        await uploadSupportAttachments({
          organizationId: profile.organization_id,
          ticketId: ticket.id,
          messageId: msg.id,
          userId: user.id,
          attachments: input.attachments,
        });
      }
      return ticket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Chamado aberto' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useSendTicketMessage() {
  const qc = useQueryClient();
  const { user, isSuperAdmin, profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      ticketId,
      content,
      organizationId,
      attachments,
    }: {
      ticketId: string;
      content: string;
      organizationId?: string;
      attachments?: import('@/components/admin/support/SupportAttachmentPicker').PreparedAttachment[];
    }) => {
      if (!user) throw new Error('Sem usuário');
      const role: 'admin' | 'super_admin' = isSuperAdmin() ? 'super_admin' : 'admin';
      const { data: msg, error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          author_role: role,
          content,
        })
        .select()
        .single();
      if (error) throw error;
      if (attachments && attachments.length > 0) {
        const orgId = organizationId ?? profile?.organization_id;
        if (!orgId) throw new Error('Sem organização do chamado');
        const { uploadSupportAttachments } = await import('@/lib/supportAttachments');
        await uploadSupportAttachments({
          organizationId: orgId,
          ticketId,
          messageId: msg.id,
          userId: user.id,
          attachments,
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['support-messages', vars.ticketId] });
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' }),
  });
}


export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SupportTicket> & { id: string }) => {
      const { error } = await supabase.from('support_tickets').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

export function useMarkTicketRead() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const updates = isSuperAdmin()
        ? { unread_for_super_admin: false }
        : { unread_for_admin: false };
      const { error } = await supabase.from('support_tickets').update(updates).eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      qc.invalidateQueries({ queryKey: ['support-unread'] });
    },
  });
}
