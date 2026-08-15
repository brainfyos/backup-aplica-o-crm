import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type TrackId = "vendedor" | "admin" | "super-admin" | "desenvolvedor" | "conceitos";

export interface DocPage {
  slug: string; // ex: "inbox" → /docs/vendedor/inbox
  title: string;
  description: string;
  track: TrackId | "root";
  section?: string; // grouping inside sidebar
  order?: number;
  content: ReactNode;
}

export interface DocSection {
  label: string;
  pages: DocPage[];
}

export interface DocTrack {
  id: TrackId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind text color class, ex "text-emerald-500"
  sections: DocSection[];
}
