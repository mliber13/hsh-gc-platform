# Review D — GC-side code (read-only, 2026-09-03)

Scope: top-level `src/components/*.tsx`, GC services (`supabaseService`, hybrid layer, deal/proforma/QB/backup/etc.), `components/{meeting,project,dashboard,quotes,photo}`, top-level `src/lib`. Prior docs read: `docs/AUDIT.md` (CHANGELOG), `FEATURE_CLEANUP.md`, `GC_WORKSPACE_LESSONS.md`, `VERSION_1_5_ROADMAP.md`. Only NEW or still-open items are reported. Owner input applied: **ACTIVE-CORE = estimating/budgets (EstimateBuilder, ItemLibrary, templates/import, ProjectActuals, change orders, POs) + project documents.** Cycle constraint: surface fixes only — structural refactors are analysed but marked DEFERRED.

Activity signal: 257 commits since 2026-05-15; **31** touched top-level GC components/services, and those were almost all cross-cutting (console strip, date helper, comms/push, one contacts bugfix). Top-level GC components = 49.7k LOC vs drywall+crew+hr+comms = 41.8k LOC.

---

## 1. Feature inventory + usage verdict

Last-commit dates are `git log -1` on the file; note that `2026-07-13` is the app-wide "strip console.logs" commit (`838df44`) and `2026-08-03` is the date-helper sweep — neither is a feature signal.

### ACTIVE-CORE (owner-confirmed)

| Feature | Files (LOC) | Last real change | Route / nav | Tables | Notes |
|---|---|---|---|---|---|
| Estimate builder | `EstimateBuilder.tsx` (2790) | 2026-05-19 (template names) | `/projects/:id/estimate`, sidebar | estimates, trades, sub_items | Healthy; N+1 sub-item fetch (see §3) |
| Item library / trade categories | `ItemLibrary.tsx` (1028), `TradeCategoriesManagement.tsx` (251) | 2026-08-03 (date sweep) | `/library/estimates` | item_templates, trade_categories | "Reset to defaults" is a no-op online (§3) |
| Estimate templates | `EstimateTemplateManagement.tsx` (351), `EstimateTemplateEditor.tsx` (1414) | 2026-05-08 | inside Item Library | estimate_templates | OK |
| **Estimate Excel import** | `ImportEstimate.tsx` (348), `importService.ts` (394), `utils/excelParser.ts` (266) | 2026-07-29 (P0-7 fix) | **NOT ROUTED — zero importers** | estimates | Owner thinks import is active; the only import UI reachable is "Apply Template". Confirm whether Excel import is actually used; if yes it is a wiring bug, if no it is dead code (§6). |
| Project actuals | `ProjectActuals.tsx` (3467), `actualsHybridService.ts` (499) | 2026-05-04 | `/projects/:id/actuals` | project_actuals, labor/material/subcontractor_entries | Also read by drywall (`drywallProjectCostService.ts:109-260`) — shared infra |
| **Change orders** | `ChangeOrders.tsx` (576) | 2026-04-30 | `/projects/:id/change-orders`, sidebar | **none** (localStorage only) | **BROKEN online — see §3 H1** |
| Purchase orders | `PurchaseOrdersView.tsx` (261), `CreatePOModal.tsx` (361), `poPdfService.ts` | 2026-04-30 | `/projects/:id/purchase-orders` | po_headers, po_lines | `source_trade_id` IS written (`supabaseService.ts:3075`) — audit H17 is closed. Only draft→issued. |
| QuickBooks import (GC) | `QuickBooksImport.tsx` (1272), `quickbooksService.ts` (428) | 2026-07-13 | mounted inside ProjectActuals; `/quickbooks/settings` | profiles (tokens), edge fns | H14 name-fallback still open (§3) |
| Project documents | `ProjectDocuments.tsx` (577) + `supabaseService.ts:4226-4660` | 2026-07-31 (P0-8) | `/projects/:id/documents` | project_documents, bucket `project-documents` | Healthy post P0-8; no size cap (§3) |
| Variance / print | `PrintableReport.tsx` (579) | 2026-07-13 | inside Estimate/Actuals | — | OK. **`VarianceReport.tsx` (496) has zero importers** despite the 2026-07-29 P0-7 fix — the fix landed in dead code. |
| Projects dashboard / detail / create | `ProjectsDashboard.tsx` (504), `ProjectDetailView.tsx` (1311), `CreateProjectForm.tsx` (692) | 2026-06-01 / 05-13 / 07-13 | `/`, `/projects/:id`, `/projects/new` | projects | Duplicate is localStorage-only (§3) |

