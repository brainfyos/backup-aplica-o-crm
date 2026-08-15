import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Paperclip, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
export const ATTACH_MAX_BYTES = 2 * 1024 * 1024; // 2MB final
export const ATTACH_MAX_FILES = 3;

export interface PreparedAttachment {
  file: File;          // já comprimido se for imagem
  previewUrl: string;
  kind: 'image' | 'pdf';
}

interface Props {
  value: PreparedAttachment[];
  onChange: (next: PreparedAttachment[]) => void;
  disabled?: boolean;
}

export function SupportAttachmentPicker({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const remove = (idx: number) => {
    const item = value[idx];
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(value.filter((_, i) => i !== idx));
  };

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (value.length + files.length > ATTACH_MAX_FILES) {
      toast.error(`Máximo de ${ATTACH_MAX_FILES} anexos por mensagem.`);
      return;
    }
    setBusy(true);
    const next: PreparedAttachment[] = [...value];
    try {
      for (const raw of files) {
        const isImage = raw.type.startsWith('image/');
        const isPdf = raw.type === 'application/pdf';
        if (!isImage && !isPdf) {
          toast.error(`"${raw.name}": apenas imagens (JPG, PNG, WEBP) ou PDF.`);
          continue;
        }
        let finalFile: File = raw;
        if (isImage) {
          try {
            const compressed = await imageCompression(raw, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: raw.type === 'image/png' ? 'image/png' : 'image/webp',
              initialQuality: 0.82,
            });
            finalFile = new File(
              [compressed],
              raw.name.replace(/\.(jpg|jpeg|png|webp)$/i, '') +
                (compressed.type === 'image/webp' ? '.webp' : compressed.type === 'image/png' ? '.png' : '.jpg'),
              { type: compressed.type },
            );
          } catch (err) {
            console.error('[attachments] compression failed', err);
            toast.error(`"${raw.name}": falha ao comprimir.`);
            continue;
          }
        }
        if (finalFile.size > ATTACH_MAX_BYTES) {
          toast.error(`"${raw.name}": acima de 2 MB ${isImage ? 'mesmo após compressão' : ''}.`);
          continue;
        }
        next.push({
          file: finalFile,
          previewUrl: URL.createObjectURL(finalFile),
          kind: isImage ? 'image' : 'pdf',
        });
      }
      onChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ATTACH_ACCEPT}
        multiple
        className="hidden"
        onChange={handlePick}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy || value.length >= ATTACH_MAX_FILES}
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
        Anexar imagem ou PDF
      </Button>
      <p className="text-xs text-muted-foreground">
        Até {ATTACH_MAX_FILES} arquivos, 2 MB cada. Imagens são comprimidas automaticamente.
      </p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((a, idx) => (
            <div
              key={idx}
              className="relative group border border-border rounded-lg p-2 flex items-center gap-2 bg-muted/40"
            >
              {a.kind === 'image' ? (
                <img src={a.previewUrl} alt={a.file.name} className="h-12 w-12 object-cover rounded" />
              ) : (
                <div className="h-12 w-12 flex items-center justify-center bg-background rounded">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="text-xs max-w-[160px]">
                <div className="truncate font-medium">{a.file.name}</div>
                <div className="text-muted-foreground">{(a.file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-1 p-1 rounded hover:bg-destructive/10 text-destructive"
                aria-label="Remover anexo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ImageIcon };
