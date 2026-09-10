# Cursor Brief — Batch 1B: scope what a crew account can read

Part of `docs/V1_HARDENING_PLAN_2026-09.md` Batch 1 (security). **1A shipped** (`95a28c8`, `eb06f06`).
This is 1B. 1C (vendor RFQ removal) and 1D (systemic anon revoke, headers, org-only write policies)
follow separately. Do not pull their items forward.

Today `roles=['crew']` passes every org-scoped SELECT policy in the app. A crew account can read every
project's full `metadata` — quotes, margins, takeoffs — every project's schedule, every contact, and,
through one OR clause, **the entire payroll payload for any period they appear in**. The assignment
filter that makes the crew app look scoped is client-side only.

Eight items, one migration plus two small client changes.

---

## Read this first — three traps

This batch changes what a set of *reads* return. Get it wrong and the crew app goes blank in the field
rather than throwing an error you would notice. All three of these are things I got close enough to
wrong that they need calling out.

### Trap 1 — the field foreman reads the whole org schedule, and is a crew account

`crewWorkspaceService.ts:206-220` (`fetchOrgScheduleRows`) and `:1141-1152` deliberately fetch **all**
org schedule items with **no assignment filter** when the caller is a field foreman. A foreman is a
`roles=['crew']` profile with `is_field_foreman=true` — `tempestjm@gmail.com` is one on this database
right now.

So a `schedule_items` policy scoped to "projects I am assigned to" locks the foreman out of the feature
built for them in August. **Every policy below must carry `public.user_is_field_foreman()` as an
alternative.** That function exists (`20260728121344:12`) and is already granted to `authenticated`.

### Trap 2 — `crew_is_assigned_to_project` reads `schedule_items`, and is about to gate `schedule_items`

`crew_is_assigned_to_project` (`20260730140000:6`) does `SELECT ... FROM public.schedule_items`. Item 2
puts it inside the `schedule_items` SELECT policy. If RLS applied to that inner read, the policy would
invoke itself. It should not — the function is `SECURITY DEFINER` owned by `postgres`, which owns the
table, and RLS does not apply to a table's owner unless `FORCE ROW LEVEL SECURITY` is set.

**Verify it rather than assume it** (Check 3 below). If `relforcerowsecurity` is true on
`schedule_items`, stop and report — the predicate needs restructuring, not a workaround.

### Trap 3 — an empty-string linked id currently costs a photo upload; after this batch it costs the whole app

`crew_is_assigned_to_project:27-28` has the same bug 1A fixed in the clock RPCs:

```sql
AND COALESCE(p.linked_employee_id, p.linked_contractor_id, '') <> ''
AND COALESCE(p.linked_employee_id, p.linked_contractor_id) = ANY(si.assigned_persons)
```

A contractor whose `linked_employee_id` is `''` rather than NULL fails the first clause and the function
returns false. Today that costs them a photo upload. **The moment this function gates their reads, it
costs them every project, every schedule item, and a blank app** — with no error, because an empty result
set is not an error.

Fix it in the same migration, before it becomes load-bearing:

```sql
AND COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) IS NOT NULL
AND COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, '')) = ANY(si.assigned_persons)
```

Run this first and report the result — if it returns rows, those people go blank when the batch lands:

```sql
select id, email, linked_employee_id, linked_contractor_id
from public.profiles
where linked_employee_id = '' or linked_contractor_id = '';
```

---

## Pre-flight MCP checks (reads only — no `apply_migration`, see "Applying")

**Check 1 — the live SELECT policies you are about to replace.**

```sql
select c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) as using_expr
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in ('projects','schedule_items','pay_periods','contacts',
                    'labor_entries','material_entries','estimates','org_drywall_catalogs')
order by c.relname, p.polname;
```

Report anything that differs from what I describe below — these files have been rewritten several times
and I am citing the most recent migration I found, not necessarily what is live.

**Check 2 — the empty-string query from Trap 3.**

