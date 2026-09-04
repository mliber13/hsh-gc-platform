# Review E — HR / Payroll / Time Clock / Crew App

Read-only review, 2026-09-03. Repo: `hsh-gc-platform`. All paths relative to repo root.

---

## 1. Inventory, data model, write paths

### Inventory (lines)

| Area | Files | Lines |
|---|---|---|
| HR pages | `PayrollPage.tsx` 1015, `TimeClockPage.tsx` 497, `TeamPage.tsx` 297, `HrWorkspaceShell.tsx` 6 | 1815 |
| Payroll subcomponents | `LaborAssignmentAudit.tsx` 1006, `PayrollPersonRow.tsx` 795, `PayrollRunTab.tsx` 489, `PayrollHistoryTab.tsx` 359, `JobCombobox` 195, `TimeClockImportDialog` 123, `CalculationDetailDialog` 75, `PayrollSummaryBar` 36, `payrollFormat` 21 | 3099 |
| Team / time / crew-accounts | `MemberFormDialog` 512, `MembersTab` 275, `PositionsTab` 91, `TimeEntryEditDialog` 102, `crew/CrewAccountsPage` 393 | 1373 |
| HR services + libs | `hrPayrollService` 290, `hrTimeService` 272, `hrTeamService` 84, `payrollMath` 807, `payrollPdf` 504, `hrTeamUtils` 178, `payrollPieceKeys` 297, `projectLaborMath` 423, `drywallLaborAuditService` ~782, `drywallLaborEntryEditService` ~180 | ~3800 |
| Types | `types/hr.ts` 127, `types/payroll.ts` 91 | 218 |
| Crew app | `CrewProjectDetailPage` 960, `CrewProjectListPage` 749, `CrewForemanScheduleEditSheet` 652, `CrewMeasurePage` 561, `CrewScheduleCalendar` 315, `CrewForemanScheduleAddSheet` 287, `CrewShell` 199, `CrewScheduleItemPhotos` 192, `CrewCommsPanel` 153, `CrewScopeOfWorkCard` 124, `CrewOrderStatusCard` 98 | 4290 |
| Crew services/libs/hooks | `crewWorkspaceService` 1439, `foremanScheduleService` 185, `crewSpecialty` 31, `usePullToRefresh` 73, `use-mobile` 23 | 1751 |
| Shared field inputs | `field/inputs/*` 1314, `FieldMeasurementPage` 429, `FieldTakeoffReviewBanner` 167, `FieldReviewNotificationBell` 100, `FieldVarianceSummary` 58 | 2068 |
| Tests | `payrollMath.test.ts` 416, `projectLaborMath.test.ts` 339, `PayrollRunTab.test.ts` 104, `crewSpecialty.test.ts` 28 | 887 |

### Data model

```
org_team (1 row/org, UNIQUE organization_id)       -- 20260528000002
  payload: { employees[]: TeamMemberBase, contractors1099[]: TeamMemberBase, positions[]: {id,name} }
  TeamMemberBase: id (16-hex generateHrId), name, positionId, payType hourly|salary|piece,
    hourlyRate, salaryAmount, salaryHistory[], ownersDraw, gasAllowance, bankedHours,
    toolRepayments[], status active|archived, divisionAllocations[]      -- types/hr.ts:29-47

pay_periods (id text PK, organization_id, payload jsonb, updated_at)
  payload: { id, startDate 'YYYY-MM-DD', endDate, completedAt, locked, totalGross,
    entries[]: { personId, personType 'w2'|'1099', personName, hourEntries[], hours,
      pieceEntries[], pieceTotal, reimbursement, perDiem, bankedHoursUsed, hoursToBank,
      gross, done } }                                                       -- types/payroll.ts:41-68
  hourEntry: { id, jobId, jobName, hours, rateOverride, overtimeType, assignToPersonId, assignRate, assignAmount }
  pieceEntry: { id, jobId, jobName, piece_key | workType, catalog_source, totalPhases, phasesCompleted, jobTotalSqft, rate, amount }

time_entries (id, organization_id uuid, person_type, person_id text, person_name, project_id,
  project_name, clock_in timestamptz, clock_out, source_app, created_by)
  partial UNIQUE (org, person_type, person_id) WHERE clock_out IS NULL  -- hr_port_phase_a_rbac.sql:239

profiles link fields (two parallel systems):
  hr_person_id / hr_person_type   -> HR Time Clock, paystub RPCs, pay_periods read-own RLS
  linked_employee_id / linked_contractor_id (CHECK one-or-none) -> everything /crew
  roles text[]; effective role = roles[0]                       -- rbac.ts:99-107
  is_field_foreman boolean                                       -- 20260728121344

task_progress (schedule_item_id, task_id, person_id text, pct) UNIQUE triple
person_unavailability (person_id text, start_date, end_date)  -- operator writes via RLS
schedule_items.photos jsonb[]  -- crew RPC append/remove
```

