// supabase/functions/_shared/email-sender.ts
// Resolve o domínio remetente usado no envio de e-mails (Lovable Emails).
//
// Em cópias (Remix) do sistema o domínio verificado é diferente do projeto matriz.
// Se o código enfileirar um `sender_domain` que não pertence ao projeto, a API de
// e-mail rejeita a mensagem e nada é entregue (recuperação de senha, convites, etc.).
//
// Ordem de resolução:
//   1. platform_email_settings (sender_domain / from_domain / sender_name)
//   2. variáveis de ambiente EMAIL_SENDER_DOMAIN / EMAIL_FROM_DOMAIN / EMAIL_FROM_NAME
//   3. fallback com os valores do projeto matriz (compatibilidade)

import { createClient } from 'npm:@supabase/supabase-js@2'

export interface EmailSender {
  /** Nome exibido no From */
  siteName: string
  /** Subdomínio verificado (ex.: notify.empresa.com.br) — usado no lookup da API */
  senderDomain: string
  /** Domínio exibido no endereço From (ex.: empresa.com.br) */
  fromDomain: string
  /** Endereço completo, ex.: "Empresa <noreply@empresa.com.br>" */
  from: string
  /** URL pública do site (para links dos templates) */
  siteUrl: string
  /** true quando o domínio veio de configuração explícita (banco ou env) */
  configured: boolean
}

const FALLBACK_SITE_NAME = 'vendus'
const FALLBACK_SENDER_DOMAIN = 'notify.vendus.com.br'
const FALLBACK_FROM_DOMAIN = 'vendus.com.br'

function normalizeDomain(value?: string | null): string | null {
  if (!value) return null
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^@/, '')
  return cleaned.length > 0 ? cleaned : null
}

function rootFromSender(sender: string): string {
  const parts = sender.split('.')
  return parts.length > 2 ? parts.slice(1).join('.') : sender
}

export async function getEmailSender(client?: unknown): Promise<EmailSender> {
  let dbSenderDomain: string | null = null
  let dbFromDomain: string | null = null
  let dbSenderName: string | null = null
  let dbSenderEmail: string | null = null
  let dbPlatformName: string | null = null

  try {
    const supabase = (client ??
      createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )) as ReturnType<typeof createClient>

    const [{ data }, { data: platformSettings }] = await Promise.all([
      supabase
        .from('platform_email_settings')
        .select('sender_domain, from_domain, sender_name, sender_email')
        .limit(1)
        .maybeSingle(),
      supabase.from('platform_settings').select('platform_name').limit(1).maybeSingle(),
    ])

    dbSenderDomain = normalizeDomain(data?.sender_domain)
    dbFromDomain = normalizeDomain(data?.from_domain)
    dbSenderName = data?.sender_name?.trim() || null
    dbSenderEmail = data?.sender_email?.trim()?.toLowerCase() || null
    dbPlatformName = platformSettings?.platform_name?.trim() || null
  } catch (error) {
    console.warn('getEmailSender: falha ao ler platform_email_settings', { error })
  }

  const envSender = normalizeDomain(Deno.env.get('EMAIL_SENDER_DOMAIN'))
  const envFrom = normalizeDomain(Deno.env.get('EMAIL_FROM_DOMAIN'))
  const envName = Deno.env.get('EMAIL_FROM_NAME')?.trim() || null

  const senderDomain = dbSenderDomain ?? envSender ?? FALLBACK_SENDER_DOMAIN
  const configured = !!(dbSenderDomain ?? envSender)

  const fromDomain =
    dbFromDomain ??
    envFrom ??
    (configured ? rootFromSender(senderDomain) : FALLBACK_FROM_DOMAIN)

  const siteName = dbSenderName ?? dbPlatformName ?? envName ?? FALLBACK_SITE_NAME

  // Se houver um sender_email explícito e do mesmo domínio, respeita o local-part.
  let localPart = 'noreply'
  if (dbSenderEmail?.includes('@')) {
    const [local, domain] = dbSenderEmail.split('@')
    if (local && domain === fromDomain) localPart = local
  }

  return {
    siteName,
    senderDomain,
    fromDomain,
    from: `${siteName} <${localPart}@${fromDomain}>`,
    siteUrl: `https://${fromDomain}`,
    configured,
  }
}
