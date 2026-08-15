import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Smile,
  Mic,
  Clock,
  Plus,
  Loader2,
  FileText,
  Camera,
  User as UserIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  BarChart3,
  Briefcase,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { prefetchVideoTranscoder } from '@/lib/videoTranscode';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MediaPreviewBar, makePendingId, type PendingAttachment } from './MediaPreviewBar';
import { AudioRecorder } from './AudioRecorder';
import { ContactPickerDialog } from './ContactPickerDialog';
import { PollComposerDialog } from './PollComposerDialog';
import type { MediaPayload, MediaKind } from './MediaAttachment';
import { usePublicAppUrl } from '@/lib/publicUrl';

interface ChatInputProps {
  onSend: (content: string, media?: MediaPayload) => void;
  onTyping?: (isTyping: boolean) => void;
  onOpenQuickReplies?: () => void;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  aiSuggestion?: string;
  onClearSuggestion?: () => void;
  onScheduleMessage?: () => void;
  onCreateDeal?: () => void;
}


const EMOJI_CATEGORIES = {
  'Frequentes': ['👍', '❤️', '😊', '🎉', '✅', '👋', '🙏', '💪'],
  'Rostos': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍'],
  'Gestos': ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤙', '👋', '💪', '🙏'],
  'Objetos': ['💼', '📱', '💻', '📧', '📝', '📋', '📊', '💰', '🎯', '🔥', '⭐', '✨'],
};

