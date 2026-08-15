---
name: Journey Engine — Fase 3: Marketing Meta Ads
description: Catálogo Meta Ads (campanhas/adsets/ads/creativos/insights), captura de CTWA no webhook Meta, resolve_click_attribution e cron marketing-sync
type: feature
---
**Escopo:** Meta only (Facebook + Instagram Ads via Graph API v20). Google/TikTok/LinkedIn ficam no roadmap.

**Tabelas novas (todas com RLS admin+super_admin, GRANT SELECT authenticated + ALL service_role):**
- `org_marketing_credentials` — access_token criptografado (AES-GCM via meta-crypto), business_id, ad_account_id, provider ∈ {meta,google,tiktok,linkedin}.
- `marketing_campaigns` / `marketing_adsets` / `marketing_ads` / `marketing_creatives` — catálogo com `external_id` unique por (org, provider). `marketing_ads.metadata->'ctwa_clids'` guarda os CTWA vistos.
- `marketing_insights_daily` — spend/impressions/clicks/ctr/cpc/cpm/reach/frequency/ctwa_clicks/purchases/revenue por dia × entidade (campaign|adset|ad).

**Novos enum values `journey_event_type`:** `meta_ctwa_received`, `meta_click_received`, `campaign_identified`.

**Captura de CTWA (meta-whatsapp-webhook):** após inserir a mensagem, se `msg.referral` existir:
1. Grava referral em `webchat_conversations.metadata.referral` + campos `ctwa_clid`/`ad_id`.
2. Se conversa tem `lead_id`, seta `leads.ctwa_clid` (só se ainda nulo) e chama RPC `resolve_click_attribution(lead_id)`.
3. Publica evento `meta_ctwa_received` (category `origin`, channel `whatsapp`, source `meta_ctwa`) via `fireAndForgetJourneyEvent` com dedupe por `ctwa:{clid}` ou `ctwa-ad:{ad_id}:{conv}`.

**Função `resolve_click_attribution(p_lead_id)` (SECURITY DEFINER):**
- Busca em `marketing_ads` casando `ctwa_clid` (contido em `metadata->'ctwa_clids'`) ou `fbclid` (`metadata->>'fbclid'`).
- Match: publica `campaign_identified` (payload com ad/adset/campaign/creative ids internos+externos) + atualiza `lead_sources.first_touch_campaign_id` (se null) e `last_touch_campaign_id`.
- Sem match: publica `meta_click_received` com `pending_resolution:true` (dedupe `ctwa-pending:{lead}`), para o cron resolver quando o catálogo sincronizar.

**Edge function `marketing-sync` (`verify_jwt = false`):**
- `POST { organization_id?, provider? }` — sem org, roda para todas as empresas com credencial ativa daquele provider.
- Meta: `GET /act_{id}/{campaigns|adsets|ads|insights}` da Graph API. `ads` inclui `creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url}` expandido; grava creative primeiro, depois `marketing_ads` referenciando.
- Insights: `level=ad`, `date_preset=last_7d`, `time_increment=1`. Extrai `purchases`/`purchase_value` de `actions[]`, e `ctwa_clicks` de `onsite_conversion.messaging_conversation_started_7d`.
- Após sync, chama `resolve_click_attribution` em lote (leads com ctwa_clid pendentes, limite 500).
- Grava `last_sync_at/status/error` em `org_marketing_credentials`.

**Ainda pendente (Fase 6/7):** views materializadas de atribuição/canal/funil, UI Marketing Performance com breakdown por criativo/adset, providers adicionais (Google/TikTok/LinkedIn).

**Fase 5 concluída:**
- Edge `marketing-connect` (JWT-protected, admin/super_admin) valida token na Graph API, criptografa via `meta-crypto` e faz upsert em `org_marketing_credentials`.
- UI `MarketingManager` em `/admin?tab=marketing` (item "Marketing (Meta Ads)" na sidebar de Automação & IA): form de conexão (access token + ad_account_id + business_id), painel com KPIs 30d (investimento, cliques, CTWA, compras, ROAS), tabela de campanhas e anúncios agregando `marketing_insights_daily`, botão "Sincronizar" chamando `marketing-sync`, botão "Desconectar" (soft delete via is_active=false).
- Cron `pg_cron` job `marketing-sync-every-10min` chama a edge sem body → roda para todas as orgs com credencial ativa; agendado via `supabase--insert` (não migration) porque contém anon key/URL.
