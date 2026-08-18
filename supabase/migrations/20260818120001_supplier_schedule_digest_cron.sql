-- ============================================================
-- Weekday-morning supplier delivery-schedule digest via pg_cron
-- ============================================================
-- Fires Mon–Fri at 12:00 & 13:00 UTC; the edge function checks NY time and
-- only proceeds during the 8am NY hour (DST-safe, single send/day), then emails
-- only the suppliers whose schedule changed since their last digest.
--
-- Apply AFTER deploying the function:
--   supabase functions deploy send-supplier-schedule-digest
-- The cron is a harmless no-op until the function exists.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'supplier-schedule-digest-weekday',
  '0 12,13 * * 1-5',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/send-supplier-schedule-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