function inferKindFromFile(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

function ChatInputImpl({
  onSend,
  onTyping,
  onOpenQuickReplies,
  disabled = false,
  isSending = false,
  placeholder = "Digite uma mensagem...",
  aiSuggestion,
  onClearSuggestion,
  onScheduleMessage,
  onCreateDeal,
}: ChatInputProps) {

  const [input, setInput] = useState('');
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptRef = useRef<string>('*/*');
  const kindHintRef = useRef<MediaKind | undefined>(undefined);
  const captureRef = useRef<string | undefined>(undefined);

  const { uploadOne } = useMediaUpload();
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  const { data: publicAppUrl } = usePublicAppUrl();

  const MAX_PENDING = 10;
  const MAX_BYTES = 25 * 1024 * 1024;
  const MAX_VIDEO_INPUT_BYTES = 100 * 1024 * 1024; // permite vídeo cru até 100MB; será convertido/reduzido

  function isVideoFile(f: File): boolean {
    if (f.type.startsWith('video/')) return true;
    return /\.(mov|mp4|m4v|3gp|mkv|webm|avi)$/i.test(f.name);
  }

  // Fill input with AI suggestion
  useEffect(() => {
    if (aiSuggestion && !input) {
      setInput(aiSuggestion);
      textareaRef.current?.focus();
    }
  }, [aiSuggestion]);

  // Auto-resize textarea — feito no onChange direto, sem useEffect, para zero latência.
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  };

  // Liberar object URLs ao desmontar
  useEffect(() => {
    return () => {
      pending.forEach((p) => {
        try { URL.revokeObjectURL(p.previewUrl); } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ---------- Texto ----------
  // Mantém ref dos callbacks para evitar reatribuir handlers e re-renderizar a cada tecla.
  const onTypingRef = useRef(onTyping);
  useEffect(() => { onTypingRef.current = onTyping; }, [onTyping]);
  const lastTypingSentRef = useRef(0);

  const handleInputChange = (value: string) => {
    setInput(value);
    autoResize();
    if (value.endsWith('/') && onOpenQuickReplies) onOpenQuickReplies();
    // Debounce de typing: envia no máximo 1x a cada 1.5s.
    const cb = onTypingRef.current;
    if (cb) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1500) {
        cb(true);
        lastTypingSentRef.current = now;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        cb(false);
        lastTypingSentRef.current = 0;
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setInput(input.substring(0, start) + emoji + input.substring(end));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        textarea.focus();
      }, 0);
    } else {
      setInput(input + emoji);
    }
  };

  // ---------- Anexos (multi) ----------
  const probeMediaDurationSec = (file: File): Promise<number | null> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(isFinite(el.duration) ? el.duration : null);
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      el.src = url;
    });

  const addFiles = (files: File[], kindHint?: MediaKind) => {
    if (!files.length) return;
    const slotsLeft = MAX_PENDING - pending.length;
    if (slotsLeft <= 0) {
      toast({
        title: 'Limite atingido',
        description: `Máximo de ${MAX_PENDING} anexos por envio.`,
        variant: 'destructive',
      });
      return;
    }
    const accepted: PendingAttachment[] = [];
    let skippedSize = 0;
    let skippedVideoOversize = 0;
    for (const file of files.slice(0, slotsLeft)) {
      const isVideo = isVideoFile(file);
      const limit = isVideo ? MAX_VIDEO_INPUT_BYTES : MAX_BYTES;
      if (file.size > limit) {
        if (isVideo) skippedVideoOversize++;
        else skippedSize++;
        continue;
      }
      const kind = kindHint || inferKindFromFile(file);
      accepted.push({
        id: makePendingId(),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
        caption: '',
        status: 'idle',
        progress: 0,
      });
      // Pré-aquece o conversor para vídeos não-mp4 (iPhone .mov etc.)
      if (isVideo && !(file.type === 'video/mp4' && /\.mp4$/i.test(file.name))) {
        prefetchVideoTranscoder().catch(() => {});
      }
    }
    if (skippedSize) {
      toast({
        title: 'Arquivo muito grande',
        description: `${skippedSize} arquivo(s) acima de 25MB foram ignorados.`,
        variant: 'destructive',
      });
    }
    if (skippedVideoOversize) {
      toast({
        title: 'Vídeo muito grande',
        description: `${skippedVideoOversize} vídeo(s) acima de 100MB foram ignorados. Grave em qualidade menor ou mais curto.`,
        variant: 'destructive',
      });
    }
    if (files.length > slotsLeft) {
      toast({
        title: 'Excesso de arquivos',
        description: `Apenas os primeiros ${slotsLeft} foram adicionados (limite ${MAX_PENDING}).`,
      });
    }
    if (!accepted.length) return;
    setPending((prev) => [...prev, ...accepted]);
    if (!activeId) setActiveId(accepted[0].id);
  };

  const openFilePicker = (accept: string, kindHint?: MediaKind, capture?: string) => {
    acceptRef.current = accept;
    kindHintRef.current = kindHint;
    captureRef.current = capture;
    setAttachOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.accept = accept;
      fileInputRef.current.multiple = !capture; // câmera = 1 por vez
      if (capture) {
        fileInputRef.current.setAttribute('capture', capture);
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || !list.length) return;
    const arr = Array.from(list);
    const fromCamera = !!captureRef.current;

    // Limite de 2 min para vídeos gravados pela câmera nativa.
    if (fromCamera) {
      const filtered: File[] = [];
      for (const f of arr) {
        if (f.type.startsWith('video/')) {
          const dur = await probeMediaDurationSec(f);
          if (dur != null && dur > 120) {
            toast({
              title: 'Vídeo muito longo',
              description: 'Limite de 2 minutos para gravação pela câmera. Grave um vídeo mais curto.',
              variant: 'destructive',
            });
            continue;
          }
          // Pré-aquece o conversor enquanto o usuário confirma.
          prefetchVideoTranscoder().catch(() => {});
        }
        filtered.push(f);
      }
      if (!filtered.length) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      addFiles(filtered, kindHintRef.current);
    } else {
      addFiles(arr, kindHintRef.current);
    }
  };

  const removePending = (id: string) => {
    setPending((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) {
        try { URL.revokeObjectURL(found.previewUrl); } catch {}
      }
      const next = prev.filter((p) => p.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const setCaption = (id: string, v: string) => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, caption: v } : p)));
  };

  const addMoreFromActiveKind = () => {
    // Reabre o picker com base no kind do primeiro item
    const k = pending[0]?.kind;
    if (k === 'document') openFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf', 'document');
    else if (k === 'video') openFilePicker('video/*', 'video');
    else openFilePicker('image/*,video/*', undefined);
  };

  // Sobe 1 item (com retry) e atualiza status/progresso
  const uploadSingle = async (item: PendingAttachment) => {
    setPending((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading', progress: 0, error: undefined } : p)),
    );
    try {
      const { media } = await uploadOne(item.file, {
        kind: item.kind,
        durationMs: item.durationMs,
        onProgress: (pct) => {
          setPending((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: pct } : p)),
          );
        },
      });
      setPending((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'done', progress: 100 } : p)),
      );
      return media;
    } catch (e: any) {
      const msg = e?.message || 'Falha no envio';
      setPending((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'failed', error: msg } : p)),
      );
      throw e;
    }
  };

  // Paralelismo controlado: até N uploads em voo simultâneo
  async function uploadWithConcurrency<T>(
    items: PendingAttachment[],
    limit: number,
    worker: (it: PendingAttachment) => Promise<T>,
  ): Promise<Array<{ item: PendingAttachment; result?: T; error?: any }>> {
    const out: Array<{ item: PendingAttachment; result?: T; error?: any }> = items.map((it) => ({ item: it }));
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          out[i].result = await worker(items[i]);
        } catch (e) {
          out[i].error = e;
        }
      }
    });
    await Promise.all(runners);
    return out;
  }

  const handleSend = async () => {
    if (disabled || isSending || isSendingMedia) return;

    // Caso 1: Tem anexos pendentes
    if (pending.length > 0) {
      const queue = pending.filter((p) => p.status !== 'done');
      if (!queue.length) return;

      setIsSendingMedia(true);
      try {
        const textCaption = input.trim();
        // Faz uploads em paralelo (até 3 em voo)
        const results = await uploadWithConcurrency(queue, 3, uploadSingle);

        // Envia em série na ordem original para preservar sequência na conversa
        let firstSent = false;
        for (let i = 0; i < results.length; i++) {
          const { item, result } = results[i];
          if (!result) continue; // falhou → fica no preview pra retry
          const caption =
            item.caption.trim() || (!firstSent && textCaption ? textCaption : '');
          onSend(caption, result);
          firstSent = true;
        }

        // Remove os enviados; mantém os que falharam
        setPending((prev) => {
          const failedIds = new Set(
            results.filter((r) => r.error).map((r) => r.item.id),
          );
          const kept = prev.filter((p) => failedIds.has(p.id));
          prev.forEach((p) => {
            if (!failedIds.has(p.id)) {
              try { URL.revokeObjectURL(p.previewUrl); } catch {}
            }
          });
          if (!kept.find((k) => k.id === activeId)) {
            setActiveId(kept[0]?.id ?? null);
          }
          return kept;
        });

        if (firstSent) setInput('');
        if (onTyping) onTyping(false);
      } finally {
        setIsSendingMedia(false);
      }
      return;
    }

    // Caso 2: Texto puro
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (onTyping) onTyping(false);
    textareaRef.current?.focus();
  };

  const retryItem = async (id: string) => {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    setIsSendingMedia(true);
    try {
      const media = await uploadSingle(item).catch(() => null);
      if (media) {
        const caption = item.caption.trim();
        onSend(caption, media);
        removePending(id);
      }
    } finally {
      setIsSendingMedia(false);
    }
  };

  // ---------- Áudio gravado ----------
  const handleAudioConfirm = async (blob: Blob, durationMs: number) => {
    setIsRecording(false);
    const blobType = blob.type || 'audio/webm';
    const ext = blobType.includes('mp4') || blobType.includes('aac')
      ? 'm4a'
      : blobType.includes('ogg')
      ? 'ogg'
      : 'webm';
    const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blobType });
    setIsSendingMedia(true);
    try {
      const { media } = await uploadOne(file, { kind: 'audio', durationMs });
      onSend('', media);
    } catch (e: any) {
      toast({ title: 'Falha no envio', description: e?.message || 'Erro ao enviar áudio', variant: 'destructive' });
    } finally {
      setIsSendingMedia(false);
    }
  };

  // ---------- Contato / Enquete / Link de Reunião ----------
  const handleContactConfirm = ({ name, phone }: { name: string; phone: string }) => {
    onSend(`📇 *Contato*\nNome: ${name}\nTelefone: ${phone}`);
  };

  const handlePollConfirm = ({ question, options }: { question: string; options: string[] }) => {
    const lines = options.map((o, i) => `${i + 1}) ${o}`).join('\n');
    onSend(`📊 *Enquete:* ${question}\n\n${lines}\n\n_Responda com o número da opção_`);
  };

  const handleMeetingLink = () => {
    setAttachOpen(false);
    const slug = (profile as any)?.booking_slug;
    if (!slug) {
      toast({
        title: 'Link de reunião indisponível',
        description: 'Configure seu link de agendamento no seu perfil.',
        variant: 'destructive',
      });
      return;
    }
    const url = `${publicAppUrl}/agendar/${slug}`;
    setInput((prev) => (prev ? `${prev}\n${url}` : `Olá! Agende um horário comigo: ${url}`));
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ---------- Paste / Drag & Drop ----------
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      e.preventDefault();
      addFiles(Array.from(items));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      setIsDragging(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) addFiles(Array.from(files));
  };

  const hasPending = pending.length > 0;
  const canSend = hasPending || input.trim().length > 0;
  const showRecording = isRecording;
  const inputLocked = disabled || isSendingMedia;
  const composerDisabled = disabled || isSending || isSendingMedia;

  return (
    <div
      className={cn(
        "w-full min-w-0 flex-shrink-0 border-t border-border bg-background overflow-hidden relative",
        isDragging && "ring-2 ring-primary ring-inset",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-primary">Solte os arquivos aqui</p>
        </div>
      )}

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Pré-visualização dos anexos pendentes */}
      {hasPending && (
        <MediaPreviewBar
          items={pending}
          activeId={activeId}
          onSelect={setActiveId}
          onCaptionChange={setCaption}
          onRemove={removePending}
          onAddMore={addMoreFromActiveKind}
          onRetry={retryItem}
          canAddMore={pending.length < MAX_PENDING}
          isBusy={isSendingMedia}
        />
      )}



      {/* Gravador de áudio inline */}
      {showRecording ? (
        <AudioRecorder
          onConfirm={handleAudioConfirm}
          onCancel={() => setIsRecording(false)}
          disabled={composerDisabled}
        />
      ) : (
        <div className="p-3 min-w-0">
          <div className="flex min-w-0 items-end gap-2">
            {/* Left Actions */}
            <div className="flex flex-shrink-0 items-center gap-1 pb-2">
              {/* Emoji Picker */}
              <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled}
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start" side="top">
                  <div className="p-3 max-h-64 overflow-y-auto">
                    {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                      <div key={category} className="mb-3 last:mb-0">
                        <p className="text-xs text-muted-foreground mb-2 font-medium">{category}</p>
                        <div className="grid grid-cols-8 gap-1">
                          {emojis.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => { insertEmoji(emoji); setIsEmojiOpen(false); }}
                              className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Unified "+" attach menu (Documento, Câmera, Contato, Mídia, Link de Reunião, Enquete) */}
              <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled}
                    title="Anexar / Mais ações"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1.5" align="start" side="top">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf', 'document')}
                  >
                    <span className="h-8 w-8 rounded-full bg-violet-500/15 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-violet-500" />
                    </span>
                    <span>Documento</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('image/*,video/*', undefined, 'environment')}
                  >
                    <span className="h-8 w-8 rounded-full bg-rose-500/15 flex items-center justify-center">
                      <Camera className="h-4 w-4 text-rose-500" />
                    </span>
                    <span>Câmera</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => { setAttachOpen(false); setContactOpen(true); }}
                  >
                    <span className="h-8 w-8 rounded-full bg-sky-500/15 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-sky-500" />
                    </span>
                    <span>Contato</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => openFilePicker('image/*,video/*', undefined)}
                  >
                    <span className="h-8 w-8 rounded-full bg-fuchsia-500/15 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-fuchsia-500" />
                    </span>
                    <span>Mídia</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={handleMeetingLink}
                  >
                    <span className="h-8 w-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <VideoIcon className="h-4 w-4 text-emerald-500" />
                    </span>
                    <span>Link de Reunião</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                    onClick={() => { setAttachOpen(false); setPollOpen(true); }}
                  >
                    <span className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-amber-500" />
                    </span>
                    <span>Enquete</span>
                  </button>
                  {onCreateDeal && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                      onClick={() => { setAttachOpen(false); onCreateDeal(); }}
                    >
                      <span className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
                        <Briefcase className="h-4 w-4 text-primary" />
                      </span>
                      <span>Criar Oportunidade</span>
                    </button>
                  )}
                </PopoverContent>

              </Popover>
            </div>

            {/* Input Area */}
            <div className="flex-1 min-w-0 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={pending ? '' : 'Mensagem'}
                disabled={inputLocked}
                className={cn(
                  "min-h-[44px] max-h-[150px] py-3 px-4 resize-none",
                  "text-sm leading-relaxed",
                  "bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50",
                  "rounded-2xl"
                )}
                rows={1}
              />
            </div>

            {/* Right Actions */}
            <div className="flex flex-shrink-0 items-center gap-1 pb-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={composerDisabled}
                    onClick={onScheduleMessage}
                  >
                    <Clock className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agendar mensagem</TooltipContent>
              </Tooltip>

              <AnimatePresence mode="wait" initial={false}>
                {canSend ? (
                  <motion.div
                    key="send"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      onClick={handleSend}
                      disabled={composerDisabled || (!hasPending && !input.trim())}
                      size="icon"
                      className="h-10 w-10 rounded-full shadow-sm"
                    >
                      {isSending || isSendingMedia ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="mic"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setIsRecording(true)}
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 rounded-full"
                          disabled={composerDisabled}
                        >
                          <Mic className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Gravar áudio</TooltipContent>
                    </Tooltip>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs auxiliares */}
      <ContactPickerDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        onConfirm={handleContactConfirm}
      />
      <PollComposerDialog
        open={pollOpen}
        onOpenChange={setPollOpen}
        onConfirm={handlePollConfirm}
      />
    </div>
  );
}

/**
 * Composer memoizado. Re-renderiza apenas quando muda flags relevantes do envio
 * ou a sugestão da IA — assim re-renders do pai (mensagens chegando, presença, etc.)
 * não engasgam a digitação.
 */
export const ChatInput = memo(ChatInputImpl, (prev, next) => {
  return (
    prev.disabled === next.disabled &&
    prev.isSending === next.isSending &&
    prev.placeholder === next.placeholder &&
    prev.aiSuggestion === next.aiSuggestion &&
    prev.onSend === next.onSend &&
    prev.onTyping === next.onTyping &&
    prev.onOpenQuickReplies === next.onOpenQuickReplies &&
    prev.onClearSuggestion === next.onClearSuggestion &&
    prev.onScheduleMessage === next.onScheduleMessage
  );
});

