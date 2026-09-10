# Cursor Brief — Batch 1D: the systemic anon grant, headers, and the write-policy gaps

Part of `docs/V1_HARDENING_PLAN_2026-09.md` Batch 1, and the last of it. **1A, 1B and 1C shipped**
(`95a28c8`/`eb06f06`, `c778185`/`ac25616`, `4c29f3d`…`e71e251`). After this lands, Batch 1 is done and
Batch 2 (money) is next.

Eight items. One migration, one config file, two small deletions. No crew-facing behaviour changes — the
smoke here is operator-side.

---

## Read this first — the trap

**Exactly one function in `public` legitimately needs `anon` EXECUTE, and a blanket revoke kills it.**

`get_crew_invite_by_token(text)` is called by `CrewSignupPage` **before** the user has an account, so the
caller really is anonymous. Revoke it and crew signup breaks at the first step, silently — the page shows
"invite token is invalid" rather than a permission error.

The other two functions that ever carried a deliberate anon grant — `get_quote_request_by_token` and
`submit_vendor_quote` — were dropped in 1C, which is what makes this carve-out a single line instead of a
list.

**What is NOT affected, and must not be "fixed" defensively:**

- `/supplier/:token` and `/customer/:token` do **not** call `public` RPCs as anon. They go through the
  `supplier-order-share` and `customer-schedule-share` edge functions
  (`supplierShareService.ts:68,86`, `customerShareService.ts:77,94`), and those functions call
  `supplier_share_orders` / `customer_share_schedule` with the **service-role** key. Those RPCs are granted
  `TO service_role`, not `anon`. This batch does not touch them.
- **Do not add auth checks to those two edge functions.** They are anon-by-design; their whole purpose is
  a no-login link. 1A added auth to two *different* functions. Leave `verify_jwt` and the edge function
  code alone entirely in this brief.

Before applying, confirm no edge function calls a `public` RPC using the anon key rather than the service
key — grep `supabase/functions/` for `SUPABASE_ANON_KEY` alongside `.rpc(`. Report what you find.

---

## Pre-flight MCP checks (reads only — `db push` applies, see "Applying")

**Check 1 — the current anon grant surface.**

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by anon_can_execute desc, p.proname;
```

Report the count of `anon_can_execute = true`. The plan measured 76 on 2026-09-04; 1C dropped two.

**Check 2 — where the default privilege comes from.** This decides whether the fix holds for *future*
functions or only clears today's:

```sql
select defaclrole::regrole as granted_by, defaclnamespace::regnamespace as schema,
       defaclobjtype, defaclacl
from pg_default_acl;
```

`ALTER DEFAULT PRIVILEGES` is recorded **per granting role**. If the entry is owned by `postgres`, the
revoke must say `FOR ROLE postgres` or it silently does nothing. **If Check 2 returns no rows for
functions in `public`, stop and report** — the grant is coming from somewhere else and item 1 needs
rethinking.

**Check 3 — `organizations` and the stray view (P1-SEC-4).**

```sql
select relname, relrowsecurity from pg_class
where relname in ('organizations','unsynced_qb_entries');
select polname, pg_get_expr(polqual, polrelid) from pg_policy
where polrelid = 'public.organizations'::regclass;
select viewname, definition from pg_views where viewname = 'unsynced_qb_entries';
```

`organizations` has no `CREATE TABLE` in any migration — it is a Dashboard-created object, and a prior
audit found it anon-readable.

**Check 4 — the write policies for item 4.**

```sql
select c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) as using_expr
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in ('sub_items','project_documents','selection_books','selection_rooms',
                    'selection_room_images','selection_room_spec_sheets','deals',
                    'tenant_pipeline_prospects','org_holidays','subcontractor_unavailability',
                    'communication_log_entries','trade_categories','sow_templates')
  and p.polcmd <> 'r'
