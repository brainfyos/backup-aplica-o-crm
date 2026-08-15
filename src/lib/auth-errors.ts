/**
 * Traduz mensagens de erro do Supabase Auth e PostgREST para PT-BR.
 * Aceita Error, string ou objeto com .message.
 */
export function translateAuthError(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : (input as any)?.message || (input as any)?.error_description || '';

  if (!raw) return 'Ocorreu um erro inesperado. Tente novamente.';

  const msg = String(raw);
  const lower = msg.toLowerCase();

  // Auth
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Este e-mail já possui uma conta. Faça login para continuar.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de fazer login.';
  }
  if (lower.includes('email rate limit') || lower.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  if (lower.includes('password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (
    lower.includes('new password should be different') ||
    lower.includes('same_password')
  ) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (lower.includes('new email should be different') || lower.includes('same_email')) {
    return 'O novo e-mail precisa ser diferente do atual.';
  }
  if (
    lower.includes('pwned') ||
    lower.includes('exposed in') ||
    lower.includes('data breach') ||
    lower.includes('known to be weak and easy to guess')
  ) {
    return 'Esta senha foi exposta em vazamentos. Escolha outra.';
  }
  if (lower.includes('weak password') || lower.includes('password is too weak')) {
    return 'Senha muito fraca. Use letras, números e símbolos.';
  }
  if (lower.includes('unable to validate email') || lower.includes('email_address_invalid')) {
    return 'E-mail inválido. Verifique e tente novamente.';
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed') || lower.includes('signup_disabled')) {
    return 'Cadastros estão desabilitados no momento.';
  }
  if (lower.includes('user not found')) {
    return 'Usuário não encontrado.';
  }
  if (lower.includes('email_exists') || lower.includes('phone_exists')) {
    return 'Este contato já está cadastrado.';
  }
  if (lower.includes('otp_expired') || lower.includes('token has expired') || lower.includes('expired')) {
    return 'O código ou link expirou. Solicite um novo.';
  }
  if (lower.includes('session_not_found') || lower.includes('auth session missing')) {
    return 'Sessão expirada. Faça login novamente.';
  }
  if (
    lower.includes('for security purposes, you can only request this after') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    return 'Por segurança, aguarde alguns segundos antes de tentar novamente.';
  }
  if (lower.includes('over_request_rate_limit')) {
    return 'Muitas requisições. Aguarde um instante e tente novamente.';
  }
  if (lower.includes('email rate limit') || lower.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  if (lower.includes('captcha')) {
    return 'Falha na verificação de segurança. Recarregue a página.';
  }

  // Convites
  if (lower.includes('convite inválido') || lower.includes('invitation not found')) {
    return 'Convite inválido ou expirado.';
  }

  // PostgREST / Postgres
  if (lower.includes('user_roles_user_id_fkey') || lower.includes('foreign key constraint')) {
    return 'Não foi possível concluir a operação. Recarregue a página e tente novamente.';
  }
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return 'Este registro já existe.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Você não tem permissão para esta ação.';
  }
  if (lower.includes('violates not-null') || lower.includes('null value in column')) {
    return 'Preencha todos os campos obrigatórios.';
  }
  if (lower.includes('invalid input syntax for type uuid')) {
    return 'Identificador inválido. Recarregue a página.';
  }

  // Rede
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Falha de conexão. Verifique sua internet.';
  }

  // Fallback: mantém o texto original para facilitar o diagnóstico.
  return msg;
}


