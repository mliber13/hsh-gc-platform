# Brief — Schedule Unification Step 2: `division` on `schedule_items`

Context doc: `docs/SCHEDULE_UNIFICATION_PLAN.md` (read §3 decisions and §4 invariants first).
Step 1 (cascade writes only changed rows) is already committed — do not redo it.

**Goal:** every schedule item carries an explicit division, the drywall surfaces show only
drywall items, and the one legacy GC schedule is removed. This must land *before* Goodwill
Multi is seeded from Buildertrend.

---

## 1. Pre-flight (MCP reads only — report the numbers before writing anything)

```sql
select count(*) from schedule_items;                                      -- expect 387
select count(*) from schedule_items where estimate_trade_id is not null;  -- expect 6
select count(*) from schedule_items where project_id = 'fa72c3da-73de-4174-b2ef-f09fa8de7657'; -- Garden of Eatin, expect 6
select count(*) from schedule_items where project_id = 'fc88c4e5-018b-4f89-a635-424184370d12'; -- Goodwill Multi, expect 15
```

If any count differs, **stop and report** — the plan's backfill assumption is that every
surviving row is drywall.

## 2. Migration

New file `supabase/migrations/<timestamp>_schedule_items_division.sql`. Applied with
`supabase db push`. **Not** MCP `apply_migration`, **not** the Dashboard SQL editor.

Contents:

1. Delete the 6 Garden of Eatin schedule items, then its now-empty `schedules` row
   (`9eb9f481-4971-4513-bbf9-932123b94dc3`). Scope the delete by
   `project_id = 'fa72c3da-73de-4174-b2ef-f09fa8de7657'` — an explicit id, not a name match.
   The audit trigger will log 6 `deleted` rows; that is expected and is the record.
2. `ALTER TABLE public.schedule_items ADD COLUMN IF NOT EXISTS division text NOT NULL
   DEFAULT 'drywall' CHECK (division IN ('gc','drywall'))`. The default backfills every
   surviving row correctly — no `UPDATE` needed, but assert it:
   `division = 'drywall'` on all rows afterwards.
3. Index: `(organization_id, division, start_date)` — the portfolio lens queries on it.
4. `COMMENT ON COLUMN` stating the invariant: stamped at creation from the surface that
   created the row, never derived from project classification.

## 3. Code — writes

| File | Change |
|---|---|
| `src/services/scheduleService.ts` `buildInsertRow` (~L470) | set `division: 'drywall'` |
| `src/services/scheduleService.ts` `generateStandardDrywallSchedule` (~L762) | rows inherit from `buildInsertRow`; verify, no separate change expected |
| `src/services/supabaseService.ts` `mapScheduleItemModelToRowInput` (~L208) | set `division: 'gc'` |

Foreman RPCs (`foreman_create_schedule_item`) insert server-side — the column default
covers them. Confirm no RPC enumerates columns in a way that breaks.

## 4. Code — reads

**This is the part to get right.** Display fetches filter by division; the cascade does not.

1. `fetchScheduleItemsForDrywallProject` (`scheduleService.ts:399`) — add an optional
   `opts?: { division?: 'gc' | 'drywall' }`. When passed, add `.eq('division', ...)`.
   Default (no opt) stays unfiltered.
2. `DrywallScheduleEditor` load path — call it with `{ division: 'drywall' }`.
3. `runCascadeForProject` (`scheduleService.ts:442`) — call it with **no division filter**.
   Invariant 1: the cascade sees every item in the project, always. If you filter here, a GC
   date move silently fails to push dependent drywall work. Add a one-line comment saying so
   at the call site, because the next person will want to "fix" the inconsistency.
4. `fetchCrossProjectScheduleItems` (`drywallScheduleAggregateService.ts:90`) — add
   `.eq('division', 'drywall')`.
5. `fetchPortfolioScheduleItems` (`scheduleService.ts:114`) — accept the existing
   `PortfolioTypeFilter`; `'gc'` and `'drywall'` add `.eq('division', ...)`, `'all'` adds
   nothing. `'all'` staying unfiltered is invariant 4 (the orphan-work guard) — do not
   "tidy" it into a default.

Leave `crewWorkspaceService` alone — crew visibility is Step 6.

## 5. Out of scope

- The GC per-item write path and removing estimate-trade generation (Step 4).
- Generalizing the editor component / the `/schedule` lens UI (Step 5).
- Crew visibility changes (Step 6).
- Cross-division context bars or predecessors (deferred; see plan §3.5).
- Dropping the `estimate_trade_id` column — leave it.
- Seeding Goodwill Multi (Step 3, after this).

## 6. Verification — STOP here and report

Cursor-side:
1. `npx tsc --noEmit` clean.
2. `npx vitest run` — 377 passing before this change; report the number after.
3. MCP: `select division, count(*) from schedule_items group by 1` → `drywall | 381`, no other rows.
4. MCP: `select count(*) from schedule_items where project_id = 'fa72c3da-73de-4174-b2ef-f09fa8de7657'` → 0.
5. MCP: confirm the `schedules` row for Garden of Eatin is gone.

Operator-side (Mark, in browser):
6. Drywall project → Schedule tab on **Goodwill Multi**: all 15 items still listed, list and
   calendar views both correct.
7. Edit one Goodwill Multi item's start date: cascade still moves its dependents, change log
   shows the edit plus the cascaded rows in one group.
8. `/drywall/schedule` portfolio: same projects and bars as before, nothing missing.
9. `/schedule` (GC portfolio): empty or unchanged — Garden of Eatin's 6 bars are gone.
10. Generate a standard schedule on a scratch drywall project; confirm the new rows come
    back as `division = 'drywall'`.

## 7. Commit

Files: the migration, `src/services/scheduleService.ts`,
`src/services/supabaseService.ts`, `src/services/drywallScheduleAggregateService.ts`,
`src/components/drywall/schedule/DrywallScheduleEditor.tsx`,
`docs/SCHEDULE_UNIFICATION_PLAN.md`.

**Exclude, as always:** `.claude/settings.local.json`, `supabase/.temp/cli-latest`.

```
feat(schedule): stamp each schedule item with its division

GC and drywall have always shared schedule_items; only the editor and the
write path were forked. Divisions were inferred from the project, which is a
metadata heuristic that mislabels 111 projects as crossover when 3 are.

Each item now carries the division of the surface that created it. Display
fetches filter on it; the cascade deliberately does not, so a date move still
pushes dependent work across the divide. Garden of Eatin's abandoned GC
schedule — the only non-drywall items in the table — is removed.

Prerequisite for seeding Goodwill Multi's GC work from Buildertrend.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