### PROBABLY-DORMANT (unconfirmed; evidence to settle listed)

| Feature | Files (LOC) | Last real change | Route / nav | Tables | Evidence that would settle it |
|---|---|---|---|---|---|
| Deals workspace + proforma | `DealWorkspace.tsx` (4715), `DealsDashboard.tsx` (432), `CreateDealDialog`, `DealSelector`, `dealService.ts` (503), `proformaService.ts` (1848), `proformaExportService.ts` (1063), `lib/dealReadiness.ts` (494), `forSalePhaseAllocation.ts` | 2026-05-08 (DealWorkspace) | `/deals`, `/deals/workspace/:id`; own workspace in sidebar | deals, deal_notes, deal_proforma_versions, deal_workspace_context, deal_activity_events | `select count(*), max(updated_at) from deal_proforma_versions; from deals where updated_at > '2026-06-01'` |
| Tenant pipeline | `TenantPipeline.tsx` (1006), `tenantPipelineService.ts` | 2026-05-13 | `/tenants` | tenant_pipeline_prospects | `count(*)`, `max(updated_at)` on tenant_pipeline_prospects. C9 (push to deal) IS wired (`TenantPipeline.tsx:466-499`). |
| Selection book | `SelectionBook.tsx` (2425), `selectionBookService.ts` (936) | 2026-05-04 | `/projects/:id/selection-book`, sidebar "Selections" | selection_books/rooms/images/spec_sheets, bucket `selection-images` | Rows created after 2026-06-01 |
| Selection schedules | `SelectionSchedules.tsx` (1178), `selectionScheduleService.ts` (303) | 2026-05-07 | `/projects/:id/selection-schedules` (route only; no sidebar item) | selection_schedule_versions (0 rows in April) | Still 0 rows → delete (FEATURE_CLEANUP 3b already recommends) |
| Plans library | `PlanLibrary.tsx` (256), `PlanEditor.tsx` (753), `planHybridService.ts`, `planService.ts` | 2026-04-30 | `/library/plans` | plans | **Semi-core**: `CreateProjectForm.tsx:18` pulls plans for new projects. Count of projects with `plan_id` since June. |
| Project forms | `ProjectForms.tsx` (1896) | 2026-07-13 (console strip) | `/projects/:id/forms`, sidebar | project_forms (direct queries; `formService.ts` unused) | `count(*) from project_forms where created_at > '2026-06-01'` |
| SOW templates | `SOWManagement.tsx` (568), `sowService.ts` (383) | 2026-05-04 | `/sow` (Settings) | sow_templates | Only other consumer is dead `QuoteRequestForm`. `max(updated_at)` on sow_templates. |
| GC client quotes | `components/quotes/*` (1934 total), `clientQuoteService.ts` (664), `clientQuotePdf.ts` (631) | 2026-05-19 | `/projects/:id/quotes*`, sidebar "Quotes" | client_quotes, client_quote_line_items/options, inclusion/exclusion templates | `count(*) from client_quotes`. Third quote concept (§5). |
| GC schedule (per-project) | `ScheduleBuilder.tsx` (1370), `CascadePreviewModal`, `ConfirmationDot`, `CommsLogPanel` (308), `LogCommsModal` (296), `smsService.ts` | 2026-05-14 | `/projects/:id/schedule`, sidebar | schedules, schedule_items, communication_log_entries, subcontractors | Relational (see §5 — GC_WORKSPACE_LESSONS "JSONB" claim is wrong) |
| GC schedule portfolio | `SchedulePortfolio.tsx` (692), `SchedulePortfolioItemModal.tsx` (845), `SchedulePortfolioInbox.tsx`, `ResourceCompare.tsx` (366) | 2026-06-25 | `/schedule`, `/schedule/resource` — **workspace hidden for all but owner** (`rbac.ts:39-42`) | schedule_items, communication_log_entries | Already effectively frozen by RBAC; drywall portfolio supersedes it |
| Holidays / sub unavailability | `HolidaysAdmin.tsx`, `SubUnavailabilityAdmin.tsx`, `calendarConfigService.ts` | 2026-05-14 | `/settings/*` | org_holidays, subcontractor_unavailability | Consumed by ScheduleBuilder/ResourceCompare only (drywall has `person_unavailability`) |
| Contact directory | `ContactDirectory.tsx` (2302), `ImportContactsDialog.tsx`, `contactDirectoryService`, `partnerDirectoryService` (636), `partnerCategoryService` | **2026-08-18 bugfix** (`aac67e1`) | `/contacts` | contacts, contact_categories, developers, lenders, municipalities, subcontractors, suppliers | **Shared infra** — `scheduleService.fetchActiveSubcontractors` (drywall schedule) and `ItemLibrary` read `subcontractors`. Treat as ACTIVE. |
| Meetings | `components/meeting/**` (~3.6k), `meetingService.ts` (780) | 2026-06-02 | `/meeting*`, `/pre-read`, `/action-items`; own workspace | meeting_* tables, `v_meetings_summary` | `count(*) from meeting_submissions where created_at > '2026-07-01'` |
| Feedback | `MyFeedback.tsx`, `FeedbackForm.tsx`, `feedbackService.ts` | 2026-05-28 | `/feedback` | feedback | `FeedbackManagement.tsx` (369) unreferenced since 2026-01-08 |
| Vendor quote portal | `VendorQuotePortal.tsx` (499), `quoteService.ts` (639), hybrid quote wrappers | 2026-07-30 (P0-4 RPC) | public `/vendor-quote/:token`, `/quote/:token` | quote_requests, submitted_quotes, bucket `quote-documents` | **Dead by construction**: the only creator of RFQs (`QuoteRequestForm.tsx:307`) has had no importer since `11a19bc` 2026-02-26. The P0-4 anon-lockdown hardened a feature nothing can populate. Settle: `count(*) from quote_requests where created_at > '2026-03-01'` (expect 0). |
| Backup | `backupService.ts` (424), `backupVerification.ts` (282) | 2026-01-14 | "Backup Data" in `SidebarUserMenu.tsx:81` | 17 tables | Restore stub still uncalled; org-filter leak §3 |

