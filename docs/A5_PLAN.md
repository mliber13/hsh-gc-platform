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

- **H24** — `quote_requests` has a policy with `qual: true` granting unconditional read (bypasses org scoping). Pre-existing; needs independent review.
- **H25** — `sow_templates` DELETE policy compares uuid-to-text and the matching branch is dead; current net effect is that the policy never matches anyone. Harmless (no accidental delete), but misleading. SELECT side of this was fixed as a drive-by in A5-c.
- **H26** — RLS disabled entirely on four tables: `org_team`, `project_events`, `project_forms`, `work_packages`. Must be enabled with appropriate policies before A5-c.2 covers those chunks (C2-6, C2-9, C2-10).
- **H27** — Mystery storage folder `7507f8ea-f694-453b-960e-3f0ea6337864/` (9 objects) in quote-documents bucket. Not a current org UUID. Investigate provenance before A5-d storage path migration so we don't move or orphan live data.
- **H28** — `profiles.organization_id` still has `DEFAULT 'default-org'`. Belt-and-suspenders only now that `handle_new_user` writes NULL explicitly, but should be dropped during A5-e cleanup for consistency.

