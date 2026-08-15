---
name: Docs Editáveis Multi-tenant Whitelabel
description: Documentação editável no Super Admin que substitui Central de Ajuda e Atualizações, com fallback TSX, viewer público brand-aware e varredura por IA com aprovação de sugestões
type: feature
---
**Tabelas:** `docs_tracks` / `docs_sections` / `docs_pages` (slug+title+description+content_json/html) / `docs_change_proposals`.

**Seed (migration):** estrutura completa (5 trilhas, ~85 páginas) sem conteúdo — idempotente, sobrevive a remix.

**Leitura:** liberada para todos (anon+authenticated). **Escrita:** apenas `super_admin` via RLS + `has_role`.

**Viewer `/docs/:track/:slug`:** se `docs_pages.content_html` existe usa ele (`dangerouslySetInnerHTML`), senão usa fallback de `src/docs/content/*.tsx` via `findPage`. Nome/marca via `usePlatformName` + `usePlatformBranding`.

**Editor (Super Admin):** `DocsManager` em sidebar item `docs` (substitui `help` + `releases`). Árvore Trilha→Seção→Página + `RichEditor` TipTap (YouTube, imagens, links).

**Botão "Atualizar documentação":** edge function `docs-scan-and-propose` (verify_jwt=false, valida JWT+role no código) coleta sinais (tabelas, releases) + doc atual, chama `resolveAIConfig('agent_chat')` com `response_format=json_object`, grava em `docs_change_proposals(status=pending)`. RPC `apply_docs_proposal(id)` (SECURITY DEFINER, só super_admin) cria/atualiza página.

**Rotas legadas:** `/ajuda` e `/ajuda/:slug` → redirect `/docs`; `/novidades` → `/docs/changelog`. Header substituiu HelpCircle+Sparkles por BookOpen→`/docs`.

**Tabelas antigas mantidas** (`help_*`, `platform_releases`) para preservar histórico — UI removida.
