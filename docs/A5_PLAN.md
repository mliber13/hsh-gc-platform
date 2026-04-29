# A5 Plan v2: Normalize `organization_id` (`default-org` -> UUID)

Planning only. No migrations or app-code execution in this step.

## 1) Inventory

### 1.1 Tables with `organization_id` and current live type

Source: live DB `information_schema.columns`.

- **UUID type**
  - `quote_requests.organization_id` (`uuid`, nullable)
  - `sow_templates.organization_id` (`uuid`, nullable)
- **Text type**
  - `change_orders`, `contacts`, `deal_activity_events`, `deal_documents`, `deal_notes`,
    `deal_proforma_versions`, `deal_workspace_context`, `deals`, `developers`,
    `employee_classes`, `estimate_templates`, `estimates`, `feedback`, `form_responses`,
    `form_templates`, `gameplan_playbook`, `gameplan_plays`, `item_templates`,
    `labor_burden_rates`, `labor_burden_recalibrations`, `labor_entries`,
    `labor_import_batches`, `lenders`, `material_entries`, `municipalities`, `org_team`,
    `pay_periods`, `plans`, `profiles`, `proforma_inputs`, `project_actuals`,
    `project_documents`, `project_events`, `project_forms`, `project_milestones`,
    `project_proforma_versions`, `projects`, `qbo_wage_allocation_config`, `schedules`,
    `selection_books`, `selection_room_images`, `selection_room_spec_sheets`,
    `selection_rooms`, `selection_schedule_versions`, `sub_items`,
    `subcontractor_entries`, `subcontractors`, `suppliers`,
    `tenant_pipeline_prospects`, `time_entries`, `trade_categories`, `trades`,
    `user_invitations`, `work_packages`.

### 1.2 Migration history inventory (`supabase/migrations`)

- Helper definitions:
  - `get_user_organization()` in `002_multi_user_shared_access.sql`, `008_fix_user_profile_creation.sql`
  - `user_can_edit()` in `002_multi_user_shared_access.sql`, `008_fix_user_profile_creation.sql`
- Helper usage in RLS policies across:
  - `002`, `007`, `009`, `018`, `031`, `032`, `042`, `047`, `049`, `063`, `066` migrations.

### 1.3 `src/` code paths reading/writing `organization_id`

- Core services:
  - `src/services/supabaseService.ts`
  - `src/services/dealService.ts`
  - `src/services/quoteService.ts`
  - `src/services/sowService.ts`
  - `src/services/selectionBookService.ts`
  - `src/services/selectionScheduleService.ts`
  - `src/services/feedbackService.ts`
  - `src/services/partnerDirectoryService.ts`
  - `src/services/contactDirectoryService.ts`
  - `src/services/tenantPipelineService.ts`
  - `src/services/laborImportService.ts`
  - `src/services/backupService.ts`
  - `src/services/formService.ts`
  - `src/services/planHybridService.ts`
  - `src/services/tradeCategoryService.ts`
  - `src/services/userService.ts`
- Component write path:
  - `src/components/ProjectForms.tsx`
- Script:
  - `src/scripts/migrateToSupabase.ts`
- Types currently string-typed:
  - `src/types/deal.ts`
  - `src/types/feedback.ts`
  - `src/types/selectionBook.ts`

### 1.4 Current `'default-org'` references in `src/`

- `src/services/formService.ts`
- `src/services/backupService.ts`
- `src/services/tradeCategoryService.ts`
- `src/services/supabaseService.ts`
- `src/services/laborImportService.ts`
- `src/services/planHybridService.ts`
- `src/components/ProjectForms.tsx`
- `src/services/sowService.ts`
- `src/services/selectionScheduleService.ts`

## 2) Current State Snapshot (live DB)

Source: live distinct-value query on every table containing `organization_id`.

- `profiles.organization_id`: only `default-org` (5 rows, 1 distinct value)
- Almost all populated text columns: only `default-org`
- `trade_categories.organization_id`: `default-org`, `system`
- `quote_requests.organization_id` (`uuid`): all NULL
- `sow_templates.organization_id` (`uuid`): all NULL

## 3) Target State (decision)

Adopt a real `organizations` table and UUID foreign keys everywhere.

- `public.organizations (id uuid pk, name text not null, created_at timestamptz default now())`
- Every tenant-owned row stores org UUID in `organization_id`
- Shared rows (currently `trade_categories = 'system'`) become `organization_id = NULL` (see Section 4.4)

Reasoning:
- Enforces referential integrity.
- Removes ambiguous string values and fallback behavior.
- Scales to invites/team/multi-org workflows cleanly.

## 4) Migration Strategy (no execution)

### 4.1 Orphan policy (explicit)

Fail-hard by default:
- If any table has unexpected values (non-`default-org`, non-`system`, non-NULL where applicable), stop migration.
- Do not auto-assign unknown org strings.
- Require manual mapping file / operator decision before proceeding.

### 4.2 Signup / profile creation behavior (post-migration)

Decision: **invite-first tenancy**, not auto-create-org on signup.

- New standalone signup creates a profile with `organization_id = NULL` and cannot access org-scoped data until invited/assigned.
- Invite accept flow assigns `profiles.organization_id` to inviter’s org UUID.
- No `'default-org'` fallback anywhere.

Trigger logic update (design):
- `handle_new_user` should:
  - insert profile row
  - set role defaults
  - leave `organization_id` NULL unless a valid invitation/org context exists
  - never write `'default-org'`
- Add guardrails:
  - app routes requiring org should block with “join/create organization” state.
  - service methods should fail-fast if `organization_id` missing.

### 4.3 Phase order

