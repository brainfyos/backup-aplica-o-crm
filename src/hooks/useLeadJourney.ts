import { useQuery } from '@tanstack/react-query';
import { LeadJourney, type JourneyFilters, type JourneyCategory } from '@/lib/leadJourney';

export function useJourneyMetrics(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'metrics', filters],
    queryFn: () => LeadJourney.getMetrics(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyStages(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'stages', filters],
    queryFn: () => LeadJourney.getStages(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyTouchpoints(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'touchpoints', filters],
    queryFn: () => LeadJourney.getTouchpoints(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyTimeline(leadId: string | null) {
  return useQuery({
    queryKey: ['journey', 'timeline', leadId],
    queryFn: () => LeadJourney.getTimeline(leadId!),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export function useJourneyLeadsInStage(
  filters: JourneyFilters | null,
  category: JourneyCategory | null,
) {
  return useQuery({
    queryKey: ['journey', 'stage-leads', filters, category],
    queryFn: () => LeadJourney.getLeadsInStage(filters!, category!),
    enabled: !!filters?.organizationId && !!category,
    staleTime: 30_000,
  });
}

export function useJourneyOrigins(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'origins', filters],
    queryFn: () => LeadJourney.getAcquisitionByOrigin(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyCampaigns(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'campaigns', filters],
    queryFn: () => LeadJourney.getAcquisitionByCampaign(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyCreatives(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'creatives', filters],
    queryFn: () => LeadJourney.getAcquisitionByCreative(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 60_000,
  });
}

export function useJourneyLeadSummary(leadId: string | null) {
  return useQuery({
    queryKey: ['journey', 'lead-summary', leadId],
    queryFn: () => LeadJourney.getLeadSummary(leadId!),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export function useJourneyBottlenecks(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'bottlenecks', filters],
    queryFn: () => LeadJourney.getBottlenecks(filters!),
    enabled: !!filters?.organizationId,
    staleTime: 30_000,
  });
}

export function useJourneyRealtimeFeed(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['journey', 'realtime-feed', filters],
    queryFn: () => LeadJourney.getRealtimeFeed(filters!, 50),
    enabled: !!filters?.organizationId,
    staleTime: 15_000,
  });
}
