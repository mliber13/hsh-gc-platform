# A5-c.2 — C2-5 (labor / payroll subsystem)

Largest chunk so far. **Tables (11):** `labor_entries`, `material_entries`, `subcontractor_entries`, `time_entries`, `employee_classes`, `labor_burden_rates`, `labor_burden_recalibrations`, `labor_import_batches`, `labor_import_errors`, `qbo_wage_allocation_config`, `pay_periods`.

**Migration:** `supabase/migrations/20260427_a5c2_c5_labor_payroll.sql`. 32 policies in one transaction.

## Why this is doable as one chunk

All 11 tables are recombinations of patterns already proven in C2-1 through C2-4b:
- 8 tables: standard helper-call swap + role gates (C2-1/C2-2/C2-3 shape).
- 1 table (`labor_import_errors`): EXISTS-join through `labor_import_batches` (C2-4b po_lines shape).
- 1 table (`pay_periods`): inline-subquery → helper-call (C2-2 deals shape).
- 1 table (`time_entries`): used `current_user_organization_id()` helper; switched to `get_user_organization_uuid()` for consistency.

No novel patterns. No missing-column surprises (only `labor_import_errors` lacks own org column, and we know that's an EXISTS-join inheritance).

## Pre-existing semantics preserved verbatim

- `labor_import_batches` and `labor_import_errors` have **only SELECT + INSERT** — no UPDATE/DELETE policies. Probably intentional (immutable batch records). Migration adds nothing.
- `pay_periods` has **no role gating** (any active user in org can do anything). Preserve.
- `time_entries` has **no role gating**. Preserve. Switching the helper from `current_user_organization_id()` to `get_user_organization_uuid()` is the only material change.

## Prod row counts

| Table | Rows |
|---|---|
| labor_entries | 4 |
| material_entries | 264 |
| subcontractor_entries | 93 |
| time_entries | 1 |
| employee_classes | 0 |
| labor_burden_rates | 3 |
| labor_burden_recalibrations | 0 |
| labor_import_batches | 13 |
| labor_import_errors | **8730** |
| qbo_wage_allocation_config | 1 |
| pay_periods | 13 |
| **total** | **9118** |

All HSH; all 5 prod profiles HSH → zero row visibility change for HSH users.

Branch: empty across all 11. No Node smoke; SQL gate + prod app smoke is the validation.

## Apply on branch

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c5_labor_payroll.sql` against Supabase project `clqgnnydrwpgxvipyotd` only. Do not apply to prod. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then run these post-apply queries on branch and paste raw JSON, labeled:
>
> ```sql
> -- 5.2.1
> select tablename, policyname, cmd,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('labor_entries','material_entries','subcontractor_entries','time_entries','employee_classes','labor_burden_rates','labor_burden_recalibrations','labor_import_batches','labor_import_errors','qbo_wage_allocation_config','pay_periods')
> order by tablename, policyname;
>
> -- 5.2.2
> select tablename, count(*) as n
> from pg_policies
> where schemaname='public'
>   and tablename in ('labor_entries','material_entries','subcontractor_entries','time_entries','employee_classes','labor_burden_rates','labor_burden_recalibrations','labor_import_batches','labor_import_errors','qbo_wage_allocation_config','pay_periods')
> group by tablename
> order by tablename;
> ```

Expected:
- **5.2.1**: 32 rows, all booleans `false`/`null`.
- **5.2.2**: per-table counts — labor_entries 4, material_entries 4, subcontractor_entries 4, time_entries 4, pay_periods 4, all others 2.

## Apply on prod

Same migration file, same SQL gate.

## App smoke (manual, both apps)

**Drywall app is the heavy surface here.**

GC platform:
- [ ] Project actuals view → labor / material / subcontractor entries render
- [ ] Add a labor entry to a project → succeeds
- [ ] Edit a material entry → saves
- [ ] Trade categories / employee classes admin (if exposed) → loads

Drywall app:
- [ ] Dashboard / labor view loads
- [ ] Time entries list loads (only 1 prod row but it should appear)
- [ ] Pay periods list / payroll runs view loads (13 rows)
- [ ] Open a pay period → payload data renders
- [ ] If you have labor import flows, exercise an existing imported batch view (should show 13 batches with 8730 rows of error history)
- [ ] If you have a "create new pay period" flow, exercise it
- [ ] QBO wage allocation config (if exposed) → 1 row visible

## What "fail" looks like

- Any list shows 0 rows where it should show data (especially material_entries 264 or subcontractor_entries 93) → SELECT policy filtering wrong.
- Time entry create / edit throws → the helper switch broke something specific to time_entries.
- Pay period save throws → pay_periods INSERT WITH CHECK rejecting.
- labor_import_errors invisible when viewing a batch → EXISTS-join broken (verify `labor_import_batches.organization_id_uuid` is populated; pre-flight 5.7 errored on labor_import_errors only because that table has no own column).

## Sign-off

When SQL gate + app smoke green on both apps, C2-5 is done.