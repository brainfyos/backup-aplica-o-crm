import { useRef, useState } from 'react';
import { Loader2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Form, FormTheme, FormLayoutType, FormProgressPosition, FormHeadingWeight, FormLetterSpacing, FormLogoSize, FormLogoPosition } from '@/types/forms';
import {
  FORM_FONT_OPTIONS,
  FORM_RADIUS_OPTIONS,
  FORM_HEADING_FONT_OPTIONS,
  FORM_HEADING_WEIGHT_OPTIONS,
  FORM_LETTER_SPACING_OPTIONS,
} from './FormThemeWrapper';
import { FormThemePresetsSection } from './FormThemePresetsSection';

interface FormDesignPanelProps {
  form: Form;
  onUpdateTheme: (patch: Partial<FormTheme>) => void;
}

const DEFAULTS: FormTheme = {
  primary_color: '#3B82F6',
  secondary_color: '#1E40AF',
  background_color: '#FFFFFF',
  text_color: '#0F172A',
  font_family: 'Inter',
  border_radius: 'lg',
  button_style: 'filled',
  logo_url: null,
  logo_size: 'md',
  logo_position: 'center',
  show_progress: true,
  progress_color: null,
  progress_position: 'top',
  layout_type: 'one_per_step',
  redirect_url: null,
};

export function FormDesignPanel({ form, onUpdateTheme }: FormDesignPanelProps) {
  const theme: FormTheme = { ...DEFAULTS, ...(form.theme || {}) };
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    if (!profile?.organization_id) {
      toast.error('Organização não encontrada');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${profile.organization_id}/${form.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('form-media')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      // Bucket é privado — usar URL assinada de longa duração (10 anos)
      const { data: signed, error: signErr } = await supabase.storage
        .from('form-media')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw signErr || new Error('Falha ao gerar URL');
      onUpdateTheme({ logo_url: signed.signedUrl });
      toast.success('Logo atualizada');
    } catch (err: any) {
      toast.error('Falha no upload: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="w-full md:w-80 shrink-0 md:border-l bg-card flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold">Design do formulário</h3>
        <p className="text-xs text-muted-foreground">Ajustes refletem em tempo real no preview</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Temas prontos */}
          <FormThemePresetsSection
            currentTheme={theme}
            onApply={(patch) => onUpdateTheme(patch)}
          />

          <Separator />

          {/* Logo */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Logo</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {theme.logo_url ? (
                  <img src={theme.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2 justify-start"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {theme.logo_url ? 'Trocar' : 'Enviar logo'}
                </Button>
                {theme.logo_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive justify-start gap-2"
                    onClick={() => onUpdateTheme({ logo_url: null })}
                  >
                    <Trash2 className="w-4 h-4" /> Remover
                  </Button>
                )}
              </div>
            </div>

            {theme.logo_url && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tamanho</Label>
                  <Select
                    value={theme.logo_size || 'md'}
                    onValueChange={(v: FormLogoSize) => onUpdateTheme({ logo_size: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sm">Pequena</SelectItem>
                      <SelectItem value="md">Média</SelectItem>
                      <SelectItem value="lg">Grande</SelectItem>
                      <SelectItem value="xl">Extra grande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posição</Label>
                  <Select
                    value={theme.logo_position || 'center'}
                    onValueChange={(v: FormLogoPosition) => onUpdateTheme({ logo_position: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Esquerda</SelectItem>
                      <SelectItem value="center">Centro</SelectItem>
                      <SelectItem value="right">Direita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* Progress */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Barra de progresso</Label>
            <div className="flex items-center justify-between">
              <Label htmlFor="progress-show" className="text-sm">Exibir</Label>
              <Switch
                id="progress-show"
                checked={theme.show_progress}
                onCheckedChange={(v) => onUpdateTheme({ show_progress: v })}
              />
            </div>
            {theme.show_progress && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Posição</Label>
                  <Select
                    value={theme.progress_position || 'top'}
                    onValueChange={(v: FormProgressPosition) => onUpdateTheme({ progress_position: v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Topo</SelectItem>
                      <SelectItem value="below_logo">Abaixo da logo</SelectItem>
                      <SelectItem value="bottom">Rodapé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cor</Label>
                  <ColorField
                    value={theme.progress_color || theme.primary_color}
                    onChange={(v) => onUpdateTheme({ progress_color: v })}
                  />
                </div>
              </>
            )}
          </section>

          <Separator />

          {/* Typography */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipografia</Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Fonte do corpo</Label>
              <Select
                value={theme.font_family}
                onValueChange={(v) => onUpdateTheme({ font_family: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fonte dos títulos</Label>
              <Select
                value={theme.heading_font_family || '__same__'}
                onValueChange={(v) =>
                  onUpdateTheme({ heading_font_family: v === '__same__' ? null : v })
                }
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__same__">Igual ao corpo</SelectItem>
                  {FORM_HEADING_FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Peso dos títulos</Label>
              <Select
                value={theme.heading_weight || 'bold'}
                onValueChange={(v: FormHeadingWeight) => onUpdateTheme({ heading_weight: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_HEADING_WEIGHT_OPTIONS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Espaçamento das letras</Label>
              <Select
                value={theme.heading_letter_spacing || 'normal'}
                onValueChange={(v: FormLetterSpacing) =>
                  onUpdateTheme({ heading_letter_spacing: v })
                }
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_LETTER_SPACING_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label htmlFor="heading-upper" className="text-sm">Títulos em CAIXA ALTA</Label>
              <Switch
                id="heading-upper"
                checked={theme.heading_transform === 'uppercase'}
                onCheckedChange={(v) =>
                  onUpdateTheme({ heading_transform: v ? 'uppercase' : 'none' })
                }
              />
            </div>
          </section>

          <Separator />

          {/* Colors */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Cores</Label>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Primária</Label>
                <ColorField value={theme.primary_color} onChange={(v) => onUpdateTheme({ primary_color: v })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fundo</Label>
                <ColorField value={theme.background_color} onChange={(v) => onUpdateTheme({ background_color: v })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Texto</Label>
                <ColorField value={theme.text_color} onChange={(v) => onUpdateTheme({ text_color: v })} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Buttons / Radius */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Botões e cantos</Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Estilo do botão</Label>
              <Select
                value={theme.button_style}
                onValueChange={(v: FormTheme['button_style']) => onUpdateTheme({ button_style: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="filled">Sólido</SelectItem>
                  <SelectItem value="outlined">Contorno</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arredondamento</Label>
              <Select
                value={theme.border_radius}
                onValueChange={(v) => onUpdateTheme({ border_radius: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_RADIUS_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <Separator />

          {/* Layout */}
          <section className="space-y-3">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Layout do formulário</Label>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={theme.layout_type || 'one_per_step'}
                onValueChange={(v: FormLayoutType) => onUpdateTheme({ layout_type: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_per_step">Uma pergunta por vez</SelectItem>
                  <SelectItem value="all_in_one">Tudo em uma página</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Estilo Typeform (passos) ou clássico (página única).
              </p>
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-9 rounded border cursor-pointer bg-transparent"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 font-mono text-xs"
        placeholder="#RRGGBB"
      />
    </div>
  );
}
