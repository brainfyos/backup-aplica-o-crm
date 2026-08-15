import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { collectSystemSignals } from '@/docs/collectSystemSignals';

export interface DocsTrack {
  id: string;
  slug: string;
  label: string;
  short_label: string;
  description: string | null;
  icon: string;
  accent: string;
  display_order: number;
  is_active: boolean;
}

export interface DocsSection {
  id: string;
  track_id: string;
  label: string;
  display_order: number;
}

export interface DocsPage {
  id: string;
  track_id: string;
  section_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  content_json: any | null;
  content_html: string | null;
  display_order: number;
  updated_at: string;
  updated_by: string | null;
}

export interface DocsProposal {
  id: string;
  page_id: string | null;
  track_slug: string;
  page_slug: string;
  proposed_title: string | null;
  proposed_description: string | null;
  proposed_content_json: any | null;
  proposed_content_html: string | null;
  source_signal: any;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

/* ----------------- Reads (anyone) ----------------- */

export function useDocsTree() {
  return useQuery({
    queryKey: ['docs-tree'],
    queryFn: async () => {
      const [tRes, sRes, pRes] = await Promise.all([
        (supabase as any).from('docs_tracks').select('*').order('display_order'),
        (supabase as any).from('docs_sections').select('*').order('display_order'),
        (supabase as any).from('docs_pages').select('id,track_id,section_id,slug,title,description,display_order,updated_at').order('display_order'),
      ]);
      if (tRes.error) throw tRes.error;
      if (sRes.error) throw sRes.error;
      if (pRes.error) throw pRes.error;
      return {
        tracks: (tRes.data || []) as DocsTrack[],
        sections: (sRes.data || []) as DocsSection[],
        pages: (pRes.data || []) as Omit<DocsPage, 'content_json' | 'content_html'>[],
      };
    },
    staleTime: 60_000,
  });
}

export function useDocsPage(trackSlug?: string, pageSlug?: string) {
  return useQuery({
    queryKey: ['docs-page', trackSlug, pageSlug],
    enabled: !!trackSlug && !!pageSlug,
    queryFn: async () => {
      const { data: track } = await (supabase as any)
        .from('docs_tracks').select('id,slug,label').eq('slug', trackSlug).maybeSingle();
      if (!track) return null;
      const { data: page, error } = await (supabase as any)
        .from('docs_pages').select('*').eq('track_id', track.id).eq('slug', pageSlug).maybeSingle();
      if (error) throw error;
      return page as DocsPage | null;
    },
    staleTime: 30_000,
  });
}

/* ----------------- Writes (super_admin only via RLS) ----------------- */

export function useUpsertDocsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DocsPage> & { id?: string; track_id: string; slug: string; title: string }) => {
      const { data, error } = await (supabase as any).from('docs_pages').upsert(payload).select().single();
      if (error) throw error;
      return data as DocsPage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs-tree'] });
      qc.invalidateQueries({ queryKey: ['docs-page'] });
    },
  });
}

export function useDeleteDocsPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('docs_pages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs-tree'] });
    },
  });
}

export function useUpsertDocsSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id?: string; track_id: string; label: string; display_order?: number }) => {
      const { data, error } = await (supabase as any).from('docs_sections').upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs-tree'] }),
  });
}

export function useUpsertDocsTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DocsTrack> & { slug: string; label: string; short_label: string }) => {
      const { data, error } = await (supabase as any).from('docs_tracks').upsert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs-tree'] }),
  });
}

/* ----------------- Proposals ----------------- */

export function useDocsProposals() {
  return useQuery({
    queryKey: ['docs-proposals'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('docs_change_proposals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DocsProposal[];
    },
  });
}

export function useRunDocsScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const signals = collectSystemSignals();
      const { data, error } = await supabase.functions.invoke('docs-scan-and-propose', { body: { signals } });
      if (error) throw error;
      return data as { proposals_created: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs-proposals'] }),
  });
}

export function useApplyProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { data, error } = await (supabase as any).rpc('apply_docs_proposal', { _proposal_id: proposalId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs-proposals'] });
      qc.invalidateQueries({ queryKey: ['docs-tree'] });
      qc.invalidateQueries({ queryKey: ['docs-page'] });
    },
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('docs_change_proposals')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docs-proposals'] }),
  });
}
