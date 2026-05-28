# HR Workspace Port Plan

**Status:** Design locked (merge step 4). Implementation not started — doc-only updates through Section 9 locked decisions.

**Goal:** Port Drywall app HR surfaces (Team / Payroll / TimeClock) into HSH GC Platform as a top-level **HR** workspace, reusing shared Supabase tables where possible.

**Stacks:**

| | Drywall app | GC Platform |
|---|---|---|
| Language | JavaScript | TypeScript |
| React | 18 | 19 |
| Vite | 4 | 7 |
| Routing | Hash (`#/team`, etc.) | React Router 7 (`/hr/...`) |
| UI | shadcn (older) | shadcn + design tokens |
| Data spine | `src/services/supabaseSpine.js` | New `src/services/hrService.ts` (proposed) |

**Authoritative RBAC target:** `docs/RBAC_PLAN.md` (HR column in workspace matrix). **Phase 2b code** (`src/lib/rbac.ts`) does not yet include `hr` in the `Workspace` union — wiring is part of this port.

---

## Executive summary

- Drywall HR is **three large React views** (~4.8k lines in `Team.jsx`, `Payroll.jsx`, `TimeClock.jsx`) plus thin adapters and Supabase helpers.
- GC Platform has **no HR workspace today** — no `org_team`, `pay_periods`, or `time_entries` usage under `src/`.
- Shared Supabase already holds production Team data (`org_team`: 27 W2 + 12 1099) and pay-period rows; `time_entries` is lightly used (1 row, `source_app = 'DRYWALL'`).
- **Locked V1 data model:** keep JSONB for `org_team` and `pay_periods`; add `positions[]` inside `org_team.payload`; Phase A ships RLS + `profiles.can_run_payroll` + person-link columns before any HR UI.
- **Locked RBAC split:** HR workspace stays **`read`** for office roles in the workspace matrix; **roles** grant Team **write** + Payroll **read** inside HR; **`can_run_payroll`** capability flag grants Payroll **write** (owner short-circuits, same as `can_admin_qb`).
- **TimeClock** ports into HR as-is (no geofencing / photo verification in this phase).

---

## Section 1 — Drywall HR feature inventory

### 1.1 Navigation & entry

| # | Feature | Drywall location | UX (operator-visible) | Supabase tables | Port complexity |
|---|---------|------------------|-------------------------|-----------------|-----------------|
| 1 | HR nav shell | `src/App.jsx` — HR dropdown → `team` / `payroll` / `time-clock` views | User opens HR menu, picks Team, Payroll, or Time Clock; hash route changes | — | **S** (GC: sidebar + `/hr/*` routes) |

### 1.2 Team

| # | Feature | Drywall location | UX | Tables | Complexity |
|---|---------|------------------|-----|--------|------------|
| 2 | W2 employee roster | `src/components/Team.jsx` | Tabbed list of W2 staff; search, filter by position/pay type/status, sort by name/rate/start date | `org_team` (via payload) | **M** |
| 3 | W2 add/edit modal | `Team.jsx` | Modal: name, contact, position, pay type (hourly/salary/piece), rates, start date, gas allowance, owner draw, banked hours balance | `org_team` | **M** |
| 4 | 1099 contractor roster | `Team.jsx` | Same list patterns for 1099 contractors | `org_team` | **M** |
| 5 | 1099 add/edit modal | `Team.jsx` | Same fields; no tool repayment on 1099 in some paths | `org_team` | **M** |
| 6 | Job positions | `Team.jsx` + `STORAGE_KEYS.JOB_POSITIONS` | Manage position names used in dropdowns; **locked:** persist in `org_team.payload.positions[]` (Phase A payload extension + UI sync) | `org_team` | **S** |
| 7 | Archive / restore | `Team.jsx` | Set member `status` archived/inactive; hidden from payroll/time clock lists | `org_team` | **S** |
| 8 | Tool repayments | `Team.jsx` | W2-only: track tool loans/repayments on profile (`toolRepayments[]`) | `org_team` | **S** |
| 9 | Employee summary import | `Team.jsx` + `src/data/employeeSummarySeed.js` | One-shot import from bundled seed (Drywall only); **not ported to GC** — production `org_team` is source of truth | — | **—** (out of scope) |
| 10 | Team cloud sync | `src/services/teamAdapter.js` → `supabaseSpine.saveTeamToSupabase` | On save: replace entire org row — `{ employees[], contractors1099[] }`; load prefers cloud when non-empty | `org_team` | **M** |

**Team persistence model:** Single upsert per `organization_id`. LocalStorage mirrors (`hsh_drywall_employees`, etc.) remain fallback when Supabase disconnected.

### 1.3 Payroll

