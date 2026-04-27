# A5-c.2 — C2-4a (change_orders, project_actuals, project_proforma_versions)

Routine half of C2-4 (PO/financial). Complex half (po_headers, po_lines, proforma_inputs) ships separately as C2-4b.

**Tables (3):** `change_orders`, `project_actuals`, `project_proforma_versions`.

**Migration:** `supabase/migrations/20260427_a5c2_c4a_change_orders_actuals_versions.sql`. 10 policies in one transaction.

## Why this is split out from C2-4

C2-4 pre-flight (4.1, 4.3, 4.5) revealed that `po_headers` / `po_lines` have NO `organization_id` column — they inherit org scope from `projects` via FK join — and `proforma_inputs` has a mixed owner-based + org-based pattern with 4-condition INSERT WITH CHECK. These three tables deserve careful review and separate testing.

The other three tables (`change_orders`, `project_actuals`, `project_proforma_versions`) all use the standard `organization_id_uuid = helper()` pattern with familiar shapes from C2-1/C2-2/C2-3 (FOR ALL, admin-only DELETE, inline subquery → helper-call). Routine.

## Patterns preserved verbatim

- `change_orders`: 1 SELECT (active) + 1 FOR ALL (editor) — same shape as C2-3 `estimate_templates` / `item_templates`.
- `project_actuals`: SELECT (active), INSERT/UPDATE (editor), DELETE (**admin-only**) — same shape as C2-3 `estimates`.
- `project_proforma_versions`: 4 separate policies, no role gating (any user in org) — same shape as C2-2 `deals`.

## Apply on branch

```
Apply supabase/migrations/20260427_a5c2_c4a_change_orders_actuals_versions.sql
against Supabase project clqgnnydrwpgxvipyotd only. Do not apply to prod.
Do not edit the file. If the migration raises any exception, paste the full
error verbatim and stop. If it succeeds, confirm the COMMIT.

Then run these post-apply queries on branch and paste raw JSON, labeled:

-- 4a.2.1
select tablename, policyname, cmd, roles,
       (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
       (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
from pg_policies
where schemaname='public'
  and tablename in ('change_orders','project_actuals','project_proforma_versions')
order by tablename, policyname;

-- 4a.2.2
select tablename, count(*) as n
from pg_policies
where schemaname='public'
  and tablename in ('change_orders','project_actuals','project_proforma_versions')
group by tablename
order by tablename;
```

Expected:
- **4a.2.1**: 10 rows, all booleans `false`/`null`.
- **4a.2.2**: change_orders 2, project_actuals 4, project_proforma_versions 4.

## Apply on prod

Same migration file, same SQL gate. Then:

## App smoke (manual)

- [ ] Open a project → change orders list (if any) shows existing entries
- [ ] Add a new change order → succeeds
- [ ] Edit an existing change order → succeeds
- [ ] Project actuals view loads (cost tracking) → numbers display
- [ ] Add an actual cost entry → succeeds
- [ ] Edit / delete an actual cost entry → succeeds (delete requires admin role)
- [ ] If you have a proforma versioning UI on project pages, confirm version list loads and you can save a new version

Drywall app: if it touches change_orders or project_actuals, verify; otherwise just confirm dashboard loads.