import { Globe, MessageCircle, Instagram, Mail, Phone, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type ConvProvider,
  type ConvProviderInput,
  resolveProvider,
  PROVIDER_LABEL,
} from '@/lib/conversationProvider';

interface ChannelBadgeProps {
  /** @deprecated use `provider` ou passe `conversation`. */
  channel?: string;
  /** Provedor já resolvido. Tem prioridade sobre `conversation`/`channel`. */
  provider?: ConvProvider;
  /** Conversa de origem — usada para resolver o provedor automaticamente. */
  conversation?: ConvProviderInput | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

interface ProviderVisual {
  icon: typeof Globe;
  color: string;
  badge?: typeof BadgeCheck;
}

const providerVisual: Record<ConvProvider, ProviderVisual> = {
  webchat: { icon: Globe, color: 'text-blue-500' },
  whatsapp_evolution: { icon: MessageCircle, color: 'text-emerald-500' },
  whatsapp_meta: { icon: MessageCircle, color: 'text-[#0866FF]', badge: BadgeCheck },
  instagram: { icon: Instagram, color: 'text-pink-500' },
  email: { icon: Mail, color: 'text-muted-foreground' },
  sms: { icon: Phone, color: 'text-purple-500' },
  unknown: { icon: Globe, color: 'text-muted-foreground' },
};

export function ChannelBadge({
  channel,
  provider,
  conversation,
  size = 'md',
  showLabel = false,
}: ChannelBadgeProps) {
  const resolved: ConvProvider =
    provider ?? (conversation ? resolveProvider(conversation) : resolveProvider({ channel }));
  const visual = providerVisual[resolved] ?? providerVisual.unknown;
  const Icon = visual.icon;
  const Badge = visual.badge;
  const label = PROVIDER_LABEL[resolved];

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  } as const;

  const badgeSize = {
    sm: 'h-2 w-2 -right-0.5 -bottom-0.5',
    md: 'h-2.5 w-2.5 -right-0.5 -bottom-0.5',
    lg: 'h-3 w-3 -right-0.5 -bottom-0.5',
  } as const;

  const content = (
    <div className={cn('flex items-center gap-1', visual.color)}>
      <span className="relative inline-flex">
        <Icon className={sizeClasses[size]} />
        {Badge && (
          <Badge
            className={cn(
              'absolute fill-background',
              resolved === 'whatsapp_meta' ? 'text-[#0866FF]' : 'text-emerald-600',
              badgeSize[size],
            )}
            strokeWidth={2.5}
          />
        )}
      </span>
      {showLabel && <span className="text-xs font-medium">{label}</span>}
    </div>
  );

  if (showLabel) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
