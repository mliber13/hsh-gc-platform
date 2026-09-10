# Cursor Brief — Batch 1A: close the privilege-escalation path and the two open edge functions

Part of `docs/V1_HARDENING_PLAN_2026-09.md` Batch 1 (security). Batch 1 is split into three briefs;
**this is 1A.** 1B (crew read scoping + systemic anon grants + headers) and 1C (vendor RFQ removal)
follow separately. Do not pull their items forward.

Six items: one migration, two edge functions, one client component. Everything here is additive or a
tightening; nothing changes a screen the operator uses.

---

## Before you write anything — three MCP read-only checks

Use the Supabase MCP for **reads only** in this brief. Do not use `apply_migration`. See "Applying" below.

**Check 1 — what `current_user` is in a PostgREST call vs inside a SECURITY DEFINER function.**
Item 1 depends on this.

```sql
select current_user as direct_current_user, session_user;
select proname, prosecdef, pg_get_userbyid(proowner) as owner
from pg_proc where proname in ('consume_crew_invite_token','set_crew_account_active');
```

The trigger in item 1 lets a write through when `current_user` is **not** `authenticated` — i.e. when the
write comes from inside a SECURITY DEFINER function owned by `postgres`, not straight from the client.
**If `prosecdef` is false, or the owner is not `postgres`/a superuser, stop and report — the exemption
mechanism does not hold and I need to pick a different one** (a transaction-local `set_config` flag).

**Check 2 — confirm the policy is still what the plan says.**

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy where polrelid = 'public.profiles'::regclass and polcmd = 'w';
```

Expect `Users can update own profile` = `(auth.uid() = id) AND is_user_active()`, no column restriction.

**Check 3 — has anyone already used the hole?**

```sql
select id, email, role, roles, can_run_payroll, is_field_foreman, is_active
from public.profiles order by created_at;
```

Paste the output back. This is the "did anyone already escalate" check, and it also tells me whether the
trigger would break a real account. **Do not change any row.**

**Check 4 — the exact column list, so the guard matches the live table.**

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' order by 1;

select proname from pg_proc where proname = 'user_is_rbac_owner';
```

`user_is_rbac_owner()` is used by `20260909120000_deactivate_crew_account.sql:106`, so it should exist —
confirm rather than assume. **Report any column in my privileged list below that does not exist, and any
column you see that looks privilege-bearing and is not in my list. Do not silently drop one.**

---

## 1. P0-SEC-1 — a column guard on `profiles` self-update  ⟵ the reason this batch is first

**The hole.** `supabase/migrations/20260425_a5c2_pilot.sql:81-83`:

```sql
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id AND public.is_user_active());
```

No column restriction, no column-level REVOKE, no trigger. `roles[]` is only CHECK-constrained to allowed
*values*. So any authenticated user — **a crew invite is enough** — can PATCH their own profiles row via
PostgREST and set `roles='{owner}'`, `can_run_payroll=true`, `is_field_foreman=true`, or point
`linked_employee_id` at somebody else and read their pay.

**The fix.** A `BEFORE UPDATE` trigger that raises unless the caller is an rbac owner or a legacy admin,
when any privileged column changes.

Privileged columns:

```
role, roles, organization_id, organization_id_uuid,
can_run_payroll, can_admin_qb, is_meeting_operator, is_field_foreman,
is_active, linked_employee_id, linked_contractor_id, hr_person_id, hr_person_type
```

Everything else — `full_name`, `avatar_url`, theme/preference columns, and the `qb_*` token columns —
stays freely self-updatable. **The `qb_*` columns matter: `src/services/quickbooksService.ts:138,196`
writes them from the client on every QuickBooks connect and disconnect. Guard them and you break the QB
connection.**

Shape:

```sql
CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Writes arriving from inside a SECURITY DEFINER function run as the function
  -- owner, not as `authenticated`. Those functions do their own authorization
  -- (consume_crew_invite_token validates the token, set_crew_account_active
  -- checks owner-or-admin), so they pass through. This clause is what keeps crew
  -- signup working: a brand-new crew user is not an owner and still needs the
  -- invite RPC to set their roles and linked_* for them.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.user_is_rbac_owner() OR public.user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role                    IS DISTINCT FROM OLD.role
     OR NEW.roles                IS DISTINCT FROM OLD.roles
     OR NEW.organization_id      IS DISTINCT FROM OLD.organization_id
     OR NEW.organization_id_uuid IS DISTINCT FROM OLD.organization_id_uuid
     OR NEW.can_run_payroll      IS DISTINCT FROM OLD.can_run_payroll
     OR NEW.can_admin_qb         IS DISTINCT FROM OLD.can_admin_qb
     OR NEW.is_meeting_operator  IS DISTINCT FROM OLD.is_meeting_operator
     OR NEW.is_field_foreman     IS DISTINCT FROM OLD.is_field_foreman
     OR NEW.is_active            IS DISTINCT FROM OLD.is_active
     OR NEW.linked_employee_id   IS DISTINCT FROM OLD.linked_employee_id
     OR NEW.linked_contractor_id IS DISTINCT FROM OLD.linked_contractor_id
     OR NEW.hr_person_id         IS DISTINCT FROM OLD.hr_person_id
     OR NEW.hr_person_type       IS DISTINCT FROM OLD.hr_person_type
  THEN
    RAISE EXCEPTION 'not authorized to change account permissions';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER guard_profiles_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_columns();
```

---

## 2. P1-SEC-1 — `search_path` on the core definer helpers, and `is_active` in `user_can_edit`

These run inside most RLS policies and none pins `search_path`. Defined in
`20000201000000_multi_user_shared_access.sql:245-272`, re-created in `008_fix_user_profile_creation.sql:78-95`:

`get_user_organization`, `get_user_role`, `user_can_edit`, `user_is_admin`

`is_user_active` already got `SET search_path` in `20260909120000` — **leave that one alone.**

Re-create the four with `STABLE SECURITY DEFINER SET search_path = public`, bodies otherwise unchanged,
using the `008` scalar-subquery form as the source of truth:

```sql
CREATE OR REPLACE FUNCTION public.user_can_edit()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'viewer')
           IN ('admin','editor')
     AND public.is_user_active();
$fn$;
```

**`user_can_edit` gets one behaviour change: `AND public.is_user_active()`.** Today a deactivated admin
still passes every write policy in the app. Same reasoning as the crew helper in `20260909120000`.

Before doing it, verify by inspection that `user_can_edit()` is never negated anywhere — it is used as a
positive conjunct in write policies, so returning false can only ever deny. **If you find a single
`NOT user_can_edit()` in any policy, stop and report it.**

Then do `handle_new_user`, `get_form_completion_percentage`, `is_form_fully_signed_off` the same way —
`search_path` only, no behaviour change.

---

## 3. P1-SEC-3 — an invite link must not demote an existing operator

`consume_crew_invite_token` (`20260616130000_crew_role_and_invites.sql:60+`) overwrites the caller's
`roles` with `['crew']`. If an existing office user opens a crew invite link, their account becomes a crew
account and they lose the app.

Add this after the existing `auth.uid() IS DISTINCT FROM p_user_id` check and before the profile UPDATE:

```sql
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.roles IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(p.roles) r WHERE r <> 'crew')
  ) THEN
    RAISE EXCEPTION 'this account already has app access; ask the office to link it instead';
  END IF;
```

Keep the rest of the function byte-identical. A fresh signup has `roles` empty or NULL, so the normal
path is untouched.

---

## 4. P1-SEC-7 remainder — an empty string shadows the contractor id

The `is_active` half of P1-SEC-7 is already closed (`20260909120000` gated `user_has_crew_role`, and both
clock RPCs call it). What remains is in `20260716210000_crew_time_clock.sql` at **lines 37-38 and 112**:

```sql
COALESCE(p.linked_employee_id, p.linked_contractor_id)
```

`linked_employee_id = ''` is not NULL, so COALESCE returns the empty string and a linked **contractor** is
treated as unlinked. Change both to:

```sql
COALESCE(NULLIF(p.linked_employee_id, ''), NULLIF(p.linked_contractor_id, ''))
```

In `crew_clock_in` the person-type CASE at lines 39-42 already tests `<> ''` — leave it, it is already
correct and consistent with the NULLIF.

If you `CREATE OR REPLACE` with an unchanged signature the grants survive and no re-grant is needed. If
you DROP first, re-issue `REVOKE ALL ... FROM PUBLIC` and `GRANT EXECUTE ... TO authenticated` — a drop
discards grants and a fresh function is PUBLIC-executable.

---

## 5. P0-SEC-4 — two edge functions accept calls from anyone holding the anon key

