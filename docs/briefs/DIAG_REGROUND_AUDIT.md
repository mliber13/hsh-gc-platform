# Cursor — re-ground the audit's live-state claims

**Read-only. No code changes, no migrations.** Before Batch 2 continues, Mark wants the audit's claims
verified rather than trusted.

**The local half is already done and passed.** I checked every file:line reference in
`docs/V1_HARDENING_PLAN_2026-09.md` mechanically: 103 of 104 resolve with the cited line in range (the
one bad reference is `estimatedMaterial.ts:312` — that file is 145 lines). Every zero-caller and LOC
claim in the P2-DEL tables is correct, including the cascades. So the code inventory is sound and does
not need re-checking.

What has failed, repeatedly, is the other kind of claim: **what is true in the database, and why a shared
resource exists.** Three of those have already bitten (`quote-documents` described as vendor-chain-only
when GC EstimateBuilder depends on it; "the write policy scopes uploads" when it never did;
`org_drywall_catalogs` described as having no crew reader when `crewWorkspaceService` reads it through a
service wrapper). Those are the ones below.

Treat every heading as a hypothesis to test, not context. If the answer contradicts it, that is the
point of the exercise.

---

## 1. P1-MONEY-7 — `project_actuals` duplicate rows

Claim: no UNIQUE constraint on `project_id`, so SELECT-then-INSERT races create duplicates and `limit(1)`
hides half the entries. If true, some project cost figures are silently wrong today.

```sql
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.project_actuals'::regclass;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'project_actuals';

select project_id, count(*) as rows
from public.project_actuals group by project_id having count(*) > 1 order by 2 desc;
```

**The third query is the one that matters** — it says whether this is theoretical or live.

---

## 2. P1-QA-2 — tables with no `CREATE TABLE` in any migration

Claim: `org_team`, `project_events`, `work_packages`, `pay_periods`, `time_entries`,
`project_milestones` exist only as Dashboard-created objects, so `supabase db reset` from scratch is
impossible. Also that RPC `increment_use_count` is called by the app but defined nowhere.

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('org_team','project_events','work_packages','pay_periods',
                     'time_entries','project_milestones')
order by 1;

select proname, pg_get_function_identity_arguments(oid)
from pg_proc where proname = 'increment_use_count';
```

Confirm they exist live, and report whether `increment_use_count` exists. If it does not, the app has a
call that always fails — find the caller and say where it is.

---

## 3. P1-QA-3 — `qb-find-vendor`

Claim: `quickbooksService.ts:263` invokes an edge function with no source in this repo. Please check the
deployed function list and report whether `qb-find-vendor` is deployed, and whether any function is
deployed that has no directory under `supabase/functions/`, or vice versa.

The audit counted 23 real function directories plus 3 empty ones — worth confirming against reality.

---

## 4. The dormancy pass

This gates Batch 6 and has never been run. It is the §3 query from the plan; row counts decide whether
whole workspaces get gated behind owner-only.

```sql
select 'deals' t, count(*) c, max(updated_at) last from public.deals
union all select 'deal_proforma_versions', count(*), max(created_at) from public.deal_proforma_versions
union all select 'tenant_pipeline_prospects', count(*), max(updated_at) from public.tenant_pipeline_prospects
union all select 'selection_books', count(*), max(updated_at) from public.selection_books
union all select 'selection_schedule_versions', count(*), max(created_at) from public.selection_schedule_versions
union all select 'client_quotes', count(*), max(updated_at) from public.client_quotes
union all select 'project_forms', count(*), max(created_at) from public.project_forms
union all select 'sow_templates', count(*), max(updated_at) from public.sow_templates
union all select 'meeting_submissions', count(*), max(created_at) from public.meeting_submissions
union all select 'project_documents', count(*), max(created_at) from public.project_documents
union all select 'change_orders', count(*), max(created_at) from public.change_orders;
```

`change_orders` and `project_documents` are on that list deliberately — both are ACTIVE-CORE in the plan
and I want the numbers rather than the assumption. `change_orders` especially: **P0-GC-1 claims the table
has no app writer at all** because GC change orders save to localStorage. If it has rows, something
writes it and that finding needs rethinking.

---

## 5. The two claims that bit, stated as tests

Both are now believed true, but they were believed false before, so please confirm rather than skip:

```sql
-- quote-documents must still be PUBLIC. EstimateBuilder hands out getPublicUrl links.
select id, name, public from storage.buckets where id in ('quote-documents','quote-attachments');

-- Photo policies: insert should be THREE terms (org-wide), delete FOUR (assignment-scoped).
select polname, polcmd,
       pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy where polrelid = 'storage.objects'::regclass
  and polname like 'dfp_%';
```

---

## 6. Migration history

`20260914120000` was applied outside `db push`, so the live DDL has it but `schema_migrations` does not.
Confirm the drift and whether a plain `supabase db push` reconciles it — the file is idempotent
(`DROP POLICY IF EXISTS` then `CREATE POLICY`), so it should simply insert the history row.

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 8;
```

**Report; do not run the push.** Mark will decide.

---

## Report back

A short table per section: claim, what the data says, and whether the plan needs correcting. I will
update `docs/V1_HARDENING_PLAN_2026-09.md` from your answers.

Flag anything that contradicts the plan even if it seems minor — the three failures that cost real time
all looked minor in isolation.

**Do not change anything.**
