-- ============================================================
-- Add missing DELETE policy on meeting_action_items
-- ============================================================
-- Step 1's migration added INSERT and UPDATE policies for active leads
-- but no DELETE policy. With RLS enabled and no matching policy, DELETE
-- silently affects zero rows (no error from PostgREST), causing the
-- delete-action-item UX from Step 4 to appear to work locally but never
-- persist. This adds the missing policy with the same scope as INSERT/UPDATE.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS meeting_action_items_delete_active_leads ON public.meeting_action_items;
CREATE POLICY meeting_action_items_delete_active_leads
  ON public.meeting_action_items
  FOR DELETE
  TO authenticated
  USING (public.is_active_meeting_lead(auth.uid()));

COMMIT;
