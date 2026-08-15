import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Lead = Tables<'leads'> & {
  pipeline_stages?: Tables<'pipeline_stages'> | null;
};

export type CustomFieldOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'is_empty'
  | 'is_not_empty';

export type CustomFieldRule = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'select' | 'boolean' | 'date';
  operator: CustomFieldOperator;
  value?: string | number | boolean | null;
  valueTo?: string | number | null;
};

export type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom' | null;

export type LeadFilters = {
  search: string;
  temperature: string[];
  origin: string[];
  channel: string[];
  stageId: string | null;
  squadId: string | null;
  productId: string | null;
  assignedTo: string | null;
  unassigned: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  datePreset: DatePreset;
  utmCampaign: string | null;
  tagIds: string[];
  tagsMatchMode: 'any' | 'all' | 'none';
  excludeTagIds: string[];
  excludeOrigin: string[];
  excludeChannel: string[];
  customFieldRules: CustomFieldRule[];
};

export type LeadSort = {
  column: string;
  direction: 'asc' | 'desc';
};

const defaultFilters: LeadFilters = {
  search: '',
  temperature: [],
  origin: [],
  channel: [],
  stageId: null,
  squadId: null,
  productId: null,
  assignedTo: null,
  unassigned: false,
  dateFrom: null,
  dateTo: null,
  datePreset: null,
  utmCampaign: null,
  tagIds: [],
  tagsMatchMode: 'any',
  excludeTagIds: [],
  excludeOrigin: [],
  excludeChannel: [],
  customFieldRules: [],
};

function resolveDateRange(filters: LeadFilters): { from: Date | null; to: Date | null } {
  if (filters.datePreset && filters.datePreset !== 'custom') {
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    if (filters.datePreset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === '7d') {
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === '30d') {
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    }
    return { from, to };
  }
  return { from: filters.dateFrom, to: filters.dateTo };
}

function isServerSideRule(rule: CustomFieldRule): boolean {
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty') return true;
  if (rule.fieldType === 'select' || rule.fieldType === 'boolean') {
    return ['eq', 'neq'].includes(rule.operator);
  }
  if (rule.fieldType === 'text') {
    // Text só roda server-side em comparações de string.
    // Operadores numéricos (>, <, ≥, ≤, entre) caem no client.
    return ['eq', 'neq', 'contains'].includes(rule.operator);
  }
  return false;
}

function evaluateClientRule(value: any, rule: CustomFieldRule): boolean {
  const empty = value === undefined || value === null || String(value).trim() === '';
  if (rule.operator === 'is_empty') return empty;
  if (rule.operator === 'is_not_empty') return !empty;
  if (empty) return false;

  if (rule.fieldType === 'number') {
    const n = Number(value);
    const a = Number(rule.value);
    const b = Number(rule.valueTo);
    if (Number.isNaN(n)) return false;
    switch (rule.operator) {
      case 'eq': return n === a;
      case 'neq': return n !== a;
      case 'gt': return n > a;
      case 'gte': return n >= a;
      case 'lt': return n < a;
      case 'lte': return n <= a;
      case 'between': return n >= a && n <= b;
    }
  }

  if (rule.fieldType === 'date') {
    const t = new Date(String(value)).getTime();
    const a = rule.value ? new Date(String(rule.value)).getTime() : NaN;
    const b = rule.valueTo ? new Date(String(rule.valueTo)).getTime() : NaN;
    if (Number.isNaN(t)) return false;
    switch (rule.operator) {
      case 'eq': return new Date(t).toDateString() === new Date(a).toDateString();
      case 'neq': return new Date(t).toDateString() !== new Date(a).toDateString();
      case 'gt': return t > a;
      case 'gte': return t >= a;
      case 'lt': return t < a;
      case 'lte': return t <= a;
      case 'between': return t >= a && t <= b;
    }
  }

  // Texto: tenta comparação numérica quando faz sentido (ex: "tempo assistido" salvo como string).
  const numericOps: CustomFieldRule['operator'][] = ['gt', 'gte', 'lt', 'lte', 'between'];
  if (rule.fieldType === 'text' && numericOps.includes(rule.operator)) {
    const n = Number(String(value).replace(',', '.'));
    const a = Number(String(rule.value ?? '').replace(',', '.'));
    const b = Number(String(rule.valueTo ?? '').replace(',', '.'));
    if (Number.isNaN(n) || Number.isNaN(a)) return false;
    switch (rule.operator) {
      case 'gt': return n > a;
      case 'gte': return n >= a;
      case 'lt': return n < a;
      case 'lte': return n <= a;
      case 'between': return !Number.isNaN(b) && n >= a && n <= b;
    }
  }

  // Fallback string compare
  const s = String(value);
  const sv = String(rule.value ?? '');
  switch (rule.operator) {
    case 'eq': return s === sv;
    case 'neq': return s !== sv;
    case 'contains': return s.toLowerCase().includes(sv.toLowerCase());
  }
  return true;
}