| # | Feature | Drywall location | UX | Tables | Complexity |
|---|---------|------------------|-----|--------|------------|
| 11 | Run payroll (main grid) | `src/components/Payroll.jsx` (~2,480 lines) | Pick period start/end; grid of all active W2+1099; per-person hours, piece work, per diem, reimbursement | `pay_periods` (on save), reads `org_team`, **projects** for piece rates | **L** |
| 12 | Hour entry lines | `Payroll.jsx` | Multiple hour rows per person: job, hours, OT type (regular/OT/double), assign rate from profile; **helper pay**: apprentice hours with lead deduction | `pay_periods` (embedded in payload) | **L** |
| 13 | Piece-rate entry lines | `Payroll.jsx` | Per job: phases total/done, sqft, rate from project quote metadata; gross = (done÷total)×sqft×rate | `pay_periods`, `projects` | **L** |
| 14 | Save / edit payroll run | `Payroll.jsx` + `payrollAdapter.js` | Save creates run with `id`, dates, `entries[]`, `totalGross`, `locked`; edit reloads draft; cancel edit | `pay_periods` | **M** |
| 15 | Past payrolls | `Payroll.jsx` — History tab | List saved runs; view summary | `pay_periods` | **M** |
| 16 | Lock / unlock payroll | `Payroll.jsx` | Lock prevents edit; unlock for admins | `pay_periods` | **S** |
| 17 | Payroll PDF export | `Payroll.jsx` (`jspdf`) | Landscape PDF “Payroll Report” per locked/unlocked run | — (client-side) | **M** (add `jspdf` dep to GC or server export later) |
| 18 | Calculation detail dialog | `Payroll.jsx` | Modal showing hour OT splits, piece math, helper deductions per person | — | **M** |
| 19 | Import from Time Clock | `Payroll.jsx` | Modal aggregates `time_entries` (or local punches) into hour lines for selected people/period | `time_entries`, `pay_periods` | **M** |
| 20 | Start next period from last | `Payroll.jsx` | Copies prior run structure (jobs/piece rows), zeros hours/phases completed | `pay_periods` | **S** |
| 21 | Banked hours sync | `Payroll.jsx` → writes back to Team | On save: adjusts `bankedHours` on employee/contractor records from `bankedHoursUsed` / `hoursToBank` | `org_team`, `pay_periods` | **M** |
| 22 | Pay periods cloud sync | `payrollAdapter.js` → `savePayPeriodsToSupabase` | **Delete all org rows, re-insert** one row per run (`id` PK, `payload` = full run JSON) | `pay_periods` | **M** |

**Payroll project picker (locked):** all org projects visible to the payroll runner, including `DRYWALL_ONLY` jobs — no drywall-only filter on the picker.

### 1.4 Time Clock

| # | Feature | Drywall location | UX | Tables | Complexity |
|---|---------|------------------|-----|--------|------------|
| 23 | Clock in / out | `src/components/TimeClock.jsx` | Hourly W2/1099 only: select person + job, clock in; clock out closes open punch | `time_entries` | **M** |
| 24 | Punch history (7 days) | `TimeClock.jsx` | History tab lists recent punches with durations | `time_entries` | **S** |
| 25 | Delete punch | `TimeClock.jsx` | Remove erroneous entry (office) | `time_entries` | **S** |
| 26 | Time entries cloud sync | `supabaseSpine.js` — `fetchTimeEntries`, `createTimeEntryClockIn`, etc. | `source_app` default `'DRYWALL'` on insert; unique partial index: one open punch per person per org | `time_entries` | **M** |

### 1.5 Supporting modules (not standalone UI)

| Module | Path | Role |
|--------|------|------|
| `teamAdapter.js` | `src/services/teamAdapter.js` | Supabase load/save wrapper; empty cloud → keep localStorage |
| `payrollAdapter.js` | `src/services/payrollAdapter.js` | Pay periods load/save; always mirrors localStorage |
| `supabaseSpine.js` | `src/services/supabaseSpine.js` | `fetchTeamFromSupabase`, `saveTeamToSupabase`, `fetchPayPeriodsFromSupabase`, `savePayPeriodsToSupabase`, time entry CRUD |
| `employeeSummarySeed.js` | `src/data/employeeSummarySeed.js` | Static seed for import button |
| Payroll math helpers | Inline in `Payroll.jsx` | `calculateGross`, OT premium, piece net, helper deduct — **must port to `src/lib/payrollMath.ts`** |

**Section 1 feature count: 26** (numbered rows in tables above).

---

## Section 1 appendix — Data shapes & schema (live Supabase)

### `public.org_team`

| Column | Type | Notes |
|--------|------|-------|
| `organization_id` | `text` | PK / unique per org |
| `payload` | `jsonb` | `{ employees: Person[], contractors1099: Person[] }` |
| `updated_at` | `timestamptz` | Set on upsert |

**Sample W2 person fields (from production):** `id`, `name`, `email`, `phone`, `status`, `payType`, `hourlyRate`, `salaryAmount`, `pieceRate`, `positionId`, `startDate`, `ownersDraw`, `gasAllowance`, `bankedHours`, `toolRepayments[]`.