`supabase/functions/send-quote-email/index.ts` sends mail from the company Resend account.
`supabase/functions/deal-coach-chat/index.ts` spends the Anthropic key. Neither calls `getUser`. The
public anon key ships in the browser bundle, so this is "anyone on the internet."

Copy the pattern in `supabase/functions/send-sms/index.ts:44-52` — inside the handler, after the CORS
preflight branch, before reading the body:

```ts
const authHeader = req.headers.get('Authorization')
if (!authHeader) return jsonResponse({ error: 'No authorization header' }, 401)

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } },
})
const { data: { user }, error: userError } = await supabase.auth.getUser()
if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)
```

Use whatever response helper each file already has rather than `jsonResponse`, and keep each file's
existing CORS headers (`deal-coach-chat` defines its own inline at line 30; `send-quote-email` imports
`../_shared/cors.ts`). `send-quote-email` needs
`import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'` added, matching `send-sms`.

**`send-quote-email` is scheduled for deletion in brief 1C** with the rest of the vendor RFQ chain (Mark
decided 2026-09-10 to remove it). Add the auth check anyway — four lines, and it closes the hole now
rather than whenever 1C lands. **Do not delete it in this brief; its callers still exist.**

Redeploy both: `supabase functions deploy send-quote-email`, `supabase functions deploy deal-coach-chat`.

---

## 6. P0-INFRA-1 — an error boundary

`grep ErrorBoundary src` returns nothing. One render throw is a white screen, including `/crew` on a phone
in the field where the only recovery is knowing to force-quit the PWA.

Add `src/components/ErrorBoundary.tsx` — a class component (hooks cannot catch render errors) with
`getDerivedStateFromError` and `componentDidCatch`. Fallback: what happened in one plain sentence, a
**Reload** button (`window.location.reload()`), and a **Copy error details** button putting
`error.message`, `error.stack` and `window.location.href` on the clipboard. No stack or Supabase internals
in the visible text — the sanitised-error convention from D.6.6a applies here too.

Mount it twice:

1. `src/App.tsx` — wrap `<AppRoutes />`, inside `<ThemeProvider>` so the fallback is themed.
2. `src/routes/index.tsx:187` — around the `/crew` element, so a crew-page throw does not take the whole
   app down and the fallback renders inside the crew shell.

---

## Applying — read this, it has bitten us before

**Write the migration as a file and apply it with `supabase db push`. Do NOT use the Supabase MCP
`apply_migration` tool and do NOT paste it into the Dashboard SQL editor.** Applying outside `db push` is
what produced 48 remote-only migration versions in July, which took commit `0d9ad61` to repair. MCP is
fine for the read-only verification SQL in this brief.

One file: `supabase/migrations/20260910120000_profiles_privilege_guard.sql`, items 1-4, wrapped in
`BEGIN; ... COMMIT;`.

Use `CREATE OR REPLACE` / `IF NOT EXISTS` / `DROP ... IF EXISTS` throughout so it is safe to re-run
against a database whose history has drifted.

---

## Verification

### Cursor-side

1. `npx tsc --noEmit` clean.
2. `npx vitest run` — 51 files / 327 tests green (baseline at `56f4a3a`).
3. `npm run build` succeeds.
4. `supabase db push` applies the migration; `supabase migration list` then shows local and remote in
   sync with no remote-only versions.
5. `select tgname, tgenabled from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;`
6. `select proname, proconfig from pg_proc where proname in ('get_user_organization','get_user_role','user_can_edit','user_is_admin','handle_new_user','get_form_completion_percentage','is_form_fully_signed_off');`
   — every row must show `{search_path=public}`.

### The escalation test — this is the one that matters

Do this as a **real signed-in non-owner**, not as `postgres`, or it proves nothing. Use a crew login Mark
gives you, or a throwaway one. From the app's own client (browser console on a logged-in crew session):

```js
const uid = (await supabase.auth.getUser()).data.user.id
await supabase.from('profiles').update({ roles: ['owner'] }).eq('id', uid)
```

**Expected: an error containing `not authorized to change account permissions`,** and the row unchanged.
Repeat for `can_run_payroll: true` and `is_field_foreman: true`.

Then confirm a harmless column still succeeds:

```js
await supabase.from('profiles').update({ full_name: 'Test Rename' }).eq('id', uid)
```

