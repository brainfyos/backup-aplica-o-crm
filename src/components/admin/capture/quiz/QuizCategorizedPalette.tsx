import { memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Type, AlignLeft, Mail, Phone, Hash, Calendar, IdCard,
  CircleDot, ListChecks, ToggleLeft, Gauge, Star, ArrowUpDown,
  Image as ImageIcon, Video, Music, Upload,
  GitBranch, Forward, TrendingUp, Tag as TagIcon,
  Trophy, Flag, ExternalLink, Sparkles,
  User, AtSign, MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FunnelBlockType } from '@/types/funnel';

export interface QuizPaletteItem {
  /** Tipo de bloco real persistido */
  blockType: FunnelBlockType;
  /** Subtipo visual (preset aplicado ao criar) */
  preset?: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

export interface QuizPaletteCategory {
  id: string;
  label: string;
  emoji: string;
  accent: string; // tailwind text color class
  bg: string;     // tailwind bg class
  items: QuizPaletteItem[];
}

export const QUIZ_PALETTE: QuizPaletteCategory[] = [
  {
    id: 'questions',
    label: 'Perguntas',
    emoji: '📝',
    accent: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/10',
    items: [
      { blockType: 'input', preset: 'text', label: 'Texto curto', icon: Type },
      { blockType: 'input', preset: 'textarea', label: 'Texto longo', icon: AlignLeft },
      { blockType: 'input', preset: 'email', label: 'Email', icon: Mail },
      { blockType: 'input', preset: 'phone', label: 'Telefone', icon: Phone },
      { blockType: 'input', preset: 'number', label: 'Número', icon: Hash },
      { blockType: 'input', preset: 'date', label: 'Data', icon: Calendar },
      { blockType: 'input', preset: 'cpf', label: 'CPF/CNPJ', icon: IdCard },
    ],
  },
  {
    id: 'choices',
    label: 'Escolhas',
    emoji: '☑️',
    accent: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    items: [
      { blockType: 'buttons', preset: 'single', label: 'Escolha única', icon: CircleDot },
      { blockType: 'buttons', preset: 'multiple', label: 'Múltipla escolha', icon: ListChecks },
      { blockType: 'buttons', preset: 'yesno', label: 'Sim / Não', icon: ToggleLeft },
      { blockType: 'buttons', preset: 'scale', label: 'Escala 1-10', icon: Gauge },
      { blockType: 'buttons', preset: 'nps', label: 'NPS', icon: Star },
      { blockType: 'buttons', preset: 'ranking', label: 'Ranking', icon: ArrowUpDown },
    ],
  },
  {
    id: 'media',
    label: 'Mídia',
    emoji: '🖼️',
    accent: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500/10',
    items: [
      { blockType: 'image', label: 'Imagem', icon: ImageIcon },
      { blockType: 'video', label: 'Vídeo', icon: Video },
      { blockType: 'message', preset: 'audio', label: 'Áudio', icon: Music },
      { blockType: 'input', preset: 'upload', label: 'Upload', icon: Upload },
    ],
  },
  {
    id: 'logic',
    label: 'Lógica',
    emoji: '🧠',
    accent: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    items: [
      { blockType: 'condition', label: 'Condição', icon: GitBranch, description: 'Se / Então / Senão' },
      { blockType: 'condition', preset: 'goto', label: 'Ir para', icon: Forward, description: 'Pular para outro bloco' },
      { blockType: 'score', label: 'Score', icon: TrendingUp },
      { blockType: 'tag', label: 'Segmentação', icon: TagIcon },
    ],
  },
  {
    id: 'result',
    label: 'Resultado',
    emoji: '🎯',
    accent: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    items: [
      { blockType: 'end', preset: 'result', label: 'Resultado', icon: Trophy, description: 'Score + faixa + métricas' },
      { blockType: 'end', preset: 'result_ai', label: 'Resultado IA', icon: Sparkles, description: 'Diagnóstico personalizado por IA' },
      { blockType: 'end', label: 'Página final', icon: Flag },
      { blockType: 'link', preset: 'redirect', label: 'Redirecionamento', icon: ExternalLink },
    ],
  },
  {
    id: 'lead',
    label: 'Lead',
    emoji: '👤',
    accent: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-500/10',
    items: [
      { blockType: 'input', preset: 'name', label: 'Capturar nome', icon: User },
      { blockType: 'input', preset: 'email', label: 'Capturar email', icon: AtSign },
      { blockType: 'input', preset: 'phone', label: 'Capturar WhatsApp', icon: MessageCircle },
    ],
  },
];

interface Props {
  onAddBlock: (item: QuizPaletteItem) => void;
}

export const QuizCategorizedPalette = memo(function QuizCategorizedPalette({ onAddBlock }: Props) {
  const handleDragStart = (e: React.DragEvent, item: QuizPaletteItem) => {
    e.dataTransfer.setData('quiz-palette-item', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-3 py-3 border-b shrink-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Blocos</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {QUIZ_PALETTE.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className={cn('flex items-center gap-2 px-2 py-1 rounded-md', cat.bg)}>
                <span className="text-sm">{cat.emoji}</span>
                <span className={cn('text-[11px] font-semibold uppercase tracking-wider', cat.accent)}>
                  {cat.label}
                </span>
              </div>
              <div className="space-y-1">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.blockType}-${item.preset ?? 'default'}-${item.label}`}
                      type="button"
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onClick={() => onAddBlock(item)}
                      title={item.description ?? item.label}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-sm text-left',
                        'bg-background hover:bg-accent/40 transition-all border-border/60',
                        'cursor-grab active:cursor-grabbing hover:shadow-sm hover:border-primary/40',
                      )}
                    >
                      <span className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', cat.bg)}>
                        <Icon className={cn('h-3.5 w-3.5', cat.accent)} />
                      </span>
                      <span className="font-medium text-xs text-foreground">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

/** Aplica o preset escolhido sobre um FunnelBlock recém-criado. */
export function applyPresetToBlockData(
  preset: string | undefined,
  data: Record<string, any>,
): Record<string, any> {
  if (!preset) return data;
  const next = { ...data };
  switch (preset) {
    case 'text':     next.input_type = 'text';     next.placeholder = 'Digite sua resposta...'; break;
    case 'textarea': next.input_type = 'textarea'; next.placeholder = 'Escreva aqui...'; break;
    case 'email':    next.input_type = 'email';    next.placeholder = 'seu@email.com'; break;
    case 'phone':    next.input_type = 'phone';    next.placeholder = '(11) 99999-9999'; break;
    case 'number':   next.input_type = 'number';   next.placeholder = '0'; break;
    case 'date':     next.input_type = 'text';     next.placeholder = 'DD/MM/AAAA'; next.quiz_subtype = 'date'; break;
    case 'cpf':      next.input_type = 'cpf';      next.placeholder = '000.000.000-00'; break;
    case 'name':     next.input_type = 'name';     next.variable_name = 'name';     next.placeholder = 'Seu nome'; break;
    case 'upload':   next.input_type = 'text';     next.quiz_subtype = 'upload';    next.placeholder = 'Anexar arquivo (em breve)'; break;
    case 'audio':    next.quiz_subtype = 'audio';  next.content = 'Áudio (cole a URL no painel)'; break;
    case 'single':   next.layout = 'vertical';     next.quiz_subtype = 'single'; break;
    case 'multiple': next.layout = 'vertical';     next.quiz_subtype = 'multiple'; break;
    case 'yesno':
      next.layout = 'horizontal';
      next.quiz_subtype = 'yesno';
      next.options = [
        { id: `opt_${Date.now()}_y`, label: 'Sim', letter: 'A' },
        { id: `opt_${Date.now()}_n`, label: 'Não', letter: 'B' },
      ];
      break;
    case 'scale':
      next.quiz_subtype = 'scale';
      next.layout = 'horizontal';
      next.options = Array.from({ length: 10 }, (_, i) => ({
        id: `opt_${Date.now()}_${i}`, label: String(i + 1), score: i + 1,
      }));
      break;
    case 'nps':
      next.quiz_subtype = 'nps';
      next.layout = 'horizontal';
      next.options = Array.from({ length: 11 }, (_, i) => ({
        id: `opt_${Date.now()}_${i}`, label: String(i), score: i,
      }));
      break;
    case 'ranking':
      next.quiz_subtype = 'ranking';
      next.layout = 'vertical';
      break;
    case 'goto':     next.quiz_subtype = 'goto'; break;
    case 'result':   next.quiz_subtype = 'result'; next.success_message = 'Seu resultado:'; break;
    case 'result_ai':
      next.quiz_subtype = 'result_ai';
      next.result_ai_enabled = true;
      next.success_message = 'Sua análise personalizada';
      next.result_ai_prompt = '';
      break;
    case 'redirect': next.quiz_subtype = 'redirect'; next.link_open_new_tab = false; break;
  }
  return next;
}