### Every write path

| Target | Component → service | Mechanism | Granularity |
|---|---|---|---|
| `pay_periods` | `PayrollPage.handleSave` :479 → `savePayPeriod` :211 | direct `upsert(onConflict:'id')` :229 | **whole payload** |
| `pay_periods` | `PayrollPage.handleToggleLock` :565 → `savePayPeriod` | same upsert | whole payload |
| `pay_periods` | `PayrollPage.handleDelete` :533 → `deletePayPeriod` :253 | direct delete | row |
| `pay_periods` | `LaborAssignmentAudit` → `drywallLaborAuditService.batchedApplyToRows` :668-740 → `persistPayPeriodChange` :582 → `savePayPeriod` | same upsert, from audit's **cached** `periods[]` | whole payload |
| `pay_periods` | `LaborBreakdownModal` (drywall cost) → `drywallLaborEntryEditService.reassignLaborEntry/retagLaborEntry` :124-176 → `savePayPeriod` | re-fetches period, line-level stale check, then same upsert | whole payload |
| `org_team` | `TeamPage.handleSave` :137 → `saveTeam` :54 | direct `upsert(onConflict:'organization_id')` :73 | **whole roster blob** |
| `org_team` | `savePayPeriod`/`deletePayPeriod` → `applyBankedHoursDeltaToTeam` :160-208 | read-modify-write, then upsert | whole roster blob (side effect of a payroll save) |
| `time_entries` | `TimeClockPage` → `clockIn/clockOut/updateEntry/deleteEntry` (`hrTimeService` :84-272) | direct insert/update/delete under RLS | row |
| `time_entries` | `CrewProjectDetailPage` :212-235 → `crewClockIn/crewClockOut` (`crewWorkspaceService` :380-403) | SECURITY DEFINER `crew_clock_in/out` | row |
| `task_progress` | `CrewProjectDetailPage.handleSetProgress` → `crew_update_task_progress` RPC | upsert | row |
| `projects.metadata.legacy.fieldTakeoff` | `CrewMeasurePage` → `save_field_takeoff_as_measurer` RPC; operator `FieldMeasurementPage` → `saveFieldTakeoff` → `persistLegacyMetadata` :651 | RPC does `FOR UPDATE` + jsonb merge; operator path is client read-merge-write of the whole `metadata` | whole metadata (operator) |
| `schedule_items` | foreman sheets → `foreman_apply_schedule_changes` / `foreman_create` / `foreman_delete` RPCs | server-validated batch | rows |
| `profiles.linked_*`, `hr_person_*` | `CrewSignupPage` → `consume_crew_invite_token` | SECURITY DEFINER, sets BOTH link systems | row |

---

## 2. Data-safety findings

