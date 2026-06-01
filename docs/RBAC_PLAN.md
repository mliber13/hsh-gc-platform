# RBAC Plan — HSH GC Platform (Locked)

## Scope

- Locked design plan for RBAC rollout.
- No production code in this document.
- No UI role-management build in this phase.
- No RLS rewrite in this phase.
- This plan reflects approved decisions and is implementation-ready.

## Operating Context

- Today, only the owner (Mark) has app access.
- This materially lowers immediate migration risk because there are no active non-owner users to break.
- Resulting sequencing strategy:
  - move deliberately but with simpler rollout controls,
  - prioritize clean schema + app plumbing first,
  - defer assigning drywall-specific roles until the first drywall users are onboarded.

---

## Current State (Verified)

## Auth + permission plumbing

- `AuthContext` exposes session primitives but not role/capability claims (`src/contexts/AuthContext.tsx`).
- `usePermissions` is a shallow role adapter around `getCurrentUserProfile()`:
  - returns `isAdmin/isEditor/isViewer`, `canCreate/canEdit/...` (`src/hooks/usePermissions.ts`).
- UI role checks are sparse and mostly admin/viewer toggles:
  - Projects dashboard uses `canCreate`, `isViewer`.
  - Contact Directory and MyFeedback check `role === 'admin'`.

## Navigation chokepoints

- `WorkspaceSwitcher` is the workspace entrypoint and currently ungated.
- `AppSidebar` is workspace-aware but not role-aware.
- Routes are auth-gated but not role-gated (`src/routes/index.tsx`).

## Database role model

- Existing persistent role model is `profiles.role` with `admin/editor/viewer` lineage from `002_multi_user_shared_access.sql`.
- Multi-org and invite-first infrastructure is present in migrations, but RBAC in app remains coarse.

---

## Locked Role Taxonomy

Naming convention:

- `[function]_[scope]`

Final role list (V1):

1. `owner`
2. `office_gc`
3. `office_drywall`
4. `field_gc`
5. `field_drywall`
6. `viewer`

Compatibility note:

- Legacy `admin/editor/viewer` may still exist in transitional data paths.
- Runtime mapping to the locked roles is allowed during migration windows.

---

## Target Workspaces

1. Projects
2. Deals
3. Tenants
4. Meetings
5. Schedule
6. HR
7. Drywall

---

## Workspace Permission Matrix (Locked)

Legend:

- `none` = hidden + blocked
- `read` = visible, read-only
- `write` = create/update
- `admin` = management-level

| Role | Projects | Deals | Tenants | Meetings | Schedule | HR | Drywall |
|---|---|---|---|---|---|---|---|
| owner | admin | admin | admin | admin | admin | admin | admin |
| office_gc | write | write | write | write | write | read | read |
| office_drywall | read | none | none | read | mixed* | read | admin |
| field_gc | none | none | none | none | read-own | read-own | none |
| field_drywall | none | none | none | none | read-own | read-own | none |
| viewer | read | read | read | read | read | read | read |

`mixed*` for `office_drywall` schedule means:

- write on drywall trade entries on any project,
- read on non-drywall schedule entries.

---

## Decision Notes (Baked In)

1. `office_gc` -> Drywall workspace is **read-only** at the workspace matrix level.
   - **Phase D drift (locked V1):** `canWriteDrywallField` still allows `office_gc` to save Field Measurement + photo uploads (`owner`, `office_gc`, `office_drywall`). GC Projects flows remain the path for drywall trade rows on dual-view jobs.
   - Drywall trade write from GC side happens through per-project GC flows (one-row-two-views model), not Drywall workspace quote/order authoring.

2. `field_drywall` / `field_gc` -> Drywall workspace **none** (hidden in switcher; routes redirect).
   - V1 effective field access: **HR Time Clock** + own `time_entries` only — not the Drywall project list (see `docs/DRYWALL_PORT_PLAN.md` §7).

3. `office_drywall` -> Schedule is **mixed permission**.
   - Write drywall trade entries on any project.
   - Read non-drywall entries.
   - Purpose: avoid drywall crew overallocation while preserving non-drywall authority boundaries.

4. `field_*` -> HR is **read-own.\*** only.
   - Own time entries.
   - Own paystub.
   - Own profile.
   - No access to other users' HR/pay data.

5. `viewer` is **global read-only** across office-tier workspaces in V1.
   - No per-workspace viewer assignment in V1.

5. `is_meeting_operator` is an **orthogonal capability flag**, not a role.

6. Single role assignment per user in V1 behavior, but role storage is **`text[]`** for future dual-role readiness (no future migration needed for multi-role support).

