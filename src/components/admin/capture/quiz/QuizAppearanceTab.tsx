import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, Loader2, ListChecks, Smartphone, Monitor, Sparkles } from 'lucide-react';
import { Funnel, FunnelAppearance, defaultChannelAppearance, defaultFunnelAppearance } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { AppearanceForm } from '../appearance/AppearanceForm';
import { AppearanceLivePreview } from '../appearance/AppearanceLivePreview';
import { PresetGallery } from '../appearance/PresetGallery';
import { applyPresetToChannel, AppearancePreset, getPresetById } from '@/lib/funnelAppearancePresets';
import { toast } from 'sonner';

interface Props { funnel: Funnel; }

export function QuizAppearanceTab({ funnel }: Props) {
  const initial = useMemo<FunnelAppearance>(
    () => funnel.appearance || defaultFunnelAppearance(),
    [funnel.id] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [appearance, setAppearance] = useState<FunnelAppearance>(initial);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const update = useUpdateFunnel();

  const isDirty = JSON.stringify(appearance.quiz) !== JSON.stringify(initial.quiz);

  useEffect(() => { setAppearance(initial); }, [initial]);

  const handleSave = async () => {
    await update.mutateAsync({ id: funnel.id, appearance } as any);
    toast.success('Aparência do Quiz salva');
  };

  const handleReset = () => {
    setAppearance({ ...appearance, quiz: defaultChannelAppearance('quiz') });
    toast.info('Aparência restaurada ao padrão');
  };

  const handleApplyPreset = (preset: AppearancePreset) => {
    setAppearance({
      ...appearance,
      quiz: applyPresetToChannel(appearance.quiz, preset, 'quiz'),
    });
    toast.success(`Tema "${preset.name}" aplicado`);
  };

  const applyInleadDefault = () => {
    const preset = getPresetById('inlead');
    if (!preset) return;
    setAppearance({ ...appearance, quiz: applyPresetToChannel(appearance.quiz, preset, 'quiz') });
    toast.success('Padrão inlead aplicado');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            Aparência exclusiva do Quiz
          </div>
          <span className="text-[11px] text-muted-foreground">
            Tipografia, cores e espaçamentos seguem o padrão inlead — sem avatar de bot.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={applyInleadDefault} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Padrão inlead</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restaurar</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || update.isPending} className="gap-1.5">
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 pt-4 min-h-0 flex flex-col lg:flex-row lg:gap-4">
        <div className="order-2 lg:order-1 flex-1 min-w-0 min-h-0 lg:h-full lg:overflow-y-auto lg:pr-2 space-y-4">
          <PresetGallery channel="quiz" onApply={(preset) => handleApplyPreset(preset)} />
          <AppearanceForm
            channel="quiz"
            appearance={appearance.quiz}
            onChange={(next) => setAppearance({ ...appearance, quiz: next })}
          />
        </div>

        <div className="order-1 lg:order-2 lg:w-[440px] lg:shrink-0 lg:h-full">
          <div className="bg-muted/30 rounded-lg p-3 sm:p-4 flex flex-col gap-3 lg:h-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pré-visualização ao vivo
              </p>
              <div className="flex gap-1 bg-background border rounded-md p-0.5 shrink-0">
                <button type="button" onClick={() => setDevice('mobile')}
                  className={`p-1.5 rounded ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Mobile">
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setDevice('desktop')}
                  className={`p-1.5 rounded ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  title="Desktop">
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <AppearanceLivePreview channel="quiz" appearance={appearance.quiz} device={device} />
            </div>

            {appearance.quiz.custom_css && (
              <style dangerouslySetInnerHTML={{ __html: appearance.quiz.custom_css || '' }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