1. Preflight audit (values/types/row counts)
2. Create `organizations` + seed canonical org UUID for current `default-org` tenant
3. Add scratch column `organization_id_uuid uuid` to all text-based tables
4. Backfill scratch UUID columns
5. Backfill already-UUID tables currently NULL:
   - `quote_requests.organization_id = <seeded_org_uuid>` where NULL
   - `sow_templates.organization_id = <seeded_org_uuid>` where NULL
6. Update RLS helper functions/policies to UUID semantics
7. Application code rollout to remove string fallback assumptions
8. In-place type conversion for text tables (Section 4.5)
9. Enforce constraints and cleanup

### 4.4 Resolve `trade_categories.organization_id = 'system'`

Adopt: **NULL means shared/system category**.

Plan:
- Backfill step:
  - `organization_id = 'system'` -> `organization_id_uuid = NULL`
  - `organization_id = 'default-org'` -> seeded org UUID
- Post-conversion policy model:
  - `SELECT`: authenticated users can read rows where `organization_id IS NULL` (shared) OR `organization_id = get_user_organization()`
  - `INSERT/UPDATE/DELETE`: only rows where `organization_id = get_user_organization()` (no writes to NULL/shared rows)

### 4.5 Commit to in-place type conversion (not rename/swap)

For each text table:
1. Ensure `organization_id_uuid` fully backfilled (or intentionally NULL for shared rows).
2. Drop old dependent constraints/policies temporarily as needed.
3. Copy `organization_id_uuid` into `organization_id` text where required (stringified UUID) if needed for cast safety.
4. Run in-place conversion:
   - `ALTER TABLE ... ALTER COLUMN organization_id TYPE uuid USING organization_id_uuid::uuid`
5. Recreate constraints/policies for UUID type.
6. Drop scratch column `organization_id_uuid`.

Notes:
- `trade_categories` keeps nullable `organization_id` to support shared rows.
- Tenant-owned tables should end `organization_id` as NOT NULL + FK to `organizations(id)`.

### 4.6 RLS helpers update

- `get_user_organization()` must return `uuid` (nullable for users not yet assigned)
- `user_can_edit()` must work with UUID-based profile/org checks
- Remove text-era assumptions from helper internals and policy expressions

### 4.7 Rollback strategy

- Rollback boundary after each phase.
- Keep original text columns untouched until conversion phase completes.
- Snapshot/backup before:
  - backfill
  - helper/policy cutover
  - in-place type conversion
- If policy cutover fails, restore prior helper functions + policies before retry.

## 5) Per-Phase Validation Criteria

Each phase must pass before next phase starts:

1. **Preflight audit**
   - Query check: distinct values list matches expected (`default-org`, `system`, NULL only).
   - If unexpected value exists -> stop (fail-hard).
2. **Organizations seed**
   - Query check: exactly one seeded org row exists for legacy tenant mapping.
3. **Scratch-column creation**
   - `information_schema.columns` shows `organization_id_uuid` on all target text tables.
4. **Backfill**
   - For tenant tables: `organization_id_uuid IS NULL` count = 0.
   - For `trade_categories`: only intended shared rows remain NULL.
   - For UUID tables (`quote_requests`, `sow_templates`): NULL count = 0.
5. **RLS/helper cutover**
   - Policy compile succeeds.
   - Authenticated read/write smoke checks pass in staging.
6. **App rollout**
   - `rg` check: no `'default-org'` literals in `src/`.
   - Runtime checks: no write path sends NULL/placeholder org IDs.
7. **Type conversion**
   - Column types verify as `uuid`.
   - FK/NOT NULL constraints present where required.
8. **Post-cutover**
   - Distinct-value query returns UUID/NULL only (no text org literals).

## 6) Staging Gate Before Prod

Required before production cutover:

- Prepare non-prod DB with:
  - at least two org rows
  - at least two users in different orgs
  - representative data across core tables
- Run full migration end-to-end in staging.
- Execute API-level smoke tests (not SQL-only):
  - cross-org read isolation
  - cross-org write isolation
  - invite assignment flow
  - unaffiliated signup blocked from org data
  - shared `trade_categories` rows readable but not writable.

Production migration is blocked until staging gate passes.

## 7) Code Changes Required (A5 scope preview)

### 7.1 Files with explicit `'default-org'` literals (must be removed)

- `src/services/formService.ts`
- `src/services/backupService.ts`
- `src/services/tradeCategoryService.ts`
- `src/services/supabaseService.ts`
- `src/services/laborImportService.ts`
- `src/services/planHybridService.ts`
- `src/components/ProjectForms.tsx`
- `src/services/sowService.ts`
- `src/services/selectionScheduleService.ts`

### 7.2 Files assuming string-like `organization_id`

- Types:
  - `src/types/deal.ts`
  - `src/types/feedback.ts`
  - `src/types/selectionBook.ts`
- Service/query logic:
  - `src/services/supabaseService.ts`
  - `src/services/dealService.ts`
  - `src/services/quoteService.ts`
  - `src/services/sowService.ts`
  - `src/services/selectionBookService.ts`
  - `src/services/selectionScheduleService.ts`
  - `src/services/feedbackService.ts`
  - `src/services/partnerDirectoryService.ts`
  - `src/services/contactDirectoryService.ts`
  - `src/services/tenantPipelineService.ts`
  - `src/services/laborImportService.ts`
  - `src/services/backupService.ts`
  - `src/services/formService.ts`
  - `src/services/planHybridService.ts`
  - `src/services/tradeCategoryService.ts`
  - `src/services/userService.ts`
  - `src/scripts/migrateToSupabase.ts`

### 7.3 Confirm no future NULL writes for UUID tables

- `quote_requests.organization_id` and `sow_templates.organization_id` are currently NULL in live data.
- Plan requires:
  - backfill existing NULLs in migration phase
  - code-path updates so inserts always pass org UUID (or fail-fast)
  - DB constraints after rollout to prevent future NULL writes (except intentionally nullable shared cases like `trade_categories`).

