import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Image as ImageIcon, Check, RefreshCcw, ExternalLink } from 'lucide-react';
import { useInstagramMedia } from '@/hooks/useInstagramFlowAI';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  connectionId: string | null | undefined;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function InstagramPostPicker({ connectionId, selectedIds, onChange }: Props) {
  const { data: media, isLoading, refetch, isFetching, error } = useInstagramMedia(connectionId);
  const [expanded, setExpanded] = useState(false);

  if (!connectionId) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Selecione uma conta do Instagram para escolher os posts.
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Buscando posts...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
        <p className="text-destructive">{(error as Error).message}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1">
          <RefreshCcw className="h-3.5 w-3.5" /> Tentar de novo
        </Button>
      </div>
    );
  }

  const list = media ?? [];
  const visible = expanded ? list : list.slice(0, 12);
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedIds.length === 0
            ? 'Nenhum post selecionado — o fluxo dispara em qualquer post.'
            : `${selectedIds.length} post${selectedIds.length > 1 ? 's' : ''} selecionado${selectedIds.length > 1 ? 's' : ''}`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} className="gap-1 h-7">
          <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          <ImageIcon className="h-6 w-6 mx-auto mb-2" /> Nenhum post encontrado nesta conta.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {visible.map(m => {
              const sel = selectedIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group ${sel ? 'border-primary ring-2 ring-primary/40' : 'border-transparent hover:border-primary/40'}`}
                >
                  {m.thumbnail_url ? (
                    <img src={m.thumbnail_url} alt={m.caption?.slice(0, 40) ?? 'post'} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {sel && (
                    <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatDistanceToNow(new Date(m.timestamp), { addSuffix: true, locale: ptBR })}
                  </div>
                </button>
              );
            })}
          </div>
          {list.length > 12 && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(v => !v)} className="w-full">
              {expanded ? 'Mostrar menos' : `Mostrar todos (${list.length})`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