| # | Sev | Where | Scenario |
|---|---|---|---|
| S1 | **High** | `hrPayrollService.savePayPeriod` :229 — upsert with no `updated_at` precondition; three independent writers (table above) | Operator has run R open in the Run tab. Same page, Labor audit tab reassigns a line in R (audit writes from its own `periods` cache :670-704, updates that cache only :594-597 — `PayrollPage.runs` is never refreshed). Operator returns to Run tab and clicks Save → editor's stale `entries` overwrite the audit's reassignment. Same race across two browser tabs or with `LaborBreakdownModal`. Last-writer-wins on a ~50 KB blob of everyone's pay. |
| S2 | **High** | Lock is client-only: `PayrollRunTab` `disabled={locked}` :269-339, `drywallLaborEntryEditService` :97, audit `row.periodLocked` from cache :685. RLS (`pay_periods_hr_update` :321-334) has no lock check. | Anyone with `can_run_payroll` in a second tab loaded before the lock, or any service that forgets the check, writes a locked run. `handleToggleLock` :565 also writes the **stored** run, so an unsaved draft of that run is silently divergent afterward (snapshot reset :581-603 hides this). |
| S3 | **High** | `PayrollPage.applyImportRowsToDraft` :659-737 + `buildRunPayloadFromDraft` :427-477 | Time-clock import creates `entries[personKey]` for whatever `person_id` is on the punch. If that id is not on the roster (stale link after a member was deleted/re-added, see S9), `buildPayrollPeople(…, retainedPersonKeys)` :433 only retains **archived** members, so the imported hours are silently dropped from the saved payload. Toast says "Imported N rows"; nothing is paid. |
| S4 | **High** | `applyBankedHoursDeltaToTeam` :166-203 vs `TeamPage.handleSave` :137 | Team page loads `org_team` at mount. Operator runs payroll (banks 4h → `org_team.bankedHours` updated) then saves an unrelated edit on the still-open Team page → whole-blob upsert restores the pre-payroll `bankedHours`. Also: `Math.max(0, current+delta)` :183,189 clamps, so `deletePayPeriod`'s reversal :275-280 is not an inverse once the balance was reduced elsewhere — balances drift permanently. |
| S5 | **Med** | Overtime: `calculateHourlyPayWithOvertimeCap` :301-330, default `overtimeType:'regular'` (:783, import :699) | The 40h cap computes `asOT` but multiplier is 1 unless the operator manually flags the row. A W2 hourly employee with 48 imported hours is paid straight time by default. This is a compliance exposure, not a math bug; make >40 default to 1.5 (or at least warn). Cap order follows array order, not date. |
| S6 | **Med** | `hrTimeService.fetchEntriesForRange` :176-177 `'${from}T00:00:00'` (no zone) against `timestamptz` | Supabase session TZ is UTC, so the range boundary is midnight UTC = 8 pm EDT. A Sunday-evening clock-out after 8 pm local lands in **next week's** payroll import; Sunday-before-range evening punches leak in. Same class: `TimeClockPage.isoDateFromNow` :60-63 uses UTC date for "today". |
| S7 | **Med** | `crew_clock_in` :50-58 checks assignment but not date; `crew_clock_out` :120-125; no max-duration anywhere; `diffHours` :191 unbounded | Crew forgets to clock out Friday; Monday "Clock in" fails "already clocked in" so they tap Clock out → a 60-hour entry, which the import rounds and sums into payroll (`fetchEntriesForPayrollImport` :216-236) with no flag. Crew can also clock in to any project ever assigned. |
| S8 | **Med** | Piece-pay sqft: payroll default `getSqftFromJob` :670 = `fieldMeasuredSqft` only; crew app `resolveTotalSqft` (crewWorkspaceService :880-889) = measured **+ accepted change-order crew sqft** | Crew sees "Estimated pay $X" on the phone; the payroll row defaults to a smaller sqft. Disputes at pay time. `amount` is stored (`recalcPieceEntryAmount` :402-408) and only recomputed on field edits — correct for history, but no per-run drift check. |
| S9 | **Med** | Linkage drift: `linked_employee_id` is a free-text copy of an `org_team` JSON id; `TeamPage.guardedRemove` :115-131 only guards on payroll history, not on crew links; `CrewAccountsPage` has no re-link/unlink action (verified: no `update` of `linked_*` anywhere in src) | Delete + re-add a member → profile points at a dead id → `get_my_linked_position_name` returns NULL → specialty `unknown` → materials/pay blank (banner shown, :330-342 detail page) **and** clock punches / task_progress accrue under the orphan id (feeds S3). Recovery today is a manual DB edit. |
| S10 | **Med** | Two identities: `hr_person_id` (set only by `consume_crew_invite_token` :140-146; `updateHrPersonLink` userService:204 has **zero callers**) | A full-app user can never link for the HR Time Clock — `TimeClockPage` :332 says "Visit Team for now" but Team has no link UI. `deriveEffectiveRole` = `roles[0]` :101 means a profile `['crew','office_drywall']` is crew everywhere in the UI while SQL helpers use `&&`/`ANY` — client and server disagree on who is an operator. |
| S11 | **Med** | `getToolDeductionThisWeek` :57-68 deducts `weeklyAmount` every run; nothing in src writes `amountPaid` | Repayment never completes automatically; deduction continues until someone edits the member. |
| S12 | **Low** | `bankedHoursUsed` :375 not validated against `person.bankedHours` | Negative balance is clamped to 0 in org_team, hiding an overdraw. |
| S13 | **Low** | `handleSave` :497-511 clears the draft after a **new** run save; `PayrollPage` has no `beforeunload` / `setUnsavedWork` (only `CrewMeasurePage` :282 and two drywall pages use it) | PWA `onNeedRefresh` (`main.tsx` :17-23) will auto-reload mid-payroll entry on a deploy and lose an hour of typing. |
| S14 | **Low** | `resolvePersonName` :39-54 snapshots `person_name`/`project_name` on the row; `updateEntry` can change `person_id` without name | Renames leave stale display names; harmless for pay (keyed by id). |
| S15 | **Low** | Per-entry quarter-hour rounding :206-209 then sum | Up to 7.5 min bias per punch; acceptable but should be a documented policy and tested. |

