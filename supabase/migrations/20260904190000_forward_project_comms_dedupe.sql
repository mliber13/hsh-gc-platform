-- Fix: forwarding the same message to the same person twice created a duplicate.
--
-- The guard in 20260904170000 only rejected forwarding a message back into the
-- lane it already occupied. It compared the SOURCE's lane against the destination,
-- so a second forward of Phil's message to Shane compared Phil against Shane, did
-- not match, and inserted another copy. The dialog filters the source's own lane
-- out of the picker, which made the original guard nearly unreachable while the
-- real duplicate path stayed open.
--
-- Now the check asks the question that matters: has THIS message already been
-- forwarded THERE. Not a leak either way — duplicates landed in the lane the
-- office chose — but it made a stray double-tap look like two messages.
--
-- Also collapses forward chains. Forwarding an already-forwarded copy onward now
-- records the ORIGINAL as the source, so "Forwarded to ..." under the original
-- stays complete and the duplicate check still works one hop later.
--
-- Signature (uuid, text, text) and return type (project_comms) are unchanged, so
-- CREATE OR REPLACE is sufficient — no 42P13.

BEGIN;

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
  v_root uuid;
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

  -- Forwarding a forward credits the original, so chains collapse to one root.
  v_root := COALESCE(v_src.forwarded_from_id, v_src.id);

  v_to := NULLIF(trim(COALESCE(p_to_person_id, '')), '');
  v_audience := CASE WHEN v_to IS NULL THEN 'job' ELSE 'crew' END;

  -- Already sitting in the destination lane.
  IF v_src.audience = v_audience
     AND COALESCE(v_src.audience_person_id, '') = COALESCE(v_to, '') THEN
    RAISE EXCEPTION 'message is already in that conversation';
  END IF;

  -- Already forwarded there. Checked against the root so a second hop counts.
  IF EXISTS (
    SELECT 1
      FROM public.project_comms c
     WHERE c.forwarded_from_id = v_root
       AND c.organization_id = v_org
       AND c.audience = v_audience
       AND COALESCE(c.audience_person_id, '') = COALESCE(v_to, '')
  ) THEN
    RAISE EXCEPTION 'that message has already been forwarded there';
  END IF;

  -- The original itself may be the destination's own message.
  IF EXISTS (
    SELECT 1
      FROM public.project_comms c
     WHERE c.id = v_root
       AND c.audience = v_audience
       AND COALESCE(c.audience_person_id, '') = COALESCE(v_to, '')
  ) THEN
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
    v_root, v_uid, v_forwarder
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_project_comms(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forward_project_comms(uuid, text, text) TO authenticated;

COMMIT;
