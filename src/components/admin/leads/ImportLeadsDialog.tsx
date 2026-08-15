import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react';
import { parseCsv } from '@/lib/leadsExport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: string; name: string }[];
  squads: { id: string; name: string }[];
  teamMembers?: { id: string; full_name: string }[];
  onDone?: () => void;
}

const FIELD_OPTIONS = [
  { value: '__skip', label: '— ignorar —' },
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'lead_origin', label: 'Origem' },
  { value: 'lead_channel', label: 'Canal' },
  { value: 'temperature', label: 'Temperatura (hot/warm/cold)' },
  { value: 'deal_value', label: 'Valor' },
  { value: 'notes', label: 'Notas' },
];

const TEMPLATE_HEADERS = ['nome', 'email', 'telefone', 'empresa', 'cargo', 'origem', 'canal', 'temperatura', 'valor', 'notas'];
const TEMPLATE_SAMPLE = ['João Silva', 'joao@email.com', '11999999999', 'Acme', 'Diretor', 'site', 'whatsapp', 'warm', '1500', 'Lead vindo do form'];

function guessField(header: string): string {
  const h = header.toLowerCase().trim();
  if (/(^|\b)(nome|name)\b/.test(h)) return 'name';
  if (/e-?mail/.test(h)) return 'email';
  if (/(telefone|phone|whatsapp|celular)/.test(h)) return 'phone';
  if (/(empresa|company)/.test(h)) return 'company';
  if (/(cargo|position|funcao)/.test(h)) return 'position';
  if (/origem/.test(h)) return 'lead_origin';
  if (/canal|channel/.test(h)) return 'lead_channel';
  if (/temperatura|temperature/.test(h)) return 'temperature';
  if (/valor|price|deal/.test(h)) return 'deal_value';
  if (/notas?|obs/.test(h)) return 'notes';
  return '__skip';
}

async function readFileToRows(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
    if (json.length === 0) return { headers: [], rows: [] };
    const headers = Object.keys(json[0]).map((h) => String(h).trim());
    const rows = json.map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h) => { o[h] = r[h] == null ? '' : String(r[h]).trim(); });
      return o;
    });
    return { headers, rows };
  }
  // csv / tsv / txt
  const text = await file.text();
  return parseCsv(text);
}

