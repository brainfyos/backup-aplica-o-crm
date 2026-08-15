import { Link, useParams, Navigate } from "react-router-dom";
import { useMemo } from "react";
import {
  ArrowRight,
  BookMarked,
  Sparkles,
  Search as SearchIcon,
  BookOpen,
} from "lucide-react";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { TRACKS, findPage } from "@/docs/registry";
import { usePlatformName } from "@/hooks/usePlatformName";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { PageHero, KeyValue } from "@/docs/components";
import { useDocsPage } from "@/hooks/useDocs";

/* ============================================================
   Router público — /docs/*
   ============================================================ */
export default function Docs() {
  const params = useParams<{ track?: string; slug?: string }>();
  const { track, slug } = params;

  // /docs → Home
  if (!track) return <DocsHome />;

  // /docs/glossario → glossário (página solta)
  if (track === "glossario") return <Glossario />;
  if (track === "changelog") return <Changelog />;

  const trackObj = TRACKS.find((t) => t.id === track);
  if (!trackObj) return <Navigate to="/docs" replace />;

  // /docs/:track → index da trilha
  if (!slug) return <TrackIndex trackId={track} />;

  // /docs/:track/:slug → conteúdo
  return <PageRoute track={track} slug={slug} />;
}

function PageRoute({ track, slug }: { track: string; slug: string }) {
  const { data: dbPage } = useDocsPage(track, slug);
  const found = findPage(track, slug);
  // Se nem DB nem TSX têm a página, redireciona
  if (!dbPage && !found) return <Navigate to={`/docs/${track}`} replace />;

  const title = dbPage?.title || found?.page.title || slug;
  const description = dbPage?.description || found?.page.description || "";
  const hasDbContent = !!(dbPage?.content_html && dbPage.content_html.trim().length > 10);

  return (
    <DocsLayout
      tracks={TRACKS}
      activeTrackId={track}
      title={title}
      description={description}
      path={`/docs/${track}/${slug}`}
    >
      {hasDbContent ? (
        <div dangerouslySetInnerHTML={{ __html: dbPage!.content_html! }} />
      ) : found ? (
        found.page.content
      ) : (
        <PageHero eyebrow="Documentação" icon={BookOpen} title={title} description={description} />
      )}
    </DocsLayout>
  );
}

/* ============================================================
   HOME
   ============================================================ */
