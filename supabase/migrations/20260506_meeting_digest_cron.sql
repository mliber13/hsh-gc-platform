-- ============================================================
-- Schedule weekly meeting digest emails via pg_cron
-- ============================================================
-- Two cron rows (one per edge function), invoking the functions every
-- Monday at 13:00 UTC. The functions check current NY time internally
-- and exit early if it's not within the 8am NY hour, which handles DST
-- transitions cleanly without two cron rows or fixed UTC drift.
--
-- Idempotency is enforced at the row level via meeting_digest_sends -
-- safe to manually invoke any time without risking double-sends.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'meeting-pre-read-digest-monday',
  '0 12,13 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-meeting-pre-read-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'meeting-action-items-digest-monday',
  '5 12,13 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-meeting-action-items-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
