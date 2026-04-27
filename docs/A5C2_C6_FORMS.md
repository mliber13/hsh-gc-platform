# A5-c.2 — C2-6 (forms subsystem)

**Tables (3):** `form_templates`, `form_responses`, `project_forms`.

**Migration:** `supabase/migrations/20260427_a5c2_c6_forms.sql`. 8 policies + 1 H26 drive-by fix.

## H26 drive-by

Pre-flight 6.2 confirmed `project_forms.relrowsecurity = false` despite having 4 policies defined. Result: those policies were inert; any authenticated user could read/write any project_forms row regardless of org. **This was a sleeper security hole.** Migration enables RLS, which makes the (now-rewritten) policies actually enforce. Marks H26 partially closed for project_forms; remaining H26 tables (org_team / project_events / work_packages) get addressed in C2-9 and C2-10.

## Pattern

All standard recombinations from prior chunks:
- `form_templates`, `form_responses`: 1 SELECT + 1 FOR ALL with `is_user_active` / `user_can_edit` (same as C2-3 templates).
- `project_forms`: separate SELECT/INSERT/UPDATE/DELETE; DELETE admin-only (same as C2-3 estimates).

## Apply on branch

> Apply `supabase/migrations/20260427_a5c2_c6_forms.sql` against `clqgnnydrwpgxvipyotd` only. Don't apply to prod. Don't edit. Confirm COMMIT or paste error.
>
> Then run:
>
> ```sql
> -- 6.2.1
> select tablename, policyname, cmd,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('form_templates','form_responses','project_forms')
> order by tablename, policyname;
>
> -- 6.2.2
> select relname, relrowsecurity
> from pg_class c join pg_namespace n on n.oid=c.relnamespace
> where n.nspname='public' and relname in ('form_templates','form_responses','project_forms')
> order by relname;
> ```

Expected: 8 rows in 6.2.1 with all booleans `false`/`null`; all 3 tables show `relrowsecurity: true` in 6.2.2.

## App smoke

GC platform:
- [ ] Open a project with project_forms (prod has 2) → forms render correctly
- [ ] Open a form → fields show with their values
- [ ] Edit a form / add a field response → saves
- [ ] Form templates admin (if exposed) → 4 templates visible
- [ ] **Important:** with RLS now enabled on project_forms (H26 fix), confirm normal HSH user flows still work — they should, since uuid match holds for all 2 prod project_forms rows.

If anything fails on project_forms specifically, the H26 fix may have broken a flow. Diagnosis: confirm the user has HSH uuid in profile (they do — verified in C2-1 pre-flight).