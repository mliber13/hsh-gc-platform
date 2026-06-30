-- D.6.3 follow-up — operators can SELECT crew comms read state for read receipts.
-- Crew UPSERT-own behavior unchanged via existing "Users manage own read state" FOR ALL policy.

BEGIN;

DROP POLICY IF EXISTS operators_can_read_comms_read_state ON public.comms_read_state;

CREATE POLICY operators_can_read_comms_read_state
  ON public.comms_read_state
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.user_has_rbac_role(
      ARRAY['owner', 'office_gc', 'office_drywall']::text[],
      auth.uid()
    )
  );

COMMIT;