Verified history: the 2026-07-07 incident fix is present — `buildRunPayloadFromDraft` re-emits off-roster entries :473-477 and `resolvePayrollGross` preserves stored gross for archived members :37-49 (commits `5b35e7f`, `2125c10`). S1/S2 are the remaining structural risks of the same shape.

---

## 3. The two time clocks

| | HR Time Clock | Crew clock |
|---|---|---|
| UI | `/hr/time-clock` `TimeClockPage` (desktop; punch panel + entry log + edit/delete) | `/crew/projects/:id` card `CrewProjectDetailPage` :377-415 |
| Identity | `profiles.hr_person_id` + `hr_person_type` (`fetchMyOpenPunch` hrTimeService:137-167) | `COALESCE(linked_employee_id, linked_contractor_id)`; type inferred (`crew_clock_in` :37-45) |
| Write | Direct insert/update; RLS office-or-own (`time_entries_hr_insert` :364-374) | SECURITY DEFINER RPC; requires crew role + assignment |
| Job | Optional picker (`fetchTimeClockProjects`) | Always the current project |
| Open-punch read | `hrTimeService.fetchMyOpenPunch` | `crewWorkspaceService.fetchMyOpenPunch` :353-378 (duplicate, filters by person_id only) |
| Who can actually use it | Nobody without a DB edit (S10) | Linked crew |

Both write the same `time_entries` table, so the split is identity + authorization only.

**Proposed shape (keep one):** make `linked_employee_id/linked_contractor_id` the single link; define `person_id = COALESCE(linked_employee_id, linked_contractor_id)` and `person_type = CASE …` as SQL helpers and rewrite `user_hr_person_id()/user_hr_person_type()` (hr_port_phase_a_rbac.sql :110-128) on top of them. Generalize `crew_clock_in(p_project_id uuid DEFAULT NULL)` into `clock_in` that (a) requires a linked person, (b) enforces assignment only when the caller lacks `user_can_edit()`, (c) rejects if the newest open punch is older than N hours. One TS `timeClockService` with `clockIn/clockOut/fetchMyOpenPunch`; operator-only `updateEntry/deleteEntry/fetchEntriesForRange` stay. Add an operator "Link account to team member" action (writes `linked_*`, which now also fixes S9/S10). Migration cost: **M** — one migration (backfill `linked_*` from `hr_person_*` where null, redefine 2 helpers, 1 RPC), delete ~120 TS lines, drop `hr_person_*` after a release.

---

## 4. Crew app

**Correctness / robustness**

- Offline: `isOnlineMode()` (`supabase.ts` :26) is a *config* check, not connectivity. Nothing listens to `navigator.onLine`. Every fetch throws generic messages; `CrewMeasurePage` autosave (:270-277, 4 s debounce) fails **silently** when offline (:246-248) — the user sees "You have unsaved changes" only if they scroll to :500. Good: `setUnsavedWork` blocks the SW auto-reload (:280-284).
- PWA update: `main.tsx` :17-23 reloads on any non-guarded page; `CrewProjectDetailPage`/list have no unsaved state so fine, but the payroll page is not guarded (S13).
- HEIC/camera: handled once in `drywallPhotosService.resolveImageContentType` :47-56; accept string duplicated in `FieldPhotosSection` :203 and `CrewScheduleItemPhotos` :129. No client-side resize — 10 MB cap (:132) means each phone photo is 3–8 MB of egress on every signed-URL view.
- Grace windows: list cutoff `graceDays = measurer ? 5 : 0` (`crewWorkspaceService` :430-434) uses `end_date >= today` string compare — fine; calendar has no cutoff by design.
- Assignment gating: consistently `assigned_persons @> [personId]` client (:199) and server (`crew_clock_in` :55, `crew_update_task_progress` :55, `crew_is_assigned_to_project`, `crew_can_photo_schedule_item`). `show_job_info_person_ids` separately gates $ (:258-260, :1302). Foreman preview by operator is read-only in every write path (`canEditSchedule = isFieldForeman && !isOperator` :132). Server RPCs re-check `user_has_crew_role AND user_is_field_foreman`. Foreman batch write accepts client-computed cascades for **any** item on the project and writes no `schedule_change_log` (not in :157-173).
- `personIsForeman` in-flight cache :222-256 is fine; but `fetchCrewProjectList` performs `getCurrentUserProfile` 3–4 times per call (resolvePersonContext :294, :412, `requireUserOrgId` in :192 and :438) — each is `auth.getUser` + `profiles select *`.

