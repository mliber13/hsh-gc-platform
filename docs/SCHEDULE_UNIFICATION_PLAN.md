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
| 5b | One portfolio surface; project list from item `division` | **done 2026-09-15** |
| 3a | Close division gaps (customer share, foreman create/write scope, production-ready) | **done 2026-09-15** |
| 3 | Seed Goodwill Multi GC work from Buildertrend | **done 2026-09-17** — 24 rows, `scripts/seed-goodwill-gc-schedule.mjs` |
| 6 | Sub SMS confirmations in the shared dialog | **DONE 2026-10-06** — proven end to end on a live reply |
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

### Step 6 as built (2026-10-05)

Only the **send** half was missing. `send-sms`, `receive-sms`, `smsService` and
`ConfirmationDot` were all already built and deployed; all 534 items read `unsent` purely
because nothing in the editor called the send path.

**Per item, one at a time** (Mark's choice over the batch shape `buildPublishPreview`
implies) — the first real sends go to real companies, so a per-item button with the message
shown verbatim beforehand is the safer way in. `buildPublishPreview` stays unused for now.

**A separate button from "Notify assigned crew", deliberately.** Mark: "there is an instance
that a sub and crew member are both assigned and maybe I don't want to notify the crew
member." Push-to-our-staff and SMS-to-an-outside-company are different acts; one adaptive
control would have made that choice for him.

Plumbing the dialog needed: `subcontractors.phone` on `ActiveSubcontractor`, and
`confirmation_status` / `confirmation_last_sent_at` on `DrywallProjectScheduleItem` — the
select already fetched the status but the type and mapper never carried it through, which is
part of why this looked less finished than it was.

**Compliance:** Twilio Advanced Opt-Out is on (Mark confirmed), so STOP is handled at the
messaging-service level and never reaches our webhook. Consequence worth knowing: a message to
an opted-out number fails at Twilio, so it surfaces as a generic "could not send" and the item
stays `unsent`. If one sub starts failing consistently, suspect opt-out first.

**Proven end to end 2026-10-06.** Mark texted himself via a `ZZ Test - Mark` subcontractor
record: outbound 17:15:50, inbound "Y" logged 17:38:57 parsed `confirm`, item `confirmed` with
`confirmation_last_responded_at` stamped. Signature verification, the last-ten-digits phone
match, the comms-log insert and the status write all work, and the function is reachable
without a JWT.

**The first attempt failed, and the cause is worth keeping.** The send button was gated on
`assignedCompanyId` — unsaved dialog state — so it appeared the moment a sub was picked and
sent before the row carried `assigned_company_id`. `receive-sms` finds the item BY that
column, so it logged "Sub has no schedule items" and dropped a genuine confirmation. Sent
17:15:50, replied 17:16:24, row not saved until 17:23:29. Fixed in `cf01e61`: the block now
renders from `editing.assigned_company_id` and builds its message from the saved name and
date, and unsaved edits disable the send.

**The failure was invisible in the app**, and that is now fixed. `receive-sms` returns 200 and
warns only in its own logs on every bail-out, so a sub's reply could vanish with the item left
on "Waiting on reply". Both paths that discard a real message — unknown sender, and a matched
sub with no schedule items — now email `UNMATCHED_SMS_ALERT_EMAIL` with the number, the text
and the reason (`71aeaed`, deployed 2026-10-07 with `--no-verify-jwt`, alert verified by live
test). Email rather than a row because `communication_log_entries.project_id` is NOT NULL and
an unmatched reply has no project.

**Deploying this function without `--no-verify-jwt` breaks inbound SMS.** There is no
`supabase/config.toml`, so the CLI default (`verify_jwt = true`) applies and Supabase rejects
Twilio's unauthenticated webhook with 401 before our code runs — silently. Verify after any
deploy: an unsigned POST to the function must return **403 Forbidden** (our signature check),
never 401.

**Still open at source:** `subcontractors` has ONE phone column, so a sub replying from a
second number is unmatched by construction. The `contacts` table already has
`subcontractor_id` if that becomes routine. Also note `receive-sms` matches on phone with no
`is_active` filter — deactivating a sub does not stop their texts matching.

If a confirmation ever seems to go missing, read the function logs first — they name the exact
bail-out.

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
