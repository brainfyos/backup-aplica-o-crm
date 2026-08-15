import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { parseEmailWebhookPayload } from 'npm:@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { getEmailSender } from '../_shared/email-sender.ts'
import {
  AUTH_EMAIL_TEMPLATE_SLUGS,
  PLATFORM_EMAIL_SAMPLE_VARIABLES,
  loadPlatformEmailTemplate,
  platformEmailHtmlToText,
  renderPlatformEmailHtml,
  renderPlatformEmailSubject,
  type PlatformEmailTemplateRecord,
} from '../_shared/platform-email-templates.ts'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail',
  invite: 'Você recebeu um convite',
  magiclink: 'Seu link de acesso',
  recovery: 'Redefina sua senha',
  email_change: 'Confirme seu novo e-mail',
  reauthentication: 'Seu código de verificação',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Fallbacks apenas para preview/sample. O envio real resolve o remetente em
// runtime via getEmailSender() (platform_email_settings -> env -> fallback).
const SITE_NAME = "vendus"
const ROOT_DOMAIN = "vendus.com.br"


// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://vendus.lovable.app"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

function authTemplateVariables(
  type: string,
  data: Record<string, unknown>,
  platformName: string,
  platformUrl: string,
  actionUrl: string,
): Record<string, string> {
  const email = String(data.email || PLATFORM_EMAIL_SAMPLE_VARIABLES.recipient_email)
  const metadataValue = data.user_metadata || data.raw_user_meta_data
  const metadata = metadataValue && typeof metadataValue === 'object'
    ? metadataValue as Record<string, unknown>
    : {}
  const userName = String(
    metadata.full_name || metadata.name || data.user_name || email.split('@')[0] || 'Cliente',
  )

  return {
    ...PLATFORM_EMAIL_SAMPLE_VARIABLES,
    platform_name: platformName,
    platform_url: platformUrl,
    user_name: userName,
    recipient_email: email,
    action_url: actionUrl,
    old_email: String(data.old_email || email),
    new_email: String(data.new_email || email),
    verification_code: String(data.token || PLATFORM_EMAIL_SAMPLE_VARIABLES.verification_code),
    ...(type === 'invite' && metadata.organization_name
      ? { organization_name: String(metadata.organization_name) }
      : {}),
  }
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]

  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let html: string | null = null
  const templateSlug = AUTH_EMAIL_TEMPLATE_SLUGS[type]
  if (templateSlug) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const databaseTemplate = await loadPlatformEmailTemplate(supabase, templateSlug)
      if (databaseTemplate?.is_active) {
        html = renderPlatformEmailHtml(
          databaseTemplate.html_content,
          authTemplateVariables(
            type,
            { email: SAMPLE_EMAIL, token: '123456' },
            PLATFORM_EMAIL_SAMPLE_VARIABLES.platform_name,
            PLATFORM_EMAIL_SAMPLE_VARIABLES.platform_url,
            PLATFORM_EMAIL_SAMPLE_VARIABLES.action_url,
          ),
        )
      }
    } catch (error) {
      console.warn('auth-email-hook preview: template do banco indisponível, usando fallback', {
        templateSlug,
        error,
      })
    }
  }

  if (!html) {
    const sampleData = SAMPLE_DATA[type] || {}
    html = await renderAsync(React.createElement(EmailTemplate, sampleData))
  }

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// Webhook handler - verifies signature and sends email
async function handleWebhook(req: Request): Promise<Response> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')

  if (!apiKey) {
    console.error('LOVABLE_API_KEY not configured')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verify signature + timestamp, then parse payload.
  let payload: any
  let run_id = ''
  try {
    const verified = await verifyWebhookRequest({
      req,
      secret: apiKey,
      parser: parseEmailWebhookPayload,
    })
    payload = verified.payload
    run_id = payload.run_id
  } catch (error) {
    if (error instanceof WebhookError) {
      switch (error.code) {
        case 'invalid_signature':
        case 'missing_timestamp':
        case 'invalid_timestamp':
        case 'stale_timestamp':
          console.error('Invalid webhook signature', { error: error.message })
          return new Response(JSON.stringify({ error: 'Invalid signature' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        case 'invalid_payload':
        case 'invalid_json':
          console.error('Invalid webhook payload', { error: error.message })
          return new Response(
            JSON.stringify({ error: 'Invalid webhook payload' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
      }
    }

    console.error('Webhook verification failed', { error })
    return new Response(
      JSON.stringify({ error: 'Invalid webhook payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!run_id) {
    console.error('Webhook payload missing run_id')
    return new Response(
      JSON.stringify({ error: 'Invalid webhook payload' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (payload.version !== '1') {
    console.error('Unsupported payload version', { version: payload.version, run_id })
    return new Response(
      JSON.stringify({ error: `Unsupported payload version: ${payload.version}` }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
  // payload.type is the hook event type ("auth")
  const emailType = payload.data.action_type
  console.log('Received auth event', { emailType, run_id })

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType, run_id })
    return new Response(
      JSON.stringify({ error: `Unknown email type: ${emailType}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cliente + remetente dinâmico (funciona em qualquer cópia/Remix do sistema)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const sender = await getEmailSender(supabase)
  if (!sender.configured) {
    console.warn('auth-email-hook: domínio remetente não configurado, usando fallback', {
      sender_domain: sender.senderDomain,
    })
  }

  // Link no domínio da própria plataforma (evita expor o domínio técnico do
  // Supabase). Usamos o token_hash + verifyOtp na página de destino.
  const data = payload.data as Record<string, any>
  const ACTION_ROUTES: Record<string, string> = {
    recovery: '/reset-password',
    invite: '/reset-password',
    signup: '/reset-password',
    magiclink: '/reset-password',
    email_change: '/reset-password',
  }

  function buildActionUrl(): string {
    const tokenHash = data.token_hash || data.token_hash_new
    if (!tokenHash) return data.url

    let base: string | null = null
    const redirectTo = typeof data.redirect_to === 'string' ? data.redirect_to : null
    try {
      if (redirectTo) base = new URL(redirectTo).origin
    } catch (_) {
      base = null
    }
    if (!base && sender.configured) base = sender.siteUrl
    if (!base) return data.url

    const path = ACTION_ROUTES[emailType] ?? '/reset-password'
    const url = new URL(path, base)
    url.searchParams.set('token_hash', String(tokenHash))
    url.searchParams.set('type', emailType === 'magiclink' ? 'magiclink' : emailType)
    if (redirectTo) {
      try {
        const next = new URL(redirectTo)
        if (next.pathname && next.pathname !== '/' && next.pathname !== path) {
          url.searchParams.set('next', next.pathname + next.search)
        }
      } catch (_) {
        // ignora redirect_to inválido
      }
    }
    return url.toString()
  }

  // Build template props from payload.data (HookData structure)
  const templateProps = {
    siteName: sender.siteName || SITE_NAME,
    siteUrl: sender.configured ? sender.siteUrl : `https://${ROOT_DOMAIN}`,
    recipient: payload.data.email,
    confirmationUrl: buildActionUrl(),
    token: payload.data.token,
    email: payload.data.email,
    oldEmail: payload.data.old_email,
    newEmail: payload.data.new_email,
  }

  const templateSlug = AUTH_EMAIL_TEMPLATE_SLUGS[emailType]
  let subject = EMAIL_SUBJECTS[emailType] || 'Notificação'
  let html: string
  let text: string
  let logTemplateName = emailType

  let databaseTemplate: PlatformEmailTemplateRecord | null = null
  if (templateSlug) {
    try {
      databaseTemplate = await loadPlatformEmailTemplate(supabase, templateSlug)
    } catch (error) {
      console.warn('auth-email-hook: template do banco indisponível, usando fallback', {
        emailType,
        templateSlug,
        run_id,
        error,
      })
    }
  }

  if (databaseTemplate && !databaseTemplate.is_active) {
    console.error('Auth email template is inactive', { emailType, templateSlug, run_id })
    return new Response(JSON.stringify({ error: 'Email template is inactive' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (databaseTemplate) {
    const variables = authTemplateVariables(
      emailType,
      data,
      templateProps.siteName,
      templateProps.siteUrl,
      templateProps.confirmationUrl,
    )
    subject = renderPlatformEmailSubject(databaseTemplate.subject, variables)
    html = renderPlatformEmailHtml(databaseTemplate.html_content, variables)
    text = platformEmailHtmlToText(html)
    logTemplateName = databaseTemplate.slug
  } else {
    // Compatibilidade de rollout: até a migration ser aplicada, mantém os templates React.
    html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })
  }

  const messageId = crypto.randomUUID()

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: logTemplateName,
    recipient_email: payload.data.email,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      run_id,
      message_id: messageId,
      to: payload.data.email,
      from: sender.from,
      sender_domain: sender.senderDomain,

      subject,
      html,
      text,
      purpose: 'transactional',
      label: logTemplateName,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: logTemplateName,
      recipient_email: payload.data.email,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Auth email enqueued', { emailType, templateSlug: logTemplateName, run_id })

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  // Main webhook handler
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