### DEAD (zero importers, verified by grep incl. lazy imports — there are none in the codebase)

See §6.

---

## 2. The hybrid / offline layer

**What "offline mode" actually is:** `isOnlineMode()` (`lib/supabase.ts:26-33`) is `Boolean(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY && url !== placeholder)`. It is a **build-time env check**, not connectivity. Prod always has the env, so `isOnlineMode()` is a constant `true` in every deployed build; the `else` branches only run in a dev checkout with no `.env`. There is no sync queue, no reconnect logic, no online/offline UI — this has been vestigial since A5 (April).

**Footprint:**

| Piece | LOC | Pure pass-through wrappers |
|---|---|---|
| `hybridService.ts` | 391 | 28 `_Hybrid` fns; **14 are strict pass-throughs** (work packages 4, milestones 4 → `return []/null` offline; quotes 8 → `return null/false/[]` offline). 14 real LS branches. Header still says "starter implementation". |
| `actualsHybridService.ts` | 499 | 13 `_Hybrid`; every create/update/delete has a **silent** LS fallback on DB failure (`:46,68,81,98,119,137,154,175,193` `console.warn` only — H19 still open) |
| `planHybridService.ts` | 236 | 6; LS fallback on catch |
| LS engines: `storage.ts` 569, `projectService.ts` 377, `estimateService.ts` 377, `actualsService.ts` 468, `planService.ts` 272 | 2063 | Reachable in prod only via the accidental paths in §3 (ChangeOrders, duplicateProject, resetToDefaults) |
| `isOnlineMode()` guards | 86 in `supabaseService.ts` alone, 300+ app-wide (drywall services copied the pattern: 37 in `drywallProjectsService.ts`) | |
| `usePermissions.ts:32-45` | | offline profile = `id:'offline'`, `roles:['owner']`, every capability flag true (H24 still open — but unreachable in prod) |