**RLS (production):**

- `Users can view organization team` — SELECT if `organization_id = get_user_organization_uuid()` AND `is_user_active()`
- `Admins can manage organization team` — ALL if same org AND `user_is_admin()`

**Gap vs RBAC plan:** All active org members can read full roster; only legacy `user_is_admin()` can write. Office GC “HR read” and field “read-own” are **not** enforced at DB layer yet.

### `public.pay_periods`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK (client-generated, e.g. `generateId()`) |
| `organization_id` | `text` | Org scope |
| `payload` | `jsonb` | **Entire payroll run** (dates, entries, locked, totalGross, …) |
| `updated_at` | `timestamptz` | |

**Typical `payload` top-level keys (inferred from `Payroll.jsx`):**

- `id`, `startDate`, `endDate`, `completedAt`, `locked` (boolean)
- `totalGross` (number)
- `entries[]` — per person: `personId`, `personType`, `personName`, `hourEntries[]`, `hours`, `pieceEntries[]`, `pieceTotal`, `reimbursement`, `perDiem`, `bankedHoursUsed`, `hoursToBank`, `gross`, `done`

**`hourEntries[]` item:** `id`, `jobId`, `jobName`, `hours`, `overtimeType`, `assignToLeadId`, `leadPaysPerHour`, helper-deduct fields.

**`pieceEntries[]` item:** `id`, `jobId`, `jobName`, `phasesTotal`, `phasesDone`, `sqft`, `rate`, optional helper linkage.

**RLS:** Org-scoped SELECT/INSERT/UPDATE/DELETE for any member (`get_user_organization_uuid()`). No admin vs office vs field split.

**Save semantics:** `savePayPeriodsToSupabase` deletes all rows for org, inserts one row per run — simple but not concurrent-safe.

### `public.time_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `organization_id` | `text` | Required |
| `project_id` | `uuid` | FK → `projects`, nullable |
| `project_name` | `text` | Denormalized label |
| `person_type` | `text` | `'w2'` \| `'1099'` |
| `person_id` | `text` | Matches Team person `id` |
| `person_name` | `text` | Denormalized |
| `clock_in` / `clock_out` | `timestamptz` | Open punch: `clock_out` NULL |
| `source_app` | `text` | Default `'DRYWALL'` |
| `created_by` | `uuid` | Optional |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes (documented in drywall migration; verify in prod):** partial unique on open punch; org + `clock_in` DESC.

**RLS:** Full org CRUD for all members — **no read-own**.

### Other tables touched by UI (read-only / FK)

- `public.projects` — Time Clock job picker; Payroll piece rates from project/quote data
- `public.profiles` — org resolution via `get_user_organization_uuid()` / `current_user_organization_id()`

### Helper functions referencing HR tables

- `get_user_organization_uuid()` — org scope for RLS
- `is_user_active()` — org_team SELECT
- `user_is_admin()` — org_team write
- `current_user_organization_id()` — legacy text org id (time_entries migration)
- `set_updated_at()` — trigger on `time_entries`

### 1.6 UX flows (operator-visible, no code)

**Team**

1. User opens HR → Team. App loads W2/1099 from localStorage; if Supabase connected and cloud row non-empty, cloud replaces local lists.
2. User switches W2 / 1099 tabs. Filters and sort apply client-side only.
3. Add Employee opens modal; Save merges into list and calls `persistTeamToAdapter` (full-list upsert to `org_team`).
4. Archive sets `status`; member disappears from Payroll and Time Clock pickers.
5. Tool repayments: inline list on W2 record; amounts feed Payroll tool deduction for the period.
6. Import from summary: confirms dialog → merges seed names/positions → saves team + positions to localStorage (positions not in Supabase today).

**Payroll**

1. User opens HR → Payroll. `loadPayPeriods()` fills History; Run tab starts with current week dates.
2. Active roster = non-archived W2 + 1099 from Team localStorage (same keys as Team page).
3. User enters hour lines and/or piece lines per person; piece rates pulled from selected project’s quote/sqft metadata.
4. **Import from Time Clock** opens modal: aggregates punches in date range into proposed hour lines; user toggles rows then imports.
5. **Save Payroll** writes run to array, persists via delete-all-reinsert to `pay_periods`, clears draft `entries` state, may update `bankedHours` on team members.
6. **Past Payrolls** tab: select run → View calculations, PDF, Edit (if not locked), Lock, Unlock, Delete (if present).
7. Locked runs: Edit disabled; PDF still allowed.

**Time Clock**

1. User opens HR → Time Clock. Hourly-only people in dropdown (from Team storage).
2. Select person → select job (from parent `projects` prop) → Clock In creates row (`clock_out` null).
3. Second open punch for same person blocked by DB unique index (and UI check).
4. Clock Out sets `clock_out` timestamp.
5. History tab shows last 7 days (server-filtered when Supabase on).
6. Delete removes row (office use); refresh list.

