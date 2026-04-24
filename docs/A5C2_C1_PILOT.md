# A5-c.2 — C2-1 Pilot (projects, profiles, trade_categories)

Pilot chunk for A5-c.2 UUID policy rewrites. See §10 of `A5_PLAN.md`.

Execution order:
1. **Pre-flight** (§1): run on branch `clqgnnydrwpgxvipyotd` AND prod `rvtdavpsvrhbktbxquzm`. Diff to confirm structural parity. Feeds §2 migration draft.
2. **Migration** (§2): TBD — populated after pre-flight output.
3. **Branch apply + smoke** (§3): TBD.
4. **Prod apply + smoke** (§4): TBD.

---

## 1) Pre-flight SQL

Run all seven queries on branch first, then on prod. Keep outputs so we can diff.

### 1.1 Current policies on the three tables

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'profiles', 'trade_categories')
order by tablename, policyname;
```

**What we're looking for:** exact policy set we'll replace. Expect most `qual` / `with_check` to reference `get_user_organization()` returning text (post-A5-c Path H: the helper now returns the raw `profiles.organization_id` text value).

### 1.2 RLS enabled on each table

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('projects', 'profiles', 'trade_categories')
order by relname;
```

**Expect:** `relrowsecurity = true` on all three.

### 1.3 Column inventory — confirm text + uuid both present

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('projects', 'profiles', 'trade_categories')
  and column_name in ('organization_id', 'organization_id_uuid')
order by table_name, column_name;
```

**Expect:** 6 rows. `organization_id` text (profiles: nullable post-A5-c; others: not-null). `organization_id_uuid` uuid, nullable on all.

### 1.4 Backfill / data-shape summary

```sql
select 'projects' as tbl,
       count(*) as total_rows,
       count(*) filter (where organization_id_uuid is null) as uuid_null_rows,
       count(distinct organization_id)       as distinct_text_vals,
       count(distinct organization_id_uuid)  as distinct_uuid_vals
from public.projects
union all
select 'profiles',
       count(*),
       count(*) filter (where organization_id_uuid is null),
       count(distinct organization_id),
       count(distinct organization_id_uuid)
from public.profiles
union all
select 'trade_categories',
       count(*),
       count(*) filter (where organization_id_uuid is null),
       count(distinct organization_id),
       count(distinct organization_id_uuid)
from public.trade_categories
order by tbl;
```

**Expect (branch):** projects `uuid_null_rows = 0`; profiles `uuid_null_rows` = count of no-org users (≥1 for `noorg-user`); trade_categories `uuid_null_rows` ≈ 21 (system/shared rows).
**Expect (prod):** projects `uuid_null_rows = 0`; profiles `uuid_null_rows = 0` (no invite-first users exist on prod yet); trade_categories `uuid_null_rows` ≈ 21.

### 1.5 Bridge trigger presence

```sql
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('projects', 'profiles', 'trade_categories')
order by event_object_table, trigger_name;
```

**Expect:** bridge trigger on `projects` and `trade_categories`; NO bridge trigger on `profiles` (profiles was intentionally excluded per A5-c §9.3 note 6). Other app triggers (updated_at etc.) may also appear.

### 1.6 Helper function signatures

```sql
select proname,
       pg_get_function_arguments(p.oid) as args,
       pg_get_function_result(p.oid)    as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'get_user_organization',
    'get_user_organization_uuid',
    'current_user_organization_id',
    'current_user_organization_uuid',
    'user_can_edit',
    'user_is_admin',
    'is_user_active'
  )