**Verdict: remove.** The layer contributes ~3.2k LOC plus ~300 guards, has produced three real prod bugs (§3 H1/M2/M3 all come from LS functions leaking into online flows via the `@/services` barrel), and protects nothing in production. Removal is mechanical (delete `else` branches, delete LS engines, collapse `_Hybrid` names) but touches 19 importers — **DEFERRED** per the "surface fixes only" constraint. Surface-fix this cycle: (a) replace the silent LS fallbacks in `actualsHybridService` with `toast.error` + rethrow so a failed entry save is visible; (b) fix the three leak sites in §3.

---

## 3. Correctness findings (ranked)

### High

| # | Where | Failure |
|---|---|---|
| **H1** | `ChangeOrders.tsx:11,78,101` imports `updateProject` from `@/services` → `projectService.updateProject` (`projectService.ts:94`, sync, localStorage). Loads from `project.actuals?.changeOrders` (`:57`), but `transformProject` (`supabaseService.ts:52-95`) never populates `actuals`. | **Change orders never persist for online users.** Page always loads empty; save writes to `localStorage['hsh_gc_projects']` for a project that isn't there → `updateProject` returns null silently. `ProjectActuals.tsx:199-203` CO rollup is therefore always $0. The `change_orders` table (RLS added in `20260427000004`) has **no app writer** — only `scripts/migrateToSupabase.ts:334`. ACTIVE-CORE per owner. Fix: write to `change_orders` via a small `changeOrderService` (S) and read them in ProjectActuals. |
| **H2** | `backupService.ts:89-98` — `orgFilter` falls through to **unfiltered** `select('*')` when `organizationId` is null/non-UUID. Reachable from "Backup Data" (`SidebarUserMenu.tsx:88`). | Cross-org export if any user has a null org (invite-first flow). RLS is the only backstop — and the audit says several tables have `USING(true)`-style policies (e.g. `036` playbook). Fix: throw if org is not a UUID (S). Still open from 05-07 re-audit. |

### Medium

| # | Where | Failure |
|---|---|---|
| M1 | `QuickBooksImport.tsx:369-372, 426-428` — falls back to case-insensitive **name** match when `qbProjectId` doesn't match. | Two projects with the same name → transactions land on the wrong job. H14 still open. Fix: require explicit selection when >1 name match (S). |
| M2 | `ProjectDetailView.tsx:381` → `projectService.duplicateProject` (`:319`, localStorage). | "Duplicate project" toasts success but creates nothing in the DB. H1 (audit) still open. Either hide the button or implement `duplicateProjectInDB` (M). |
| M3 | `ItemLibrary.tsx:123-128` "Reset to defaults" → `resetToDefaults()` (`itemTemplateService.ts:646`, localStorage) then `loadItems()` from DB. | Scary confirm ("DELETE any custom items") followed by a no-op in prod. Remove the button (S). |
| M4 | `uploadProjectDocument` (`supabaseService.ts:4226+`): no size cap, no server-side mime check (client `accept=` only, `ProjectDocuments.tsx:278`); calls `storage.listBuckets()` on **every upload** (`:4272`) and probes an alternate bucket name (`:4295`). | 200 MB print sets can go straight into Supabase storage (egress history). Add a 25 MB cap + allowlist; delete the bucket-probe debugging (S). Same gap in `PlanEditor` (H5 still open). |
| M5 | `getOrCreateActualsId` (`supabaseService.ts:2495-2540`) — SELECT-then-INSERT with no UNIQUE on `project_actuals.project_id` (`001_initial_schema.sql:202-219`). | Concurrent first entries (two tabs, QB import) create duplicate `project_actuals` rows; `limit(1)` then hides half the entries from any consumer that joins on `actuals_id`. Add a unique index + upsert (S migration). |
| M6 | `EstimateBuilder.tsx:187-193` — per-trade `fetchSubItemsForTrade` in a loop, each resolving `setSubItemsByTrade` separately. | N+1 on estimate load (30 trades = 30 round trips). Batch by `trade_id IN (...)` (S). |
| M7 | `actualsHybridService.ts:46-49` etc. — DB failure falls back to localStorage with `console.warn` only. | User sees the entry appear, it's gone on reload. H19 still open. Surface with toast + no LS write (S). |
| M8 | Vendor quote chain: public route + `get_quote_request_by_token` RPC + `send-quote-email` edge fn + 8 hybrid wrappers are live, but **no UI can create a quote request** (`QuoteRequestForm` unreferenced since 02-26). | Attack surface + maintenance cost for a feature that cannot be exercised. Either re-wire or remove the whole chain (§6). |

