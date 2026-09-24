# Brief — Batch 3C: what "today" means, and how a job ends

Closes **P1-DATE-1/2/3**, **P1-MONEY-9**, **P0-DATA-5**; adds tests **T8** and **T10**.
Finishes Batch 3. Plan: `docs/V1_HARDENING_PLAN_2026-09.md`.

Three parts, shipped in order. **Part 3 changes something Mark does by hand every time he
closes a job** — hold it until he says the day is clear.

---

# Part 1 — time

## 1.1 "Today" is computed in UTC

Three live sites take `new Date().toISOString().slice(0, 10)`:

| | |
|---|---|
| `GenerateStandardScheduleDialog.tsx:31` | the default measure date on a new schedule |
| `productionReadyService.ts:42` | the production-ready cutoff |
| `scheduleService.ts:393` | a cascade start date |

After 8pm Eastern (7pm on standard time) these are **tomorrow**. So a schedule generated on
a Tuesday evening starts Wednesday, and a job crosses the production-ready line a day early.

The plan also lists eight `local-midnight → toISOString().slice` conversions in schedule
code. Those work **only** in negative UTC offsets — correct in Ohio, wrong anywhere else,
and wrong in any test runner that sets `TZ`. They are latent rather than live; fix them with
the same helper rather than leaving two conventions.

**One helper.** `src/lib/dateFormat.ts` already exists and is the right home — add
`todayKey()` and `toDateKey(date)` there, both resolving in the org's zone
(`America/New_York`), and route all eleven sites through them. `scheduleDateMath.ts:44,52`
too.

## 1.2 The time-clock range query has no zone

`hrTimeService.ts:176-177`:

```ts
.gte('clock_in', `${query.from}T00:00:00`)
.lte('clock_in', `${query.to}T23:59:59`)
```

Bare timestamps against a `timestamptz` column, interpreted in the session's zone — UTC. So
a punch after 8pm Eastern on Sunday lands in the **next** week's import window, and Monday's
payroll is short a shift while the following week has a stray one.

Either build explicit zoned bounds, or move the filter into an RPC comparing
`(clock_in AT TIME ZONE 'America/New_York')::date`. State which and why.

## 1.3 Nothing caps a punch

`crew_clock_in` (`20260716210000_crew_time_clock.sql`) checks auth, org and role. It does
**not** check for an already-open punch, and nothing anywhere caps duration. A forgotten
Friday clock-out runs until someone notices, and imports as a 60-hour entry.

That matters more than it did last week: Batch 3B taught the import to refuse people it does
not recognise, so it now has opinions about *who* and none about *how much*. A 60-hour row
sails straight through the new guard.

Three things, all small:

1. **Refuse a second open punch** for the same person — clock in while already clocked in
   should be an error, not a second row.
2. **Flag long punches at import.** Pick a threshold (16 hours is a defensible day), surface
   them for review rather than silently importing. Do **not** auto-truncate; a truncated
   punch is a silent edit to someone's pay.
3. **Require a current assignment.** Today a crew member can clock in to any project they
   were *ever* assigned to. Scope it to a live assignment, the way
   `crew_has_measure_assignment` does.

## 1.4 Tests

- **T8** — schedule cascade: only changed rows written, update errors surface, and a date-key
  round trip **under `TZ=Europe/Berlin` as well as `America/New_York`**. Berlin is the point:
  a positive offset is what breaks the local-midnight conversions, and a test that only runs
  in Ohio's zone passes while §1.1 is fully broken.
- **T10** — extract `groupPunchesForImport` and test it: quarter-hour rounding, open punch
  excluded, long punch flagged, and the evening boundary from §1.2.

---

# Part 2 — the pay basis (P1-MONEY-9)

Crew and payroll compute piece-pay sqft differently, and **the crew's number is the one the
worker believes**, because it is on his phone.

| | |
|---|---|
| Crew (`crewWorkspaceService.ts:970-995`) | field-measured, else quoted-with-waste, else PO — **plus accepted change-order sqft** |
| Payroll (`payrollMath.ts:802`) | field-measured **only**. No change orders, no fallback. |

One live job diverges today: **East Palestine - Davis**, measured 4,954 + 540 change-order
sqft. The crew app shows 5,494; payroll pays on 4,954. It is production-complete, so check
whether that gap was already paid before changing anything.

Extract a shared `crewPayBasis.ts` resolver and have both sides call it. **The crew side is
the correct one** — accepted change-order work is work that was done — so payroll moves to
match, not the reverse. Say so in the commit, because it changes what a run computes.

The fallback chain needs a decision too: payroll currently returns null with no field
measurement, crew falls back to the quote. No in-flight job is in that state right now, so
pick the behaviour deliberately rather than discovering it later.

---

# Part 3 — how a job ends (P0-DATA-5) — HOLD FOR MARK

Settled as §8 Q4: **"Mark project complete" on the Order tab becomes "Start production."**

Two `@deprecated` functions are still live in `drywallProjectsService.ts`:

- `markDrywallProjectComplete` (`:1497`) jumps `order → closed` with no guard and no
  `productionCompletedAt`, so the job vanishes from Financials, Labor and Estimating.
- `revertDrywallProjectComplete` (`:1515`) goes `closed → order` leaving the timestamps.

The list pill also allows any → any.

Delete both, point the Order tab button at "Start production", and constrain the pill to the
guarded one-step transitions.

**Before touching this**, report how many live projects are in `closed` with no
`productionCompletedAt` — those are jobs the old shortcut already dropped out of the
analytics, and Mark needs to know whether there is a backfill to do. Do not backfill without
asking.

---

## Verification — STOP and report after each part

Cursor-side, every part: `npx tsc --noEmit` clean; `npx vitest run` — **398 passing** before.

Part 1: run the whole suite under `TZ=Europe/Berlin` as well, and report both. Show the
eleven sites routed through the helper. Prove a second open punch is refused, and that a
long punch is flagged rather than dropped or truncated.

Part 2: show both call sites using the shared resolver, and state what East Palestine -
Davis computes before and after.

Part 3: the count of `closed` projects missing `productionCompletedAt`, before any change.

Operator-side (Mark):

- Generate a schedule after 8pm — the default measure date is today, not tomorrow.
- A punch that runs past midnight imports into the right week.
- Clock in twice — refused the second time.
- Part 3: close a job the new way; it passes through production and stays in Financials.

## Out of scope

- P1-HR-2, the re-link action — still wants its own brief.
- Batch 2B, 4, 5, 6.
- Changing overtime (§8 Q5, won't-fix).

## Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
One commit per part. Messages drafted by Claude after each verification report.
