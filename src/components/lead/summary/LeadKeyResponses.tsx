import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  onSeeAll?: () => void;
}

const HIDDEN_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'referrer', 'page', 'user_agent', 'ip',
]);

// Keys já exibidas no header do lead — não repetir aqui
const HEADER_KEYWORDS = ['nome', 'name', 'email', 'e-mail', 'whatsapp', 'telefone', 'phone', 'celular'];

const INITIAL_LIMIT = 12;

function isHeaderField(label: string) {
  const l = label.toLowerCase();
  return HEADER_KEYWORDS.some((k) => l.includes(k));
}

function formatLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface SelectedOption {
  block_label?: string;
  option_label?: string;
  option_value?: string;
}

/**
 * Constrói mapa de tradução { block_label -> { option_value -> option_label } }
 * a partir de metadata.form_selected_options
 */
function buildOptionLabelMap(selectedOptions: SelectedOption[] | undefined): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  if (!Array.isArray(selectedOptions)) return map;
  for (const opt of selectedOptions) {
    if (!opt?.block_label || !opt?.option_value || !opt?.option_label) continue;
    if (!map.has(opt.block_label)) map.set(opt.block_label, new Map());
    map.get(opt.block_label)!.set(String(opt.option_value), opt.option_label);
  }
  return map;
}

function translateValue(label: string, value: unknown, optionMap: Map<string, Map<string, string>>): unknown {
  const blockMap = optionMap.get(label);
  if (!blockMap) return value;
  if (Array.isArray(value)) {
    return value.map((v) => blockMap.get(String(v)) ?? v);
  }
  return blockMap.get(String(value)) ?? value;
}

export function LeadKeyResponses({ metadata, onSeeAll: _onSeeAll }: Props) {
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => {
    const responses = (metadata?.form_responses || metadata?.responses) as Record<string, unknown> | undefined;
    if (!responses) return [];

    const optionMap = buildOptionLabelMap(metadata?.form_selected_options);

    // 1. Filtrar vazios, tracking e campos já no header
    const entries = Object.entries(responses).filter(([k, v]) => {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return false;
      const kl = k.toLowerCase();
      if (HIDDEN_KEYS.has(kl)) return false;
      if (isHeaderField(k)) return false;
      return true;
    });

    // 2. Traduzir option_value → option_label
    const translated = entries.map(([k, v]) => [k, translateValue(k, v, optionMap)] as const);

    // 3. Dedup por valor normalizado — mantém label mais descritivo (mais longo)
    const byValue = new Map<string, { key: string; value: unknown }>();
    for (const [k, v] of translated) {
      const valueKey = JSON.stringify(v).toLowerCase();
      const existing = byValue.get(valueKey);
      if (!existing || k.length > existing.key.length) {
        byValue.set(valueKey, { key: k, value: v });
      }
    }

    return Array.from(byValue.values());
  }, [metadata]);

  if (items.length === 0) return null;

  const total = items.length;
  const visible = expanded ? items : items.slice(0, INITIAL_LIMIT);
  const hasMore = total > INITIAL_LIMIT;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Respostas do formulário
          <Badge variant="outline" className="ml-1 text-[10px] font-normal">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {visible.map(({ key, value }) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-muted-foreground break-words">{formatLabel(key)}</dt>
              <dd className="font-medium break-words mt-0.5" title={formatValue(value)}>
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
        {hasMore && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>Mostrar menos <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>Mostrar todas ({total}) <ChevronDown className="h-3 w-3" /></>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
