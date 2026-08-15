import { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, BookOpen } from "lucide-react";
import { useState } from "react";
import { DocsSidebar } from "./DocsSidebar";
import { DocsTOC } from "./DocsTOC";
import { DocsSearch } from "./DocsSearch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { usePlatformName } from "@/hooks/usePlatformName";

import type { DocTrack } from "@/docs/types";
import { cn } from "@/lib/utils";

interface Props {
  tracks: DocTrack[];
  activeTrackId?: string;
  title: string;
  description?: string;
  children: ReactNode;
  /** Caminho atual para SEO canonical e og:url */
  path: string;
}

function upsertMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}
function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function DocsLayout({ tracks, activeTrackId, title, description, children, path }: Props) {
  const contentRef = useRef<HTMLElement>(null);
  const { platformName } = usePlatformName();
  const fullTitle = `${title} · Documentação ${platformName}`;
  const desc = description ?? `Documentação oficial do ${platformName}: CRM omnichannel com IA, atendimento, captura de leads, automações e integrações.`;
  const { pathname } = useLocation();

  // Reset scroll on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  // SEO via document head (no react-helmet dep)
  useEffect(() => {
    document.title = fullTitle;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "article");
    upsertMeta("property", "og:url", path);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertLink("canonical", path);
  }, [fullTitle, desc, path]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DocsTopbar tracks={tracks} />

      <div className="mx-auto max-w-[1480px] px-4 md:px-8 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_240px] lg:gap-10">
        {/* Sidebar desktop */}
        <aside className="hidden lg:block sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto py-8 pr-2">
          <DocsSidebar tracks={tracks} activeTrackId={activeTrackId} />
        </aside>

        {/* Main content */}
        <main ref={contentRef} className="min-w-0 py-8 lg:py-10">
          <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-headings:font-semibold prose-h1:text-3xl md:prose-h1:text-4xl prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-p:leading-relaxed prose-li:my-1 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-strong:text-foreground prose-img:rounded-xl prose-img:border prose-img:border-border">
            {children}
          </article>

          <DocsPageFooter activeTrackId={activeTrackId} tracks={tracks} />
        </main>

        {/* TOC desktop */}
        <aside className="hidden xl:block sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto py-10 pl-4">
          <DocsTOC containerRef={contentRef} />
        </aside>
      </div>

      <DocsFooter />
    </div>
  );
}

/* ---------------- Topbar ---------------- */
function DocsTopbar({ tracks }: { tracks: DocTrack[] }) {
  const { platformName } = usePlatformName();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-[1480px] flex h-16 items-center gap-3 px-4 md:px-8">
        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 overflow-y-auto px-4">
            <div className="py-4" onClick={() => setMobileOpen(false)}>
              <DocsSidebar tracks={tracks} />
            </div>
          </SheetContent>
        </Sheet>

        <Link to="/docs" className="flex items-center gap-2 font-bold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="text-base">{platformName}</span>
          <span className="text-xs font-normal text-muted-foreground hidden sm:inline">docs</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          <Link to="/docs/vendedor" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted">Vendedor</Link>
          <Link to="/docs/admin" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted">Admin</Link>
          <Link to="/docs/desenvolvedor" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted">API</Link>
          <Link to="/docs/changelog" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted">Changelog</Link>
        </nav>

        <div className="flex-1 flex justify-end items-center gap-2">
          <DocsSearch tracks={tracks} />
          <Link
            to="/login"
            className="hidden sm:inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Page footer (prev/next) ---------------- */
function DocsPageFooter({ activeTrackId, tracks }: { activeTrackId?: string; tracks: DocTrack[] }) {
  const { pathname } = useLocation();
  const track = tracks.find((t) => t.id === activeTrackId);
  if (!track) return null;
  const flat = track.sections.flatMap((s) => s.pages.map((p) => ({ slug: p.slug, title: p.title })));
  const idx = flat.findIndex((p) => pathname === `/docs/${track.id}/${p.slug}`);
  if (idx === -1) return null;
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;
  if (!prev && !next) return null;

  return (
    <div className="mt-16 grid gap-3 sm:grid-cols-2 border-t border-border pt-6">
      {prev ? (
        <Link
          to={`/docs/${track.id}/${prev.slug}`}
          className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <div className="text-xs text-muted-foreground">← Anterior</div>
          <div className="mt-1 font-semibold text-foreground group-hover:text-primary">{prev.title}</div>
        </Link>
      ) : (
        <div />
      )}
      {next && (
        <Link
          to={`/docs/${track.id}/${next.slug}`}
          className="group rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/40"
        >
          <div className="text-xs text-muted-foreground">Próximo →</div>
          <div className="mt-1 font-semibold text-foreground group-hover:text-primary">{next.title}</div>
        </Link>
      )}
    </div>
  );
}

/* ---------------- Footer ---------------- */
function DocsFooter() {
  const { platformName } = usePlatformName();
  return (
    <footer className="mt-16 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-[1480px] px-4 md:px-8 py-10 grid gap-8 md:grid-cols-4">
        <div>
          <div className="font-bold text-foreground">{platformName}</div>
          <p className="mt-2 text-sm text-muted-foreground">CRM Omnichannel com IA para times de vendas.</p>
        </div>
        <FooterCol title="Documentação" links={[
          { to: "/docs/vendedor", label: "Para vendedores" },
          { to: "/docs/admin", label: "Para admins" },
          { to: "/docs/super-admin", label: "Para super admins" },
          { to: "/docs/desenvolvedor", label: "Para desenvolvedores" },
        ]} />
        <FooterCol title="Recursos" links={[
          { to: "/docs/conceitos/lead", label: "Conceitos" },
          { to: "/docs/glossario", label: "Glossário" },
          { to: "/docs/changelog", label: "Novidades" },
        ]} />
        <FooterCol title="Plataforma" links={[
          { to: "/login", label: "Entrar" },
          { to: "/", label: "Acessar app" },
        ]} />
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {platformName}. Todos os direitos reservados.
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</div>
      <ul className="mt-3 space-y-1.5">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-muted-foreground hover:text-primary">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