export function ImportLeadsDialog({ open, onOpenChange, products, squads, teamMembers = [], onDone }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'upload' | 'map' | 'verifying' | 'confirm' | 'importing' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [productId, setProductId] = useState<string>('__none');
  const [squadId, setSquadId] = useState<string>('__none');
  const [assignedTo, setAssignedTo] = useState<string>('__none');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; duplicated: number; errors: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });
  const [verifyMap, setVerifyMap] = useState<Map<string, { exists: boolean; normalized: string | null }>>(new Map());
  const [verifySkipped, setVerifySkipped] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [includeNoPhone, setIncludeNoPhone] = useState(false);
  const [skipVerify, setSkipVerify] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setMapping({});
    setProductId('__none'); setSquadId('__none'); setAssignedTo('__none');
    setProgress(0); setResult(null); setFileName('');
    setVerifyProgress({ done: 0, total: 0 }); setVerifyMap(new Map());
    setVerifySkipped(false); setVerifyError(null); setIncludeNoPhone(false);
    setSkipVerify(false);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const { headers: h, rows: r } = await readFileToRows(file);
      if (h.length === 0 || r.length === 0) {
        toast.error('Arquivo vazio ou inválido');
        return;
      }
      setHeaders(h);
      setRows(r);
      const m: Record<string, string> = {};
      h.forEach((col) => { m[col] = guessField(col); });
      setMapping(m);
      setStep('map');
    } catch (err: any) {
      console.error('[import] parse error', err);
      toast.error('Não foi possível ler o arquivo. Verifique o formato.');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const downloadTemplateCsv = () => {
    const csv = TEMPLATE_HEADERS.join(',') + '\n' + TEMPLATE_SAMPLE.map((v) => `"${v}"`).join(',');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo-leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplateXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'modelo-leads.xlsx');
  };

  const validCount = useMemo(() => {
    if (!rows.length) return 0;
    return rows.filter((r) => {
      const hasName = Object.entries(mapping).some(([col, f]) => f === 'name' && r[col]);
      const hasEmail = Object.entries(mapping).some(([col, f]) => f === 'email' && r[col]);
      const hasPhone = Object.entries(mapping).some(([col, f]) => f === 'phone' && r[col]);
      return hasName || hasEmail || hasPhone;
    }).length;
  }, [rows, mapping]);

  // Extrai as linhas mapeadas (aplicando o mapping) — usado tanto na verificação quanto na importação.
  const buildMappedRows = () => {
    return rows.map((r) => {
      const obj: Record<string, any> = {};
      Object.entries(mapping).forEach(([col, field]) => {
        if (field === '__skip') return;
        const v = r[col];
        if (v == null || v === '') return;
        if (field === 'deal_value') obj.deal_value = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
        else if (field === 'temperature') {
          const t = String(v).toLowerCase();
          if (['hot', 'warm', 'cold'].includes(t)) obj.temperature = t;
        }
        else obj[field] = v;
      });
      return obj;
    }).filter((r) => r.name || r.email || r.phone);
  };

  const startVerification = async () => {
    if (!profile?.organization_id) return;
    const mapped = buildMappedRows();
    const uniquePhones = Array.from(new Set(
      mapped.map((r) => String(r.phone || '').replace(/\D/g, '')).filter(Boolean)
    ));

    if (skipVerify) {
      setVerifyMap(new Map());
      setVerifySkipped(true);
      setVerifyError(null);
      setStep('confirm');
      return;
    }

    if (uniquePhones.length === 0) {
      // Nenhum telefone para validar → pula direto para confirmação
      setVerifyMap(new Map());
      setVerifySkipped(true);
      setStep('confirm');
      return;
    }

    setStep('verifying');
    setVerifyProgress({ done: 0, total: uniquePhones.length });
    setVerifyError(null);

    const acc = new Map<string, { exists: boolean; normalized: string | null }>();
    const CHUNK = 50;

    try {
      for (let i = 0; i < uniquePhones.length; i += CHUNK) {
        const slice = uniquePhones.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke('whatsapp-check-numbers-batch', {
          body: { organization_id: profile.organization_id, phones: slice },
        });
        if (error) throw error;
        if (data?.ok === false) {
          const msg =
            data?.error === 'no_instance' ? 'Nenhuma conexão WhatsApp encontrada nesta empresa.'
            : data?.error === 'provider_not_configured' ? 'Provedor WhatsApp não configurado.'
            : data?.error === 'provider_unreachable' ? (data?.message || 'Provedor WhatsApp inacessível. Verifique se a instância está online.')
            : (data?.message || 'Não foi possível validar os números.');
          setVerifyError(msg);
          setStep('confirm');
          return;
        }
        for (const r of data?.results || []) {
          const clean = String(r.input || '').replace(/\D/g, '');
          if (clean) acc.set(clean, { exists: !!r.exists, normalized: r.normalized || null });
        }
        setVerifyProgress({ done: Math.min(i + slice.length, uniquePhones.length), total: uniquePhones.length });
      }
      setVerifyMap(acc);
      setVerifySkipped(false);
      setStep('confirm');
    } catch (err: any) {
      console.error('[import] verify error', err);
      setVerifyError(err?.message || 'Falha ao contatar o serviço de verificação.');
      setStep('confirm');
    }
  };

  // Classifica os leads mapeados após a verificação.
  const classified = useMemo(() => {
    const mapped = buildMappedRows();
    const valid: any[] = [];
    const invalid: any[] = [];
    const noPhone: any[] = [];
    for (const r of mapped) {
      const clean = String(r.phone || '').replace(/\D/g, '');
      if (!clean) { noPhone.push(r); continue; }
      const v = verifyMap.get(clean);
      if (verifySkipped || verifyError) {
        // Sem validação disponível — tratar todos como "não verificados"
        invalid.push({ ...r });
        continue;
      }
      if (v?.exists) {
        valid.push({ ...r, phone: v.normalized || clean });
      } else {
        invalid.push(r);
      }
    }
    return { valid, invalid, noPhone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyMap, verifySkipped, verifyError, rows, mapping]);

  const doImport = async (opts: { includeInvalid?: boolean }) => {
    if (!profile?.organization_id) return;
    setStep('importing');
    setProgress(0);

    const toImport: any[] = [...classified.valid];
    if (opts.includeInvalid) toImport.push(...classified.invalid);
    if (includeNoPhone) toImport.push(...classified.noPhone);

    if (productId !== '__none') toImport.forEach((r) => (r.product_id = productId));
    if (squadId !== '__none') toImport.forEach((r) => (r.squad_id = squadId));
    if (assignedTo !== '__none') toImport.forEach((r) => (r.assigned_to = assignedTo));
    toImport.forEach((r) => (r.organization_id = profile.organization_id));

    let created = 0, duplicated = 0, errors = 0;
    const BATCH = 50;
    for (let i = 0; i < toImport.length; i += BATCH) {
      const slice = toImport.slice(i, i + BATCH);
      const { data, error } = await supabase.from('leads').insert(slice as any).select('id');
      if (error) {
        for (const row of slice) {
          const { error: e } = await supabase.from('leads').insert(row as any);
          if (!e) created++;
          else if ((e as any).code === '23505') duplicated++;
          else errors++;
        }
      } else {
        created += (data?.length || slice.length);
      }
      setProgress(Math.round(((i + slice.length) / Math.max(toImport.length, 1)) * 100));
    }

    setResult({ created, duplicated, errors });
    setStep('done');
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar leads</DialogTitle>
          <DialogDescription>
            Baixe o modelo, preencha e faça upload. Aceita CSV, XLSX e XLS.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-2">
            {/* Template card */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Baixe o modelo de referência</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Use as colunas exatas na primeira linha: nome, email, telefone, empresa, cargo, origem, canal, temperatura, valor, notas.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplateCsv} className="gap-2">
                  <Download className="h-4 w-4" /> Modelo CSV
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTemplateXlsx} className="gap-2">
                  <Download className="h-4 w-4" /> Modelo Excel (.xlsx)
                </Button>
              </div>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Arraste seu arquivo aqui ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: CSV, TSV, XLSX, XLS, ODS</p>
              {fileName && <p className="text-xs text-primary mt-2 flex items-center justify-center gap-1"><FileText className="h-3 w-3" />{fileName}</p>}
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {rows.length} linhas · <span className="text-foreground font-medium">{validCount} válidas</span>
                {rows.length - validCount > 0 && <span className="text-amber-600"> · {rows.length - validCount} serão ignoradas</span>}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-2 gap-3 items-center">
                  <Input value={h} disabled />
                  <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t">
              <div>
                <Label className="text-xs">Produto (opcional)</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem produto</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Squad (opcional)</Label>
                <Select value={squadId} onValueChange={setSquadId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem squad</SelectItem>
                    {squads.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Atribuir carteira</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem carteira (pool)</SelectItem>
                    {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2 border-t">
              <input
                type="checkbox"
                checked={skipVerify}
                onChange={(e) => setSkipVerify(e.target.checked)}
                className="h-4 w-4"
              />
              Pular verificação de WhatsApp (importar direto)
            </label>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-8 space-y-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="font-medium">Verificando WhatsApp...</p>
            <Progress value={verifyProgress.total ? Math.round((verifyProgress.done / verifyProgress.total) * 100) : 0} />
            <p className="text-sm text-muted-foreground">
              {verifyProgress.done} de {verifyProgress.total} números verificados
            </p>
          </div>
        )}

        {step === 'confirm' && (
          <div className="py-4 space-y-4">
            {(verifyError || verifySkipped || (classified.valid.length === 0 && classified.invalid.length > 0)) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 flex gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    {verifyError
                      || (verifySkipped ? 'Verificação de WhatsApp ignorada' : 'Nenhum número foi confirmado no WhatsApp')}
                  </p>
                  <p className="text-amber-800/80 dark:text-amber-200/80 text-xs mt-0.5">
                    {verifyError || (classified.valid.length === 0 && !verifySkipped)
                      ? 'Verifique se a instância WhatsApp está online. Você pode importar mesmo assim.'
                      : 'Sem validação, os leads podem ir para o CRM mesmo sem WhatsApp confirmado.'}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Com WhatsApp confirmado
                </span>
                <span className="font-semibold">{classified.valid.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  {verifyError || verifySkipped ? 'Não verificados' : 'Sem WhatsApp'}
                </span>
                <span className="font-semibold text-muted-foreground">{classified.invalid.length}</span>
              </div>
              {classified.noPhone.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <label className="text-sm flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeNoPhone}
                      onChange={(e) => setIncludeNoPhone(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Incluir {classified.noPhone.length} sem telefone
                  </label>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Apenas os leads confirmados no WhatsApp serão importados.
              {classified.invalid.length > 0 && !verifyError && !verifySkipped &&
                ' Os sem WhatsApp serão descartados.'}
            </p>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 space-y-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">Importando... {progress}%</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-medium">Importação concluída</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✓ {result.created} criados</p>
              {result.duplicated > 0 && <p>⊘ {result.duplicated} duplicados (telefone/email já existe)</p>}
              {result.errors > 0 && <p className="text-destructive flex items-center justify-center gap-1"><AlertTriangle className="h-4 w-4" /> {result.errors} erros</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={startVerification} disabled={validCount === 0}>
                {skipVerify ? `Importar ${validCount} leads` : `Verificar ${validCount} leads`}
              </Button>
            </>
          )}
          {step === 'confirm' && (() => {
            const noneConfirmedButTried = !verifyError && !verifySkipped && classified.valid.length === 0 && classified.invalid.length > 0;
            const showFallback = verifyError || verifySkipped || noneConfirmedButTried;
            const totalFallback = classified.valid.length + classified.invalid.length + (includeNoPhone ? classified.noPhone.length : 0);
            const totalValid = classified.valid.length + (includeNoPhone ? classified.noPhone.length : 0);
            return (
              <>
                <Button variant="outline" onClick={() => setStep('map')}>Voltar</Button>
                {noneConfirmedButTried && (
                  <Button variant="ghost" onClick={startVerification}>Tentar novamente</Button>
                )}
                {showFallback ? (
                  <Button
                    onClick={() => doImport({ includeInvalid: true })}
                    disabled={totalFallback === 0}
                  >
                    Importar sem validar ({totalFallback})
                  </Button>
                ) : (
                  <Button
                    onClick={() => doImport({ includeInvalid: false })}
                    disabled={totalValid === 0}
                  >
                    Importar {totalValid} válidos
                  </Button>
                )}
              </>
            );
          })()}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
