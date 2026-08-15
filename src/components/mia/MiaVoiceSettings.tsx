import { useCallback, useEffect, useState } from "react";
import { AudioLines, Gauge, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { OPENAI_REALTIME_VOICES } from "@/config/openaiRealtimeVoices";

type Personality = "natural" | "executive" | "energetic" | "calm";
type Sensitivity = "low" | "balanced" | "high";

interface VoicePreferences {
  mia_voice: string;
  mia_personality: Personality;
  mia_mic_sensitivity: Sensitivity;
}

const DEFAULTS: VoicePreferences = {
  mia_voice: "shimmer",
  mia_personality: "natural",
  mia_mic_sensitivity: "low",
};

const PERSONALITIES: Array<{ id: Personality; label: string; description: string }> = [
  { id: "natural", label: "Natural", description: "Humana, calorosa e espontânea" },
  { id: "executive", label: "Executiva", description: "Confiante, direta e estratégica" },
  { id: "energetic", label: "Energética", description: "Expressiva, ágil e entusiasmada" },
  { id: "calm", label: "Calma", description: "Acolhedora, paciente e serena" },
];

const SENSITIVITIES: Array<{ id: Sensitivity; label: string; description: string }> = [
  { id: "low", label: "Pouco sensível", description: "Recomendado: ignora melhor ruídos do ambiente" },
  { id: "balanced", label: "Equilibrado", description: "Bom para ambientes silenciosos" },
  { id: "high", label: "Muito sensível", description: "Capta fala baixa, mas pode reagir a ruídos" },
];

export function MiaVoiceSettings({ active }: { active: boolean }) {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<VoicePreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!profile?.id || !profile.organization_id) return;
      const { data } = await supabase
        .from("mia_user_memory")
        .select("preferences")
        .eq("user_id", profile.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (!alive) return;
      const stored = ((data?.preferences ?? {}) as unknown) as Partial<VoicePreferences>;
      setPrefs({ ...DEFAULTS, ...stored });
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [profile?.id, profile?.organization_id]);

  const update = useCallback(async <K extends keyof VoicePreferences>(key: K, value: VoicePreferences[K]) => {
    if (!profile?.id || !profile.organization_id || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      const { data: current, error: readError } = await supabase
        .from("mia_user_memory")
        .select("id, preferences")
        .eq("user_id", profile.id)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (readError) throw readError;
      const currentPreferences = ((current?.preferences ?? {}) as unknown) as Record<string, unknown>;
      const preferences = { ...currentPreferences, [key]: value };
      const query = current?.id
        ? supabase.from("mia_user_memory").update({ preferences: preferences as any }).eq("id", current.id)
        : supabase.from("mia_user_memory").insert({
            user_id: profile.id,
            organization_id: profile.organization_id,
            preferences: preferences as any,
          } as any);
      const { error } = await query;
      if (error) throw error;
      toast.success("Preferência de voz salva", {
        description: active ? "Ela será aplicada na próxima vez que a Mia for iniciada." : "Será aplicada na próxima conversa.",
      });
    } catch (error: unknown) {
      setPrefs(previous);
      toast.error("Não foi possível salvar", { description: error instanceof Error ? error.message : "Erro inesperado" });
    } finally {
      setSaving(false);
    }
  }, [active, prefs, profile?.id, profile?.organization_id, saving]);

  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando voz…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-xs"><AudioLines className="h-3.5 w-3.5" /> Voz da Mia</Label>
        <Select value={prefs.mia_voice} disabled={saving} onValueChange={(value) => update("mia_voice", value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPENAI_REALTIME_VOICES.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                <span className="flex items-center gap-2">{voice.name}{voice.id === "shimmer" && <Badge variant="secondary" className="h-4 px-1 text-[9px]">atual</Badge>}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">{OPENAI_REALTIME_VOICES.find((voice) => voice.id === prefs.mia_voice)?.description}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-xs"><Sparkles className="h-3.5 w-3.5" /> Personalidade</Label>
        <Select value={prefs.mia_personality} disabled={saving} onValueChange={(value) => update("mia_personality", value as Personality)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PERSONALITIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">{PERSONALITIES.find((item) => item.id === prefs.mia_personality)?.description}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-xs"><Gauge className="h-3.5 w-3.5" /> Sensibilidade do microfone</Label>
        <Select value={prefs.mia_mic_sensitivity} disabled={saving} onValueChange={(value) => update("mia_mic_sensitivity", value as Sensitivity)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SENSITIVITIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">{SENSITIVITIES.find((item) => item.id === prefs.mia_mic_sensitivity)?.description}</p>
      </div>

      <div className="rounded-xl border bg-muted/30 p-3 text-[10px] leading-relaxed text-muted-foreground">
        Diga <strong className="text-foreground">“encerrar”</strong>, <strong className="text-foreground">“desligar”</strong> ou <strong className="text-foreground">“boa noite”</strong>. A sessão e a escuta passiva serão interrompidas imediatamente.
      </div>
    </div>
  );
}