### Low

| # | Where | Note |
|---|---|---|
| L1 | 39 native `confirm()` and 1 `prompt()` (`ProjectDetailView.tsx:376`) across 24 GC components; `alert()` is now **0** app-wide (toast sweep done). | Cosmetic; drywall uses dialogs. |
| L2 | `quickbooksService.ts:13` sandbox URL + `:73-121` `sessionStorage` OAuth state | C3/H15 still open; inert because calls go through edge functions. |
| L3 | `selectionBookService.ts:560,568,604,810,818,855`, `selectionScheduleService.ts:63` empty `catch (_) {}` | H25 still open (dormant feature). |
| L4 | `AuthContext.tsx:133` profile insert unawaited-for-error | H21 still open. |
| L5 | `DealWorkspace.tsx` 26 `as any`, no dirty-guard (`lib/unsavedWork.ts` exists but only `CrewMeasurePage` uses it) | H9 still open; dormant. |
| L6 | `AppSidebar.tsx:199-206` "Budget Reports"/"Analytics" and deals "Documents" (`:244`) are `to:'#'` placeholders | Owner-intended; note `DealDocuments.tsx` is the dead implementation behind that placeholder. |
| L7 | `supabaseService.ts:1091` comment "profile fetch dead; cleanup pending" — `profiles` round-trip still executed in `createTradeInDB` (`:1503-1510`), `upsertScheduleForProject` (`:295`), `getOrCreateActualsId`, `uploadProjectDocument` | Each write does an extra `profiles` select; `requireUserOrgId()` (`userService.ts`) already exists and caches. |
| L8 | `TenantPipeline.tsx:121,352` sample `PROSPECTS` still shipped in the bundle (offline-only path) | Harmless. |

**Confirmed still-open from prior audits:** C10 (`convertDealToProjects` defined `dealService.ts:385`, zero callers), H20 (`restoreFromBackup` `backupService.ts:392-422` throws "coming soon", zero callers), H14, H19, H21, H24, H25, H5, H9, M2/M12 (contacts CSV import now exists via `ImportContactsDialog` — M12 closable). **Confirmed closed since:** H2 (no `window.location.reload` anywhere), H4, H10, H11, H17 (`source_trade_id` written), C9 (push-to-deal wired), all `alert()` (0), all `'default-org'` literals (comments only), Gameplan/Playbook/TradeCategoryIcon/MigratePlans/DataMigration deleted (`d3c85e5`).

---

## 4. `supabaseService.ts` decomposition (5074 LOC, 96 exports, 201 `console.*`, 54 `: any`) — **DEFERRED, analysis only**

