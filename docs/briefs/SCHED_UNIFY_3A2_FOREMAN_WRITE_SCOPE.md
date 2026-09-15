# Brief — Step 3a (part 2): scope the foreman write RPCs to drywall

Addendum to `docs/briefs/SCHED_UNIFY_3A_DIVISION_GAPS.md`. Part 1 is applied but not yet
committed — **this lands in the same commit.** The seed stays blocked until both are in.

Your own Gap 2 report found this, and it is the right call: a drywall foreman can currently
**edit or delete a GC schedule row** on a shared job. Part 1 closed a cross-division *read*
on an unauthenticated link. This is the matching *write*, and it goes live with the
Buildertrend seed — the foreman surface will be sitting on a project that finally has GC
rows to damage.

---

## The two functions

**`foreman_apply_schedule_changes`** (latest: `20260904150000_foreman_apply_schedule_changes_name.sql`)
— the per-item `UPDATE` is scoped `WHERE si.id = v_id AND si.project_id = p_project_id AND
si.organization_id = v_org`. Add `AND si.division = 'drywall'`.

**`foreman_delete_schedule_item`** (`20260807150000`) — both the lookup that resolves
`v_project` and the `DELETE` are scoped by `id` + `organization_id`. Add
`AND si.division = 'drywall'` to **both**, so a GC item id raises the existing
`schedule item not found` rather than deleting.

**Leave the predecessor-strip `UPDATE` at the end of the delete unfiltered.** It removes
references to an id that no longer exists — integrity cleanup, not a write to GC work.
Filtering it would strand a dangling ref on a GC row if a cross-division predecessor ever
exists. Put that reasoning in a comment; it looks like an oversight otherwise.

## How

New migration file — **do not edit `20260915181136`**, it is already applied. Applied with
`supabase db push`, not MCP `apply_migration`, not the Dashboard.

Reproduce each function body from its **live definition** (read it via MCP), not from the
migration file, in case anything has drifted. Both are `CREATE OR REPLACE` with unchanged
signatures. Re-state the `REVOKE`/`GRANT` lines exactly as they currently stand.

Add a `COMMENT ON FUNCTION` to each saying these are drywall foreman paths and the division
filter is deliberate.

## Out of scope

- Any change to what the foreman UI shows — it already filters siblings to drywall
  (`CrewForemanScheduleEditSheet.tsx:129`). This is defence at the write, for the case where
  the UI is wrong or bypassed.
- `foreman_create_schedule_item` — done in part 1.
- Crew read scoping — step 7.

## Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean; `npx vitest run` — 377 before, report after.
2. MCP: both live definitions show the division filter.
3. MCP, the actual test — call `foreman_delete_schedule_item` against the **GC** row on
   Goodwill Multi (`Test Item`, 2026-09-25) **as a foreman**, and confirm it raises
   `schedule item not found` and the row survives. If you cannot assume a foreman identity
   from your session, say so plainly rather than reporting a pass you did not observe.
4. MCP: `select division, count(*) from schedule_items group by 1` → `drywall | 381`,
   `gc | 1`.

Operator-side (Mark):
5. `/crew` as a foreman on Goodwill Multi: the drywall items are still editable and
   deletable exactly as before. The GC item must not be reachable.

## Commit

One commit covering part 1 and part 2. Files: both migrations,
`src/services/productionReadyService.ts`, the three docs, and both briefs.
Exclude: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the report.
