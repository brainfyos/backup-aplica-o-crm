import type { FunnelBlockData } from '@/types/funnel';

export type DisplayRule = NonNullable<NonNullable<FunnelBlockData['block_display']>['rules']>[number];

/**
 * Avalia se um bloco deve ser exibido conforme suas regras de display.
 * - `device`: filtra por mobile/desktop.
 * - `rules`: combinação AND/OR de comparações sobre `responses`.
 */
export function evaluateDisplay(
  display: FunnelBlockData['block_display'] | undefined,
  ctx: { responses: Record<string, string>; isMobile: boolean },
): boolean {
  if (!display) return true;

  if (display.device === 'mobile' && !ctx.isMobile) return false;
  if (display.device === 'desktop' && ctx.isMobile) return false;

  const rules = display.rules || [];
  if (rules.length === 0) return true;

  const evalOne = (r: DisplayRule): boolean => {
    const left = String(ctx.responses[r.source] ?? '').trim().toLowerCase();
    const rightRaw = r.value;
    const right = Array.isArray(rightRaw)
      ? rightRaw.map((v) => String(v).trim().toLowerCase())
      : String(rightRaw ?? '').trim().toLowerCase();
    const ln = Number(left);
    const rn = Number(right as string);
    switch (r.operator) {
      case 'eq': return left === right;
      case 'neq': return left !== right;
      case 'contains': return Array.isArray(right) ? false : left.includes(right);
      case 'gt': return !isNaN(ln) && !isNaN(rn) && ln > rn;
      case 'lt': return !isNaN(ln) && !isNaN(rn) && ln < rn;
      case 'in': return Array.isArray(right) ? right.includes(left) : false;
      default: return true;
    }
  };

  // Reduz com combinador (default AND)
  let acc = evalOne(rules[0]);
  for (let i = 1; i < rules.length; i++) {
    const r = rules[i];
    const v = evalOne(r);
    acc = r.combinator === 'or' ? acc || v : acc && v;
  }
  return acc;
}
