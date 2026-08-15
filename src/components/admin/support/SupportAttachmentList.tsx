import { useState } from 'react';
import { FileText, Download, Image as ImageIcon } from 'lucide-react';
import { getAttachmentSignedUrl, type SupportAttachmentRow } from '@/lib/supportAttachments';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  attachments: SupportAttachmentRow[];
  align?: 'start' | 'end';
}

export function SupportAttachmentList({ attachments, align = 'start' }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const open = async (a: SupportAttachmentRow, asImage: boolean) => {
    try {
      const url = await getAttachmentSignedUrl(a.storage_path);
      if (asImage) setLightbox(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível abrir o anexo');
    }
  };

  return (
    <>
      <div className={`mt-2 flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
        {attachments.map((a) => {
          const isImage = a.mime_type.startsWith('image/');
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => open(a, isImage)}
              className="flex items-center gap-2 max-w-[220px] rounded-lg border border-border/60 bg-background/40 px-2 py-1.5 text-left hover:bg-background/80 transition"
              title={a.file_name}
            >
              {isImage ? (
                <ImageIcon className="h-4 w-4 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs truncate flex-1">{a.file_name}</span>
              <Download className="h-3.5 w-3.5 opacity-60" />
            </button>
          );
        })}
      </div>
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="sm:max-w-3xl p-2 bg-background">
          {lightbox && (
            <img src={lightbox} alt="Anexo" className="max-h-[80vh] w-auto mx-auto rounded" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
