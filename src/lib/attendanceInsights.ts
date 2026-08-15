import type { AttendanceReportsData, TeamRankingRow, ChannelStatRow } from '@/hooks/useAttendanceReports';
import { channelLabel, formatDuration } from '@/hooks/useAttendanceReports';

export type AlertSeverity = 'danger' | 'warning' | 'success';

export interface Insight {
  id: string;
  emoji: string;
  text: string;
  severity: AlertSeverity;
}

const sevOrder: Record<AlertSeverity, number> = { danger: 0, warning: 1, success: 2 };

export function buildInsights(data: AttendanceReportsData): Insight[] {
  const out: Insight[] = [];

  if (data.risks.current > 0) {
    out.push({
      id: 'risk',
      emoji: '🚨',
      severity: 'danger',
      text: `${data.risks.current} ${data.risks.current === 1 ? 'lead aguarda' : 'leads aguardam'} resposta há mais de 30 minutos.`,
    });
  }

  if (data.avgResponseMs.pct != null && data.avgResponseMs.pct > 15 && data.avgResponseMs.current > 0) {
    out.push({
      id: 'slower',
      emoji: '⚠️',
      severity: 'warning',
      text: `O tempo médio de resposta aumentou ${Math.abs(Math.round(data.avgResponseMs.pct))}% — agora está em ${formatDuration(data.avgResponseMs.current)}.`,
    });
  }

  // Canal líder em conversões
  const totalConvFromChannels = data.channels.reduce((s, c) => s + c.conversions, 0);
  if (totalConvFromChannels > 0) {
    const leader = [...data.channels].sort((a, b) => b.conversions - a.conversions)[0];
    if (leader && leader.conversions > 0) {
      const share = Math.round((leader.conversions / totalConvFromChannels) * 100);
      if (share >= 60) {
        out.push({
          id: 'channel-winner',
          emoji: '💰',
          severity: 'success',
          text: `O ${channelLabel(leader.channel)} gerou ${share}% das conversões do período.`,
        });
      }
    }
  }

  // Top performer
  if (data.team.length >= 2) {
    const totalConv = data.team.reduce((s, t) => s + t.conversions, 0);
    const top = data.team[0];
    if (top.conversions > 0 && totalConv > 0) {
      const share = Math.round((top.conversions / totalConv) * 100);
      if (share >= 35) {
        out.push({
          id: 'top-performer',
          emoji: '🔥',
          severity: 'success',
          text: `${top.name} foi responsável por ${share}% das vendas.`,
        });
      }
    }

    // Underperformer
    const withConv = data.team.filter(t => t.conversations >= 5);
    if (withConv.length >= 3) {
      const avg = withConv.reduce((s, t) => s + t.conversions, 0) / withConv.length;
      const under = [...withConv].sort((a, b) => a.conversions - b.conversions)[0];
      if (under && avg > 0 && under.conversions < avg * 0.5) {
        out.push({
          id: 'underperformer',
          emoji: '📉',
          severity: 'warning',
          text: `${under.name} está convertendo abaixo da média do time.`,
        });
      }
    }
  }

  // IA resolvendo bem
  if (data.aiResolutionPct.current >= 70) {
    out.push({
      id: 'ai-strong',
      emoji: '✅',
      severity: 'success',
      text: `A IA resolveu ${data.aiResolutionPct.current}% das conversas sem intervenção humana.`,
    });
  }

  return out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]).slice(0, 5);
}
