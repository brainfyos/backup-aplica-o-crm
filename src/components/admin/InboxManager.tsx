import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WebChatInbox } from './webchat/WebChatInbox';
import { WebChatReportsTab } from './webchat/WebChatReportsTab';
import { AttendancePanel } from './webchat/AttendancePanel';
import { RadarPanel } from './radar/RadarPanel';
import { useMyPermissions } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';

type SubSection = 'chat' | 'panel' | 'radar' | 'reports';

interface InboxManagerProps {
  section?: SubSection;
}

const PENDING_KEY = 'inbox:pendingConversationId';

export function InboxManager({ section = 'chat' }: InboxManagerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
  });
  const { data: perms } = useMyPermissions();
  const { isAdmin, isSuperAdmin } = useAuth();

  const adminLike = (isAdmin?.() ?? false) || (isSuperAdmin?.() ?? false);
  const canSeePanel =
    adminLike ||
    !!perms?.allow_inbox_panel ||
    !!perms?.view_other_users_conversations ||
    !!perms?.view_other_queues_conversations;

  // Limpa o pending quando o chat consome o id
  useEffect(() => {
    if (section === 'chat' && !pendingConversationId) {
      try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    }
  }, [section, pendingConversationId]);

  const handleOpenConversation = (id: string) => {
    try { sessionStorage.setItem(PENDING_KEY, id); } catch {}
    setPendingConversationId(id);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'inbox-chat');
    setSearchParams(next, { replace: true });
  };


  switch (section) {
    case 'chat':
      return (
        <WebChatInbox
          pendingConversationId={pendingConversationId}
          onConversationSelected={() => setPendingConversationId(null)}
        />
      );
    case 'panel':
      return canSeePanel ? <AttendancePanel onOpenConversation={handleOpenConversation} /> : null;
    case 'radar':
      return adminLike ? <RadarPanel onOpenConversation={handleOpenConversation} /> : null;
    case 'reports':
      return <WebChatReportsTab />;
    default:
      return null;
  }
}