**Check 3 — the recursion question from Trap 2.**

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname in ('schedule_items','projects');
select proname, prosecdef, pg_get_userbyid(proowner) as owner
from pg_proc where proname in ('crew_is_assigned_to_project','user_is_field_foreman');
```

**Check 4 — who actually reads `org_drywall_catalogs`.** Item 5 depends on the answer.

---

## 1. P0-SEC-2(a) — `pay_periods` hands a linked person everyone's pay

`20260528000001_hr_pay_periods_select_operator_or_own.sql:41-50`:

```sql
CREATE POLICY pay_periods_hr_select ON public.pay_periods
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_run_payroll()
      OR public.pay_period_includes_linked_person(payload)
    )
  );
```

RLS is row-level. `pay_period_includes_linked_person` asks "does this payload mention me" and, if so,
hands over **the whole row** — every person's hours, rates and gross for that period. Any linked crew
account can read it straight from PostgREST.

**Drop the OR clause.** I traced every consumer before saying that:

- The only client reads of `pay_periods` are `hrPayrollService.ts:61,263`, reached from `PayrollPage`
  (gated `canRunPayroll`) and the drywall labor audit/aggregate services (operator-only).
- No crew surface reads `pay_periods` — `crewWorkspaceService` has no reference to it at all. Crew pay on
  `/crew` is computed from piece rates, not from payroll runs.
- `get_my_paystub_entries` / `list_my_paystubs` (`20260529000001`) are `SECURITY DEFINER` and therefore do
  not depend on this policy. They are the correct route if a paystub screen is ever built.

So the clause serves nothing in the app and leaks everything. New policy:

```sql
DROP POLICY IF EXISTS pay_periods_hr_select ON public.pay_periods;
CREATE POLICY pay_periods_hr_select ON public.pay_periods
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND public.user_can_run_payroll()
  );