export function useLeadsManager() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters);
  const [sort, setSort] = useState<LeadSort>({ column: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  // Main leads query
  const { data: leadsData, isLoading, refetch } = useQuery({
    queryKey: ['admin-leads', filters, sort, page, pageSize, activeTab],
    queryFn: async () => {
      // Pré-filtro por etiquetas (inclusão)
      let restrictToIds: string[] | null = null;
      let excludeLeadIds: string[] = [];
      if (filters.tagIds.length > 0) {
        const { data: assigns } = await supabase
          .from('lead_tag_assignments')
          .select('lead_id, tag_id')
          .in('tag_id', filters.tagIds);
        const counts = new Map<string, number>();
        (assigns || []).forEach((a: any) => {
          counts.set(a.lead_id, (counts.get(a.lead_id) || 0) + 1);
        });
        if (filters.tagsMatchMode === 'none') {
          // Excluir leads que possuem qualquer das tags selecionadas
          excludeLeadIds = Array.from(counts.keys());
        } else {
          const ids =
            filters.tagsMatchMode === 'all'
              ? Array.from(counts.entries())
                  .filter(([, n]) => n === filters.tagIds.length)
                  .map(([id]) => id)
              : Array.from(counts.keys());
          restrictToIds = ids;
          if (restrictToIds.length === 0) {
            return { leads: [], total: 0, totalPages: 0 };
          }
        }
      }

      // Pré-filtro por etiquetas a excluir (lista independente)
      if (filters.excludeTagIds.length > 0) {
        const { data: assigns } = await supabase
          .from('lead_tag_assignments')
          .select('lead_id')
          .in('tag_id', filters.excludeTagIds);
        const extra = (assigns || []).map((a: any) => a.lead_id);
        excludeLeadIds = Array.from(new Set([...excludeLeadIds, ...extra]));
      }

      const hasClientRules = filters.customFieldRules.some((r) => !isServerSideRule(r));

      let query: any = supabase
        .from('leads')
        .select(
          `
          *,
          pipeline_stages (*)
        `,
          { count: 'exact' }
        );


      if (restrictToIds) {
        query = query.in('id', restrictToIds);
      }
      if (excludeLeadIds.length > 0) {
        query = query.not('id', 'in', `(${excludeLeadIds.join(',')})`);
      }

      if (profile?.organization_id) {
        query = query.eq('organization_id', profile.organization_id);
      }

      if (activeTab === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (activeTab === 'my-leads' && profile?.id) {
        query = query.or(`assigned_to.eq.${profile.id},sdr_id.eq.${profile.id},closer_id.eq.${profile.id}`);
      } else if (activeTab === 'my-squad' && profile?.id) {
        // Restringe pelos squads do usuário (RLS já filtra; aqui é só para a UI)
        const { data: squadRows } = await supabase
          .from('squad_members')
          .select('squad_id')
          .eq('user_id', profile.id);
        const squadIds = (squadRows || []).map((s: any) => s.squad_id);
        if (squadIds.length === 0) {
          return { leads: [], total: 0, totalPages: 0 };
        }
        query = query.in('squad_id', squadIds);
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,company.ilike.%${filters.search}%`
        );
      }

      if (filters.temperature.length > 0) {
        query = query.in('temperature', filters.temperature as ('hot' | 'warm' | 'cold')[]);
      }
      if (filters.origin.length > 0) {
        query = query.in('lead_origin', filters.origin);
      }
      if (filters.channel.length > 0) {
        query = query.in('lead_channel', filters.channel);
      }
      if (filters.excludeOrigin.length > 0) {
        query = query.not('lead_origin', 'in', `(${filters.excludeOrigin.map((v) => `"${v}"`).join(',')})`);
      }
      if (filters.excludeChannel.length > 0) {
        query = query.not('lead_channel', 'in', `(${filters.excludeChannel.map((v) => `"${v}"`).join(',')})`);
      }
      if (filters.stageId) query = query.eq('current_stage_id', filters.stageId);
      if (filters.squadId) query = query.eq('squad_id', filters.squadId);
      if (filters.productId) query = query.eq('product_id', filters.productId);
      if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
      if (filters.unassigned) query = query.is('assigned_to', null);

      // Date range (with preset)
      const range = resolveDateRange(filters);
      if (range.from) query = query.gte('created_at', range.from.toISOString());
      if (range.to) query = query.lte('created_at', range.to.toISOString());

      if (filters.utmCampaign) query = query.eq('utm_campaign', filters.utmCampaign);

      // Server-side custom field rules (text/select/boolean + empty checks)
      for (const rule of filters.customFieldRules) {
        if (!isServerSideRule(rule)) continue;
        const path = `metadata->custom_fields->>${rule.fieldKey}`;
        if (rule.operator === 'is_empty') {
          query = query.is(path as any, null);
        } else if (rule.operator === 'is_not_empty') {
          query = query.not(path as any, 'is', null);
        } else if (rule.operator === 'eq') {
          query = query.eq(path as any, String(rule.value ?? ''));
        } else if (rule.operator === 'neq') {
          query = query.neq(path as any, String(rule.value ?? ''));
        } else if (rule.operator === 'contains') {
          query = query.ilike(path as any, `%${String(rule.value ?? '')}%`);
        }
      }

      query = query.order(sort.column, { ascending: sort.direction === 'asc' });

      if (hasClientRules) {
        // Pull a wider window so the client-side filter has more rows to evaluate.
        query = query.range(0, 999);
      } else {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      let rows = (data || []) as unknown as Lead[];
      let totalCount = count || 0;

      if (hasClientRules) {
        const clientRules = filters.customFieldRules.filter((r) => !isServerSideRule(r));
        rows = rows.filter((lead: any) => {
          const cf = lead?.metadata?.custom_fields || {};
          return clientRules.every((r) => evaluateClientRule(cf[r.fieldKey], r));
        });
        totalCount = rows.length;
        const startIdx = (page - 1) * pageSize;
        rows = rows.slice(startIdx, startIdx + pageSize);
      }

      return {
        leads: rows,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      };
    },
    enabled: !!profile?.organization_id,
  });


  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['leads-stats', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const orgId = profile.organization_id;
      const base = () =>
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId);

      const [totalRes, hotRes, warmRes, coldRes, unassignedRes] = await Promise.all([
        base(),
        base().eq('temperature', 'hot'),
        base().eq('temperature', 'warm'),
        base().eq('temperature', 'cold'),
        base().is('assigned_to', null),
      ]);

      if (totalRes.error) throw totalRes.error;

      return {
        total: totalRes.count || 0,
        hot: hotRes.count || 0,
        warm: warmRes.count || 0,
        cold: coldRes.count || 0,
        unassigned: unassignedRes.count || 0,
      };
    },
    enabled: !!profile?.organization_id,
  });

  // Create lead mutation
  const createLead = useMutation({
    mutationFn: async (lead: TablesInsert<'leads'>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          organization_id: profile?.organization_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      toast.success('Lead criado com sucesso');
    },
    onError: (error: any) => {
      // 23505 = violação de unique constraint (telefone duplicado na organização)
      if (error?.code === '23505' && String(error?.message || '').includes('leads_org_phone_unique')) {
        toast.error('Já existe um contato com este telefone nesta organização.');
      } else {
        toast.error('Erro ao criar lead: ' + (error?.message || 'desconhecido'));
      }
    },
  });

  // Bulk transfer mutation
  const bulkTransfer = useMutation({
    mutationFn: async ({ 
      leadIds, 
      assignedTo, 
      squadId, 
      reason 
    }: { 
      leadIds: string[]; 
      assignedTo: string | null; 
      squadId: string | null;
      reason?: string;
    }) => {
      const updates = leadIds.map(id => 
        supabase
          .from('leads')
          .update({ 
            assigned_to: assignedTo, 
            squad_id: squadId,
            transfer_reason: reason,
            transferred_at: new Date().toISOString(),
            transferred_by: profile?.id,
          })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads transferidos com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao transferir leads: ' + error.message);
    },
  });

  // Bulk delete mutation
  const bulkDelete = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const { error } = await supabase.rpc('delete_lead_cascade', {
        _lead_ids: leadIds,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads excluídos com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao excluir leads: ' + error.message);
    },
  });

  // Selection handlers
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (!leadsData?.leads) return;
    
    if (selectedLeads.length === leadsData.leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leadsData.leads.map(l => l.id));
    }
  };

  const clearSelection = () => setSelectedLeads([]);

  // Filter handlers
  const updateFilter = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setPage(1);
  };

  // Sort handler
  const updateSort = (column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return {
    // Data
    leads: leadsData?.leads || [],
    total: leadsData?.total || 0,
    totalPages: leadsData?.totalPages || 1,
    stats,
    isLoading,
    
    // Pagination
    page,
    pageSize,
    setPage,
    setPageSize,
    
    // Filters
    filters,
    updateFilter,
    clearFilters,
    
    // Sorting
    sort,
    updateSort,
    
    // Selection
    selectedLeads,
    toggleSelectLead,
    toggleSelectAll,
    clearSelection,
    
    // Tabs
    activeTab,
    setActiveTab,
    
    // Mutations
    createLead,
    bulkTransfer,
    bulkDelete,
    
    // Refetch
    refetch,
  };
}
