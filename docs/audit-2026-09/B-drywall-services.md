# Review B — Drywall lifecycle, service layer, operator pages

Read-only review, 2026-09-03. All paths relative to repo root. Line numbers verified against current working tree.

## 1. Inventory

| File | Lines | Role |
|---|---|---|
| `src/services/drywallProjectsService.ts` | 2309 | Every read/write of `projects.metadata.legacy` for drywall (quote, takeoff, orders, COs, lifecycle, comms, PO, below-floor) |
| `src/services/scheduleService.ts` | 797 | GC portfolio queries (L16-166) **and** drywall schedule CRUD + cascade (L168-797) |
| `src/services/drywallLaborAuditService.ts` | 782 | Payroll mislabel audit + reassign/retag/off-system |
| `src/services/drywallDivisionAggregateService.ts` | 772 | Dashboard "execution" (margin, labor perf, estimating accuracy) |
| `src/services/drywallProjectCostService.ts` | 445 | Per-project assessment (cost windows, billed, estimates) |
| `src/services/drywallLaborService.ts` / `drywallLaborEntryEditService.ts` | 137 / 178 | Labor from `pay_periods.payload`; single-entry reassign/retag |
| `drywallPhotosService` / `supplierOrdersService` / `customerCommsService` / `customerShareService` / `commsReadStateService` / `commsFeedService` / `pushService` / `foremanScheduleService` / `drywallScheduleAggregateService` | 333/171/192/99/191/40/277/185/156 | Photos, supplier board+email, SMS, share links, unread, feed, web-push, foreman RPCs, cross-project schedule projection |
| `components/drywall/schedule/portfolio/DrywallSchedulePortfolioPage.tsx` | 1144 | Cross-project schedule |
| `components/drywall/schedule/ScheduleItemDialog.tsx` | 1028 | Add/edit schedule item, cascade conflict, notify |
| `order/OrderPage.tsx` / `order/ChangeOrdersSection.tsx` | 662 / 864 | Order stage |
| `info/ProjectInfoPage.tsx`, `field/FieldMeasurementPage.tsx`, `production/ProductionStagePage.tsx`, `closeout/CloseoutStagePage.tsx`, `DrywallProjectShell.tsx` | 471/429/404/361/175 | Stage pages |
| `lib/drywall/dashboardCalculations.ts` | 1399 | KPI math (core L1-747, financials/billings L749-1142, alerts L1144-1399) |
| `lib/drywall/projectLaborMath.ts`, `lib/scheduleDateMath.ts` | 423 / 308 | Labor attribution by exact `jobId`; cascade engine |

### Lifecycle data flow
`createDrywallProject` (status `project-info`, L555) → `updateDrywallProjectInfo({status:'quote'})` (L474) → quote saves → `markQuoteSent` (L1854, denormalizes totals) → `markQuoteApproved` (L1895, → `field-measurement` only if currently `quote`) → `saveFieldTakeoffAndAdvance` (L1093, → `order`, auto-seeds draft supplier order) → `markProductionStarted` (L1540, asserts `order`) → `markProductionComplete` (L1560, editable date) → `markFullyClosed` (L1584, editable date). Reverts: L1605-1663. Every transition also mirrors `legacy.status` and `legacy.productionTimestamps`.

**Bypasses that exist today:** `updateDrywallProjectStatus` (L1471, list-card pill, any→any, no timestamps); `markDrywallProjectComplete` (L1486, `order`→`closed`, no guard, no `productionCompletedAt`); `revertDrywallProjectComplete` (L1504, `closed`→`order`, leaves other timestamps).

### Writers of `projects.metadata` (all whole-blob read-modify-write, none carry a version/updated_at guard)

| Writer | Path | RMW scope |
|---|---|---|
| `persistLegacyMetadata` | `drywallProjectsService.ts:651-687` — 33 call sites via `loadProjectLegacyForMerge` (L617) | Client reads full `metadata` (L627), spreads `...prevLegacy`, writes whole `metadata` (L674) |
| `updateDrywallProjectInfo` | L485-539 (its own copy of the same pattern) | whole blob |
| `updateDrywallProjectPoData` | L2202 then L2204 | whole blob, then columns (two non-atomic writes) |
| Edge fn `supplier-order-share` confirm/deliver | `supabase/functions/supplier-order-share/index.ts:115-153` | service-role: read full metadata, replace `legacy.orders`, write whole blob |
| RPCs `append_drywall_comms_log_entry`, `save_field_takeoff_as_measurer`, `crew_append_field_photo`, `crew_append/remove_schedule_item_photo` | migrations `20260617130000`, `20260627120000`, `20260730140000` | plpgsql SELECT→merge→UPDATE (single statement per call; safe from each other only by row lock timing, and always clobbered by a stale client write) |

