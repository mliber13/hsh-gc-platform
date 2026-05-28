# RBAC Phase 2 Mapping (Locked — Phase 2b Execution Plan)

## Scope

- Phase 2b: app permission plumbing + navigation/route gating (implemented).
- Source of truth for target model: `docs/RBAC_PLAN.md`.
- Legacy DB/RLS (`profiles.role`) unchanged until Phase 3.

---

## Locked Decisions (Phase 2b)

1. **Owner override** — `usePermissions` treats `roles.includes('owner')` as always-true for every capability-flag-gated check (`is_meeting_operator`, `can_admin_qb`, and future flags). Implemented as a global short-circuit at the top of the hook via `hasCapabilityFlag()` in `src/lib/rbac.ts`.

2. **QuickBooks enforcement** — `can_admin_qb` is enforced in Phase 2b (nav, route guard, dashboard QB banner). No additional backfill beyond Mark (`owner`, flag true). Erik, Jennifer, Kristen, Lisa, and Tess lose QB UI access — **accepted regression** (none use QB today).

3. **`office_drywall` wired now** — full workspace/nav matrix logic shipped in Phase 2b even though zero users hold the role today.

4. **Feedback moderation** — owner-only (`isFeedbackOwner` / `isAdmin`), parity with legacy `role === 'admin'`.

5. **Contact Directory invite/user access controls** — owner-only (`canManageUsers`), parity with legacy.

---

## Section 1 — Inventory Table (Original Gates)

| # | Location | Legacy check | What it gates |
|---|---|---|---|
| 1 | `src/hooks/usePermissions.ts` | `userProfile.role` admin/editor/viewer | Shared permission API |
| 2 | `src/components/ProjectsDashboard.tsx:90` | `canCreate`, `isViewer` | Dashboard create CTA, viewer UX |
| 3 | `src/components/dashboard/ProjectCard.tsx:228-241` | `isViewer` prop | Status change on cards |
| 4 | `src/components/ContactDirectory.tsx:94` | `role === 'admin'` | App access / invite controls |
| 5 | `src/components/MyFeedback.tsx:73` | `role === 'admin'` | Feedback moderation UI |
| 6 | `src/services/feedbackService.ts:60` | `role === 'admin'` | Feedback email recipients |
| 7 | `src/services/feedbackService.ts:207` | `role !== 'admin'` | Update feedback |
| 8 | `src/services/feedbackService.ts:318` | `role !== 'admin'` | Delete feedback |
| 9 | `src/components/AppSidebar.tsx:346-353` | `meeting_leads.is_meeting_operator` | Meeting "Manage" nav |
| 10 | `src/components/meeting/MeetingAdmin.tsx:115-118` | meeting lead operator | Meeting admin page |
| 11 | `src/components/meeting/MeetingView.tsx:115-117` | meeting lead operator | Live-discuss toggle |
| 12 | `src/components/WorkspaceSwitcher.tsx` | none | Workspace list |
| 13 | `src/components/AppSidebar.tsx:294-312` | none | Sidebar nav groups |
| 14 | `src/routes/index.tsx` + QB nav | none | Routes + QuickBooks entry |

Auth-only envelope (`AuthGate`) unchanged — not an RBAC gate.

---

## Section 2 — New Check Per Gate (Implemented)

| # | Location | New check |
|---|---|---|
| 1 | `usePermissions.ts` | `deriveEffectiveRole(profile.roles[0])` + `hasCapabilityFlag()` owner short-circuit |
| 2 | `ProjectsDashboard.tsx` | `canCreate`, `isViewer` from refactored hook |
| 3 | `ProjectCard.tsx` | unchanged consumer (`isViewer` from hook) |
| 4 | `ContactDirectory.tsx` | `canManageUsers` (owner-only) |
| 5 | `MyFeedback.tsx` | `isAdmin` → owner via hook |
| 6–8 | `feedbackService.ts` | `isFeedbackOwner(profile)` |
| 9 | `AppSidebar.tsx` | `canManageMeetingPrompts` from profile flag + owner short-circuit |
| 10 | `MeetingAdmin.tsx` | `canManageMeetingPrompts` |
| 11 | `MeetingView.tsx` | `canManageMeetingPrompts` |
| 12 | `WorkspaceSwitcher.tsx` | `canAccessWorkspace(ws)` per matrix |
| 13 | `AppSidebar.tsx` | workspace matrix + `canSeeSettingsNavItem` + QB flag |
| 14 | `routes/index.tsx` + nav | `RequireQuickBooksAdmin`, `RequireMeetingAdmin`, `RequireWorkspaceAccess` |

