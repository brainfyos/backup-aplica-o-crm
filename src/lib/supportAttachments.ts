import { supabase } from '@/integrations/supabase/client';
import type { PreparedAttachment } from '@/components/admin/support/SupportAttachmentPicker';

export interface SupportAttachmentRow {
  id: string;
  ticket_id: string;
  message_id: string | null;
  organization_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export async function uploadSupportAttachments(params: {
  organizationId: string;
  ticketId: string;
  messageId: string;
  userId: string;
  attachments: PreparedAttachment[];
}): Promise<void> {
  const { organizationId, ticketId, messageId, userId, attachments } = params;
  for (const a of attachments) {
    const ext = a.file.name.includes('.') ? a.file.name.split('.').pop() : 'bin';
    const uuid = crypto.randomUUID();
    const path = `${organizationId}/${ticketId}/${messageId}/${uuid}.${ext}`;
    const up = await supabase.storage
      .from('support-attachments')
      .upload(path, a.file, { contentType: a.file.type, upsert: false });
    if (up.error) throw up.error;
    const { error: insErr } = await supabase.from('support_attachments').insert({
      ticket_id: ticketId,
      message_id: messageId,
      organization_id: organizationId,
      uploaded_by: userId,
      storage_path: path,
      file_name: a.file.name,
      mime_type: a.file.type,
      size_bytes: a.file.size,
    });
    if (insErr) {
      // tenta limpar o arquivo órfão
      await supabase.storage.from('support-attachments').remove([path]);
      throw insErr;
    }
  }
}

export async function fetchAttachmentsByMessages(messageIds: string[]) {
  if (messageIds.length === 0) return [] as SupportAttachmentRow[];
  const { data, error } = await supabase
    .from('support_attachments')
    .select('*')
    .in('message_id', messageIds);
  if (error) throw error;
  return (data ?? []) as SupportAttachmentRow[];
}

export async function getAttachmentSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from('support-attachments')
    .createSignedUrl(storagePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}