### Operator-side — Mark runs these

1. Sign in as owner. App loads; Settings → Users lists everyone.
2. Change someone's role from the admin UI (access dialog on Contact Directory / Crew Accounts). Must
   still work — the trigger has to let an owner through.
3. Deactivate and reactivate a crew account from Crew Accounts. Must still work — `set_crew_account_active`
   is SECURITY DEFINER and passes via the `current_user` exemption. **If this fails the exemption mechanism
   is wrong: stop and report, do not work around it by weakening the trigger.**
4. **Crew signup end to end.** Generate an invite, open it in a private window, sign up, confirm the
   account lands as crew with materials and schedule visible. Highest-risk regression in the brief —
   items 1 and 3 both sit on this path.
5. An existing operator opening a crew invite link is refused with "this account already has app access",
   and their account still works afterwards.
6. Crew clock in and out on `/crew`, using a contractor-linked (1099) account if one exists — that is the
   account the NULLIF fix is for.
7. QuickBooks connect/disconnect still works (the `qb_*` columns must not be guarded).
8. Deal coach in DealWorkspace still answers while signed in.
9. Confirm the error boundary shows a reload button rather than a white screen.

---

## Out of scope — do not do these here

- **P0-SEC-2 crew read scoping** (`projects`, `schedule_items`, `pay_periods`, `contacts`, `*_entries`,
  catalogs, `estimates`) — brief 1B. Needs its own crew smoke; must not ride on this one.
- **P1-SEC-5 systemic `anon` revoke** across the 76 definer functions — brief 1B.
- **P1-SEC-6** storage path scoping, **P1-SEC-8** `vercel.json` headers, **P1-SEC-9** `deriveEffectiveRole`,
  **P1-SEC-11** write policies gated on org only — brief 1B.
- **P0-SEC-3 / P2-DEL-3** vendor RFQ chain removal — brief 1C.
- Anything in Batches 2-6.
- Do not clean up while you are in there. If you spot something, report it; do not fix it.

---

## Commit

Two commits, so a revert stays surgical.

**Commit 1** — the migration plus the two edge functions:

```
fix(security): close the profiles privilege-escalation path and two open edge functions

The "Users can update own profile" policy had no column restriction, so any
authenticated user -- a crew invite was enough -- could PATCH their own row via
PostgREST and set roles='{owner}', can_run_payroll, is_field_foreman, or point
linked_employee_id at someone else and read their pay.

A BEFORE UPDATE trigger now refuses a change to any privilege-bearing column
unless the caller is an rbac owner or a legacy admin. Name, avatar and the qb_*
token columns stay self-writable, so QuickBooks connect still works. Writes from
inside SECURITY DEFINER functions pass through on current_user, which is what
keeps crew signup working -- a new crew user is not an owner and still needs the
invite RPC to set their roles for them.

In the same file: search_path pinned on the core definer helpers that run inside
most RLS policies; user_can_edit now also requires is_active, since a deactivated
admin still passed every write policy; consume_crew_invite_token refuses an
account that already has non-crew roles rather than demoting it to crew; and both
clock RPCs use NULLIF so an empty-string linked_employee_id stops shadowing a
linked contractor.

send-quote-email and deal-coach-chat never called getUser, so anyone holding the
public anon key could send mail from the company Resend account and spend the
Anthropic key. Both now require a signed-in user, matching send-sms.
```

**Commit 2** — the error boundary:

```
feat(app): an error boundary, so a render throw is not a white screen

There was none anywhere. A throw took out the whole app, including /crew on a
phone in the field where the only recovery was knowing to force-quit the PWA.

One boundary around the routes and a second around /crew specifically, so a crew
page failing does not take the operator app with it. The fallback offers a reload
and a copy-details button; the visible text carries no stack or Supabase
internals, same convention as the sanitised crew errors.
```

**Exclude from both commits, every time:** `.claude/settings.local.json` and `supabase/.temp/cli-latest`.

---

## STOP — report before going further

After the two commits, **stop.** Do not start 1B. Report back:

1. Output of the four pre-flight checks, especially Check 3 (the current roles table).
2. Any column you added to or dropped from the privileged list, and why.
3. Whether `NOT user_can_edit()` appears in any policy.
4. The escalation test result — the exact error text you got back.
5. `tsc` / `vitest` / `build` status and `supabase migration list` output.
6. Anything you found and did not fix.
