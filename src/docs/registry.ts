import {
  Headphones,
  Settings as SettingsIcon,
  Crown,
  Code2,
  BookMarked,
} from "lucide-react";
import type { DocTrack } from "./types";
import { vendedorPages } from "./content/vendedor";
import { adminPages } from "./content/admin";
import { superAdminPages } from "./content/superAdmin";
import { devPages } from "./content/desenvolvedor";
import { conceitosPages } from "./content/conceitos";

function groupBySection(pages: typeof vendedorPages) {
  const map = new Map<string, typeof vendedorPages>();
  for (const p of pages) {
    const key = p.section ?? "Geral";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries()).map(([label, pgs]) => ({
    label,
    pages: pgs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  }));
}

export const TRACKS: DocTrack[] = [
  {
    id: "vendedor",
    label: "Trilha do Vendedor",
    short: "Vendedor",
    description: "Para SDRs, closers e atendentes que usam o Vendus no dia a dia.",
    icon: Headphones,
    accent: "text-emerald-500",
    sections: groupBySection(vendedorPages),
  },
  {
    id: "admin",
    label: "Trilha do Admin",
    short: "Admin",
    description: "Para gestores que configuram a empresa, equipe, IA e integrações.",
    icon: SettingsIcon,
    accent: "text-sky-500",
    sections: groupBySection(adminPages),
  },
  {
    id: "super-admin",
    label: "Trilha do Super Admin",
    short: "Super Admin",
    description: "Para donos da plataforma white label que gerenciam empresas e planos.",
    icon: Crown,
    accent: "text-amber-500",
    sections: groupBySection(superAdminPages),
  },
  {
    id: "desenvolvedor",
    label: "Trilha do Desenvolvedor",
    short: "Desenvolvedor",
    description: "API, webhooks, edge functions e integrações técnicas.",
    icon: Code2,
    accent: "text-violet-500",
    sections: groupBySection(devPages),
  },
  {
    id: "conceitos",
    label: "Conceitos do Vendus",
    short: "Conceitos",
    description: "Glossário profundo dos conceitos principais.",
    icon: BookMarked,
    accent: "text-rose-500",
    sections: groupBySection(conceitosPages),
  },
];

export function findPage(trackId: string, slug: string) {
  const track = TRACKS.find((t) => t.id === trackId);
  if (!track) return null;
  for (const sec of track.sections) {
    const p = sec.pages.find((pg) => pg.slug === slug);
    if (p) return { track, page: p };
  }
  return null;
}