order by c.relname, p.polname;
```

---

## 1. P1-SEC-5 — revoke `anon` systemically, not per function

Every SECURITY DEFINER function in `public` carries `anon=X`, inherited from a schema-wide
`ALTER DEFAULT PRIVILEGES`. This is why the existing `REVOKE ALL … FROM PUBLIC` lines throughout the
migrations never cleared it: `anon` is a **named role**, and revoking from `PUBLIC` does not touch a named
grant.

Most are harmless — they raise `not authenticated` when `auth.uid()` is null. The exceptions are the
predicates that take an explicit uid and answer a question about *that* person rather than the caller:
`comms_user_is_office(uid)`, `user_is_field_foreman(uid)`, `person_is_field_foreman(text)`. An anon caller
who already knows an id gets a boolean back. No content is reachable, but it is free to close.

Fix it at the source, in this order:

```sql
-- Stop future functions inheriting it. Use the grantor role from Check 2.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Clear what is already granted.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- The one deliberate exception. See the trap above.
GRANT EXECUTE ON FUNCTION public.get_crew_invite_by_token(text) TO anon;
```

Add a comment on that last grant saying why it is the exception, so the next systemic revoke does not
quietly take it out.

**Report the before/after count from Check 1.** Expect roughly 76 → 1.

---

## 2. P1-SEC-5 remainder — four small hardenings in the same file

- **`next_drywall_quote_number(p_org uuid)`** (`20260603130000:4`) and **`next_client_quote_number(p_org uuid)`**
  (`20260514_client_quotes_schema.sql:146`) trust the org they are handed. Single-org today, so no live
  exposure. Add `IF p_org <> public.get_user_organization_uuid() THEN RAISE EXCEPTION …`, or drop the
  parameter and derive it. **Prefer the check over the signature change** — a signature change means a
  `DROP FUNCTION` plus re-issued grants, and callers to update.
- **`display_name_for_user(uid)` / `display_names_for_user(...)`** (`20260806120000`, `20260806140000`)
  resolve any uid, including cross-org. Scope to the caller's org.
- **`push_subscriptions.organization_id` is client-supplied and unchecked** (`20260729115556`). Derive it
  server-side in the insert policy `WITH CHECK`, or force it via a trigger.
- **`sow_templates`**: `014_update_sow_template_delete_policy.sql` widened DELETE beyond
  `auth.uid() = user_id`, and `20260427000001:37` adds an org-wide manage policy — so a system template
  (`user_id IS NULL`, from `012`) is deletable by any org user. Restrict DELETE of `user_id IS NULL` rows
  to admin/owner. **Confirm the live policies from Check 4 first**; I am reading migration files, not the
  database.

---

## 3. P1-SEC-4 — `organizations` and `unsynced_qb_entries`

Per Check 3: enable RLS on `organizations` with an org-scoped SELECT policy
(`id = public.get_user_organization_uuid()`), no anon path. **Verify what reads it first** — it is
referenced by FKs everywhere and by `crew_invite_tokens.organization_id`; if a signup-time read needs it,
that read has to move behind a definer function rather than the policy being widened.

`unsynced_qb_entries` is a view without `security_invoker` and is unused by the app. Drop it. If Check 3
shows it does not exist, say so and move on.

---

## 4. P1-SEC-11 — write policies gated on org membership only

The tables in Check 4 have INSERT/UPDATE/DELETE policies that check org membership but not
`user_can_edit()`, so a `viewer` — or, before 1B, a crew account — could write to them.

Add `AND public.user_can_edit()` to each write policy Check 4 turns up. `user_can_edit()` now also requires
an active account (1A), so this closes deactivated-user writes at the same time.

**Two cautions.** `project_documents` is ACTIVE-CORE — GC project documents are one of the three live GC
surfaces this cycle, so confirm the app writes them as an editor or better, not as a viewer, before
tightening. And do not touch SELECT policies here; this item is writes only.

---

## 5. P1-SEC-8 — security headers

`vercel.json` has rewrites and a `sw.js` cache rule but no security headers. Add a global block:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(self)` — **camera and geolocation stay
  `self`**: the crew measure page uses camera capture for site photos.
