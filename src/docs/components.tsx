import { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------- Callout ---------------- */
type CalloutType = "info" | "warn" | "tip" | "danger" | "success";

const CALLOUT: Record<CalloutType, { icon: any; cls: string; label: string }> = {
  info:    { icon: Info,          cls: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",       label: "Nota" },
  tip:     { icon: Lightbulb,     cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300", label: "Dica" },
  warn:    { icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",label: "Atenção" },
  danger:  { icon: ShieldAlert,   cls: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",       label: "Crítico" },
  success: { icon: Check,         cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300", label: "Boa prática" },
};

export function Callout({ type = "info", title, children }: { type?: CalloutType; title?: string; children: ReactNode }) {
  const { icon: Icon, cls, label } = CALLOUT[type];
  return (
    <div className={cn("not-prose my-5 rounded-xl border p-4 flex gap-3", cls)}>
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm leading-relaxed">
        <div className="font-semibold mb-1 text-foreground">{title ?? label}</div>
        <div className="text-foreground/80 [&_p]:m-0 [&_p+p]:mt-2">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Steps ---------------- */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="not-prose my-5 space-y-4 border-l border-border pl-6 ml-2">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[34px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        •
      </span>
      <div className="font-semibold text-foreground">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-foreground leading-relaxed [&_p]:m-0 [&_p+p]:mt-2">{children}</div>}
    </li>
  );
}

/* ---------------- KeyValue table ---------------- */
export function KeyValue({ rows }: { rows: Array<[ReactNode, ReactNode] | [ReactNode, ReactNode, string]> }) {
  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v, hint], i) => (
            <tr key={i} className={cn(i > 0 && "border-t border-border")}>
              <td className="bg-muted/40 px-4 py-3 font-mono text-xs font-semibold text-foreground w-1/3 align-top">
                {k}
                {hint && <div className="mt-0.5 font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{hint}</div>}
              </td>
              <td className="px-4 py-3 text-foreground/80 align-top">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Endpoint card ---------------- */
const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  POST:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  PUT:    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  PATCH:  "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  DELETE: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

export function EndpointCard({ method, path, description }: { method: string; path: string; description?: string }) {
  return (
    <div className="not-prose my-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold", METHOD_COLOR[method] ?? "bg-muted")}>
          {method}
        </span>
        <code className="font-mono text-sm text-foreground">{path}</code>
      </div>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/* ---------------- Code block ---------------- */
export function CodeBlock({ lang = "bash", children }: { lang?: string; children: string }) {
  return (
    <pre className="not-prose my-4 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed">
      <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{lang}</div>
      <code className="font-mono text-foreground/90 whitespace-pre">{children}</code>
    </pre>
  );
}

/* ---------------- Related docs ---------------- */
export function RelatedDocs({ items }: { items: Array<{ to: string; title: string; description?: string }> }) {
  return (
    <div className="not-prose my-8 grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-foreground group-hover:text-primary">{it.title}</div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          {it.description && <p className="mt-1 text-sm text-muted-foreground">{it.description}</p>}
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Feature grid ---------------- */
export function FeatureGrid({ items }: { items: Array<{ icon: any; title: string; description: string }> }) {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <it.icon className="h-5 w-5 text-primary mb-2" />
          <div className="font-semibold text-foreground text-sm">{it.title}</div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{it.description}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Inline pill / tag ---------------- */
export function Tag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" | "muted" }) {
  const cls = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-mono font-medium", cls)}>{children}</span>;
}

/* ---------------- Hero (page intro) ---------------- */
export function PageHero({ eyebrow, title, description, icon: Icon }: { eyebrow?: string; title: string; description?: string; icon?: any }) {
  return (
    <header className="not-prose mb-8 border-b border-border pb-6">
      {eyebrow && (
        <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {eyebrow}
        </div>
      )}
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{title}</h1>
      {description && <p className="mt-3 text-lg text-muted-foreground max-w-3xl">{description}</p>}
    </header>
  );
}

/* ---------------- External link ---------------- */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/* ---------------- Screenshot ---------------- */
export function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const placeholder = "/docs-screenshots/placeholder.jpg";
  return (
    <figure className="not-prose my-6">
      <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.src.endsWith("placeholder.jpg")) img.src = placeholder;
          }}
          className="block w-full h-auto"
        />
      </div>
      {caption && <figcaption className="mt-2 text-center text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