### 7.4 A5-d storage path migration prerequisite (plan only)

- Current storage paths are legacy `default-org/{...}` in existing objects.
- After A5-d switches app writes to UUID-based org paths, old objects may become invisible under UUID-scoped storage policies.
- A5-d must include a storage object move step (Supabase Storage move API) before app rollout:
  - move `default-org/{...}` -> `{HSH_ORG_UUID}/{...}` for all relevant buckets (`quote-documents`, `quote-attachments`, `project-documents`, `selection-images`, `deal-documents` as applicable).
- Storage folder prefixes are string path segments, so A5-d code must write `organization_id_uuid` as a string prefix (UUID text) in every upload path.
- Do not deploy UUID-path-only app code until path migration is complete and verified.

## 8) Risks / Open Questions

1. Invite-first signup changes UX and may require explicit onboarding state in app shell.
2. Policy migration blast radius is large because many tables rely on shared helper functions.
3. `trade_categories` shared-row behavior must be regression-tested in UI that currently expects org-bound categories.
4. Any hidden SQL/job/function outside `supabase/migrations` that still writes string org values must be discovered before cutover.

## 9) Execution Log

> Actual-outcomes log. Sections 1–8 are the pre-execution plan and are preserved as-is; this section records what actually landed.

### 9.1 A5-a — organizations table + HSH seed + scratch columns + backfill

Landed on prod. One `organizations` row (HSH, UUID `b80516ed-a8aa-4b6c-bdf8-2155e18a0129`). Scratch `organization_id_uuid` columns added and backfilled on all text-org tables per §4.3 step 3–4. `quote_requests` / `sow_templates` NULL backfill completed per §4.3 step 5.

### 9.2 A5-b — branch prep + helper-function groundwork

Landed. `get_user_organization_uuid()` and `current_user_organization_uuid()` introduced alongside (not replacing) the text helpers. `trade_categories` NULL-is-shared policy model from §4.4 proven on branch `clqgnnydrwpgxvipyotd`.

### 9.3 A5-c — RLS switch, pivoted to "Path H"

Original §4.3 step 6 plan was to rewrite ~50 tables' RLS policies to filter on `organization_id_uuid`. Two apply attempts on prod failed:

1. First attempt: `42P13 cannot change return type of existing function` — needed to DROP dependent policies before DROP FUNCTION.
2. Second attempt: `2BP01 cannot drop function get_user_organization() because other objects depend on it` — pre-flight scope query had counted ~10 tables; actual dependent set was **54 tables / ~110 policies**. Scope miss was noted and acknowledged.

**Path H pivot (what actually shipped):**

Instead of rewriting 54 tables' policies in one migration, enforce invite-first globally by making `profile.organization_id` itself NULL for unaffiliated users, and keep the text helpers in place (minus the COALESCE fallback). This reduces A5-c's functional surface to three things:

1. `ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;`
2. `handle_new_user` now writes `organization_id = NULL, organization_id_uuid = NULL` (was `'default-org' / NULL` on branch during A5-b, was `'default-org' / 'default-org'` pre-A5).
3. `get_user_organization()` body returns raw `profiles.organization_id` with no COALESCE — unaffiliated users now return NULL from the helper, which no existing policy matches, so they see zero org data.

Plus infrastructure with no behavioral change for existing users:

4. New `get_user_organization_uuid()` / `current_user_organization_uuid()` helpers (unused by current policies; needed for A5-c.2).
5. `organization_text_map` lookup table (`'default-org' → HSH_UUID`, `'system' → NULL`).
6. `bridge_set_org_uuid()` BEFORE INSERT OR UPDATE trigger attached to 53 tables (profiles excluded). Fails-hard on unmappable org text values. Keeps `organization_id_uuid` column truthful while app code still writes text.
7. Side-fix: `sow_templates` SELECT policy tautology bug (unreachable branch due to uuid-to-text comparison) corrected to use `get_user_organization_uuid()`.

Migration file: `supabase/migrations/20260424_a5c_uuid_rls_switch.sql`.

Post-apply assertions all passed. Both GC and Drywall apps smoke-tested green. **Policy rewrite to UUID is now deferred to A5-c.2** (§10).

### 9.5 A5-c.2 chunk C2-1 (pilot) — projects, profiles, trade_categories

**Status:** landed on both envs. Branch `clqgnnydrwpgxvipyotd` 2026-04-24 (7/7 Node smoke tests green); prod `rvtdavpsvrhbktbxquzm` 2026-04-27 (SQL gate green + manual app smoke on GC and Drywall apps green).

**Migration:** `supabase/migrations/20260425_a5c2_pilot.sql`. Single transaction, idempotent, convergent (same final state on both envs despite different starting states — branch was on the original-plan UUID-policy track, prod was on Path H text-policy track).

**Final policy set (13 total across 3 tables):**

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | "Users can view own profile" (`auth.uid()=id`) + "Users can view profiles in their organization" (uuid match + active) | "Admins can insert profiles for their organization" (uuid match + admin) | "Users can update own profile" (`auth.uid()=id` + active) + "Admins can update any profile in their organization" (uuid match + admin) | — |
| `projects` | uuid match + active | uuid match + can-edit | uuid match + can-edit | uuid match + admin |
| `trade_categories` | uuid IS NULL OR uuid match (NULL-is-shared) | uuid match (non-null required) | uuid match (non-null required) | uuid match (non-null required) |

All filters use `organization_id_uuid = public.get_user_organization_uuid()` (uuid helper) instead of the old text helper.

**Convergence side-effects shipped in this chunk (beyond minimal "rewrite policies"):**