---

## Section 1b — GC Platform investigation (HR today)

| Search | Result |
|--------|--------|
| `org_team`, `pay_periods`, `time_entries` in `src/` | **Not found** |
| `payroll`, `timeclock`, `time_clock` in `src/` | Only QBO / phase-2 labor types — unrelated |
| `/hr` routes | **Not present** |
| `Workspace` type | `projects \| deals \| tenants \| meeting \| schedule` — **no `hr`** |
| `rbac.ts` matrix | No `hr` column in code (plan doc has it) |

**Conclusion:** Greenfield UI in GC; data layer partially shared in Supabase.

### Tenants workspace pattern (template for HR)

| Layer | Tenants implementation | HR analogue |
|-------|------------------------|-------------|
| Home route | `/tenants` | `/hr` or `/hr/team` as default |
| Route guard | `<RequireWorkspaceAccess workspace="tenants">` | `workspace="hr"` |
| Top component | `TenantPipeline.tsx` | `HrWorkspaceShell.tsx` + child routes |
| Service | `tenantPipelineService.ts` | `hrTeamService.ts`, `hrPayrollService.ts`, `hrTimeService.ts` |
| Sidebar | `tenantsNav` in `AppSidebar.tsx` | `hrNav` with Team / Payroll / Time Clock |
| Switcher | Entry in `WORKSPACES` array | Add HR with icon + description |
| Active workspace | `useActiveWorkspace` path prefix `/tenants` | Prefix `/hr` |

Deals pattern is similar but uses nested `/deals/workspace/:dealId`; HR likely uses **flat sub-routes** like Tenants unless payroll run deep-links (`/hr/payroll/:runId`).

---

## Section 2 — Data layer reuse vs. refactor

### `org_team`

**Recommendation (locked):** **Keep JSONB blob for V1.** Add `positions[]` to `org_team.payload` in Phase A so job titles sync across devices/apps.

**RLS (locked, Phase A):** Office roles (`owner`, `office_gc`, `office_drywall`) SELECT full roster; Team writes for office roles per app gates; field roles SELECT/UPDATE only their linked person slice via `profiles.hr_person_id` + `hr_person_type`. Replace legacy `user_is_admin()`-only write path with role-aware policies.

### `pay_periods`

**Recommendation:** **Keep one-jsonb-row-per-run for V1; tighten RLS so field roles cannot SELECT org-wide payroll.**

**Rationale:** Payroll payload is large and nested; normalizing `pay_period_entries` is valuable long-term but blocks port for little immediate gain. Replace delete-all-insert with upsert-per-id as a **service-layer** improvement in Phase C (no schema change).

**RLS (locked, Phase A):** SELECT all runs for office roles + owner; SELECT only runs where `payload` contains an entry for the caller’s linked `hr_person_id` for `field_*`. INSERT/UPDATE/DELETE on `pay_periods` only when `profiles.can_run_payroll = true` (or owner). UI read for office without flag; write requires flag.

### `time_entries`

**Recommendation:** **Keep table as-is; add RLS read-own for `field_*`; set `source_app` to `'GC'` \| `'DRYWALL'` from caller; recreate missing indexes if absent in prod.**

**Rationale:** Already relational and clock-friendly; read-own is the main gap for merge RBAC. Geofencing/photo can add columns later without new tables.

**RLS:** Phase A policy pack: field SELECT/INSERT/UPDATE own rows only (`person_id` + `person_type` match profile link); office full org; consider restricting DELETE to office.

### Normalized `employees` / `contractors_1099` tables

**Recommendation:** **Defer to post-V1 (Phase 2+ or separate project).**

**Rationale:** Highest migration risk (FKs from payroll JSON and punches use string ids). Plan dual-write only if owner mandates QBO/labor integration needing SQL joins.

---

## Section 3 — UI port mapping

Proposed GC layout:

```
/hr                    → HrWorkspaceShell (tabs or sub-nav)
/hr/team               → TeamPage
/hr/payroll            → PayrollPage
/hr/payroll/:runId     → optional deep link to history run
/hr/time-clock         → TimeClockPage
```

Field users with read-own may land on `/hr/time-clock` or `/hr/me` (future) with Team/Payroll hidden via RBAC.

