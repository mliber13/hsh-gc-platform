-- ============================================================
-- Weekly meeting workflow v1: schema, helpers, RLS, and seed data
-- ============================================================
-- Adds the weekly meeting data model and security model:
--   - meeting_leads, meeting_prompts, meetings, meeting_submissions,
--     meeting_action_items, meeting_digest_sends
--   - helper functions for week-of computation and operator checks
--   - RLS policies aligned to Supabase Auth + meeting_leads membership
--   - seed data for six leads and placeholder prompts (5 per lead)
--
-- Notes:
--   - Prompt text is intentionally placeholder-only for operator replacement.
--   - Cron wiring and edge-function scheduling are handled in a later step.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.meeting_week_of(ts timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT (date_trunc('week', ts AT TIME ZONE 'America/New_York'))::date;
$function$;

-- ============================================================
-- 2) Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  area_label text NOT NULL,
  is_meeting_operator boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_prompts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES public.meeting_leads(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  default_live_discuss boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_date date NOT NULL UNIQUE,
  week_of date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_submissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES public.meeting_leads(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES public.meeting_prompts(id) ON DELETE CASCADE,
  week_of date NOT NULL,
  answer_text text,
  is_live_discuss boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, prompt_id, week_of)
);

CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  task text NOT NULL,
  owner_lead_id uuid NOT NULL REFERENCES public.meeting_leads(id),
  due_date date,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Done', 'Dropped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.meeting_digest_sends (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES public.meeting_leads(id) ON DELETE CASCADE,
  week_of date NOT NULL,
  digest_type text NOT NULL CHECK (digest_type IN ('pre_read', 'action_items')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  resend_message_id text,
  UNIQUE (lead_id, week_of, digest_type)
);

CREATE OR REPLACE FUNCTION public.is_active_meeting_lead(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_leads ml
    WHERE ml.user_id = uid
      AND ml.is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_meeting_operator(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_leads ml
    WHERE ml.user_id = uid
      AND ml.is_active = true
      AND ml.is_meeting_operator = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.list_assignable_meeting_lead_users()
RETURNS TABLE (
  id uuid,
  email text,
  currently_linked_lead_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_meeting_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    au.id,
    au.email::text,
    ml.id AS currently_linked_lead_id
  FROM auth.users au
  LEFT JOIN public.meeting_leads ml
    ON ml.user_id = au.id
  ORDER BY au.email NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_assignable_meeting_lead_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_meeting_lead_users() TO authenticated;

-- ============================================================
-- 3) Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_meeting_submissions_week_of_lead_id
  ON public.meeting_submissions (week_of, lead_id);

CREATE INDEX IF NOT EXISTS idx_meeting_prompts_lead_order_active
  ON public.meeting_prompts (lead_id, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_meeting_action_items_owner_status_due
  ON public.meeting_action_items (owner_lead_id, status, due_date);

-- ============================================================
-- 4) updated_at triggers
-- ============================================================

DROP TRIGGER IF EXISTS update_meeting_leads_updated_at ON public.meeting_leads;
CREATE TRIGGER update_meeting_leads_updated_at
  BEFORE UPDATE ON public.meeting_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meeting_prompts_updated_at ON public.meeting_prompts;
CREATE TRIGGER update_meeting_prompts_updated_at
  BEFORE UPDATE ON public.meeting_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meeting_action_items_updated_at ON public.meeting_action_items;
CREATE TRIGGER update_meeting_action_items_updated_at
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5) RLS enablement
-- ============================================================

ALTER TABLE public.meeting_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_digest_sends ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6) RLS policies
-- ============================================================

-- ----- Shared read access for active leads -----
DROP POLICY IF EXISTS meeting_leads_select_active_leads ON public.meeting_leads;
CREATE POLICY meeting_leads_select_active_leads
  ON public.meeting_leads
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meeting_prompts_select_active_leads ON public.meeting_prompts;
CREATE POLICY meeting_prompts_select_active_leads
  ON public.meeting_prompts
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meetings_select_active_leads ON public.meetings;
CREATE POLICY meetings_select_active_leads
  ON public.meetings
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meeting_submissions_select_active_leads ON public.meeting_submissions;
CREATE POLICY meeting_submissions_select_active_leads
  ON public.meeting_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meeting_action_items_select_active_leads ON public.meeting_action_items;
CREATE POLICY meeting_action_items_select_active_leads
  ON public.meeting_action_items
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meeting_digest_sends_select_active_leads ON public.meeting_digest_sends;
CREATE POLICY meeting_digest_sends_select_active_leads
  ON public.meeting_digest_sends
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

-- ----- meeting_submissions writes: owning lead only -----
DROP POLICY IF EXISTS meeting_submissions_insert_owner_only ON public.meeting_submissions;
CREATE POLICY meeting_submissions_insert_owner_only
  ON public.meeting_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meeting_leads ml
      WHERE ml.id = meeting_submissions.lead_id
        AND ml.user_id = auth.uid()
        AND ml.is_active = true
    )
  );

