# A5-c.2 — C2-4b (po_headers, po_lines, proforma_inputs)

Complex half of C2-4. Pairs with `A5C2_C4A_CHANGE_ORDERS_ACTUALS_VERSIONS.md`.

**Tables (3):** `po_headers`, `po_lines`, `proforma_inputs`.

**Migration:** `supabase/migrations/20260427_a5c2_c4b_po_proforma.sql`. 10 policies rewritten in one transaction. (proforma_inputs UPDATE/DELETE intentionally untouched — they're owner-based with no `organization_id` reference at all.)

## What makes these tables special

### po_headers and po_lines have no `organization_id` column

Pre-flight 4.3 / 4.4 confirmed: querying for `organization_id` / `organization_id_uuid` on `po_headers` and `po_lines` errors with `column does not exist`. They inherit org scope from `projects` via FK join:

- `po_headers.project_id → projects.id`
- `po_lines.po_id → po_headers.id → po_headers.project_id → projects.id`

Their RLS policies all wrap `EXISTS (SELECT 1 FROM projects p WHERE p.id = ... AND p.organization_id = get_user_organization() AND <role gate>)`. The migration swaps the inner equality to `p.organization_id_uuid = public.get_user_organization_uuid()`.

**Implication:** there is no bridge trigger on these tables (confirmed by 4.5). The "all rows have correct uuid" guarantee comes from `projects.organization_id_uuid` being non-null and backfilled — already verified in C2-1 pre-flight.

### proforma_inputs has a mixed owner-based + org-based model

| Policy | Pattern | Touched by C2-4b? |
|---|---|---|
| SELECT (view) | org match + active + project-belongs-to-org | yes — swap text→uuid in both org refs |
| INSERT (create) | `auth.uid()=user_id` AND org match AND `user_can_edit` AND project-belongs-to-org | yes — swap text→uuid in both org refs; preserve owner check; add IS NOT NULL guard |
| UPDATE (own) | `auth.uid()=user_id` only | **no — no organization_id reference, leave as-is** |
| DELETE (own) | `auth.uid()=user_id` only | **no — leave as-is** |

The pre-existing UPDATE/DELETE owner-based policies don't enforce organization scoping — a user retains control of their own proforma_inputs row even if their profile is deactivated or moved between orgs. That's a pre-existing semantic; harmonizing it is out of A5 scope.

## Pre-flight invariants (in migration)

- `get_user_organization_uuid()` exists.
- `proforma_inputs.organization_id_uuid` has zero NULLs.
- `projects.organization_id_uuid` has zero NULLs (po_headers/po_lines policies depend on this).

## Apply on branch

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c4b_po_proforma.sql` against Supabase project `clqgnnydrwpgxvipyotd` only. Do not apply to prod. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then run these post-apply queries on branch and paste raw JSON, labeled:
>
> ```sql
> -- 4b.2.1
> select tablename, policyname, cmd, roles,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('po_headers','po_lines','proforma_inputs')
> order by tablename, policyname;
>
> -- 4b.2.2
> select tablename, count(*) as n
> from pg_policies
> where schemaname='public'
>   and tablename in ('po_headers','po_lines','proforma_inputs')
> group by tablename
> order by tablename;
> ```

Expected:
- **4b.2.1**: 12 rows. Booleans should be `false` or `null` for all 10 touched policies. **Note:** the proforma_inputs UPDATE and DELETE policies should also be `false`/`null` (they don't reference organization_id at all).
- **4b.2.2**: po_headers 4, po_lines 4, proforma_inputs 4.

## Apply on prod

Same migration file, same SQL gate.

## App smoke (manual, both apps)

**These are PO and proforma flows — money-path verification.**

GC platform:
- [ ] Open a project with POs → PO list loads (count should match what you saw before)
- [ ] Open a PO → line items render correctly
- [ ] Add a new PO → succeeds
- [ ] Add a PO line → succeeds
- [ ] Edit a PO header field (status, vendor) → saves
- [ ] Edit a PO line (quantity, unit price) → saves
- [ ] (Optional) delete a PO line you created for testing → succeeds (uses `user_can_edit`)
- [ ] Open a project with a proforma → proforma inputs load with all fields populated (contract value, payment milestones, rental units etc.)
- [ ] Edit a proforma input (any field) → saves
- [ ] Create a new proforma input on a project → succeeds (4-condition INSERT WITH CHECK; if this fails, the policy assembly is wrong)
- [ ] Try saving a proforma version (if that's a flow) → succeeds

Drywall app: just confirm dashboard loads if Drywall doesn't surface PO/proforma.

## What "fail" looks like

- PO list empty when projects have POs → EXISTS-join broken; check that helper returns the user's HSH uuid and that projects have matching `organization_id_uuid`.
- New PO insert throws RLS error → INSERT WITH CHECK rejecting; likely because `user_can_edit()` returns false unexpectedly OR the project linkage is wrong.
- New PO line insert throws → po_lines deeper join (po_headers JOIN projects) broken.
- Existing proforma inputs invisible → the 3-condition SELECT policy has a bug; verify project linkage.
- Cannot create a new proforma input → 4-condition INSERT broken; check `auth.uid() = user_id` is being supplied (the app code must set user_id explicitly).

If anything looks off: paste symptom + console error here and stop touching prod.

## Sign-off

When SQL gate + app smoke green, C2-4 (both halves) is done. Proceed to commit and chunk closure in `A5_PLAN.md`.