7. QuickBooks admin is **orthogonal capability flag** (`can_admin_qb`), grantable by owner to selected office users.

8. Payroll run/edit/lock is **orthogonal capability flag** (`can_run_payroll`), grantable by owner to selected users. HR workspace visibility alone does not grant payroll write.

9. Inside the HR workspace, **roles** grant Team write for office roles. **`can_run_payroll`** grants Payroll **org-wide read and write** (all `pay_periods` rows). Read-own pay stub is row-level via `profiles.hr_person_id` matching `payload.entries[].personId` (not an office-role pass). Owner short-circuits all capability flags (same as `can_admin_qb`).

10. No additional compliance constraints assumed for now; defaults stand.

---

## Capability Flags — Orthogonal to Role

Principle:

- **Role grants workspace map.**
- **Capability flags grant specific sensitive powers.**
- This prevents role explosion (`office_gc_with_qb`, `office_gc_without_qb`, etc.).

Locked V1 capability flags:

1. `is_meeting_operator` (boolean) — gates meeting operator actions (Phase 1 RBAC migration).
2. `can_admin_qb` (boolean) — gates QuickBooks admin/settings UI (Phase 1 RBAC migration).
3. `can_run_payroll` (boolean) — gates Payroll **org-wide read and write** inside HR (`pay_periods` SELECT for all runs, plus run/save/edit/lock/import-to-payroll). Does **not** gate Team write. Users without the flag may still SELECT individual runs where their linked `hr_person_id` appears in `payload.entries` (read-own stub). **Ships with the HR port Phase A migration**; SELECT tightening in `20260528_hr_pay_periods_select_operator_or_own.sql`. Owner short-circuits via the same `hasCapabilityFlag` pattern as the other flags.

Schema reservation:

- Reserved nullable boolean columns from Phase 1 remain available for future delegated powers.
- `can_run_payroll` uses a dedicated column added in the HR port migration (not one of the Phase 1 placeholders).

---

## Storage Model (Locked)

V1 storage location:

- `profiles.roles` as `text[]`
- `profiles.is_meeting_operator` as boolean
- `profiles.can_admin_qb` as boolean
- `profiles.can_run_payroll` as boolean (HR port Phase A — see `docs/HR_PORT_PLAN.md`)
- plus reserved nullable boolean columns for future capability flags

Behavior rules:

- V1 runtime uses one effective role (`roles[1]` / first element by convention).
- Array type is chosen now to avoid future migration for dual-role support.

Out of scope for this iteration:

- Separate `org_memberships` table.
- Multi-role evaluation logic.
- Multi-org role arbitration.

---

## Sub-Feature Matrix (Role + Flag Composition)

| Capability | owner | office_gc | office_drywall | field_gc | field_drywall | viewer |
|---|---|---|---|---|---|---|
| View contract/estimate financials | yes | yes | drywall-scope only | no | no | read-only |
| Edit estimate/trade financial rows | yes | yes | drywall-scope | no | no | no |
| Edit actual costs | yes | yes | drywall-scope | no | no | no |
| TimeClock use | yes | yes | yes | yes | yes | no |
| HR Team write | yes | yes | yes | own profile only | own profile only | no |
| HR Payroll read (org-wide) | yes | flag-gated (`can_run_payroll`) | flag-gated | no | no | no |
| HR Payroll read (own stub) | yes | read-own row only† | read-own row only† | read-own row only† | read-own row only† | no |
| HR Payroll write (run/save/lock) | yes | flag-gated (`can_run_payroll`) | flag-gated | no | no | no |
| HR others' pay/team data | yes | team roster only (no org payroll) | team roster only | no | no | team roster read-only |

† Requires `profiles.hr_person_id` set; RLS matches `payload.entries[].personId`.
| Meeting operator actions | yes | flag-gated | flag-gated | no | no | no |
| QuickBooks admin/settings | yes | flag-gated (`can_admin_qb`) | flag-gated if granted | no | no | no |

---

## Implementation Phases (Locked)

## Phase 1 — Schema + owner default (ship next)

Objective:

- Introduce role-array + capability flags in schema.
- Set owner baseline for Mark.
- No UI changes yet.

Changes:

1. Add columns on `profiles`:
   - `roles text[]` (default owner-safe behavior defined in migration logic)
   - `is_meeting_operator boolean`
   - `can_admin_qb boolean`
   - reserved boolean capability columns (2-3 placeholders)
2. Backfill Mark:
   - `roles = ARRAY['owner']`
   - `is_meeting_operator = true`
   - `can_admin_qb = true`
3. Keep legacy `profiles.role` untouched during transition.

Phase 1 file change list (specific):