DROP POLICY IF EXISTS meeting_submissions_update_owner_only ON public.meeting_submissions;
CREATE POLICY meeting_submissions_update_owner_only
  ON public.meeting_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.meeting_leads ml
      WHERE ml.id = meeting_submissions.lead_id
        AND ml.user_id = auth.uid()
        AND ml.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.meeting_leads ml
      WHERE ml.id = meeting_submissions.lead_id
        AND ml.user_id = auth.uid()
        AND ml.is_active = true
    )
  );

-- ----- action items writes: any active lead -----
DROP POLICY IF EXISTS meeting_action_items_insert_active_leads ON public.meeting_action_items;
CREATE POLICY meeting_action_items_insert_active_leads
  ON public.meeting_action_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS meeting_action_items_update_active_leads ON public.meeting_action_items;
CREATE POLICY meeting_action_items_update_active_leads
  ON public.meeting_action_items
  FOR UPDATE
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()))
  WITH CHECK (public.is_active_meeting_lead(auth.uid()));

-- ----- admin writes: meeting operators only -----
DROP POLICY IF EXISTS meeting_leads_insert_operator_only ON public.meeting_leads;
CREATE POLICY meeting_leads_insert_operator_only
  ON public.meeting_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS meeting_leads_update_operator_only ON public.meeting_leads;
CREATE POLICY meeting_leads_update_operator_only
  ON public.meeting_leads
  FOR UPDATE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()))
  WITH CHECK (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS meeting_leads_delete_operator_only ON public.meeting_leads;
CREATE POLICY meeting_leads_delete_operator_only
  ON public.meeting_leads
  FOR DELETE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS meeting_prompts_insert_operator_only ON public.meeting_prompts;
CREATE POLICY meeting_prompts_insert_operator_only
  ON public.meeting_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS meeting_prompts_update_operator_only ON public.meeting_prompts;
CREATE POLICY meeting_prompts_update_operator_only
  ON public.meeting_prompts
  FOR UPDATE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()))
  WITH CHECK (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS meeting_prompts_delete_operator_only ON public.meeting_prompts;
CREATE POLICY meeting_prompts_delete_operator_only
  ON public.meeting_prompts
  FOR DELETE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()));

-- meeting_digest_sends intentionally has no INSERT/UPDATE/DELETE policies.
-- Edge functions run with service role and bypass RLS.

-- ============================================================
-- 7) Seed leads
-- ============================================================

INSERT INTO public.meeting_leads (display_name, area_label, is_meeting_operator, display_order, is_active)
VALUES
  ('Erik', 'Open / Growth & Development', true, 10, true),
  ('Lisa', 'Schedule & Customers', false, 20, true),
  ('Jennifer', 'Project Coordination & Design', false, 30, true),
  ('Mark', 'Estimating, PM & IT', false, 40, true),
  ('Kristen', 'AP & Operations Support', false, 50, true),
  ('Tess', 'Marketing & PR', false, 60, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8) Seed prompts (placeholder-only; operator will replace in admin UI)
-- ============================================================

INSERT INTO public.meeting_prompts (lead_id, question_text, default_live_discuss, display_order, is_active)
SELECT ml.id, p.question_text, p.default_live_discuss, p.display_order, true
FROM public.meeting_leads ml
CROSS JOIN (
  VALUES
    ('TODO: replace with real prompt', false, 10),
    ('TODO: replace with real prompt', false, 20),
    ('TODO: replace with real prompt', false, 30),
    ('TODO: replace with real prompt', false, 40),
    ('TODO: replace with real prompt', false, 50)
) AS p(question_text, default_live_discuss, display_order)
WHERE ml.display_name IN ('Erik', 'Lisa', 'Jennifer', 'Mark', 'Kristen', 'Tess')
  AND NOT EXISTS (
    SELECT 1
    FROM public.meeting_prompts mp
    WHERE mp.lead_id = ml.id
  );

COMMIT;
