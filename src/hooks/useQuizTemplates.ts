import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { QUIZ_TEMPLATES, type QuizTemplate } from '@/data/quizTemplates';
import { FunnelBlock, generateBlockId } from '@/types/funnel';

export interface DbQuizTemplate extends Omit<QuizTemplate, 'flow_blocks'> {
  organization_id: string | null;
  is_official: boolean;
  is_public: boolean;
  usage_count: number;
  flow_blocks: FunnelBlock[];
  appearance_json?: any;
  settings_json?: any;
  thumbnail?: string | null;
}

/**
 * Une os templates oficiais (seed em código) com os templates salvos pela organização.
 */
export function useQuizTemplates() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['quiz-templates', profile?.organization_id],
    queryFn: async (): Promise<QuizTemplate[]> => {
      const seed: QuizTemplate[] = QUIZ_TEMPLATES;

      if (!profile?.organization_id) return seed;

      const { data, error } = await (supabase as any)
        .from('quiz_templates')
        .select('*')
        .or(`organization_id.eq.${profile.organization_id},is_public.eq.true,organization_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('quiz_templates fetch:', error.message);
        return seed;
      }

      const dbTemplates: QuizTemplate[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: (row.category || 'captacao') as QuizTemplate['category'],
        objective: row.objective || '',
        icon: row.icon || '✨',
        cover_gradient: row.cover_gradient || 'from-emerald-500 to-teal-600',
        estimated_time: row.estimated_time || '60s',
        question_count: row.question_count || 0,
        flow_blocks: (row.flow_json || []) as FunnelBlock[],
        badges: row.badges || [],
      }));

      return [...seed, ...dbTemplates];
    },
    enabled: true,
  });
}

export interface CreateQuizTemplateInput {
  name: string;
  category: QuizTemplate['category'];
  objective?: string;
  description?: string;
  thumbnail?: string;
  icon?: string;
  cover_gradient?: string;
  badges?: string[];
  estimated_time?: string;
  question_count?: number;
  flow_blocks: FunnelBlock[];
  appearance?: any;
  settings?: any;
}

export function useCreateQuizTemplate() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateQuizTemplateInput) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const { data, error } = await (supabase as any).from('quiz_templates').insert({
        organization_id: profile.organization_id,
        created_by: profile.id,
        name: input.name,
        slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
        category: input.category,
        objective: input.objective,
        description: input.description,
        thumbnail: input.thumbnail,
        icon: input.icon || '✨',
        cover_gradient: input.cover_gradient || 'from-emerald-500 to-teal-600',
        badges: input.badges || [],
        estimated_time: input.estimated_time || `${input.flow_blocks.length * 15}s`,
        question_count: input.flow_blocks.filter((b) => b.type === 'buttons').length,
        flow_json: input.flow_blocks,
        appearance_json: input.appearance,
        settings_json: input.settings,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-templates'] });
      toast.success('Template salvo!');
    },
    onError: (e: Error) => toast.error('Erro: ' + e.message),
  });
}

/** Regenera IDs dos blocks para evitar colisão ao clonar. */
export function cloneFlowBlocks(blocks: FunnelBlock[]): FunnelBlock[] {
  const idMap = new Map<string, string>();
  blocks.forEach((b) => idMap.set(b.id, generateBlockId()));
  return blocks.map((b) => {
    const newId = idMap.get(b.id)!;
    const data: any = JSON.parse(JSON.stringify(b.data || {}));
    if (Array.isArray(data.options)) {
      data.options = data.options.map((o: any) => ({
        ...o,
        next_block_id: o.next_block_id && idMap.get(o.next_block_id) || o.next_block_id || null,
      }));
    }
    return {
      ...b,
      id: newId,
      data,
      next_block_id: b.next_block_id && idMap.get(b.next_block_id) || null,
    };
  });
}
