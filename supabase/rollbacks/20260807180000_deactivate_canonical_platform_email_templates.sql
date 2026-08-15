BEGIN;

-- Rollback operacional da VEN-8.
-- Este arquivo fica fora de supabase/migrations para nunca ser aplicado
-- automaticamente. Se necessário, o executor autorizado deve copiá-lo para uma
-- NOVA migration timestampada, preservando o histórico.
--
-- Desativa somente registros cujo UUID e slug correspondem exatamente aos
-- valores inseridos pela migration 20260807180000. Templates preexistentes não
-- possuem esses UUIDs e não são afetados.
UPDATE public.platform_email_templates AS template
SET is_active = false,
    updated_at = now()
FROM (VALUES
  ('b8e80001-7e8a-4b91-9a08-000000000001'::uuid, 'auth_signup_confirmation'),
  ('b8e80002-7e8a-4b91-9a08-000000000002'::uuid, 'auth_invite'),
  ('b8e80003-7e8a-4b91-9a08-000000000003'::uuid, 'auth_magic_link'),
  ('b8e80004-7e8a-4b91-9a08-000000000004'::uuid, 'auth_password_recovery'),
  ('b8e80005-7e8a-4b91-9a08-000000000005'::uuid, 'auth_email_change'),
  ('b8e80006-7e8a-4b91-9a08-000000000006'::uuid, 'auth_reauthentication'),
  ('b8e80007-7e8a-4b91-9a08-000000000007'::uuid, 'team_invite'),
  ('b8e80008-7e8a-4b91-9a08-000000000008'::uuid, 'provisional_credentials'),
  ('b8e80009-7e8a-4b91-9a08-000000000009'::uuid, 'welcome_admin_access'),
  ('b8e8000a-7e8a-4b91-9a08-00000000000a'::uuid, 'booking_confirmation'),
  ('b8e8000b-7e8a-4b91-9a08-00000000000b'::uuid, 'admin_notification'),
  ('b8e8000c-7e8a-4b91-9a08-00000000000c'::uuid, 'onboarding-implantacao-link')
) AS ven8(id, slug)
WHERE template.id = ven8.id
  AND template.slug = ven8.slug;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_email_templates
    WHERE id = ANY (ARRAY[
      'b8e80001-7e8a-4b91-9a08-000000000001'::uuid,
      'b8e80002-7e8a-4b91-9a08-000000000002'::uuid,
      'b8e80003-7e8a-4b91-9a08-000000000003'::uuid,
      'b8e80004-7e8a-4b91-9a08-000000000004'::uuid,
      'b8e80005-7e8a-4b91-9a08-000000000005'::uuid,
      'b8e80006-7e8a-4b91-9a08-000000000006'::uuid,
      'b8e80007-7e8a-4b91-9a08-000000000007'::uuid,
      'b8e80008-7e8a-4b91-9a08-000000000008'::uuid,
      'b8e80009-7e8a-4b91-9a08-000000000009'::uuid,
      'b8e8000a-7e8a-4b91-9a08-00000000000a'::uuid,
      'b8e8000b-7e8a-4b91-9a08-00000000000b'::uuid,
      'b8e8000c-7e8a-4b91-9a08-00000000000c'::uuid
    ])
      AND is_active
  ) THEN
    RAISE EXCEPTION 'rollback VEN-8 incompleto: ainda existem templates ativos';
  END IF;
END
$$;

COMMIT;

-- Para desfazer este rollback, criar uma nova migration com o mesmo pareamento
-- UUID/slug e definir is_active = true.
