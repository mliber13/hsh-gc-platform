-- Meeting operators can update any submission's is_live_discuss flag
-- during the live meeting. Owners retain their own-only UPDATE policy
-- (meeting_submissions_update_owner_only); this policy is additive.
--
-- Use case: during a meeting, the facilitator notices that a prompt
-- should be flagged for live discussion but the submitter forgot to
-- check the box on the pre-read. Operator clicks the inline toggle
-- in MeetingView to flip the flag mid-discussion.
--
-- Note: this gives operators UPDATE access to all columns on
-- meeting_submissions, not just is_live_discuss. RLS does not support
-- column-level scoping. Operators are trusted users (already manage
-- meeting_leads + meeting_prompts via existing operator-only policies).

DROP POLICY IF EXISTS meeting_submissions_update_operator ON public.meeting_submissions;
CREATE POLICY meeting_submissions_update_operator
  ON public.meeting_submissions
  FOR UPDATE
  TO authenticated
  USING (public.is_meeting_operator(auth.uid()))
  WITH CHECK (public.is_meeting_operator(auth.uid()));
