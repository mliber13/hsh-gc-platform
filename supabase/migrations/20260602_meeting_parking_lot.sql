-- ============================================================
-- Meeting parking lot + sidebar
-- ============================================================
-- Captures off-topic items raised during lead sections; reviewed
-- after all lead sections with five outcomes: discussed, dropped,
-- deferred (carry to next meeting), converted (-> action item),
-- or sidebar (small group handles offline with optional note).
--
-- Sidebar mini-lifecycle: 'sidebar' -> 'sidebar_resolved' OR
-- converted. Participants tracked as uuid[] of meeting_leads.id.
-- Any participant or operator can resolve a sidebar.
--
-- Origin vs active meeting: rows store both, so history per meeting
-- (origin_meeting_id) and current-week parking lot (active_meeting_id)
-- can be queried independently. Defer updates active_meeting_id only.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_parking_lot_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin_meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  active_meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (length(trim(topic)) > 0),
  raised_by_lead_id uuid REFERENCES public.meeting_leads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'discussed', 'dropped', 'deferred',
    'converted', 'sidebar', 'sidebar_resolved'
  )),
  action_item_id uuid REFERENCES public.meeting_action_items(id) ON DELETE SET NULL,
  drop_reason text,
  sidebar_participants uuid[] NOT NULL DEFAULT '{}',
  sidebar_note text,
  sidebar_resolved_at timestamptz,
  sidebar_resolved_by_lead_id uuid REFERENCES public.meeting_leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parking_lot_active_meeting
  ON public.meeting_parking_lot_items(active_meeting_id);
CREATE INDEX IF NOT EXISTS idx_parking_lot_origin_meeting
  ON public.meeting_parking_lot_items(origin_meeting_id);
CREATE INDEX IF NOT EXISTS idx_parking_lot_status
  ON public.meeting_parking_lot_items(status);
CREATE INDEX IF NOT EXISTS idx_parking_lot_sidebar_participants
  ON public.meeting_parking_lot_items USING GIN (sidebar_participants);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.meeting_parking_lot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_lot_select_active_leads ON public.meeting_parking_lot_items;
CREATE POLICY parking_lot_select_active_leads
  ON public.meeting_parking_lot_items
  FOR SELECT
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

DROP POLICY IF EXISTS parking_lot_insert_operator ON public.meeting_parking_lot_items;
CREATE POLICY parking_lot_insert_operator
  ON public.meeting_parking_lot_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_meeting_operator(auth.uid()));

DROP POLICY IF EXISTS parking_lot_update_operator_or_participant ON public.meeting_parking_lot_items;
CREATE POLICY parking_lot_update_operator_or_participant
  ON public.meeting_parking_lot_items
  FOR UPDATE
  TO authenticated
  USING (
    public.is_meeting_operator(auth.uid())
    OR (
      SELECT id FROM public.meeting_leads
      WHERE user_id = auth.uid() AND is_active = true
      LIMIT 1
    ) = ANY(sidebar_participants)
  )
  WITH CHECK (
    public.is_meeting_operator(auth.uid())
    OR (
      SELECT id FROM public.meeting_leads
      WHERE user_id = auth.uid() AND is_active = true
      LIMIT 1
    ) = ANY(sidebar_participants)
  );

DROP POLICY IF EXISTS parking_lot_delete_operator ON public.meeting_parking_lot_items;
CREATE POLICY parking_lot_delete_operator
  ON public.meeting_parking_lot_items
  FOR DELETE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()));

-- ============================================================
-- Atomic convert-to-action-item RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_parking_lot_to_action_item(
  p_parking_item_id uuid,
  p_task text,
  p_owner_lead_id uuid,
  p_due_date date,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action_item_id uuid;
  v_meeting_id uuid;
BEGIN
  IF NOT public.is_meeting_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT active_meeting_id INTO v_meeting_id
  FROM public.meeting_parking_lot_items
  WHERE id = p_parking_item_id;

  IF v_meeting_id IS NULL THEN
    RAISE EXCEPTION 'Parking lot item not found';
  END IF;

  INSERT INTO public.meeting_action_items
    (meeting_id, task, owner_lead_id, due_date, notes, created_by)
  VALUES
    (v_meeting_id, p_task, p_owner_lead_id, p_due_date, p_notes, auth.uid())
  RETURNING id INTO v_action_item_id;

  UPDATE public.meeting_parking_lot_items
  SET status = 'converted',
      action_item_id = v_action_item_id,
      resolved_at = now()
  WHERE id = p_parking_item_id;

  RETURN v_action_item_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_parking_lot_to_action_item(uuid, text, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_parking_lot_to_action_item(uuid, text, uuid, date, text) TO authenticated;
