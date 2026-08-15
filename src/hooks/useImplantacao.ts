// Hook enxuto: apenas rastreia progresso do wizard e marca conclusão.
// Toda persistência de dados agora é feita pelos componentes admin oficiais
// (CompanySettings, BusinessHoursManager, ProductManager, AgentsManager,
// SectorsManager, TeamManager) que já rodam com JWT do admin e RLS estrita.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface UseImplantacaoOptions {
  token?: string;
}

function stepKey(orgId: string) {
  return `implantacao_step_${orgId}`;
}

export function useImplantacao({ token }: UseImplantacaoOptions = {}) {
  const { user, profile } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('draft');
  const [currentStep, setCurrentStepState] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token && !user?.id) { setLoading(false); return; }
      setLoading(true);
      try {
        let orgId: string | null = null;
        let st = 'draft';
        let subId: string | null = null;

        if (token) {
          const { data: r, error: e } = await supabase.rpc('validate_onboarding_token', {
            _token: token, _session_token: null, _ip: null,
            _ua: navigator.userAgent.slice(0, 200),
          });
          if (e) throw e;
          const row: any = Array.isArray(r) ? r[0] : r;
          if (!row) throw new Error('invalid_token');
          orgId = row.organization_id;
          st = row.status || 'draft';
          subId = row.submission_id ?? null;
        } else {
          orgId = profile?.organization_id ?? null;
          if (orgId) {
            const { data: org } = await supabase.from('organizations')
              .select('settings, onboarding_completed_at').eq('id', orgId).maybeSingle();
            const s: any = org?.settings || {};
            if ((org as any)?.onboarding_completed_at || s.implantacao_applied_at) st = 'applied';
          }
        }

        if (!active) return;
        if (!orgId) throw new Error('org_not_found');

        submissionIdRef.current = subId;
        setOrganizationId(orgId);
        setStatus(st);

        const saved = parseInt(localStorage.getItem(stepKey(orgId)) || '0', 10);
        if (!Number.isNaN(saved)) setCurrentStepState(saved);
      } catch (e: any) {
        if (!active) return;
        setError(e.message ?? 'Erro ao carregar');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id, token, profile?.organization_id]);

  const setCurrentStep = useCallback((step: number) => {
    setCurrentStepState(step);
    if (organizationId) localStorage.setItem(stepKey(organizationId), String(step));
  }, [organizationId]);

  const markApplied = useCallback(async () => {
    if (!organizationId) return false;
    setSaving(true);
    try {
      const { data: org } = await supabase.from('organizations')
        .select('settings').eq('id', organizationId).maybeSingle();
      const prev = (org?.settings as any) || {};
      const nowIso = new Date().toISOString();
      const { error: e } = await supabase.from('organizations')
        .update({
          settings: { ...prev, implantacao_applied_at: nowIso },
          onboarding_completed_at: nowIso,
        } as any)
        .eq('id', organizationId);
      if (e) throw e;
      setStatus('applied');
      localStorage.removeItem(stepKey(organizationId));
      toast({ title: 'Implantação concluída', description: 'Configurações ativas.' });
      return true;
    } catch (e: any) {
      toast({ title: 'Erro ao concluir', description: e.message ?? 'Tente novamente', variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [organizationId]);

  return {
    organizationId, status, currentStep, setCurrentStep,
    loading, saving, error, markApplied,
  };
}