| Drywall component | Proposed GC path | shadcn / patterns | UX notes |
|-------------------|------------------|-------------------|----------|
| `Team.jsx` | `src/components/hr/TeamPage.tsx` | `Tabs`, `Table`, `Dialog`, `Select`, `Input`, `Button`, `Badge` | Match GC `TenantPipeline` density; use design tokens not `brandPrimary` literals |
| `Payroll.jsx` | `src/components/hr/PayrollPage.tsx` | Same + `ScrollArea` for wide grid | Split into subcomponents: `PayrollRunTab`, `PayrollHistoryTab`, `PayrollPersonRow` — **do not** single 2.5k file |
| `TimeClock.jsx` | `src/components/hr/TimeClockPage.tsx` | `Tabs`, `Card`, `Select` | 1:1 behavior; mobile-friendly clock UI (field) |
| `teamAdapter.js` | `src/services/hrTeamService.ts` | — | Typed `TeamPayload`, `PersonW2`, `Person1099` |
| `payrollAdapter.js` | `src/services/hrPayrollService.ts` | — | Typed `PayrollRun`, `PayrollEntry` |
| `supabaseSpine` HR fns | `src/services/hrService.ts` or split by domain | Use existing `src/lib/supabase.ts` client | Port JS → TS; unit-test payroll math separately |
| Payroll math | `src/lib/payrollMath.ts` | — | Pure functions extracted from `Payroll.jsx` |
| `employeeSummarySeed` | — | — | **Not ported** (locked) |
| HR nav in `App.jsx` | `HrWorkspaceShell.tsx` + `AppSidebar` hr nav group | `NavLink` / RR7 | Sidebar: Team, Payroll, Time Clock |

**Redesign opportunities (not required V1):**

- Team: use GC `DataTable` pattern if introduced elsewhere
- Payroll: sticky person column + collapsible detail per row
- Time Clock: full-screen mobile layout for `field_*`

**1:1 ports appropriate for:** clock in/out flow, lock payroll, PDF export math, banked hours rules.

---

## Section 4 — RBAC integration (locked)

Source: `docs/RBAC_PLAN.md` workspace matrix + **sub-feature composition** below. Implement in `src/lib/rbac.ts`, `usePermissions`, route/page guards, and Phase A RLS.

### Design principle: workspace `read` + sub-feature grants + capability flag

The HR column in the workspace matrix stays **`read`** for `office_gc` and `office_drywall` (not `write`). Sensitive powers are **not** implied by workspace visibility alone:

| Grant | Mechanism | What it allows inside HR |
|-------|-----------|---------------------------|
| Enter HR workspace | Workspace matrix (`read` / `admin` / read-own) | See HR nav and open sub-routes permitted below |
| Team write | **Role** (office + owner) | Create/update/archive W2 & 1099, positions, tool repayments |
| Payroll read (org-wide) | **`can_run_payroll` flag** (owner short-circuits) | View all runs, history, calculation detail, PDF for any employee |
| Payroll read (own stub) | **`profiles.hr_person_id`** + RLS row match | SELECT only runs whose `payload.entries[].personId` matches linked person |
| Payroll write | **`can_run_payroll` flag** (owner short-circuits) | Run/save/edit/lock/unlock payroll, import from time clock into payroll |
| Field read-own | **Role** `field_*` + `profiles.hr_person_*` | Own profile slice, own punches, own pay stubs only |
| TimeClock use | **Role** (not viewer) | Clock in/out; field only for linked person |

**`can_run_payroll`:** orthogonal boolean on `profiles`, shipped in **HR Phase A migration** (not Phase 1 RBAC). Initial backfill: `mark@hshdrywall.com → true`, all others `false`. Owner always passes via `hasCapabilityFlag` short-circuit (same pattern as `can_admin_qb`).

### Workspace-level (`hr` column) — `src/lib/rbac.ts` target

| Role | `WORKSPACE_ACCESS.hr` | Notes |
|------|----------------------|-------|
| `owner` | `admin` | Short-circuit all capability flags |
| `office_gc` | `read` | Team write by role; Payroll org-wide read/write only with `can_run_payroll` |
| `office_drywall` | `read` | Same as `office_gc` inside HR |
| `field_gc` | `read` | Enforce read-own in sub-feature helpers + RLS (not org-wide roster) |
| `field_drywall` | `read` | Same as `field_gc` |
| `viewer` | `read` | Read-only all HR surfaces; no TimeClock |

Matrix `read` for field roles means “may enter HR workspace for own data,” not “see entire org HR.”

### Per-surface permission matrix (locked)

Legend: **W** = write, **R** = read, **O** = own linked person only, **—** = no access, **F** = requires `can_run_payroll` (owner bypasses).

| Surface | owner | office_gc | office_drywall | field_gc / field_drywall | viewer |
|---------|-------|-----------|----------------|------------------------|--------|
| HR workspace visible | ✓ | ✓ | ✓ | ✓ (own routes) | ✓ |
| Team — view roster | R all | R all | R all | O | R all |
| Team — add/edit/archive | W | W | W | O (linked profile only) | — |
| Job positions — manage | W | W | W | — | — |
| Payroll — view runs (org-wide) | R (F) | F | F | — | — |
| Payroll — view own pay stub | R (F) | O† | O† | O† | — |
| Payroll — run/save/edit/lock | W (+F redundant) | F | F | — | — |
| Payroll — PDF export | R (F) | F‡ | F‡ | O‡ | — |
| TimeClock — clock in/out | W | W | W | O | — |
| TimeClock — delete punch | W | W | W | — | — |
| Import time clock → payroll | W | F | F | — | — |

