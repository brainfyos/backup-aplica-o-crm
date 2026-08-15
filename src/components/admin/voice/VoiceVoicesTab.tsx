import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Play, Plus, Trash2, Mic, Info, Upload, X, HelpCircle, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GROK_NATIVE_VOICES } from '@/config/grokVoicesCatalog';
import { useVoiceClones, useDeleteVoiceClone, useCreateVoiceClone, previewGrokVoice } from '@/hooks/useVoiceClones';
import { VoiceCloneRecorder } from './VoiceCloneRecorder';

const SUGGESTED_SCRIPT = `Oi, tudo bem? Aqui é o [seu nome] da [sua empresa]. Vi que você demonstrou interesse na nossa solução e quero entender melhor o seu momento. Antes de qualquer coisa, me conta: o que te levou a procurar por isso agora? ... Perfeito, faz muito sentido. Muitos clientes chegam com esse mesmo desafio e a gente costuma resolver de duas formas — deixa eu te mostrar a que combina mais com você. E, olha, se fizer sentido, posso já reservar um horário essa semana pra gente conversar com calma. Que tal?`;

async function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { const d = a.duration; URL.revokeObjectURL(url); resolve(isFinite(d) ? d : null); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    a.src = url;
  });
}

const STATUS_COLOR: Record<string, string> = {
  processing: 'bg-amber-500/15 text-amber-700',
  ready: 'bg-green-500/15 text-green-700',
  failed: 'bg-destructive/15 text-destructive',
};

