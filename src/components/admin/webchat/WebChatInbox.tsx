import { SellerInbox } from '@/components/seller/SellerInbox';

interface Props {
  pendingConversationId?: string | null;
  onConversationSelected?: () => void;
}

export function WebChatInbox({ pendingConversationId, onConversationSelected }: Props) {
  return (
    <SellerInbox
      mode="admin"
      pendingConversationId={pendingConversationId ?? undefined}
      onConversationSelected={onConversationSelected}
    />
  );
}