- `supabase/migrations/<new_phase1_rbac_schema>.sql` (new)
- `src/services/userService.ts` (types + read compatibility for `roles` and flags)
- `ROLE_PERMISSIONS.md` (optional short update note only if needed for team visibility)
- `docs/RBAC_PLAN.md` (this plan; already locked)

No changes in Phase 1:

- `AuthContext`
- `usePermissions`
- `WorkspaceSwitcher`
- `AppSidebar`
- route guards
- RLS policies

## Phase 2 — App permission plumbing + navigation gating

Objective:

- `useAuth` exposes role + capability flags.
- `usePermissions` becomes real consumer of those fields.
- Workspace/nav/route filtering uses RBAC.

Files:

- `src/contexts/AuthContext.tsx`
- `src/services/userService.ts`
- `src/hooks/usePermissions.ts`
- `src/hooks/useActiveWorkspace.ts` (add `hr`, `drywall`)
- `src/components/WorkspaceSwitcher.tsx`
- `src/components/AppSidebar.tsx`
- `src/routes/index.tsx`
- (as needed) route-level shared guard component(s)

## HR port — Phase A RLS (before HR UI; not Phase 1 or Phase 3)

Objective:

- Add `profiles.can_run_payroll` + `profiles.hr_person_id` / `hr_person_type` and HR table RLS per `docs/HR_PORT_PLAN.md` Section 7 Phase A.
- Enforce payroll write at DB via `can_run_payroll`; enforce field read-own on `pay_periods` and `time_entries`.

Files:

- `supabase/migrations/<date>_hr_rbac_phase_a.sql`
- `docs/HR_PORT_PLAN.md` (locked decisions)

## Phase 3 — Supabase RLS alignment with locked taxonomy

Objective:

- Replace legacy 3-role assumptions in policies with locked role model.
- Validate owner path first (Mark).
- HR-specific policies may already exist from HR Phase A; Phase 3 reconciles any remaining tables still on legacy helpers.

Files:

- `supabase/migrations/<new_phase3_rbac_rls>.sql`
- policy helper SQL function definitions used by RLS

Testing target:

- Mark as `owner` passes all read/write paths.
- Deny behavior for non-owner test accounts validated before rollout.

## Phase 4 — Activate drywall-specific user roles

Objective:

- Turn on assignment of `office_drywall`, `field_drywall`, `field_gc`.
- Happens only when first drywall office/field users are onboarded.

Files:

- primarily app-admin/user-assignment paths (when built),
- no schema delta expected if Phases 1-3 are complete.

---

## RLS Direction (When Phase 3 Starts)

- Keep role and capability checks separate:
  - role => workspace/table class access,
  - capability flag => sensitive delegated actions.
- Preserve principle of least privilege for field roles.
- Ensure `read-own.*` HR policy boundaries are explicit and testable.

---

## Testing Checklist (Locked)

1. Owner can access all 7 workspaces.
2. `office_gc` cannot write via Drywall workspace but can write drywall data through approved GC project flows.
3. `office_drywall` can write drywall schedule entries and read non-drywall schedule entries.
4. `field_*` only sees own HR records.
5. `viewer` sees global read-only office-tier surfaces (V1 default).
6. `is_meeting_operator` gates operator actions independent of role.
7. `can_admin_qb` gates QB admin actions independent of role.
8. `can_run_payroll` gates payroll org-wide read and write independent of role; office roles without the flag can still edit Team but cannot list all `pay_periods` (read-own stub only when `hr_person_id` is linked).
9. Owner short-circuits all capability flags (`can_run_payroll`, `can_admin_qb`, `is_meeting_operator`).

---

## Known Out-of-Scope Items

- Duplicate estimate creation race condition.
- Orphan estimate cleanup workstream.
- Drywall app-specific badge/list issues.
- Role assignment UI and invite UX redesign.

---

## Appendix — Current-State Citations Used

- `ROLE_PERMISSIONS.md`
- `src/contexts/AuthContext.tsx`
- `src/hooks/usePermissions.ts`
- `src/hooks/useActiveWorkspace.ts`
- `src/components/WorkspaceSwitcher.tsx`
- `src/components/AppSidebar.tsx`
- `src/routes/index.tsx`
- `src/services/userService.ts`
- `src/components/ProjectsDashboard.tsx`
- `src/components/ContactDirectory.tsx`
- `src/components/MyFeedback.tsx`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_multi_user_shared_access.sql`
- `supabase/migrations/008_fix_user_profile_creation.sql`
- `supabase/migrations/20260424_a5c_uuid_rls_switch.sql`
- `supabase/migrations/20260429_a5e_typeconvert.sql`
- `supabase/migrations/20260427_a5c2_c9_c10_meta_infra.sql`