export function VoiceVoicesTab() {
  const { data: clones = [], isLoading } = useVoiceClones();
  const del = useDeleteVoiceClone();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const play = async (voiceId: string) => {
    try {
      setPreviewing(voiceId);
      const url = await previewGrokVoice(voiceId);
      const audio = new Audio(url);
      audio.play().catch(() => toast.error('Não foi possível reproduzir'));
    } catch (e) {
      toast.error(`Preview falhou: ${(e as Error).message}`);
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Vozes</h2>
          <p className="text-sm text-muted-foreground">
            Vozes nativas Grok + suas vozes clonadas. Use no editor de perfis de voz.
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Clonar nova voz
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          A clonagem depende da API pública da xAI. Se ainda não estiver liberada, a voz ficará com status <b>falhou</b> e você poderá tentar novamente.
        </AlertDescription>
      </Alert>

      <div>
        <h3 className="text-sm font-semibold mb-2">Nativas Grok</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {GROK_NATIVE_VOICES.map((v) => (
            <Card key={v.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{v.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {v.gender === 'female' ? '♀' : v.gender === 'male' ? '♂' : '◇'} · {v.language} · {v.description}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => play(v.id)} disabled={previewing === v.id}>
                {previewing === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Suas vozes clonadas</h3>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : clones.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <Mic className="mx-auto mb-2 h-6 w-6 opacity-50" />
            Nenhuma voz clonada ainda.
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {clones.map((c) => (
              <Card key={c.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <Badge className={STATUS_COLOR[c.status]}>{c.status}</Badge>
                  </div>
                  {c.description && <div className="text-[11px] text-muted-foreground truncate">{c.description}</div>}
                  {c.status === 'failed' && c.status_reason && (
                    <div className="text-[11px] text-destructive truncate">⚠ {c.status_reason}</div>
                  )}
                </div>
                {c.status === 'ready' && c.grok_voice_id && (
                  <Button size="icon" variant="ghost" onClick={() => play(c.grok_voice_id!)} disabled={previewing === c.grok_voice_id}>
                    {previewing === c.grok_voice_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => confirm(`Remover a voz "${c.name}"?`) && del.mutate(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CloneWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function CloneWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const create = useCreateVoiceClone();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; duration: number | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setName(''); setDescription(''); setFiles([]); setScriptOpen(false); };

  const addFile = async (f: File) => {
    const duration = await readAudioDuration(f);
    setFiles((prev) => [...prev, { file: f, duration }].slice(0, 3));
  };

  const handleSubmit = async () => {
    if (!name.trim() || files.length === 0 || !profile?.organization_id) return;
    setUploading(true);
    try {
      const cloneTmp = crypto.randomUUID();
      const paths: string[] = [];
      for (const { file: f } of files.slice(0, 3)) {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${profile.organization_id}/${cloneTmp}/${safe}`;
        const { error } = await supabase.storage.from('voice-samples').upload(path, f, { upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, samplePaths: paths });
      reset();
      onClose();
    } catch (e) {
      toast.error(`Falha no upload: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Clonar nova voz</DialogTitle>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-muted transition"
                  aria-label="Como gravar para melhor clonagem"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-96 max-h-[70vh] overflow-y-auto text-xs space-y-3">
                <div className="font-semibold text-sm">Como gravar para melhor clonagem</div>
                <p className="text-muted-foreground">
                  Baseado nas recomendações oficiais da xAI (Grok Custom Voices).
                </p>

                <div>
                  <div className="font-medium mb-1">⏱️ Duração</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    <li><b>Ideal: 90 a 120 segundos</b></li>
                    <li>Mínimo aceitável: 30s (abaixo disso a voz fica sem detalhe)</li>
                    <li>Máximo: 120s por clipe</li>
                  </ul>
                </div>

                <div>
                  <div className="font-medium mb-1">🎙️ Ambiente e microfone</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    <li>Local <b>silencioso</b> (sem ar-condicionado, ventilador ou notificações)</li>
                    <li>Sala pequena com estofados — evite salas com eco/reverberação</li>
                    <li>Fone USB ou microfone condensador de boa qualidade</li>
                    <li>Evite fones de celular — introduzem ruído</li>
                    <li><b>Apenas uma voz</b>, sem música ou efeitos ao fundo</li>
                  </ul>
                </div>

                <div>
                  <div className="font-medium mb-1">🗣️ Como falar</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    <li><b>Fale naturalmente</b> — se soar como leitura de script, a voz clonada também soará</li>
                    <li><b>Seja expressivo</b>: varie entonação, ritmo, pausas e emoção — a IA copia a entrega, não só o timbre</li>
                    <li>Fale no volume normal de uma conversa (não sussurre nem grite)</li>
                    <li>Grave <b>simulando o uso real</b>: se for para vendas, faça uma abertura, uma pergunta, um contorno de objeção e um fechamento</li>
                  </ul>
                </div>

                <div>
                  <div className="font-medium mb-1">📁 Formatos aceitos</div>
                  <p className="text-muted-foreground">WAV, MP3 ou M4A. A gravação pelo navegador já entrega WAV pronto (16 kHz mono).</p>
                </div>

                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-amber-800 dark:text-amber-200">
                  ⚠️ Grave apenas vozes das quais você tem autorização de uso.
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <DialogDescription>
            Envie <b>1 clipe</b> de até 120s (ideal 90–120s) ou grave direto pelo navegador. Clique no <HelpCircle className="inline h-3 w-3" /> ao lado do título para ver as recomendações completas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Voz do CEO João" />
          </div>
          <div className="space-y-1">
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <Collapsible open={scriptOpen} onOpenChange={setScriptOpen}>
            <CollapsibleTrigger className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <ChevronDown className={`h-3 w-3 transition-transform ${scriptOpen ? 'rotate-180' : ''}`} />
              Não sabe o que gravar? Ver script sugerido (vendas consultivas)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {SUGGESTED_SCRIPT}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Dica: leia com expressividade — pausas, entonação e emoção serão clonadas junto com o timbre.
              </p>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label>Amostras de áudio</Label>

            <VoiceCloneRecorder onReady={(f) => addFile(f)} />

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a"
              multiple
              className="hidden"
              onChange={async (e) => {
                const list = Array.from(e.target.files || []);
                for (const f of list) await addFile(f);
                if (inputRef.current) inputRef.current.value = '';
              }}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={files.length >= 3}>
              <Upload className="mr-2 h-4 w-4" /> Enviar arquivo ({files.length}/3)
            </Button>

            <div className="space-y-1 mt-2">
              {files.map((item, i) => {
                const d = item.duration;
                const durLabel = d == null ? '?' : `${Math.round(d)}s`;
                const warn = d != null && d < 30;
                const bad = d != null && d > 120;
                return (
                  <div key={i} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                    <span className="flex-1 truncate">{item.file.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        bad ? 'border-destructive text-destructive'
                          : warn ? 'border-amber-500 text-amber-700'
                            : 'border-green-500 text-green-700'
                      }
                    >
                      {durLabel}
                    </Badge>
                    <span className="text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</span>
                    <Button size="icon" variant="ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
              {files.some((f) => f.duration != null && f.duration < 30) && (
                <p className="text-[11px] text-amber-700">⚠ Amostras com menos de 30s podem gerar clonagem com pouca fidelidade.</p>
              )}
              {files.some((f) => f.duration != null && f.duration > 120) && (
                <p className="text-[11px] text-destructive">⚠ Amostras acima de 120s podem ser rejeitadas pela xAI. Recorte antes de enviar.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || files.length === 0 || uploading || create.isPending}
            >
              {(uploading || create.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clonar voz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
