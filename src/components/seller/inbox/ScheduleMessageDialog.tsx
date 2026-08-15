import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Clock, CalendarClock, Trash2, Repeat,
  Paperclip, Mic, X, Image as ImageIcon, Video, FileText, FileAudio,
} from 'lucide-react';
import { format, addHours, addDays, addWeeks, addMonths, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { AudioRecorder } from './AudioRecorder';
import type { MediaPayload, MediaKind } from './MediaAttachment';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  visitorName?: string;
}

type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

const VARIABLES: { key: string; label: string }[] = [
  { key: 'primeiro_nome', label: 'Primeiro nome' },
  { key: 'nome', label: 'Nome' },
  { key: 'saudacao', label: 'Saudação' },
  { key: 'data', label: 'Data' },
  { key: 'hora', label: 'Hora' },
  { key: 'atendente', label: 'Atendente' },
  { key: 'protocolo', label: 'Protocolo' },
  { key: 'setor', label: 'Setor' },
  { key: 'conexao', label: 'Conexão' },
];

function addByRecurrence(base: Date, rec: Recurrence, step: number): Date {
  switch (rec) {
    case 'daily': return addDays(base, step);
    case 'weekly': return addWeeks(base, step);
    case 'monthly': return addMonths(base, step);
    default: return base;
  }
}

function skipWeekend(d: Date): Date {
  let out = d;
  while (isWeekend(out)) out = addDays(out, 1);
  return out;
}

