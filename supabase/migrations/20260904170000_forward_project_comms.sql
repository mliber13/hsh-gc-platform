-- Let the office forward a message into another lane.
--
-- The lane model makes the office the hub, but gave it no way to route: when a crew
-- member writes "this message is for Shane — bring 9 boxes of all-purpose Tuesday",
-- only the office could see it, and Shane never did.
--
-- A forward is a COPY into the destination lane, not a reference. It has to be:
-- reading through to the source row would be blocked by RLS (the original sits in
-- the sender's private lane, which the recipient may not read), so the parts the
-- recipient needs to see are denormalized onto the copy.
--
-- Attribution keeps the message honest. The copy keeps the ORIGINAL author, so Shane
-- sees the words as Phil's, and records who forwarded it so it's clear the office
-- passed it along rather than Phil messaging Shane directly.

BEGIN;

ALTER TABLE public.project_comms
  ADD COLUMN IF NOT EXISTS forwarded_from_id uuid
    REFERENCES public.project_comms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_by_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_by_name text;

CREATE INDEX IF NOT EXISTS idx_project_comms_forwarded_from
  ON public.project_comms(forwarded_from_id)
  WHERE forwarded_from_id IS NOT NULL;

COMMENT ON COLUMN public.project_comms.forwarded_from_id IS
  'Source message when this row is a forward. The copy carries the original author; '
  'forwarded_by_* records who routed it.';

-- ---------------------------------------------------------------------------
-- forward_project_comms — office-only; copies a message into another lane.
--   p_to_person_id NULL  -> forward to the job-wide lane (everyone assigned)
--   p_to_person_id given -> forward into that person's private lane
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.forward_project_comms(
  p_message_id uuid,
  p_to_person_id text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.project_comms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_src public.project_comms;
  v_to text;
  v_audience text;
  v_body text;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_forwarder text;
  v_row public.project_comms;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  -- Routing is an office job. Crew cannot forward — that would let them leak
  -- their own lane into someone else's, which is the thing lanes prevent.
  IF NOT public.comms_user_is_office(v_uid) THEN
    RAISE EXCEPTION 'not authorized to forward messages';
  END IF;

  SELECT * INTO v_src
    FROM public.project_comms
   WHERE id = p_message_id
     AND organization_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  v_to := NULLIF(trim(COALESCE(p_to_person_id, '')), '');
  v_audience := CASE WHEN v_to IS NULL THEN 'job' ELSE 'crew' END;

  -- Forwarding a message back into the lane it already sits in is a no-op that
  -- would just duplicate it.
  IF v_src.audience = v_audience
     AND COALESCE(v_src.audience_person_id, '') = COALESCE(v_to, '') THEN
    RAISE EXCEPTION 'message is already in that conversation';
  END IF;

  -- An optional note from the office rides above the quoted original.
  v_body := CASE WHEN v_note IS NULL THEN v_src.body ELSE v_note || E'\n\n' || v_src.body END;

  v_forwarder := COALESCE(NULLIF(trim(public.display_name_for_user(v_uid)), ''), 'The office');

  INSERT INTO public.project_comms (
    organization_id, project_id, author_user_id, author_person_id,
    author_name, author_role, audience, audience_person_id, body,
    forwarded_from_id, forwarded_by_user_id, forwarded_by_name
  ) VALUES (
    v_org, v_src.project_id, v_src.author_user_id, v_src.author_person_id,
    v_src.author_name, v_src.author_role, v_audience, v_to, v_body,
    v_src.id, v_uid, v_forwarder
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_project_comms(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forward_project_comms(uuid, text, text) TO authenticated;

COMMIT;
