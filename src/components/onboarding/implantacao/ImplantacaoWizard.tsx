import { useMemo, useRef, useState } from 'react';
import {
  Building2, Clock, Package, Bot, Tag, Users, CheckCircle2,
  ChevronLeft, ChevronRight, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import { CompanySettings, type CompanySettingsHandle } from '@/components/admin/company/CompanySettings';
import { BusinessHoursManager, type BusinessHoursHandle } from '@/components/admin/schedules/BusinessHoursManager';
import { NegociosStep, type NegociosStepHandle } from '@/components/onboarding/implantacao/NegociosStep';
import { AgentsManager } from '@/components/admin/agents/AgentsManager';
import { SectorsManager } from '@/components/admin/sectors/SectorsManager';
import { TeamManager } from '@/components/admin/TeamManager';

import { useProducts } from '@/hooks/useProducts';
import { useSectors } from '@/hooks/useSectors';
import { useAllAgents } from '@/hooks/useProductAgents';
import { useTeamMembers } from '@/hooks/useTeam';

interface Props {
  status: string;
  saving: boolean;
  organizationId: string;
  currentStep: number;
  onStepChange: (step: number) => void;
  onSubmit: () => Promise<boolean>;
  onSkip?: () => void;
  skipsRemaining?: number;
}

type StepDef = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Building2;
  render: () => JSX.Element;
  minReady: () => boolean;
};