- `Content-Security-Policy: frame-ancestors 'none'` — the public share pages are clickjackable today.

Add `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.

**Do not add a full CSP with `script-src`/`connect-src` in this brief.** A restrictive CSP against
Supabase, Twilio and the PWA needs its own pass with a report-only period first; `frame-ancestors` alone is
safe and closes the clickjacking finding.

---

## 6. P1-SEC-12 — the anon JWT in two archived scripts

`scripts/a5c2-c1-smoke.mjs:13` and `scripts/a5c2-c2-smoke.mjs:16` embed the anon JWT literally. The anon
key is public by design so this is hygiene, not an incident — but a literal key in a repo trains the wrong
habit and ages badly if the project is ever rotated.

Read from `process.env.VITE_SUPABASE_ANON_KEY` with a clear error if unset, then move both to
`scripts/archive/`.

---

## 7. P1-SEC-10 — reconcile `supabase/pending/`

`supabase/pending/` now holds only `README.md`, which still describes
`20260730120100_anon_lockdown_drop_policies.sql` as staged and unapplied. That migration is in
`supabase/migrations/` and applied. The directory is now a lie.

Delete `supabase/pending/` entirely. Confirm first that `20260730120100` shows as applied in
`supabase migration list`.

---

## 8. Two carry-overs from 1B and 1C

- **`dfp_auth_insert` is org-wide** (`20260529120000:91`). 1B scoped the photo DELETE and reported that the
  INSERT carries the identical predicate, so a crew account can still upload into any project's folder in
  the org. Add the same `public.drywall_photo_crew_scope_ok(name)` term 1B built.
- **Delete `src/config/appConfig.ts`.** Fully orphaned after 1C: `buildVendorPortalLink` builds URLs for a
  route that no longer exists, `getVendorPortalBaseUrl` feeds only it, and `getAppBaseUrl` has no other
  importer. Verified — the only file matching those symbols is itself. Remove the `VITE_VENDOR_PORTAL_URL`
  reference from any `.env.example` too.

---

## Applying

**One migration file, applied with `supabase db push`. No MCP `apply_migration`, no Dashboard SQL editor.**

File: `supabase/migrations/20260913120000_systemic_anon_revoke_and_policy_gaps.sql`, items 1-4 and the
`dfp_auth_insert` term from item 8, in `BEGIN; … COMMIT;`.

Items 5, 6, 7 and the `appConfig` deletion are separate non-migration commits.

---

## Verification

### Cursor-side

1. `npx tsc --noEmit` clean; `npx vitest run` 52 files / 334 tests green (baseline `096c9d1`); `npm run build`.
2. `supabase db push`; `supabase migration list` in sync, no remote-only versions.
3. Re-run Check 1 — report the anon count before and after, and confirm the only remaining
   `anon_can_execute = true` row is `get_crew_invite_by_token`.
4. **The anon probe.** With the anon key alone and no session, confirm `get_crew_invite_by_token` still
   executes (returns null for a junk token rather than a permission error), and that
   `comms_user_is_office` and `user_is_field_foreman` now return a permission error instead of a boolean.
   Run this before as well as after — a test that cannot detect the old behaviour proves nothing.
5. Confirm `vercel.json` parses (`npx vercel build --prod` is not required; a JSON lint is enough).

### Operator-side — Mark runs these

**Batch 1 is complete after this, so this run should cover 1A–1D together.** The crew walk-through in
`docs/briefs/CREW_SMOKE_WALKTHROUGH.md` has never been run — 1A and 1B are applied but unsmoked.

1. **The full crew walk-through** — that doc, start to finish. Covers 1A's trigger, 1B's read scoping and
   this batch's anon revoke in one pass. Step 4's assignment note matters more than ever.
2. **Crew signup specifically** is the item-1 regression test: it is the one anon call left in `public`.
3. GC: project documents — upload, view, delete. That is item 4's ACTIVE-CORE caution.
4. GC: EstimateBuilder quote PDF upload and open (still the `quote-documents` public-URL path — unchanged
   by this batch, but it is the thing most likely to be collateral).
5. Drywall: send a quote, open the supplier share link, open the customer schedule link. Those three prove
   the edge-function path was untouched.
6. Push notifications still register on a phone (item 2 changes the `push_subscriptions` insert path).

---

## Out of scope

- The two share edge functions and their `verify_jwt` setting — see the trap.
- A full `script-src`/`connect-src` CSP — item 5 explains why.
- Dropping `quote_requests` / `submitted_quotes`, or the `quote-attachments` bucket. `backupService.ts:158-159`
  reads both tables by runtime string name; that is a Batch 6 decision with its own check.
- `quote-documents` bucket visibility — Batch 4, after `uploadQuotePDF` moves to signed URLs.
- The six stale root docs describing the RFQ chain — Batch 0 hygiene.
- Anything in Batches 2-6.
- Do not clean up while you are in there. Report, do not fix.

---

## Commit

Four commits.

```
fix(security): revoke the schema-wide anon grant and close the write-policy gaps

