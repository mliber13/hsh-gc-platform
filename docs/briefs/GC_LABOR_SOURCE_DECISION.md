# GC job labor: where should it come from? (decision brief, 2026-10-13)

Read-only investigation. No app code or data was changed. Evidence comes from service-role
reads (`payroll-recovery-scratch/qbo-labor-overlap*.mjs`, untracked scratch, rerunnable from
the repo root).

## Recommendation

**Option (c): payroll becomes GC's labor source for everything payroll paid. The QBO labor
table is frozen as history. Nothing is deduped by amount.**

1. GC actuals read GC-division payroll lines **live from `pay_periods`**, through the same
   `laborLineDivision` that drywall cost uses. Do not copy them into `labor_entries`. A copy is
   a second ledger and gets the same staleness the QBO import has. Drywall cost already
   works this way. Drywall + GC then add up to the payroll line by construction, because every
   line resolves to exactly one division.
2. **Stop using the QBO labor import.** Leave the 134 existing rows as read-only history. Leave
   the edge function in place (this repo has been burned by deleting things that looked
   dead). Hide or retire the "Import labor" card so nobody re-imports weeks payroll now covers.
3. **Mark the two QBO rows that duplicate payroll on Goodwill Multi-1 as superseded**
   (`source_id` `65464:27` $2,300 and `65873:25` $1,825, total **$4,125**). Do not delete
   them. Back them up first. That is the only double-count that exists today.
4. Decide how burden is applied before building (see "Decisions for Mark").

Why not the other two:

- **(b) Keep QBO as GC's source.** It cannot see the labor. Goodwill's GC payroll is
  **$47,525** across 17 person-weeks; QBO holds **$4,455** on that job, and only
  $4,125 of that is the same wages. The Aug–Oct work (Rich, Yuri; $35.4k) is entirely absent.
  Drywall cost now excludes those lines, so about $43k of labor is on neither side. QBO is
  also a manual button that nobody has pressed since 7/29.
- **(a) as literally worded, "deduped by a key".** There is no shared key (see Finding 1).
  A QBO row is `JE-id:line` with no person and no pay period. Matching by amount and date
  catches 96 of 134 rows at best and can false-positive. Retiring the import is the
  only half of (a) worth taking, and it is part of (c).

## Finding 1: how the QBO import builds `labor_entries`

Importer: `supabase/functions/qb-import-labor/index.ts`, called only from
`src/services/laborImportService.ts:188,219` (the "Import labor" card in `QuickBooksImport.tsx`).

- **QuickBooks object: Journal Entries.** Not payroll reports, not checks, not time.
  It reads every `JournalEntry` in the date range and keeps lines whose account is in
  `qbo_wage_allocation_config`: `account_ids = ['203']` (burdened) and
  `account_ids_no_burden = ['198']` (1099 / no burden). Amount = absolute line amount.
- **Job matching.** Class/entity/header name on the JE line, resolved against `projects`
  by: `qb_project_id`, then exact name, then the text after the first colon, then a
  substring either way. No match means a `labor_import_errors` row and no labor entry.
- **Burden.** Account 203 lines get the active `labor_burden_rates` percent (30%) added on
  top, stored in `burden_amount`. 67 of 134 rows carry it. $33,176 of the $235,874 total is burden.
  The 198 rows carry none. Both Goodwill rows are 198, so $2,300 and $1,825 exactly.
- **No person, hours or period.** `worker_name`, `hours`, `employee_id` are null. The dedupe
  key is `(source_system, source_id)` = QBO's own JE line, so it protects against
  re-importing the same JE, not against payroll.
- **It is not the same population as HR payroll.** QBO lines are what the bookkeeper
  posted to the wage accounts. They sit on the same job/week as payroll when they match, but
  only a slice of payroll ever reaches them (below).

Inventory: 134 rows, **$202,697 gross / $235,874 with burden**, 40 projects, dated
2026-01-23 to 2026-07-24, only 17 distinct JE dates in 26 weeks (irregular, not weekly).
**116 rows ($174.9k) are on drywall-type projects, where drywall cost ignores
`labor_entries`. Only 18 rows ($27.8k) are on GC-type projects**, mostly the five
residential jobs: 135 Hillside $17.2k, 122/158 Sherman, 308 Pritchard, 115 Hillside.

## Finding 2: overlap with payroll

Method: payroll pay per (person, period, job) = hours × (`rateOverride` or the person's
hourly rate) × overtime multiplier, plus piece `netAmount ?? amount`. That is a simplified
recompute, not `payrollMath`: no weekly overtime cap, banked hours or job-rate lookup. So
the misses below are an upper bound; the hits are real, because equality to the cent is not
a coincidence. A QBO row "matches" when its gross is within $1 and its date is within
-7 to +45 days of the period start (hits land 4–11 days after the period start).

