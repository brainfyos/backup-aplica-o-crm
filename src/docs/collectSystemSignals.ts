// Coleta sinais FACTUAIS do sistema (rotas reais, menus reais) para a varredura
// de documentação. Tudo aqui sai do código-fonte via `?raw` — não há invenção.

// @ts-ignore - vite raw import
import appSource from '../App.tsx?raw';
// @ts-ignore - vite raw import
import adminMenuSource from '../config/adminMenu.ts?raw';
// @ts-ignore - vite raw import
import superAdminSidebarSource from '../components/superadmin/SuperAdminSidebar.tsx?raw';

export interface SystemSignals {
  routes: string[];
  admin_menu: Array<{ id: string; label: string; group?: string }>;
  super_admin_menu: Array<{ id: string; label: string }>;
  collected_at: string;
}

function extractRoutes(src: string): string[] {
  const routes = new Set<string>();
  const re = /path\s*=\s*["'`]([^"'`]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const p = m[1].trim();
    if (!p || p === '*') continue;
    routes.add(p);
  }
  return Array.from(routes).sort();
}

function extractMenuItems(src: string): Array<{ id: string; label: string; group?: string }> {
  const items: Array<{ id: string; label: string; group?: string }> = [];
  let currentGroup: string | undefined;

  // Captura `label: '...'` de grupos pais (linhas sem id na mesma) — heurística simples.
  const lines = src.split('\n');
  for (const line of lines) {
    const groupMatch = line.match(/^\s*label:\s*['"`]([^'"`]+)['"`]\s*,?\s*$/);
    if (groupMatch && !line.includes('id:')) {
      currentGroup = groupMatch[1];
      continue;
    }
    const itemMatch = line.match(/id:\s*['"`]([^'"`]+)['"`]\s*,\s*label:\s*['"`]([^'"`]+)['"`]/);
    if (itemMatch) {
      items.push({ id: itemMatch[1], label: itemMatch[2], group: currentGroup });
    }
  }
  return items;
}

export function collectSystemSignals(): SystemSignals {
  return {
    routes: extractRoutes(appSource),
    admin_menu: extractMenuItems(adminMenuSource),
    super_admin_menu: extractMenuItems(superAdminSidebarSource).map(({ id, label }) => ({ id, label })),
    collected_at: new Date().toISOString(),
  };
}
