// Telas finais por desfecho — Etapa 2.
// Renderiza um "último frame" desenhado para cada tipo de resultado da ligação,
// usando o contexto real capturado durante a chamada (slot, proposta, setor).
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  CalendarCheck,
  FileText,
  UserCheck,
  Users,
  XCircle,
  HelpCircle,
  ExternalLink,
  Copy,
  CalendarPlus,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export type OutcomeKind =
  | 'agendou_reuniao'
  | 'recebeu_proposta'
  | 'lead_qualificado'
  | 'transferiu_humano'
  | 'recusou'
  | 'sem_desfecho';

export interface OutcomeContext {
  agendamento?: { start: string; end?: string; link?: string | null } | null;
  proposta?: { label: string; url: string } | null;
  transferencia?: { setor?: string | null } | null;
  leadName?: string | null;
  agentName?: string;
  durationSec?: number;
}

export function OutcomeScreen({
  kind,
  label,
  context,
  onClose,
  onNewCall,
}: {
  kind: OutcomeKind | string;
  label?: string | null;
  context: OutcomeContext;
  onClose: () => void;
  onNewCall?: () => void;
}) {
  const cfg = CONFIG[kind as OutcomeKind] || CONFIG.sem_desfecho;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="px-6 py-8 space-y-5"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 180 }}
          className={`h-20 w-20 rounded-full flex items-center justify-center ${cfg.iconBg}`}
        >
          <Icon className={`h-10 w-10 ${cfg.iconColor}`} strokeWidth={1.8} />
        </motion.div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {cfg.eyebrow}
          </div>
          <div className="text-2xl font-semibold leading-tight">
            {label || cfg.title}
          </div>
          <div className="text-sm text-muted-foreground max-w-xs mx-auto">
            {cfg.subtitle(context)}
          </div>
        </div>
        {context.durationSec ? (
          <div className="text-[11px] text-muted-foreground">
            Ligação de {formatDuration(context.durationSec)}
            {context.agentName ? ` com ${context.agentName}` : ''}
          </div>
        ) : null}
      </div>

      {/* Bloco contextual */}
      <div>{cfg.detail(context)}</div>

      {/* CTAs */}
      <div className="flex flex-col gap-2 pt-1">
        {cfg.primaryCta(context)}
        <div className="flex gap-2">
          {onNewCall && (
            <Button variant="outline" className="flex-1" onClick={onNewCall}>
              Nova ligação
            </Button>
          )}
          <Button
            variant={onNewCall ? 'ghost' : 'outline'}
            className="flex-1"
            onClick={onClose}
          >
            Fechar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function copyToClipboard(text: string, msg = 'Copiado') {
  navigator.clipboard.writeText(text).then(
    () => toast.success(msg),
    () => toast.error('Não foi possível copiar'),
  );
}