function DocsHome() {
  const { platformName } = usePlatformName();
  return (
    <DocsLayout
      tracks={TRACKS}
      title="Documentação"
      description={`Tudo sobre o ${platformName}: CRM omnichannel com IA. Trilhas por papel: vendedor, admin, super admin e desenvolvedor.`}
      path="/docs"
    >
      {/* Hero */}
      <div className="not-prose">
        <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-background to-background p-8 md:p-12 mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <BookOpen className="h-3.5 w-3.5" />
            Documentação oficial
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Aprenda tudo sobre o {platformName}
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-2xl">
            CRM omnichannel com IA para times de vendas. Capture, atenda, qualifique, agende, venda e nutra —
            tudo em um lugar só.
          </p>
          <div className="mt-6 max-w-md">
            <DocsSearch tracks={TRACKS} />
          </div>
        </div>

        {/* Trilhas */}
        <h2 className="text-2xl font-bold text-foreground mb-1">Escolha a sua trilha</h2>
        <p className="text-muted-foreground mb-6">Documentação organizada por papel.</p>

        <div className="grid gap-4 md:grid-cols-2">
          {TRACKS.filter((t) => t.id !== "conceitos").map((t) => {
            const Icon = t.icon;
            const total = t.sections.reduce((acc, s) => acc + s.pages.length, 0);
            return (
              <Link
                key={t.id}
                to={`/docs/${t.id}`}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground group-hover:text-primary">{t.label}</h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                    <p className="mt-3 text-xs font-mono text-muted-foreground">{total} páginas</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Conceitos + glossário + changelog */}
        <h2 className="text-2xl font-bold text-foreground mt-12 mb-6">Recursos</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/docs/conceitos/lead" className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition">
            <BookMarked className="h-5 w-5 text-rose-500 mb-2" />
            <div className="font-semibold text-foreground">Conceitos</div>
            <p className="mt-1 text-sm text-muted-foreground">Glossário profundo dos conceitos do Vendus.</p>
          </Link>
          <Link to="/docs/glossario" className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition">
            <SearchIcon className="h-5 w-5 text-sky-500 mb-2" />
            <div className="font-semibold text-foreground">Glossário A→Z</div>
            <p className="mt-1 text-sm text-muted-foreground">Termos curtos com link para o conceito completo.</p>
          </Link>
          <Link to="/docs/changelog" className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition">
            <Sparkles className="h-5 w-5 text-emerald-500 mb-2" />
            <div className="font-semibold text-foreground">Changelog</div>
            <p className="mt-1 text-sm text-muted-foreground">O que mudou em cada versão.</p>
          </Link>
        </div>
      </div>
    </DocsLayout>
  );
}

/* ============================================================
   ÍNDICE DA TRILHA
   ============================================================ */
function TrackIndex({ trackId }: { trackId: string }) {
  const track = TRACKS.find((t) => t.id === trackId)!;
  const Icon = track.icon;
  return (
    <DocsLayout
      tracks={TRACKS}
      activeTrackId={trackId}
      title={track.label}
      description={track.description}
      path={`/docs/${trackId}`}
    >
      <PageHero eyebrow="Trilha" icon={Icon} title={track.label} description={track.description} />

      {track.sections.map((sec) => (
        <section key={sec.label}>
          <h2>{sec.label}</h2>
          <div className="not-prose grid gap-3 sm:grid-cols-2 my-4">
            {sec.pages.map((p) => (
              <Link
                key={p.slug}
                to={`/docs/${trackId}/${p.slug}`}
                className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground group-hover:text-primary">{p.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </DocsLayout>
  );
}

/* ============================================================
   GLOSSÁRIO
   ============================================================ */
function Glossario() {
  const items = useMemo(() => {
    const conceitos = TRACKS.find((t) => t.id === "conceitos")!.sections.flatMap((s) => s.pages);
    const extras: Array<{ slug: string; title: string; description: string; track?: string }> = [
      { slug: "spin", title: "SPIN Selling", description: "Framework de venda consultiva (Situação, Problema, Implicação, Necessidade)." },
      { slug: "tma", title: "TMA — Tempo Médio de Atendimento" , description: "Indicador de eficiência operacional do time." },
      { slug: "tmr", title: "TMR — Tempo Médio de Resposta", description: "Quanto demora a primeira resposta após mensagem do lead." },
      { slug: "sla", title: "SLA — Service Level Agreement", description: "Compromisso de prazo de atendimento ou resposta." },
      { slug: "icp", title: "ICP — Ideal Customer Profile", description: "Perfil ideal de cliente. Configurado por produto." },
      { slug: "utm", title: "UTM", description: "Parâmetros de rastreamento de origem (source, medium, campaign, content, term)." },
      { slug: "ddi", title: "DDI 55", description: "Discagem Direta Internacional. Vendus normaliza para 55 (Brasil) em todo número."  },
      { slug: "rls", title: "RLS — Row Level Security", description: "Controle de acesso por linha. Base da segurança multi-tenant." },
      { slug: "edge-function", title: "Edge Function", description: "Função serverless (Deno) executada no edge. Vendus tem 81 delas." },
      { slug: "realtime", title: "Realtime", description: "Subscrição a mudanças no banco em tempo real (postgres_changes)." },
    ];

    const all = [
      ...conceitos.map((c) => ({ slug: c.slug, title: c.title, description: c.description, track: "conceitos" })),
      ...extras,
    ];
    return all.sort((a, b) => a.title.localeCompare(b.title, "pt"));
  }, []);

  return (
    <DocsLayout tracks={TRACKS} title="Glossário" description="Todos os termos do Vendus em ordem alfabética." path="/docs/glossario">
      <PageHero eyebrow="Recursos" icon={BookMarked} title="Glossário A→Z" description="Termos do Vendus em ordem alfabética. Clique para abrir o conceito completo." />

      <KeyValue rows={items.map((it) => [
        it.track === "conceitos"
          ? <Link to={`/docs/conceitos/${it.slug}`} className="text-primary hover:underline">{it.title}</Link>
          : it.title,
        it.description,
      ])} />
    </DocsLayout>
  );
}

/* ============================================================
   CHANGELOG
   ============================================================ */
function Changelog() {
  const entries: Array<{ version: string; date: string; tag: "Novidade" | "Melhoria" | "Correção"; items: string[] }> = [
    {
      version: "2026.06",
      date: "Junho de 2026",
      tag: "Novidade",
      items: [
        "Documentação pública /docs com 4 trilhas (Vendedor, Admin, Super Admin, Dev) e busca cmd+K.",
        "Radar de IA com ações 1-clique (abrir conversa, chamar IA, atribuir, criar tarefa).",
        "Preservação de histórico ao trocar conexão Evolution.",
        "Cadências inteligentes com gerador IA e auto-stop por resposta.",
      ],
    },
    {
      version: "2026.05",
      date: "Maio de 2026",
      tag: "Melhoria",
      items: [
        "Agente IA: 18+ ferramentas nativas, hierarquia de seleção e limites de segurança.",
        "WhatsApp multi-provedor v4 (Evolution Go global).",
        "Aparência por canal nos funis (4 temas independentes).",
      ],
    },
    {
      version: "2026.04",
      date: "Abril de 2026",
      tag: "Novidade",
      items: [
        "Hotmart: postback com validação hottok por org + sync OAuth.",
        "Inbox: visibilidade por setor com permissões granulares.",
        "Auto-criação de lead em toda conversa nova.",
      ],
    },
    {
      version: "2026.03",
      date: "Março de 2026",
      tag: "Melhoria",
      items: [
        "Copiloto multimodal (Gemini Vision + ElevenLabs Scribe v2).",
        "BANT framework com 17 perguntas e score 0-100.",
        "White label engine v2 com HSL dinâmico.",
      ],
    },
  ];
  return (
    <DocsLayout tracks={TRACKS} title="Changelog" description="Novidades, melhorias e correções por versão." path="/docs/changelog">
      <PageHero eyebrow="Recursos" icon={Sparkles} title="Changelog" description="O que mudou em cada versão do Vendus." />

      <div className="not-prose space-y-6">
        {entries.map((e) => (
          <div key={e.version} className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="font-mono text-sm font-bold text-foreground">{e.version}</div>
              <div className="text-xs text-muted-foreground">{e.date}</div>
              <span className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                e.tag === "Novidade" ? "bg-emerald-500/10 text-emerald-600"
                : e.tag === "Melhoria" ? "bg-sky-500/10 text-sky-600"
                : "bg-amber-500/10 text-amber-600"
              }`}>{e.tag}</span>
            </div>
            <ul className="space-y-2 text-sm text-foreground/80">
              {e.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DocsLayout>
  );
}
