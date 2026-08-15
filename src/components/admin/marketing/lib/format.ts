const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR');

export const fmtBRL = (n: number | null | undefined) => BRL.format(Number(n || 0));
export const fmtInt = (n: number | null | undefined) => NUM.format(Math.round(Number(n || 0)));
export const fmtPct = (n: number | null | undefined) => (n == null || !isFinite(n as number) ? '—' : `${(Number(n) * 100).toFixed(2)}%`);
export const fmtPct100 = (n: number | null | undefined) => (n == null || !isFinite(n as number) ? '—' : `${Number(n).toFixed(2)}%`);
export const fmtRoas = (n: number | null | undefined) => (n == null || !isFinite(n as number) || Number(n) === 0 ? '—' : `${Number(n).toFixed(2)}×`);
export const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
