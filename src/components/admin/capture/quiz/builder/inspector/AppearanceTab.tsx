import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { FunnelBlock, FunnelBlockData } from '@/types/funnel';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  block: FunnelBlock;
  onUpdate: (updates: Partial<FunnelBlock>) => void;
}

type Appearance = NonNullable<FunnelBlockData['block_appearance']>;

export function AppearanceTab({ block, onUpdate }: Props) {
  const ap: Appearance = block.data.block_appearance || {};
  const setAp = (patch: Partial<Appearance>) =>
    onUpdate({ data: { ...block.data, block_appearance: { ...ap, ...patch } } });

  return (
    <div className="space-y-4">
      {/* Cor e borda */}
      <Field label="Cor e borda">
        <Select value={ap.variant || 'relief'} onValueChange={(v) => setAp({ variant: v as any })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="relief" className="text-xs">Relevo</SelectItem>
            <SelectItem value="flat" className="text-xs">Plano</SelectItem>
            <SelectItem value="outline" className="text-xs">Contorno</SelectItem>
            <SelectItem value="loose" className="text-xs">Solto</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {block.type === 'buttons' && (
        <>
          <Field label="Indicador">
            <Select value={ap.indicator || 'none'} onValueChange={(v) => setAp({ indicator: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Nenhum</SelectItem>
                <SelectItem value="number" className="text-xs">Numerado</SelectItem>
                <SelectItem value="check" className="text-xs">Check</SelectItem>
                <SelectItem value="radio" className="text-xs">Radio</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Layout">
              <Select value={ap.layout || 'single'} onValueChange={(v) => setAp({ layout: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single" className="text-xs">1 coluna</SelectItem>
                  <SelectItem value="grid-2" className="text-xs">Grade 2 colunas</SelectItem>
                  <SelectItem value="carousel" className="text-xs">Carrossel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Orientação">
              <Select value={ap.orientation || 'vertical'} onValueChange={(v) => setAp({ orientation: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical" className="text-xs">Vertical</SelectItem>
                  <SelectItem value="horizontal" className="text-xs">Horizontal</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Proporção de imagens">
              <Select value={ap.image_ratio || 'auto'} onValueChange={(v) => setAp({ image_ratio: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                  <SelectItem value="1:1" className="text-xs">1:1</SelectItem>
                  <SelectItem value="4:3" className="text-xs">4:3</SelectItem>
                  <SelectItem value="16:9" className="text-xs">16:9</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Disposição">
              <Select value={ap.image_placement || 'image-text'} onValueChange={(v) => setAp({ image_placement: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image-text" className="text-xs">Imagem | Texto</SelectItem>
                  <SelectItem value="text-image" className="text-xs">Texto | Imagem</SelectItem>
                  <SelectItem value="overlay" className="text-xs">Sobreposto</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Sombra">
          <Select value={ap.shadow || 'soft'} onValueChange={(v) => setAp({ shadow: v as any })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Sem sombra</SelectItem>
              <SelectItem value="soft" className="text-xs">Suave</SelectItem>
              <SelectItem value="medium" className="text-xs">Média</SelectItem>
              <SelectItem value="strong" className="text-xs">Forte</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Espaçamento">
          <Select value={ap.spacing || 'simple'} onValueChange={(v) => setAp({ spacing: v as any })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compact" className="text-xs">Compacto</SelectItem>
              <SelectItem value="simple" className="text-xs">Simples</SelectItem>
              <SelectItem value="spacious" className="text-xs">Espaçoso</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Largura */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs">Largura</Label>
          <span className="text-[11px] font-mono text-muted-foreground">{ap.width_pct ?? 100}%</span>
        </div>
        <Slider
          min={40}
          max={100}
          step={1}
          value={[ap.width_pct ?? 100]}
          onValueChange={([v]) => setAp({ width_pct: v })}
        />
      </div>

      {/* Alinhamento */}
      <Field label="Alinhamento">
        <div className="flex gap-1 bg-muted/40 rounded-md p-0.5">
          {([
            { v: 'left', I: AlignLeft },
            { v: 'center', I: AlignCenter },
            { v: 'right', I: AlignRight },
          ] as const).map(({ v, I }) => {
            const active = (ap.align || 'center') === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setAp({ align: v })}
                className={cn(
                  'flex-1 h-7 rounded flex items-center justify-center transition',
                  active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <I className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
