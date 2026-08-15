import { X, FileText, Loader2, Video as VideoIcon, Mic, Plus, RotateCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { MediaKind } from './MediaAttachment';

export type PendingStatus = 'idle' | 'uploading' | 'done' | 'failed';

export interface PendingAttachment {
  id: string;
  file: File;
  kind: MediaKind;
  /** URL local (createObjectURL) para prévia */
  previewUrl: string;
  caption: string;
  /** Para áudios gravados: duração em ms */
  durationMs?: number;
  status: PendingStatus;
  /** 0..100 */
  progress: number;
  error?: string;
}

interface MediaPreviewBarProps {
  items: PendingAttachment[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onCaptionChange: (id: string, v: string) => void;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onRetry?: (id: string) => void;
  /** quantos a mais cabem ainda (0 = limite atingido) */
  canAddMore: boolean;
  /** trava interações enquanto envia */
  isBusy: boolean;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Thumb({ item }: { item: PendingAttachment }) {
  const { kind, previewUrl, file } = item;
  return (
    <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-background border border-border flex items-center justify-center">
      {kind === 'image' && (
        <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
      )}
      {kind === 'video' && (
        <>
          <video src={previewUrl} className="h-full w-full object-cover" muted />
          <VideoIcon className="absolute h-5 w-5 text-white drop-shadow" />
        </>
      )}
      {kind === 'audio' && <Mic className="h-6 w-6 text-primary" />}
      {kind === 'document' && <FileText className="h-6 w-6 text-muted-foreground" />}

      {item.status === 'uploading' && (
        <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      {item.status === 'done' && (
        <div className="absolute inset-0 bg-emerald-500/70 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-white" />
        </div>
      )}
      {item.status === 'failed' && (
        <div className="absolute inset-0 bg-destructive/80 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-white" />
        </div>
      )}
    </div>
  );
}

export function MediaPreviewBar({
  items,
  activeId,
  onSelect,
  onCaptionChange,
  onRemove,
  onAddMore,
  onRetry,
  canAddMore,
  isBusy,
}: MediaPreviewBarProps) {
  const active = items.find((i) => i.id === activeId) ?? items[0];

  return (
    <div className="px-3 py-2 border-t border-border bg-muted/30 space-y-2">
      {/* Linha 1 — faixa horizontal de thumbs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((item) => {
          const isActive = item.id === active?.id;
          return (
            <div key={item.id} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'block rounded-lg transition-all',
                  isActive ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100',
                )}
              >
                <Thumb item={item} />
              </button>
              {/* progresso */}
              {item.status === 'uploading' && (
                <div className="absolute left-0 right-0 bottom-0 h-1 bg-muted/60 overflow-hidden rounded-b-lg">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {/* remover */}
              {!isBusy && item.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center shadow"
                  aria-label="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {/* retry */}
              {item.status === 'failed' && onRetry && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(item.id);
                  }}
                  className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow"
                  aria-label="Tentar novamente"
                  title="Tentar novamente"
                >
                  <RotateCw className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* botão adicionar */}
        {canAddMore && (
          <button
            type="button"
            onClick={onAddMore}
            disabled={isBusy}
            className="h-14 w-14 flex-shrink-0 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/60 flex items-center justify-center transition-colors disabled:opacity-50"
            aria-label="Adicionar mais"
            title="Adicionar mais"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Linha 2 — info + legenda do ativo */}
      {active && (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium truncate">{active.file.name || 'arquivo'}</p>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {items.length > 1 ? `${items.length} itens · ` : ''}
                {formatBytes(active.file.size)}
              </span>
            </div>
            {(active.kind === 'image' || active.kind === 'video' || active.kind === 'document') && (
              <Input
                value={active.caption}
                onChange={(e) => onCaptionChange(active.id, e.target.value)}
                placeholder="Adicionar legenda…"
                className="h-7 text-xs"
                disabled={isBusy || active.status === 'uploading'}
              />
            )}
            {active.kind === 'audio' && (
              <audio src={active.previewUrl} controls className="h-7 w-full" />
            )}
            {active.status === 'failed' && active.error && (
              <p className="mt-1 text-[11px] text-destructive">{active.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper para gerar IDs estáveis no client. */
export function makePendingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
