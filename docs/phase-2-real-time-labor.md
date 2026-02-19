# Phase 2: Real-Time Labor (Timeclock Integration)

**Status:** Design only. Not implemented. This document describes the intended model and integration pattern for a future phase.

---

## Goal

- Time entries created at **clock-out** (or on save from a timeclock device/app).
- Entries flow into the same canonical **`labor_entries`** table used by Phase 1 (manual + QBO).
- Support **pending vs approved** labor so payroll approval can be reflected and resync is predictable.
- UI can show **Unapproved vs Approved** labor and prevent double-counting when QBO/payroll data arrives later.

---

## Data Model (additions to existing)

### 1. Same table: `labor_entries`

- **Source:** New `source_system` value(s), e.g. `'timeclock'` or per-integration (`'drywall'`, `'timetracking'`, etc.).
- **Idempotent key:** `(source_system, source_id)` where `source_id` = external time entry id (e.g. `timeEntryId` from the timeclock system).
- **Status:** Add optional `approval_status` to `labor_entries`:
  - `pending` – entered from timeclock, not yet approved for payroll.
  - `approved` – approved (e.g. by supervisor); can be included in payroll export / QBO sync.
  - `null` – legacy or manual/QBO rows; treat as “approved” for reporting.
- **Existing columns used:** `work_date`, `period_start`/`period_end`, `employee_id`, `employee_class_id`, `hours`, `gross_wages`, `burden_amount`, `amount` (total labor cost).

### 2. Time entries (external system)

- Time entries are created in the **external** timeclock system (e.g. on clock-out).
- Each time entry has: employee, project/job, date (or period), hours, and optionally rate/wage.
- We do **not** duplicate a full “time_entries” table in the GC app for Phase 2; we **upsert** into `labor_entries` when we sync from the timeclock (or when payroll approves and sends a feed).

### 3. Sync flow (timeclock → GC app)

- **Direction:** Timeclock system → GC app (pull or webhook).
- **Idempotent upsert:** For each time entry (or approved batch):
  - `source_system` = e.g. `'timeclock'` or integration name.
  - `source_id` = timeclock’s time entry id (string).
  - Upsert into `labor_entries` on `(source_system, source_id)`:
    - Set `work_date`, `period_start`/`period_end`, `employee_id`, `employee_class_id`, `hours`, `gross_wages`, `burden_amount`, `amount`, `approval_status`, etc.
  - Re-runs of the same `source_id` overwrite; no duplicate rows.

### 4. Approval flow

- **Pending:** New time entries land as `approval_status = 'pending'`.
- **Approved:** When a supervisor (or payroll) approves in the timeclock system, the sync updates the same row to `approval_status = 'approved'` (or a separate “approved” sync creates/updates rows with that status).
- **Reporting:** Project labor totals can:
  - Include only `approval_status = 'approved'` (and `null` for legacy), or
  - Show **Unapproved** and **Approved** separately so managers see what’s not yet in “official” cost.

### 5. Interaction with QBO / payroll (resync after approval)

- **QBO (Phase 1):** Wages are allocated to jobs via Journal Entries in QBO. Those JEs are imported into `labor_entries` with `source_system = 'qbo'` and their own `source_id`.
- **Conflict avoidance:** A given project/period might eventually have:
  - **Timeclock rows** (`source_system = 'timeclock'`, pending then approved) – hours and estimated wages + burden.
  - **QBO rows** (`source_system = 'qbo'`) – actual gross wages from the books.
- **Recommended approach:**
  - **Option A – Replace:** When payroll runs and JEs are created in QBO, run the QBO labor import for that period; do **not** also keep the timeclock rows for the same period (treat timeclock as “pre-payroll” and QBO as “post-payroll” truth). Either:
    - Delete or mark timeclock rows for that period as superseded, or
    - Stop syncing timeclock for that period once QBO import has run (and rely on QBO as source of record for wages).
  - **Option B – Additive with clear labels:** Keep both: timeclock rows (approved) show “estimated from time” and QBO rows show “actual from payroll.” UI shows both with labels (e.g. “Labor – Time (Est.)” vs “Labor – QBO (Actual)”). Reconcile in reporting (e.g. variance between time-estimated and QBO actual).
- **Resync after payroll approval:** When the timeclock system marks a period as “approved for payroll,” the GC app can:
  1. Update `labor_entries` rows for that period to `approval_status = 'approved'`.
  2. Later, when QBO JEs exist, run the Phase 1 QBO import; those rows get `source_system = 'qbo'`. If using Option A, optionally archive or hide the timeclock rows for that period so totals don’t double-count.

### 6. UI (intended behavior, not built in Phase 2)

- **Labor by source:** Show labor totals grouped or labeled by source (Manual, QBO, Timeclock).
- **Unapproved vs Approved:** For timeclock (and any other pending source), show:
  - **Unapproved** – `approval_status = 'pending'` (and possibly other filters).
  - **Approved** – `approval_status = 'approved'` or `null`.
- **No double-count:** If using Option A above, only one source (e.g. QBO) contributes “actual wages” per period; if using Option B, both are shown with clear labels so the user understands which is estimate vs actual.

---

## Idempotent upsert keys (summary)

| Source        | `source_system` | `source_id` example              |
|---------------|------------------|-----------------------------------|
| Manual (app)  | `'manual'`      | `null` or row id                  |
| QBO JE import | `'qbo'`         | `{journalEntryId}:{lineId}`       |
| Timeclock     | `'timeclock'`*  | time entry id from that system   |

\* Or a per-integration name, e.g. `'drywall'`, if you have multiple timeclock sources.

---

## Schema changes required in Phase 2 (not applied yet)

- **labor_entries:** Add `approval_status TEXT CHECK (approval_status IN ('pending', 'approved'))` (nullable).
- **labor_entries:** Extend `source_system` check to include the new value(s), e.g. `'timeclock'`.
- Optional: `timeclock_sync_log` or similar for last sync time and errors (design when implementing).

---

## Stubs in codebase

- **Types:** See `src/types/phase2Labor.ts` (or equivalent) for:
  - `LaborSourceSystem` (including `'timeclock'`).
  - `LaborApprovalStatus` (`'pending' | 'approved'`).
  - Optional: `TimeEntryPayload` (shape of payload from timeclock for upsert).
- **No new endpoints or UI** in Phase 2; only documentation and type stubs so Phase 2 implementation can extend the same `labor_entries` table and reuse the idempotent key pattern.

---

## References

- Phase 1 design: **docs/LABOR_QBO_BURDEN_PHASE1.md**
- Canonical table: **labor_entries** (Supabase), extended in **042_labor_entries_qbo_burden.sql**
