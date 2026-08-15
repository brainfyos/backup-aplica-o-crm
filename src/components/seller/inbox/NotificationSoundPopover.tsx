import { Volume2, VolumeX, Play, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { NotificationSoundControls } from '@/hooks/useNotificationSound';

const PRESETS = [0, 0.25, 0.5, 0.75, 1];

interface Props {
  controls: NotificationSoundControls;
}

function VolumeRow({
  label,
  icon,
  value,
  onChange,
  onTest,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  onTest: () => void;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className={cn('space-y-2', disabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={onTest}
          type="button"
        >
          <Play className="h-3 w-3" />
          Testar
        </Button>
      </div>

      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const selected = Math.abs(value - p) < 0.01;
          return (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              className="h-7 flex-1 px-0 text-xs"
              onClick={() => onChange(p)}
            >
              {Math.round(p * 100)}%
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {value === 0 ? (
          <VolumeX className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Volume2 className="h-4 w-4 text-muted-foreground" />
        )}
        <Slider
          value={[pct]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => onChange(v / 100)}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

export function NotificationSoundPopover({ controls }: Props) {
  const {
    masterEnabled,
    setMasterEnabled,
    messageVolume,
    setMessageVolume,
    queueVolume,
    setQueueVolume,
    playMessage,
    playQueue,
    anySoundOn,
  } = controls;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Sons de notificação"
        >
          {anySoundOn ? (
            <Volume2 className="h-4 w-4 text-primary" />
          ) : (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Sons de notificação</div>
            <div className="text-xs text-muted-foreground">Defina volumes por tipo</div>
          </div>
          <Switch checked={masterEnabled} onCheckedChange={setMasterEnabled} />
        </div>

        <div className="h-px bg-border" />

        <VolumeRow
          label="Mensagens dos meus leads"
          icon={<MessageSquare className="h-4 w-4 text-primary" />}
          value={messageVolume}
          onChange={setMessageVolume}
          onTest={playMessage}
          disabled={!masterEnabled}
        />

        <VolumeRow
          label="Novos leads na fila"
          icon={<Users className="h-4 w-4 text-primary" />}
          value={queueVolume}
          onChange={setQueueVolume}
          onTest={playQueue}
          disabled={!masterEnabled}
        />
      </PopoverContent>
    </Popover>
  );
}
