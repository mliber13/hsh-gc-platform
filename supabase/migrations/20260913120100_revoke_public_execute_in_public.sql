-- Batch 1D, item 1 completed — revoke the PUBLIC EXECUTE grant as well.
--
-- 20260913120000 revoked EXECUTE from the named role anon, which is what the
-- brief specified. Re-running Check 1 afterwards showed anon could still
-- execute 70 of the 99 functions in public, so the fix was only half done.
--
-- The reason is the exact mirror of the bug the brief diagnosed. The brief
-- observed, correctly, that "REVOKE ... FROM PUBLIC never cleared the anon
-- grant, because anon is a named role". The converse holds just as strongly:
-- REVOKE ... FROM anon does not clear a PUBLIC grant, and anon -- like every
-- role -- inherits whatever PUBLIC holds.
--
-- Both grants were present side by side, because a function created by
-- postgres under the default privileges picked up the named anon grant, while
-- PostgreSQL's own built-in default for functions grants EXECUTE to PUBLIC.
-- An ACL of {=X/postgres,postgres=X,authenticated=X,service_role=X,anon=X} has
-- two independent paths to anon; 20260913120000 removed one of them.
--
-- Only the functions whose migrations happened to include an explicit
-- REVOKE ALL ... FROM PUBLIC were actually closed by the first pass -- which is
-- why comms_user_is_office and user_is_field_foreman, the two the brief named,
-- did go dark and made the fix look complete.
--
-- Safe to revoke, verified rather than assumed: every function in public that
-- carries a PUBLIC EXECUTE grant also carries explicit named grants to both
-- authenticated and service_role, so no role loses anything it was actually
-- relying on. Measured before this migration, over all 99 functions in public:
--   anon 70, authenticated 99, service_role 99.
-- Expected after: anon 1, authenticated 99, service_role 99.
--
-- Trigger functions are unaffected. PostgreSQL checks EXECUTE on a trigger
-- function at CREATE TRIGGER time, not each time the trigger fires, and every
-- one of them keeps its named authenticated grant regardless.

BEGIN;

-- Stop new functions inheriting the built-in PUBLIC default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Clear the PUBLIC grant already on the existing functions.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- get_crew_invite_by_token keeps its named anon grant from 20260913120000 and
-- is unaffected by the PUBLIC revoke, but re-assert it so this file is
-- self-contained: if someone reverts only one of the two migrations, crew
-- signup must not be what tells them.
GRANT EXECUTE ON FUNCTION public.get_crew_invite_by_token(text) TO anon;

COMMIT;
