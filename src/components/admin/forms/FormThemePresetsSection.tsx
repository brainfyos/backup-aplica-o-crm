import { useState } from 'react';
import { ChevronDown, Sparkles, Check } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FORM_THEME_PRESETS, type FormThemePreset, type FormThemeCategory } from './formThemePresets';
import type { FormTheme } from '@/types/forms';

interface Props {
  currentTheme: FormTheme;
  onApply: (patch: Partial<FormTheme>) => void;
}

const TABS: { value: 'all' | FormThemeCategory; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'messaging', label: 'Mensageria' },
  { value: 'social', label: 'Redes sociais' },
  { value: 'generic', label: 'Genéricos' },
];

export function FormThemePresetsSection({ currentTheme, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | FormThemeCategory>('all');

  const filtered =
    tab === 'all' ? FORM_THEME_PRESETS : FORM_THEME_PRESETS.filter((p) => p.category === tab);

  const handleApply = (preset: FormThemePreset) => {
    onApply(preset.theme);
    toast.success(`Tema "${preset.name}" aplicado`);
  };

  const isActive = (preset: FormThemePreset) =>
    preset.theme.primary_color?.toLowerCase() === currentTheme.primary_color?.toLowerCase() &&
    preset.theme.background_color?.toLowerCase() === currentTheme.background_color?.toLowerCase();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Temas prontos</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {FORM_THEME_PRESETS.length}
          </Badge>
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full grid grid-cols-4 h-8">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-[11px] px-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((preset) => (
                <ThemeCard
                  key={preset.id}
                  preset={preset}
                  active={isActive(preset)}
                  onClick={() => handleApply(preset)}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThemeCard({
  preset,
  active,
  onClick,
}: {
  preset: FormThemePreset;
  active: boolean;
  onClick: () => void;
}) {
  const bg = preset.theme.background_color || '#FFFFFF';
  const primary = preset.theme.primary_color || '#3B82F6';
  const text = preset.theme.text_color || '#0F172A';
  const isDark = isColorDark(bg);
  const bubbleBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative text-left rounded-lg border overflow-hidden transition-all hover:shadow-md hover:border-primary/50',
        active && 'ring-2 ring-primary border-primary'
      )}
    >
      {active && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Check className="w-3 h-3" />
        </div>
      )}
      {/* Miniatura */}
      <div className="aspect-[4/3] relative" style={{ backgroundColor: bg }}>
        {/* Header bar */}
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{ backgroundColor: primary }}
        />
        {/* Avatar/bolha */}
        <div className="absolute top-4 left-3 right-10 h-2.5 rounded-full" style={{ backgroundColor: bubbleBg }} />
        <div className="absolute top-9 left-3 w-16 h-2 rounded-full" style={{ backgroundColor: bubbleBg }} />
        {/* Botão simulando a primária */}
        <div
          className="absolute bottom-3 right-3 h-5 w-10 rounded-md"
          style={{ backgroundColor: primary }}
        />
      </div>
      {/* Info */}
      <div className="px-2 py-1.5 bg-card border-t">
        <div className="text-xs font-semibold truncate" style={{ color: undefined }}>
          {preset.name}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{preset.description}</div>
      </div>
    </button>
  );
}

function isColorDark(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
