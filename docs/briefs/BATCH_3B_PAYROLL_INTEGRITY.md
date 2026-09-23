# Brief — Batch 3B: payroll writes that lose work

Closes **P0-DATA-2**, **P0-DATA-3**, **P1-HR-1**, **P1-HR-3**, **P1-HR-4**, and adds tests
**T9** and **T12**. Plan: `docs/V1_HARDENING_PLAN_2026-09.md` §1 and §2.

**Read this first.** In July a payroll run lost archived people's rows and it took days to
recover, because nobody could tell afterwards what had been in the run. Everything below is
a variation on the same theme: a payroll write that succeeds, reports success, and silently
drops something. Treat "the toast said saved" as worthless evidence throughout.

Ship in two parts with a stop between them — part 1 is the risky half and deserves its own
smoke before anything else lands on top of it.

---

# Part 1 — one guarded write path

## 1.1 What is wrong

`savePayPeriod` (`hrPayrollService.ts:209`) is a bare upsert with no version check and no
lock check, and RLS has none either (`20260528000001:321-334`). `locked` lives **inside the
JSONB payload**, not as a column, so nothing server-side can see it.

There are **five** writers, not the three the plan lists:

| | |
|---|---|
| `PayrollPage.tsx:479` | the run editor |
| `PayrollPage.tsx:565` | lock / unlock toggle |
| `drywallLaborAuditService.ts:590` | labor assignment audit |
| `drywallLaborEntryEditService.ts:148` | entry edit |
| `drywallLaborEntryEditService.ts:173` | entry edit |

Each writes a whole `PayPeriod` built from **its own cached copy**. The audit service works
from `periods[]` it loaded itself and never refreshes `PayrollPage.runs`. So: reassign a line
in the audit tab, then hit Save in the Run tab, and the reassignment is gone. Two successes,
no warning.

The lock is client-side only — `disabled={locked}` on the buttons — so any of the other four
paths can write straight through a locked run.

## 1.2 The RPC

`save_pay_period(p_id uuid, p_payload jsonb, p_expected_updated_at timestamptz)`,
SECURITY DEFINER, `SET search_path = public`. It must:

1. Resolve the caller's org and refuse a row outside it.
2. Refuse when the **stored** `payload->>'locked'` is true — unless this very call is the
   unlock, i.e. the incoming payload sets `locked` false. Read the stored value; never trust
   the incoming one for the check.
3. Refuse when `updated_at` differs from `p_expected_updated_at`.
4. Upsert, and **return the new `updated_at`** so callers can thread it.

For a brand-new period, `p_expected_updated_at` is null and the row must not already exist.

**The same traps as 3A apply here and are worth re-reading in
`docs/briefs/BATCH_3A_PART2_PAGE_HELD_TIMESTAMP.md`:** the expected timestamp must be the one
the *page loaded*, passed through as a raw string and never round-tripped through a JS
`Date`; and a guard nobody has watched fail is not a guard. See §1.5.

## 1.3 Route all five writers through it

Each caller passes the `updated_at` it loaded with the run it is editing, and updates what it
holds from the RPC's return value. **`LaborAssignmentAudit` and `LaborBreakdownModal` must
also refresh `PayrollPage.runs` after writing** — otherwise the next Run-tab save carries a
stale copy and conflicts immediately, which is a correct refusal but a miserable experience.

Block Save in the Run tab when the loaded run is known to be behind, rather than letting the
operator fill in a form that cannot be saved.

## 1.4 Banked hours move inside the RPC (P1-HR-1)

`applyBankedHoursDeltaToTeam` (`hrPayrollService.ts:159-207`) runs **after** the upsert, as a
separate statement, and rewrites the **entire** `org_team` payload — every employee and every
contractor — to change a few `bankedHours` values. Three consequences:

- If the upsert succeeds and this fails, the run and the balances disagree with nothing to
  say so.
- Anyone with the Team page open saves pre-payroll balances back over it.
- `Math.max(0, current + delta)` clamps at zero, so the delta is **not invertible** —
  deleting or reversing a run cannot restore what was there.

Move the delta into the RPC's transaction and apply it with `jsonb_set` on the individual
member, not a whole-payload rewrite. Keep the clamp's *behaviour* if you must, but record the
pre-clamp value so a reversal can be reasoned about; T12 pins the round trip.

## 1.5 Verification — STOP and report

Cursor-side:

