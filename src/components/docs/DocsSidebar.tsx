import { Link, useLocation } from "react-router-dom";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DocTrack } from "@/docs/types";

interface Props {
  tracks: DocTrack[];
  activeTrackId?: string;
}

export function DocsSidebar({ tracks, activeTrackId }: Props) {
  const { pathname } = useLocation();
  const active = useMemo(() => tracks.find((t) => t.id === activeTrackId) ?? tracks[0], [tracks, activeTrackId]);

  return (
    <nav aria-label="Navegação da documentação" className="space-y-6">
      {/* Track selector */}
      <div>
        <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trilhas</div>
        <div className="grid gap-1">
          {tracks.map((t) => {
            const isActive = t.id === active.id;
            const Icon = t.icon;
            return (
              <Link
                key={t.id}
                to={`/docs/${t.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                <span>{t.short}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Sections + pages */}
      <div className="space-y-4">
        {active.sections.map((sec) => (
          <SidebarSection key={sec.label} section={sec} trackId={active.id} currentPath={pathname} />
        ))}
      </div>
    </nav>
  );
}

function SidebarSection({ section, trackId, currentPath }: { section: any; trackId: string; currentPath: string }) {
  const hasActive = section.pages.some((p: any) => currentPath === `/docs/${trackId}/${p.slug}`);
  const [open, setOpen] = useState(hasActive || section.pages.length <= 8);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span>{section.label}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <ul className="space-y-0.5">
          {section.pages.map((p: any) => {
            const to = `/docs/${trackId}/${p.slug}`;
            const isActive = currentPath === to;
            return (
              <li key={p.slug}>
                <Link
                  to={to}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium border-l-2 border-primary -ml-px"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  )}
                >
                  {p.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