| QBO labor row (134, $202.7k gross) | Rows | Gross |
|---|---:|---:|
| Equals one person's pay on **the same job** | 84 | $99.5k |
| Equals the job's **whole-period** pay (several people) | 12 | $36.0k |
| Equals a payroll pay on **a different job** (QBO allocated the week elsewhere, or coincidence; 5 look like a one-job shift for Roberto Galvan, Jun 8–18) | 10 | $10.2k |
| Matches nothing | 28 | $56.9k |

Of the 28 matching nothing, 12 rows ($21.3k) are on jobs with **no payroll line at all**:
135 Hillside, the Sherman and Pritchard jobs, Jan–Apr. That is real GC labor that
HSH payroll never carried.

Reverse direction, so you can see how little of payroll reaches QBO:

| | Person-job groups | Dollars |
|---|---:|---:|
| All payroll since 2026-01-26 | 880 | $1,378,757 |
| Payroll through 7/24 | 620 | $1,064,879 |
| ...of which has a QBO row | 84 | $99,549 (**9%**) |
| Payroll after 7/24 (no QBO import exists) | 260 | $313,879 |

So: **where QBO has a labor row, it is usually the same wages as payroll** (~72% of rows,
on the same job). **QBO is a small, irregular subset of payroll.** Adding payroll to GC
actuals on top of it double-counts only where they overlap.

GC-division payroll lines today (all `division: 'gc'` tags, all Goodwill Multi-1):

| Person | Weeks | Pay | In QBO? |
|---|---|---:|---|
| Jose Dominquez | 2/9, 2/16, 2/23, 3/2, 3/16 | $12,100 | 2 weeks: 2/23 = $2,300, 3/16 = $1,825 (**$4,125 double-count**) |
| Richard Petrock | 8/3 – 10/5 (10 weeks) | $25,120 | no (all after the import stopped) |
| Yuri Garcia | 8/31, 9/7 | $10,305 | no |
| **Total** | 17 person-weeks | **$47,525** | $4,125 |

Goodwill's third QBO row (6/5, $330 + $99 burden) matches no payroll line. Unknown whether
it is GC or drywall; it is the one row the "superseded" step does not cover.

## Finding 3: why the QBO import stopped

It never ran on a schedule. The only trigger is a person pressing Import in the labor
dialog; no cron or scheduler references `qb-import-labor`. The last run was **2026-07-29
17:38 UTC** for 2026-05-28 to 2026-07-29 (97 rows). The newest JE it holds is dated 7/24. Nothing
has been pressed in the 76 days since.

It is **not broken**: Mark's QuickBooks connection is alive (token refreshed today), and the
separate drywall materials sync ran today. Whether JEs exist after 7/24 cannot be seen from
the database. Check QBO if it matters.

Side facts: `labor_import_errors` holds 8,871 rows. Early runs (Feb 19) pulled back to
2025-01-01 and wrote 0 rows against ~1,350 errors each, because the 2025 jobs are not
in the app. The 7/29 run's 69 errors are off-system customer:job names (PrideOne, Schumacher
Homes, Payne & Tompkins...) plus 25 lines with class "General" or "unknown".

## What each option risks

| | Double-count risk | Under-count risk | Cleanup |
|---|---|---|---|
| (a) payroll for GC + QBO retired or deduped | Dedupe by amount/date can both miss (10 cross-job rows) and wrongly drop. Retired import: none. | Loses $27.8k of residential GC history if "retired" means deleted | Freeze, don't delete |
| (b) QBO only | None | **High.** About $43k of GC payroll invisible on Goodwill, and growing every payroll | None, but the problem stays |
| **(c) payroll live + QBO frozen** | $4,125 today (two rows), fixed by flagging. Zero after, if the import stays off. | Residential GC labor not run through payroll has no feed (see below) | Flag 2 rows; decide burden |

## Decisions for Mark

1. **Burden.** QBO added 30% to account-203 (W2) wages. Payroll lines carry none. If GC
   actuals should be burdened the way they were, someone has to say whether to apply
   the active `labor_burden_rates` percent to W2 payroll lines (and not 1099). Drywall's
   treatment should match, whatever it is.
2. **Who pays residential GC labor from here on?** The 12 residential rows ($21k, Jan–Apr)
   have no payroll equivalent. If the GC carpenters are now on HSH payroll (Rich and Yuri
   since August), payroll covers it. If anyone is still paid outside it, they need a manual
   labor entry; QBO import is not a good feed (manual, irregular, 9% coverage).
3. **Confirm in QBO what the JEs are.** Open, for example, JE 65781 (2026-03-20) and 66873
   (2026-06-05). The data says they are payroll allocations by job, matching the payroll register. I
   could not see the QBO side. Confirming it makes the "retire the import" call safe.

## Build notes for whoever does (c)

- Reuse `laborLineDivision` and `buildLaborDivisionContext` (`src/lib/payrollLaborDivision.ts`).
  Don't re-derive the rule; a second copy is how the two sides drift.
- Test that for every project, drywall labor + GC labor = all payroll on that project, and
  that flipping one tag moves the dollars rather than adding them. Make it fail on purpose
  first (per CLAUDE.md).
- Net pay: use `netAmount ?? amount` for piece lines (see `piece_amount_is_not_net`).
