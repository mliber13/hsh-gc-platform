# Brief — move labor rate adjustments off the Order page

Context: `docs/DRYWALL_PROJECT_IA.md`. The Order page accumulated three lifecycles;
this brief moves one of them. **The labor rate card PDF has already been deleted** (Mark:
"I don't need the pdf of it anymore since we are living more in the system now") — do not
reinstate it.

**Why it moves:** the rate adjustment already writes to the **field takeoff**
(`onSaveFieldTakeoff` → `reviewApprovedRates`), not to any order. Only the UI was on the
Order page. Setting the rates the work will pay at is part of reviewing what was measured.

---

## 1. What Mark described, because it shapes the component

The rate is not a one-time approval. It is a negotiated number that moves during the job:

> Estimated .28. At takeoff review the sqft came in under estimate, so there is budget room —
> raise it to .29. Then the finisher gets on site, calls, says it will take longer for a
> reason not visible from the office. Sometimes that is worth .30, if there is still room to
> make it work for the company and the finisher.

Three requirements fall out:

1. **It stays adjustable after approval.** The finisher's call comes later, sometimes during
   production. The control must not close when the takeoff is approved.
2. **Budget headroom has to be visible where the rate is changed.** Both of Mark's examples
   turn on it. A rate field with no headroom beside it is a guess.
3. **Each change needs its reason kept.** Today `reviewApprovedRates` holds one current value
   and one overwritten notes field, so .28 → .29 → .30 leaves only .30 and neither reason.
   Three months later nobody can say why that job paid .30.

## 2. Extract the card

Pull the **Labor rate adjustments** card out of `OrderFinancialCard.tsx` into
`src/components/drywall/labor/LaborRateAdjustmentsCard.tsx`.

Moving with it: `laborRates` state, `baselineRates`, `asStoredRateRecord`, `handleSaveRates`,
`handleApprove`, the pending/approved badge logic, and the rate inputs + notes field.

Props: `{ quote, fieldTakeoff, changeOrders, readOnly, onSaveFieldTakeoff }` — the same
inputs `OrderFinancialCard` takes today.

**Leave the "Quote vs field measurement" card where it is for now.** It is a separate
question (it duplicates the Quoted/Measured tiles the Field Measurement page already shows)
and Mark has not decided it. One thing at a time.

## 3. Mount it in two places

**Field Measurement — the primary home.** Beside `FieldTakeoffReviewBanner`, since reviewing
the takeoff and setting the rates are the same act. The page already holds `quote`, `takeoff`
and `saveFieldTakeoff`; it does **not** load change orders, so add `fetchChangeOrders` to its
load. Change orders feed `buildOrderFinancialComparison`, so headroom is wrong without them.

**Production — the second home.** Production is where the margin picture lives, so this is
where the finisher's-phone-call adjustment gets made.

`ProductionStagePage` already fetches the whole project, and `project.legacy` carries the
quote, the takeoff and the change orders — they are simply never extracted into state. Only
the catalogs are an extra fetch, needed to project a v3 quote to the v2 shape
`buildOrderFinancialComparison` expects. So the data cost here is one call, not four.

One component, two mounts — the pattern D.6.8 used for the field-takeoff inputs. Do not write
two versions.

**Remove it from the Order page.** `OrderFinancialCard` keeps only the quote-vs-field card.

## 4. The adjustment log

New, and the part with actual value. This codebase already logs decisions-with-reasons in
exactly this shape: `metadata.legacy.below_floor_approvals[]` records a margin-floor override
with the margin at the time. Follow it.

Append to the takeoff (or project legacy — your call, say which and why) on every rate change:

```
{ at, byUserId, byName, from: {hanger, finisher, prepClean}, to: {...},
  reason, marginAtChange, sqftVarianceAtChange }
```

- **The reason is required on a change**, not optional. A blank reason is the thing that
  makes the log worthless six months on.
- The existing single notes field stays as the current note; the log is additive.
- Show the last few entries in the card, most recent first.

## 5. Out of scope

- The "Quote vs field measurement" card (§2).
- Change orders. They are cross-cutting — quote owns the contract, Production reads accepted
  revenue, Order reads them financially — and they share one blob write with orders
  (`saveOrderStageSnapshot`). Moving them needs their own storage first; do not touch.
- Any change to how rates are *calculated*. This moves where they are edited and records why.

## 6. Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean; `npx vitest run` — 386 passing before, report after.
2. `grep -rn "LaborRateAdjustments\|Labor rate adjustments" src` — one component, two mounts.
3. Confirm no remaining reference to the labor rate card PDF anywhere in `src`.

Operator-side (Mark):
4. Field Measurement on a job with an approved takeoff: the rates card shows, reads the
   current rates, and **is still editable after approval**.
5. Change a rate with a reason; save. Reload — the new rate persists and the log shows the
   entry with who, when, from, to and the reason.
6. Production on the same job: the same card, the same values, editable, and a change made
   there appears in the same log.
7. Order page: rates card gone, quote-vs-field card still there, orders unaffected.
8. A job with **no** change orders still shows correct headroom (this is the regression risk
   in adding `fetchChangeOrders` to the field page).

## 7. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
