# Brief — Schedule Unification Steps 4+5: GC uses the drywall editor

Context: `docs/SCHEDULE_UNIFICATION_PLAN.md` (§3 decisions, §4 invariants). Steps 1 and 2
are done. **Steps 4 and 5 are merged into this one brief** — giving the old `ScheduleBuilder`
a per-item write path is throwaway work when this step deletes that component entirely.
The drywall editor already writes per item.

**Goal:** `/projects/:projectId/schedule` renders the same editor the drywall workspace uses,
against the same service functions, with a sub-company picker added for GC assignment.
`ScheduleBuilder.tsx` is deleted.

---

## 1. Locked decisions for this step

1. **One cascade semantic for both divisions: `'parallel-zero'`** (drywall's). There is zero
   existing GC schedule data to preserve, and the Buildertrend seed lands with no
   predecessors, so nothing migrates. `'sequential'` becomes dead once `ScheduleBuilder` is
   gone — **leave the option in `scheduleDateMath.ts` and flag it in the deletion sweep;
   do not delete it in this step.**
2. **Both assignee pickers on every item, the lens picks which leads.** The row already has
   `assigned_persons` and `assigned_company_id`. GC lens leads with the sub company, drywall
   lens leads with people; both controls are present in both lenses. No new tables —
   `fetchActiveSubcontractors` already exists (`scheduleService.ts:156`).
3. **SMS sub-confirmations are NOT part of this step.** A2P 10DLC is approved as of
   2026-09-15, so they are buildable, but they get their own step with their own test plan
   (real messages to real subs). Nothing is lost meanwhile: `smsService` and
   `CascadePreviewModal` are also used by `SchedulePortfolioItemModal`, so deleting
   `ScheduleBuilder` does not orphan them.

## 2. Component work

`DrywallScheduleEditor` currently reads `useOutletContext<DrywallProjectShellContext>()`,
which is why it only works inside the drywall project shell.

1. Extract it to `src/components/schedule/ScheduleEditor.tsx` taking explicit props:
   `{ projectId, projectName, projectAddress, division: 'gc' | 'drywall' }`.
2. Keep `DrywallScheduleEditor` as a thin wrapper that reads the outlet context and renders
   `<ScheduleEditor division="drywall" ... />`. **Drywall routes and behavior must not
   change.** This is the same wrapper pattern used for the field-takeoff inputs in D.6.8.
3. `routes/index.tsx:866` — replace `<ScheduleBuilder project onBack />` with
   `<ScheduleEditor division="gc" ... />`. Keep the route path.
4. `ScheduleItemDialog` — add the sub-company picker per decision 2. It currently hardcodes
   `assignedCompanyId: null` on new drafts (`:322`) and only passes the existing value
   through for cascade prediction (`:283`). Both need to become real, editable state.
5. Write permissions: the drywall editor gates on `canWriteDrywallProject(effectiveRole)`.
   GC needs its own gate — use the existing GC schedule permission rather than inventing one,
   and **report which helper you used** before wiring it.

## 3. Service work

Thread `division` through the write functions so a GC item is stamped `'gc'`:

- `createScheduleItemForDrywallProject` — take the division, pass to `buildInsertRow`
  (currently hardcodes `'drywall'`).
- `updateScheduleItemForDrywallProject`, `deleteScheduleItemForDrywallProject`,
  `generateStandardDrywallSchedule` — division-aware where they fetch or refresh.
- **Rename** the `*ForDrywallProject` functions to `*ForProject`. They serve both divisions
  now and the old names will mislead. Mechanical rename, ~12 call sites.
- `runCascadeForProject` stays unfiltered. **Invariant 1.** The comment at
  `scheduleService.ts:468` says why — keep it and do not "fix" the inconsistency.

## 4. Deletions

- `src/components/ScheduleBuilder.tsx` (1,370 lines) and its route import.
- Estimate-trade schedule generation goes with it (`generateScheduleFromTrades`,
  `handleRegenerateSchedule`, the trade load, the per-item "Linked trade" dropdown). This is
  what regenerates 8 phantom bars every time Garden of Eatin's GC schedule is opened.

**Do NOT delete** — verify each still has a live consumer before touching anything:

| Symbol | Kept because |
|---|---|
| `smsService`, `CascadePreviewModal` | still used by `SchedulePortfolioItemModal` |
| `fetchScheduleByProjectId` | used by `SchedulePortfolioItemModal:489` and the derived stats in `projectService.ts:253` |
| `upsertScheduleForProject` | becomes dead (only caller is `updateProject` at `supabaseService.ts:744` when `updates.schedule` is passed, which only `ScheduleBuilder` did). Leave it; flag for the deletion sweep. |
| `estimate_trade_id` column, `lagSemantic: 'sequential'` | dead after this, dropped later with evidence |

Run `npx tsc --noEmit` after the deletion — it will catch broken imports but **not** dead
exports, dead tables, or orphaned files. Grep for `ScheduleBuilder` separately.

## 5. Out of scope

- SMS sub-confirmations in the new editor (next step, now that A2P is approved).
- Crew visibility by assignment (Step 6).
- Cross-division context bars / predecessors (deferred, plan §3.5).
- Seeding Goodwill Multi from Buildertrend (after this step, so it's entered in the new editor).
- Any change to drywall behavior. If a drywall surface looks different afterwards, that's a bug.

## 6. Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean.
2. `npx vitest run` — 377 passing before this change; report the number after.
3. `grep -rn "ScheduleBuilder" src` returns nothing.
4. MCP: after operator test 8 below, `select division, count(*) from schedule_items group by 1`
   should show a `gc` row for the first time.

Operator-side (Mark). **URLs matter — last round's results came from testing the GC surface
expecting drywall behavior, so each test names its path:**

5. Drywall, unchanged: `/drywall/projects/<Goodwill Multi>/schedule` — 15 items, list and
   calendar, same as today.
6. Drywall cascade still works: edit a start date on an item that **has dependents**
   (Stock → Scaffold / Prep → Hang → Finish are chained; Measure Topout and Hang drywall have
   none, so they will correctly move nothing). Dependents shift, change log shows one group.
7. `/drywall/schedule` portfolio unchanged.
8. GC: `/projects/<a GC project>/schedule` — now shows the drywall-style editor, **empty**,
   with no phantom bars. Add an item, assign a sub company, save.
9. GC cascade: add a second item with the first as predecessor, move the first, confirm the
   second follows.
10. `/projects/<Garden of Eatin>/schedule` — empty. No 8 bars. This is the direct retest of
    the failure you hit today.
11. `/schedule` portfolio: the new GC item appears under the GC and All lenses, not drywall.

## 7. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Draft message comes from Claude after the verification report.