**Duplication**

| Shared (good) | Copy-pasted |
|---|---|
| `field/inputs/*` (measure page + operator page), `AssignedPersonsPicker`, `TimeOffConflictWarning`, `DrywallPortfolioCalendar`, `ScopeMarkdownPreview`, `OrderStatusBadge`, `CommsNotificationBell` | Pull-to-refresh indicator JSX ×3 (`CrewProjectListPage`, `DetailPage` :299-312, `MeasurePage` :366-379); `CrewPhotoThumb` (Detail :63-104) vs `PhotoThumb` (`FieldPhotosSection` :27-95); `isRlsOrPermissionError` ×4 services; `personKey` re-implemented in `hrPayrollService` :116, `PayrollRunTab` :107, `PayrollPage` :665; `entryHours` :120 ≡ `calculateHoursTotal`; `fetchMyOpenPunch` ×2; sqft resolution ×3 (`resolveBaseTotalSqft`, `fieldMeasuredSqftFromProjectMetadata`, `projectLaborMath`) |

Operator features re-implemented in crew: schedule item edit/add/delete (foreman sheets reimplement `DrywallScheduleEditor` dialog fields + cascade preview), comms panel, order status card. Reasonable given RPC boundaries, but the sheets and the operator dialog should share a form component.

---

## 5. `crewWorkspaceService.ts` map and split

| Lines | Section | Proposed home |
|---|---|---|
| 63-77 | error classes | `crew/errors.ts` |
| 79-138 | row types, `formatClient/Address` | `crew/projectRowMappers.ts` |
| 140-154 | `resolvePersonId` (link resolution) | `crew/crewIdentity.ts` (with `resolveCrewSpecialty` :1074, `resolveSpecialtyForPerson` :271, `personIsForeman` :228, `resolvePersonContext` :286) |
| 191-219, 258-260 | schedule row fetchers | `crew/crewScheduleQueries.ts` |
| 300-403 | task progress + **time clock** | `crew/crewTaskProgressService.ts`; clock → unified `timeClockService` (§3) |
| 405-586 | list + calendar feeds | `crew/crewListService.ts` |
| 588-754 | takeoff/quote/scope resolvers (pure) | `lib/drywall/crewScopeResolvers.ts` |
| 756-861 | materials/boards/bead (pure) | `lib/drywall/crewMaterials.ts` |
| 863-1061 | sqft + labor-rate resolution (pure except catalog fetch) | `lib/drywall/crewPayBasis.ts` — and make payroll's `getSqftFromJob` call it (S8) |
| 1086-1125 | pay estimate (pure) | same |
| 1127-1389 | detail/measure page builders | `crew/crewDetailService.ts` |
| 1391-1424 | measurer save | `crew/crewMeasureService.ts` |
| 1426 | `crewRateSourceLabel` | dead (0 callers) |

Over-fetch: `.select('… metadata')` at :442 and :554 pulls **full** `projects.metadata` for every assigned project just to read `type/app_scope/legacy.quote.outcome` (+ `fieldTakeoff` for measurers). Replace with `metadata->'app_scope', metadata->'legacy'->'quote'->>'outcome', metadata->'legacy'->'fieldTakeoff'->>'reviewStatus'` projections, or an RPC. `fetchDrywallProjectById` (`DRYWALL_DETAIL_SELECT` :88-89) still ships full metadata; acceptable for the detail page post-bloat-cleanup, but the list must not.

---

## 6. Dead / dormant code (0 non-test callers, verified by grep)