```

**Confirm my trace before changing it.** If Check 1 shows a different policy, or you find any crew-side
read of `pay_periods`, stop and report.

---

## 2. P0-SEC-2(b) — scope `projects` and `schedule_items`

Both are currently org-membership only:

- `projects`: `20260425_a5c2_pilot.sql:106-111` — `organization_id_uuid = get_user_organization_uuid() AND is_user_active()`.
  **Note `organization_id_uuid` in that expression is historical**; the column was renamed to
  `organization_id` in `20260429000002:209`, so the live policy body will read `organization_id`. Use what
  Check 1 returns, not what the old file says.
- `schedule_items`: `20260507000002:68-72` — same shape.

Add a crew clause to each. Operators short-circuit on the first term, so this costs them nothing:

```sql
AND (
  NOT public.user_has_crew_role()
  OR public.user_can_edit()
  OR public.user_is_field_foreman()          -- Trap 1
  OR public.crew_is_assigned_to_project(id)  -- projects
)
```

For `schedule_items` the last term is `public.crew_is_assigned_to_project(project_id)` — scope to items on
a project the crew member is assigned to, **not** to items assigned to them personally. Regular crew
already filter to their own with `.contains('assigned_persons', [personId])`
(`crewWorkspaceService.ts:200`), so the wider predicate is a superset of what they read and cannot break
them; the narrower one would break the foreman and the job-detail schedule card.

This is a no-op for legitimate crew use on `projects` too: `crewWorkspaceService.ts:453-456` and `:565-568`
already fetch with `.in('id', projectIds)` where `projectIds` come from assigned schedule items.

Keep the `metadata` question in mind but **do not act on it here** — crew still read the whole project
blob including the quote. Narrowing that is the `project_photos` / metadata work in §7 of the plan, not
this batch.

---

## 3. P0-SEC-2(c) — exclude pure-crew from the operator tables

`contacts`, `labor_entries`, `material_entries`, `estimates`. Add to each SELECT policy:

```sql
AND NOT (public.user_has_crew_role() AND NOT public.user_can_edit())
```

"Pure crew" rather than "has crew role", so a `['crew','office_drywall']` account is unaffected.

Confirm against Check 1 that each of these has a single org-scoped SELECT policy before editing, and
confirm no crew surface reads them — `crewWorkspaceService` should show no `from('contacts')`,
`from('labor_entries')`, `from('material_entries')` or `from('estimates')`. **If any of them does, stop
and report rather than removing the read.**

---

## 4. `crew_is_assigned_to_project` — the NULLIF fix from Trap 3

Apply it as shown above. Signature unchanged, so `CREATE OR REPLACE` keeps the existing grants.

Do this **in the same migration and before** the policies in items 2 and 3 depend on it.

---

## 5. `org_drywall_catalogs` — verify, then decide

`user_can_read_drywall_catalogs` (`20260625120000`) admits `crew`. The catalogs carry material rates,
labor rates and `margin_floor_target` — a crew member should not see the margin floor.

But this is the highest breakage risk in the batch for the smallest gain, so **do not change it blind**.
I could find no crew read: `crewWorkspaceService.ts` has no `org_drywall_catalogs` reference, and no
component under `src/components/crew/` calls `drywallCatalogsService`. The grant appears to be left over
from D.6.6a, where the crew materials card ended up reading the project quote instead.

**If Check 4 confirms zero crew reads**, drop `'crew'` from the role array in
`user_can_read_drywall_catalogs`. **If you find any crew read at all, leave the function alone and report
it** — we will move that read behind an RPC in a later batch rather than break the materials card.

---

## 6. P1-SEC-6 — crew photo delete is org-wide

`20260627130000_crew_can_write_drywall_photos.sql` lets a crew account DELETE from `drywall-field-photos`
anywhere in the org, not just on projects they are assigned to. Path-scope the DELETE policy the same way
the write policy scopes uploads — a crew caller may only delete under a project they pass
`crew_is_assigned_to_project` for.

Read the live policy first; report the current expression before changing it.

---

## 7. P1-SEC-13 and P1-SEC-14 — two one-liners on 1A's work

Both were found during 1A and verified by me.

**P1-SEC-13 — guard `profiles.email`.** `consume_crew_invite_token:118-126` binds an invite to a person by
matching `profiles.email` against `crew_invite_tokens.invited_email`. A user who can rewrite their own
email can bind a leaked email-scoped invite to a different roster person, and so to that person's pay.
Free to close: nothing in the app and no migration writes `profiles.email` after `handle_new_user` sets it
on INSERT. Add `email` to the column list in `guard_profiles_privileged_columns`.

**P1-SEC-14 — the owner/admin mismatch.** The 1A trigger admits `user_is_rbac_owner() OR user_is_admin()`,
but the `Admins can update any profile in their organization` policy (`20260425_a5c2_pilot.sql:87-93`)
admits only `user_is_admin()`. Mark is both so nothing is broken today, but the first rbac owner created
without `role='admin'` finds the admin UI fails at the policy. Widen the policy:

```sql
AND (public.user_is_admin() OR public.user_is_rbac_owner())
```

---

## 8. P1-SEC-9 — `deriveEffectiveRole` picks index 0, not the highest privilege

`src/lib/rbac.ts:99-107` returns `profile.roles?.[0]`. A `['crew','office_drywall']` profile is therefore
crew in the UI while SQL helpers (which use `= ANY`) treat them as an operator. Make it pick the
highest-privilege role present, in the order `owner > office_gc > office_drywall > field_gc > field_drywall > crew > viewer`.

Client-only, and a no-op on today's data — every profile on this database has a single role. It stops the
two role systems disagreeing when someone does get two.

---

## Applying

**One migration file, applied with `supabase db push`. Do NOT use MCP `apply_migration` and do NOT use the
Dashboard SQL editor** — applying outside `db push` produced 48 remote-only versions in July that took
`0d9ad61` to repair. MCP is for the read-only checks in this brief.

File: `supabase/migrations/20260911120000_crew_read_scoping.sql`, items 1-7, wrapped in `BEGIN; ... COMMIT;`.
Item 8 is a separate client-side commit.

Order inside the file matters: the `crew_is_assigned_to_project` fix (item 4) before the policies that
call it.

---

## Verification

### Cursor-side

1. `npx tsc --noEmit` clean; `npx vitest run` 51 files / 327 tests green; `npm run build` succeeds.
2. `supabase db push` applies it; `supabase migration list` in sync, no remote-only versions.
3. Re-run Check 1 and paste the new policy expressions.

### The read tests — as a real `authenticated` caller, in a rolled-back transaction

Same method you used in 1A. For each, run it **before and after** so you know the test can detect the
change at all.

As a **regular crew** account (assigned to at least one project):

| Query | Before | After |
|---|---|---|
| `select count(*) from projects` | all org projects | only assigned |
| `select count(*) from schedule_items` | all org items | only items on assigned projects |
| `select count(*) from pay_periods` | ≥1 if they appear in any run | 0 |
| `select count(*) from contacts` | all org contacts | 0 |
| `select count(*) from estimates` | all | 0 |

As the **field foreman** (`tempestjm@gmail.com`): `projects` and `schedule_items` must **still return the
whole org**. This is Trap 1 — if the foreman's counts drop, stop and report.

As **Mark (owner)**: every count unchanged from before the migration. Any drop at all is a bug.

### Operator-side — Mark runs these

**1A was applied but never smoked, so this run covers both batches.** That is deliberate — one crew
walk-through proves both.

1. Crew signup end to end (invite → private window → signs up → lands on `/crew` with jobs visible).
2. That new crew account: open a job, see Materials and Scope of Work, clock in, clock out.
3. Deactivate then reactivate it from HR → Crew accounts.
4. **The foreman account opens `/crew` and still sees the whole schedule, not just their own jobs.**
5. Owner app: projects list, a project's quote, Financials, Labor, Payroll all still load.
6. QuickBooks connect/disconnect still works.

Procedure for 1 and 2 is in `docs/briefs/` — ask Mark for the crew smoke walk-through if it is not there yet.

---

## Out of scope

- **P1-SEC-5 systemic `anon` revoke** across the 76 definer functions, **P1-SEC-8** `vercel.json` headers,
  **P1-SEC-11** write policies gated on org only, **P1-SEC-4** `organizations` RLS, **P1-SEC-12** anon JWT
  in the archived smoke scripts, **P1-SEC-10** `supabase/pending/` reconcile — all brief 1D. They need an
  operator smoke, not a crew one.
- **P0-SEC-3 / P2-DEL-3** vendor RFQ chain removal — brief 1C.
- Narrowing what `metadata` crew receive — that is the `project_photos` work in §7 of the plan.
- Anything in Batches 2-6.
- Do not clean up while you are in there. Report, do not fix.

---

## Commit

Two commits.

**Commit 1** — the migration:

```
fix(security): scope what a crew account can read

