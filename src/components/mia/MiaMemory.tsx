import { useState } from "react";
import { useMiaMemory } from "@/hooks/useMiaMemory";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus, X, Save } from "lucide-react";
import { toast } from "sonner";

export function MiaMemory() {
  const { profile } = useAuth();
  const { memory, loading, upsert, addFact, removeFact, setPreference, removePreference } = useMiaMemory();
  const [displayName, setDisplayName] = useState<string>("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [prefKey, setPrefKey] = useState("");
  const [prefValue, setPrefValue] = useState("");

  if (loading) return <p className="text-sm text-muted-foreground">Carregando memória…</p>;

  const currentName = memory.display_name ?? profile?.full_name ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Identidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Como a Mia te chama nas conversas. Vale por empresa.
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={currentName || "Como você quer ser chamado"}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-9"
            />
            <Button
              size="sm"
              onClick={async () => {
                const name = displayName.trim();
                if (!name) return;
                await upsert({ display_name: name });
                setDisplayName("");
                toast.success("Nome atualizado");
              }}
            >
              <Save className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </div>
          {currentName && (
            <p className="text-xs text-muted-foreground">Atualmente: <strong className="text-foreground">{currentName}</strong></p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fatos que a Mia lembra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {memory.facts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum fato salvo. Diga à Mia: <em>"lembra que meu time principal é o comercial"</em>.
            </p>
          )}
          <div className="space-y-2">
            {memory.facts.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-2 p-2 rounded border bg-card">
                <div className="min-w-0">
                  <Badge variant="secondary" className="text-[10px]">{f.key}</Badge>
                  <p className="text-sm mt-1 break-words">{f.value}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFact(f.key)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <Input placeholder="chave (ex: cidade)" value={key} onChange={(e) => setKey(e.target.value)} className="h-9" />
            <Input placeholder="valor" value={value} onChange={(e) => setValue(e.target.value)} className="h-9" />
            <Button size="sm" onClick={async () => { await addFact(key, value); setKey(""); setValue(""); }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Preferências</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.keys(memory.preferences ?? {}).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sem preferências. Diga à Mia: <em>"prefiro respostas curtas"</em>.
            </p>
          )}
          <div className="space-y-2">
            {Object.entries(memory.preferences ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 p-2 rounded border bg-card">
                <div>
                  <Badge variant="outline" className="text-[10px]">{k}</Badge>
                  <span className="text-sm ml-2">{String(v)}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePreference(k)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <Input placeholder="chave (ex: tom)" value={prefKey} onChange={(e) => setPrefKey(e.target.value)} className="h-9" />
            <Input placeholder="valor (ex: direto)" value={prefValue} onChange={(e) => setPrefValue(e.target.value)} className="h-9" />
            <Button size="sm" onClick={async () => {
              if (!prefKey.trim()) return;
              await setPreference(prefKey.trim(), prefValue);
              setPrefKey(""); setPrefValue("");
            }}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