function buildGoogleCalendarUrl(start: string, end?: string, title = 'Reunião') {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date(s.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(s)}/${fmt(e)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

interface OutcomeCfg {
  eyebrow: string;
  title: string;
  icon: typeof CalendarCheck;
  iconBg: string;
  iconColor: string;
  subtitle: (c: OutcomeContext) => string;
  detail: (c: OutcomeContext) => JSX.Element | null;
  primaryCta: (c: OutcomeContext) => JSX.Element | null;
}

const CONFIG: Record<OutcomeKind, OutcomeCfg> = {
  agendou_reuniao: {
    eyebrow: 'Reunião confirmada',
    title: 'Agendamento realizado',
    icon: CalendarCheck,
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    subtitle: (c) =>
      c.leadName
        ? `${c.leadName}, sua reunião ficou marcada. Enviamos os detalhes no seu WhatsApp.`
        : 'Reunião marcada. Enviamos os detalhes no WhatsApp.',
    detail: (c) => {
      if (!c.agendamento) return null;
      const d = new Date(c.agendamento.start);
      return (
        <div className="rounded-xl border bg-card/70 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CalendarCheck className="h-5 w-5 text-emerald-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium capitalize">
                {format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </div>
              <div className="text-xs text-muted-foreground">
                às {format(d, 'HH:mm')}
                {c.agendamento.end
                  ? ` — ${format(new Date(c.agendamento.end), 'HH:mm')}`
                  : ''}
              </div>
            </div>
          </div>
          {c.agendamento.link && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(c.agendamento!.link!, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir link da reunião
            </Button>
          )}
        </div>
      );
    },
    primaryCta: (c) =>
      c.agendamento ? (
        <Button
          className="w-full"
          onClick={() =>
            window.open(
              buildGoogleCalendarUrl(c.agendamento!.start, c.agendamento!.end),
              '_blank',
              'noopener,noreferrer',
            )
          }
        >
          <CalendarPlus className="h-4 w-4 mr-2" /> Adicionar ao meu calendário
        </Button>
      ) : null,
  },

  recebeu_proposta: {
    eyebrow: 'Proposta enviada',
    title: 'Sua proposta está pronta',
    icon: FileText,
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
    subtitle: () => 'Você pode abrir agora ou revisar depois com calma.',
    detail: (c) =>
      c.proposta ? (
        <div className="rounded-xl border bg-card/70 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.proposta.label}</div>
              <div className="text-xs text-muted-foreground truncate">{c.proposta.url}</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => copyToClipboard(c.proposta!.url, 'Link da proposta copiado')}
          >
            <Copy className="h-3.5 w-3.5 mr-2" /> Copiar link
          </Button>
        </div>
      ) : null,
    primaryCta: (c) =>
      c.proposta ? (
        <Button
          className="w-full"
          onClick={() => window.open(c.proposta!.url, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-4 w-4 mr-2" /> Abrir proposta
        </Button>
      ) : null,
  },

  lead_qualificado: {
    eyebrow: 'Perfil confirmado',
    title: 'Perfil qualificado',
    icon: Sparkles,
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-500',
    subtitle: () =>
      'Um especialista humano vai te chamar em instantes pra dar o próximo passo.',
    detail: () => (
      <div className="rounded-xl border bg-card/70 p-4 flex items-start gap-3">
        <UserCheck className="h-5 w-5 text-violet-500 mt-0.5" />
        <div className="text-xs text-muted-foreground">
          Enquanto isso, você pode ficar de olho no WhatsApp — vamos usar esse canal
          pra dar continuidade.
        </div>
      </div>
    ),
    primaryCta: () => null,
  },

  transferiu_humano: {
    eyebrow: 'Transferindo',
    title: 'Passando para um humano',
    icon: Users,
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    subtitle: (c) =>
      c.transferencia?.setor
        ? `Você foi encaminhado para o time de ${c.transferencia.setor}. Já sinalizamos que é urgente.`
        : 'Você foi encaminhado para um atendente. Já sinalizamos que é urgente.',
    detail: () => (
      <div className="rounded-xl border bg-card/70 p-4 flex items-start gap-3">
        <Users className="h-5 w-5 text-amber-500 mt-0.5" />
        <div className="text-xs text-muted-foreground">
          Aguarda um instante que a gente te chama por aqui e também pelo WhatsApp.
        </div>
      </div>
    ),
    primaryCta: () => null,
  },

  recusou: {
    eyebrow: 'Sem interesse agora',
    title: 'Obrigado pelo tempo',
    icon: XCircle,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    subtitle: () =>
      'Se mudar de ideia, é só voltar aqui — vamos manter contato leve pelo WhatsApp.',
    detail: () => null,
    primaryCta: () => null,
  },

  sem_desfecho: {
    eyebrow: 'Ligação encerrada',
    title: 'Sem desfecho registrado',
    icon: HelpCircle,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    subtitle: () =>
      'A conversa terminou antes de fechar um próximo passo. Você pode tentar de novo quando quiser.',
    detail: () => null,
    primaryCta: () => null,
  },
};