---

## Section 3 — Regression Risk Per User

| User | Non-QB regressions | QB regression (accepted) |
|---|---|---|
| mark@hshdrywall.com | None | None — retains QB |
| erik@hshdrywall.com | None | **Accepted** — loses QB UI |
| jennifer@hshcontractor.com | None | **Accepted** |
| kristen@hshdrywall.com | None | **Accepted** |
| lisa@hshcontractor.com | None | **Accepted** |
| tess@kibbeconsulting.com | None | **Accepted** |
| tate@hshdrywall.com | None | None — never had QB admin |

---

## Section 4 — `usePermissions` Shape (Implemented)

- **Inputs:** `AuthContext.profile` (`roles[]`, `is_meeting_operator`, `can_admin_qb`, legacy `role`).
- **Owner short-circuit:** `roles.includes('owner')` → all capability flags treated as true.
- **Compatibility outputs preserved:** `isAdmin`, `isEditor`, `isViewer`, `canCreate`, `canEdit`, `canDelete`, `canManageUsers`, `canInviteUsers`.
- **New helpers:** `effectiveRole`, `canAccessWorkspace`, `canWriteWorkspace`, `canAccessQuickBooksAdmin`, `canManageMeetingPrompts`, `flags`.

---

## Section 5 — Workspace / Nav Visibility Matrix

Unchanged from Phase 2a — enforced in `src/lib/rbac.ts`, `WorkspaceSwitcher.tsx`, `AppSidebar.tsx`.

| Workspace | owner | office_gc | office_drywall | field_gc | field_drywall | viewer |
|---|---|---|---|---|---|---|
| Projects | A | W | R | H | H | R |
| Deals | A | W | H | H | H | R |
| Tenants | A | W | H | H | H | R |
| Meetings | A | W | R | H | H | R |
| Schedule | A | W | M | R | R | R |
| HR | (future) | | | | | |
| Drywall | (future) | | | | | |

QuickBooks nav/route: `can_admin_qb` OR owner short-circuit.

---

## Section 6 — Phase 2b Files Changed

| File | Change |
|---|---|
| `docs/RBAC_PHASE2_MAPPING.md` | Locked decisions + execution status |
| `src/lib/rbac.ts` | **New** — matrix, role derivation, capability flags, settings nav rules |
| `src/contexts/AuthContext.tsx` | Profile fetch; expose `profile`, `roles`, `isMeetingOperator`, `canAdminQb` |
| `src/hooks/usePermissions.ts` | Full RBAC consumer + owner short-circuit |
| `src/routes/RequirePermission.tsx` | **New** — route guards with workspace fallback redirect |
| `src/components/WorkspaceSwitcher.tsx` | Filter workspaces by role |
| `src/components/AppSidebar.tsx` | Filter nav/settings/QB/meeting manage; primary CTAs |
| `src/routes/index.tsx` | Wrap routes with guards |
| `src/components/meeting/MeetingAdmin.tsx` | `canManageMeetingPrompts` |
| `src/components/meeting/MeetingView.tsx` | `canManageMeetingPrompts` |
| `src/services/feedbackService.ts` | `isFeedbackOwner` |
| `src/components/ContactDirectory.tsx` | `canManageUsers` |
| `src/components/MyFeedback.tsx` | `isAdmin` from hook |
| `src/components/ProjectsDashboard.tsx` | Gate QB pending banner |
| `src/hooks/useActiveWorkspace.ts` | Export `WORKSPACE_HOME` for guard redirects |

---

## Section 7 — Locked Decisions (formerly open questions)

All Phase 2a open questions are resolved — see **Locked Decisions** at top. No remaining blockers for Phase 3 RLS work.
