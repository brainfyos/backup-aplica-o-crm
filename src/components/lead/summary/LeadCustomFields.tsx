import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCustomFields, type CustomField } from '@/hooks/useCustomFields';

interface Props {
  metadata: any;
}

function formatLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function tryFormatDate(v: any): string | null {
  if (typeof v !== 'string') return null;
  const d = parseISO(v);
  if (!isValid(d)) return null;
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

function renderValue(value: any, type?: CustomField['field_type']) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;

  switch (type) {
    case 'number': {
      const n = Number(value);
      return <span className="font-medium">{isNaN(n) ? String(value) : n.toLocaleString('pt-BR')}</span>;
    }
    case 'date': {
      const f = tryFormatDate(value);
      return <span className="font-medium">{f ?? String(value)}</span>;
    }
    case 'boolean':
      return <span className="font-medium">{value ? 'Sim' : 'Não'}</span>;
    case 'select':
      return <Badge variant="secondary" className="text-xs">{String(value)}</Badge>;
    default: {
      // text / unknown — try date auto-detect, then objects/arrays
      const asDate = tryFormatDate(value);
      if (asDate) return <span className="font-medium">{asDate}</span>;
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">—</span>;
        // array of objects → list message-like fields
        return (
          <ul className="list-disc list-inside space-y-0.5">
            {value.slice(0, 5).map((item, i) => (
              <li key={i} className="text-sm truncate">
                {typeof item === 'object' ? (item?.mensagem || item?.message || item?.text || JSON.stringify(item)) : String(item)}
              </li>
            ))}
            {value.length > 5 && <li className="text-xs text-muted-foreground">+{value.length - 5} mais</li>}
          </ul>
        );
      }
      if (typeof value === 'object') {
        return <span className="font-mono text-xs break-all">{JSON.stringify(value)}</span>;
      }
      return <span className="font-medium break-words">{String(value)}</span>;
    }
  }
}

export function LeadCustomFields({ metadata }: Props) {
  const { fields } = useCustomFields();

  const values = (metadata?.custom_fields || {}) as Record<string, any>;

  const items = useMemo(() => {
    const entries = Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return [];

    const fieldByKey = new Map(fields.map((f) => [f.field_key, f]));

    return entries
      .map(([key, value]) => ({
        key,
        value,
        field: fieldByKey.get(key),
      }))
      .sort((a, b) => {
        // Defined fields first, then by field name / key
        const aHas = a.field ? 0 : 1;
        const bHas = b.field ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        const aName = a.field?.name || a.key;
        const bName = b.field?.name || b.key;
        return aName.localeCompare(bName);
      });
  }, [values, fields]);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          <span>Campos personalizados</span>
          <span className="text-xs font-normal text-muted-foreground">· {items.length} {items.length === 1 ? 'campo' : 'campos'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {items.map(({ key, value, field }) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-muted-foreground truncate">
                {field?.name || metadata?.custom_field_labels?.[key] || formatLabel(key)}
              </dt>
              <dd className="mt-0.5">{renderValue(value, field?.field_type)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