roles=['crew'] passed every org-scoped SELECT policy in the app. A crew account
could read every project's full metadata -- quotes, margins, takeoffs -- every
project's schedule, every contact and estimate, and through one OR clause the
entire payroll payload for any period they appeared in. The assignment filter
that makes the crew app look scoped was client-side only.

pay_periods loses the linked-person clause entirely. RLS is row-level, so
"does this payload mention me" handed over the whole row: everyone's hours,
rates and gross. Nothing in the app depended on it -- every client read of
pay_periods is behind canRunPayroll, and the paystub RPCs are SECURITY DEFINER
and never needed the policy.

projects and schedule_items scope to assignment via crew_is_assigned_to_project,
with an explicit carve-out for the field foreman, who is a crew account and
deliberately reads the whole org schedule. Contacts, estimates and the labor and
material entry tables exclude pure-crew accounts.

crew_is_assigned_to_project gets the NULLIF fix first, because it is now
load-bearing for reads: a contractor with an empty-string linked_employee_id was
failing its guard, which cost them a photo upload before and would have cost
them the entire app after.

Also folds in two findings from 1A: profiles.email joins the privilege guard,
since the invite flow binds identity by email match, and the admin update policy
widens to owner-or-admin to match the trigger.
```

**Commit 2** — the client change:

```
fix(rbac): effective role is the highest privilege held, not roles[0]

A ['crew','office_drywall'] profile read as crew in the UI while every SQL
helper, which matches with = ANY, treated them as an operator. No-op on current
data -- every profile holds a single role -- but it stops the two role systems
disagreeing the first time someone holds two.
```

**Exclude from both, every time:** `.claude/settings.local.json` and `supabase/.temp/cli-latest`.

---

## STOP — report before going further

1. Output of the four pre-flight checks. **Check 2 especially — if any profile has an empty-string linked
   id, say so before applying anything.**
2. Whether `relforcerowsecurity` is set on `schedule_items` (Trap 2).
3. The before/after read-count table, including the foreman row.
4. What you found for `org_drywall_catalogs` (item 5) and what you did about it.
5. Any live policy that differed from what this brief describes.
6. `tsc` / `vitest` / `build` / `supabase migration list`.
7. Anything you found and did not fix.
