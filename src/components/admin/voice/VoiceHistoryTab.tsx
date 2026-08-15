import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2, ExternalLink, Search, Download, Calendar, Link2, MessageSquare, Tag as TagIcon,
  Smile, Meh, Frown, Sparkles, Phone, ChevronDown, DollarSign, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVoiceSessions, type Period, type VoiceSessionRow } from '@/hooks/useVoiceCallAnalytics';
import { useVoiceCalls } from '@/hooks/useVoiceCalls';

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mtd', label: 'Mês' },
  { value: 'all', label: 'Tudo' },
];

function fmtDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function isNewLead(s: VoiceSessionRow): boolean {
  if (!s.lead_id || !s.lead_created_at) return false;
  const diff = Math.abs(new Date(s.lead_created_at).getTime() - new Date(s.started_at).getTime());
  return diff < 300_000;
}

function primaryContact(s: VoiceSessionRow): string {
  const cd = s.captured_data || {};
  return cd.nome || cd.name || cd.whatsapp || cd.email || s.lead_name || '—';
}

const SENTIMENT_ICON: Record<string, JSX.Element> = {
  positivo: <Smile className="h-4 w-4 text-emerald-600" />,
  neutro: <Meh className="h-4 w-4 text-amber-600" />,
  negativo: <Frown className="h-4 w-4 text-rose-600" />,
};

const CTA_ICON: Record<string, JSX.Element> = {
  schedule: <Calendar className="h-3 w-3" />,
  link: <Link2 className="h-3 w-3" />,
  whatsapp: <MessageSquare className="h-3 w-3" />,
  interest: <TagIcon className="h-3 w-3" />,
};