| Lines | Domain | Exported fns | External consumers | Notes |
|---|---|---|---|---|
| 1-243 | header, `transformProject`, schedule row mappers | 0 | — | mappers duplicate `scheduleService.ts` (`DRYWALL_SCHEDULE_SELECT`, `parseScheduleItemTasks`) |
| 244-523 | **Schedule** (fetch/upsert/quick-edit) | 3 | `SchedulePortfolioItemModal` | `upsertScheduleForProject` only called internally (`:743`). `scheduleService.getOrCreateScheduleForProject` (`:355-388`) re-implements the same schedules-row get-or-create. |
| 524-870 | **Projects** | 8 | hybridService, PayrollPage (`fetchAllOrgProjectsForPayroll`), routes | `fetchProjects` (`:595`) dead; `fetchProjectById` `select('*')` (full metadata). `drywallProjectsService` has its own project reads. |
| 871-1174 | Work packages + milestones | 8 | hybridService only → dead components | **~300 LOC transitively dead** |
| 1175-2009 | Estimates / trades / sub-items | 13 | hybridService, EstimateBuilder, importService | `fetchEstimateByProjectId` internal-only |
| 2010-2604 | Actuals entries | 14 + helper | actualsHybridService, ProjectActuals | drywall reads the same tables via its own service |
| 2605-3028 | Estimate templates / item templates / trade categories | 12 | the 3 thin services of the same names | The 3 services are already the "domain service"; this block is their private impl |
| 3029-3168 | Purchase orders | 3 | PurchaseOrdersView, CreatePOModal | clean extraction |
| 3169-3302 | Quote PDF storage | 3 | EstimateBuilder (`uploadQuotePDF` only) | `deleteQuotePDF`, `getQuotePDFSignedUrl` dead |
| 3303-4217 | Proforma / deal workspace / activity events | 15 | DealWorkspace (10), ProFormaGenerator (dead, 5) | project-level proforma (`saveProFormaInputs`, `loadProFormaInputs`, `listProjectProFormaVersions`, `loadProjectProFormaVersionInputs`, `saveProjectProFormaVersion`) only used by dead `ProFormaGenerator` |
| 4218-4660 | Project documents | 4 | ProjectDocuments | ACTIVE-CORE; extraction target #1 |
| 4661-5069 | Deal documents | 4 | `DealDocuments` (dead) | **~410 LOC dead** |

**Proposed order (when the refactor cycle opens):** (1) `projectDocumentsService.ts` — self-contained, active, lets the size-cap fix land in a clean file. (2) `purchaseOrderService.ts`. (3) `changeOrderService.ts` (new, fixes H1). (4) `actualsService` — fold the DB functions into `actualsHybridService` and drop the LS side. (5) `estimateDbService` (estimates/trades/sub-items). (6) `gcScheduleService` — merge with `scheduleService.ts` (single mapper, single get-or-create). (7) Deal/proforma → `dealWorkspaceService.ts` with the 5 dead project-proforma fns removed. Delete work-package/milestone/deal-document blocks outright rather than extracting.

---

## 5. Shared-infrastructure overlap GC ↔ drywall