Every SECURITY DEFINER function in public carried anon=X, inherited from a
schema-wide ALTER DEFAULT PRIVILEGES rather than from any one migration. The
REVOKE ... FROM PUBLIC lines scattered through the migrations never cleared it,
because anon is a named role and revoking from PUBLIC does not touch a named
grant. Fixed at the source: the default privilege is revoked so new functions do
not inherit it, existing grants are cleared, and get_crew_invite_by_token is
re-granted as the single deliberate exception -- crew signup calls it before the
user has an account.

The quote-number functions now check the org they are handed instead of trusting
it, display_name_for_user is org-scoped, push_subscriptions derives its org
server-side, and deleting a system SOW template is admin-only.

Write policies on the GC and deal tables gated on org membership alone, so a
viewer could insert, update and delete. They now require user_can_edit(), which
since 1A also means an active account.

organizations gets RLS. dfp_auth_insert gets the project-scope term 1B built for
the matching DELETE policy.
```

```
fix(security): security headers on the deployed app

frame-ancestors 'none' -- the public share pages were clickjackable. Plus
nosniff, a referrer policy, and a permissions policy that keeps camera and
geolocation on self, because the crew measure page captures site photos.

No script-src or connect-src yet: a real CSP against Supabase, Twilio and the
PWA wants its own pass with a report-only period first.
```

```
chore(scripts): read the anon key from env instead of embedding it

The anon key is public by design, so this is hygiene rather than an incident --
but a literal JWT in the repo trains the wrong habit. Both archived smoke
scripts now read it from the environment and moved to scripts/archive/.
```

```
chore: drop supabase/pending and the orphaned app config

supabase/pending held only a README describing a migration that has been applied
since July, so the directory was actively misleading. appConfig.ts went fully
orphaned when 1C removed the vendor portal -- buildVendorPortalLink builds URLs
for a route that no longer exists, and nothing imports any of it.
```

**Exclude from every commit:** `.claude/settings.local.json` and `supabase/.temp/cli-latest`.

---

## STOP — report before going further

1. Check 1 anon count before and after, and the list of anything still holding anon EXECUTE.
2. Check 2 — where the default privilege came from, and whether `FOR ROLE postgres` was the right grantor.
3. Any edge function calling a `public` RPC with the anon key.
4. Check 3 — what `organizations` looked like, and whether `unsynced_qb_entries` existed.
5. Check 4 — the write policies you changed, and anything you left alone and why (especially
   `project_documents`).
6. The anon probe results, before and after.
7. `tsc` / `vitest` / `build` / `supabase migration list`.
8. Anything found and not fixed.
