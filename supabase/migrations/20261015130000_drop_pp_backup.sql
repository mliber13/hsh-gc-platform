-- Drop public._pp_backup — Mark's OK 2026-10-15.
--
-- A leftover from the July payroll-recovery work, created out of band (no migration made it).
-- Empty (0 rows, checked 2026-10-15), referenced nowhere in app code, scripts or migrations, and
-- the only finding left in the Supabase security advisor ("RLS Disabled in public._pp_backup"):
-- with RLS off, the anon key could read it.
--
-- No CASCADE on purpose: if anything still depends on the table, this fails loudly instead of
-- taking the dependent object with it.
drop table if exists public._pp_backup;