| Concern | GC | Drywall | Verified state | Recommendation |
|---|---|---|---|---|
| **Schedule storage** | `ScheduleBuilder.tsx:350` → `updateProject_Hybrid` → `updateProjectInDB` (`supabaseService.ts:742-744`) → `upsertScheduleForProject` → **`schedules` + `schedule_items` rows** (`:291-372`). Reads via `fetchScheduleByProjectId` (`:244-289`) → `schedule_items`. | `scheduleService.ts:393-402` → `schedule_items` | **GC_WORKSPACE_LESSONS §0 is wrong: GC does NOT write a JSONB blob.** Both sides read/write the same relational table since `20260507000002_schedule_items_table.sql`. The dual-storage risk is a non-issue. Real residual: GC's delete-then-upsert (`:329-372`) rewrites every row per save (touches the drywall audit trigger per row, and a stale GC tab can resurrect deleted drywall items or drop new ones). | No unification needed. Freeze GC ScheduleBuilder (already owner-only via `rbac.ts:39-42` for the portfolio; make the per-project page owner-only too). Deferred: make GC saves per-item diffs. |
| **Contacts / customers** | `contacts` + `developers/lenders/municipalities/subcontractors/suppliers` (`partnerDirectoryService`) | Customer is a free-text field on the project (`drywall.ts:245 customerContact`); suppliers/subs come from GC tables (`scheduleService.ts:158`) | One model, not two — drywall just doesn't use `contacts` for customers. | Keep; ContactDirectory is shared infra (ACTIVE). If drywall ever needs a customer record, point it at `contacts`. |
| **Documents** | `project_documents` + bucket `project-documents` (GC UI only) | field photos bucket (`drywallPhotosService`), no docs UI; roadmap P2 wants `project_documents` surfaced in drywall + Drive links | Same table, one UI. | Unify = just mount `ProjectDocuments` in the drywall shell (S). Delete `deal_documents` code (dead). |
| **Quotes** | (a) vendor RFQ `quote_requests/submitted_quotes` — dead chain; (b) client quotes `client_quotes*` — 05-19, dormant-unconfirmed | v3 quote in `projects.metadata` | Three concepts. Only (b) and drywall v3 are customer-facing; they don't share code. | Remove (a). Decide (b) on `count(*) from client_quotes`; if unused, freeze route. Don't unify (b) with v3 — different math. |
| **QuickBooks** | `QuickBooksImport.tsx` + `quickbooksService.ts` (job transactions → actuals), `actualsHybridService.syncEntryToQB` (creates QB checks) | `drywallQbMaterialsService`/`drywallQbRevenueService` (invoices/materials per job) + `DrywallQuickBooksPage` | Same OAuth/token (`_shared/qb.ts`), same edge fns; different importers writing different targets. | Keep both; they're different jobs. Fix M1 on the GC side only. |
| **Comms** | `communication_log_entries` + `CommsLogPanel`/`LogCommsModal`/`SchedulePortfolioInbox` + `smsService` (sub confirmations) | `metadata.commsLog` via RPC + `drywall/comms/CommsLogPanel` + Messages inbox | Two comms systems with the same component name. | Freeze GC one with the GC schedule. |
| **Actuals tables** | writer | reader (`drywallProjectCostService.ts:109-260`) | Shared; healthy. | Keep. The M5 duplicate-`project_actuals` risk affects drywall cost reads too. |

---

## 6. Dead code — verified zero callers (safe delete)

| File | LOC | Since | Cascades |
|---|---|---|---|
| `src/components/ProFormaGenerator.tsx` | 5149 | `b891e29` 2026-04-20 (DealWorkspace absorbed it) | `proformaSummaryService.ts` (168); 5 project-proforma fns in `supabaseService.ts:3332-4217`; `proforma_inputs` + `project_proforma_versions` tables become writer-less |
| `src/components/QuoteReviewDashboard.tsx` | 1146 | `11a19bc` 2026-02-26 | with `QuoteRequestForm.tsx` (686): 8 quote `_Hybrid` wrappers, `quoteService.ts` creator paths; keep only if vendor portal is re-wired |
| `src/components/DealDocuments.tsx` | 671 | `d6ab18b` 2026-04-09 | `supabaseService.ts:4661-5069` (~410), bucket `deal-documents`, `deal_documents` table |
| `src/components/VarianceReport.tsx` | 496 | never routed (`types/api.ts` type refs only) | — (P0-7 fix was applied here; the live variance is `PrintableReport`) |
| `src/components/ProjectMilestonesSection.tsx` / `WorkPackagesSection.tsx` | 380 / 320 | `f433575` 2026-04-30 | `hybridService.ts` 8 wrappers (~90), `supabaseService.ts:871-1174` (~300), `types/workPackage.ts`, `types/projectMilestone.ts`, tables `work_packages`, `project_milestones` |
| `src/components/FeedbackManagement.tsx` | 369 | `06d300f` 2026-01-08 | — |
| `src/components/ImportEstimate.tsx` + `importService.ts` + `utils/excelParser.ts` | 348 + 394 + 266 | never routed | **Confirm with owner first** (ACTIVE-CORE candidate) |
| `src/services/formService.ts` | 307 | — (`ProjectForms` queries directly) | — |
| `src/scripts/migratePlansToSupabase.ts`, `migrateToSupabase.ts` | 117 + 373 | pre-A5 | — |
| `supabaseService.ts`: `fetchProjects` (`:595`), `deleteQuotePDF` (`:3241`), `getQuotePDFSignedUrl` (`:3274`) | ~90 | — | — |
| `dealService.convertDealToProjects` (`:385`), `backupService.restoreFromBackup` (`:392`) | ~70 | — | or wire them; decision item |

