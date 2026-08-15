import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Target, Loader2, Search, Flame, Snowflake, ThermometerSun, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFunnels } from '@/hooks/useFunnels';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QuizLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  temperature: string;
  created_at: string;
  metadata: any;
}

const tempIcon = (t: string) => {
  if (t === 'hot') return <Flame className="h-3 w-3 text-red-500" />;
  if (t === 'warm') return <ThermometerSun className="h-3 w-3 text-orange-500" />;
  return <Snowflake className="h-3 w-3 text-sky-500" />;
};

export function CaptureResultsSection() {
  const { profile } = useAuth();
  const { data: funnels } = useFunnels({ channelType: 'quiz' } as any);
  const [funnelId, setFunnelId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<QuizLead | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ['quiz-results', profile?.organization_id, funnelId],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id, name, email, phone, temperature, created_at, metadata')
        .eq('organization_id', profile!.organization_id)
        .eq('lead_origin', 'funnel')
        .order('created_at', { ascending: false })
        .limit(500);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data as QuizLead[]) || [];
      if (funnelId !== 'all') {
        return rows.filter(l => (l.metadata as any)?.funnel_id === funnelId);
      }
      // Apenas quizzes (filtrar pelos funnel_ids dos quizzes da org)
      const quizFunnelIds = new Set((funnels || []).map((f: any) => f.id));
      return rows.filter(l => quizFunnelIds.has((l.metadata as any)?.funnel_id));
    },
  });

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (!search.trim()) return leads;
    const s = search.toLowerCase();
    return leads.filter(l =>
      l.name?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.phone?.includes(s)
    );
  }, [leads, search]);

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Target className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Resultados de Quiz</h1>
          <p className="text-sm text-muted-foreground">
            Todas as respostas, score e tags dos leads que concluíram seus quizzes.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Select value={funnelId} onValueChange={setFunnelId}>
              <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os quizzes</SelectItem>
                {(funnels || []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{filtered.length} respostas</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum resultado ainda. Compartilhe seu quiz para começar a coletar respostas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Quiz</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Temperatura</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => {
                  const m = (l.metadata || {}) as any;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.email || l.phone}</div>
                      </TableCell>
                      <TableCell className="text-xs">{m.funnel_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{m.score ?? 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 capitalize">
                          {tempIcon(l.temperature)} {l.temperature}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {((m.tags as string[]) || []).slice(0, 3).map((t, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                          {((m.tags as string[]) || []).length > 3 && (
                            <Badge variant="outline" className="text-[10px]">+{((m.tags as string[])).length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(l.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(l)} className="gap-1">
                          <Eye className="h-3 w-3" /> Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drilldown */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.email || '—'} · {selected.phone || '—'} ·{' '}
                  {format(new Date(selected.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-2xl font-bold">{(selected.metadata as any)?.score ?? 0}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Temperatura</div>
                    <div className="text-lg font-semibold capitalize flex items-center gap-1">
                      {tempIcon(selected.temperature)} {selected.temperature}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Canal</div>
                    <div className="text-lg font-semibold capitalize">
                      {(selected.metadata as any)?.funnel_channel || '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Respostas</h4>
                  <div className="space-y-2">
                    {Object.entries(((selected.metadata as any)?.responses || {})).map(([k, v]) => (
                      <div key={k} className="rounded border p-2 text-sm">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {((selected.metadata as any)?.tags || []).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Tags aplicadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {((selected.metadata as any).tags as string[]).map((t, i) => (
                        <Badge key={i} variant="secondary">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
