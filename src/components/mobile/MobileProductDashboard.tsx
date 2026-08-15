import { Tables } from '@/integrations/supabase/types';
import { SellerHome } from '@/components/seller/home/SellerHome';

type DBProduct = Tables<'products'>;

interface MobileProductDashboardProps {
  product: DBProduct;
  onNavigate: (tab: string, payload?: { conversationId?: string; leadId?: string }) => void;
}

export function MobileProductDashboard({ onNavigate }: MobileProductDashboardProps) {
  return <SellerHome onNavigate={onNavigate} variant="mobile" />;
}
