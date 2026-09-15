# Schedule Unification — GC + Drywall

**Written 2026-09-15.** Design locked with Mark in session. Supersedes the "two schedule
systems" framing in `GC_WORKSPACE_LESSONS.md` and extends `SCHEDULE_TARGET_MODEL.md` §10.

Driver: finish the Buildertrend exit. The drywall schedule works; the GC schedule does not.

---

## 1. What was already true before this plan

Both workspaces already read and write the **same relational tables** — `schedules` +
`schedule_items`, since `20260507000002`. There is no JSONB schedule blob on either side.
Also already shared:

- `cascadeSchedule()` in `src/lib/scheduleDateMath.ts` — GC and drywall differ only by the
  `lagSemantic` option (`'sequential'` vs `'parallel-zero'`), i.e. config, not a fork.
- The `schedule_item_changes` audit trigger is table-wide. GC edits are already logged;
  GC just has no UI to read the log.
- `AssignedPersonsPicker` + `TimeOffConflictWarning` in `src/components/schedule/`.
- `SchedulePortfolio` already accepts `typeFilter: 'all' | 'gc' | 'drywall'`.

**The fork is the editor and the write path, not the data model.** This matches the
correction already recorded in `V1_HARDENING_PLAN_2026-09.md` P2-CON-5.

## 2. Evidence that set the scope (queried live 2026-09-15)

| | count |
|---|---|
| Projects | 188 |
| With drywall work | 173 |
| With GC estimate trades | 18 |
| **True crossover (both)** | **3** |
| `schedule_items`, total | 387 |
| — drywall-shaped | 381 |
| — GC-shaped (all on "Garden of Eatin") | 6 |
| Items with `assigned_company_id` | **1** |
| Items with `confirmation_status` != `unsent` | **0** |

Three conclusions:

1. **There is no GC schedule to migrate.** Every in-progress GC job (115 Hillside,
   135 Hillside, 158 Sherman, 308 Pritchard) has zero schedule items. The GC schedule is
   unused, not broken-in-use. This is greenfield, not a migration.
2. **Crossover scheduling has never happened.** The two crossover jobs that have schedule
   items (27 West Main St, Goodwill Multi) contain only drywall steps.
3. **The sub-coordination layer has never run.** One company assignment across 387 rows;
   the confirm-by-SMS flow has sent zero messages. It is what GC will need after the
   Buildertrend exit — GC schedules *companies*, drywall schedules *people* — but it is an
   unproven feature to design and field-test, not a legacy to port faithfully.
   It is also blocked on A2P 10DLC approval independently.

Garden of Eatin's schedule is disposable (confirmed by Mark), which makes the `division`
backfill unconditional: every existing row is drywall.

## 3. Locked decisions

1. **One schedule system, two lenses.** One editor component, one portfolio surface, one
   write path. GC/drywall is a filter, not a fork.
2. **Navigation does not change.** `/drywall/schedule` and the drywall project Schedule tab
   both stay, rendering the shared component with the drywall lens pre-applied. Nothing
   moves out of the drywall workspace.
3. **Drop GC estimate-trade schedule generation entirely.** Today opening a GC project with
   no schedule auto-generates one item per estimate trade, 5 *calendar* days each, no
   predecessors, straight into unsaved state (`ScheduleBuilder.tsx:187`). GC starts blank
   and manual. `estimateTradeId` is read nowhere else in the app; leave the column in place
   and drop it in a later sweep with row-count evidence.
4. **`division` lives on the item, not the project.** Stamped at creation from the surface
   it was created in. Never derived from project classification — project-level drywall
   detection is a pile of metadata probes, and a derived rule returned 111 false crossovers
   against 3 real ones when tried in session.
5. **Defer the crossover context lens.** Read-only cross-division context bars and
   cross-division predecessors are not built now. Goodwill Multi will show whether they are
   wanted; decide from a month of real use.

## 4. Invariants — these must hold at every step

1. **The cascade is division-blind.** It runs over every item in the project, always. The
   lens filters what you see and can edit, never the dependency graph.
2. **Predecessor integrity is division-blind.** Delete-warnings scan all items, not the
   current lens. (Dangling predecessor refs have bitten this codebase before.)
3. **`division` is stamped at creation, never derived.** See decision 4.
4. **No filter combination may hide a row from everyone.** `/schedule` with the All lens
   shows every item unconditionally. This is the orphan-work guard.
5. **Crew visibility keys on assignment, not project type.** Today `crewWorkspaceService`
   drops non-drywall projects after fetching assignments (`:467`, `:577`) — on a crossover
   job that is silent invisibility on somebody's phone.
6. **Notification channel follows assignment, not division.** Persons → push.
   Company → SMS.
7. **One piece of work is one row.** The GC lens never creates its own "Drywall" summary bar
   on a job the drywall division is already scheduling. Two rows for the same work means two
   dates, and they will drift. A GC-side rollup is a *display* concern over the real rows.

## 5. Step order

| # | Step | Status |
|---|---|---|
| 1 | Cascade writes only changed rows; write errors surface (P0-DATA-4) | **done 2026-09-15** |
| 2 | `division` column + backfill + drywall reads filter on it; drop Garden of Eatin's 6 items | **done 2026-09-15** |
| 4+5 | GC uses the shared editor; estimate-trade generation deleted | **done 2026-09-15** |
| 3 | Seed Goodwill Multi GC work from Buildertrend | after 4+5, so it lands in the editor we keep |
| 6 | Sub SMS confirmations in the shared dialog | A2P approved 2026-09-15 |
| 7 | Crew visibility by assignment | |
| 8 | Decide the context-bar question from real Goodwill Multi use | |

**Reordered 2026-09-15.** The editor swap moved ahead of the Buildertrend seed, so the GC
schedule is entered into the editor we keep rather than the one being deleted. Steps 4 and 5
merged — per-item writes for `ScheduleBuilder` are throwaway when the same step deletes it.

Two decisions landed with the reorder: **one cascade semantic (`parallel-zero`) for both
divisions**, since there is no GC schedule data to migrate; and **both assignee pickers on
every item**, with the lens choosing which leads, because GC assigns sub companies and drywall
assigns people and the row already carries both fields.

A2P 10DLC was **approved 2026-09-15**, so sub SMS confirmations are no longer blocked. They
get their own step rather than riding along with the editor swap — they need a test plan
involving real messages to real subs, and nothing is lost meanwhile because `smsService` and
`CascadePreviewModal` stay live through `SchedulePortfolioItemModal`.

### Step 3 constraints (recorded now, they are easy to get wrong)

- **Seed after step 2, never before.** The drywall editor load path and
  `fetchCrossProjectScheduleItems` now filter `division = 'drywall'`. The cascade
  fetch stays unfiltered (invariant 1). Seeding GC items after this step keeps
  them off the drywall surfaces.
- **Seed with no predecessors.** `lagSemantic` is a per-call option applied to the whole
  project (`scheduleService.ts:450`), so BT's GC rows would be recomputed under drywall's
  parallel-zero rule. With no predecessors they sit at their seeded dates and cascade
  ignores them. Per-item semantics can wait until GC actually cascades in HSH.
- **Strip BT's own drywall bar on the way in.** The 15 drywall items are the truth for that
  work. Seeding BT's version alongside them is invariant 7 violated on day one.
- Pipeline already exists: `payroll-recovery-scratch/bt-migrate.mjs`, `bt-match.mjs`,
  `bt-job-map.json`, `bt-assignee-map.json`. Known gotchas: `schedules.user_id` is NOT NULL;
  GC subs will not match the drywall roster, so most rows arrive unassigned (correct for now).
