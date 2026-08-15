import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

export function DocsTOC({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
  const [items, setItems] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (!containerRef.current) return;
    const headings = Array.from(containerRef.current.querySelectorAll("h2, h3")) as HTMLHeadingElement[];
    const list = headings.map((h) => {
      if (!h.id) {
        const id = h.textContent?.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") ?? "";
        h.id = id;
      }
      return { id: h.id, text: h.textContent ?? "", level: h.tagName === "H2" ? 2 : 3 };
    });
    setItems(list);

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [containerRef]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="Nesta página" className="text-sm">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nesta página</div>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block border-l-2 py-1 transition-colors",
                item.level === 3 ? "pl-6" : "pl-3",
                activeId === item.id
                  ? "border-primary text-primary font-medium -ml-px"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
