import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { DocTrack } from "@/docs/types";

interface Props {
  tracks: DocTrack[];
}

export function DocsSearch({ tracks }: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(
    () =>
      tracks.map((t) => ({
        track: t,
        pages: t.sections.flatMap((s) => s.pages.map((p) => ({ ...p, section: s.label }))),
      })),
    [tracks]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground md:w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Buscar na documentação...</span>
        <kbd className="hidden sm:inline rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar páginas, conceitos, integrações..." />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {groups.map(({ track, pages }) => (
            <CommandGroup key={track.id} heading={track.label}>
              {pages.map((p) => (
                <CommandItem
                  key={`${track.id}/${p.slug}`}
                  value={`${track.label} ${p.title} ${p.description} ${p.section ?? ""}`}
                  onSelect={() => {
                    navigate(`/docs/${track.id}/${p.slug}`);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{p.title}</span>
                    {p.description && <span className="text-xs text-muted-foreground">{p.description}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