1. `npx tsc --noEmit` clean; `npx vitest run` — **389 passing** before, report after.
2. **Prove each refusal fires, before trusting any of them.** Three separate checks: a stale
   `updated_at`, a locked run, and a cross-org id. Each must raise, not succeed. A guard that
   has not been observed failing does not count as tested.
3. Prove the unlock still works while the run is locked — this is the exception in §1.2(2)
   and the easiest thing to get backwards.
4. Confirm all five writers go through the RPC. `grep` for `from('pay_periods')` and show
   nothing writes it directly any more.
5. Migration applied with `supabase db push`.

Operator-side (Mark):

6. **The audit-then-run case.** Reassign a labor line in the audit tab. Without reloading, go
   to the Run tab and Save. You should be told the run changed, **and the reassignment must
   survive.** Today it is silently lost.
7. Lock a run, then try to save it from the entry-edit path. Refused. Unlock it. Works.
8. An ordinary payroll run saves, twice in a row, without reloading. This is the regression
   risk and the one that would hurt on a Monday.
9. Banked hours: run a payroll that consumes banked hours, check a person's balance, then
   have the Team page open during a save and confirm the balance is not reverted.

---

# Part 2 — three silent drops

## 2.1 P0-DATA-3 — import drops hours for anyone off the roster

`buildRunPayloadFromDraft` (`PayrollRunTab.tsx:419-433`) builds its rows from
`buildPayrollPeople(employees, contractors, …)`. A draft entry whose `personKey` has no
roster match produces no person, so `people.map` never emits it and the hours vanish from the
saved payload — with a success toast.

This is reachable now: a punch carries `person_id` from the crew profile's `linked_*`, and
deleting and re-adding a team member orphans that id (P1-HR-2, not in this batch). The July
incident was this shape.

**Write the red test first.** Then refuse the import: name the unmatched rows in a toast and
do not save a payload that silently excludes them. Also surface orphan ids on
`CrewAccountsPage` so there is somewhere to fix it.

## 2.2 P1-HR-3 — tool repayments never stop

`getToolDeductionThisWeek` (`payrollMath.ts:61-68`) stops deducting once
`amountPaid >= totalAmount`. **Nothing writes `amountPaid`** — it exists in `types/hr.ts:12`
and is read here, and that is all. So the weekly amount comes out of every run forever, and
a tool is paid off many times over.

Accumulate `amountPaid` when a run is saved (inside the part-1 RPC, same transaction as the
banked delta — it is the same class of derived balance), and stop at the total.

While here: `bankedHoursUsed` (`payrollMath.ts:375`) is not validated against the person's
balance, so a run can pay out hours nobody has. Reject it, or clamp it and say so in the UI —
your call, state which.

## 2.3 P1-HR-4 — a deploy eats an in-progress run

`PayrollPage` has no unsaved-work guard. The PWA auto-reloads on deploy (`main.tsx:17-23`),
so a run being edited on a Monday morning is lost if anything ships. `lib/unsavedWork.ts`
already exists and `CrewMeasurePage.tsx:282` shows the pattern — `setUnsavedWork('payroll',
isDirty)` plus a `beforeunload`.

## 2.4 Tests

- **T9** — `calculateHourlyPayWithOvertimeCap` (48h mixed types, override, cap) and
  `calculateGross` (salary + piece + helper deduction + banked + tool repayment + per diem;
  W2 and 1099). Note overtime deliberately stays straight-time per §8 Q5 — T9 pins the
  behaviour that exists, it does not assert the behaviour someone might expect.
- **T12** — `applyBankedDelta` round-trips to zero, and the clamp case is documented rather
  than asserted as correct.

## 2.5 Verification — STOP and report

Cursor-side: tsc, vitest, and the red test from §2.1 shown failing before the fix.

Operator-side (Mark):

- Import time-clock punches including one from an orphaned person id. The import is refused
  and names them, rather than saving without them.
- A tool repayment that has reached its total stops being deducted on the next run.
- Start editing a run, reload the page — you are warned rather than losing it.

## 3. Out of scope

- **P1-HR-2** (the re-link action). It is the *cause* of the orphan ids in §2.1, but it is a
  new operator surface rather than a data-safety fix, and it wants its own brief.
- 3C items: P0-DATA-5, P1-DATE-1/2/3, P1-MONEY-9.
- Overtime behaviour — settled as won't-fix, §8 Q5.

## 4. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Two commits, one per part. Messages drafted by Claude after each verification report.
