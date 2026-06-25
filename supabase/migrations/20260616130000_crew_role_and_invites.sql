-- D.6.1 — Crew role, profile linkage, and invite tokens
-- linked_* columns reference org_team.payload member ids (text), not normalized HR tables.

BEGIN;

-- 1. Extend profiles to link to org_team employee or contractor record
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linked_employee_id text,
  ADD COLUMN IF NOT EXISTS linked_contractor_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_employee_id
  ON public.profiles(linked_employee_id)
  WHERE linked_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_contractor_id
  ON public.profiles(linked_contractor_id)
  WHERE linked_contractor_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_linked_one_or_none'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_linked_one_or_none
      CHECK (linked_employee_id IS NULL OR linked_contractor_id IS NULL);
  END IF;
END $$;

-- Allow crew in roles[]
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_allowed_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_roles_allowed_check
  CHECK (
    roles <@ ARRAY[
      'owner',
      'office_gc',
      'office_drywall',
      'field_gc',
      'field_drywall',
      'viewer',
      'crew'
    ]::text[]
  );

-- 2. Crew invite tokens
CREATE TABLE IF NOT EXISTS public.crew_invite_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_employee_id text,
  linked_contractor_id text,
  invited_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (linked_employee_id IS NOT NULL OR linked_contractor_id IS NOT NULL),
  CHECK (linked_employee_id IS NULL OR linked_contractor_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_crew_invite_tokens_token
  ON public.crew_invite_tokens(token)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crew_invite_tokens_org
  ON public.crew_invite_tokens(organization_id);

ALTER TABLE public.crew_invite_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors manage crew invites" ON public.crew_invite_tokens;
CREATE POLICY "Editors manage crew invites" ON public.crew_invite_tokens
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

-- Token in WHERE clause is the secret; anon/authenticated signup page reads by token only.
DROP POLICY IF EXISTS "Read by token (signup)" ON public.crew_invite_tokens;
CREATE POLICY "Read by token (signup)" ON public.crew_invite_tokens
  FOR SELECT
  USING (true);

-- 3. Consume invite: link profile + mark token (SECURITY DEFINER — new crew cannot self-set org/roles via RLS)
CREATE OR REPLACE FUNCTION public.consume_crew_invite_token(
  p_token text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.crew_invite_tokens%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authorized to consume invite for this user';
  END IF;

  SELECT * INTO v_invite
  FROM public.crew_invite_tokens
  WHERE token = p_token
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite token is invalid, expired, or already used';
  END IF;

  IF v_invite.invited_email IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_user_id
        AND lower(trim(p.email)) = lower(trim(v_invite.invited_email))
    ) THEN
      RAISE EXCEPTION 'signup email does not match invite';
    END IF;
  END IF;

  UPDATE public.crew_invite_tokens
  SET consumed_at = now(),
      consumed_by = p_user_id
  WHERE id = v_invite.id;

  UPDATE public.profiles
  SET
    organization_id = v_invite.organization_id,
    role = 'viewer',
    roles = ARRAY['crew']::text[],
    linked_employee_id = v_invite.linked_employee_id,
    linked_contractor_id = v_invite.linked_contractor_id,
    hr_person_id = COALESCE(v_invite.linked_employee_id, v_invite.linked_contractor_id),
    hr_person_type = CASE
      WHEN v_invite.linked_employee_id IS NOT NULL THEN 'w2'
      WHEN v_invite.linked_contractor_id IS NOT NULL THEN '1099'
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_crew_invite_token(text, uuid) TO authenticated;

COMMIT;
