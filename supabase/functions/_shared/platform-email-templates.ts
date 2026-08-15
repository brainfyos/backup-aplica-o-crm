export interface PlatformEmailTemplateRecord {
  slug: string
  subject: string
  html_content: string
  is_active: boolean
}

interface PlatformEmailTemplateClient {
  from(table: 'platform_email_templates'): {
    select(columns: string): {
      eq(column: 'slug', value: string): {
        maybeSingle(): Promise<{
          data: PlatformEmailTemplateRecord | null
          error: unknown
        }>
      }
    }
  }
}

export const AUTH_EMAIL_TEMPLATE_SLUGS: Record<string, string> = {
  signup: 'auth_signup_confirmation',
  invite: 'auth_invite',
  magiclink: 'auth_magic_link',
  recovery: 'auth_password_recovery',
  email_change: 'auth_email_change',
  reauthentication: 'auth_reauthentication',
}

export const PLATFORM_EMAIL_SAMPLE_VARIABLES: Record<string, string> = {
  platform_name: 'Vendus',
  platform_url: 'https://app.exemplo.com',
  organization_name: 'Empresa Exemplo',
  user_name: 'João Silva',
  recipient_email: 'joao@exemplo.com',
  action_url: 'https://app.exemplo.com/acao?token=exemplo',
  old_email: 'joao@exemplo.com',
  new_email: 'joao.novo@exemplo.com',
  verification_code: '123456',
  invited_by_name: 'Maria Souza',
  role_name: 'Vendedor',
  squad_text: ' no squad Comercial',
  invite_link: 'https://app.exemplo.com/aceitar-convite?token=exemplo',
  login_email: 'joao@exemplo.com',
  provisional_password: 'SenhaTemporaria123!',
  login_url: 'https://app.exemplo.com/login',
  guest_name: 'Ana Cliente',
  event_name: 'Reunião de apresentação',
  host_name: 'Carlos Consultor',
  date_time: '15/08/2026 às 14:00',
  meet_link_block:
    '<p style="margin:16px 0"><a href="https://meet.exemplo.com/sala" style="color:#65a30d">Entrar na reunião</a></p>',
  confirmation_url: 'https://app.exemplo.com/agendamento/confirmado',
  title: 'Nova notificação',
  message: 'Há uma atualização importante aguardando sua atenção.',
  action_block:
    '<p style="margin:24px 0"><a href="https://app.exemplo.com/notificacoes" style="color:#65a30d">Ver detalhes</a></p>',
  onboarding_link: 'https://app.exemplo.com/implantacao/token-exemplo',
  expires_at: '22/08/2026 às 18:00',
  plan_name: 'Plano Pro',
  recovery_link: 'https://app.exemplo.com/reset-password?token=exemplo',
}

const RAW_HTML_VARIABLE = /(?:_block|_html)$/

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function replaceVariables(
  template: string,
  variables: Record<string, string | number | undefined | null>,
  html: boolean,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key]
    if (value === undefined || value === null) return ''
    const rendered = String(value)
    return html && !RAW_HTML_VARIABLE.test(key) ? escapeHtml(rendered) : rendered
  })
}

export function renderPlatformEmailSubject(
  subject: string,
  variables: Record<string, string | number | undefined | null>,
): string {
  return replaceVariables(subject, variables, false)
}

export function renderPlatformEmailHtml(
  html: string,
  variables: Record<string, string | number | undefined | null>,
): string {
  return replaceVariables(html, variables, true)
}

export function platformEmailHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function loadPlatformEmailTemplate(
  supabase: unknown,
  slug: string,
): Promise<PlatformEmailTemplateRecord | null> {
  const client = supabase as PlatformEmailTemplateClient
  const { data, error } = await client
    .from('platform_email_templates')
    .select('slug, subject, html_content, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return data as PlatformEmailTemplateRecord
}

export async function loadActivePlatformEmailTemplate(
  supabase: unknown,
  slug: string,
): Promise<PlatformEmailTemplateRecord | null> {
  const template = await loadPlatformEmailTemplate(supabase, slug)
  return template?.is_active ? template : null
}
