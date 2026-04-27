# A5-c.2 — C2-2 (deals subsystem)

Second chunk of A5-c.2 UUID policy rewrites. See `A5_PLAN.md` §10.1 row 2.

**Tables (6):** `deals`, `deal_activity_events`, `deal_documents`, `deal_notes`, `deal_proforma_versions`, `deal_workspace_context`.

Execution order:
1. **Pre-flight** ✅ done (see this doc §1).
2. **Migration** — `supabase/migrations/20260427_a5c2_c2_deals.sql` (see §2).
3. **Branch apply + smoke** — see §3.
4. **Prod apply + smoke** — see §4.

---

## 1) Pre-flight summary

Run on 2026-04-27. Headline: **branch and prod differ on exactly one axis** — the column referenced in the policies.

| Aspect | Branch | Prod |
|---|---|---|
| Policy count | 24 (6 tables × 4 ops) | 24 |
| Filter shape | `organization_id_uuid IN (SELECT … FROM profiles WHERE id = auth.uid())` | `organization_id IN (SELECT … FROM profiles WHERE id = auth.uid())` |
| Policy names | identical to prod | identical to branch |
| RLS enabled? | yes, all 6 | yes, all 6 |
| Both columns present? | yes (text NOT NULL + uuid YES) | yes |
| `uuid_null_rows` count | 0 across all 6 | 0 across all 6 |
| Bridge trigger attached? | yes (named `trg_bridge_org_uuid_*`) | yes (named `bridge_set_org_uuid_trg`) |
| Distinct text values | only `default-org` | only `default-org` |
| Distinct uuid values | HSH + OrgB (deals only) | HSH only (all 6) |
| `get_user_organization_uuid()` exists | yes, returns `uuid` | yes, returns `uuid` |

Row counts on prod (zero risk of locking anyone out):
- `deals`: 5 (all HSH)
- `deal_activity_events`: 27 (all HSH)
- `deal_documents`: 18 (all HSH)
- `deal_notes`: 1 (HSH)
- `deal_proforma_versions`: 16 (all HSH)
- `deal_workspace_context`: 2 (all HSH)

Branch row counts: `deals` 4 (2 HSH + 2 OrgB), all child tables empty.

## 2) Migration — `supabase/migrations/20260427_a5c2_c2_deals.sql`

24 policies rewritten in a single `BEGIN; … COMMIT;` block:

- **Pre-flight DO block:** fail-hard if `get_user_organization_uuid()` missing or any of the 6 tables has a row with NULL `organization_id_uuid`.
- **6 tables × 4 ops:** every policy `DROP IF EXISTS` then `CREATE`. Names preserved exactly from current state.
  - **SELECT:** `organization_id_uuid = public.get_user_organization_uuid()`.
  - **INSERT/UPDATE/DELETE:** `organization_id_uuid IS NOT NULL AND organization_id_uuid = public.get_user_organization_uuid()` (defense-in-depth NULL guard).
- **Post-apply DO block:** fail-hard if policy count on the 6 tables ≠ 24, or if any retains a bare text `organization_id` reference (regex `organization_id[^_]`).

**Pattern decision:** swapped from inline subquery (`organization_id IN (SELECT … FROM profiles WHERE id = auth.uid())`) to helper-call (`= public.get_user_organization_uuid()`). Helper is `STABLE SECURITY DEFINER` — cached within a query plan, consistent with C2-1.

Net behavior change for HSH users: zero. They still see the same 5/27/18/1/16/2 rows. Net behavior change for branch HSH/OrgB users: zero — branch already filters on uuid via subquery (semantically equivalent to `= helper()` in single-org-per-user case).

## 3) Branch apply + smoke

