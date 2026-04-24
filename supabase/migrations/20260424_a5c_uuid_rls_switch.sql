-- ============================================================================
-- A5-c PROD CUTOVER (Path H): enable invite-first tenancy + install bridge
-- infrastructure. Does NOT rewrite text-based RLS policies (deferred to A5-c.2).
-- Target: rvtdavpsvrhbktbxquzm
-- ============================================================================

BEGIN;

-- 0. PRE-FLIGHT SANITY
DO $$
DECLARE hsh_id uuid := 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = hsh_id) THEN
    RAISE EXCEPTION 'Pre-flight abort: HSH organization % missing', hsh_id;
  END IF;
  IF (SELECT count(*) FROM public.trade_categories
      WHERE organization_id_uuid IS NULL AND organization_id <> 'system') > 0 THEN
    RAISE EXCEPTION 'Pre-flight abort: non-system trade_categories row with null uuid';
  END IF;
END $$;

-- 1. Profiles: allow NULL organization_id (required for invite-first users)
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;

-- 2. handle_new_user: writes NULL for both text and uuid org columns
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization_id, organization_id_uuid, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULL,  -- text: NULL = invite-first, invisible to existing text-based RLS
    NULL,  -- uuid: NULL = invite-first, will be used by A5-c.2 UUID policies
    'viewer',
    true
  );
  RETURN NEW;
END;
$fn$;

-- 3. get_user_organization(): remove COALESCE('default-org') fallback.
--    Keep text return type so existing policies on ~50 tables keep working.
--    NULL profile.organization_id (invite-first) now returns NULL from helper,
--    which makes every text-based policy deny access.
CREATE OR REPLACE FUNCTION public.get_user_organization() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $fn$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

-- 4. current_user_organization_id(): reaffirm no-fallback version (already was)
CREATE OR REPLACE FUNCTION public.current_user_organization_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $fn$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

-- 5. New UUID-returning helpers (for use by A5-c.2 when policies migrate)
CREATE OR REPLACE FUNCTION public.get_user_organization_uuid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $fn$
  SELECT organization_id_uuid FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.current_user_organization_uuid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $fn$
  SELECT organization_id_uuid FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$fn$;

-- 6. organization_text_map (text → uuid, consumed by bridge trigger)
CREATE TABLE IF NOT EXISTS public.organization_text_map (
  org_text text PRIMARY KEY,
  organization_id_uuid uuid  -- NULL = shared/system
);
ALTER TABLE public.organization_text_map ENABLE ROW LEVEL SECURITY;
-- No client policies: only SECURITY DEFINER functions read this table.

INSERT INTO public.organization_text_map (org_text, organization_id_uuid) VALUES
  ('default-org', 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129'),
  ('system', NULL)
ON CONFLICT (org_text) DO UPDATE SET organization_id_uuid = EXCLUDED.organization_id_uuid;

-- 7. bridge_set_org_uuid(): BEFORE INSERT OR UPDATE, populate uuid from text.
--    Fails hard on unmappable text values (belt-and-suspenders data integrity).
CREATE OR REPLACE FUNCTION public.bridge_set_org_uuid() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $fn$
DECLARE mapped_uuid uuid; has_map boolean := false;
BEGIN
  IF NEW.organization_id_uuid IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  SELECT true, m.organization_id_uuid INTO has_map, mapped_uuid
    FROM public.organization_text_map m WHERE m.org_text = NEW.organization_id;
  IF has_map THEN
    NEW.organization_id_uuid := mapped_uuid;
    RETURN NEW;
  END IF;

  SELECT o.id INTO mapped_uuid FROM public.organizations o WHERE o.name = NEW.organization_id LIMIT 1;
  IF mapped_uuid IS NOT NULL THEN
    NEW.organization_id_uuid := mapped_uuid;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'bridge_set_org_uuid: unable to map organization_id text value "%" on table %.%',
    NEW.organization_id, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$fn$;

-- 8. Attach bridge trigger on every table with text + uuid org columns EXCEPT profiles.
--    Loops over information_schema so we stay in sync with whatever tables actually qualify.
--    Expected: 53 tables (54 qualifying minus profiles).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND c.data_type = 'text'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c2
        WHERE c2.table_schema = 'public'
          AND c2.table_name = c.table_name
          AND c2.column_name = 'organization_id_uuid'
          AND c2.data_type = 'uuid'
      )
      AND c.table_name <> 'profiles'  -- invite-first: uuid must stay NULL on new profiles
    ORDER BY c.table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS bridge_set_org_uuid_trg ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER bridge_set_org_uuid_trg BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bridge_set_org_uuid()',
      r.table_name
    );
    RAISE NOTICE 'Attached bridge_set_org_uuid_trg on public.%', r.table_name;
  END LOOP;
END $$;

-- 9. Fix sow_templates tautology (pre-existing bug: profiles.organization_id = profiles.organization_id)
DROP POLICY IF EXISTS "Users can view organization SOW templates" ON public.sow_templates;
CREATE POLICY "Users can view organization SOW templates" ON public.sow_templates
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id = get_user_organization_uuid()
  );

-- 10. POST-APPLY ASSERTIONS
DO $$
DECLARE n int; t text; nullable text;
BEGIN
  SELECT is_nullable INTO nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='organization_id';
  IF nullable <> 'YES' THEN RAISE EXCEPTION 'profiles.organization_id is still NOT NULL'; END IF;

  SELECT pg_get_function_result(oid) INTO t FROM pg_proc
    WHERE proname='get_user_organization' AND pronamespace='public'::regnamespace;
  IF t <> 'text' THEN RAISE EXCEPTION 'get_user_organization return type drift: %', t; END IF;

  SELECT pg_get_function_result(oid) INTO t FROM pg_proc
    WHERE proname='get_user_organization_uuid' AND pronamespace='public'::regnamespace;
  IF t <> 'uuid' THEN RAISE EXCEPTION 'get_user_organization_uuid missing or wrong type: %', t; END IF;

  SELECT count(*) INTO n FROM pg_trigger
    WHERE tgfoid='public.bridge_set_org_uuid'::regproc::oid AND NOT tgisinternal;
  IF n <> 53 THEN RAISE EXCEPTION 'bridge trigger attached to % tables, expected 53', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'on_auth_user_created trigger missing'; END IF;
END $$;

COMMIT;