export function VoiceHistoryTab() {
  const [period, setPeriod] = useState<Period>('30d');
  const [callFilter, setCallFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [scheduledOnly, setScheduledOnly] = useState(false);
  const [newLeadsOnly, setNewLeadsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<VoiceSessionRow | null>(null);

  const { data: voiceCalls = [] } = useVoiceCalls();
  const { data: sessions = [], isLoading } = useVoiceSessions(period, callFilter !== 'all' ? callFilter : undefined);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (sentimentFilter !== 'all' && s.ai_analysis?.sentiment !== sentimentFilter) return false;
      if (scheduledOnly && !s.ctas_clicked.some((c) => c.kind === 'schedule')) return false;
      if (newLeadsOnly && !isNewLead(s)) return false;
      if (search) {
        const hay = JSON.stringify(s.captured_data || {}).toLowerCase() + ' ' + (s.lead_name || '').toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [sessions, sentimentFilter, scheduledOnly, newLeadsOnly, search]);

  const exportCSV = () => {
    const header = ['data', 'ligacao', 'contato', 'duracao_seg', 'sentimento', 'score', 'agendou', 'novo_lead', 'ctas', 'tags', 'custo_usd', 'transcricao'];
    const rows = filtered.map((s) => [
      new Date(s.started_at).toISOString(),
      s.voice_call_name,
      primaryContact(s).replace(/,/g, ' '),
      s.duration_sec,
      s.ai_analysis?.sentiment || '',
      s.ai_analysis?.lead_score || '',
      s.ctas_clicked.some((c) => c.kind === 'schedule') ? 'sim' : 'nao',
      isNewLead(s) ? 'sim' : 'nao',
      s.ctas_clicked.map((c: any) => c.kind).join('|'),
      (s.tags_applied || []).map((t: any) => t.name || t).join('|'),
      s.cost_usd_estimated.toFixed(4),
      (s.transcript || []).map((t: any) => t.text || '').join(' | ').replace(/[\r\n,]/g, ' ').slice(0, 500),
    ]);
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-ligacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, email, whatsapp..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={callFilter} onValueChange={setCallFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Todas as ligações" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ligações</SelectItem>
            {voiceCalls.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sentimento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer</SelectItem>
            <SelectItem value="positivo">Positivo</SelectItem>
            <SelectItem value="neutro">Neutro</SelectItem>
            <SelectItem value="negativo">Negativo</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={scheduledOnly ? 'default' : 'outline'} size="sm" onClick={() => setScheduledOnly((v) => !v)}>
          <Calendar className="h-3 w-3 mr-1" /> Só agendaram
        </Button>
        <Button variant={newLeadsOnly ? 'default' : 'outline'} size="sm" onClick={() => setNewLeadsOnly((v) => !v)}>
          Só novos leads
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} sessão{filtered.length === 1 ? '' : 'ões'} no período · {' '}
        {filtered.filter((s) => s.ctas_clicked.some((c) => c.kind === 'schedule')).length} agendamento(s) · {' '}
        US$ {filtered.reduce((a, s) => a + s.cost_usd_estimated, 0).toFixed(2)} de custo
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma sessão encontrada com esses filtros.</p>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Ligação</th>
                  <th className="px-3 py-2 text-left">Contato</th>
                  <th className="px-3 py-2 text-left">Duração</th>
                  <th className="px-3 py-2 text-left">Sentimento</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">CTAs</th>
                  <th className="px-3 py-2 text-left">Lead</th>
                  <th className="px-3 py-2 text-left">Tags</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const schedule = s.ctas_clicked.find((c: any) => c.kind === 'schedule');
                  const score = s.ai_analysis?.lead_score;
                  return (
                    <tr key={s.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(s)}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[160px] truncate">{s.voice_call_name}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate">{primaryContact(s)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDuration(s.duration_sec)}</td>
                      <td className="px-3 py-2">{s.ai_analysis?.sentiment ? SENTIMENT_ICON[s.ai_analysis.sentiment] : '—'}</td>
                      <td className="px-3 py-2">
                        {score != null ? (
                          <Badge variant="outline" className={score >= 70 ? 'text-emerald-600 border-emerald-500/30' : score >= 40 ? 'text-amber-600 border-amber-500/30' : 'text-rose-600 border-rose-500/30'}>
                            {score}
                          </Badge>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {s.ctas_clicked.slice(0, 3).map((c: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs" title={c.label || c.kind}>
                              {CTA_ICON[c.kind]}
                            </span>
                          ))}
                          {schedule && <Calendar className="h-3.5 w-3.5 text-purple-600" />}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {s.lead_id ? (
                          isNewLead(s) ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs">Novo</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Existente</Badge>
                          )
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap max-w-[140px]">
                          {(s.tags_applied || []).slice(0, 2).map((t: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{t.name || t}</Badge>
                          ))}
                          {(s.tags_applied || []).length > 2 && <span className="text-xs text-muted-foreground">+{s.tags_applied.length - 2}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                        {s.cost_usd_estimated > 0 ? `$${s.cost_usd_estimated.toFixed(4)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {s.lead_id && (
                          <Button asChild size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/lead/${s.lead_id}`}><ExternalLink className="h-3 w-3" /></Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SessionDrawer session={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SessionDrawer({ session, onClose }: { session: VoiceSessionRow | null; onClose: () => void }) {
  if (!session) return null;
  const s = session;
  const schedule = s.ctas_clicked.find((c: any) => c.kind === 'schedule');
  const analysis = s.ai_analysis || {};

  return (
    <Sheet open={!!session} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <Phone className="h-5 w-5" /> {primaryContact(s)}
            {isNewLead(s) && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Novo lead</Badge>}
            {schedule && <Badge className="bg-purple-500/15 text-purple-700 border-purple-500/30">Agendou</Badge>}
            {analysis.sentiment && SENTIMENT_ICON[analysis.sentiment]}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <StatCell label="Duração" value={fmtDuration(s.duration_sec)} />
            <StatCell label="Custo" value={s.cost_usd_estimated > 0 ? `$${s.cost_usd_estimated.toFixed(4)}` : '—'} />
            <StatCell label="Score IA" value={analysis.lead_score != null ? String(analysis.lead_score) : '—'} />
          </div>

          {Object.keys(s.captured_data || {}).length > 0 && (
            <Section title="Dados capturados">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(s.captured_data).map(([k, v]) => (
                  <div key={k} className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">{k}</div>
                    <div className="truncate">{String(v)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {analysis && Object.keys(analysis).length > 0 && (
            <Section title={<><Sparkles className="h-3.5 w-3.5 inline mr-1" /> Análise IA</>}>
              {analysis.summary && <p className="text-sm mb-3">{analysis.summary}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {analysis.intent && <InfoRow label="Intenção" value={analysis.intent} />}
                {analysis.sentiment && <InfoRow label="Sentimento" value={analysis.sentiment} />}
              </div>
              {Array.isArray(analysis.interests) && analysis.interests.length > 0 && (
                <ChipList label="Interesses" items={analysis.interests} />
              )}
              {Array.isArray(analysis.objections) && analysis.objections.length > 0 && (
                <ChipList label="Objeções" items={analysis.objections} tone="rose" />
              )}
              {Array.isArray(analysis.next_steps) && analysis.next_steps.length > 0 && (
                <BulletList label="Próximos passos" items={analysis.next_steps} />
              )}
              {Array.isArray(analysis.highlights) && analysis.highlights.length > 0 && (
                <BulletList label="Falas marcantes" items={analysis.highlights} />
              )}
            </Section>
          )}

          {s.ctas_clicked.length > 0 && (
            <Section title="CTAs clicados">
              <div className="space-y-1.5">
                {s.ctas_clicked.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm rounded border p-2">
                    {CTA_ICON[c.kind] || <Sparkles className="h-3 w-3" />}
                    <span className="font-medium">{c.label || c.kind}</span>
                    {c.url && <span className="text-xs text-muted-foreground truncate">{c.url}</span>}
                    {c.start && <span className="text-xs text-purple-600">{new Date(c.start).toLocaleString('pt-BR')}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(s.tags_applied || []).length > 0 && (
            <Section title="Tags aplicadas">
              <div className="flex gap-1 flex-wrap">
                {(s.tags_applied || []).map((t: any, i: number) => (
                  <Badge key={i} variant="secondary">{t.name || t}</Badge>
                ))}
              </div>
            </Section>
          )}

          {Object.keys(s.utms || {}).length > 0 && (
            <Section title="UTMs de origem">
              <div className="text-xs font-mono grid grid-cols-2 gap-1">
                {Object.entries(s.utms).map(([k, v]) => <div key={k}>{k}: <b>{String(v)}</b></div>)}
              </div>
            </Section>
          )}

          <Section title={<><DollarSign className="h-3.5 w-3.5 inline mr-1" /> Detalhe do custo</>}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoRow label="Provider" value={s.provider || '—'} />
              <InfoRow label="Modelo" value={s.model || '—'} />
              <InfoRow label="Voz" value={s.voice_id || '—'} />
              <InfoRow label="Áudio in" value={`${s.audio_seconds_in.toFixed(1)}s`} />
              <InfoRow label="Áudio out" value={`${s.audio_seconds_out.toFixed(1)}s`} />
              <InfoRow label="Tokens in" value={String(s.tokens_in)} />
              <InfoRow label="Tokens out" value={String(s.tokens_out)} />
              <InfoRow label="Custo estimado" value={`$${s.cost_usd_estimated.toFixed(6)}`} />
            </div>
            {s.pricing_snapshot?.backfill && (
              <p className="text-xs text-amber-600 mt-2">⚠️ Sessão anterior à instrumentação — custo estimado por duração × tarifa fallback.</p>
            )}
          </Section>

          {s.transcript.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <FileText className="h-3.5 w-3.5" /> Transcrição completa <ChevronDown className="h-3 w-3" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded border p-3 mt-2 max-h-96 overflow-y-auto text-xs space-y-1.5">
                  {s.transcript.map((t: any, i: number) => (
                    <div key={i}>
                      <b className={t.role === 'assistant' ? 'text-primary' : ''}>{t.role}:</b> {t.text || t.content}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {s.lead_id && (
            <Button asChild className="w-full">
              <Link to={`/lead/${s.lead_id}`}>Abrir lead completo</Link>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase text-muted-foreground mb-2 font-medium">{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b border-dashed border-muted-foreground/10 py-1"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function ChipList({ label, items, tone }: { label: string; items: string[]; tone?: 'rose' }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex gap-1 flex-wrap">
        {items.map((it, i) => (
          <Badge key={i} variant="secondary" className={tone === 'rose' ? 'bg-rose-500/10 text-rose-700' : ''}>{it}</Badge>
        ))}
      </div>
    </div>
  );
}

function BulletList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <ul className="list-disc pl-5 space-y-0.5 text-sm">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
