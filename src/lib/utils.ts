import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata telefone BR para exibição.
 * - 5511945676825 → "(11) 94567-6825"
 * - 5562991500894 → "(62) 99150-0894"
 * - 1112345678 → "(11) 1234-5678" (fixo)
 * - números fora do padrão BR → mantém com "+" no início se houver DDI.
 */
export function formatBRPhone(raw?: string | null): string {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "");
  if (!d) return String(raw);

  // Com DDI 55: 12 (fixo) ou 13 (móvel) dígitos
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  // Sem DDI: 10 (fixo) ou 11 (móvel) dígitos
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;

  // Estrangeiro / fora do padrão
  return `+${d}`;
}

