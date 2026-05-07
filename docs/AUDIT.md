# HSH GC Platform — Full Codebase Audit

**Date:** 2026-04-22 (snapshot — see CHANGELOG below for drift)
**Stack:** React 19 + Vite 7 + TypeScript + Supabase (Postgres + RLS + Edge Functions) + Vercel + PWA
**Scope:** 50+ components, 36 services, 24 type modules, 63 migrations, 15 edge functions, ~40K LOC app code
**Overall production readiness:** ~65%. Phase 1 core (estimating, actuals, multi-user, reports) is live and working. Phase 2 (deal workspace, proforma, tenant pipeline, QR) is 50–80% complete with multiple half-wired features. Phase 3 (intelligence, notifications, backup restore) is not implemented.

> **How to use this doc with Cursor:** Point Cursor at this file and ask it to work through Part 4 by phase, or cherry-pick numbered items (e.g. "Fix C6 and C7 from docs/AUDIT.md"). Every item references concrete file paths and line numbers.

---

## CHANGELOG / STATUS UPDATES

The body of this doc is a 2026-04-22 snapshot. Items below have changed since. Always cross-check against `git log` and the actual code — body text is **not** rewritten as items close.

### 2026-05-07 — Comprehensive re-audit (Part 2 C/H/M items)

The original audit body is significantly outpaced by recent commits. This entry replaces piecemeal status updates with a full re-verification of every Critical, High, and Medium item in Part 2 against the current codebase. Low items (L1-L10) and Parts 1/3/4 are out of scope here — they're aggregate hygiene or subjective scoring.

**Code changes that landed alongside this re-audit**:
- `'default-org'` literal references retired from `tradeCategoryService.ts:38` and `sowService.ts` (4 spots) — closes C13 in code; the column-type conversion to uuid in A5-e migration was the schema half.
- `MigratePlans.tsx`, `DataMigration.tsx`, `ProjectActuals.tsx.backup`, and the four Vite boilerplate files (`main.ts`, `counter.ts`, `style.css`, `typescript.svg`) were already gone — verified by direct filesystem check.
- All 17 edge functions verified ACTIVE on prod via `supabase functions list` against `rvtdavpsvrhbktbxquzm`.

#### Status table — all C/H/M items

