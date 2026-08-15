import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateMemberPayload {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'manager' | 'seller';
  recovery_whatsapp?: string;
  sector_ids?: unknown;
  squad_id?: unknown;
  default_connection_id?: string | null;
  work_start_time?: string;
  work_end_time?: string;
  farewell_message?: string;
  default_theme?: string;
  default_menu_state?: string;
  avatar_url?: string;
}

const allowedMemberRoles = new Set<CreateMemberPayload['role']>(['admin', 'manager', 'seller']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAllowedMemberRole(role: unknown): role is CreateMemberPayload['role'] {
  return typeof role === 'string' && allowedMemberRoles.has(role as CreateMemberPayload['role']);
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  // paginate through users to find the existing one
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data?.users?.find((u: any) => u.email?.toLowerCase() === target);
    if (found) return found.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: CreateMemberPayload;
    try {
      body = (await req.json()) as CreateMemberPayload;
    } catch {
      return new Response(JSON.stringify({ error: 'Corpo da requisicao invalido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedMemberRole(body.role)) {
      return new Response(JSON.stringify({ error: 'Perfil invalido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Sem organização' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);
    const callerRoles = (roles || []).map((r: any) => r.role);
    if (!callerRoles.some((r: string) => ['admin', 'manager', 'super_admin'].includes(r))) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (
      body.role === 'admin'
      && !callerRoles.some((role: string) => role === 'admin' || role === 'super_admin')
    ) {
      return new Response(JSON.stringify({ error: 'Permissao insuficiente para criar admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.email || !body.password || !body.full_name || !body.role) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios ausentes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgId = callerProfile.organization_id;

    const fail = (step: string, message: string, extra?: unknown) => {
      console.error(`[create-team-member] step=${step}`, message, extra ?? '');
      return new Response(
        JSON.stringify({ error: message, step }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    };

    const requestedSquadId = body.squad_id;
    if (requestedSquadId !== undefined && requestedSquadId !== null) {
      if (typeof requestedSquadId !== 'string' || !requestedSquadId.trim()) {
        return fail('validate_squad', 'Squad invalido');
      }
      const { data: squad, error: squadError } = await admin
        .from('sales_squads')
        .select('id')
        .eq('id', requestedSquadId.trim())
        .eq('organization_id', orgId)
        .maybeSingle();
      if (squadError || !squad) {
        return fail('validate_squad', 'Squad nao pertence a esta organizacao');
      }
    }

    let validatedSectorIds: string[] = [];
    if (body.sector_ids !== undefined) {
      if (!Array.isArray(body.sector_ids)) {
        return fail('validate_sectors', 'Setores devem ser enviados como uma lista');
      }
      if (body.sector_ids.some((sectorId) => typeof sectorId !== 'string' || !uuidPattern.test(sectorId))) {
        return fail('validate_sectors', 'Lista de setores invalida');
      }
      validatedSectorIds = [...new Set(body.sector_ids.map((sectorId) => sectorId.toLowerCase()))];
      if (validatedSectorIds.length > 0) {
        const { data: sectors, error: sectorsError } = await admin
          .from('sectors')
          .select('id')
          .in('id', validatedSectorIds)
          .eq('organization_id', orgId);
        if (sectorsError || sectors?.length !== validatedSectorIds.length) {
          return fail('validate_sectors', 'Um ou mais setores nao pertencem a esta organizacao');
        }
      }
    }

    let resolvedConnectionId: string | null = null;
    const requestedConnectionId = body.default_connection_id;
    if (requestedConnectionId !== undefined && requestedConnectionId !== null) {
      if (typeof requestedConnectionId !== 'string' || !uuidPattern.test(requestedConnectionId)) {
        return fail('validate_connection', 'Conexao padrao invalida');
      }
      const normalizedConnectionId = requestedConnectionId.toLowerCase();
      const { data: connection, error: connectionError } = await admin
        .from('evolution_instances')
        .select('id')
        .eq('id', normalizedConnectionId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (connectionError || !connection) {
        return fail('validate_connection', 'Conexao padrao nao pertence a esta organizacao');
      }
      resolvedConnectionId = normalizedConnectionId;
    } else {
      const { data: firstInstance, error: firstInstanceError } = await admin
        .from('evolution_instances')
        .select('id')
        .eq('organization_id', orgId)
        .limit(1)
        .maybeSingle();
      if (firstInstanceError) {
        return fail('validate_connection', 'Nao foi possivel resolver a conexao padrao');
      }
      resolvedConnectionId = firstInstance?.id || null;
    }

    // 1) Detect if user already exists (in another or this org)
    let userId: string | null = null;
    let reused = false;
    const existingId = await findUserByEmail(admin, body.email);
    if (existingId) {
      userId = existingId;
      reused = true;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
      });
      if (createErr || !created?.user) {
        // Race: another caller may have created the user in between — try lookup once more
        const second = await findUserByEmail(admin, body.email);
        if (second) {
          userId = second;
          reused = true;
        } else {
          return fail('create_user', createErr?.message || 'Erro ao criar usuário');
        }
      } else {
        userId = created.user.id;
      }
    }

    if (!userId) return fail('resolve_user', 'Não foi possível resolver usuário');

    // 1b) Conta órfã: existe na autenticação mas sem perfil (exclusão antiga
    // apagava o perfil e deixava o login para trás). Tratamos como criação
    // normal: aplica a senha informada e faz o bootstrap completo abaixo.
    if (reused) {
      const { data: orphanCheck } = await admin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (!orphanCheck) {
        const { error: adoptErr } = await admin.auth.admin.updateUserById(userId, {
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: body.full_name },
        });
        if (adoptErr) {
          const msg = (adoptErr.message || '').toLowerCase();
          if (msg.includes('pwned') || msg.includes('weak')) {
            return fail('adopt_orphan', 'Esta senha foi exposta em vazamentos. Escolha outra.');
          }
          return fail('adopt_orphan', adoptErr.message);
        }
        reused = false;
      }
    }

    // 2) Already a member of this org? Avoid duplicate setup messages.
    const { data: existingMembership } = await admin
      .from('user_organizations')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (reused) {
      // Existing user joining another org: do NOT overwrite profile.organization_id
      // nor reset password. Just link via user_organizations.
      const { error: linkErr } = await admin
        .from('user_organizations')
        .upsert(
          {
            user_id: userId,
            organization_id: orgId,
            role: body.role,
            is_default: false,
            joined_via: 'admin_create',
          },
          { onConflict: 'user_id,organization_id' },
        );
      if (linkErr) return fail('link_user_organization', linkErr.message, linkErr);
    } else {
      // Brand-new user: bootstrap profile + role + default org link.
      // We UPSERT instead of UPDATE: the `on_auth_user_created` trigger lives in
      // the `auth` schema and is NOT copied when a project is remixed, so the
      // profile row may simply not exist. An UPDATE would silently affect 0 rows
      // and the user would vanish from the team list.
      const { error: profErr } = await admin.from('profiles').upsert({
        id: userId,
        email: body.email,
        full_name: body.full_name,
        organization_id: orgId,
        recovery_whatsapp: body.recovery_whatsapp || null,
        work_start_time: body.work_start_time || '00:00',
        work_end_time: body.work_end_time || '23:59',
        farewell_message: body.farewell_message || null,
        default_theme: body.default_theme || 'system',
        default_menu_state: body.default_menu_state || 'open',
        default_connection_id: resolvedConnectionId,
        avatar_url: body.avatar_url || null,
      }, { onConflict: 'id' });
      if (profErr) return fail('upsert_profile', profErr.message, profErr);

      // Read back: never report success on a profile that isn't really there.
      const { data: profCheck, error: profCheckErr } = await admin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (profCheckErr) return fail('verify_profile', profCheckErr.message, profCheckErr);
      if (!profCheck) {
        return fail(
          'verify_profile',
          'O perfil do usuário não pôde ser criado. Rode o reparo em Super Admin > Paridade / Remix.',
          null,
        );
      }


      const { error: delErr } = await admin.from('user_roles').delete().eq('user_id', userId);
      if (delErr) return fail('delete_user_roles', delErr.message, delErr);

      const { error: roleErr } = await admin
        .from('user_roles')
        .insert({ user_id: userId, role: body.role });
      if (roleErr) {
        const msg = /invalid input value for enum/i.test(roleErr.message)
          ? `O perfil "${body.role}" não existe no banco. Rode as migrations do projeto antes de criar usuários.`
          : roleErr.message;
        return fail('insert_user_role', msg, roleErr);
      }

      const { error: linkErr } = await admin
        .from('user_organizations')
        .upsert(
          {
            user_id: userId,
            organization_id: orgId,
            role: body.role,
            is_default: true,
            joined_via: 'admin_create',
          },
          { onConflict: 'user_id,organization_id' },
        );
      if (linkErr) {
        console.warn('[create-team-member] user_organizations falhou (não-fatal):', linkErr.message);
      }
    }

    // 4) Permissions (per org) — always (re)initialize for this org
    const { error: permErr } = await admin.rpc('initialize_user_permissions', {
      p_user_id: userId,
      p_organization_id: orgId,
      p_role: body.role,
    });
    if (permErr) {
      console.warn('[create-team-member] initialize_user_permissions falhou (não-fatal):', permErr.message);
    }

    // 5) Sectors (only for this org)
    if (validatedSectorIds.length > 0) {
      const rows = validatedSectorIds.map((sid) => ({ sector_id: sid, user_id: userId! }));
      // upsert to avoid PK conflicts if user already had some sectors
      const { error: secErr } = await admin
        .from('sector_members')
        .upsert(rows, { onConflict: 'sector_id,user_id' });
      if (secErr) {
        console.warn('[create-team-member] sector_members falhou (não-fatal):', secErr.message);
      }
    }

    const message = reused
      ? (existingMembership
          ? 'Usuário já estava vinculado a esta empresa — permissões atualizadas.'
          : 'Usuário já existia em outra empresa — vinculado à empresa atual. Ele verá a opção no seletor de empresas após o próximo login.')
      : 'Usuário criado com sucesso!';

    return new Response(
      JSON.stringify({ success: true, user_id: userId, reused, message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('create-team-member error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Erro interno', step: 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
