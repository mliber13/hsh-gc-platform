# Supabase Health Audit — Bloat & Vulnerabilities

**Date:** 2026-07-16
**Project:** `rvtdavpsvrhbktbxquzm` (single live org: `b80516ed-…`)
**Method (read-only):**
- PostgREST enumeration + **anon-key read sweep** across all 83 exposed tables/views (`scripts/supabase-audit-recon.mjs`) — the sharpest available test for RLS gaps without DB-superuser access.
- Service-role row counts + metadata size profiling.
- Static analysis of `supabase/migrations/*.sql` (source of truth for RLS policies, `SECURITY DEFINER` functions, grants).

**Access limitations (what this audit could NOT measure directly):** No Supabase CLI and no DB password/connection string are available locally, so `pg_catalog` / `pg_stat_*` introspection (index usage, unused indexes, dead tuples, vacuum stats, `pg_stat_statements` outliers, per-row RLS policy cost) was **not** run. Those require the **Supabase Dashboard → Advisors** (Security + Performance) or the CLI with the DB password. See §5 for the exact checks to finish the job. Everything below is evidence-based from the methods above; live state can also drift from migrations (one migration this month was dashboard-applied) — the Dashboard Advisors will corroborate.

---

## 1. Executive summary

| ID | Sev | Area | Finding |
|----|-----|------|---------|
| **S1** | **High** | Security | `crew_invite_tokens` is anon-enumerable (`USING (true)`) → all invite tokens harvestable → crew-account takeover vector |
| **S2** | **High** | Security | `quote_requests` + `submitted_quotes` anon-enumerable (`USING (true)`) → all vendor bids, amounts, and vendor emails (PII) readable by anyone (open item **H24**, now confirmed + expanded) |
| **S3** | **Med-High** | Security | `v_meetings_summary` view lacks `security_invoker` → bypasses underlying RLS, and is anon-readable → meeting data leak |
| **S4** | **Med** | Security | Foundational `SECURITY DEFINER` RLS-helper functions (migrations 002, 007, 008, a5c2_c2) have **no pinned `search_path`** → privilege-escalation hardening gap (`function_search_path_mutable`) |
| **S5** | **Low-Med** | Security | `organizations` row is anon-readable — verify intent; likely should be authenticated-only |
| **P1** | **High** | Bloat | `projects.metadata` skew: one row **7.0 MB**, another **2.2 MB**, ~80% of 11.4 MB total → statement timeouts (57014) on full-metadata reads |
| **P2** | **Med** | Bloat | `labor_import_errors` = **8,802 rows** (largest table) — error log with no evident retention/purge |
| **P3** | **Low** | Bloat | `_pp_backup` — empty leftover payroll-recovery table still exposed via PostgREST |
| **P4** | **Med** | Arch | "Everything in one `metadata` JSONB blob" pattern is the structural driver of P1 and heavy query cost |

**Positives (confirmed working):**
- `.env` is gitignored and **not** in git history — old AUDIT.md **C1 is resolved**.
- **78 of 83** tables correctly return *zero* rows to the anon key — RLS is enabled and filtering on the vast majority.
- Newer migrations (`a5c2_*`, `hr_port_*`, `drywall_*`) consistently pin `search_path` and validate secrets inside scoped `SECURITY DEFINER` RPCs — the correct pattern to replicate for the fixes below.

---

## 2. Security findings (detail + fix)