† **O** = row-level RLS only when `profiles.hr_person_id` is set and matches `payload.entries[].personId` (not org-wide payroll access).  
‡ PDF for own stub only when read-own row is visible; org-wide PDF requires **F**.

**Drywall app during transition:** continues to use shared tables; GC enforces new RLS. Users without `can_run_payroll` lose payroll **write** at DB layer even in Drywall until granted the flag (Mark retains write).

### `rbac.ts` helpers (implementation checklist)

| Helper | Logic |
|--------|-------|
| `canRunPayroll(profile, role)` | `hasCapabilityFlag(profile, role, 'can_run_payroll')` |
| `canWriteTeam(role, profile?)` | `owner` or `office_gc` or `office_drywall`; field only if editing linked `hr_person_id` |
| `canReadPayroll(profile, role)` | `canRunPayroll` only (org-wide); own-stub read is row-level via `hr_person_id`, not a separate global flag |
| `canWritePayroll(profile, role)` | `canRunPayroll` only (owner short-circuit) |
| `canUseTimeClock(role)` | not `viewer` |
| `canViewHrPerson(role, personId, profile)` | office: all; field: `personId === profile.hr_person_id` |

Wire `usePermissions` to expose `canRunPayroll`, `canWriteTeam`, `canWritePayroll`, etc.

### Profile ↔ person linkage (locked)

Phase A columns: `profiles.hr_person_type` (`text`, `w2` \| `1099`), `profiles.hr_person_id` (`text`). **Assignment:** owner-only via User Management (Phase E UI); no self-service V1; no automatic email match V1.

### RLS alignment (mandatory Phase A)

DB policies must enforce the matrix above — `pay_periods` **SELECT** is operator-or-read-own (`user_can_run_payroll()` OR `payload.entries[].personId = profiles.hr_person_id`); **writes** require `user_can_run_payroll()`. `user_can_read_org_payroll()` aliases operator-only (no office-tier pass). UI-only gates are insufficient because payroll JSON contains all employees’ gross pay.

---

## Section 5 — Workspace wiring (file checklist)

No line edits yet — files to touch when implementing.

| File | Change |
|------|--------|
| `src/hooks/useActiveWorkspace.ts` | Add `'hr'` to `Workspace` union; `WORKSPACE_HOME.hr = '/hr'`; `workspaceFromPath` for `/hr` |
| `src/components/WorkspaceSwitcher.tsx` | Add HR entry (icon e.g. `UserCog` / `IdCard`); filter with `canAccessWorkspace('hr')` |
| `src/components/AppSidebar.tsx` | Add `hrNav` group: Team, Payroll, Time Clock; case `'hr'` in nav switch |
| `src/routes/index.tsx` | Routes under `/hr/*` wrapped in `<RequireWorkspaceAccess workspace="hr">`; lazy-load HR pages |
| `docs/RBAC_PLAN.md` | Add `can_run_payroll` to capability-flag list; note column ships with HR Phase A migration |
| `src/lib/rbac.ts` | Add `hr` column to `WORKSPACE_ACCESS` (`owner` admin; `office_*` read; `field_*` read; `viewer` read); add `canRunPayroll()` via `hasCapabilityFlag(..., 'can_run_payroll')`; Team/Payroll sub-feature helpers |
| `src/services/userService.ts` | `can_run_payroll` / `canRunPayroll` on profile type (Phase E or with Phase A migration) |
| `src/hooks/usePermissions.ts` | Expose `canRunPayroll`, `canWriteTeam`, `canWritePayroll`, field read-own helpers |
| `src/routes/RequirePermission.tsx` | `RequireCanRunPayroll` (or `RequireHrPayrollWrite`) wrapping Payroll write routes/actions |
| `src/components/hr/HrWorkspaceShell.tsx` | **New** — layout + outlet for sub-routes |
| `src/components/hr/TeamPage.tsx` | **New** |
| `src/components/hr/PayrollPage.tsx` | **New** |
| `src/components/hr/TimeClockPage.tsx` | **New** |
| `src/services/hrTeamService.ts` | **New** |
| `src/services/hrPayrollService.ts` | **New** |
| `src/services/hrTimeService.ts` | **New** |
| `src/lib/payrollMath.ts` | **New** |
| `src/types/hr.ts` | **New** — Person, PayrollRun, TimeEntry types |
| `package.json` | Add `jspdf` if PDF export ported |
| `docs/RBAC_PLAN.md` | Mark HR workspace wired when done |

**Tenants pattern reference (existing):**

- Route: `/tenants` → `TenantPipelineRoute` with `RequireWorkspaceAccess workspace="tenants"`
- Service: `tenantPipelineService.ts`
- Sidebar: `tenantsNav` in `AppSidebar.tsx`