Read-only consumers of full `metadata`: `fetchDrywallProjectById` (L453, 26 call sites in this domain, 45 total), `scheduleService.fetchPortfolioProjects` L83, `drywallLaborAuditService.fetchAllOrgProjectIds` L219 (uses `id` only), `crewWorkspaceService` L442/L554.

## 2. Correctness / data-safety findings

| # | Sev | Where | Failure scenario | Fix |
|---|---|---|---|---|
| 1 | **High** | `persistLegacyMetadata` L651-687; `saveOrderStageSnapshot` L1366; `supplier-order-share` L148-152 | **Lost update.** Operator opens Order page (5 fetches at `OrderPage.tsx:94-102`), supplier confirms via share link (edge fn sets `status:'confirmed', supplierConfirmedAt`), operator clicks Save → `saveOrderStageSnapshot` writes the page's `orders` array back → confirmation reverted to `sent`. Same shape: operator saving quote/takeoff while crew posts a comms entry via RPC → crew entry silently dropped because `prevLegacy` was loaded before it. Two operator tabs → last save wins for *all* sub-keys. | Add optimistic concurrency: `loadProjectLegacyForMerge` returns `updated_at`; `persistLegacyMetadata` does `.eq('updated_at', loadedAt)` and throws a "reload and retry" error on 0 rows. Longer term, write sub-keys via `jsonb_set` RPCs (`legacy.orders`, `legacy.quote`, …) so writers don't overlap. Move comms out of the blob (§3). |
| 2 | **High** | `scheduleService.ts:420-434 persistCascadedDates` | `Promise.all` over supabase builders; `.error` never inspected. A failed row update (RLS, network) leaves a half-cascaded schedule while the dialog toasts success and the change log shows only some moves. | Collect results, throw on first error; or move cascade persistence to one RPC (foreman path already has `foreman_apply_schedule_changes`). Also L455 writes **every** item, not just `result.changes` — N updates per save and trigger noise. |
| 3 | **High** | `OrderPage.tsx:367` → `markDrywallProjectComplete` L1486; `ReopenProjectConfirmDialog.tsx:35` → L1504 | "Mark project complete" on the Order tab jumps `order`→`closed` with no `assertProjectStatus`, no `productionStartedAt`/`productionCompletedAt`. Downstream: `jobCompletedAt(timestamps)` (`drywallDivisionAggregateService.ts:723`) has nothing → Financials excludes the job (`dashboardCalculations.ts:884`), execution window logic misfires. Reopen goes `closed`→`order` but keeps any production timestamps. List pill (`DrywallProjectsListPage.tsx:159`) allows any→any with no timestamps. | Delete both `@deprecated` fns; Order tab button → "Start production" (`markProductionStarted`). List pill: restrict to forward/back one step through the guarded fns, or drop it. |
| 4 | **High** | Over-fetch of full `metadata` | Per page visit: **Order** = Shell (L56) + `OrderPage.tsx:95-99` = 6 full-blob reads. **Production/Closeout** = Shell + `fetchDrywallProjectAssessment` (`drywallProjectCostService.ts:396`) + 2 windowed `fetchDrywallProjectCostSummary` (L334 each) + `fetchEstimatedCostBreakdownsForProject`→`fetchDrywallQuoteV2V3` (L364) + each windowed labor summary (`drywallLaborService.ts:117`) ≈ 7 blob reads **plus 3× `fetchPayPeriods()` (all payroll JSON) and 3× `fetchTeam()`** (L100-105 per window). **Dashboard**: `fetchDivisionExecution` L707-709 is an N+1 `fetchDrywallProjectById` over every non-quote project. **Portfolio (GC)**: `fetchPortfolioProjects` L83 selects `metadata` for every org project to read `app_scope`. `drywallLaborAuditService.ts:219` selects `metadata`, uses `id`. | (a) One project load per page: Shell fetches once, exposes `project` + `reload` via outlet context; pages derive quote/takeoff/orders with the existing sync helpers (`getOrdersFromLegacy` L1333, `getProductionTimestampsFromLegacy` L1785, `getQuoteOutcomeFromLegacy` L1818). (b) `fetchDrywallProjectAssessment` should fetch periods/team/project **once** and split windows in memory (`splitLaborByProductionWindow` already exists). (c) Execution: denormalize est. material/labor at `markQuoteSent` (it already denormalizes `finalTotal` L1884-1891) and read from list scalars. (d) L83 and L219: select scalars only. |
| 5 | Med | `markQuoteSent` L1854-1893 | Three full reads per send: L1858 load, L1865 `fetchDrywallQuoteV2V3`, L1840 inside `persistQuoteOutcomePatch`. Widens the race window in #1. | Thread `prevLegacy` through; one load, one write. |
| 6 | Med | `OrderPage.tsx:385-387` | Reads `legacy.status` OR row `status` — the only reader of the mirror; row `status` is authoritative everywhere else. Mirror is written by all 33 persist sites. | Read only `project.status`; consider dropping the `legacy.status` mirror. |
| 7 | Med | `ScheduleItemDialog.tsx:161`, `TimeOffManagerSheet.tsx:56`, `GenerateStandardScheduleDialog.tsx:31`, `productionReadyService.ts:40`, `scheduleService.ts:371-372` | "Today" = `new Date().toISOString().slice(0,10)` = UTC date. After ~8 PM ET the default start date and the production-ready nudge cutoff are tomorrow. | Use `format(new Date(),'yyyy-MM-dd')` as `ProductionStagePage.tsx:34` already does; one `todayKey()` helper. |
| 8 | Med | `ScheduleItemDialog.tsx:215,219,236,244,326,444`; `scheduleService.ts:426-427`; `scheduleDateMath.ts:44,52` | Local-midnight `Date` (`parseISO`) → `toISOString().slice(0,10)`. Correct only in negative UTC offsets; `isWorkday` compares a UTC key against a local `getDay()`. Latent, but the same bug class that was just fixed elsewhere. | One `toDateKey(d) = format(d,'yyyy-MM-dd')`; run schedule tests once under `TZ=Europe/Berlin`. |
| 9 | Med | `refreshQuoteV3FromSnapshot` L844, `revertQuoteToV2` L882 | Archives the entire previous quote under `legacy[archiveKey]` every time; never pruned; keys are invisible to list scalars. This is the bloat class cleaned on 2026-07-21 being re-created. | Cap to one `quoteArchive[]` entry (or a separate `drywall_quote_archive` table). |
| 10 | Med | `updateDrywallProjectPoData` L2202-2219 | Metadata write succeeds, column write fails → name/client differ between row and mirror. | Single update carrying both (as `updateDrywallProjectInfo` L529 does). |
| 11 | Med | `persistLegacyMetadata` L661-664 | Every drywall save runs a `count` on `estimates` to decide the GC dual-view wrapper → 3 round trips per save. | Derive from `prevMeta.visibility`/`app_scope` (already `isGcLinkedMetadata` L327) and only query `estimates` when the wrapper is absent. |
| 12 | Med | `drywallLaborEntryEditService.ts` vs `drywallLaborAuditService.ts:485-665` | Two independent implementations of reassign/retag on `pay_periods.payload` with different staleness checks (`lineMatchesRef` L37 vs `pieceEntryStillMatches` L493). A fix in one won't reach the other. | Keep the audit service's row-match version; delete `drywallLaborEntryEditService` (~150 lines), point `LaborBreakdownModal` at it. |
| 13 | Low | `scheduleService.ts:588-592` | Patch with only `startDate` recomputes duration against the old `end_date`. All current callers send both; latent. | Preserve duration when only one bound is patched. |
| 14 | Low | `scheduleService.ts:516-521, 636-643` | `try { … } catch (e) { if (…) throw e; throw e }` no-ops. | Delete. |
| 15 | Low | `notifyCommsPush` L1770 | Refetches full project for `name` after every post; `void`-called so a closed tab drops the push (acceptable, but the refetch is waste — pass the name from the panel). | Pass `projectName` in. |
| 16 | Low | `drywallLaborAuditService.ts:219` | No `organization_id` filter (RLS only). Fine today, brittle. | Add `.eq('organization_id', orgId)` + scalar select. |
| 17 | Low | `DrywallProjectShell.tsx:56` | Full blob for name/address/status. | Scalar select (or become the single loader per #4a). |

RLS-bypass review: crew paths correctly go through SECURITY DEFINER RPCs (`addCommsLogEntry` L1713, photos L162/L273, measurer save); operator paths write directly under RLS. No client write bypasses intent. The supplier share edge function is the only service-role writer and it is scoped by token→supplier→order (L131) — OK, but it participates in race #1.

## 3. Duplication / consolidation

| Pattern | Evidence | Proposal | Size |
|---|---|---|---|
| Stage-page load scaffold | 5 pages each: `useState(loading)`, `Promise.all([fetchDrywallProjectById, …])`, `setProjectName`, toast, spinner (`OrderPage:91-128`, `Field:70-106`, `Info:101-126`, `Production:63-95`, `Closeout:63-87`) | Shell loads once (`useDrywallProject`) and exposes `{project, reload}` in outlet context; pages derive sub-records synchronously. Removes ~150 lines and 10+ blob fetches per session. | M |
| Scalar select strings | `DRYWALL_LIST_SELECT` (`drywallProjectsService:73`), `SCHEDULE_PROJECT_SELECT` (`drywallScheduleAggregateService:73`), plus `formatListAddress` L123 ≈ `formatProjectAddress` L79 ≈ `crewWorkspaceService.formatAddress` | One `projectScalars.ts` (select + row mappers) or a `drywall_project_scalars` view feeding list, schedule aggregate, crew and dashboard. | S/M |
| Inline `prevQuote` / `prevTakeoff` extraction | 7× (L727,787,818,862,914,946,975) and 3× (L1025,1071,1102) while `parseQuoteRecord` (L1791) already exists | Use `parseQuoteRecord`/`parseTakeoffRecord`. `isOnlineMode()` guard ×37 → `requireOnline(msg)`. | S |
| Production ⇄ Closeout pages | Identical `todayDateInput/isoFromDateInput/dateInputFromIso` (L34-47 both), identical 7-handler try/catch/toast blocks, identical 20-line empty labor-summary fallback (`Production:327-345`, `Closeout:311-329`) | `lib/drywall/dateInput.ts`; `emptyLaborSummary()` in `projectLaborMath`; a `useStageAction(fn, successMsg)` hook. | S |
| Labor entry edit | §2 #12 | Delete `drywallLaborEntryEditService`. | S |
| Three comms stacks | (1) drywall log **inside the JSON blob**: `drywallProjectsService:1688-1783` + RPCs `append/recent/unread` + `commsReadStateService` 191 + `commsFeedService` 40 + `CommsLogPanel` 206 + `CommsInboxPage` 306 (2) GC `communication_log`: `components/CommsLogPanel` 308 + `LogCommsModal` 296 (3) customer SMS: `customerCommsService` 192 + `CustomerCommsCard` 323 + `CustomerInboxPage` 229 | Move drywall comms to a `project_comms` table (or `communication_log` + `author_role`). Kills the blob-append race (#1), the egress class that caused the July blowout, three RPCs, `parseCommsLog`/`resolveCommsAuthorNames`, and lets the bell be a plain count. ~400 lines net removed. Customer SMS stays separate (different channel). | L |
| Dashboard recompute | `fetchDivisionExecution` hydrates every project's full quote (`hydrateQuoteFromLegacy` L261) only to run `estimateCostsForQuote` L751 | Denormalize `estMaterial/estLabor` at send/approve time next to `finalTotal`; execution then needs no blob. | M |
| Portfolio toolbars | `DrywallSchedulePortfolioPage.tsx:346-470` (mobile) and `714-1089` (desktop) are the same controls twice; three copy-pasted filter popovers L825-988 | `FilterPopover<T>` + one responsive `PortfolioToolbar`. Page → ~400 lines. | M |

## 4. Dead / dormant code

Verified with grep (zero non-test callers outside the defining file):

| Symbol | File | Note |
|---|---|---|
| `emptyDivisionExecutionRollUp`, `fetchDivisionMarginRollUp` | `drywallDivisionAggregateService.ts` | dead |
| `buildDivisionMarginJob` | same L623 | alias of `buildDivisionExecutionJob`; test-only |
| `markDrywallProjectComplete` (L1486), `revertDrywallProjectComplete` (L1504) | `drywallProjectsService.ts` | `@deprecated` but **live**: `OrderPage.tsx:367`, `ReopenProjectConfirmDialog.tsx:35` (see #3) |
| `'complete'` member of `DrywallProjectStatus` | `types/drywall.ts:14` | normalized on read; every `Record<Exclude<…,'complete'>>` pays for it |
| Type-level `@deprecated` fields | `types/drywall.ts:352,605-609,825,861-863` | quote domain — leave to reviewer A |

Also ~45 symbols are `export`ed but only used in-file (e.g. every `compute*` in `dashboardCalculations` except `computeDashboardMetrics`, `computeFinancialsMetrics`, `computeProjectedBillings`, `computeDashboardAlerts`; the predicate helpers in `drywallDivisionAggregateService`; `isWorkday/nextWorkday`). Not dead, but the export surface hides what the real API is — un-export the ones without tests.

## 5. God-file assessment

- **`drywallProjectsService.ts` (2309)** — earns a split. It is six aggregates sharing one persist path: `drywallProjectRepo.ts` (selects, row mappers, `loadProjectLegacyForMerge`, `persistLegacyMetadata`, permission error; ~400), `drywallQuoteRecord.ts` (fetch/save/convert/number/outcome; ~700), `drywallFieldTakeoffRecord.ts` (~200), `drywallOrdersRecord.ts` (orders + change orders normalizers/save/transition; ~350), `drywallLifecycle.ts` (transitions + timestamps; ~250), `drywallCommsLog.ts` (~120, or deleted per §3), `drywallPoIntake.ts` + below-floor (~300). Pure normalizers become testable without Supabase mocks.
- **`ScheduleItemDialog.tsx` (1028)** — moderate. Extract `useScheduleItemForm` (state + two-way date binding + `predictCascadeStart`, L83-327) into a hook backed by a pure `lib/drywall/scheduleItemForm.ts` (testable, fixes #8 in one place), and `PredecessorPicker` (L607-722), `TasksEditor` (L889-947), `NotifyCrewPopover` (L789-822). Dialog shell ~300.
- **`DrywallSchedulePortfolioPage.tsx` (1144)** — earns it; ~70% is duplicated toolbar JSX (§3).
- **`dashboardCalculations.ts` (1399)** — split along its own section comments into `kpiCore.ts`, `financials.ts`, `alerts.ts`. Low risk, low urgency; do it when touching alerts.

## 6. Test coverage

Exists: `dashboardCalculations` (crew counts, estimating, rev/sqft, north star, QB pace), `drywallDivisionAggregateService`, `drywallLaborAuditService` (mocked), `projectLaborMath`, `projectCostMath`, `contractValue`, `changeOrderWorkflow`, `scheduleDateMath`, `foremanScheduleEdit`, `scheduleChangeLogService`.

Untested critical logic: **all of `drywallProjectsService`** (row mappers, `buildDrywallProjectMetadata` dual-view wrapper, order/CO normalizers, lifecycle guards, `saveOrderStageSnapshot` workflow-field preservation), `scheduleService` (duration, predecessor parse, cascade persistence), `drywallProjectCostService` windows, `computeFinancialsMetrics`, `computeProjectedBillings`, `computeDashboardAlerts`, `parseDashboardTargets`.

Five highest-value tests to add:
1. Lifecycle transition table: each `mark*/revert*` with every starting status → expected status + timestamp set/cleared; pins removal of the deprecated shortcuts.
2. `persistLegacyMetadata` merge: sibling keys and GC wrapper preserved; once #1 is fixed, a stale `updated_at` rejects the write.
3. `saveOrderStageSnapshot`: `supplierConfirmedAt/DeliveredAt/status` from DB survive a client snapshot that predates them.
4. `scheduleService` cascade: only changed rows written, an update error surfaces; date-key round trip under `TZ=Europe/Berlin` and `TZ=America/New_York`.
5. `computeProjectedBillings` + `computeDashboardAlerts` fixtures (draw-name parsing, remainder split, invoice consumption, alert ordering).

## 7. Top 10 actions (value/risk order)

| # | Action | Size |
|---|---|---|
| 1 | Optimistic-concurrency guard in `persistLegacyMetadata` (+ `updateDrywallProjectInfo`) with a "reload and retry" error; surface it in the four Save handlers | S |
| 2 | Delete `markDrywallProjectComplete`/`revertDrywallProjectComplete`; Order tab → "Start production"; constrain list pill to guarded transitions | S |
| 3 | `persistCascadedDates`: check errors, write only `changes` | S |
| 4 | Single project load per stage visit via Shell context; pages use sync `getXFromLegacy` helpers | M |
| 5 | `fetchDrywallProjectAssessment`: load periods/team/project once, split windows in memory | S/M |
| 6 | Kill remaining blob selects: `fetchPortfolioProjects` L83, labor audit L219, execution N+1 (denormalize est. cost at send) | M |
| 7 | Move drywall comms log out of `metadata.legacy` into a table; retire append/unread/recent RPCs | L |
| 8 | `todayKey()`/`toDateKey()` helpers; replace the 5 UTC-today sites and the 8 `toISOString().slice` sites in schedule code; TZ-parameterized test | S |
| 9 | Delete `drywallLaborEntryEditService`; cap quote archives to one entry | S |
| 10 | Split `drywallProjectsService.ts` into repo/quote/takeoff/orders/lifecycle/po modules; add tests 1-3 while doing it | M/L |
