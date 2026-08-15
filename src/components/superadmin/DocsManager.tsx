import { useMemo, useState } from 'react';
import {
  useDocsTree,
  useDocsPage,
  useUpsertDocsPage,
  useDeleteDocsPage,
  useUpsertDocsSection,
  useUpsertDocsTrack,
  useDocsProposals,
  useRunDocsScan,
  useApplyProposal,
  useRejectProposal,
} from '@/hooks/useDocs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RichEditor } from '@/components/editor/RichEditor';
import { renderFallbackToHtml } from '@/docs/renderFallbackToHtml';
import { toast } from 'sonner';
import {
  ChevronDown, ChevronRight, Plus, RefreshCw, Trash2, FileText, FolderOpen, BookOpen, Check, X, Sparkles, RotateCcw,
} from 'lucide-react';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export function DocsManager() {
  const { data: tree, isLoading } = useDocsTree();
  const { data: proposals = [] } = useDocsProposals();
  const runScan = useRunDocsScan();
  const upsertTrack = useUpsertDocsTrack();
  const upsertSection = useUpsertDocsSection();

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newTrackOpen, setNewTrackOpen] = useState(false);
  const [newSectionForTrack, setNewSectionForTrack] = useState<string | null>(null);
  const [newPageContext, setNewPageContext] = useState<{ trackId: string; sectionId: string | null } | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const selectedPageMeta = useMemo(() => {
    if (!tree || !selectedPageId) return null;
    const p = tree.pages.find(x => x.id === selectedPageId);
    if (!p) return null;
    const track = tree.tracks.find(t => t.id === p.track_id);
    return track ? { trackSlug: track.slug, pageSlug: p.slug } : null;
  }, [tree, selectedPageId]);

  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const handleScan = async () => {
    try {
      const res = await runScan.mutateAsync();
      toast.success(`Varredura concluída: ${res.proposals_created || 0} sugestões`);
    } catch (e: any) {
      toast.error(e.message || 'Erro na varredura');
    }
  };

  const handleNewTrack = async () => {
    const label = draftLabel.trim();
    if (!label) return;
    await upsertTrack.mutateAsync({
      slug: slugify(label),
      label,
      short_label: label.split(' ').slice(-1)[0],
      icon: 'BookOpen',
      accent: 'text-primary',
      display_order: (tree?.tracks.length || 0) + 1,
    });
    toast.success('Trilha criada');
    setDraftLabel('');
    setNewTrackOpen(false);
  };

  const handleNewSection = async () => {
    const label = draftLabel.trim();
    if (!label || !newSectionForTrack) return;
    const track = tree?.tracks.find(t => t.id === newSectionForTrack);
    if (!track) return;
    const trackSections = tree?.sections.filter(s => s.track_id === track.id) || [];
    await upsertSection.mutateAsync({
      track_id: track.id,
      label,
      display_order: trackSections.length + 1,
    });
    toast.success('Seção criada');
    setDraftLabel('');
    setNewSectionForTrack(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Documentação</h2>
          <p className="text-muted-foreground text-sm">
            Edite trilhas, seções e páginas. Aparece em <code className="text-xs">/docs</code> com sua marca.
          </p>
        </div>
        <div className="flex gap-2">
          <ProposalsDrawer
            proposals={proposals}
            count={proposals.length}
          />
          <Button onClick={handleScan} disabled={runScan.isPending} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${runScan.isPending ? 'animate-spin' : ''}`} />
            {runScan.isPending ? 'Analisando...' : 'Atualizar documentação'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
        {/* Tree */}
        <Card className="lg:sticky lg:top-4 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
          <CardContent className="p-3">
            {isLoading && <Skeleton className="h-40" />}
            {tree && tree.tracks.map(track => {
              const tk = `t-${track.id}`;
              const open = expanded[tk] ?? true;
              const tSections = tree.sections.filter(s => s.track_id === track.id);
              return (
                <div key={track.id} className="mb-2">
                  <div className="flex items-center group">
                    <button
                      onClick={() => toggle(tk)}
                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm font-semibold"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <FolderOpen className="h-4 w-4 text-primary" />
                      {track.label}
                    </button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => { setNewSectionForTrack(track.id); setDraftLabel(''); }}
                      title="Nova seção">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {open && tSections.map(sec => {
                    const sk = `s-${sec.id}`;
                    const sopen = expanded[sk] ?? true;
                    const sPages = tree.pages.filter(p => p.section_id === sec.id).sort((a, b) => a.display_order - b.display_order);
                    return (
                      <div key={sec.id} className="ml-4">
                        <div className="flex items-center group">
                          <button onClick={() => toggle(sk)} className="flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {sopen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {sec.label}
                          </button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => setNewPageContext({ trackId: track.id, sectionId: sec.id })}
                            title="Nova página">
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {sopen && sPages.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPageId(p.id)}
                            className={`ml-5 w-[calc(100%-1.25rem)] flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-muted ${selectedPageId === p.id ? 'bg-primary/10 text-primary' : ''}`}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <Button variant="ghost" size="sm" className="w-full mt-2 gap-2" onClick={() => setNewTrackOpen(true)}>
              <Plus className="h-4 w-4" /> Nova trilha
            </Button>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="min-h-[400px]">
          <CardContent className="p-4">
            {!selectedPageMeta ? (
              <div className="text-center text-muted-foreground py-16">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                Selecione uma página à esquerda para editar
              </div>
            ) : (
              <PageEditor trackSlug={selectedPageMeta.trackSlug} pageSlug={selectedPageMeta.pageSlug} onDelete={() => setSelectedPageId(null)} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* New track dialog */}
      <Dialog open={newTrackOpen} onOpenChange={setNewTrackOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova trilha</DialogTitle></DialogHeader>
          <Input placeholder="Nome da trilha" value={draftLabel} onChange={e => setDraftLabel(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewTrackOpen(false)}>Cancelar</Button>
            <Button onClick={handleNewTrack}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New section dialog */}
      <Dialog open={!!newSectionForTrack} onOpenChange={(o) => !o && setNewSectionForTrack(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova seção</DialogTitle></DialogHeader>
          <Input placeholder="Nome da seção" value={draftLabel} onChange={e => setDraftLabel(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewSectionForTrack(null)}>Cancelar</Button>
            <Button onClick={handleNewSection}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New page dialog */}
      <NewPageDialog
        open={!!newPageContext}
        onClose={() => setNewPageContext(null)}
        trackId={newPageContext?.trackId || ''}
        sectionId={newPageContext?.sectionId || null}
        onCreated={(pid) => { setNewPageContext(null); setSelectedPageId(pid); }}
      />
    </div>
  );
}

function NewPageDialog({ open, onClose, trackId, sectionId, onCreated }: any) {
  const upsert = useUpsertDocsPage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const handle = async () => {
    if (!title.trim()) return;
    const res = await upsert.mutateAsync({
      track_id: trackId, section_id: sectionId, slug: slugify(title), title: title.trim(), description: description.trim() || null,
    });
    setTitle(''); setDescription('');
    toast.success('Página criada');
    onCreated(res.id);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova página</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label>Resumo</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handle}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PageEditor({ trackSlug, pageSlug, onDelete }: { trackSlug: string; pageSlug: string; onDelete: () => void }) {
  const { data: page, isLoading } = useDocsPage(trackSlug, pageSlug);
  const upsert = useUpsertDocsPage();
  const del = useDeleteDocsPage();
  const [draft, setDraft] = useState<any>(null);
  const [editorVersion, setEditorVersion] = useState(0);

  // HTML padrão renderizado a partir dos arquivos TSX (fallback)
  const fallbackHtml = useMemo(
    () => renderFallbackToHtml(trackSlug, pageSlug),
    [trackSlug, pageSlug]
  );

  const effectivePage = draft ?? page;
  const hasOverride = !!(page?.content_html && page.content_html.trim().length > 10);
  // Conteúdo exibido no editor: override do banco OU fallback do código
  const editorValue =
    (effectivePage?.content_html && effectivePage.content_html.trim().length > 10)
      ? (effectivePage.content_json ?? effectivePage.content_html)
      : fallbackHtml;

  if (isLoading || !page) return <Skeleton className="h-40" />;
  if (!effectivePage) return null;

  const save = async () => {
    // Se o admin não editou e o conteúdo é só fallback, salvar o fallback como override.
    const html = effectivePage.content_html?.trim() ? effectivePage.content_html : fallbackHtml;
    await upsert.mutateAsync({
      id: page.id,
      track_id: page.track_id,
      section_id: page.section_id,
      slug: effectivePage.slug,
      title: effectivePage.title,
      description: effectivePage.description,
      content_json: effectivePage.content_json,
      content_html: html,
    });
    setDraft(null);
    toast.success('Página salva');
  };

  const restoreDefault = () => {
    setDraft({ ...effectivePage, content_json: null, content_html: fallbackHtml });
    setEditorVersion(v => v + 1);
    toast.info('Conteúdo padrão restaurado. Clique em Salvar para confirmar.');
  };

  const clearOverride = async () => {
    if (!confirm('Limpar override e voltar a usar o conteúdo padrão do sistema?')) return;
    await upsert.mutateAsync({
      id: page.id,
      track_id: page.track_id,
      section_id: page.section_id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      content_json: null,
      content_html: null,
    });
    setDraft(null);
    setEditorVersion(v => v + 1);
    toast.success('Override removido. A página agora usa o conteúdo padrão.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <code>/docs/{trackSlug}/{effectivePage.slug}</code>
          {hasOverride ? (
            <Badge variant="secondary" className="text-[10px]">Editado</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Padrão do sistema</Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="text-destructive gap-2" onClick={async () => {
            if (!confirm('Excluir esta página?')) return;
            await del.mutateAsync(page.id);
            toast.success('Página excluída');
            onDelete();
          }}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          {fallbackHtml && (
            <Button variant="outline" size="sm" className="gap-2" onClick={restoreDefault}>
              <RotateCcw className="h-4 w-4" /> Restaurar padrão
            </Button>
          )}
          {hasOverride && (
            <Button variant="outline" size="sm" onClick={clearOverride}>
              Limpar override
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!draft}>Salvar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label>Título</Label>
          <Input value={effectivePage.title || ''} onChange={e => setDraft({ ...effectivePage, title: e.target.value })} />
        </div>
        <div>
          <Label>Slug</Label>
          <Input value={effectivePage.slug || ''} onChange={e => setDraft({ ...effectivePage, slug: slugify(e.target.value) })} />
        </div>
      </div>
      <div>
        <Label>Resumo</Label>
        <Textarea rows={2} value={effectivePage.description || ''} onChange={e => setDraft({ ...effectivePage, description: e.target.value })} />
      </div>

      <div>
        <Label>Conteúdo</Label>
        <RichEditor
          key={`${page.id}-${editorVersion}`}
          value={editorValue}
          onChange={(json, html) => setDraft({ ...effectivePage, content_json: json, content_html: html })}
          placeholder="Use a barra de ferramentas para inserir imagens, vídeos do YouTube e links."
        />
        <p className="text-xs text-muted-foreground mt-1">
          {hasOverride
            ? 'Você está editando o conteúdo salvo no banco. Use "Limpar override" para voltar ao padrão do código.'
            : 'O editor mostra o conteúdo padrão do sistema (vindo do código). Edite e salve para sobrescrever — o conteúdo padrão continua disponível via "Restaurar padrão".'}
        </p>
      </div>
    </div>
  );
}

function ProposalsDrawer({ proposals, count }: { proposals: any[]; count: number }) {
  const apply = useApplyProposal();
  const reject = useRejectProposal();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Sparkles className="h-4 w-4" />
          Sugestões
          {count > 0 && <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">{count}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader><SheetTitle>Sugestões pendentes ({count})</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          {count === 0 && <p className="text-sm text-muted-foreground">Nenhuma sugestão. Clique em <b>Atualizar documentação</b> para varrer o sistema.</p>}
          {proposals.map(p => {
            const kind = p.source_signal?.kind || (p.page_id ? 'update' : 'gap');
            const source = p.source_signal?.source || '';
            const reason = p.source_signal?.reason || '';
            const kindLabel: Record<string, { label: string; cls: string }> = {
              gap: { label: 'Nova (lacuna)', cls: 'bg-emerald-500' },
              rename: { label: 'Renomeado', cls: 'bg-amber-500' },
              stale: { label: 'Obsoleto', cls: 'bg-rose-500' },
              update: { label: 'Atualização', cls: 'bg-blue-500' },
            };
            const k = kindLabel[kind] || kindLabel.update;
            return (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] text-white ${k.cls}`}>{k.label}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{p.track_slug}</Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">{p.page_slug}</Badge>
                  </div>
                  <div className="font-semibold text-sm">{p.proposed_title}</div>
                  {p.proposed_description && <p className="text-xs text-muted-foreground">{p.proposed_description}</p>}
                  {(source || reason) && (
                    <div className="text-[11px] bg-muted/50 border rounded p-2 space-y-0.5">
                      {source && <div><span className="text-muted-foreground">Sinal:</span> <code className="text-[10px]">{source}</code></div>}
                      {reason && <div><span className="text-muted-foreground">Motivo:</span> {reason}</div>}
                    </div>
                  )}
                  {p.proposed_content_html && (
                    <div className="text-xs prose prose-sm dark:prose-invert max-w-none border rounded p-3 bg-muted/30 max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: p.proposed_content_html }} />
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={async () => { await reject.mutateAsync(p.id); toast.success('Sugestão rejeitada'); }} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                    <Button size="sm" onClick={async () => {
                      try { await apply.mutateAsync(p.id); toast.success('Aplicada'); }
                      catch (e: any) { toast.error(e.message); }
                    }} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