---

## Section 6 — TimeClock scope decision

**Confirmed for this port:**

- TimeClock ships **inside the HR workspace** at `/hr/time-clock`.
- **No** geofencing, GPS validation, or photo verification in this phase.
- Behavior parity with Drywall: hourly-only roster, job from projects list, 7-day history, open-punch constraint, Supabase-backed when connected.

**Future graduation (document only):**

- When geofencing/photo land, TimeClock may promote to its own workspace or field portal route (`docs/SCHEDULE_TARGET_MODEL.md` §9).
- Optional: link clock-in to active `schedule_items` for actual hours per task.

---

## Section 7 — Phased rollout plan

### Phase A — Schema & RLS (**required before any HR UI**)

**Goal:** Shared HR tables safe for GC + Drywall with locked RBAC (`can_run_payroll`, read-own, Team write vs Payroll write split).

| Work item | Files / artifacts |
|-----------|-------------------|
| **`profiles.can_run_payroll`** `boolean NOT NULL DEFAULT false` | `supabase/migrations/<date>_hr_rbac_phase_a.sql` |
| Backfill `can_run_payroll` | Same migration: `mark@hshdrywall.com → true`; all other profiles → `false` (same pattern as Phase 1 RBAC backfill) |
| SQL helper `user_can_run_payroll()` | Same migration — reads `profiles.can_run_payroll` for `auth.uid()`, owner override via `roles` includes `owner` |
| **`profiles.hr_person_id`** + **`profiles.hr_person_type`** | Same migration (nullable) |
| **`org_team` RLS** | Office SELECT all; office Team write; field read/update own person in payload via RPC or policy helper |
| **`pay_periods` RLS** | SELECT: `user_can_run_payroll()` OR read-own (`personId` in `payload.entries`); INSERT/UPDATE/DELETE: `user_can_run_payroll()` only |
| **`pay_periods` SELECT revision** | `supabase/migrations/20260528_hr_pay_periods_select_operator_or_own.sql` (operator-or-read-own; drops office-tier read) |
| **`time_entries` RLS** | Field read-own + insert/update own; office full org; DELETE office only |
| **`time_entries` indexes** | Partial unique open punch; `org_id + clock_in DESC` (from drywall migration doc) |
| **`org_team.payload.positions[]`** | App-level merge on save; optional one-time backfill from Drywall localStorage not required |
| **`source_app`** | App sets `'GC'` \| `'DRYWALL'` on insert (check constraint optional) |

**GC app files in Phase A (minimal):** `src/services/userService.ts` types for new profile columns only if needed for migration deploy verification — **no HR UI**.

**Drywall impact:** After Phase A applies, only users with `can_run_payroll` can mutate `pay_periods`; Mark retains access.

### Phase B — Team management

| Work item | Files |
|-----------|-------|
| Types + team service | `src/types/hr.ts`, `src/services/hrTeamService.ts` |
| Team UI port | `src/components/hr/TeamPage.tsx`, subcomponents for modals |
| Positions in `org_team.payload.positions[]` | `TeamPage` read/write via team service |
| Tests for adapter round-trip | `src/lib/__tests__/hrTeam.test.ts` (optional) |

**Phase B — payroll data on Team cards (do not miss):** `office_gc` / `office_drywall` **cannot** `SELECT` from `pay_periods` without `can_run_payroll`. Any UI that showed “last paystub date”, “YTD gross”, or similar on an employee row must either (a) gate on `canRunPayroll` / hide for non-operators, or (b) derive hints from `time_entries` (or another non-payroll source). Do not assume office role implies payroll read.

**Depends on:** Phase A only if field read-own on profile edit.

### Phase C — Payroll

| Work item | Files |
|-----------|-------|
| Extract math | `src/lib/payrollMath.ts` |
| Payroll service | `src/services/hrPayrollService.ts` |
| Payroll UI | `src/components/hr/PayrollPage.tsx` + tab subcomponents |
| Project list integration | Reuse project fetch from GC (`supabaseService` / existing hooks) |
| PDF | `jspdf` dependency |
| **Read-own RPC (REQUIRED before any field user gets `hr_person_id` set)** | New `SECURITY DEFINER` function `get_my_paystub(period_id uuid)` (or equivalent) that returns ONLY the requester's entry filtered out of `payload.entries[]`. Non-operator paystub views call the RPC; operators (`can_run_payroll = true`) hit the raw `pay_periods` table. Rationale: the current Phase A.1 RLS allows read-own at the row level, but `payload.entries[]` JSONB still contains every employee's gross pay in that run. RLS controls row visibility, not row contents — so a direct `SELECT` from a non-operator who matches one entry's `personId` leaks everyone else's pay. RPC is the trim layer. |

**Depends on:** Phase B (people list).

