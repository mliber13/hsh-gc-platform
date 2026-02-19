# Labor: QBO Wages + Burden (Phase 1) – Design Notes

## Approach

- **Single canonical table:** We **extend** the existing `labor_entries` table in Supabase instead of adding a second labor table. All labor (manual, QBO-imported, and future timeclock) lives in one place; the app distinguishes by `source_system` and shows totals additively with clear labels.
- **Additive display:** Manual and QBO labor are **additive**. The UI shows separate lines/totals (e.g. "Labor (Wages) – Manual", "Labor (Wages) – QBO") so duplicate or mistaken entries are visible and can be corrected.
- **Burden:** Stored on each row (`burden_amount`). Rate comes from `labor_burden_rates`; Phase 1 uses **global default rate only** (no employee/class assignment from QBO JEs).
- **Idempotent QBO import:** `(source_system, source_id)` unique constraint where `source_id` is set; re-imports upsert by that key.

## Migration

- **042_labor_entries_qbo_burden.sql** extends `labor_entries` and adds supporting tables:
  - **labor_entries:** `source_system`, `source_id`, `import_batch_id`, `work_date`, `period_start`/`period_end`, `employee_id`, `employee_class_id`, `gross_wages`, `burden_amount`; `hours` made nullable; unique index on `(source_system, source_id)` where `source_id IS NOT NULL`.
  - **employee_classes**, **labor_burden_rates** (global default = `employee_class_id` NULL), **qbo_wage_allocation_config**, **labor_import_batches**, **labor_import_errors**, **labor_burden_recalibrations**.

## Work date rule (QBO import)

- For QBO JE import, `work_date` = JE transaction date (or `period_end` if you derive it later). `date` (existing column) is set from `work_date` for display/ordering. `period_start` / `period_end` remain null unless the import can populate them.

## Phase 2

- See **docs/phase-2-real-time-labor.md** for future timeclock integration: time entries, approval flow, idempotent keys, resync after payroll approval, and UI (Unapproved vs Approved). Minimal type stubs: **src/types/phase2Labor.ts**.
