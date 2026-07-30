-- Schedule redesign Step 7: confirmation state on schedule items
-- Reference: docs/SCHEDULE_TARGET_MODEL.md section 4.2, section 4.2a,
-- section 5.2 confirmation shape, section 10 step 7.

ALTER TABLE public.schedule_items
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'unsent'
    CHECK (confirmation_status IN ('unsent', 'pending', 'confirmed', 'declined', 'no-reply')),
  ADD COLUMN confirmation_last_sent_at timestamptz,
  ADD COLUMN confirmation_last_responded_at timestamptz,
  ADD COLUMN confirmation_notes text;

-- Reset to pending when dates change, but only if there was a prior commitment.
CREATE OR REPLACE FUNCTION public.reset_schedule_item_confirmation_on_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date)
     AND OLD.confirmation_status IN ('confirmed', 'declined', 'no-reply')
  THEN
    NEW.confirmation_status := 'pending';
    NEW.confirmation_last_sent_at := NULL;
    NEW.confirmation_last_responded_at := NULL;
    -- confirmation_notes preserved
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_schedule_item_confirmation_reset
  BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_schedule_item_confirmation_on_date_change();
