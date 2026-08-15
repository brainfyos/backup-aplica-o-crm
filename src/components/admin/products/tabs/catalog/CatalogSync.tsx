import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2, ImageOff } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCatalogSync, useCatalogRevalidateMedia } from '@/hooks/useCatalogItems';
import { useAuth } from '@/hooks/useAuth';

interface Props { productId: string }

export function CatalogSync({ productId }: Props) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const sync = useCatalogSync();
  const revalidate = useCatalogRevalidateMedia();
  const [baseUrl, setBaseUrl] = useState('');
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState('generico');
  const [maxItems, setMaxItems] = useState('30');

  const handleSync = () => {
    if (!orgId || !baseUrl.trim()) return;
    sync.mutate({
      organization_id: orgId,
      product_id: productId,
      base_url: baseUrl.trim(),
      item_pattern: pattern.trim() || undefined,
      catalog_type: type,
      max_items: Number(maxItems) || 30,
    });
  };

  const handleRevalidate = () => {
    if (!orgId) return;
    revalidate.mutate({ organization_id: orgId, product_id: productId });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Sincronizar com site externo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A IA vai descobrir páginas no site, extrair os dados de cada item (título, preço, fotos, atributos) e indexar no catálogo.
          Pode levar alguns minutos.
        </p>

        <div>
          <Label>URL base do catálogo *</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://miniobra.com.br/imoveis" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Filtro por padrão na URL</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="/imovel/" />
            <p className="text-xs text-muted-foreground mt-1">Só URLs que contenham esse texto.</p>
          </div>
          <div>
            <Label>Tipo de catálogo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="imoveis">Imóveis</SelectItem>
                <SelectItem value="veiculos">Veículos</SelectItem>
                <SelectItem value="produtos">Produtos</SelectItem>
                <SelectItem value="generico">Genérico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Limite de itens (máx 50)</Label>
          <Input type="number" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} min={1} max={50} />
        </div>

        <Button onClick={handleSync} disabled={!baseUrl.trim() || sync.isPending} className="w-full">
          {sync.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando...</>
          ) : (
            <><Globe className="h-4 w-4 mr-2" /> Iniciar sincronização</>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handleRevalidate}
          disabled={revalidate.isPending}
          className="w-full"
        >
          {revalidate.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Revalidando imagens...</>
          ) : (
            <><ImageOff className="h-4 w-4 mr-2" /> Revalidar imagens do catálogo</>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Remove fotos quebradas ou logotipos gravados por importações anteriores.
        </p>
      </CardContent>
    </Card>
  );
}