| ID | Status | Evidence | Recommendation |
|---|---|---|---|
| C1 | OPEN | `.env` still committed; no rotation evidence in commits | Phase A dedicated session — large |
| C2 | DONE | All 17 functions ACTIVE on prod | — |
| C3 | OPEN | `quickbooksService.ts:13` sandbox URL hardcoded (frontend); edge functions correctly env-switch via `_shared/qb.ts:10` | Frontend QB calls now go through edge functions — small (delete or env-switch) |
| C4 | DONE | `_shared/qb.ts:24` `getValidQbToken()` refreshes via QB_TOKEN_ENDPOINT with 5-min buffer; all qb-* edge functions use it | — |
| C5 | UNKNOWN | Migration `006_create_quote_documents_bucket.sql` exists but bucket runtime state requires Supabase Dashboard verification | Verify bucket on prod; small once verified |
| C6 | DONE | `MigratePlans.tsx` + `DataMigration.tsx` deleted | — |
| C7 | DONE | `ProjectForms.tsx:100-134` complete with `requireUserOrgId()` | — |
| C8 | DONE | `EstimateTemplateEditor.tsx:191-251` merges via `setTrades((prev) => [...prev, ...newTrades])` at line 248 | — |
| C9 | DONE | `TenantPipeline.tsx:465-497` handler wired to button at :637; route nav at `routes/index.tsx:582` | — |
| C10 | OPEN | `convertDealToProjects` defined `dealService.ts:385`, no callsite in components — only grep hit is the definition | Wire UI button — medium |
| C11 | OPEN | `actualsHybridService.ts:46` falls back to localStorage on Supabase failure with only `console.warn`; no offline→online sync queue exists | Build sync queue — large |
| C12 | DONE | `ProjectForms.tsx:103,107` uses `requireUserOrgId()`, not `'default-org'` | — |
| C13 | DONE | A5-e migration converted org_id to uuid; all live literal references retired from src/services/ this session | — |
| H1 | WRONG-FRAMING | `duplicateProject` (`projectService.ts:319`) is sync localStorage-only; not async, so "not awaited" is moot. Real issue: localStorage-only function used in DB-backed flows — won't persist for online users | Promote to `_Hybrid` — medium |
| H2 | OPEN | `ProjectDetailView.tsx:352` still uses `window.location.reload()` after edit save | Replace with state refetch — small |
| H3 | OPEN | `CreateProjectForm.tsx:144-156` renovation sqft calc'd inside setState; `onCreate` runs synchronously before commit | Move calc out of setState — small |
| H4 | OPEN | `SelectionSchedules.tsx:611` GripVertical with no draggable/onDragStart/onDrop handlers | Wire dnd or remove icon — small if remove, medium if wire |
| H5 | OPEN | `PlanEditor.tsx:160-185` calls `addPlanDocument` without size/type checks | Add 20MB cap + mime allowlist — small |
| H6 | PARTIAL | `ScheduleBuilder.tsx:124` uses fixed `duration = 5` (mitigated 0-day case), but no per-trade heuristic or user-editable | Editable default — small |
| H7 | OPEN | `DealWorkspace.tsx:556-560` two-way sync exists via `applyGeneralDevLtcDebtSyncAfterMerge`, but desync structurally possible since both stored separately | Single source of truth — medium |
| H8 | OPEN | `DealWorkspace.tsx:1373` `expandedPhaseRowId` is local `useState`, not persisted to `customStacks` | Persist — small |
| H9 | OPEN | No `isDirty`/`unsavedChanges` flag in DealWorkspace | Add nav guard — medium |
| H10 | OPEN | `ProFormaGenerator.tsx:3647,3653,3668` mode toggles call `setProFormaMode` directly, no confirm dialog | Add AlertDialog — small |
| H11 | OPEN | `VendorQuotePortal.tsx:65-69` expiry checked on load only; `handleSubmit:110-154` does no expiry recheck | Re-check on submit — small |
| H12 | WRONG-FRAMING | URL token now extracted via `useParams` (`VendorQuotePortal.tsx:27`); regex framing obsolete | — |
| H13 | PARTIAL | `VendorQuotePortal.tsx:136` sets `totalAmount: calculateTotal()` from line items (correct path), but no validation on vendor-edited total | Hardening — small |
| H14 | PARTIAL | `QuickBooksImport.tsx:340-344` tries qbProjectId first, then case-insensitive name fallback — collisions still possible | Explicit linker UI — medium |
| H15 | OPEN | `quickbooksService.ts:73,90,127` still uses sessionStorage for OAuth state | Move to DB-backed/cookie — small |
| H16 | DONE | `issuePOInDB` defined `supabaseService.ts:2529`, called from `PurchaseOrdersView.tsx:69` | — |
| H17 | OPEN | No `source_trade_id` column anywhere except the audit doc itself | Add FK migration — medium |
| H18 | OPEN | `ChangeOrders.tsx:443-444` has approved/rejected statuses but no rollup into project totals/variance | Wire into variance — medium |
| H19 | OPEN | `actualsHybridService.ts:46,67,80` silent `console.warn` fallbacks, no toast/UI surface | Surface to user — small |
| H20 | OPEN | `backupService.ts:415-422` still throws "Restore functionality coming soon" | Implement — large |
| H21 | OPEN | `AuthContext.tsx:94-98` profile insert awaited but no error check; race with DB trigger possible | Add error handling + retry — small |
| H22 | OPEN | `AuthContext.tsx:31-71` `needsNewPassword` cleared only via explicit `clearRecoveryMode()`. Trap if user navigates away mid-flow | Add timeout/escape — small |
| H23 | OPEN | `VarianceReport.tsx:344` still `const tradeActual = 0 // TODO` | Load actuals per trade — medium |
| H24 | OPEN | `usePermissions.ts:33` offline mode still grants `role: 'admin'` | Match online defaults — small |
| H25 | OPEN | All 6 empty `catch (_) {}` still in `selectionBookService.ts:560,568,604,810,818,855`; `selectionScheduleService.ts:63` empty | Add logging — small |
| H26 | DONE | `20260427_a5c2_c9_c10_meta_infra.sql:30-104` enables RLS + policies for `project_events`, `work_packages`, `org_team` | — |
| M1 | OPEN | `ProjectDetailView.tsx` still has 2-3 console statements; majority cleared elsewhere | Remove — small |
| M2 | DONE | `.backup` removed from `src/components/` | — |
| M3 | DONE | `ProjectActuals.tsx:34-35` imports + `:706` UI calls reassign fns | — |
| M4 | UNKNOWN | Forms count loaded once at `ProjectDetailView.tsx:286-299`; original `:138` line shifted | Likely DONE — verify |
| M5 | OPEN | `TradeCategoryIcon` still has zero importers in src/ | Wire into headers — small |
| M6 | OPEN | `types/itemTemplate.ts:37-38,61-62` both subcontractor fields still present | Pick one — small |
| M7 | OPEN | `PlanLibrary.tsx` no pagination/loadMore | Add pagination — small |
| M8 | PARTIAL | `SelectionBook.tsx:1296-1311` categoryOrder array maintained; visual reorder application unverified | Verify rendering uses order — small |
| M9 | OPEN | No PDF export in `SelectionSchedules.tsx` | Add jspdf export — medium |
| M10 | WRONG-FRAMING | `selectedDealId`, `costSummaryMoneyDraft`, `investorTermsPercentDraft` still defined and actively used | — |
| M11 | OPEN | `(window as any).refreshMyFeedback` still exists — moved to `MyFeedback.tsx:118-120` and `routes/index.tsx:606-607` (audit's App.tsx:766 line is stale) | Lift state — small |
| M12 | OPEN | `ContactDirectory.tsx` no CSV import; no email regex validation | Add — small |
| M13 | WRONG-FRAMING | `PROSPECTS` const only used as offline-mode demo data | — |
| M14 | WRONG-FRAMING | `FeedbackForm.tsx:80-89` getTypeIcon has working default branch (MessageSquare) for general-feedback | — |
| M15 | UNKNOWN | Migration 028 enables RLS; org isolation policies need DB inspection | Verify policies — small |
| M16 | OPEN | `quoteService.ts:268,287` defines viewed transition, but no formal status-transition guard | Add state machine — small |
| M17 | OPEN | `dealReadiness.ts:383` still uses `Math.abs(phaseUnits - totalU) <= 1` absolute tolerance | Switch to percentage — small |
| M18 | OPEN | `dealReadiness.ts:39-48` allows ltc=0 + debt=0 with no equity check | Add equity-source check — small |
| M19 | OPEN | No plan-option-cost-rollup wiring between PlanEditor and estimate roll-up | Build rollup — medium |
| M20 | OPEN | SOW stored as text in quote; no FK/version | Add FK — medium |
| M21 | OPEN | `lastSyncedTotalRef` tracks contract value but no UI badge for last-synced | Add UI badge — small |
| M22 | DONE | RLS helpers defined in 5 migrations | — |

#### Counts

- **Critical**: 7 DONE, 5 OPEN, 1 UNKNOWN (C5)
- **High**: 2 DONE, 19 OPEN, 3 PARTIAL (H6, H13, H14), 2 WRONG-FRAMING (H1, H12)
- **Medium**: 3 DONE, 11 OPEN, 1 PARTIAL (M8), 3 WRONG-FRAMING (M10, M13, M14), 2 UNKNOWN (M4, M15)

#### Top 5 V1 hit-list (impact × effort)

1. **C1** — Secrets rotation. Non-negotiable for launch. Large effort, dedicated session.
2. **C10** — Wire `convertDealToProjects()`. Function exists; medium UI work; unblocks deal→project flow.
3. **H10** — ProFormaGenerator mode-switch silently nukes data. Tiny fix (AlertDialog), high data-loss prevention value.
4. **H11 + H13** — Vendor portal expiry-on-submit + total validation. Both tiny, both prevent bad-quote intake.
5. **H4** — SelectionSchedules: either wire drag-drop or remove icon. Tiny "remove" path closes false affordance immediately.

#### Patterns

- **All QB-back-half is fixed** by `_shared/qb.ts` token refresh. C4 done; C3 (sandbox URL on frontend) is mostly inert since calls go through edge functions.
- **DealWorkspace state issues (H7-H10) all remain** — real but mostly small individual fixes; the system is stable.
- **Several "never called" / "orphaned" claims were wrong**: `incrementSOWTemplateUseCount` IS called (`QuoteRequestForm.tsx:317`); `selectedDealId` and Draft state vars (M10) are actively used; `getTypeIcon` (M14) has a working default branch. Audit had pattern-matched stale code.
- **All `'default-org'` literals are gone from live code** — only in comments now. C12/C13/M22 cluster fully closed by A5-d/A5-e plus this session.

#### Issues the audit missed (surfaced during re-audit)

- `MyFeedback.tsx:118` still has `(window as any).refreshMyFeedback` — audit pointed at App.tsx:766 (refactored), but the global hack just moved.
- `backupService.ts:89-91` `orgFilter` falls through to UNFILTERED select when `organizationId` is null — post-A5-e profiles can be null for invite-first users, creating a real cross-org backup leak. Should be promoted to a Critical item.
- `usePermissions.ts:32` offline org_id is the literal string `'offline'` — could theoretically pass any UUID coercion path. Worth a defensive look.
- `qb-suggest-allocation` edge function deployed and ACTIVE on prod since 2026-02-27, never updated since. Other QB functions all updated 2026-05-06. Either dead code or quietly working — investigate.

#### Major scope shifts since the audit (not in C/H/M items)

- **Toast sweep underway** (Part 3 #37 / Phase E): ~30 of 176 `alert()` calls converted to `sonner` (commits 5a4527b, fe7eb9a). Substantial progress.
- **Deal Workspace progress** (Phase C): nav restructured, light-mode color sweep, new `/deals` dashboard, ProForma chrome polish. Audit's 78% complete number is stale — closer to 85% on UX, though C10 still open.
- **Tenant pipeline** committed (was uncommitted in audit). Sample prospects are offline-only (M13 reclassified).
- **Schedule module redesign**: `docs/SCHEDULE_TARGET_MODEL.md` dropped 2026-05-05. Pre-build artifact.
- **New module: meeting workflow** shipped 2026-05-06 (org-internal tool, outside audit scope).

#### Realistic V1 estimate

Phase A is now ~1 day of secrets work, not 1 week. Phase B is 60-70% closed. Phase C is partly closed. The 6-8 week V1 estimate is closer to **3-5 weeks** at current pace, dominated by C1 (secrets), C10 (deal→project wiring), C11 (offline sync), H20 (backup restore), the DealWorkspace cluster, and the V1 polish items. Several "small" items can be batched into single sessions (H2/H3/H4/H10/H11 are all small, all in different files — natural to bundle).

#### Post-re-audit closures

After the re-audit table above, the following items closed in subsequent commits. Table is left as the snapshot; this list tracks drift since.

- **2026-05-07, commit `0483d8c`** — Small-fix bundle:
  - **H2** ✓ ProjectDetailView no longer reloads on edit save. Added `onProjectUpdated` callback; route uses `setProject` from `useProjectContext()`.
  - **H3** ✓ CreateProjectForm renovation sqft no longer races setState. Computes via local `finalFormData` var, passes to `onCreate` directly.
  - **H4** ✓ SelectionSchedules GripVertical icon removed. Real dnd deferred until needed.
  - **H10** ✓ ProFormaGenerator mode-switch confirms before changing. Dialog-based confirm via `pendingProFormaMode` state + `requestModeChange` helper.
  - **H11** ✓ VendorQuotePortal re-checks expiry in `handleSubmit`, not just on load.
  - **M11** ✓ `(window as any).refreshMyFeedback` replaced with module-scoped event bus at `src/lib/feedbackEventBus.ts`.

---

## PART 1 — COMPLETE FEATURE MAP

### A. Authentication & Access Control

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| Email/password auth (`AuthContext.tsx`, `auth/Login.tsx`, `Signup.tsx`) | Sign in, sign up, session persistence, auto-refresh | 95% | Solid. No OAuth, no 2FA. |
| Password reset (`ResetPassword.tsx`, `SetNewPassword.tsx`) | Recovery link + new password entry | 85% | `needsNewPassword` flag can trap user if flow aborts mid-reset (AuthContext.tsx:31-68). |
| AuthGate (`auth/AuthGate.tsx`) | Route guard | 100% | Works. Bypassed for `/vendor-quote`, `/quote`, `/privacy`, `/terms`. |
| Role system (`usePermissions.ts`) | admin / editor / viewer | 80% | Offline mode auto-grants admin — privilege mismatch between modes. |
| User invitation (`supabase/functions/invite-user`, `accept-invitation`) | Invite flow via edge function | 60% | Backend + RLS ready. **UI not built** (per ROLE_PERMISSIONS.md "coming soon"). Invites don't expire. |
| RLS policies (migrations 002, 008) | Org isolation | 75% | Policies depend on `get_user_organization()` / `user_can_edit()` helpers — verify they exist. `'default-org'` text fallback collides with UUID checks in several services. |

### B. Projects (Core)

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| ProjectsDashboard (`ProjectsDashboard.tsx`) | List, search, 6-way sort, 6-status filter, inline status edit, QB banner, mobile sheet | 95% | Briefly renders $0 before stats load. No retry on stat-fetch failure. |
| CreateProjectForm (`CreateProjectForm.tsx`) | Onboarding with plan selection, auto-spec population, plan options, renovation branch | 92% | Renovation sqft recalc stale (:142–154). Address fields HTML-only validation. |
| ProjectDetailView (`ProjectDetailView.tsx`) | Hub: edit modal, 9 section cards, gameplan/work-packages/milestones embedded | 85% | `window.location.reload()` on save (:227), duplicate not awaited (:254), forms-count useEffect duplicated (:112 & :138), 6 debug console.logs left in. |
| Project duplication | Copy project to new one | 70% | Not awaited → silent failure. |
| Project delete | Destructive delete | 100% | Works. |
| Project edit | Update name/address/specs/plan | 85% | Plan metadata doesn't always merge back; crude reload replaces state. |
| Milestones section (`ProjectMilestonesSection.tsx`) | Display milestone list | 90% | Read-only view only. |
| WorkPackages section (`WorkPackagesSection.tsx`) | CRUD for work packages | 85% | RESPONSIBLE_PARTY_OPTIONS defined but never rendered. Status field, no progress %. |

### C. Estimating

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| EstimateBuilder (`EstimateBuilder.tsx`, 2,892 LOC) | Tree: categories → trades → sub-items. Inline edit, markup, contingency, roll-up | 80% | 30 console.logs, 15 `as any`. Totals may be stale on edit. Import/export UI stubs incomplete. |
| Estimate template editor (`EstimateTemplateEditor.tsx`, 1,401 LOC) | Edit saved template, add from library | 70% | **"Add from Library" checkboxes don't actually merge selections into trades array** (critical). |
| Estimate template management (`EstimateTemplateManagement.tsx`) | List/manage templates | 85% | 10+ alerts as UX. |
| ImportEstimate (`ImportEstimate.tsx`) | Excel/CSV import via `excelParser.ts` | 75% | Parser exists; mapping edge cases per PHASE_1 doc. |
| calculationService.ts | Roll-up math | 85% | Recalc + margin logic duplicated in estimateService. |
| Item library (`ItemLibrary.tsx`, 1,094 LOC) | Browse/create templates, sub-items, rate sources | 85% | No bulk CSV import. Subcontractor rate vs cost ambiguity (types/itemTemplate.ts:37-38). |
| Historical rate lookup | Smart suggestions | 0% | `// TODO: Implement` — estimateService.ts:338. |
| Estimate template → project application | Apply template on create | 70% | `estimateTemplateId` passed but only partially wired in offline path. |

### D. Actuals & Variance

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| ProjectActuals (`ProjectActuals.tsx`, 3,666 LOC) | Labor/material/subcontractor entry, QB import, filter, print | 82% | 20 `as any`. Reassign-to-project code imported but **no UI** for it. `.backup` file exists — stale. |
| Labor entry | Crew, hours, rate, total | 100% | Works. |
| Material entry | Date, description, cost | 100% | Works. |
| Subcontractor entry | Vendor, cost, notes | 100% | Works. |
| actualsHybridService | Online/offline routing | 85% | Silent fallback on Supabase failure — user doesn't know why entry disappeared. |
| Offline→online sync | Push local entries to server | 0% | **No sync logic.** Offline entries stay local-only. |
| ChangeOrders (`ChangeOrders.tsx`) | CO CRUD tied to trades | 82% | Status field stored but no approval workflow. COs don't roll up into project totals/variance. |
| PrintableReport (`PrintableReport.tsx`) | 3-depth print (summary/category/full) | 85% | "Full" depth doesn't show sub-items. No page breaks for long reports. |
| VarianceReport (`VarianceReport.tsx`) | Category-level variance | 85% | No trade drill-down. `const tradeActual = 0 // TODO` at :344. |

### E. Scheduling

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| ScheduleBuilder (`ScheduleBuilder.tsx`, 927 LOC) | Calendar view, auto-generate from trades, status | 70% | **No drag-drop rescheduling.** Duration heuristic is hardcoded regex — fails for custom trade names (defaults to 0 days). No critical path, no export (.ics/.mpp). |
| Calendar utils (`scheduleCalendarUtils.ts`) | Week-span math, date parsing | 95% | **Only file with real unit tests.** Excellent coverage. |
| Schedule migrations (052) | start/end dates | 100% | Applied. |

### F. Selections

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| SelectionBook (`SelectionBook.tsx`, 2,454 LOC) | Rooms, selections, images, spec sheets, 11 room types | 85% | No read-only client share view. No bulk import from vendor catalogs. Multiple `} catch (_) {}` silent swallows (:560,568,604,810,818,855). |
| SelectionSchedules (`SelectionSchedules.tsx`, 1,183 LOC) | 11 schedule types, editor + client preview, versioning | 80% | **Drag-drop non-functional** — `GripVertical` icon shown, zero drag handlers. No PDF export button. No row duplication. Image delete path unvalidated. |
| Selection schedule versions (migration 060) | Draft + published | 100% | Schema solid. |
| Spec sheets (migration 025) | PDF uploads per room | 85% | No preview, just links. |

### G. Plans & Templates

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| PlanLibrary (`PlanLibrary.tsx`) | Browse, search, stats | 80% | No pagination — slow at 100+ plans. |
| PlanEditor (`PlanEditor.tsx`, 777 LOC) | Spec entry, docs upload, options, template link | 75% | **No file size / type validation on upload.** Plan options don't roll up cost deltas into estimates. |
| planHybridService | localStorage ↔ Supabase | 90% | No conflict resolution; no sync indicator. |
| MigratePlans (`MigratePlans.tsx`) | Migrate localStorage plans → Supabase | 20% | **DEAD: imports non-existent `../scripts/migratePlansToSupabase`. Runtime crash on mount.** |
| Trade categories (`TradeCategoriesManagement.tsx`, `TradeCategoryIcon.tsx`) | System + custom categories with icons | 70% | `TradeCategoryIcon.tsx` component **never imported anywhere**. Icons stored in DB, never rendered. |

### H. Deal Workspace & Underwriting

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| DealWorkspace (`DealWorkspace.tsx`, 4,675 LOC) | Multi-stage deal: coaching → scenario → proforma, readiness engine, memo, chat, activity log, tabs | 80% | **25 `as any`**, ~40 state vars, no `isDirty` flag → lost work on nav. `loanToCostPercent` and `debtService.loanAmount` can desync (:557-558). `expandedPhaseRowId` not persisted. |
| `convertDealToProjects()` | Promote deal to projects | 0% wired | Function exists in dealService, **never called from UI**. |
| Deal coach chat (edge function `deal-coach-chat`) | AI chat on deal | Unknown | Function exists; deployment not verified. |
| Deal activity events (migration 062) | Event log | 85% | `clearDealActivityEvents()` called without error check. |
| DealDocuments (`DealDocuments.tsx`) | Upload, tag, share by email | 90% | Share-link expiry mentioned but not enforced. |
| send-deal-document-share edge function | Email share link | Unknown | Deployment state not verified. |
| ProFormaGenerator (`ProFormaGenerator.tsx`, 5,116 LOC) | 3 modes: general-dev, rental-hold, for-sale-phased-LOC | 85% | Silent fallback localStorage↔Supabase — no sync status shown. Mode switching clears fields with no confirmation → silent data loss. |
| dealReadiness (`lib/dealReadiness.ts`) | Scoring engine | 85% | Unit tolerance hardcoded ±1 (should be percentage). Exit cap / refi LTV rules poorly surfaced in UI. |
| forSalePhaseAllocation (`lib/forSalePhaseAllocation.ts`) | TIF allocation across phases | 80% | Phase selections not persisted to `customStacks` — lost on reload. |
| proformaService.ts (1,886 LOC) | Calculation engine | 85% | Complex, stateless. 4 `@deprecated` fields retained for compatibility. |
| proformaExportService.ts (1,081 LOC) | PDF/export | 85% | 13 `as any`. |
| Deal proforma versions (migrations 058, 059) | Versioned proformas | 100% | Schema done. |

### I. Tenant Pipeline (NEW, uncommitted)

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| TenantPipeline (`TenantPipeline.tsx`, 967 LOC) | Kanban with 7 leasing stages | 95% | Solid MVP. Service layer clean. |
| "Push to Deal Workspace" button | Convert prospect → deal | 0% | **Button rendered, no onClick** (:554–558). |
| Hardcoded sample prospects | Demo data array | — | 5 sample prospects in array (:114–190) — remove before commit. |
| Search/filter | — | 0% | Only development dropdown. |
| Migration 063_create_tenant_pipeline_prospects | Schema + RLS | 100% | Applied. |

### J. Gameplan & Playbooks

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| GameplanBoard (`GameplanBoard.tsx`) | Phase/play readiness checklist | 85% | Template mode works. |
| PlaybookManager / DefaultPlaybookManager | Manage org + default templates | 70% | Admin-only. No conflict resolution when both edit. |
| Gameplan migrations (034–036) | Plays + playbook schema | 100% | Applied. |

### K. Contact & Partner Directory

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| ContactDirectory (`ContactDirectory.tsx`, 1,736 LOC) | Developers, lenders, municipalities, contacts | 75% | No CSV bulk import. No email-format validation. Auto-add contact on profile insert (migration 033). |
| partnerDirectoryService | Partner CRUD | 80% | Works. |

### L. Quote Request / Vendor Portal

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| QuoteRequestForm (`QuoteRequestForm.tsx`) | Create RFQ: vendors, SOW, attachments | 80% | Attachment URL construction incomplete → links may 404. |
| QuoteReviewDashboard (`QuoteReviewDashboard.tsx`, 1,155 LOC) | GC reviews incoming quotes | 75% | 16 console.logs. No side-by-side comparison. No acceptance → actuals link. |
| VendorQuotePortal (`VendorQuotePortal.tsx`) | Token-based portal (no auth) | 80% | Expired check only on load, not submit. totalAmount not validated against sum(lineItems). |
| send-quote-email edge function | Email RFQ to vendor | Unknown deploy state | DEPLOY_EMAIL_FUNCTION.md implies manual deploy. |
| Quote documents bucket (migration 017) | Storage bucket | 60% | **Bucket + RLS must be created via Supabase Dashboard.** Multiple troubleshooting docs (DIAGNOSE_QUOTE_ATTACHMENTS_404, CREATE_QUOTE_DOCUMENTS_BUCKET, FIX_QUOTE_DELETE_AND_UPLOAD, TROUBLESHOOT_QUOTE_ATTACHMENTS_BUCKET) suggest recurring failures. |

### M. Purchase Orders

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| PurchaseOrdersView (`PurchaseOrdersView.tsx`) | List, issue, download | 60% | `issuePOInDB()` referenced but implementation not confirmed. |
| CreatePOModal (`CreatePOModal.tsx`) | Select estimate lines → PO | 70% | No `source_trade_id` FK back to estimate — edit estimate and PO orphans. |
| poPdfService.ts | PDF generation | 80% | Works. PDFs become stale when PO edited. |
| PO workflow | draft → issued → received → paid | 30% | Only draft/issued states. No invoice matching. No CO on PO. |

### N. Forms & Documents

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| ProjectForms (`ProjectForms.tsx`, 1,930 LOC) | Display/edit/sign-off forms | 65% | **`createNewForm()` truncated/incomplete** — creation broken. `organization_id: 'default-org'` TODO (:103). 15 console.logs. |
| ProjectDocuments (`ProjectDocuments.tsx`) | Upload/download/delete/edit metadata | 85% | Works. Storage bucket RLS unclear. |
| Form templates | Reusable schemas | 0% | Not built. |
| Form versioning | Track schema evolution | 0% | Not built. |

### O. SOW (Scope of Work)

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| SOWManagement (`SOWManagement.tsx`) | Create/edit templates by trade | 75% | Works. |
| sowService.ts | CRUD + use-count | 80% | Org-UUID check fails for 'default-org' (:38-42) → cross-org template leak. `incrementSOWTemplateUseCount` never called. RPC `increment_use_count` missing in migrations (fallback present). |
| SOW ↔ Quote linkage | FK + version tracking | 0% | Stored as text; no version control. |

### P. Feedback

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| FeedbackForm (`FeedbackForm.tsx`) | Submit bug/feature/general | 85% | `general-feedback` icon missing in `getTypeIcon()`. |
| FeedbackManagement (`FeedbackManagement.tsx`) | Admin triage | 70% | No status state machine. |
| MyFeedback (`MyFeedback.tsx`) | User's own list | 85% | `(window as any).refreshMyFeedback` hack for refresh (App.tsx:766). |
| send-feedback-email edge function | Notify team | Unknown deploy state | DEPLOY_FEEDBACK_EMAIL_FUNCTION.md ⇒ manual deploy. |
| Migration 028 | Feedback schema | 100% | Applied. RLS may not isolate orgs (needs verify). |

### Q. QuickBooks Integration

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| QuickBooksConnect (`QuickBooksConnect.tsx`) | Connect/disconnect + status | 85% | Works. |
| QuickBooksImport (`QuickBooksImport.tsx`, 1,260 LOC) | Pending txs, reconcile, labor tabs | 75% | 14 console.logs. Account ID regex fragile (:681-687). Project matching collides on similar names. |
| QuickBooksCallback (`QuickBooksCallback.tsx`) | OAuth redirect | 80% | Route `/qb-callback` wired in App.tsx. |
| quickbooksService.ts | OAuth + token + Check creation | 70% | **Sandbox URL hardcoded** (`QB_API_BASE`). **No automatic token refresh** — breaks after 1h. CSRF state in sessionStorage — fails across tabs. |
| 9 qb-* edge functions | All QB operations | Unknown | No `DEPLOY_QB_FUNCTIONS.md` — deployment state undetermined; if undeployed, all QB features fail. |
| Two-way sync | QB changes pull back | 0% | Not implemented. |
| QB ↔ Project linking UI | Link app project to QB Job | 50% | Partial matching in reconcile, no explicit linker. |
| Check tracking | QB Check IDs on entries | 0% | Missing. Entries don't store QB Check reference. |

### R. Data Migration / Backup

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| backupService.ts (`backupAllData`) | Export all data to JSON | 70% | `isValidUUID()` rejects `'default-org'` — may skip org filter → cross-org data in backup. |
| backupVerification.ts | Integrity check | 80% | Not integrated into export flow. |
| Restore from backup | Import JSON → DB | 0% | `// TODO: Implement restore logic` — backupService.ts:415. |
| DataMigration (`DataMigration.tsx`) | localStorage → Supabase migration | 60% | Truncated implementation. References broken MigratePlans import. |

### S. Legal / Public Pages

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| PrivacyPolicy (`PrivacyPolicy.tsx`) | Public page | 100% | Routed. |
| TermsOfUse (`TermsOfUse.tsx`) | Public EULA | 100% | Routed. |

### T. Infrastructure & Build

| Feature | What it does | % Complete | Notes |
|---|---|---|---|
| Vite build | Prod build | 100% | Works. |
| Vercel deploy | Auto-deploy from git | 100% | Works. |
| PWA / Service Worker (`vite-plugin-pwa`) | Offline caching | 75% | Known 404 cache-hash issue (FIX_SERVICE_WORKER_404.md). Fixes applied, users see transient errors after deploy. |
| Env configuration | `.env` + Vite loader | 70% | **`.env` with real secrets committed to git** — Supabase + QB secrets exposed. |
| TypeScript | Strict mode | 80% | `noUnusedLocals: false`, `noUnusedParameters: false` — dead code hides. |
| Test suite (vitest) | Unit + integration tests | 2% | **1 test file** (scheduleCalendarUtils.test.ts). Zero component or service tests. |
| `src/main.ts` + `counter.ts` + `style.css` + `typescript.svg` | Dead Vite boilerplate | 0% used | **Dead files** — delete. |
| `app/` subdirectory | 11 static schedule templates + layout | 0% integrated | **Orphaned.** Not in tsconfig, not in Vite build, not imported. Figma artifact. |
| `dist/` | Build output | — | Gitignored. Good. |
| UI library | Radix wrappers in `src/components/ui/` | 65% | 9 wrappers present. Missing: dropdown-menu, tabs, toast, checkbox (imported directly in components — inconsistent). |

---

## PART 2 — BUGS & ISSUES

### CRITICAL (blocks workflows or security)

| # | Location | Issue |
|---|---|---|
| C1 | `.env` (repo root) | Real Supabase project ref (`rvtdavpsvrhbktbxquzm`), QB client ID, QB secret committed to git. **Rotate secrets, move to Vercel env, purge from history.** |
| C2 | `supabase/functions/send-quote-email`, `send-feedback-email`, all `qb-*` | Multiple DEPLOY_*.md docs imply functions **may not be deployed**. Core workflows silently fail. Verify deploy state. |
| C3 | `quickbooksService.ts:12` | Sandbox URL hardcoded (`sandbox-quickbooks.api.intuit.com`). Production data won't sync. |
| C4 | `quickbooksService.ts:165` + edge functions | **No token refresh** — QB breaks after 1 hour. |
| C5 | Quote-documents bucket (migration 017) | Bucket + RLS must be created manually in Supabase Dashboard — 4 troubleshooting docs exist. If not applied, vendors can't access attachments. |
| C6 | `MigratePlans.tsx:10` | Imports non-existent `../scripts/migratePlansToSupabase`. `DataMigration.tsx:10` references it → **runtime crash** on mount. |
| C7 | `ProjectForms.tsx` `createNewForm()` | Implementation truncated/incomplete — **"Create new form" button does nothing**. |
| C8 | `EstimateTemplateEditor.tsx` "Add from Library" | Checkboxes toggle state but **never merge selections into trades array** → feature silently fails. |
| C9 | `TenantPipeline.tsx:554-558` | "Push to Deal Workspace" button has **no onClick** — promotion flow broken. |
| C10 | `DealWorkspace.tsx` | `convertDealToProjects()` exists in service but **never wired into UI** — deals can't become projects. |
| C11 | Actuals offline → online | **No sync logic** — offline-created entries stay local forever. Lost work risk. |
| C12 | `ProjectForms.tsx:103` | `organization_id: 'default-org'` hardcoded TODO → all forms go to one org. |
| C13 | `sowService.ts:38-42` + `backupService.ts:82-86` | `'default-org'` text fails UUID validation → org filter skipped → cross-org data leak in backups and SOW templates. |

### HIGH (broken UX / data integrity)

| # | Location | Issue |
|---|---|---|
| H1 | `ProjectDetailView.tsx:254` | `duplicateProject()` not awaited — silent failure, alert fires either way. |
| H2 | `ProjectDetailView.tsx:227` | `window.location.reload()` after edit — loses state. |
| H3 | `CreateProjectForm.tsx:142-154` | Renovation sqft recalc in setState; `onCreate` sees stale data. |
| H4 | `SelectionSchedules.tsx:611-615` | GripVertical icon rendered, **no drag handlers** — non-functional UI. |
| H5 | `PlanEditor.tsx:169-217` | No file upload size/type validation → Supabase/localStorage quota hit silently. |
| H6 | `ScheduleBuilder.tsx:100-120` | Trade-name regex maps "Custom Foundation Work" → 0 days. |
| H7 | `DealWorkspace.tsx:557-558` | `loanToCostPercent` vs `debtService.loanAmount` can desync → wrong debt sizing. |
| H8 | `DealWorkspace.tsx` ~1368 | `expandedPhaseRowId` and incentive phase selections lost on save/reload. |
| H9 | `DealWorkspace.tsx` | No `isDirty` flag on 40+ state vars → lost work on nav. |
| H10 | `ProFormaGenerator.tsx:318` | Mode switch clears fields with no confirmation dialog. |
| H11 | `VendorQuotePortal.tsx:70-74` | Expiry only checked on load, not submit. |
| H12 | `VendorQuotePortal.tsx:26-31` | URL pattern `/\/(vendor-quote|quote)\/([^/]+)/` fragile; link generation may diverge. |
| H13 | `VendorQuotePortal` / `quoteService.ts` | `totalAmount` not validated vs `sum(lineItems)`. |
| H14 | `QuickBooksImport.tsx:498-535` | Project matching by case-insensitive name → collisions on similar names. |
| H15 | `quickbooksService.ts:72` | OAuth state in sessionStorage → new-tab callback breaks. |
| H16 | `PurchaseOrdersView.tsx` | `issuePOInDB()` uncertain — PO issue may not persist. |
| H17 | `po_headers` (migration 047) | No `source_trade_id` FK → edit estimate, PO orphans. |
| H18 | `ChangeOrders.tsx` | Status field stored, no approval workflow; COs don't roll into totals/variance. |
| H19 | `actualsHybridService.ts:46` | Silent fallback on Supabase write failure → user doesn't know entry went local. |
| H20 | `backupService.ts:415` | Restore logic is a TODO — backup is one-way. |
| H21 | `AuthContext.tsx:94` | Signup profile-insert race — auth user may exist without profile → crash on next login. |
| H22 | `AuthContext.tsx:31-68` | `needsNewPassword` can trap user if reset aborted. |
| H23 | `VarianceReport.tsx:344` | `const tradeActual = 0 // TODO` — variance math skipped. |
| H24 | `usePermissions.ts:28-36` | Offline grants all roles admin → inconsistent with online. |
| H25 | 7 empty catch blocks | `catch (_) {}` in `selectionBookService.ts` (:560,568,604,810,818,855), `selectionScheduleService.ts:63`, QB function (:364) — silent swallowing. |
| H26 | `org_team`, `project_events`, `work_packages` | **Tables without RLS policies — org isolation not enforced at DB level.** Impact: any authenticated user can read/write all rows regardless of org. Track for dedicated post-A5 follow-up fix (do not bundle into current A5 cutover). |

### MEDIUM (polish / partial features)

| # | Location | Issue |
|---|---|---|
| M1 | `ProjectDetailView.tsx:80,82,205,222,237,244` | 6 debug `console.log` w/ emojis — remove. |
| M2 | `ProjectActuals.tsx.backup` | Stale backup committed. Delete. |
| M3 | `ProjectActuals.tsx` | `reassignMaterialEntryToProject_Hybrid` imported, **no UI** to trigger. |
| M4 | `ProjectDetailView.tsx:112 + :138` | Forms count loaded in two duplicate useEffects. |
| M5 | `TradeCategoryIcon.tsx` | Component exists, **never imported**. Icons stored, never rendered. |
| M6 | `types/itemTemplate.ts:37-38` | `defaultSubcontractorRate` vs `defaultSubcontractorCost` — both exist, unclear semantics. |
| M7 | `PlanLibrary.tsx` | No pagination — slow at >100 plans. |
| M8 | `SelectionBook.tsx` `customCategories.categoryOrder` | Stored, not applied — reorder doesn't persist visually. |
| M9 | `SelectionSchedules.tsx` | No print/PDF export — preview only. |
| M10 | `DealWorkspace.tsx` state vars | Multiple unused drafts (`costSummaryMoneyDraft`, `investorTermsPercentDraft`, `selectedDealId`) — refactor artifacts. |
| M11 | `App.tsx:766` | `(window as any).refreshMyFeedback` — globals hack. |
| M12 | `ContactDirectory.tsx` | No CSV bulk import; no email regex validation. |
| M13 | `TenantPipeline.tsx:114-190` | 5 hardcoded sample prospects — remove before commit. |
| M14 | `FeedbackForm.tsx` | `getTypeIcon()` missing `general-feedback` case. |
| M15 | Feedback RLS | No verification that policies isolate orgs. |
| M16 | Quote status transitions | `'sent' → 'viewed'` transition undefined in code. |
| M17 | `lib/dealReadiness.ts:379-384` | Unit tolerance ±1 absolute — for 5-unit projects = 20% error. |
| M18 | `lib/dealReadiness.ts:38-48` | `financeOkProjectLtc()` allows LTC=0 + debt=0 with no equity-source check. |
| M19 | `PlanEditor` | Plan options stored, cost deltas not rolled into estimates. |
| M20 | SOW → Quote | Scope stored as text; no FK; template updates don't propagate. |
| M21 | ProFormaGenerator LocalStorage sync | No "last synced" indicator. |
| M22 | RLS helper functions | `get_user_organization()`, `user_can_edit()` referenced but not defined in migrations — verify. |

### LOW (hygiene / style)

| # | Category | Issue |
|---|---|---|
| L1 | console statements | 147 files, ~200+ calls. EstimateBuilder.tsx alone has 30. |
| L2 | `alert()` usage | 176 occurrences — UX anti-pattern; replace with toasts. |
| L3 | `as any` casts | **355 total**, concentrated in DealWorkspace (25), ProjectActuals (20), supabaseService (18), laborImportService (16), EstimateBuilder (15). |
| L4 | Large files (>1K LOC) | 16 files: ProFormaGenerator (5,116), supabaseService (4,833), DealWorkspace (4,675), ProjectActuals (3,666), EstimateBuilder (2,892), SelectionBook (2,454), ProjectForms (1,930), proformaService (1,886), ContactDirectory (1,736), ProjectDetailView (1,418), EstimateTemplateEditor (1,401), QuickBooksImport (1,260), SelectionSchedules (1,183), QuoteReviewDashboard (1,155), ItemLibrary (1,094), proformaExportService (1,081). |
| L5 | Inline styles | 255 occurrences — mostly dynamic, ~55 static could use Tailwind. |
| L6 | Boilerplate files | `src/main.ts`, `counter.ts`, `style.css`, `typescript.svg` — Vite default, never imported. Delete. |
| L7 | Orphaned dirs/files | `app/` (unused), `docx_extract/`, `figmasrc.zip`, `HSH_GC_Workflow_Playbook.zip`, `styles/`, `clear-projects.html`, `debug_rls.sql`, `fix_rls_policies.sql`, `import_*.sql`, `item_templates_import.csv` — either relocate or delete. |
| L8 | Doc clutter | 42 root `*.md` files; many are stale workarounds (CLEAR_SERVICE_WORKER, DIAGNOSE_*, FIX_*, TROUBLESHOOT_*). Keep ~6, archive rest. |
| L9 | `tsconfig` | `noUnusedLocals: false`, `noUnusedParameters: false` — enable to catch dead code. |
| L10 | Tests | Effectively 0% coverage. |

---

## PART 3 — IMPROVEMENTS (non-bug)

### Architecture

1. **Decompose large components.** Target priorities:
   - ProFormaGenerator (5,116) → `<ProFormaBuilder/> <ProFormaCalculator/> <ProFormaDisplay/> <ProFormaExport/>`
   - supabaseService (4,833) → domain service modules (`projectSupa.ts`, `estimateSupa.ts`, etc.)
   - DealWorkspace (4,675) → custom hook `useProFormaState()` + tab-level sub-components
   - ProjectActuals (3,666) → split by entry type + reconciliation panel
   - SelectionBook (2,454) → `<SelectionBookList/> <SelectionRoomEditor/> <SelectionImageGallery/>`
2. **Typed `deepMerge`** helper to replace most `as any` in DealWorkspace.
3. **Error boundary at route level** — currently crashes propagate to white screen.
4. **Optimistic-update pattern** in DealWorkspace / ProFormaGenerator to avoid freezes.
5. **Normalize `organization_id`** — commit to UUID or to free-text, but not both.
6. **Toast system** — install `@radix-ui/react-toast` wrapper; replace all 176 `alert()` calls.
7. **Router** (react-router-dom) — replace manual URL parsing + `window.location.href` fallbacks (9 uses) with real route definitions.
8. **Centralize hybrid service error reporting** — surface Supabase failures to user instead of silent localStorage fallback.

### UX / Product

9. Loading skeletons on Dashboard, EstimateBuilder, VarianceReport, ProjectActuals.
10. Empty states everywhere (Actuals blank, PO blank, Docs blank).
11. "Unsaved changes" guard in DealWorkspace, ProFormaGenerator, EstimateBuilder.
12. Confirmation dialogs on mode-switch, destructive deletes.
13. Accessibility pass: ARIA roles, keyboard nav on dropdowns, focus management on modals.
14. Sync-status badge (online/offline/last-synced) across hybrid screens.
15. PDF export for SelectionSchedules (jspdf already installed).
16. Drag-drop: SelectionSchedules rows + ScheduleBuilder reschedule.
17. Bulk-import (CSV) for ContactDirectory, ItemLibrary, TenantPipeline.
18. Search/filter for TenantPipeline (at 50+ prospects).
19. TradeCategoryIcon rendered in SelectionSchedules and ScheduleBuilder headers.
20. Page breaks in PrintableReport for long reports.
21. Progress % slider on WorkPackagesSection.
22. Render deprecated proforma fields as read-only help text, not hidden.
23. Plan-option cost rollup → estimates.
24. CO approval workflow or hide status field.
25. Quote comparison side-by-side.
26. PO invoice-matching workflow.
27. Form template management UI.

### Observability

28. Replace `console.log` / `alert` with a telemetry + toast stack.
29. Add Sentry / Honeybadger for crash + error reporting.
30. QB import: persistent error log + retry button.
31. Edge function invocation wrapping (uniform error + retry).

### Testing

32. vitest unit tests for: `calculationService`, `dealReadiness`, `forSalePhaseAllocation`, `proformaService` math, `usePermissions`.
33. Supabase RLS integration tests (pgTAP or custom harness).
34. Component snapshot tests for critical flows (CreateProject, EstimateBuilder, DealWorkspace tabs).
35. E2E test for vendor quote portal (token flow).

### Cleanup

36. Delete: `src/main.ts`, `counter.ts`, `style.css`, `typescript.svg`, `ProjectActuals.tsx.backup`, `clear-projects.html`, `debug_rls.sql`, `fix_rls_policies.sql`, `import_*.sql`, `item_templates_import.csv`, `figmasrc.zip`, `HSH_GC_Workflow_Playbook.zip`, `docx_extract/`, `styles/` (if confirmed unused).
37. Resolve `app/` directory: delete or convert to print-export templates.
38. Archive 30+ stale root `.md` files to `/docs/archive/`.
39. Consolidate SQL seed scripts into `supabase/migrations/`.
40. `.gitignore` `.env`, purge from history, rotate all exposed secrets.
41. Enable `noUnusedLocals: true` in tsconfig.
42. Add missing UI wrappers: `dropdown-menu`, `tabs`, `toast`, `checkbox`.

---

## PART 4 — PRIORITIZED V1.0 ROADMAP

Ordering reflects: (a) security/data-loss first, (b) then hard-broken features, (c) then feature-gap closure, (d) then polish.

### Phase A — SECURITY & DATA SAFETY (Week 0, ~1 week)

Cannot ship without these.

1. **Rotate all secrets in `.env`.** Move to Vercel env vars. Purge `.env` from git history (`git filter-repo`). Supabase anon key, service key if any, QB client ID, QB secret.
2. **Verify edge-function deployment** for: `send-quote-email`, `send-feedback-email`, all 9 `qb-*`, `invite-user`, `accept-invitation`, `deal-coach-chat`, `send-deal-document-share`. Run `supabase functions list` against prod project. Deploy missing ones.
3. **Apply storage bucket RLS** via Supabase Dashboard for `quote-documents`, `project-documents`, `selection-images`, `deal-documents`. Document exact steps in one consolidated `docs/STORAGE_SETUP.md` (delete the 4 redundant troubleshooting docs).
4. **Verify RLS helpers exist**: `get_user_organization()`, `user_can_edit()`. If missing, write a migration.
5. **Fix `organization_id` normalization**. Pick UUID. Migrate any `'default-org'` strings. Remove UUID-fallback branches in `sowService`, `backupService`, `ProjectForms`.
6. **Delete `MigratePlans` broken import** (src/components/MigratePlans.tsx) or restore the missing script.
7. **Delete `ProjectActuals.tsx.backup`.**

### Phase B — BROKEN WORKFLOWS (Weeks 1-2)

Features currently shipped but non-functional.

8. Implement `ProjectForms.createNewForm()` — complete truncated logic; fix `'default-org'` hardcode.
9. Fix `EstimateTemplateEditor` "Add from Library" — merge selected items into trades array; persist.
10. `SelectionSchedules` drag-drop — wire handlers or remove `GripVertical` icon.
11. `ScheduleBuilder` duration heuristic — add default 7 days + user-editable.
12. QB token auto-refresh middleware inside edge functions.
13. QB production vs sandbox env-switch for `QB_API_BASE`.
14. QB OAuth state — move from sessionStorage to DB-backed (or signed cookie).
15. QB project linker UI — explicit app-project ↔ QB-job linkage, store `qb_job_id`, remove name-matching fallback.
16. `ProjectDetailView.duplicateProject()` — await, error toast, no reload.
17. `ProjectDetailView` — replace `window.location.reload()` with state refetch.
18. `CreateProjectForm` renovation sqft — move calc out of setState.
19. `PlanEditor` file upload validation (20 MB cap, mime type allowlist).
20. Actuals offline→online sync queue.
21. `VendorQuotePortal` expiry re-check on submit; `totalAmount` vs lineItems validation.
22. Apply Quote attachment URL construction (public URL generation).

### Phase C — DEAL WORKSPACE / PROFORMA CLOSURE (Weeks 2-3)

Recent heavy area — lots of partial state.

23. Wire `convertDealToProjects()` into DealWorkspace as "Promote to Project(s)" button.
24. Unify `loanToCostPercent` ↔ `debtService.loanAmount` into single source of truth (derive debt from LTC).
25. Persist `expandedPhaseRowId` + incentive phase selections to `input.customStacks`.
26. Add `isDirty` flag + unsaved-changes nav guard.
27. Mode-switch confirmation in ProFormaGenerator.
28. Fix `dealReadiness` unit tolerance → percentage-based (`max(1, ceil(totalU * 0.02))`).
29. Remove orphaned state vars (`selectedDealId`, `costSummaryMoneyDraft`, `investorTermsPercentDraft`).
30. `clearDealActivityEvents` — check response, surface errors.
31. Tenant pipeline: wire "Push to Deal Workspace" handler; remove hardcoded sample prospects; commit to git.

### Phase D — VARIANCE & INTELLIGENCE (Week 3-4)

Phase 2/3 commitments from PROJECT_PLAN.

32. Variance math: fix `VarianceReport.tsx:344` (`tradeActual = 0` TODO); load actuals.
33. Change Orders → roll into project totals + variance report.
34. Historical rate lookup (`estimateService.ts:338`) — small AI/statistical suggestion engine.
35. Backup restore — implement `backupService.ts:415` TODO.
36. User invitation UI (RLS + function ready; UI missing).

### Phase E — OPERATIONAL POLISH (Weeks 4-5)

37. Replace 176 `alert()` with Radix toast system.
38. PDF export for SelectionSchedules (jspdf).
39. SelectionSchedules row duplication; ScheduleBuilder drag-reschedule.
40. PO workflow: `received` + `paid` states; invoice matching; source_trade_id FK.
41. SOW → Quote FK + version linkage; wire `incrementSOWTemplateUseCount`.
42. Form template management; form schema versioning.
43. Feedback status state machine; verify RLS org isolation; general-feedback icon.
44. TradeCategoryIcon wired into SelectionSchedules + ScheduleBuilder; add color picker.
45. ContactDirectory CSV import + email validation.
46. Share validation utility (email regex) across TenantPipeline, ContactDirectory, DealDocuments.
47. Loading skeletons + empty states across dashboard, actuals, PO, docs.
48. Accessibility pass (ARIA, keyboard, focus).

### Phase F — ARCHITECTURE (Weeks 5-7)

49. Install react-router-dom; migrate manual URL parsing + 9 `window.location.href` fallbacks.
50. Error boundaries at route level.
51. Decompose top-5 largest files (ProFormaGenerator, supabaseService, DealWorkspace, ProjectActuals, EstimateBuilder).
52. Extract sync-status UI; unify hybrid service error reporting.
53. Type-safe `deepMerge` helper; reduce `as any` in DealWorkspace to <5.
54. Enable `noUnusedLocals: true`; sweep resulting warnings.
55. Add missing Radix UI wrappers (dropdown-menu, tabs, toast, checkbox); migrate direct imports.

### Phase G — TEST COVERAGE (Weeks 6-8, parallel)

56. vitest unit tests — `calculationService`, `dealReadiness`, `forSalePhaseAllocation`, `proformaService`, `scheduleCalendarUtils` (already done), `usePermissions`.
57. Supabase RLS test suite.
58. Component snapshot tests for critical flows.
59. Playwright E2E — vendor quote token flow, auth, create→estimate→actuals happy path.
60. CI pipeline running tests on PR.

### Phase H — CLEANUP (any time, ~1 day total)

61. Delete boilerplate: `main.ts`, `counter.ts`, `style.css`, `typescript.svg`.
62. Resolve `app/` dir: delete, or integrate as print templates.
63. Delete/move root artifacts: `figmasrc.zip`, `HSH_GC_Workflow_Playbook.zip`, `docx_extract/`, `styles/`, `clear-projects.html`, loose `.sql` / `.csv` files.
64. Archive 30+ stale root `*.md` → `/docs/archive/`. Keep only: README, GETTING_STARTED, PROJECT_PLAN, PHASE_2_ROADMAP, ROLE_PERMISSIONS, DEPLOY_TO_VERCEL.
65. Consolidate 4 QB deploy docs → one `docs/QB_DEPLOY.md`.
66. Consolidate 4 storage-bucket troubleshooting docs → one `docs/STORAGE_SETUP.md`.
67. Remove 6 debug `console.log` in `ProjectDetailView.tsx`.
68. Kill `(window as any).refreshMyFeedback` (App.tsx:766) — lift state or use event bus.

### Phase I — DEFERRED (post-V1.0)

- QR code system (3 planning docs, zero code).
- Schedule notifications (email/SMS on changes).
- Smart budget learning (AI).
- Two-factor auth, OAuth providers.
- Incremental / scheduled backups.
- QB webhooks (two-way sync).

---

## SCORECARD

| Domain | % Complete | Risk | Phase A | Phase B | Phase C | Phase D |
|---|---|---|---|---|---|---|
| Auth | 85% | Low | — | H21, H22 | — | User invite UI |
| Projects core | 90% | Low | — | H1–H3, M1, M4 | — | — |
| Estimating | 80% | Medium | — | C8 | — | L34 history |
| Actuals | 80% | Medium | — | C11, H19, H23 | — | CO rollup |
| Scheduling | 70% | Medium | — | H6 | — | drag-drop |
| Selections | 82% | Medium | — | H4, H5 | — | PDF export |
| Plans | 75% | Medium | C6 | H5 | — | option rollup |
| Deal workspace | 78% | High | — | — | C10, H7–H10 | — |
| Tenant pipeline | 95% (MVP) | Low | — | C9 | — | search |
| Proforma | 82% | Medium | — | — | H10 | — |
| Quote portal | 76% | High | C2, C5 | H11–H13 | — | comparison |
| PO | 55% | High | — | H16, H17 | — | invoice matching |
| Forms | 60% | High | C12 | C7 | — | templates |
| SOW | 72% | Medium | C13 | — | — | FK to quotes |
| Feedback | 75% | Low | C2 | — | — | status machine |
| QB integration | 68% | High | C2 | C3, C4, H14, H15 | — | webhooks |
| Docs/backup | 55% | Medium | — | H20 | — | restore, incremental |
| Infra/build | 80% | High (secrets) | C1 | — | — | tests, cleanup |

**Realistic v1.0 target:** ~6–8 weeks of focused work after Phase A ships (which is non-negotiable for launch). Phases A+B+C+H yield a stable, demo-ready 1.0; Phases D+E get to a polished product.
