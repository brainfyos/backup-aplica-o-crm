import { Tables } from '@/integrations/supabase/types';
import { SellerHome } from '@/components/seller/home/SellerHome';

type DBProduct = Tables<'products'>;

interface ProductDashboardProps {
  product: DBProduct;
  onNavigate: (tab: string, payload?: { conversationId?: string; leadId?: string }) => void;
}

export function ProductDashboard({ onNavigate }: ProductDashboardProps) {
  return <SellerHome onNavigate={onNavigate} variant="desktop" />;
}
