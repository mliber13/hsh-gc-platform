# Measuring, ordering and paying a job in phases

_Designed with Mark, 2026-10-16. Status: **plan — nothing built.** Each step below ships on its
own and is checked on a real job (Lisbon Opportunity Homes) before the next starts._

## Why

A job is often measured, ordered and worked in rounds: a second phase released later (Lisbon's
quote already has "Main" and "Phase 2"), an addition, a building at a time. Today the Field page
is one measurement for the whole job: Phase 2 has to be added to an already-approved
measurement (recorded since `8232965` as "Changed after approval"), orders are suggested from
the whole job minus what is already ordered, and crew pay is one number for the job.

Mark's goals: a fresh sheet for each round, orders tied to the round they are for, crew paid by
the part of the job they did ("Finish – Garage" to one crew, "Finish – 1st & 2nd Floor" to
another), and the schedule naming the same parts — which also gives better data for analytics
and for setting labor rates.

## Decisions (Mark, 2026-10-16)

| Question | Answer |
|---|---|
| Clear the measurement after ordering? | No — **look** fresh, keep everything. Crew pay, job size, heights, the crew job page and estimating accuracy all read the measurement; an order PDF cannot rebuild areas, heights or finishes |
| Who adds a later phase? | **Both** — the crew measurer can come back, and the office can add one |
| Phase names | **Phase 1, Phase 2…**; quote locations (Garage, 1st Floor) are pulled **into** the phase they belong to |
| Labor rates | **Can differ by phase** |
| Pay | Can be **split by phase or location** — one crew does the garage, another the floors |
| Schedule | Ties back: the schedule item names the part ("Finish – Garage"), and the crew view shows that part |

## The shape

- **Phase** — a numbered round on the Field page. Every area and every material line belongs to
  one. A job no one phases is Phase 1, exactly as today.
- **Location** — the area name inside a phase (Garage, 1st Floor), from the quote or typed.
  Areas already carry this (`FieldMeasurementArea.area`, with its height and sqft).
- **The current phase** is open on the Field page; ordered phases fold to one line each
  ("Phase 1 · 928 sqft · ordered 9/18 · 2 orders ▸") and open read-only.
- **Job totals stay whole** — crew pay, job size, heights and accuracy sum every phase.

## Steps

Each step: existing jobs unchanged (proved by a test), additive data only, verified on Lisbon.

1. **Phases on the Field page.** `phase` on areas and material lines (absent = 1). "Start next
   phase"; earlier phases fold and go read-only. "Start from the quote's areas" offers the quote
   locations not yet measured, into the current phase. No change to orders, pay or approval.
2. **Orders per phase.** An order belongs to a phase; "Attach order" suggests only that phase's
   boards and materials, with mud/tape/screws sized from that phase's sqft. The phase shows on
   the order, the supplier PDF and the crew materials card.
3. **Approval per phase.** Each phase submitted and approved on its own; approving Phase 1
   leaves Phase 2 open for the crew measurer. Needs `save_field_takeoff_as_measurer` to lock per
   phase instead of per job (migration; its guard watched failing before it is trusted).
4. **Labor rates per phase.** Field step 3 per phase, defaulting to the job's rates.
   _Why here and not only at payroll time_ (Mark asked, 2026-10-16): payroll already defaults a
   job's piece rates to the rates approved in Field step 3 (`payrollMath.ts`, falling back to the
   quote), and the crew view's pay estimate reads them too. Set per phase once, both follow;
   payroll keeps its own override for true one-offs (a helper split, a bad day).
5. **Schedule ↔ phase and location.** A schedule item can name the phase and locations it
   covers ("Finish – Garage"); the crew view of that item shows those areas' sqft, heights and
   materials. Needs the crew projection to pass what it reads (allowlist + its test).
6. **Pay by phase / location.** The crew pay estimate for an assignment uses its areas' sqft and
   its phase's rates. **Money — shown before/after on real jobs before it goes live**, like the
   tall-wall pricing. Payroll piece pay follows only after Mark has watched the estimates.
7. **Analytics.** Labor and material per phase and location: how long a garage takes, what a
   tall great room really costs — the data steps 1–6 start collecting.

## Open — decide before the step that needs it

- Step 3: can a phase be approved before the earlier one is? (Probably yes — order of release
  is the GC's.)
- Step 5: an item covering locations from two phases ("Finish – Phase 2, garage + 1st floor")?
- Step 6: helpers and split pay within one location, as payroll does today.
- Change orders: when Phase 2 is a change order rather than in the original quote, does
  "Start from the quote's areas" read the change order's locations too?