**Total safe-delete: ~11.3k LOC of components/services + ~900 LOC inside `supabaseService.ts`/`hybridService.ts`**, i.e. ~23% of top-level GC code, with zero behaviour change. Recommend one commit per row so `git revert` stays surgical.

---

## 7. Strategic options

| Option | What | Pros | Cons | Effort |
|---|---|---|---|---|
| **(a) Freeze + gate** | Keep everything; gate deals/tenants/selections/forms/SOW/GC schedule/meetings/client-quotes behind owner-only (`WORKSPACE_ACCESS` + `moduleItems`); fix only H1/H2/M1-M7 in ACTIVE-CORE | Zero deletion risk; reversible in minutes; matches "surface fixes only" | 11k LOC of dead code keeps compiling and confusing; dead chains (vendor portal) remain attack surface; refactors later still have to route around it | S (1 session) |
| **(b) Archive dormant** | Delete §6 dead code now; after row-count evidence, remove selection-schedules, vendor-quote chain, work-packages/milestones/deal-documents tables + code; gate the rest per (a) | Removes ~25% of GC LOC with no behaviour change; shrinks `supabaseService` by ~900 LOC before any refactor; closes M8 | Needs the DB row-count pass first for the "probably dormant" tier; a few tables to drop | M (2-3 sessions incl. migrations) |
| **(c) Level GC up** | Split god-files, kill the hybrid layer, decompose `supabaseService`, port drywall mobile/filter/dialog patterns, migrate GC schedule saves to per-item diffs | Long-term health of the ACTIVE-CORE estimating stack | Contradicts this cycle's rule; most of the payoff is in code nobody uses yet | L (weeks) |

**Recommend (b) scoped to the verified-dead list now, (a) for the unconfirmed tier, (c) deferred to the post-drywall investment window** — and when (c) opens, do it only for estimating/actuals/documents.

---

## 8. Top 10 actions (ordered)

| # | Action | Size |
|---|---|---|
| 1 | **Fix change orders persistence** — new `changeOrderService` writing `change_orders`; load in `ChangeOrders.tsx` and `ProjectActuals.tsx:199` (H1) | S/M |
| 2 | `backupService.ts:89-98` — refuse to export when org is not a valid UUID (H2) | S |
| 3 | Delete the verified-dead set in §6 except `ImportEstimate` (ask owner) — one commit per file | S |
| 4 | Project documents: 25 MB cap + mime allowlist; remove `listBuckets` probe (`supabaseService.ts:4272-4295`) (M4) | S |
| 5 | Unique index on `project_actuals(project_id)` + upsert in `getOrCreateActualsId` (M5) | S |
| 6 | `actualsHybridService` — replace silent LS fallbacks with toast + throw (M7) | S |
| 7 | Remove "Reset to defaults" in ItemLibrary and hide/implement "Duplicate project" (M2/M3) | S |
| 8 | QB import: block auto-assign on ambiguous name match (M1) | S |
| 9 | Run the row-count queries in §1 (deals, tenant_pipeline_prospects, selection_*, client_quotes, project_forms, sow_templates, quote_requests, meeting_submissions) and gate what's dormant to owner-only in `rbac.ts` / `moduleItems` | S |
| 10 | Batch sub-item fetch in `EstimateBuilder.tsx:187` (M6) | S |

Deferred (documented in §2/§4/§5, not this cycle): hybrid-layer removal, `supabaseService` split, GC schedule per-item saves, mobile/dialog parity for GC.