export function ImplantacaoWizard({
  status, saving, organizationId, currentStep, onStepChange,
  onSubmit, onSkip, skipsRemaining,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const negociosRef = useRef<NegociosStepHandle>(null);
  const companyRef = useRef<CompanySettingsHandle>(null);
  const hoursRef = useRef<BusinessHoursHandle>(null);

  // Sinais mínimos de progresso (lidos do banco via hooks oficiais)
  const { data: products } = useProducts();
  const { data: sectors } = useSectors();
  const { data: agents } = useAllAgents();
  const { data: team } = useTeamMembers(organizationId);

  const isApplied = status === 'applied';

  const steps: StepDef[] = useMemo(() => [
    {
      id: 'empresa',
      title: 'Empresa',
      subtitle: 'Dados cadastrais, logo e endereço da sua empresa.',
      icon: Building2,
      render: () => <CompanySettings ref={companyRef} embedded />,
      minReady: () => true, // CompanySettings valida internamente
    },
    {
      id: 'horarios',
      title: 'Horários',
      subtitle: 'Horário de atendimento e feriados.',
      icon: Clock,
      render: () => <BusinessHoursManager ref={hoursRef} embedded />,
      minReady: () => true,
    },
    {
      id: 'negocios',
      title: 'Negócios',
      subtitle: 'Cadastre seus negócios. Cada negócio terá seu próprio funil, cérebro e agente.',
      icon: Package,
      render: () => <NegociosStep ref={negociosRef} />,
      minReady: () => (products?.length ?? 0) > 0,
    },
    {
      id: 'agentes',
      title: 'Agentes IA',
      subtitle: 'Configure os agentes que atenderão seus leads automaticamente.',
      icon: Bot,
      render: () => <AgentsManager />,
      minReady: () => (agents?.length ?? 0) > 0,
    },
    {
      id: 'setores',
      title: 'Setores',
      subtitle: 'Filas de atendimento (ex.: Vendas, Suporte, Financeiro).',
      icon: Tag,
      render: () => <SectorsManager />,
      minReady: () => (sectors?.length ?? 0) > 0,
    },
    {
      id: 'equipes',
      title: 'Equipe',
      subtitle: 'Convide os membros que vão atender no sistema.',
      icon: Users,
      render: () => <TeamManager />,
      minReady: () => (team?.length ?? 0) > 0,
    },
    {
      id: 'revisao',
      title: 'Revisão',
      subtitle: 'Confira tudo e finalize sua implantação.',
      icon: CheckCircle2,
      render: () => (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Resumo</h3>
            <ul className="space-y-2 text-sm">
              <ReviewLine label="Negócios cadastrados" value={products?.length ?? 0} />
              <ReviewLine label="Agentes IA" value={agents?.length ?? 0} />
              <ReviewLine label="Setores" value={sectors?.length ?? 0} />
              <ReviewLine label="Membros da equipe" value={team?.length ?? 0} />
            </ul>
            <p className="text-xs text-muted-foreground">
              Você pode ajustar qualquer item mais tarde nos menus do painel administrativo.
              Ao concluir, marcamos sua implantação como finalizada.
            </p>
          </Card>
        </div>
      ),
      minReady: () => true,
    },
  ], [products, sectors, agents, team]);

  const step = Math.max(0, Math.min(currentStep, steps.length - 1));
  const StepIcon = steps[step].icon;
  const pct = Math.round(((step + 1) / steps.length) * 100);
  const isLast = step === steps.length - 1;
  const canProceed = steps[step].minReady();

  const [savingStep, setSavingStep] = useState(false);

  const handleSaveAndContinue = async () => {
    const id = steps[step].id;
    if (id === 'negocios' && negociosRef.current?.tryInternalNext()) return;

    setSavingStep(true);
    try {
      if (id === 'empresa') {
        const ok = await companyRef.current?.save();
        if (ok === false) return;
      }
      if (id === 'horarios') {
        const ok = await hoursRef.current?.save();
        if (ok === false) return;
      }
      onStepChange(Math.min(steps.length - 1, step + 1));
    } finally {
      setSavingStep(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const ok = await onSubmit();
    setSubmitting(false);
    if (!ok) return;
  };

  if (isApplied) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4 px-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold">Implantação concluída</h1>
        <p className="text-muted-foreground">
          Suas configurações já estão ativas. Você pode editá-las a qualquer momento pelo painel administrativo.
        </p>
        <Button onClick={() => window.location.href = '/admin'}>Ir para o painel</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 relative">
      {onSkip && (
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition"
          aria-label="Fechar e continuar depois"
          title={typeof skipsRemaining === 'number' ? `Você pode adiar mais ${skipsRemaining} vez(es)` : 'Fechar'}
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <StepIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{steps[step].title}</h1>
            <p className="text-sm text-muted-foreground">{steps[step].subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={pct} className="h-2" />
          <span className="text-xs text-muted-foreground min-w-[60px] text-right">
            Passo {step + 1}/{steps.length}
          </span>
        </div>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = s.minReady() && i < step;
          const active = i === step;
          return (
            <button
              key={s.id}
              onClick={() => onStepChange(i)}
              className={cn(
                'px-3 py-2 rounded-md border text-xs flex items-center gap-2 justify-center transition text-left',
                active && 'border-primary bg-primary/5 text-primary font-medium',
                !active && done && 'border-primary/30 text-primary/80',
                !active && !done && 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo do passo — cada passo é um componente admin oficial */}
      <div className="min-h-[400px]">
        {steps[step].render()}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t sticky bottom-0 bg-background/95 backdrop-blur -mx-4 px-4 py-3">
        <Button
          variant="outline"
          onClick={() => {
            if (steps[step].id === 'negocios' && negociosRef.current?.tryInternalBack()) return;
            onStepChange(Math.max(0, step - 1));
          }}
          disabled={step === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>

        {!isLast ? (
          <div className="flex items-center gap-2">
            {!canProceed && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Cadastre pelo menos 1 item para seguir
              </span>
            )}
            <Button onClick={handleSaveAndContinue} disabled={!canProceed || savingStep}>
              {savingStep && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar e continuar <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting || saving}>
            {(submitting || saving) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Concluir implantação
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: number }) {
  const ok = value > 0;
  return (
    <li className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', ok ? 'text-primary' : 'text-muted-foreground')}>
        {value}
      </span>
    </li>
  );
}
