# Crew Time Clock & Job Progress — Design Spec (v2)

**Status:** Spec for build (2026-07-16, rewritten after Mark's brain dump). Replaces v1.
**Why:** Hard blocker for retiring Buildertrend. Two jobs: (1) replace the BT **clock** for hourly crew, and (2) replace the **Monday-morning text** where hangers/finishers report piece work — by turning it into a **daily task-progress log** that drives pay, schedule, and analytics at once.

---

## 1. The big idea — one input, three payoffs

Crew marking **tasks** on a job's schedule items is a single action that feeds:
1. **Pay** — pay-linked tasks (finish steps, hang) drive piece pay.
2. **Schedule** — task completion is live job progress; office sees slippage.
3. **Analytics** — labor cost / margin accrue daily instead of being reconstructed Monday.

This **merges two backlog items** — "crew time clock (piece flow)" and "schedule-item tasks" — into one feature. The **attendance clock** (Flow B) stays a separate, simpler thing for the hourly folks.

---

## 2. Roles & pay rules (ground truth from Mark)

| Role | Pay | Mechanism | Clocks in? |
|---|---|---|---|
| **Hanger** (1099 sub, runs own crew off our books) | Piece: `sqft × hang_rate`, whole job | Marks the **Hang** task; sqft from field measure | **No** |
| **Finisher** (journeyman) | Piece: `Σ over steps of (step% × sqft × finish_rate/N)` | Marks **finish-step tasks** % complete (partial OK) | No (unless doing hourly/pointup) |
| **Apprentice / assistant finisher** (helper) | **Day rate** per day, **deducted from the journeyman's piece** for that job | Assigned to job as helper; day rate = `hourly × 9` | Day-rate → clock for days present |
| **Pointup** | Hourly **or** day rate (per person) | Clock; ~2 return trips/job typical | **Yes** |
| **Clean / prep** | Hourly now → **maybe salary** (allocated across jobs by schedule) | Clock (hourly); salaried → schedule-based allocation | **Yes** |

**Key rules:**
- **Piece = Hangers + Finishers only.** Everyone else is hourly / day-rate / salary.
- **Pay mode (true-hourly vs day-rate) is a per-person attribute.** Day rate = `hourly × 9` (always a full day).
- **Sqft for piece = field-measure / ordered sqft** (mirrors how the app flips quoted → field; by the time anyone works, field measure exists).
- **Finish steps come from the scope**, office confirms them as the tasks on the Finish item. **Rate spread evenly:** each step = `finish_rate ÷ N`.
- **Only one hanger per job** — never split on our books.

---

## 3. Existing foundation (reuse — do NOT rebuild)

- **`schedule_items`** table + `ScheduleItemDialog` (shared editor, both surfaces) — where tasks get added.
- **`time_entries`** + `hrTimeService` (`clockIn`, `clockOut`, `fetchMyOpenPunch` [derives person from `profile.hr_person_id`], `fetchEntriesForPayrollImport` [aggregates → per-person/job hours]). Operator UI: `TimeClockPage`, `TimeEntryEditDialog`, `TimeClockImportDialog`.
- **Payroll model** (`src/types/payroll.ts`): `PayrollPieceEntry` (`piece_key, phasesCompleted, totalPhases, jobTotalSqft, rate, amount`), `PayrollHourEntry` (`hours, rateOverride, overtimeType, assignRate…`). Piece math + project rates (`projectLaborRateForPieceKey`, `calculatePieceTotal`) + **helper deduction** (`helperAssignDeductionAmount`, lead-job deduction) all exist.
- **Field measure sqft**: `fieldMeasuredSqft` list projection / order sqft.
- **Crew infra**: crew accounts, `CrewShell`, `/crew`, per-person schedule assignment (`schedule_items.assigned_persons`), SECURITY DEFINER crew-write pattern (`save_field_takeoff_as_measurer`, `append_drywall_comms_log_entry`).
- **Salaried allocation** precedent: effective-dated salary + `qbo_wage_allocation_config`.

---

## 4. Flow A — Task-driven progress & piece pay (the big one)

### 4.1 Tasks on schedule items
Office adds **tasks** to a schedule item (in `ScheduleItemDialog`). Each task has:
- `label` (e.g., "Skim", "Paper Floors")
- `payLinked: boolean` — does completing it drive piece pay?
- if pay-linked: `pieceKey` (finish step / hang) — used to resolve the rate + payroll `piece_key`
- `progressMode: 'percent' | 'check'` — finish steps/hang track **% complete** (partial); prep-type tasks are a **checkbox**.

Examples:
- **Finish** item → pay-linked % tasks: Tape, Bed, Skim, [Texture | Level 5], Sand (the scope's set; office confirms).
- **Hang** item → one pay-linked task "Hang" carrying job sqft (defaults to field measure).
- **Prep** item → check-only tasks: Paper Floors, Plastic off tubs, Plastic off exterior doors (captured for schedule/analytics; no pay).

### 4.2 Crew marks progress (the daily log)
On `/crew`, an assigned hanger/finisher opens a job → sees its tasks → updates **cumulative % complete** per pay task (or checks off progress tasks). Design for **daily, tolerant of weekly** — someone who only updates Monday just sets the cumulative % once; no daily requirement.

### 4.3 Cumulative % → delta pay (the core mechanic)
Each pay task carries a **cumulative % complete**. At payroll:
- **This period's pay = (current % − last-paid %) × sqft × rate.**
- The system **snapshots the last-paid %** per task per person at each payroll close, so the next period pays only the movement.
- Finisher step rate = `finish_rate ÷ N`; hang rate = `hang_rate` on the single hang task; sqft = field-measure sqft.
- Generates draft `PayrollPieceEntry` rows (`piece_key`, `jobTotalSqft`, `rate`, and the delta encoded via `phasesCompleted/amount`).

### 4.4 Helper deduction
When a journeyman finisher has an assigned helper on the job, the helper's **day rate × days present** is **deducted from the journeyman's piece** for that job — reuse the existing helper-deduction path. Helper's day presence comes from the clock (Flow B) or a simple "days on job" entry.

### 4.5 Backend
- Tasks: store on `schedule_items` (JSONB `tasks[]`) — office writes via existing operator permission.
- Progress: a **`task_progress`** record per (task, person, cumulative %, updated_at) — crew writes via SECURITY DEFINER `crew_update_task_progress(p_schedule_item_id, p_task_id, p_pct)` (validates crew + assigned to job). Keep a paid-% snapshot for the delta math.
- Payroll import reads current progress + last-paid snapshot → builds piece-entry drafts.

---

## 5. Flow B — Attendance clock (hourly / day-rate crew)

For helpers, pointup, clean/prep (**not** piece hangers/finishers). Replaces the BT clock.

- **Clock in/out per job** → `time_entries` (engine exists). Crew-write via SECURITY DEFINER `crew_clock_in/out` (derive person from profile; crew can't insert directly).
- **Breaks / lunch: unpaid, auto-deducted.** Deduct an unpaid lunch once worked hours exceed a threshold (rule as an org setting, e.g., 30 min after 5–6 hrs). Affects hours, not piece.
- **Soft geofence:** capture browser geolocation on punch (net-new). Job geofence = center from project address geocode + org-default radius (per-job override). **Never blocks** — record + flag out-of-fence punches for payroll review. Add `clock_in_lat/lng`, `clock_out_lat/lng`, `in_fence` flags to `time_entries`.
- **Pay mode per person:** day-rate (`hourly × 9`, guaranteed full day → pay = days × day-rate) vs true-hourly (actual clocked hours). Store the mode on the person (org_team).

---

## 6. Payroll integration & review (Monday)

Everything lands as **drafts Mark reviews/edits/approves** — nothing auto-finalizes.
- Piece: the task-progress deltas pre-fill piece entries (per person, job, step).
- Hourly/day-rate: clocked time → hour entries (day-rate people = days × rate; true-hourly = clocked hours minus lunch).
- Helper day-rates show as deductions against the journeyman's piece.
- Geofence/out-of-fence flags surfaced for sanity check.
- On approve, snapshot the paid-% per task so next period pays only the movement.

---

## 7. Data model summary (new)
- `schedule_items.tasks` JSONB: `[{ id, label, payLinked, pieceKey?, progressMode }]`.
- `task_progress`: `(id, organization_id, schedule_item_id, task_id, project_id, person_id, person_type, pct, updated_at)` + a per-payroll **paid-% snapshot** (column or sibling table).
- `time_entries` additions: geofence lat/lng + in-fence flags; (lunch auto-deduct can be computed at import, not stored).
- Org settings: lunch rule, geofence default radius, per-person pay mode.
- RPCs (SECURITY DEFINER, person from profile, validate crew + assignment): `crew_update_task_progress`, `crew_clock_in`, `crew_clock_out`.

---

## 8. Phasing (build order)
- **Phase 1 — Tasks on schedule items (office side):** add task authoring to `ScheduleItemDialog` (pay-linked vs check, pieceKey, %/check). No crew/pay yet. Immediately useful for schedule progress + captures the finish-step sets.
- **Phase 2 — Crew progress log:** `/crew` UI to mark % / check tasks + `crew_update_task_progress` RPC. Drives **schedule + analytics** now; pay wiring next. (Highest-value, lower-risk — the Monday-text replacement.)
- **Phase 3 — Piece pay from progress:** cumulative-% → delta → draft piece entries + paid-% snapshot + payroll review. Helper deductions. (The careful payroll one.)
- **Phase 4 — Attendance clock:** crew clock in/out + lunch auto-deduct + pay-mode → payroll (hourly/day-rate crew).
- **Phase 5 — Soft geofence:** location capture + job fence + flags.
- **Phase 6 — Salaried clean/prep allocation** by schedule (if/when that role goes salary).

---

## 9. Open questions / decisions before the phases that need them
1. **Delta mechanic edge cases (Phase 3):** worked examples — a finisher who reports 40% skim this week, 100% next; two finishers splitting a job's steps; a job that carries across a payroll boundary. Confirm pay = delta handles each.
2. **Hang task = whole-job sqft** — confirm hanger just marks it complete (pays full field-measure sqft), with partial % only as a rare exception.
3. **Day-rate "days present"** source — from the clock (Flow B) or a lightweight "days on job" entry for helpers who don't otherwise clock.
4. **Task authoring convenience:** default task sets per scope (auto-add the finish steps when a Finish item is created) so the office isn't retyping them each job.
5. **Lunch rule** exact threshold; **geofence** default radius.
