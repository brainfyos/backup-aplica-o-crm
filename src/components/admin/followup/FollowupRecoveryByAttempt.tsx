import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';

interface Props {
  data: Array<{ attempt: number; sent: number; replied: number; rate: number }>;
}

export function FollowupRecoveryByAttempt({ data }: Props) {
  const chartData = data.map(d => ({ name: `${d.attempt}ª Tentativa`, value: d.rate }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recuperação por tentativa</CardTitle>
        <p className="text-xs text-muted-foreground">% de respostas obtidas em cada tentativa</p>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v}%`} cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="value" position="top" formatter={(v: number) => `${v}%`} fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