function kindIcon(kind: MediaKind) {
  switch (kind) {
    case 'image': return <ImageIcon className="h-4 w-4" />;
    case 'video': return <Video className="h-4 w-4" />;
    case 'audio': return <FileAudio className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

function kindLabel(kind: MediaKind) {
  return kind === 'image' ? 'imagem'
    : kind === 'video' ? 'vídeo'
    : kind === 'audio' ? 'áudio'
    : 'arquivo';
}

interface PendingRow {
  id: string;
  content: string | null;
  scheduled_at: string;
  media_kind?: string | null;
  media_filename?: string | null;
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
  visitorName,
}: ScheduleMessageDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { upload, isUploading } = useMediaUpload();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'message' | 'settings'>('message');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
  );
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [interval, setInterval] = useState(1);
  const [count, setCount] = useState(1);
  const [businessOnly, setBusinessOnly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [pending, setPending] = useState<PendingRow[]>([]);

  // Anexo já carregado (uploaded)
  const [media, setMedia] = useState<(MediaPayload & { durationMs?: number }) | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const loadPending = async () => {
    const { data } = await supabase
      .from('scheduled_messages')
      .select('id, content, scheduled_at, media_kind, media_filename')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(20);
    setPending((data as any) || []);
  };

  useEffect(() => {
    if (open) {
      setTab('message');
      setMedia(null);
      setIsRecording(false);
      loadPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    const token = `{${key}}`;
    if (!el) { setContent((c) => c + token); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + token + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const computeOccurrences = (): Date[] => {
    const base = new Date(scheduledAt);
    const total = recurrence === 'none' ? 1 : Math.max(1, count);
    const step = Math.max(1, interval);
    const out: Date[] = [];
    for (let i = 0; i < total; i++) {
      let d = i === 0 ? base : addByRecurrence(base, recurrence, step * i);
      if (businessOnly) d = skipWeekend(d);
      out.push(d);
    }
    return out;
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { media: m } = await upload(file);
      setMedia(m);
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar arquivo',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const handleAudioConfirm = async (blob: Blob, durationMs: number) => {
    setIsRecording(false);
    const file = new File([blob], `audio-${Date.now()}.webm`, {
      type: blob.type || 'audio/webm',
    });
    try {
      const { media: m } = await upload(file, { kind: 'audio', durationMs });
      setMedia({ ...m, durationMs });
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar áudio',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !profile?.organization_id) return;
    if (!content.trim() && !media) return;
    setIsSaving(true);
    try {
      const occurrences = computeOccurrences();
      const rows = occurrences.map((d) => ({
        conversation_id: conversationId,
        content: content.trim() || null,
        scheduled_at: d.toISOString(),
        created_by: user.id,
        organization_id: profile.organization_id,
        status: 'pending',
        media_kind: media?.kind ?? null,
        media_url: media?.url ?? null,
        media_mime: (media as any)?.mime ?? null,
        media_filename: (media as any)?.filename ?? null,
        media_duration_ms: media?.durationMs ?? null,
      }));
      const { error } = await supabase.from('scheduled_messages' as any).insert(rows);
      if (error) throw error;
      toast({
        title: occurrences.length > 1
          ? `${occurrences.length} mensagens agendadas`
          : 'Mensagem agendada!',
        description: `Próximo envio: ${format(occurrences[0], "dd/MM 'às' HH:mm", { locale: ptBR })}`,
      });
      setContent('');
      setMedia(null);
      await loadPending();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Erro ao agendar mensagem',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelScheduled = async (id: string) => {
    const { error } = await supabase
      .from('scheduled_messages' as any)
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (!error) {
      setPending((p) => p.filter((m) => m.id !== id));
      toast({ title: 'Agendamento cancelado' });
    }
  };

  const occurrencesPreview = computeOccurrences();
  const canSubmit = (content.trim().length > 0 || !!media) && !isSaving && !isUploading && !isRecording;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Agendar mensagem
            {visitorName && (
              <span className="text-sm font-normal text-muted-foreground">
                · {visitorName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="message">Mensagem</TabsTrigger>
              <TabsTrigger value="settings">
                <Clock className="h-4 w-4 mr-1.5" /> Quando & repetição
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="message" className="px-6 pt-4 pb-2 space-y-3 m-0">
            <div>
              <Label htmlFor="msg-content" className="text-xs text-muted-foreground">
                {media ? 'Legenda (opcional)' : 'Conteúdo'}
              </Label>
              <Textarea
                id="msg-content"
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={media ? 'Adicione uma legenda...' : 'Digite a mensagem que será enviada...'}
                rows={media ? 4 : 7}
                className="resize-none mt-1"
              />
            </div>

            {/* Barra de anexo */}
            {!isRecording && !media && (
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePickFile}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4 mr-1.5" />
                  )}
                  Anexar arquivo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRecording(true)}
                  disabled={isUploading}
                >
                  <Mic className="h-4 w-4 mr-1.5" />
                  Gravar áudio
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  Imagem, vídeo, áudio, PDF até 25 MB
                </span>
              </div>
            )}

            {isRecording && (
              <div className="rounded-md border bg-muted/30 p-2">
                <AudioRecorder
                  onConfirm={handleAudioConfirm}
                  onCancel={() => setIsRecording(false)}
                />
              </div>
            )}

            {media && (
              <div className="rounded-md border bg-muted/30 p-3 flex items-center gap-3">
                {media.kind === 'image' ? (
                  <img
                    src={media.url}
                    alt=""
                    className="h-14 w-14 object-cover rounded"
                  />
                ) : (
                  <div className="h-14 w-14 rounded bg-background flex items-center justify-center text-muted-foreground">
                    {kindIcon(media.kind)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {(media as any).filename || `Arquivo (${kindLabel(media.kind)})`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {kindLabel(media.kind)}
                    {media.durationMs ? ` · ${Math.round(media.durationMs / 1000)}s` : ''}
                  </div>
                  {media.kind === 'audio' && (
                    <audio controls src={media.url} className="mt-1 h-8 w-full" />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setMedia(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Variáveis disponíveis
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <Badge
                    key={v.key}
                    variant="secondary"
                    onClick={() => insertVariable(v.key)}
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {v.label}
                  </Badge>
                ))}
              </div>
            </div>

            {pending.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Já agendadas nesta conversa
                </div>
                <ScrollArea className="max-h-32">
                  <div className="space-y-1.5">
                    {pending.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 text-sm bg-background rounded px-2 py-1.5 border"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(m.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </div>
                          <div className="truncate flex items-center gap-1.5">
                            {m.media_kind && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-1">
                                {kindIcon(m.media_kind as MediaKind)}
                                {kindLabel(m.media_kind as MediaKind)}
                              </Badge>
                            )}
                            <span className="truncate">
                              {m.content || m.media_filename || '(sem texto)'}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => cancelScheduled(m.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="px-6 pt-4 pb-2 space-y-4 m-0">
            <div>
              <Label htmlFor="msg-schedule">Data e hora do primeiro envio</Label>
              <Input
                id="msg-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                className="mt-1"
              />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Repeat className="h-4 w-4 text-primary" /> Recorrência
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Repetir</Label>
                  <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não repetir</SelectItem>
                      <SelectItem value="daily">Diariamente</SelectItem>
                      <SelectItem value="weekly">Semanalmente</SelectItem>
                      <SelectItem value="monthly">Mensalmente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">A cada</Label>
                  <Input
                    type="number"
                    min={1}
                    value={interval}
                    disabled={recurrence === 'none'}
                    onChange={(e) => setInterval(parseInt(e.target.value || '1'))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Quantas vezes</Label>
                  <Input
                    type="number"
                    min={1}
                    value={count}
                    disabled={recurrence === 'none'}
                    onChange={(e) => setCount(parseInt(e.target.value || '1'))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Label htmlFor="biz-only" className="text-sm">
                  Enviar apenas em dias úteis
                </Label>
                <Switch id="biz-only" checked={businessOnly} onCheckedChange={setBusinessOnly} />
              </div>
            </div>

            {recurrence !== 'none' && (
              <div className="rounded-md bg-muted/30 border p-3">
                <div className="text-xs text-muted-foreground mb-1.5">Próximos envios</div>
                <div className="flex flex-wrap gap-1.5">
                  {occurrencesPreview.slice(0, 6).map((d, i) => (
                    <Badge key={i} variant="outline" className="font-normal">
                      {format(d, "dd/MM HH:mm", { locale: ptBR })}
                    </Badge>
                  ))}
                  {occurrencesPreview.length > 6 && (
                    <Badge variant="outline" className="font-normal">
                      +{occurrencesPreview.length - 6}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {(isSaving || isUploading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
