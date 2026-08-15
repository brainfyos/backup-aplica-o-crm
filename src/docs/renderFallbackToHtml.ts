import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { findPage } from "./registry";

/**
 * Renderiza o conteúdo TSX padrão de uma página de documentação para HTML
 * estático, para pré-popular o editor do Super Admin.
 *
 * Limpa classes utilitárias do Tailwind para não poluir o HTML salvo no banco.
 */
export function renderFallbackToHtml(trackId: string, slug: string): string {
  const found = findPage(trackId, slug);
  if (!found) return "";
  try {
    const element = found.page.content;
    // Wrap em MemoryRouter porque alguns componentes usam <Link>
    const raw = renderToStaticMarkup(
      createElement(MemoryRouter, null, element as any)
    );
    return sanitize(raw);
  } catch (e) {
    console.warn("[renderFallbackToHtml] falhou", trackId, slug, e);
    return "";
  }
}

function sanitize(html: string): string {
  // Remove atributos class= e style= para reduzir ruído visual no editor.
  let out = html.replace(/\sclass="[^"]*"/g, "");
  out = out.replace(/\sstyle="[^"]*"/g, "");
  // Remove data-* attrs
  out = out.replace(/\sdata-[a-z0-9-]+="[^"]*"/gi, "");
  // Compacta whitespace excessivo
  out = out.replace(/>\s+</g, "><");
  return out.trim();
}
