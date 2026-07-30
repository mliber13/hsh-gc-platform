-- ============================================================
-- Enable full replica identity on meeting_action_items
-- ============================================================
-- Realtime DELETE events were not propagating to subscribers because
-- Postgres only logs the primary key of deleted rows by default, which
-- prevents Supabase Realtime from evaluating row filters like
-- meeting_id=eq.<id>. REPLICA IDENTITY FULL logs the entire old row,
-- letting the filter match and the event reach the subscriber.
--
-- Already applied via SQL editor against the live DB; this migration
-- captures the change so fresh environments (staging, local resets,
-- new clones) get it automatically. ALTER ... REPLICA IDENTITY is
-- idempotent — replaying against a DB that already has it is a no-op.
-- ============================================================

ALTER TABLE public.meeting_action_items REPLICA IDENTITY FULL;