### 3.1 Apply on branch

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c2_deals.sql` against Supabase project `clqgnnydrwpgxvipyotd` only. Do not apply to prod. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then immediately run these post-apply SQL queries on the same branch project and paste raw JSON output, labeled:
>
> ```sql
> -- 3.2.1 Policy inventory (expect 24 rows, all booleans false or null)
> select tablename, policyname, cmd, roles,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('deals','deal_activity_events','deal_documents','deal_notes','deal_proforma_versions','deal_workspace_context')
> order by tablename, policyname;
>
> -- 3.2.2 Confirm bridge triggers still attached
> select event_object_table, count(*) as trigger_count
> from information_schema.triggers
> where trigger_schema='public'
>   and event_object_table in ('deals','deal_activity_events','deal_documents','deal_notes','deal_proforma_versions','deal_workspace_context')
>   and trigger_name like '%bridge%'
> group by event_object_table
> order by event_object_table;
> ```
>
> Stop after posting output.

### 3.2 Post-apply SQL gate

- 3.2.1 must return 24 rows; every `qual_bare_text_ref` and `wc_bare_text_ref` must be `false` or `null`.
- 3.2.2 must show all 6 tables with `trigger_count = 2` (BEFORE INSERT + BEFORE UPDATE).

### 3.3 Branch JS smoke

Run the checked-in script `scripts/a5c2-c2-smoke.mjs`:

```
node scripts/a5c2-c2-smoke.mjs
```

Tests:
- **D1** SELECT isolation on `deals` (HSH sees 2 own, OrgB sees 2 own, no-org sees 0).
- **D2** Cross-org UPDATE blocked.
- **D3** Invite-first INSERT into `deals` blocked.
- **D4** Positive control: HSH UPDATE own deal succeeds.

(Deal-child tables not exercised on branch — they have 0 rows and would require schema-aware seed data. They get a real workout in §4 prod app smoke.)

## 4) Prod apply + smoke

**Gate:** §3 SQL + JS green.

### 4.1 Apply on prod

**Cursor prompt:**

> Apply `supabase/migrations/20260427_a5c2_c2_deals.sql` against Supabase project `rvtdavpsvrhbktbxquzm` (prod) only. Do not apply to branch again. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, confirm the COMMIT.
>
> Then immediately run the same two SQL post-apply queries from §3.2.1/§3.2.2 on prod and paste raw JSON labeled `4.2.1` / `4.2.2`. Stop after posting output.

### 4.2 Post-apply SQL gate (prod)

Same conditions as §3.2.

### 4.3 App smoke (manual, both apps)

Click through deal-related flows in both apps. Watch browser console / Network tab for 403 / RLS errors.

**GC platform (`hsh-gc-platform`):**
- [ ] Deals list loads — should show all 5 HSH deals (or however many you currently see; the count shouldn't change).
- [ ] Open a deal → detail page loads with notes / activity / documents / proforma versions / workspace context all populated where they have data.
- [ ] Add a deal note (or any quick write into a deal-child table) → succeeds; verify it appears.
- [ ] If you have a quick deal action that exercises `deal_workspace_context` (workspace switching, last-viewed deal), confirm it still tracks.
- [ ] Create a new deal → succeeds with HSH org.
- [ ] Try uploading a document on a deal (if that's a working flow) → succeeds.

**Drywall app (`hsh-drywall-app`):**
- [ ] If Drywall has any deals/proforma/quote views that read from these tables, confirm they load. (Drywall is more labor/payroll focused; deal subsystem may not surface there. If not, just confirm dashboard + projects still load.)

### 4.4 What "fail" looks like

- Any deal list shows fewer rows than before → over-filtering.
- 403 / RLS error on any deal-related page → either a policy is wrong or an app code path expects a column the migration didn't change (it didn't change any columns, only policies — so this would be unexpected).
- Deal note / document / activity event create fails with RLS error → INSERT WITH CHECK is rejecting the write, likely because the bridge trigger didn't run (would be very surprising — pre-flight 2.5 confirmed bridge triggers attached on every table).

If anything looks off: paste symptom + console error here and stop touching prod.

### 4.5 Sign-off

When §4.2 + §4.3 green, C2-2 is done. Add §9.6 to `A5_PLAN.md` recording the outcome and proceed to C2-3 (estimate/trade subsystem) planning.