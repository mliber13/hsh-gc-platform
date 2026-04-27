# A5-c.2 — C2-3 (estimate/trade subsystem)

Third chunk of A5-c.2 UUID policy rewrites. See `A5_PLAN.md` §10.1 row 3.

**Tables (5):** `estimates`, `estimate_templates`, `trades`, `sub_items`, `item_templates`.

Execution order:
1. **Pre-flight** ✅ done (see this doc §1).
2. **Migration** — `supabase/migrations/20260427_a5c2_c3_estimates_trades.sql` (see §2).
3. **Branch apply + SQL gate** — see §3 (no Node smoke; branch has 0 rows in all 5 tables).
4. **Prod apply + SQL gate + app smoke** — see §4 (1633 rows of real data).

---

## 1) Pre-flight summary

Run on 2026-04-27. Headline: **branch and prod differ only on the column referenced** (uuid on branch, text on prod), but C2-3 has more nuance than C2-2 because role-gating differs across the 5 tables.

### 1.1 Per-table policy shape (16 total)

| Table | Total | Mode | Role gating |
|---|---|---|---|
| `estimates` | 4 | separate SELECT/INSERT/UPDATE/DELETE | SELECT: `is_user_active`. INSERT/UPDATE: `user_can_edit`. **DELETE: `user_is_admin`** |
| `estimate_templates` | 2 | 1 SELECT + 1 `FOR ALL` | SELECT: `is_user_active`. ALL: `user_can_edit` |
| `trades` | 4 | separate SELECT/INSERT/UPDATE/DELETE | SELECT: `is_user_active`. INSERT/UPDATE/DELETE: `user_can_edit` (DELETE explicitly **not** admin-only — different from `estimates`) |
| `item_templates` | 2 | 1 SELECT + 1 `FOR ALL` | SELECT: `is_user_active`. ALL: `user_can_edit` |
| `sub_items` | 4 | separate, no role gating | none — any user in org can do anything |

All gates above are **pre-existing semantics** preserved verbatim. C2-3 is not the place to harmonize them (would be a separate scope decision).

### 1.2 Backfill / data shape

| Table | Branch rows | Prod rows | uuid_null_rows |
|---|---|---|---|
| estimates | 0 | 187 | 0 / 0 |
| estimate_templates | 0 | 1 | 0 / 0 |
| item_templates | 0 | 180 | 0 / 0 |
| sub_items | 0 | 21 | 0 / 0 |
| trades | 0 | **1244** | 0 / 0 |

Total prod rows touched: **1633**. All HSH; all 5 prod profiles have HSH uuid → zero row-visibility change.

### 1.3 Other invariants

- RLS enabled on all 5 tables, both envs ✓
- Both columns present on all 5 tables (text NOT NULL + uuid YES nullable), identical between envs ✓
- Bridge triggers attached on all 5 tables, both envs ✓
- Only `default-org` (text) and HSH UUID values present on prod ✓
- `get_user_organization_uuid()` exists with correct return type ✓

## 2) Migration — `supabase/migrations/20260427_a5c2_c3_estimates_trades.sql`

Single transaction. 16 DROP+CREATE pairs. Pre-flight DO + post-apply DO with per-table policy count assertions.

**Pattern:** all policies → `organization_id_uuid = public.get_user_organization_uuid()`. Role gates preserved exactly. INSERT/UPDATE/DELETE on every table get the standard `IS NOT NULL AND ...` defense-in-depth guard.

**Pre-existing inconsistencies preserved verbatim** (would be a separate cleanup):
- `estimates` DELETE → `user_is_admin`; `trades` DELETE → `user_can_edit`. (Why a DBA can't delete a trade but can delete an estimate is unclear, but it's not A5 scope.)
- `sub_items` has no role gating; the other 4 tables do. (Probably intentional — sub_items is line-item data within an estimate that any team member needs to edit.)

## 3) Branch apply + SQL gate

### 3.1 Apply on branch

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c3_estimates_trades.sql` against Supabase project `clqgnnydrwpgxvipyotd` only. Do not apply to prod. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then immediately run these post-apply SQL queries on the same branch project and paste raw JSON output, labeled:
>
> ```sql
> -- 3.2.1 Policy inventory (expect 16 rows, all booleans false or null)
> select tablename, policyname, cmd, roles,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('estimates','estimate_templates','trades','sub_items','item_templates')
> order by tablename, policyname;
>
> -- 3.2.2 Per-table policy counts (expect 4/2/4/2/4)
> select tablename, count(*) as n
> from pg_policies
> where schemaname='public'
>   and tablename in ('estimates','estimate_templates','trades','sub_items','item_templates')
> group by tablename
> order by tablename;
> ```
>
> Stop after posting output.

### 3.2 Branch sign-off criteria

- 3.2.1: 16 rows, every `qual_bare_text_ref` and `wc_bare_text_ref` is `false` or `null`.
- 3.2.2: `estimate_templates` 2, `estimates` 4, `item_templates` 2, `sub_items` 4, `trades` 4.

### 3.3 No Node smoke for C2-3

Branch has 0 rows in all 5 tables. Runtime RLS smoke tests would just confirm "no user sees any rows in empty tables" — meaningless. The pattern (`organization_id_uuid = get_user_organization_uuid()`) is already proven by C2-1 and C2-2. The migration's internal post-check DO block enforces shape invariants. Real-data validation happens in §4.3 prod app smoke.

## 4) Prod apply + smoke

**Gate:** §3.2 passes.

### 4.1 Apply on prod

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c3_estimates_trades.sql` against Supabase project `rvtdavpsvrhbktbxquzm` (prod) only. Do not apply to branch again. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then immediately run the same two SQL queries from §3.2.1/§3.2.2 on prod, labeled `4.2.1` / `4.2.2`. Stop after posting output.

### 4.2 Post-apply SQL gate (prod)

Same as §3.2.

### 4.3 App smoke (manual, both apps)

Click through estimate/trade flows. The 1633 prod rows give us real-data confidence here.

**GC platform (`hsh-gc-platform`):**
- [ ] Open a project → estimates list shows existing estimates
- [ ] Open an estimate → trades and sub_items render correctly
- [ ] Trade quantities, costs, totals all show correct numbers
- [ ] Add a new trade to an existing estimate → succeeds
- [ ] Edit an existing trade (change quantity / rate) → saves
- [ ] Delete a trade (if you have a throwaway one) → succeeds (uses `user_can_edit`, not admin-only)
- [ ] Estimate templates dropdown / list loads
- [ ] If you have a trade that's marked `is_subcontracted` or has a `quote_vendor`, confirm those fields still display
- [ ] Item templates picker (when adding a sub-item from a template) loads with all 180 templates

**Drywall app (`hsh-drywall-app`):**
- [ ] If Drywall surfaces estimates / trades anywhere (it might in payroll cost reports), confirm those views load. If it doesn't touch these tables, just confirm general dashboard works.

### 4.4 What "fail" looks like

- Estimate or trade lists show fewer rows than before → over-filtering (would be very unexpected; all rows have HSH uuid and all profiles have HSH uuid).
- Trade delete throws RLS error → policy is wrong (we kept `user_can_edit` not `user_is_admin`, matching pre-existing behavior; if existing flows worked before, they'll work after).
- Sub-item create on an estimate throws → bridge trigger didn't run, or sub_items policy is wrong.

If anything looks off: paste symptom + console error here and stop touching prod.

### 4.5 Sign-off

When §4.2 + §4.3 green, C2-3 is done. Add §9.7 to `A5_PLAN.md`. Possible next: C2-4 (PO / financial) if time permits, otherwise commit and stop.