### S1 — `crew_invite_tokens` anon-enumerable (High)
**Evidence:** anon key `GET /crew_invite_tokens?select=*` returned **all 13 rows**. Policy (`20260616130000_crew_role_and_invites.sql:82`):
```sql
CREATE POLICY "Read by token (signup)" ON public.crew_invite_tokens
  FOR SELECT USING (true);   -- comment assumes "token in WHERE is the secret"
```
**Why it's wrong:** RLS `USING (true)` ignores the app's `WHERE token = …`. Anyone (unauthenticated) can `SELECT *` and read every token. `consume_crew_invite_token()` only enforces an email match **when `invited_email IS NOT NULL`** (it's optional per the table CHECK), so any token lacking an email can be consumed by an attacker who signs up and calls the RPC → their account gets linked as `crew` to the org.
**Fix:** Drop the `USING (true)` SELECT policy. The signup flow already links via the `SECURITY DEFINER` `consume_crew_invite_token()` RPC (which looks up by token internally) — no table-wide SELECT grant is needed. If the signup page must *pre-validate* a token, add a `SECURITY DEFINER validate_crew_invite_token(p_token text)` that returns only minimal non-sensitive fields for the single matching, unconsumed, unexpired token. Consider also making `invited_email` required.

### S2 — `quote_requests` + `submitted_quotes` anon-enumerable (High, = H24)
**Evidence:** anon reads all `quote_requests` (5) and `submitted_quotes` (2). Policies (`016_allow_public_quote_request_access.sql:23,61`):
```sql
CREATE POLICY "Public can view quote requests by token" ON quote_requests
  FOR SELECT USING (true);
CREATE POLICY "Public can view own submitted quotes" ON submitted_quotes
  FOR SELECT TO public USING (true);
```
**Impact:** Same misconception as S1. Anyone can enumerate **all** vendor quote requests and submissions — trade, amounts, **vendor email addresses (PII)**, quote documents/URLs, statuses. A competitor or scraper can read every bid. This is the previously-flagged **H24** ("separate security review needed") — confirmed and broader than just `quote_requests`.
**Fix:** Replace the `USING (true)` reads with token-scoped access:
- Serve the vendor portal's read via a `SECURITY DEFINER get_quote_request_by_token(p_token)` RPC that returns only the row matching the token (and its allowed child rows), and drop the blanket anon SELECT.
- Keep the anon **INSERT** for `submitted_quotes` but tighten `WITH CHECK` to validate the referenced `quote_request_id` + token server-side rather than `WITH CHECK (true)`.

### S3 — `v_meetings_summary` bypasses RLS and is anon-readable (Med-High)
**Evidence:** anon reads all 9 rows. `20260505_meetings_summary_view.sql:37` comment claims *"Views in Postgres default to SECURITY INVOKER"* — **factually incorrect**. Postgres views run with the **view owner's** privileges and bypass the querying role's RLS unless `security_invoker = true` is set (PG15+); it is not set here. The view is granted to `authenticated`, yet anon still reads it — so it is both RLS-bypassing and over-granted.
**Fix:**
```sql
ALTER VIEW public.v_meetings_summary SET (security_invoker = true);
REVOKE SELECT ON public.v_meetings_summary FROM anon;   -- if present
```
Then re-test: authenticated meeting-leads should see it; anon should get zero rows. **Audit all other views the same way** — any view without `security_invoker = true` silently bypasses RLS.

### S4 — `SECURITY DEFINER` functions without pinned `search_path` (Med)
**Evidence:** functions defined with `SECURITY DEFINER` but no `SET search_path`:
- `002_multi_user_shared_access.sql` — 5 functions (the **core** RLS helpers: `get_user_organization()`, `user_can_edit()`, etc.)
- `008_fix_user_profile_creation.sql` — 6 functions
- `007_project_forms_system.sql` — 2 functions
- `20260427_a5c2_c2_deals.sql` — 1 function
**Impact:** A `SECURITY DEFINER` function with a mutable `search_path` can be hijacked if an attacker can create a shadowing object in a schema earlier on the path (Supabase's linter flags this as `function_search_path_mutable`). These are the foundational helpers referenced by RLS policies across the DB, so hardening them is high-leverage.
**Fix:** `ALTER FUNCTION public.<fn>(<args>) SET search_path = public;` for each (or recreate with `SET search_path = public`, as the newer migrations do). Verify none rely on a caller-provided search_path.

### S5 — `organizations` anon-readable (Low-Med)
**Evidence:** anon reads the org row. Low sensitivity (name/settings) but should be confirmed intentional; default to authenticated-only unless a public flow needs it.

---

## 3. Bloat / performance findings (detail + fix)

### P1 — `projects.metadata` size skew (High)
148 projects, **11.4 MB** total metadata, but: **"3464 W. 136th St" = 7.0 MB**, **"Bay Village - Dills" = 2.2 MB** (≈80% of the total). This is the root of the KPI Hub `57014` statement timeouts. Already partially mitigated (KPI/list/schedule now select scalar-only + the `drywall_list_stage_scalars` RPC), but `fetchDrywallProjectById` still selects full `metadata`, so opening those two projects is slow and timeout-prone. **A dedicated investigation is already queued** (background task) to find what's oversized (suspected: base64 images or accumulated snapshots stored inline) and move it to Storage / cap it.

### P2 — `labor_import_errors` unbounded growth (Med)
**8,802 rows** — the largest table by far, an import error log. Confirm nothing hot-path queries it, then add a retention policy (e.g. delete rows older than N days, or truncate after successful imports).

### P3 — `_pp_backup` dead table (Low)
0 rows, but still exposed via PostgREST. Appears to be a leftover from the payroll-recovery incident. After confirming it's unneeded: `DROP TABLE public._pp_backup;` (or at minimum revoke API exposure).

### P4 — JSONB-blob data model (Med, architectural)
Storing entire quotes, line items, bid snapshots, change orders, and field takeoffs inside one `projects.metadata` JSONB is what makes P1 possible and drives query cost (every consumer either ships the blob or does server-side JSONB extraction). Longer-term: promote hot sub-objects to columns/child tables, or at least keep large binary content out of `metadata`. Not urgent, but it's the structural theme behind the perf work this month.

---

## 4. Full table inventory (row counts + anon read status)

Generated by `scripts/supabase-audit-recon.mjs`. ⚠️ = readable by the anonymous key.

| Table | Rows | Anon |
|-------|-----:|------|
| labor_import_errors | 8802 | blocked |
| trades | 653 | blocked |
| drywall_qb_materials | 449 | blocked |
| material_entries | 296 | blocked |
| item_templates | 221 | blocked |
| drywall_qb_invoices | 216 | blocked |
| schedule_items | 187 | blocked |
| comms_read_state | 153 | blocked |
| projects | 148 | blocked |
| meeting_submissions | 140 | blocked |
| estimates | 128 | blocked |
| client_quote_line_items | 120 | blocked |
| subcontractor_entries | 115 | blocked |
| selection_room_images | 63 | blocked |
| meeting_digest_sends | 60 | blocked |
| project_documents | 59 | blocked |
| selection_rooms | 47 | blocked |
| sub_items | 46 | blocked |
| labor_entries | 37 | blocked |
| meeting_prompts | 35 | blocked |
| deal_activity_events | 32 | blocked |
| schedules | 30 | blocked |
| trade_categories | 29 | blocked |
| pay_periods | 24 | blocked |
| project_actuals | 19 | blocked |
| communication_log_entries | 17 | blocked |
| deal_documents · deal_proforma_versions | 16 · 16 | blocked |
| labor_import_batches · **crew_invite_tokens** | 14 · 13 | blocked · **⚠️** |
| profiles · subcontractors | 13 · 13 | blocked |
| tenant_pipeline_prospects · meeting_action_items | 10 · 10 | blocked |
| meetings · client_quotes | 9 · 9 | blocked |
| selection_books | 8 | blocked |
| project_events | 7 | blocked |
| contacts · meeting_leads | 6 · 6 | blocked |
| deals · proforma_inputs · **quote_requests** | 5 · 5 · 5 | blocked · blocked · **⚠️** |
| form_templates · sow_templates | 4 · 4 | blocked |
| estimate_templates · plans · labor_burden_rates · org_holidays · contact_categories · **v_meetings_summary** | 3 · 3 · 3 · 3 · 5 · 9 | blocked (except **v_meetings_summary ⚠️**) |
| suppliers · **submitted_quotes** · project_forms · selection_room_spec_sheets · subcontractor_unavailability | 2 each | blocked (except **submitted_quotes ⚠️**) |
| **organizations** · municipalities · org_team · org_drywall_catalogs · deal_notes · deal_workspace_context · qbo_wage_allocation_config · project_proforma_versions · time_entries · work_packages | 1 each | blocked (except **organizations ⚠️**) |
| _pp_backup · change_orders · client_quote_options · developers · employee_classes · feedback · form_responses · labor_burden_recalibrations · lenders · meeting_parking_lot_items · po_headers · po_lines · project_milestones · selection_schedule_versions | 0 | blocked |

**Anon-readable (act on each): `crew_invite_tokens`, `quote_requests`, `submitted_quotes`, `v_meetings_summary`, `organizations`.**

---

## 5. What still needs DB-level access (to finish the perf side)

These require the **Supabase Dashboard** (no credentials needed by us) or the CLI with the DB password. Fastest path — the Dashboard runs most of this automatically:

- **Dashboard → Advisors → Security Advisor** — will independently flag S3 (security-definer/invoker views), S4 (`function_search_path_mutable`), any RLS-disabled tables, and exposed auth settings. Use it to corroborate §2.
- **Dashboard → Advisors → Performance Advisor** — unindexed foreign keys, **unused indexes**, and RLS `initplan` issues (RLS policies re-evaluating `auth.uid()` per row — a common cause of slow large-table reads).
- **Dashboard → Query Performance** (`pg_stat_statements`) — top queries by total/mean time; will surface the `projects` full-metadata reads and any other outliers.
- If using the CLI (`supabase link` + DB password), the direct equivalents:
  `supabase inspect db table-sizes | bloat | unused-indexes | index-usage | seq-scans | vacuum-stats | outliers | long-running-queries`.

---

## 6. Prioritized remediation plan

**Batch A — anon-exposure lockdown (do first; one migration).**
1. S1: drop `crew_invite_tokens` anon SELECT; move validation into a token-scoped `SECURITY DEFINER` RPC.
2. S2 (H24): drop `USING (true)` reads on `quote_requests` / `submitted_quotes`; serve the vendor portal via a token-scoped RPC; tighten the submit `WITH CHECK`.
3. S3: `security_invoker = true` on `v_meetings_summary` (+ every other view); revoke anon.
4. S5: confirm/lock `organizations` read.
   *After applying, re-run `scripts/supabase-audit-recon.mjs` — the ⚠️ list should be empty (except any intentionally-public row).*

**Batch B — definer hardening.**
5. S4: pin `search_path = public` on the 002/007/008/a5c2 definer functions. Cross-check against the Security Advisor list.

**Batch C — bloat.**
6. P1: complete the queued `projects.metadata` investigation; move oversized inline content to Storage; re-check the two heavy rows.
7. P2: retention/purge for `labor_import_errors`.
8. P3: drop `_pp_backup` (after confirming unneeded).

**Batch D — verify with Dashboard Advisors** (§5) and fold any new findings back into this doc.

---

## 7. Re-run

`node scripts/supabase-audit-recon.mjs` (read-only) regenerates the table inventory + anon-exposure sweep. Keep it as the regression check after Batch A.

*Open cross-references: `docs/AUDIT.md` (C-series, mostly resolved), `docs/A5_PLAN.md`/`A5E_RUNBOOK.md` (H24, H27 mystery storage folder `7507f8ea-…`, H28), `docs/RBAC_PLAN.md`.*