**Security note:** Until the read-own RPC ships in Phase C, do not link any field/office user's `profiles.hr_person_id` to a real HR person record. Today all 7 profiles have `hr_person_id = null`, so the leak is dormant. Phase E's user-person linking UI must wait on Phase C completing this RPC.

### Phase D — TimeClock

| Work item | Files |
|-----------|-------|
| Time service | `src/services/hrTimeService.ts` |
| TimeClock UI | `src/components/hr/TimeClockPage.tsx` |
| Payroll import hook | PayrollPage import modal uses `hrTimeService` |

**Depends on:** Phase B; soft dependency on Phase C for import UX.

### Phase E — Workspace registration + RBAC gates

| Work item | Files |
|-----------|-------|
| Workspace plumbing | `useActiveWorkspace.ts`, `WorkspaceSwitcher.tsx`, `AppSidebar.tsx`, `routes/index.tsx` |
| RBAC matrix + `canRunPayroll` | `src/lib/rbac.ts`, `usePermissions.ts`, `userService.ts` |
| Shell | `src/components/hr/HrWorkspaceShell.tsx` |
| Route guards | `RequireWorkspaceAccess workspace="hr"`; `RequireCanRunPayroll` on payroll write surfaces |
| User ↔ person linking UI | User Management (owner-only assignment) |

**Depends on:** Phases B–D (pages exist to wire).

### Suggested sequencing

```
A (RLS + can_run_payroll) ──► B (Team) ──► C (Payroll) ──► D (TimeClock) ──► E (Wire + RBAC UI gates)
         REQUIRED first              └──────────────────────────► E shell stubs possible after A
```

**Phase A is blocking** for Phases B–D (RLS must be live before HR UI touches `pay_periods`). Drywall app shares tables; after Phase A only `can_run_payroll` users can write payroll at DB layer.

---

## Section 9 — Locked decisions (canonical)

| # | Topic | Locked decision |
|---|--------|-----------------|
| 1 | Normalize `org_team.payload` | **Defer.** Keep JSONB blob for V1; no `employees` / `contractors_1099` tables in this port. |
| 2 | `office_drywall` HR access | Workspace stays **`read`**. **Role** grants Team **write**. Payroll org-wide **read/write** requires **`can_run_payroll`**; read-own stub via `hr_person_id` + RLS only. |
| 3 | `office_gc` HR access | Same as #2 (not granted `can_run_payroll` by default). |
| 4 | Dual-app usage | **Shared tables indefinitely.** Both apps may read; writes follow RLS. No Drywall HR freeze at GC launch. |
| 5 | Job positions | **Persist** in `org_team.payload.positions[]` (Phase A); drop localStorage-only as source of truth in GC. |
| 6 | Profile ↔ person linking | **Owner-only** assignment in User Management (Phase E). Columns in Phase A. No self-service / no email auto-match V1. |
| 7 | Payroll PDF | **Client-side `jspdf`** in GC (parity with Drywall). |
| 8 | Project scope (piece rates) | **All org projects** in payroll job picker, including **`DRYWALL_ONLY`**. |
| 9 | Phase A timing | **Required before any HR UI.** Ship `can_run_payroll`, person-link columns, and RLS first. |
| 10 | Employee summary seed | **Do not port** to GC; production `org_team` is authoritative. |

**Capability flag summary:** `profiles.can_run_payroll` gates Payroll **org-wide read** and **write** at DB (`pay_periods` SELECT/INSERT/UPDATE/DELETE). Read-own pay stub is row-level (`hr_person_id` ↔ `payload.entries[].personId`). Owner short-circuits. Initial grant: Mark only.

---


## Appendix A — Drywall file reference

```
hsh-drywall-app/
  src/components/Team.jsx          (~1,200+ lines)
  src/components/Payroll.jsx       (~2,480 lines)
  src/components/TimeClock.jsx     (~340 lines)
  src/services/supabaseSpine.js    (team, pay periods, time entries)
  src/services/teamAdapter.js
  src/services/payrollAdapter.js
  src/data/employeeSummarySeed.js
  supabase/migrations/20250127000000_create_pay_periods.sql
  docs/supabase-time-entries-migration.sql
```

## Appendix B — GC Platform current state (HR)

- **Grep:** No `org_team`, `pay_periods`, `time_entries`, `timeclock`, or `/hr` routes in `src/`.
- **Related but out of scope:** `src/types/phase2Labor.ts`, QuickBooks labor import, project actuals labor — different domain from in-house HR payroll.

## Appendix C — Merge plan cross-reference

- Target workspaces list includes **HR** as #6 (`docs/RBAC_PLAN.md`, `docs/SCHEDULE_TARGET_MODEL.md`).
- TimeClock remains under HR until geofencing/photo (Section 6 above).
- `memory/drywall_merge_plan.md` was not found in-repo; this doc satisfies **step 4** planning per user request.

---

*Document version: 2026-05-27 — decisions locked (Section 9); implementation pending.*
