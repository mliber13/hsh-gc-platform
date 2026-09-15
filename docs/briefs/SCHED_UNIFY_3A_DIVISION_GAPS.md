# Brief — Schedule Unification Step 3a: close the division gaps before the seed

Context: `docs/SCHEDULE_UNIFICATION_PLAN.md`, `docs/SCHEDULE_SURFACE_INVENTORY.md`.
Steps 1, 2, 4+5 and 5b are committed and pushed. This is the last step before Goodwill
Multi is seeded from Buildertrend.

**Why now:** every item today is `division = 'drywall'` bar two test rows, so these three
gaps are currently harmless. The seed puts a full GC schedule on a crossover project and
turns the first one into a live data-exposure path. Fix before, not after.

---

## Gap 1 — the customer portal shows every division (the one that matters)

`customer_share_schedule(p_token)` — latest definition in
`20260724140000_customer_share_schedule_client.sql` — joins schedule items with no division
filter:

```sql
LEFT JOIN public.schedule_items si
  ON si.project_id = p.id AND si.organization_id = v_org
```

This is a **no-login** link (`/customer/:token` → edge function → this RPC with the service
role). On a crossover project, whoever holds the link sees the GC schedule alongside the
drywall work.

**Fix:** add `AND si.division = 'drywall'` to the join condition.

**Why drywall specifically, and what to write in the comment:** customer share links are a
drywall feature — `customer_share_links` is keyed on `contact_phone` with no notion of
division, and the portal exists to show a drywall customer their drywall dates. Filtering to
drywall is right today and is the safe default for an unauthenticated link. It is **not** a
permanent answer: on a job where HSH is both GC and drywall, the building owner might
reasonably be entitled to the GC schedule too. That is a product decision, not this step's.
Put that in a comment on the function so the next person doesn't "fix" it by removing the
filter.

Return type does not change, so `CREATE OR REPLACE` is enough — no drop/recreate.

## Gap 2 — the foreman RPC relies on the column default

`foreman_create_schedule_item` (`20260804120000`) inserts without naming `division`:

```sql
INSERT INTO public.schedule_items (
  schedule_id, project_id, organization_id, type, name,
  start_date, end_date, duration, status,
  assigned_persons, show_job_info_person_ids, notes
)
```

The `DEFAULT 'drywall'` covers it, so every foreman-created item is drywall. Correct today —
foremen are drywall — and silently wrong the day one is not.

**Fix:** name `division` explicitly with value `'drywall'`, and comment that this RPC is the
drywall foreman path. Explicit beats inherited when the value carries meaning.

Check `foreman_apply_schedule_changes` and `foreman_delete_schedule_item` in the same pass —
they should not touch `division` at all. Report what you find.

## Gap 3 — production readiness counts GC items

`productionReadyService.ts:56` selects schedule items for a set of projects with no division
clause. It feeds drywall production readiness, so GC items on a shared job would count
toward it.

**Fix:** `.eq('division', 'drywall')`. Client-side, one line.

---

## Out of scope

- Seeding Goodwill Multi (step 3, next).
- SMS paths (`receive-sms`, `send-sms`, `send-push` all touch `schedule_items`) — step 6,
  where they get looked at properly with A2P live.
- Crew visibility by assignment — step 7.
- `SchedulePortfolioItemModal`'s direct `schedule_items` write — already flagged for the
  sweep; it survives only through `ResourceCompare`.

## Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean.
2. `npx vitest run` — 377 passing before; report after.
3. MCP: confirm the migration applied and `customer_share_schedule` shows the division
   filter in its definition.
4. MCP: `select division, count(*) from schedule_items group by 1` — unchanged
   (`drywall | 381`, `gc | 1`; Test2 was deleted, Test Item remains).

Operator-side (Mark):
5. Open a customer share link for a drywall job — schedule still shows, unchanged.
6. Open a share link for **Goodwill Multi** if one exists — the GC item (`Test Item`,
   2026-09-25) must **not** appear. This is the actual test of gap 1; if no link exists for
   that job, say so and we will make one rather than skip it.
7. `/crew` as a foreman: add a schedule item from the job picker. It saves, and MCP shows the
   new row with `division = 'drywall'`.
8. Drywall production-ready surface still lists the same jobs as before.

## Commit

Migration file applied with `supabase db push` — **not** MCP `apply_migration`, not the
Dashboard SQL editor.
Exclude: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