1. Plugged a pre-existing prod hole: `"Users can view own profile"` SELECT policy was missing on prod, which would have blocked future invite-first users from reading their own profile. Branch already had it; migration added it to prod.
2. Replaced prod's legacy `is_system` / `'system'` text trade_categories policy model with the NULL-is-shared model (proven on branch during A5-b). The 21 prod system rows had `organization_id_uuid = NULL` already from A5-a backfill, so they remain shared by virtue of the new SELECT policy. The 7 HSH-owned rows continue to be visible to HSH users.
3. Created `get_user_organization_uuid()` on branch (didn't exist there). Prod's existing function was unchanged (CREATE OR REPLACE was byte-identical to the existing definition).
4. Dropped NOT NULL on `profiles.organization_id` on branch (prod was already nullable from A5-c Path H).

**Net row-visibility impact on prod:** zero. Existing HSH users still see all 99 projects, 5 profiles, 28 trade_categories (21 shared + 7 own).

**Next:** C2-2 (deals subsystem — 6 tables) per §10.1.

### 9.6 A5-c.2 chunk C2-2 — deals subsystem

**Status:** landed on both envs. Branch `clqgnnydrwpgxvipyotd` 2026-04-27 (4/4 Node smoke tests green, with caveat below); prod `rvtdavpsvrhbktbxquzm` 2026-04-27 (SQL gate green + manual app smoke on GC and Drywall apps green).

**Tables:** `deals`, `deal_activity_events`, `deal_documents`, `deal_notes`, `deal_proforma_versions`, `deal_workspace_context`.

**Migration:** `supabase/migrations/20260427_a5c2_c2_deals.sql`. Single transaction, idempotent. 24 policies (6 tables × 4 ops) rewritten in one shot.

**Pattern decision:** moved from inline subquery (`organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())`) to helper-call (`organization_id_uuid = public.get_user_organization_uuid()`). Helper is `STABLE SECURITY DEFINER` so it caches within a query plan. Consistent with C2-1.

**Branch ↔ prod convergence:** much simpler than C2-1. Both envs had identical policy *names* and *shape*, differing only in the column referenced (uuid on branch from earlier A5-b experiments vs text on prod). Migration converged both to identical helper-call pattern on `organization_id_uuid`. No new policies, no NOT NULL changes, no `is_system` quirks.

**Net row-visibility impact on prod:** zero. All 5 prod profiles have HSH uuid; all 69 rows across the 6 tables (5 deals + 27 + 18 + 1 + 16 + 2) have HSH uuid; existing users still see exactly what they saw before.

**Smoke caveat (D3):** the `deals` invite-first INSERT block test passed but for the wrong reason — the test payload included a `name` column that doesn't exist on `deals`, so the INSERT was rejected by PostgREST schema validation rather than by RLS. The security claim still holds (no row was inserted), but D3 didn't directly exercise the RLS INSERT policy at runtime. D1/D2/D4 (SELECT isolation, cross-org UPDATE blocked, positive UPDATE control) all directly hit the RLS path. Tracked as a smoke-pattern improvement for C2-3+: pre-flight a column-list query so smoke tests use schema-valid payloads.

**Next:** C2-3 (estimate/trade subsystem — 5 tables: `estimates`, `estimate_templates`, `trades`, `sub_items`, `item_templates`) per §10.1.

### 9.7 A5-c.2 chunk C2-3 — estimate/trade subsystem

**Status:** landed on both envs on 2026-04-27. Branch SQL gate green; prod SQL gate + manual app smoke green on both apps. Validated against 1633 rows of real prod data (1244 trades + 187 estimates + 180 item_templates + 21 sub_items + 1 estimate_template).

**Tables:** `estimates`, `estimate_templates`, `trades`, `sub_items`, `item_templates`.

**Migration:** `supabase/migrations/20260427_a5c2_c3_estimates_trades.sql`. 16 policies in a single transaction.

**Distinguishing features vs C2-1 / C2-2:**

1. **Mixed role-gating preserved verbatim:**
   - `estimates` DELETE → `user_is_admin` (admin-only)
   - `trades` DELETE → `user_can_edit` (editor OK — different from estimates, intentionally preserved)
   - `sub_items` → no role gating (any user in org)
   - `estimate_templates` / `item_templates` → use `FOR ALL` policies + separate SELECT
2. **No Node smoke for branch.** Branch had 0 rows in all 5 C2-3 tables; runtime RLS smoke would have been degenerate. Migration's internal post-check DO + SQL gate + prod app smoke on real data was sufficient validation.
3. **Branch was using legacy uuid-named-text helper.** Branch's `get_user_organization()` returns `uuid` (from earlier divergence) and was referenced by these policies. Migration explicitly switched to `get_user_organization_uuid()` so branch policies no longer rely on the misnamed text helper.

**Net row-visibility impact on prod:** zero. All 1633 rows have HSH uuid; all 5 prod profiles have HSH uuid.

**Pre-existing inconsistencies logged but not fixed (out of A5 scope):**
- `estimates` DELETE is admin-only but `trades` DELETE is editor-OK. Probably an oversight; should be harmonized in a separate cleanup pass.
- `sub_items` has no role gating while peer tables do. Possibly intentional (line-item edits within an estimate); verify before harmonizing.

**Next:** C2-4 (PO / financial — 6 tables: `po_headers`, `po_lines`, `change_orders`, `project_actuals`, `proforma_inputs`, `project_proforma_versions`) per §10.1.

### 9.8 A5-c.2 chunk C2-4 — PO / financial (split into 4a + 4b)

**Status:** both halves landed on both envs on 2026-04-27.

Pre-flight surfaced that C2-4's six tables fall into two distinct pattern families. Splitting into 4a (routine) + 4b (complex JOIN/owner-based) preserved careful review on the money paths.

#### 9.8.1 C2-4a — `change_orders`, `project_actuals`, `project_proforma_versions`

**Migration:** `supabase/migrations/20260427_a5c2_c4a_change_orders_actuals_versions.sql`. 10 policies in one transaction.

Routine patterns from prior chunks: `change_orders` 1 SELECT + 1 FOR ALL (like C2-3 templates); `project_actuals` SELECT/INSERT/UPDATE/DELETE with admin-only DELETE (like C2-3 estimates); `project_proforma_versions` 4 separate policies with no role gating (like C2-2 deals).

**Notable wrinkle:** `project_proforma_versions` policy names hit the Postgres NAMEDATALEN 63-char limit. INSERT/UPDATE/DELETE names end in `"...in their organizatio"` (truncated). SELECT name fits at 62 chars. Migration preserves verbatim.

#### 9.8.2 C2-4b — `po_headers`, `po_lines`, `proforma_inputs`

**Migration:** `supabase/migrations/20260427_a5c2_c4b_po_proforma.sql`. 10 policies rewritten in one transaction; 2 policies (proforma_inputs UPDATE/DELETE) intentionally untouched.

**Three non-standard patterns preserved verbatim:**

1. **`po_headers` and `po_lines` have NO `organization_id` column.** They inherit org scope from `projects` via FK join. All 4 po_headers policies wrap `EXISTS (SELECT 1 FROM projects p WHERE p.id = po_headers.project_id AND p.organization_id_uuid = helper() AND <role gate>)`. po_lines uses a deeper `EXISTS (FROM po_headers ph JOIN projects p ON p.id = ph.project_id WHERE ph.id = po_lines.po_id AND ...)`. No bridge trigger on either table (no column to bridge); the org-scope guarantee comes from `projects.organization_id_uuid` non-null + backfilled, already verified in C2-1.
2. **`proforma_inputs` has a 4-condition INSERT WITH CHECK** combining owner + org + role + project-belongs-to-org. Migration preserves all four conditions verbatim, just swapping text → uuid in the org checks and adding IS NOT NULL guard.
3. **`proforma_inputs` UPDATE/DELETE are pure `auth.uid() = user_id`** (owner-based, no org reference). Migration **does not touch them** — they remain correct as-is.

**Smoke note:** prod has 0 PO rows (no PO has ever been created), so the EXISTS-join policies on po_headers/po_lines were SQL-shape-validated but not runtime-validated for PO flows. They will activate correctly when a PO is created (against the same `projects.organization_id_uuid` data already validated in C2-1). Proforma flows + change_orders + actuals all got real exercise on prod data.

**Pre-existing semantic logged but not harmonized:** proforma_inputs UPDATE/DELETE allow owner edits without org check, so a deactivated user retains control of their own proforma_inputs row. Out of A5 scope.

**Next:** C2-5 (labor / payroll — 11 tables) per §10.1. Heavy Drywall-app surface area; smoke that app carefully.

### 9.9 A5-c.2 chunk C2-5 — labor / payroll subsystem

**Status:** landed on both envs on 2026-04-27. Branch SQL gate green. Prod SQL gate + manual app smoke on both apps green. Validated against **9118 rows of real prod data** — the largest data volume of any chunk to date. Heavy Drywall-app exercise on pay periods and labor import flows.

**Tables (11):** `labor_entries`, `material_entries`, `subcontractor_entries`, `time_entries`, `employee_classes`, `labor_burden_rates`, `labor_burden_recalibrations`, `labor_import_batches`, `labor_import_errors`, `qbo_wage_allocation_config`, `pay_periods`.

**Migration:** `supabase/migrations/20260427_a5c2_c5_labor_payroll.sql`. 32 policies in one transaction. No novel patterns — all recombinations of what was proven in C2-1 through C2-4b.

**Pattern recombinations:**
- 8 tables: standard helper-call swap with role gates (familiar from C2-1/C2-2/C2-3).
- `labor_import_errors`: EXISTS-join through `labor_import_batches` (familiar from C2-4b po_lines). No own org column; inherits via batch.
- `pay_periods`: inline-subquery → helper-call swap (familiar from C2-2 deals).
- `time_entries`: previously used `current_user_organization_id()` helper; switched to `get_user_organization_uuid()` for consistency with the rest of A5-c.2.

**Pre-existing semantics preserved verbatim:**
- `labor_import_batches` and `labor_import_errors` have only SELECT + INSERT (no UPDATE / DELETE). Likely intentional immutable batch records. Migration adds nothing.
- `pay_periods` and `time_entries` have no role gating (any active user in org can do anything). Preserved.

**Prod row counts:** labor_entries 4, material_entries 264, subcontractor_entries 93, time_entries 1, employee_classes 0, labor_burden_rates 3, labor_burden_recalibrations 0, labor_import_batches 13, **labor_import_errors 8730**, qbo_wage_allocation_config 1, pay_periods 13.

**Net row-visibility impact on prod:** zero. All 9118 rows have HSH uuid; all 5 prod profiles HSH.

**Next:** C2-6 (forms — 3 tables: `form_templates`, `form_responses`, `project_forms`) per §10.1. **Note:** `project_forms` has RLS disabled (H26); needs RLS-enable + initial policies as part of C2-6 prep.

### 9.10 A5-c.2 chunk C2-6 — forms subsystem

**Status:** landed on both envs on 2026-04-27. SQL gate green; manual app smoke green.

**Tables:** `form_templates`, `form_responses`, `project_forms`. **Migration:** `supabase/migrations/20260427_a5c2_c6_forms.sql`. 8 policies + 1 H26 drive-by fix.

**H26 (partial closure):** `project_forms` had policies defined but RLS was disabled — making the policies inert. Migration ran `ALTER TABLE public.project_forms ENABLE ROW LEVEL SECURITY` so the (now-rewritten) policies actually enforce. This was a sleeper security hole for an unknown duration.

Standard helper-call pattern; same role-gating preserved (admin-only DELETE on project_forms; FOR ALL editor on templates/responses).

### 9.11 A5-c.2 chunks C2-7 + C2-8 — selections + directory (combined)

**Status:** landed on both envs on 2026-04-27. SQL gate green; manual app smoke green.

**Tables (12):** `selection_books`, `selection_rooms`, `selection_room_images`, `selection_room_spec_sheets`, `selection_schedule_versions`, `contacts`, `subcontractors`, `suppliers`, `developers`, `municipalities`, `lenders`, `tenant_pipeline_prospects`. **Migration:** `supabase/migrations/20260427_a5c2_c7_c8_selections_directory.sql`. 48 policies, all standard helper-call swap. Combined into one transaction for efficiency since all 12 tables share uniform shape.

`tenant_pipeline_prospects` uses `is_user_active()` (not `user_can_edit()`) for INSERT/UPDATE/DELETE — preserved verbatim. selection_room_images previously had a self-comparison-via-EXISTS pattern; converged to standard `organization_id_uuid = helper()` for consistency.

### 9.12 A5-c.2 chunks C2-9 + C2-10 — project meta + infra/misc (combined)

**Status:** landed on both envs on 2026-04-27. SQL gate green; manual app smoke green.

**Tables (11):** `project_documents`, `project_events`, `project_milestones`, `schedules`, `plans`, `work_packages`, `org_team`, `user_invitations`, `feedback`, `gameplan_playbook`, `gameplan_plays`. **Migration:** `supabase/migrations/20260427_a5c2_c9_c10_meta_infra.sql`. 38 total policies (18 existing + new policies for 3 H26-disabled tables).

**H26 (final closure for these 3 tables):** `project_events`, `work_packages`, `org_team` had RLS disabled with NO policies defined — meaning any authenticated user could read/write them regardless of org. Migration enabled RLS on all three and seeded initial policies modeled after peer tables:
- `project_events` modeled after `schedules` (1 SELECT active + 1 FOR ALL editor).
- `work_packages` modeled after `plans` (same shape).
- `org_team` modeled after `user_invitations`-style admin gating but with broader SELECT (any active org member can see team listing; admins manage).

**Pre-existing semantics preserved:** `feedback` SELECT/INSERT for any active org user, UPDATE/DELETE admin-only. `user_invitations` admin-only across all ops. `project_milestones` custom names (`milestones_*`) preserved verbatim.

### 9.13 A5-c.2 chunk C2-11 — UUID-native fixes (sow_templates)

**Status:** landed on both envs on 2026-04-27. SQL gate green; manual app smoke green.

**Migration:** `supabase/migrations/20260427_a5c2_c11_sow_templates.sql`. 2 policies on `sow_templates` updated to converge branch and prod:

1. **SELECT "Users can view organization SOW templates"** — branch had a tautology bug (`profiles.organization_id_uuid = profiles.organization_id_uuid`, always true) from earlier divergence; prod was already correct from the A5-c side-fix. Migration converged branch.
2. **DELETE "Users can manage SOW templates they can access"** — prod had a dead branch (uuid `(organization_id)::text` compared to text `profiles.organization_id`, never matches); branch was already correct. Migration converged prod.

**Closes H25** (sow_templates DELETE dead branch).

**`quote_requests` intentionally NOT touched.** Its 5 policies are owner-based (`auth.uid() = user_id`) plus one public-token-read with `qual: true` — none reference org_id directly. The H24 vulnerability (unconditional public SELECT via token) is a separate product/security concern and remains open as logged.

### 9.14 A5-c.2 — overall closure

A5-c.2 is **complete** as of 2026-04-27. All 11 chunks landed across two execution sessions:

| Chunk | Date | Tables | Policies | Notes |
|---|---|---|---|---|
| C2-1 | 2026-04-27 (Fri) | 3 | 13 | Pilot; converged branch / prod state |
| C2-2 | 2026-04-27 | 6 | 24 | Deals subsystem |
| C2-3 | 2026-04-27 | 5 | 16 | Estimates / trades; mixed role gating |
| C2-4a | 2026-04-27 | 3 | 10 | Routine financial |
| C2-4b | 2026-04-27 | 3 | 10 | po_headers/po_lines EXISTS-join + proforma_inputs 4-condition INSERT |
| C2-5 | 2026-04-27 | 11 | 32 | Labor / payroll; 9118 prod rows incl. labor_import_errors EXISTS-join |
| C2-6 | 2026-04-27 | 3 | 8 | Forms; H26 fix on project_forms |
| C2-7+8 | 2026-04-27 | 12 | 48 | Selections + directory (combined) |
| C2-9+10 | 2026-04-27 | 11 | 38 | Project meta + infra/misc; H26 fixes on project_events / work_packages / org_team |
| C2-11 | 2026-04-27 | 1 | 2 of 6 | sow_templates SELECT tautology + DELETE dead-branch fixes |
| **Total** | | **58** | **~201** | |

Every text `organization_id` reference in production RLS policies has been replaced with `organization_id_uuid = public.get_user_organization_uuid()`, except:
- `quote_requests` (already uuid-typed, owner-based policies don't reference org)
- `sow_templates` policies that reference its uuid `organization_id` column directly

The text `organization_id` column is now dead weight on every tenant-scoped table. Bridge triggers continue to populate `organization_id_uuid` for ongoing app writes that still write text. **Runway for A5-d (app code cleanup) and A5-e (in-place type conversion) is now clear.**

**H-item status update (was in §11):**
- H25 ✅ closed (sow_templates DELETE dead-branch fixed in C2-11)
- H26 ✅ closed (project_events, work_packages, org_team, project_forms RLS enabled with policies in C2-6 and C2-9-10)
- H24 still open (quote_requests `qual: true` public-token-read — separate security review needed)
- H27 still open (mystery storage folder `7507f8ea-…`)
- H28 still open (`profiles.organization_id` DEFAULT 'default-org' — A5-e cleanup)

**Next phase:** A5-d (app code cleanup — eliminate `'default-org'` text writes; storage path migration). A5-e (in-place type conversion of `organization_id` text → uuid; drop scratch column; add NOT NULL + FK).

Step 12 of `docs/A5C_BRANCH_VERIFICATION.md` was closed via equivalence rather than live end-to-end, because (a) Supabase Auth `over_email_send_rate_limit` and (b) admin-SQL harness drift both blocked a clean live run on branch. The behavioral contract ("new invite-first user has UUID=NULL → sees own profile only → sees zero org data") was proven by byte-identity with `noorg-user@hsh-test.example`, whose state was already verified live in Step 10. See the closure note in `A5C_BRANCH_VERIFICATION.md` for full rationale.

## 10) A5-c.2 Plan (UUID Policy Rewrites)

**Goal:** rewrite all `organization_id = get_user_organization()` RLS predicates across ~50 tables to `organization_id_uuid = get_user_organization_uuid()`. This is the step that actually makes the text column dead weight and clears the runway for A5-e's type conversion.

**Why this is safe to chunk:** the bridge trigger from §9.3 guarantees `organization_id_uuid` tracks `organization_id` on every write. Any subset of tables switched to UUID policies is self-consistent with the rest.

### 10.1 Proposed chunks (domain-grouped)

| Chunk | Tables | Rationale |
|-------|--------|-----------|
| C2-1 (pilot) | `projects`, `profiles`, `trade_categories` | Smallest high-confidence surface. `trade_categories` NULL-is-shared pattern already proven on branch. Full app smoke after this. |
| C2-2 (deals) | `deals`, `deal_activity_events`, `deal_documents`, `deal_notes`, `deal_proforma_versions`, `deal_workspace_context` | Self-contained deal subsystem. |
| C2-3 (estimate/trade) | `estimates`, `estimate_templates`, `trades`, `sub_items`, `item_templates` | Tightly coupled. |
| C2-4 (PO / financial) | `po_headers`, `po_lines`, `change_orders`, `project_actuals`, `proforma_inputs`, `project_proforma_versions` | Money paths — verify carefully. |
| C2-5 (labor / payroll) | `labor_entries`, `material_entries`, `subcontractor_entries`, `time_entries`, `employee_classes`, `labor_burden_rates`, `labor_burden_recalibrations`, `labor_import_batches`, `labor_import_errors`, `qbo_wage_allocation_config`, `pay_periods` | Drywall app uses these heavily — smoke-test that app. |
| C2-6 (forms) | `form_templates`, `form_responses`, `project_forms`† | †`project_forms` also needs RLS enabled (H26 below). |
| C2-7 (selections) | `selection_books`, `selection_rooms`, `selection_room_images`, `selection_room_spec_sheets`, `selection_schedule_versions` | Self-contained. |
| C2-8 (directory / partners) | `contacts`, `subcontractors`, `suppliers`, `developers`, `municipalities`, `lenders`, `tenant_pipeline_prospects` | Directory-style. |
| C2-9 (project meta) | `project_documents`, `project_events`†, `project_milestones`, `schedules`, `plans`, `work_packages`† | †RLS-disabled tables (H26) handled during this chunk. |
| C2-10 (infra / misc) | `org_team`†, `user_invitations`, `feedback`, `gameplan_playbook`, `gameplan_plays` | Small leftovers. |
| C2-11 (UUID-native) | `quote_requests`, `sow_templates` | Already UUID; just retire any remaining text-helper references and verify. |

### 10.2 Per-chunk procedure

1. Pre-flight: list current policies on the chunk's tables; diff against expected.
2. One migration file per chunk (`20260425_a5c2_<chunk>.sql`), wrapped in `BEGIN; … COMMIT;`.
3. Drop existing text-based policies; create UUID-based replacements using the new helpers.
4. Post-apply assertions: policy count unchanged, policies filter on `_uuid` column, cross-org isolation smoke test on branch first.
5. Prod apply + app smoke.

### 10.3 Ordering

C2-1 first on branch, then on prod (proves the pattern). After that, chunks are independent and could be run in any order or batched two-at-a-time if the pilot is clean. H26-affected chunks (C2-6, C2-9, C2-10) require RLS-enable prep before their policy rewrites.

## 11) Deferred H-level Follow-ups

Discovered during A5-c pre-flight / scope work. Not fixed in A5 because they're orthogonal to the `default-org → UUID` migration. Logged here to graduate to a standalone tracker once A5 closes.

- **H24** — `quote_requests` has a policy with `qual: true` granting unconditional read (bypasses org scoping). Pre-existing; needs independent review. **Still open.**
- **H25** — `sow_templates` DELETE policy compares uuid-to-text and the matching branch was dead. **✅ Closed in C2-11** (2026-04-27): DELETE policy rewritten to use `organization_id = public.get_user_organization_uuid()` directly, removing the cast-to-text dead branch.
- **H26** — RLS disabled entirely on four tables: `org_team`, `project_events`, `project_forms`, `work_packages`. **✅ Closed:** `project_forms` enabled in C2-6; `project_events`, `work_packages`, `org_team` enabled in C2-9+10 with peer-modeled initial policies.
- **H27** — Mystery storage folder `7507f8ea-f694-453b-960e-3f0ea6337864/` (9 objects) in quote-documents bucket. **✅ Closed (2026-04-29):** identified as Mark Liber's auth.users.id, from the `orgPath = organizationId || user.id` fallback in `quoteService.ts:129`. All 23 objects (9 quote-documents + 14 quote-attachments) plus Jennifer Arnett's 1 quote-attachment migrated to `<HSH_UUID>/` prefix in A5-d.3 storage cutover.
- **H28** — `profiles.organization_id` still has `DEFAULT 'default-org'`. **✅ Closed in A5-e step 3** (2026-04-29): default cleared on profiles + ~30 other tables before the column type conversion.

## 12) A5-d.3 + A5-e closure (2026-04-29)

The final two phases of A5 landed on prod in a single execution window today.

### 12.1 A5-d.3 — storage migration

**Migration:** `scripts/a5e-storage-migration.mjs` + `supabase/migrations/20260429_a5e_storage_paths.sql`.

**Storage objects moved (207 total, plus 2 ghosts):**
- `default-org/...` → `<HSH_UUID>/...`: 183 objects across deal-documents, project-documents, selection-images, quote-documents
- `7507f8ea-...` (Mark Liber's user.id) → `<HSH_UUID>/...`: 23 objects across quote-attachments + quote-documents
- `abdcfc61-...` (Jennifer Arnett's user.id) → `<HSH_UUID>/...`: 1 object in quote-attachments
- 2 ghost entries (`smoke-test-pd.pdf`, `smoke-test-qd.pdf`) — metadata-only artifacts with no actual files; left in place as cosmetic cruft.

**DB columns updated:**
- Bucket-relative paths and public URLs: bulk SQL REPLACE on `deal_documents.file_path`, `selection_room_spec_sheets.file_path`, `project_documents.file_url`, `trades.quote_file_url`, `sub_items.quote_file_url`, `submitted_quotes.quote_document_url`.
- Signed URL columns (95 rows total): re-signed via `createSignedUrl()` against new paths — `deal_documents.file_url` (18 rows), `selection_room_images.image_url` (63 rows), `selection_room_spec_sheets.file_url` (14 rows). Token TTL 5 years.
- Array column: `quote_requests.attachment_urls` rewritten per-row (4 of 5 rows updated; one already aligned).

**Idempotent execution:** the Node script's `move()` call gracefully handles "destination already exists" and `NoSuchKey` (ghost), so re-runs are safe.

### 12.2 A5-e — type conversion + cleanup

**Migration:** `supabase/migrations/20260429_a5e_typeconvert.sql`.

**Strategy: DROP+RENAME, not ALTER TYPE.** The intuitive `ALTER COLUMN ... TYPE uuid USING organization_id_uuid` failed in branch test because all 200+ A5-c.2 RLS policies reference `organization_id_uuid` by name and Postgres blocks the column drop. Workaround: drop the text column (no policy dependents post-A5-c.2) and rename the uuid column to take its place. Postgres tracks RLS policy column references by attnum, so RENAME preserves all 200+ policies without explicit rewrite.

**What landed:**
- 53 bridge triggers × 2 events = 106 triggers dropped
- `bridge_set_org_uuid()` function dropped
- Text helpers `get_user_organization()` and `current_user_organization_id()` dropped
- `DEFAULT 'default-org'::text` cleared on ~30 tables (closes H28)
- `organization_id` (text) column dropped on 54 dual-column tables
- `organization_id_uuid` (uuid) column renamed to `organization_id` on those 54 tables
- `organization_id_uuid` scratch column dropped on 2 already-uuid tables (`quote_requests`, `sow_templates`)
- NOT NULL added on 52 tenant-scoped tables (skipped: profiles, trade_categories, quote_requests, sow_templates — all nullable by design)
- `organization_text_map` table dropped
- `handle_new_user` rewritten without scratch column reference
- FK to `organizations(id)` added on all 56 tenant-scoped tables
- 18 storage RLS policies on `storage.objects` (`dd_*`, `pd_*`, `qa_*`, `qd_*`, `si_*`) recreated with `(profiles.organization_id)::text` cast to remain compatible with the now-uuid `profiles.organization_id`

### 12.3 In-flight regressions caught and fixed

Two issues surfaced during prod execution; both fixed within the same window:

1. **Storage RLS dependency block.** First `ALTER TABLE profiles DROP COLUMN organization_id` failed because 18 storage policies on `storage.objects` reference `profiles.organization_id` (text). Fix: drop those 18 policies before the column drop, recreate after the rename with `(profiles.organization_id)::text` cast. Branch test had not surfaced this because branch's storage RLS was not configured identically to prod.

2. **Helper function bodies stale after RENAME.** Postgres does not auto-rewrite function bodies on `RENAME COLUMN`. The two helpers `get_user_organization_uuid()` and `current_user_organization_uuid()` still queried `SELECT organization_id_uuid FROM profiles` after the rename, returning NULL silently. Symptom: every authenticated user saw 0 projects + "View-only access" because every RLS policy depending on the helper returned no rows. Fix: `CREATE OR REPLACE FUNCTION` for both helpers to query `organization_id` instead. Migration file patched (step 9b) so future re-runs catch this in the post-check.

### 12.4 Final state

Production is now in target A5 end-state:
- `organization_id` is `uuid` type on every tenant-scoped table (56 tables)
- FK constraints enforce referential integrity to `organizations(id)`
- No bridge trigger, no text helpers, no `organization_text_map`, no scratch columns
- Storage paths are uniformly `<HSH_UUID>/<...>` (plus 2 ghost metadata entries)
- 200+ RLS policies continue functioning under the renamed-column attnum binding
- 18 storage RLS policies use `(profiles.organization_id)::text` cast to bridge uuid org ↔ text path prefix

**A5 migration is complete.**