`hrPayrollService`: `fetchMyPaystubs`, `fetchMyPaystubEntries` (and the two paystub RPCs + `PayrollWriteResult` type only used internally) — the "my paystub" feature was never wired to a page. `userService.updateHrPersonLink`. `crewWorkspaceService`: `resolveSpecialtyForPerson` (internal use only), `crewRateSourceLabel`. `payrollMath`: `parsePersonKey`, `calculatePieceTotal`, `calculateHourlyBase`, `getOvertimeMultiplier` (internal), `payrollWeekRangeContaining` (internal), `REGULAR_HOURS_CAP` export. `hrTeamUtils`: `defaultJobPositions`, `dedupePositions`, `emptyOrgTeamPayload`, `payTypeLabel`. `payrollPieceKeys`: `DRYWALL_HANGER_PIECE_KEY`, `COMPONENT_LABOR_PIECE_KEYS`, `LEGACY_WORKTYPE_CATEGORY`, `findFinishScopeByPieceKey`, `PayrollPieceTypeOptionGroup`. `drywallLaborAuditService`: `isOnValidProject`, `classifyMislabeledLaborProblem`, `buildUniqueDrywallProjectNameMap` (internal). `crewSpecialty.FinisherTier` type. `hrTimeService.HrTimePermissionError` (thrown, never caught by name). No `@deprecated` markers exist in the domain. `TimeClockPage` :332 "Visit Team for now" is a dormant dead-end link (S10).

---

## 7. Tests

Exists: `payrollMath.test.ts` (roster build, division split, next-period draft, week ranges, rate precedence, helper deductions), `PayrollRunTab.test.ts` (archived-entry preservation — the incident regression), `projectLaborMath.test.ts` (classification, aggregation, burden, production window), `crewSpecialty.test.ts`. **Nothing** covers `calculateGross`, overtime cap, banked hours, `hrTimeService` rounding/import grouping, `contributionDelta`, or any SQL RPC.

Top 5 to add:
1. `calculateHourlyPayWithOvertimeCap` — 3 entries totalling 48 h with mixed `overtimeType`, rate override, 40 h cap; golden numbers (locks S5 behavior whichever way it's decided).
2. `calculateGross` fixture — salary + piece with helper deduction + banked used + tool repayment + perDiem; W2 vs 1099 (`toolDeduction` skip).
3. Extract `groupPunchesForImport(entries, from, to)` from `fetchEntriesForPayrollImport` and test: quarter-hour rounding, open punch excluded, 60 h punch flagged, evening-boundary punch (S6/S7).
4. `contributionDelta` + a pure `applyBankedDelta(payload, delta)`: save-then-edit-then-delete round-trips to zero; clamp case documented.
5. `applyImportRowsToDraft` + `buildRunPayloadFromDraft`: imported hours for a personId not on the roster must not vanish (S3) — write it red first.

---

## 8. Top 10 actions (risk/value order)

| # | Action | Size |
|---|---|---|
| 1 | Server guard for locked runs + optimistic concurrency: add `pay_periods.version` (or compare `updated_at`) in an `save_pay_period(p_id, p_payload, p_expected_updated_at)` RPC that rejects when locked or stale; route all 3 writers through it (S1, S2) | M |
| 2 | Refresh `PayrollPage.runs` after any Labor-audit/LaborBreakdown write and block Save when the loaded run's `updated_at` is behind (client half of #1) | S |
| 3 | Import into payroll: refuse (and toast) time-clock rows whose `person_id` is not on the roster; surface orphan ids in `CrewAccountsPage` (S3) | S |
| 4 | Operator "Link / re-link account" action on `CrewAccountsPage` writing `linked_*` (+ `hr_person_*` until unified); guard `TeamPage` delete on active links (S9, S10) | M |
| 5 | Unify time-clock identity and RPC per §3; delete duplicate `fetchMyOpenPunch`; add max-open-punch-hours and current-assignment check (S7) | M |
| 6 | Make `bankedHours` a per-person ledger derived from pay_periods (or move the delta into the same RPC as #1 with a `jsonb_set` on the single member) instead of whole-roster RMW (S4) | M |
| 7 | Default `overtimeType` for W2 hourly hours beyond 40 to `'1.5'` on import and on row add, with an operator override; add the OT test (S5) | S |
| 8 | Fix range queries to send explicit local-zone bounds (`${from}T00:00:00-04:00` via date-fns-tz) or compare on `(clock_in AT TIME ZONE 'America/New_York')::date` in an RPC (S6) | S |
| 9 | Share the sqft/pay-basis resolver between crew and payroll (`crewPayBasis.ts`, §5) so the phone and the payroll row agree (S8); trim list-query metadata projection | M |
| 10 | Add `setUnsavedWork('payroll', isDirty)` + `beforeunload` to `PayrollPage`; delete the dead symbols in §6; dedupe `isRlsOrPermissionError`/`personKey`/photo thumbs | S |
