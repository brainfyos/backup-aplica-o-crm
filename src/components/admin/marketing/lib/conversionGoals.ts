import type { ConversionDefinition } from '@/hooks/useConversionDefinitions';

export type ConversionGoal = {
  key: string;
  label: string;
  recommended: ConversionDefinition;
  definitions: ConversionDefinition[];
  count30d: number;
  value30d: number;
};

export function normalizeConversionName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function conversionGoalLabel(name: string): string {
  const normalized = normalizeConversionName(name);
  if (normalized === 'lead vendus' || normalized === 'vendus lead') return 'Cadastro no webinar';
  if (normalized === 'purchase' || normalized === 'compras') return 'Purchase da Meta (não verificado)';
  return name;
}

function recommendationScore(c: ConversionDefinition): number {
  const category = (c.category ?? '').toUpperCase();
  return (c.kind === 'custom' ? 10_000 : 0)
    + (category === 'LEAD' ? 100_000 : 0)
    + (c.pixel_id ? 1_000 : 0)
    + Math.min(Number(c.count_30d) || 0, 999)
    + (c.is_primary ? 10 : 0);
}

export function groupConversionGoals(conversions: ConversionDefinition[]): ConversionGoal[] {
  const groups = new Map<string, ConversionDefinition[]>();
  for (const conversion of conversions) {
    const key = normalizeConversionName(conversion.name) || conversion.external_id;
    groups.set(key, [...(groups.get(key) ?? []), conversion]);
  }
  return [...groups.entries()].map(([key, definitions]) => {
    const sorted = [...definitions].sort((a, b) => recommendationScore(b) - recommendationScore(a));
    const recommended = sorted[0];
    return {
      key,
      label: conversionGoalLabel(recommended.name),
      recommended,
      definitions: sorted,
      count30d: Number(recommended.count_30d) || 0,
      value30d: Number(recommended.value_30d) || 0,
    };
  }).sort((a, b) => {
    if (a.label === 'Cadastro no webinar') return -1;
    if (b.label === 'Cadastro no webinar') return 1;
    return b.count30d - a.count30d;
  });
}

export function resolveSelectedConversion(conversions: ConversionDefinition[], selectedExternalId: string | null): ConversionDefinition | null {
  if (!conversions.length) return null;
  const goals = groupConversionGoals(conversions);
  const selected = conversions.find((c) => c.external_id === selectedExternalId) ?? conversions.find((c) => c.is_primary);
  if (selected) {
    const key = normalizeConversionName(selected.name) || selected.external_id;
    if (key === 'lead' || key === 'leads') {
      const webinarGoal = goals.find((goal) => goal.label === 'Cadastro no webinar');
      if (webinarGoal) return webinarGoal.recommended;
    }
    return goals.find((goal) => goal.key === key)?.recommended ?? selected;
  }
  return goals[0]?.recommended ?? conversions[0];
}
