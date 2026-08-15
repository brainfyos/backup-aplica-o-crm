import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, Facebook, Instagram, Mail, Phone, Globe, Send, QrCode, Link2, Radio } from 'lucide-react';
import type { JourneyTouchpoint } from '@/lib/leadJourney';

interface Props {
  touchpoints?: JourneyTouchpoint[];
  isLoading?: boolean;
  onChannelClick?: (ch: string) => void;
  activeChannel?: string | null;
}

const LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', google: 'Google', tiktok: 'TikTok',
  linkedin: 'LinkedIn', whatsapp: 'WhatsApp', web_chat: 'Widget', widget: 'Widget',
  chatbot: 'ChatBot', form: 'Formulário', quiz: 'Quiz', landing: 'Landing',
  qrcode: 'QR Code', api: 'API', webhook: 'Webhook', manual: 'Manual',
  referral: 'Indicação', organic: 'Orgânico', ig_direct: 'IG Direct',
  messenger: 'Messenger', email: 'Email', phone: 'Telefone',
};

const ICONS: Record<string, any> = {
  whatsapp: MessageSquare, facebook: Facebook, instagram: Instagram,
  email: Mail, phone: Phone, web_chat: Globe, widget: Globe,
  form: Send, qrcode: QrCode, webhook: Link2, ig_direct: Instagram,
  messenger: MessageSquare, api: Link2, referral: Radio, organic: Globe,
};

const TINTS: Record<string, { chip: string; icon: string; bar: string }> = {
  whatsapp:  { chip: 'bg-emerald-500/10', icon: 'text-emerald-500', bar: 'bg-emerald-500' },
  facebook:  { chip: 'bg-blue-500/10',    icon: 'text-blue-500',    bar: 'bg-blue-500' },
  instagram: { chip: 'bg-pink-500/10',    icon: 'text-pink-500',    bar: 'bg-pink-500' },
  ig_direct: { chip: 'bg-pink-500/10',    icon: 'text-pink-500',    bar: 'bg-pink-500' },
  email:     { chip: 'bg-amber-500/10',   icon: 'text-amber-500',   bar: 'bg-amber-500' },
  phone:     { chip: 'bg-violet-500/10',  icon: 'text-violet-500',  bar: 'bg-violet-500' },
  form:      { chip: 'bg-cyan-500/10',    icon: 'text-cyan-500',    bar: 'bg-cyan-500' },
  widget:    { chip: 'bg-cyan-500/10',    icon: 'text-cyan-500',    bar: 'bg-cyan-500' },
  web_chat:  { chip: 'bg-cyan-500/10',    icon: 'text-cyan-500',    bar: 'bg-cyan-500' },
};
const DEFAULT_TINT = { chip: 'bg-muted', icon: 'text-muted-foreground', bar: 'bg-primary' };

export function JourneyTouchpoints({ touchpoints, isLoading, onChannelClick, activeChannel }: Props) {
  const max = Math.max(1, ...(touchpoints?.map(t => t.touches) ?? [1]));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Touchpoints por canal</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Onde seus leads mais interagem.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !touchpoints?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum ponto de contato ainda.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {touchpoints.map((t) => {
              const pct = (t.touches / max) * 100;
              const active = activeChannel === t.channel;
              const Icon = ICONS[t.channel] ?? Radio;
              const tint = TINTS[t.channel] ?? DEFAULT_TINT;
              return (
                <button
                  key={t.channel}
                  onClick={() => onChannelClick?.(t.channel)}
                  className={`group rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
                    active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/70 bg-card hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`h-9 w-9 rounded-xl grid place-items-center ${tint.chip}`}>
                      <Icon className={`h-[18px] w-[18px] ${tint.icon}`} />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t.leads} leads
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    {LABELS[t.channel] ?? t.channel}
                  </div>
                  <div className="text-2xl font-bold tracking-tight mt-1 tabular-nums">
                    {t.touches.toLocaleString('pt-BR')}
                  </div>
                  <div className="h-1.5 w-full bg-muted mt-3 rounded-full overflow-hidden">
                    <div className={`h-full ${tint.bar} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