order by proname;
```

**Expect:** both text helpers return `text`; both uuid helpers return `uuid`. All seven must exist.

### 1.7 Distinct org values across the three tables

```sql
select 'projects.organization_id (text)'         as which, organization_id::text       as val, count(*) as n from public.projects         group by organization_id
union all
select 'projects.organization_id_uuid',                   organization_id_uuid::text,          count(*)   from public.projects         group by organization_id_uuid
union all
select 'profiles.organization_id (text)',                 organization_id::text,               count(*)   from public.profiles         group by organization_id
union all
select 'profiles.organization_id_uuid',                   organization_id_uuid::text,          count(*)   from public.profiles         group by organization_id_uuid
union all
select 'trade_categories.organization_id (text)',         organization_id::text,               count(*)   from public.trade_categories group by organization_id
union all
select 'trade_categories.organization_id_uuid',           organization_id_uuid::text,          count(*)   from public.trade_categories group by organization_id_uuid
order by which, n desc;
```

**Expect:** text columns hold only `default-org` (or NULL on profiles for invite-first / `system` on trade_categories). uuid columns hold only HSH_UUID `b80516ed-a8aa-4b6c-bdf8-2155e18a0129` (or NULL for shared/invite-first).

**Fail-hard conditions:**
- Any text value other than `default-org`, `system`, or NULL.
- Any uuid value other than HSH_UUID or NULL.
- Non-zero `uuid_null_rows` on `projects` (means backfill is incomplete).

If any of the above trip, stop and report before drafting §2.

---

## 2) Migration — `supabase/migrations/20260425_a5c2_pilot.sql`

See the file for the authoritative SQL. Summary of what it does:

1. **Pre-flight DO block** — fail-hard if `user_can_edit`, `user_is_admin`, `is_user_active` missing, or if any `projects` row still has NULL `organization_id_uuid`.
2. **`CREATE OR REPLACE FUNCTION get_user_organization_uuid()`** — byte-match of prod's existing body (`STABLE SECURITY DEFINER`, reads `profiles.organization_id_uuid`). No-op on prod, creates on branch.
3. **`ALTER TABLE profiles ALTER COLUMN organization_id DROP NOT NULL`** — no-op on prod, converges branch.
4. **`profiles` policies** — 5 total: `"Users can view own profile"` (added on prod, no-op on branch), `"Users can view profiles in their organization"`, `"Users can update own profile"`, `"Admins can update any profile in their organization"`, `"Admins can insert profiles for their organization"`. All org-scoped ones filter on `organization_id_uuid = get_user_organization_uuid()` with explicit `IS NOT NULL` guard.
5. **`projects` policies** — 4 total: SELECT / INSERT / UPDATE / DELETE all filter on `organization_id_uuid = get_user_organization_uuid()`.
6. **`trade_categories` policies** — 4 total with NULL-is-shared model: SELECT allows `organization_id_uuid IS NULL OR = helper()`; INSERT/UPDATE/DELETE require non-NULL and match. Legacy prod policy names (`"Users can view system..."`, etc.) and branch names (`trade_categories_*`) both dropped before recreate.
7. **Post-apply DO block** — fail-hard if policy counts drift from `profiles=5 / projects=4 / trade_categories=4`, if any policy still references bare `organization_id` (text), or if `profiles.organization_id` is still NOT NULL.

Whole thing wrapped in `BEGIN; … COMMIT;` so any assertion failure rolls back cleanly.

## 3) Branch apply + smoke

### 3.1 Apply on branch

**Cursor prompt:**

> Apply `supabase/migrations/20260425_a5c2_pilot.sql` against Supabase project `clqgnnydrwpgxvipyotd` only. Do not apply to prod. Do not edit the file. If the migration raises any exception, paste the full error verbatim and stop. If it succeeds, return the COMMIT confirmation and the count of rows affected by the ALTER TABLE (if reported).

### 3.2 Post-apply SQL checks (branch)

Run all of these on `clqgnnydrwpgxvipyotd` and paste raw output:

```sql
-- 3.2.1 Policy inventory (expect 5 + 4 + 4 = 13 rows)
select tablename, policyname, cmd, roles,
       (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
       (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
from pg_policies
where schemaname='public'
  and tablename in ('profiles','projects','trade_categories')
order by tablename, policyname;

-- 3.2.2 Helper present + correct return type
select proname, pg_get_function_result(p.oid) as returns
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname='get_user_organization_uuid';

-- 3.2.3 profiles.organization_id is nullable
select column_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='organization_id';
```

**Fail-hard conditions:** any `qual_bare_text_ref` or `wc_bare_text_ref` = true; helper missing or returns ≠ uuid; `is_nullable` ≠ 'YES'.

### 3.3 Post-apply JS smoke tests (branch)

**Preferred:** run the checked-in Node script `scripts/a5c2-c1-smoke.mjs` from the repo root:

```
node scripts/a5c2-c1-smoke.mjs
```

The script runs tests S1–S7 against branch, prints a PASS/FAIL verdict for each, and exits 0 if all green / 1 if any fail / 2 on fatal (e.g., signIn failure). S7 is a positive control (HSH updates own project) to catch over-broad RLS filtering.

**Alternative:** paste the raw tests into a browser console on a page that has the Supabase client loaded as `window.supabase`. Test users already exist on branch per `A5C_BRANCH_VERIFICATION.md`.

```javascript
const BRANCH_URL = 'https://clqgnnydrwpgxvipyotd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscWdubnlkcndwZ3h2aXB5b3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDIxMjksImV4cCI6MjA5MjYxODEyOX0.DH9Dk9sgsw3JlZvGy5U9x_wVljnli2mSaEFIis7zuQw';
const HSH_UUID  = 'b80516ed-a8aa-4b6c-bdf8-2155e18a0129';
const ORGB_UUID = '444df8c1-875b-4843-8a09-2c2e69a4bcab';
const ORGB_PROJECT_ID  = '09fdbca8-55a8-40fb-8b91-47f162cbfd4f';
const HSH_PROJECT_ID   = '8c9f4c94-6600-4f17-bd88-e5cdc70feed4';
const SHARED_TRADE_ID  = '2a87a60b-4053-4e9f-a3d2-4b49995f30e1';

const h      = window.supabase.createClient(BRANCH_URL, ANON_KEY);
const b      = window.supabase.createClient(BRANCH_URL, ANON_KEY);
const noOrg  = window.supabase.createClient(BRANCH_URL, ANON_KEY);
await h.auth.signInWithPassword({      email: 'hsh-user@hsh-test.example',         password: 'HshTest!123'  });
await b.auth.signInWithPassword({      email: 'testuser-b@hsh-test.example',       password: 'OrgBTest!123' });
await noOrg.auth.signInWithPassword({  email: 'noorg-user@hsh-test.example',       password: 'NoOrg!123'    });

// S1 — SELECT isolation on projects
const hProjects = await h.from('projects').select('id,organization_id_uuid');
const bProjects = await b.from('projects').select('id,organization_id_uuid');
const nProjects = await noOrg.from('projects').select('id');
console.log('S1 HSH project org UUIDs:', (hProjects.data||[]).map(r=>r.organization_id_uuid));
console.log('S1 OrgB project org UUIDs:', (bProjects.data||[]).map(r=>r.organization_id_uuid));
console.log('S1 no-org visible projects:', nProjects.data?.length, 'error:', nProjects.error);
// EXPECT: HSH sees only HSH_UUID rows, OrgB sees only ORGB_UUID rows, no-org sees 0.

// S2 — trade_categories shared + org-scoped visibility
const hTrades = await h.from('trade_categories').select('id,organization_id_uuid');
const bTrades = await b.from('trade_categories').select('id,organization_id_uuid');
const nTrades = await noOrg.from('trade_categories').select('id,organization_id_uuid');
console.log('S2 HSH trades org UUIDs:', (hTrades.data||[]).map(r=>r.organization_id_uuid));
console.log('S2 OrgB trades org UUIDs:', (bTrades.data||[]).map(r=>r.organization_id_uuid));
console.log('S2 no-org trades org UUIDs:', (nTrades.data||[]).map(r=>r.organization_id_uuid));
// EXPECT: HSH sees [HSH_UUID, null]; OrgB sees [ORGB_UUID, ORGB_UUID, null]; no-org sees [null].

// S3 — cross-org UPDATE blocked on projects
const hCross = await h.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', ORGB_PROJECT_ID).select('id');
const bCross = await b.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', HSH_PROJECT_ID).select('id');
console.log('S3 HSH->OrgB rows updated:', hCross.data?.length||0, 'error:', hCross.error);
console.log('S3 OrgB->HSH rows updated:', bCross.data?.length||0, 'error:', bCross.error);
// EXPECT: both 0 rows, error null (RLS filters the row out silently).

// S4 — shared trade UPDATE blocked (even for HSH who can SELECT it)
const sharedBlock = await h.from('trade_categories').update({ label: 'blocked-c21' }).eq('id', SHARED_TRADE_ID).select('id');
console.log('S4 shared trade rows updated:', sharedBlock.data?.length||0, 'error:', sharedBlock.error);
// EXPECT: 0 rows (policy requires organization_id_uuid IS NOT NULL).

// S5 — invite-first user sees own profile, no cross-org visibility
const noOrgSelf = await noOrg.from('profiles').select('id,email,organization_id_uuid').eq('email','noorg-user@hsh-test.example');
const noOrgHsh  = await noOrg.from('profiles').select('id').eq('organization_id_uuid', HSH_UUID);
console.log('S5 own profile rows:', noOrgSelf.data?.length, 'own uuid:', noOrgSelf.data?.[0]?.organization_id_uuid, 'error:', noOrgSelf.error);
console.log('S5 HSH profiles visible to no-org:', noOrgHsh.data?.length, 'error:', noOrgHsh.error);
// EXPECT: S5 own = 1 row with uuid=null; S5 HSH = 0 rows.

// S6 — invite-first user INSERT into projects blocked
const noOrgInsert = await noOrg.from('projects').insert({
  name: `noorg should fail ${Date.now()}`,
  type: 'new-construction',
  status: 'planning',
  organization_id: 'default-org'
}).select('id');
console.log('S6 no-org insert rows:', noOrgInsert.data?.length||0, 'error:', noOrgInsert.error?.message);
// EXPECT: 0 rows or error; policy WITH CHECK requires uuid match and user_can_edit.
```

**Sign-off criteria:** S1–S6 all behave per EXPECT comments.

## 4) Prod apply + smoke

**Gate:** §3 passed 7/7 on branch `clqgnnydrwpgxvipyotd` (2026-04-24).

### 4.1 What's about to change on prod

Since prod is in the A5-c Path H state (text helpers, text-filtered policies, missing `"Users can view own profile"`, legacy trade_categories model), the migration will effectively:

- **Change:** replace all 4 `projects` policies + 4 org-scoped `profiles` policies + 4 `trade_categories` policies with uuid-column-filtered versions.
- **Change:** add `"Users can view own profile"` SELECT policy (plugs invite-first hole).
- **Change:** drop `is_system` / `'system'` text filter model on `trade_categories`; adopt NULL-is-shared. Current 21 `is_system=true` rows already have `organization_id_uuid=NULL` from A5-a backfill, so they remain shared by virtue of the new NULL-is-shared SELECT policy. Current 7 HSH trade_categories rows already have `organization_id_uuid=HSH_UUID`, so they stay visible to HSH users.
- **No-op:** `get_user_organization_uuid()` CREATE OR REPLACE (byte-match of existing prod body).
- **No-op:** `ALTER TABLE profiles ALTER COLUMN organization_id DROP NOT NULL` (prod column already nullable).

Net row-visibility impact for existing HSH users: **identical** — they still see the same 99 projects, same 5 profiles, same 28 trade_categories (21 shared + 7 own).

### 4.2 Apply on prod

**Cursor prompt:**

> Apply `supabase/migrations/20260425_a5c2_pilot.sql` against Supabase project `rvtdavpsvrhbktbxquzm` (prod) only. Do not apply to branch again. Do not edit the file. If the migration raises any exception, paste the full error verbatim including error code and stop. If it succeeds, confirm the COMMIT.
>
> Immediately after, run these three post-apply SQL queries on the same prod project and paste raw JSON output, labeled:
>
> ```sql
> -- 4.2.1
> select tablename, policyname, cmd, roles,
>        (qual       ~ 'organization_id[^_]') as qual_bare_text_ref,
>        (with_check ~ 'organization_id[^_]') as wc_bare_text_ref
> from pg_policies
> where schemaname='public'
>   and tablename in ('profiles','projects','trade_categories')
> order by tablename, policyname;
>
> -- 4.2.2
> select proname, pg_get_function_result(p.oid) as returns
> from pg_proc p join pg_namespace n on n.oid=p.pronamespace
> where n.nspname='public' and proname='get_user_organization_uuid';
>
> -- 4.2.3
> select column_name, is_nullable
> from information_schema.columns
> where table_schema='public' and table_name='profiles' and column_name='organization_id';
> ```
>
> Do not apply any other migration or touch any other file. Stop after posting output.

### 4.3 Post-apply SQL gate

Same shape as §3.2:
- §4.2.1 must return 13 rows (5 profiles + 4 projects + 4 trade_categories); every `qual_bare_text_ref` / `wc_bare_text_ref` must be `false` or `null`.
- §4.2.2 must return `{proname: 'get_user_organization_uuid', returns: 'uuid'}`.
- §4.2.3 must return `is_nullable: 'YES'`.

If any of these drift, stop and diagnose before moving to §4.4.

### 4.4 App smoke (manual, both apps)

Log in to each app as the real HSH user and verify normal flows work:

**GC platform (`hsh-gc-platform`):**
- [ ] Home / dashboard loads without RLS errors in network tab.
- [ ] Projects list shows all 99 projects.
- [ ] Open a project — detail loads (deals, estimates, trade categories etc. all still gated by OTHER tables' RLS, which are untouched by C2-1, so nothing should change here).
- [ ] Trade categories UI shows shared (system) + own org categories.
- [ ] Create a new trade category — succeeds and saves with `organization_id_uuid = HSH_UUID`.
- [ ] Profile / team page — lists all HSH team members.

**Drywall app (`hsh-drywall-app`):**
- [ ] Login + dashboard load without RLS errors.
- [ ] Projects list matches GC's list (same shared backend).
- [ ] Normal payroll / labor views load (these tables aren't touched by C2-1 but verify nothing collateral broke).

### 4.5 Rollback posture

If §4.3 SQL gate passes but app smoke finds a regression: prefer **fix-forward** (patch the specific broken policy in a follow-up migration) over rollback. The policy set is small (13 policies across 3 tables); debugging is bounded.

If §4.3 SQL gate fails or the apply raises: the `BEGIN; … COMMIT;` wrapper rolls the migration back atomically, so prod state is unchanged. Diagnose from the error and retry.

A hard rollback (restore the pre-C2-1 policy set) is possible but involves recreating 12 legacy policies by hand. Not pre-drafted — would be written only if fix-forward fails.

### 4.6 Sign-off

When §4.3 + §4.4 both green, C2-1 is done. Record outcome in `docs/A5_PLAN.md` §9.5 (new sub-section to add) and proceed to C2-2 (deals subsystem) planning.
